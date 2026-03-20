import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());
app.use(express.json({ limit: "20mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";
const PREVIEW_DIR = path.join(GENERATED_DIR, "previews");
const PRODUCTION_DIR = path.join(GENERATED_DIR, "production");
const CREATIONS_FILE = "creations.json";

for (const dir of [GENERATED_DIR, PREVIEW_DIR, PRODUCTION_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(CREATIONS_FILE)) {
  fs.writeFileSync(CREATIONS_FILE, "[]", "utf8");
}

app.use("/generated", express.static(GENERATED_DIR));

const PRODUCTION_WIDTH = 1600;
const PRODUCTION_HEIGHT = 400;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 300;

const VALID_STYLES = [
  "premium",
  "moderne",
  "minimaliste",
  "fun",
  "professionnel",
  "elegant"
];

function sanitizeFilename(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function saveCreation(entry) {
  const raw = fs.readFileSync(CREATIONS_FILE, "utf8");
  const creations = JSON.parse(raw);
  creations.unshift(entry);
  fs.writeFileSync(CREATIONS_FILE, JSON.stringify(creations, null, 2), "utf8");
}

function normalizePlateColor(value = "") {
  const color = String(value).trim().toLowerCase();

  if (color.includes("acier")) return "acier brossé";
  if (color.includes("cuivre")) return "cuivre";
  if (color.includes("or")) return "or brossé";
  if (color.includes("blanc")) return "blanc";
  if (color.includes("rose")) return "rose";
  if (color.includes("noyer")) return "noyer";
  if (color.includes("gris")) return "gris";
  if (color.includes("noir brillant")) return "noir brillant";
  if (color.includes("noir")) return "noir";

  return color || "blanc";
}

function resolveEngravingColor(plateColor, engravingColor) {
  const normalizedPlateColor = normalizePlateColor(plateColor);
  const requested = String(engravingColor || "").trim().toLowerCase();

  if (requested === "black" || requested === "white") {
    return requested;
  }

  const blackEngraving = [
    "acier brossé",
    "cuivre",
    "or brossé",
    "blanc"
  ];

  const whiteEngraving = [
    "rose",
    "noyer",
    "gris",
    "noir",
    "noir brillant"
  ];

  if (blackEngraving.includes(normalizedPlateColor)) return "black";
  if (whiteEngraving.includes(normalizedPlateColor)) return "white";

  return "black";
}

function buildPrompt({
  plateColor,
  engravingColor,
  leftIcon,
  rightIcon,
  backgroundDecor,
  style
}) {
  const overlayColorText =
    engravingColor === "white" ? "white" : "black";

  return `
Create a clean decorative overlay for an engraved nameplate.

STRICT RULES (must be followed exactly):

GLOBAL:
- transparent background ONLY
- no plate
- no rectangle
- no border
- no frame
- no shadow
- no texture
- no text
- no letters
- no words
- no typography
- no central object
- no scene

LAYOUT:
- horizontal 4:1 ratio
- divide composition into 3 zones:
  LEFT = 0% to 30%
  CENTER = 30% to 70%
  RIGHT = 70% to 100%

ZONE RULES:
- LEFT zone = only left icon
- RIGHT zone = only right icon
- CENTER zone = completely empty
- absolutely nothing important in the center
- no icon may cross into the center zone

LEFT ICON:
${leftIcon?.trim() ? leftIcon.trim() : "none"}

RIGHT ICON:
${rightIcon?.trim() ? rightIcon.trim() : "none"}

BACKGROUND DECOR:
- optional and very light
- simple
- discreet
- never dense
- never in center zone
${backgroundDecor?.trim() ? backgroundDecor.trim() : "none"}

STYLE:
- ${style}
- minimal
- premium
- engraving-ready
- clean vector-like look
- thin to medium clean lines

COLOR:
- use ONLY ${overlayColorText}
- all graphics in ${overlayColorText}
- everything else must stay transparent

FINAL RESULT:
- transparent PNG overlay
- left icon clearly on the left
- right icon clearly on the right
- center completely empty for customer text
- no frame, no border, no central drawing
`.trim();
}

async function generateOverlayImage({
  prompt,
  outputPath,
  width,
  height
}) {
  const result = await openai.images.generate({
    model: "gpt-image-1",
    size: "1536x1024",
    prompt
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Aucune image retournée par l'API.");
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
      engravingColor,
      leftIcon = "",
      rightIcon = "",
      backgroundDecor = "",
      style = "premium"
    } = req.body;

    if (!plateColor) {
      return res.status(400).json({
        error: "plateColor est obligatoire."
      });
    }

    if (!VALID_STYLES.includes(style)) {
      return res.status(400).json({
        error: "Style invalide."
      });
    }

    const normalizedPlateColor = normalizePlateColor(plateColor);
    const finalEngravingColor = resolveEngravingColor(
      normalizedPlateColor,
      engravingColor
    );

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = sanitizeFilename(
      `${normalizedPlateColor}-${finalEngravingColor}-${style}-${uid}`
    );

    const productionPath = path.join(PRODUCTION_DIR, `${slug}.png`);
    const previewPath = path.join(PREVIEW_DIR, `${slug}.png`);

    const prompt = buildPrompt({
      plateColor: normalizedPlateColor,
      engravingColor: finalEngravingColor,
      leftIcon,
      rightIcon,
      backgroundDecor,
      style
    });

    await generateOverlayImage({
      prompt,
      outputPath: productionPath,
      width: PRODUCTION_WIDTH,
      height: PRODUCTION_HEIGHT
    });

    await sharp(productionPath)
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(previewPath);

    const payload = {
      id: uid,
      plateColor: normalizedPlateColor,
      engravingColor: finalEngravingColor,
      leftIcon,
      rightIcon,
      backgroundDecor,
      style,
      preview: {
        url: `/generated/previews/${slug}.png`,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT
      },
      production: {
        url: `/generated/production/${slug}.png`,
        width: PRODUCTION_WIDTH,
        height: PRODUCTION_HEIGHT
      },
      createdAt: new Date().toISOString()
    };

    saveCreation(payload);

    return res.json(payload);
  } catch (error) {
    console.error("Erreur generate-plaque-base :", error);
    return res.status(500).json({
      error: "Erreur lors de la génération de l'overlay.",
      details: error.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
