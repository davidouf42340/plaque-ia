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

function buildPrompt({ engravingColor, leftIcon, rightIcon }) {
  const color = engravingColor === "white" ? "white" : "black";

  return `
Create a clean engraving overlay for a professional nameplate.

STRICT RULES:
- transparent background ONLY
- no plate
- no rectangle
- no border
- no frame
- no text
- no letters
- no words
- no typography
- no background pattern
- no decoration in center

LAYOUT:
- horizontal layout (4:1 ratio)
- left icon must be fully on the LEFT side
- right icon must be fully on the RIGHT side
- center must remain COMPLETELY EMPTY
- nothing allowed in the center area
- do not center anything

LEFT ICON:
${leftIcon || "none"}

RIGHT ICON:
${rightIcon || "none"}

STYLE:
- minimal
- engraving style
- thin lines
- clean vector
- professional
- balanced composition

COLOR:
- use ONLY ${color}
- everything else must be transparent

IMPORTANT:
- icons must be small
- do not place anything in the center
- keep wide empty space in the middle

OUTPUT:
- transparent PNG
- left and/or right icons only
`.trim();
}

async function generateOverlayImage({ prompt, outputPath, width, height }) {
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

  await sharp(buffer)
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
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

    const prompt = buildPrompt({
      engravingColor,
      leftIcon,
      rightIcon
    });

    const fileName = `${Date.now()}.png`;
    const outputPath = path.join(GENERATED_DIR, fileName);

    await generateOverlayImage({
      prompt,
      outputPath,
      width: 1200,
      height: 300
    });

    return res.json({
      plateColor,
      engravingColor,
      preview: {
        url: `/generated/${fileName}`,
        width: 1200,
        height: 300
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
