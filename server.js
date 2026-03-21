import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";

if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

app.use("/generated", express.static(GENERATED_DIR));

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 300;

const PRODUCTION_WIDTH = 1600;
const PRODUCTION_HEIGHT = 400;

const PREVIEW_QUARTER = Math.round(PREVIEW_WIDTH * 0.25);
const PRODUCTION_QUARTER = Math.round(PRODUCTION_WIDTH * 0.25);

const PREVIEW_MARGIN_X = 24;
const PREVIEW_MARGIN_Y = 28;

const PRODUCTION_MARGIN_X = 32;
const PRODUCTION_MARGIN_Y = 36;

const PREVIEW_ICON_MAX_WIDTH = PREVIEW_QUARTER - PREVIEW_MARGIN_X * 2;
const PREVIEW_ICON_MAX_HEIGHT = PREVIEW_HEIGHT - PREVIEW_MARGIN_Y * 2;

const PRODUCTION_ICON_MAX_WIDTH = PRODUCTION_QUARTER - PRODUCTION_MARGIN_X * 2;
const PRODUCTION_ICON_MAX_HEIGHT = PRODUCTION_HEIGHT - PRODUCTION_MARGIN_Y * 2;

function buildSingleLogoPrompt({ engravingColor, iconName }) {
  const color = engravingColor === "white" ? "white" : "black";

  return `
Create a single isolated logo for an engraved nameplate.

STRICT RULES:
- transparent background only
- one single icon only
- no text
- no letters
- no words
- no border
- no frame
- no plate
- no rectangle
- no background
- no scene
- centered icon
- simple engraving style
- vector-like lines
- clean professional look

ICON:
${iconName}

COLOR:
- use only ${color}
- everything else transparent

OUTPUT:
- one isolated transparent PNG icon
`.trim();
}

