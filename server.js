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
const PICTO_DIR = path.join(GENERATED_DIR, "pictos");
const CREATIONS_FILE = "creations.json";

for (const dir of [GENERATED_DIR, PREVIEW_DIR, PRODUCTION_DIR, PICTO_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(CREATIONS_FILE)) fs.writeFileSync(CREATIONS_FILE, "[]", "utf8");

app.use("/generated", express.static(GENERATED_DIR));

const MM_TO_PX_300DPI = 11.811;

const VALID_MATERIALS = [
  "noir",
  "blanc",
  "argent",
  "or",
  "or-rose",
  "acrylique-noir",
  "acrylique-blanc"
];

const VALID_STYLES = [
  "premium",
  "moderne",
  "minimaliste",
  "fun",
  "professionnel",
  "elegant"
];

function mmToPx(mm) {
  return Math.round(mm * MM_TO_PX_300DPI);
}

function getPlateSize(widthMm, heightMm) {
  const prodWidth = mmToPx(widthMm);
  const prodHeight = mmToPx(heightMm);

  // Preview allégée mais fidèle aux proportions
  const previewMaxWidth = 1400;
  const ratio = previewMaxWidth / prodWidth;
  const previewWidth = prodWidth > previewMaxWidth ? previewMaxWidth : prodWidth;
  const previewHeight = prodWidth > previewMaxWidth
    ? Math.round(prodHeight * ratio)
    : prodHeight;

  return {
    production: {
      width: prodWidth,
      height: prodHeight
    },
    preview: {
      width: previewWidth,
      height: previewHeight
    }
  };
}

function sanitizeFilename(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function saveCreation(entry) {
  const raw = fs.readFileSync(CREATIONS_FILE, "utf8");
  const creations = JSON.parse(raw);
  creations.unshift(entry);
  fs.writeFileSync(CREATIONS_FILE, JSON.stringify(creations, null, 2), "utf8");
}

function buildPrompt({ material, style, pictos, clientPrompt, widthMm, heightMm }) {
  return `
Créer uniquement le visuel de fond d'une plaque gravée personnalisable.
IMPORTANT :
- Aucun texte
- Aucune lettre
- Aucun chiffre
- Aucun mot
- Aucun nom
- Aucun logo typographique
- Pas de mise en page texte
- Seulement la base graphique de la plaque

Contraintes visuelles :
- plaque horizontale
- proportions exactes : ${widthMm} mm x ${heightMm} mm
- matière/couleur dominante : ${material}
- style : ${style}
- rendu propre, net, professionnel
- adapté à une future superposition de texte par-dessus
- laisser des zones respirantes pour que du texte puisse être ajouté ensuite
- intégrer si pertinent des pictogrammes décoratifs en lien avec : ${pictos || "aucun"}
- style client : ${clientPrompt || "sobre et premium"}

Spécificités :
- visuel léger et exploitable en configurateur
- fond propre
- contraste suffisant
- composition centrée
- pas d'effet trop chargé
- look réaliste de plaque gravée / découpée
- destiné à une boutique de plaques personnalisées
`;
}

async function generateBaseVisual(prompt, outputPngPath, width, height) {
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

  // On adapte ensuite exactement à la taille finale
  await sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: "centre"
    })
    .png()
    .toFile(outputPngPath);
}

app.post("/generate-plaque-base", async (req, res) => {
  try {
    const {
      widthMm,
      heightMm,
      material,
      style,
      pictos,
      clientPrompt
    } = req.body;

    if (!widthMm || !heightMm) {
      return res.status(400).json({ error: "widthMm et heightMm sont obligatoires." });
    }

    if (!VALID_MATERIALS.includes(material)) {
      return res.status(400).json({ error: "Matériau/couleur invalide." });
    }

    if (!VALID_STYLES.includes(style)) {
      return res.status(400).json({ error: "Style invalide." });
    }

    const sizes = getPlateSize(widthMm, heightMm);
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = sanitizeFilename(`${material}-${style}-${widthMm}x${heightMm}-${uid}`);

    const productionPngPath = path.join(PRODUCTION_DIR, `${slug}.png`);
    const previewWebpPath = path.join(PREVIEW_DIR, `${slug}.webp`);

    const prompt = buildPrompt({
      material,
      style,
      pictos,
      clientPrompt,
      widthMm,
      heightMm
    });

    await generateBaseVisual(
      prompt,
      productionPngPath,
      sizes.production.width,
      sizes.production.height
    );

    await sharp(productionPngPath)
      .resize(sizes.preview.width, sizes.preview.height, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .webp({ quality: 82 })
      .toFile(previewWebpPath);

    const payload = {
      id: uid,
      widthMm,
      heightMm,
      material,
      style,
      pictos,
      clientPrompt,
      production: {
        url: `/generated/production/${slug}.png`,
        width: sizes.production.width,
        height: sizes.production.height
      },
      preview: {
        url: `/generated/previews/${slug}.webp`,
        width: sizes.preview.width,
        height: sizes.preview.height
      },
      createdAt: new Date().toISOString()
    };

    saveCreation(payload);

    return res.json(payload);
  } catch (error) {
    console.error("Erreur generate-plaque-base:", error);
    return res.status(500).json({
      error: "Erreur lors de la génération de la base de plaque.",
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
