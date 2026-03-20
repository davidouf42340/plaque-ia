import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";

if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

app.use("/generated", express.static(GENERATED_DIR));

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 300;
const QUARTER_WIDTH = Math.round(CANVAS_WIDTH * 0.25);
const MARGIN_X = 24;
const MARGIN_Y = 28;
const ICON_MAX_WIDTH = QUARTER_WIDTH - (MARGIN_X * 2);
const ICON_MAX_HEIGHT = CANVAS_HEIGHT - (MARGIN_Y * 2);

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

async function generateSingleLogoBuffer({ engravingColor, iconName }) {
  const prompt = buildSingleLogoPrompt({ engravingColor, iconName });

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

  return sharp(buffer)
    .resize(ICON_MAX_WIDTH, ICON_MAX_HEIGHT, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toBuffer();
}

async function createTransparentCanvas() {
  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
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

    const composites = [];

    if (leftIcon && leftIcon.trim()) {
      const leftBuffer = await generateSingleLogoBuffer({
        engravingColor,
        iconName: leftIcon.trim()
      });

      const meta = await sharp(leftBuffer).metadata();
      const leftX = Math.round((QUARTER_WIDTH - (meta.width || 0)) / 2);
      const leftY = Math.round((CANVAS_HEIGHT - (meta.height || 0)) / 2);

      composites.push({
        input: leftBuffer,
        left: Math.max(leftX, MARGIN_X),
        top: Math.max(leftY, MARGIN_Y)
      });
    }

    if (rightIcon && rightIcon.trim()) {
      const rightBuffer = await generateSingleLogoBuffer({
        engravingColor,
        iconName: rightIcon.trim()
      });

      const meta = await sharp(rightBuffer).metadata();
      const baseX = CANVAS_WIDTH - QUARTER_WIDTH;
      const rightX = baseX + Math.round((QUARTER_WIDTH - (meta.width || 0)) / 2);
      const rightY = Math.round((CANVAS_HEIGHT - (meta.height || 0)) / 2);

      composites.push({
        input: rightBuffer,
        left: Math.min(rightX, CANVAS_WIDTH - (meta.width || 0) - MARGIN_X),
        top: Math.max(rightY, MARGIN_Y)
      });
    }

    const canvasBuffer = await createTransparentCanvas();

    const fileName = `${Date.now()}.png`;
    const outputPath = path.join(GENERATED_DIR, fileName);

    await sharp(canvasBuffer)
      .composite(composites)
      .png()
      .toFile(outputPath);

    return res.json({
      plateColor,
      engravingColor,
      style,
      preview: {
        url: `/generated/${fileName}`,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
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

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