async function generateSingleLogoBuffer({
  engravingColor,
  iconName,
  maxWidth,
  maxHeight
}) {
  if (!iconName || !iconName.trim()) {
    return null;
  }

  const prompt = buildSingleLogoPrompt({
    engravingColor,
    iconName: iconName.trim()
  });

  const result = await openai.images.generate({
    model: "gpt-image-1",
    size: "1024x1024",
    prompt
  });

  const b64 = result?.data?.[0]?.b64_json;

  if (!b64) {
    console.error("Réponse OpenAI inattendue :", JSON.stringify(result, null, 2));
    throw new Error("Image vide retournée par OpenAI.");
  }

  const buffer = Buffer.from(b64, "base64");

  return await sharp(buffer)
    .resize(maxWidth, maxHeight, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toBuffer();
}

async function createTransparentCanvas(width, height) {
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toBuffer();
}

async function composePlaque({
  width,
  height,
  quarterWidth,
  marginX,
  marginY,
  iconMaxWidth,
  iconMaxHeight,
  engravingColor,
  leftIcon,
  rightIcon
}) {
  const composites = [];

  if (leftIcon && leftIcon.trim()) {
    const leftBuffer = await generateSingleLogoBuffer({
      engravingColor,
      iconName: leftIcon.trim(),
      maxWidth: iconMaxWidth,
      maxHeight: iconMaxHeight
    });

    if (leftBuffer) {
      const leftMeta = await sharp(leftBuffer).metadata();
      const leftWidth = leftMeta.width || 0;
      const leftHeight = leftMeta.height || 0;

      const leftX = Math.round((quarterWidth - leftWidth) / 2);
      const leftY = Math.round((height - leftHeight) / 2);

      composites.push({
        input: leftBuffer,
        left: Math.max(leftX, marginX),
        top: Math.max(leftY, marginY)
      });
    }
  }

  if (rightIcon && rightIcon.trim()) {
    const rightBuffer = await generateSingleLogoBuffer({
      engravingColor,
      iconName: rightIcon.trim(),
      maxWidth: iconMaxWidth,
      maxHeight: iconMaxHeight
    });

    if (rightBuffer) {
      const rightMeta = await sharp(rightBuffer).metadata();
      const rightWidth = rightMeta.width || 0;
      const rightHeight = rightMeta.height || 0;

      const zoneStart = width - quarterWidth;
      const rightX = zoneStart + Math.round((quarterWidth - rightWidth) / 2);
      const rightY = Math.round((height - rightHeight) / 2);

      composites.push({
        input: rightBuffer,
        left: Math.min(rightX, width - rightWidth - marginX),
        top: Math.max(rightY, marginY)
      });
    }
  }

  const canvasBuffer = await createTransparentCanvas(width, height);

  return await sharp(canvasBuffer)
    .composite(composites)
    .png()
    .toBuffer();
}

app.post("/generate-plaque-base", async (req, res) => {
  try {
    const {
      plateColor,
      engravingColor = "black",
      leftIcon = "",
      rightIcon = "",
      style = "premium"
    } = req.body;

    if (!plateColor) {
      return res.status(400).json({
        error: "plateColor est obligatoire."
      });
    }

    const buffer = await composePlaque({
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      quarterWidth: PREVIEW_QUARTER,
      marginX: PREVIEW_MARGIN_X,
      marginY: PREVIEW_MARGIN_Y,
      iconMaxWidth: PREVIEW_ICON_MAX_WIDTH,
      iconMaxHeight: PREVIEW_ICON_MAX_HEIGHT,
      engravingColor,
      leftIcon,
      rightIcon
    });

    const fileName = `${Date.now()}-preview-overlay.png`;
    const outputPath = path.join(GENERATED_DIR, fileName);

    await fs.promises.writeFile(outputPath, buffer);

    return res.json({
      plateColor,
      engravingColor,
      style,
      preview: {
        url: `/generated/${fileName}`,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT
      },
      url: `/generated/${fileName}`
    });
  } catch (error) {
    console.error("Erreur generate-plaque-base :", error);
    return res.status(500).json({
      error: "Erreur lors de la génération de l'overlay.",
      details: error.message || "Erreur inconnue"
    });
  }
});

app.post("/generate-production", async (req, res) => {
  try {
    const {
      leftIcon = "",
      rightIcon = "",
      engravingColor = "black"
    } = req.body;

    const buffer = await composePlaque({
      width: PRODUCTION_WIDTH,
      height: PRODUCTION_HEIGHT,
      quarterWidth: PRODUCTION_QUARTER,
      marginX: PRODUCTION_MARGIN_X,
      marginY: PRODUCTION_MARGIN_Y,
      iconMaxWidth: PRODUCTION_ICON_MAX_WIDTH,
      iconMaxHeight: PRODUCTION_ICON_MAX_HEIGHT,
      engravingColor,
      leftIcon,
      rightIcon
    });

    const fileName = `${Date.now()}-production.png`;
    const outputPath = path.join(GENERATED_DIR, fileName);

    await fs.promises.writeFile(outputPath, buffer);

    return res.json({
      url: `/generated/${fileName}`,
      width: PRODUCTION_WIDTH,
      height: PRODUCTION_HEIGHT
    });
  } catch (error) {
    console.error("Erreur generate-production :", error);
    return res.status(500).json({
      error: "Erreur lors de la génération du fichier production.",
      details: error.message || "Erreur inconnue"
    });
  }
});

app.post("/upload-preview", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || !image.startsWith("data:image/png;base64,")) {
      return res.status(400).json({
        error: "Image preview invalide."
      });
    }

    const buffer = Buffer.from(image.split(",")[1], "base64");
    const fileName = `${Date.now()}-preview-client.png`;
    const outputPath = path.join(GENERATED_DIR, fileName);

    await fs.promises.writeFile(outputPath, buffer);

    return res.json({
      url: `/generated/${fileName}`
    });
  } catch (error) {
    console.error("Erreur upload-preview :", error);
    return res.status(500).json({
      error: "Erreur upload preview.",
      details: error.message || "Erreur inconnue"
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server OK on port ${PORT}`);
});
