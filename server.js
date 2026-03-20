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
    engravingColor === "white" ? "blanc pur" : "noir profond";

  const leftText = leftIcon?.trim()
    ? `- pictogramme à gauche uniquement : ${leftIcon.trim()}`
    : "- aucun pictogramme à gauche";

  const rightText = rightIcon?.trim()
    ? `- pictogramme à droite uniquement : ${rightIcon.trim()}`
    : "- aucun pictogramme à droite";

  const decorText = backgroundDecor?.trim()
    ? `- décor léger très discret en arrière-plan : ${backgroundDecor.trim()}`
    : "- aucun décor de fond";

  return `
Créer UNIQUEMENT un overlay décoratif pour une plaque personnalisée horizontale.

IMPORTANT :
- fond totalement transparent
- aucun fond de plaque
- aucun rectangle
- aucune matière
- aucune plaque complète
- aucun texte
- aucune lettre
- aucun chiffre
- aucun mot
- aucune typographie
- aucune signature
- aucun élément important au centre
- aucun chevauchement avec la zone de texte
- pas de scène complexe

Objectif :
Créer uniquement des éléments graphiques décoratifs destinés à être superposés sur une plaque déjà affichée côté Shopify.

Composition OBLIGATOIRE :
- format horizontal 4:1
- réserver impérativement une grande zone vide centrale pour le texte
- la zone centrale doit rester propre, vide et lisible
- ne rien placer d'important au centre
- placer le pictogramme gauche uniquement dans le tiers gauche
- placer le pictogramme droite uniquement dans le tiers droit
- ne jamais faire chevaucher les pictogrammes avec la zone centrale
- garder des marges propres sur les bords
- composition équilibrée, sobre, premium

Répartition visuelle stricte :
- tiers gauche = pictogramme gauche seulement
- tiers central = vide pour le texte
- tiers droit = pictogramme droite seulement

Style :
- style : ${style}
- rendu simple, net, lisible
- décor discret et élégant
- pas trop chargé
- visuel exploitable pour gravure / découpe
- icônes simples, propres, type vectoriel
- traits clairs et lisibles

Éléments demandés :
${leftText}
${rightText}
${decorText}

Décor de fond :
- le décor de fond doit être très léger
- il peut traverser l'arrière-plan mais en intensité faible
- il ne doit jamais gêner la lecture du texte central
- éviter tout élément dense au centre

Couleur obligatoire de l'overlay :
- utiliser uniquement la couleur ${overlayColorText}
- tout le graphisme doit être en ${overlayColorText}
- le reste totalement transparent

Contexte plaque choisi par le client :
- couleur de plaque : ${plateColor}

Résultat final obligatoire :
- un PNG transparent
- décoration seulement
- gauche et droite bien séparés
- centre vide.
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
