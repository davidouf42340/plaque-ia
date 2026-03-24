import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const generatedDir = path.join(__dirname, "..", "generated");
const logosDir = path.join(generatedDir, "logos");
const previewsDir = path.join(generatedDir, "previews");
const productionDir = path.join(generatedDir, "production");

fs.mkdirSync(logosDir, { recursive: true });
fs.mkdirSync(previewsDir, { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });

app.use("/generated", express.static(generatedDir));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Serveur configurateur plaque en ligne"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeDimension(value = "") {
  return String(value).trim().toLowerCase().replaceAll(" ", "");
}

function normalizeThickness(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace("mm", "")
    .replace(",", ".")
    .trim();
}

function normalizeColor(value = "") {
  const v = String(value).trim().toLowerCase();

  const map = {
    "acier brossé": "acier-brosse",
    "acier-brosse": "acier-brosse",
    "acier": "acier-brosse",

    "or brossé": "or",
    "or": "or",

    "cuivre": "cuivre",
    "blanc": "blanc",
    "noir": "noir",

    "noir brillant": "noir-brillant",
    "noir-brillant": "noir-brillant",

    "gris": "gris",
    "noyer": "noyer",
    "rose": "rose"
  };

  return map[v] || v;
}

const PLATE_BACKGROUNDS = {
  "acier-brosse": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/acier-fd.png",
  "or": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/or-fd.png",
  "cuivre": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/cuivre-fd.png",
  "blanc": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/blanc-fd.png",
  "noir": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noir-fd.png",
  "noir-brillant": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noirm-fd.png",
  "gris": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/gris-fd.png",
  "noyer": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noyer-fd.png",
  "rose": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/rose-fd.png"
};

const FOREGROUND_BY_COLOR = {
  "acier-brosse": "#111111",
  "or": "#111111",
  "cuivre": "#111111",
  "blanc": "#111111",

  "noir": "#FFFFFF",
  "noir-brillant": "#FFFFFF",
  "gris": "#FFFFFF",
  "noyer": "#FFFFFF",
  "rose": "#FFFFFF"
};

const ALLOWED_THICKNESS_BY_COLOR = {
  "acier-brosse": ["1.6", "3.2"],
  "or": ["1.6", "3.2"],
  "cuivre": ["1.6", "3.2"],
  "blanc": ["1.6", "3.2"],
  "noir": ["1.6", "3.2"],

  "noir-brillant": ["1.6"],
  "gris": ["1.6"],
  "noyer": ["1.6"],
  "rose": ["1.6"]
};

const DIMENSION_MAP = {
  "100x25mm": { width: 1181, height: 295 },
  "150x37mm": { width: 1772, height: 437 },
  "200x50mm": { width: 2362, height: 591 },
  "250x87mm": { width: 2953, height: 1028 },
  "300x100mm": { width: 3543, height: 1181 },

  "100x25": { width: 1181, height: 295 },
  "150x37": { width: 1772, height: 437 },
  "200x50": { width: 2362, height: 591 },
  "250x87": { width: 2953, height: 1028 },
  "300x100": { width: 3543, height: 1181 }
};

function getCanvasSize(dimension = "100x25mm") {
  const key = normalizeDimension(dimension);
  return DIMENSION_MAP[key] || DIMENSION_MAP["100x25mm"];
}

const VARIANT_MAP = {
  "100x25mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180430151 },
      "or": { variantId: 53556221837639 },
      "cuivre": { variantId: 53556222165319 },
      "noir": { variantId: 53556222492999 },
      "blanc": { variantId: 53556222820679 },
      "noir-brillant": { variantId: 53556223148359 },
      "noyer": { variantId: 53556223476039 },
      "gris": { variantId: 53556223803719 },
      "rose": { variantId: 53556224131399 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183870791 },
      "or": { variantId: 53556221870407 },
      "cuivre": { variantId: 53556222198087 },
      "noir": { variantId: 53556222525767 },
      "blanc": { variantId: 53556222853447 }
    }
  },

  "150x37mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180462919 },
      "or": { variantId: 53556221903175 },
      "cuivre": { variantId: 53556222230855 },
      "noir": { variantId: 53556222558535 },
      "blanc": { variantId: 53556222886215 },
      "noir-brillant": { variantId: 53556223213895 },
      "noyer": { variantId: 53556223541575 },
      "gris": { variantId: 53556223869255 },
      "rose": { variantId: 53556224196935 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183903559 },
      "or": { variantId: 53556221935943 },
      "cuivre": { variantId: 53556222263623 },
      "noir": { variantId: 53556222591303 },
      "blanc": { variantId: 53556222918983 }
    }
  },

  "200x50mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180495687 },
      "or": { variantId: 53556221968711 },
      "cuivre": { variantId: 53556222296391 },
      "noir": { variantId: 53556222624071 },
      "blanc": { variantId: 53556222951751 },
      "noir-brillant": { variantId: 53556223279431 },
      "noyer": { variantId: 53556223607111 },
      "gris": { variantId: 53556223934791 },
      "rose": { variantId: 53556224262471 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183936327 },
      "or": { variantId: 53556222001479 },
      "cuivre": { variantId: 53556222329159 },
      "noir": { variantId: 53556222656839 },
      "blanc": { variantId: 53556222984519 }
    }
  },

  "250x87mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180528455 },
      "or": { variantId: 53556222034247 },
      "cuivre": { variantId: 53556222361927 },
      "noir": { variantId: 53556222689607 },
      "blanc": { variantId: 53556223017287 },
      "noir-brillant": { variantId: 53556223344967 },
      "noyer": { variantId: 53556223672647 },
      "gris": { variantId: 53556224000327 },
      "rose": { variantId: 53556224328007 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183969095 },
      "or": { variantId: 53556222067015 },
      "cuivre": { variantId: 53556222394695 },
      "noir": { variantId: 53556222722375 },
      "blanc": { variantId: 53556223050055 }
    }
  },

  "300x100mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180561223 },
      "or": { variantId: 53556222099783 },
      "cuivre": { variantId: 53556222427463 },
      "noir": { variantId: 53556222755143 },
      "blanc": { variantId: 53556223082823 },
      "noir-brillant": { variantId: 53556223410503 },
      "noyer": { variantId: 53556223738183 },
      "gris": { variantId: 53556224065863 },
      "rose": { variantId: 53556224393543 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526184001863 },
      "or": { variantId: 53556222132551 },
      "cuivre": { variantId: 53556222460231 },
      "noir": { variantId: 53556222787911 },
      "blanc": { variantId: 53556223115591 }
    }
  }
};

function getPangoFontFamily(key = "sans") {
  const map = {
    sans: "sans",
    serif: "serif",
    mono: "monospace"
  };
  return map[key] || "sans";
}

function normalizeFontFamilies(fontFamilies = {}) {
  return {
    line1: ["sans", "serif", "mono"].includes(fontFamilies.line1) ? fontFamilies.line1 : "sans",
    line2: ["sans", "serif", "mono"].includes(fontFamilies.line2) ? fontFamilies.line2 : "sans",
    line3: ["sans", "serif", "mono"].includes(fontFamilies.line3) ? fontFamilies.line3 : "sans"
  };
}

function normalizeTextScale(textScale = {}) {
  const parseScale = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1.8, Math.max(0.6, n));
  };

  return {
    line1: parseScale(textScale.line1, 1),
    line2: parseScale(textScale.line2, 1),
    line3: parseScale(textScale.line3, 1)
  };
}

function escapePangoText(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function buildTextComposites({
  width,
  height,
  offsetLeft = 0,
  line1 = "",
  line2 = "",
  line3 = "",
  fill = "#111111",
  fontFamilies = {},
  textScale = {}
}) {
  const families = normalizeFontFamilies(fontFamilies);
  const scales = normalizeTextScale(textScale);

  const base1 = Math.round(height * 0.40);
  const base2 = Math.round(height * 0.24);
  const base3 = Math.round(height * 0.18);

  const font1 = Math.max(14, Math.round(base1 * scales.line1));
  const font2 = Math.max(12, Math.round(base2 * scales.line2));
  const font3 = Math.max(10, Math.round(base3 * scales.line3));

  const y1 = Math.round(height * 0.08);
  const y2 = Math.round(height * 0.36);
  const y3 = Math.round(height * 0.61);

  const composites = [];

  function pushTextBlock(text, fontSize, fontKey, top) {
    if (!text || !String(text).trim()) return;

    const safe = escapePangoText(text);

    composites.push({
      input: {
        text: {
          text: `<span foreground="${fill}">${safe}</span>`,
          width,
          dpi: 300,
          rgba: true,
          align: "center",
          font: `${getPangoFontFamily(fontKey)} ${fontSize}`
        }
      },
      left: offsetLeft,
      top
    });
  }

  pushTextBlock(line1, font1, families.line1, y1);
  pushTextBlock(line2, font2, families.line2, y2);
  pushTextBlock(line3, font3, families.line3, y3);

  return composites;
}

function hexToRgb(hex = "#111111") {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de charger l'image : ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fitLogo(buffer, boxWidth, boxHeight, colorHex = "#111111") {
  const { r, g, b } = hexToRgb(colorHex);

  const resizedBuffer = await sharp(buffer)
    .ensureAlpha()
    .trim()
    .resize({
      width: boxWidth,
      height: boxHeight,
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  const meta = await sharp(resizedBuffer).metadata();
  const logoW = meta.width || boxWidth;
  const logoH = meta.height || boxHeight;

  const alpha = await sharp(resizedBuffer)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  const coloredLogo = await sharp({
    create: {
      width: logoW,
      height: logoH,
      channels: 3,
      background: { r, g, b }
    }
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();

  const left = Math.max(0, Math.round((boxWidth - logoW) / 2));
  const top = Math.max(0, Math.round((boxHeight - logoH) / 2));

  return sharp({
    create: {
      width: boxWidth,
      height: boxHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: coloredLogo, left, top }])
    .png()
    .toBuffer();
}

async function buildComposite({
  backgroundUrl = null,
  dimension = "100x25mm",
  line1 = "",
  line2 = "",
  line3 = "",
  leftLogoUrl = null,
  rightLogoUrl = null,
  foreground = "#111111",
  fontFamilies = {},
  textScale = {}
}) {
  const { width, height } = getCanvasSize(dimension);

  let base;

  if (backgroundUrl) {
    const bgBuffer = await fetchImageBuffer(backgroundUrl);
    base = sharp(bgBuffer).resize(width, height, { fit: "fill" });
  } else {
    base = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });
  }

  const composites = [];

  const hasLeft = !!leftLogoUrl;
  const hasRight = !!rightLogoUrl;

  const logoBoxWidth = Math.round(width * 0.25);
  const logoBoxHeight = Math.round(height * 0.76);
  const sideMargin = Math.round(width * 0.02);

  const textZoneLeft = hasLeft ? Math.round(width * 0.26) : Math.round(width * 0.05);
  const textZoneRight = hasRight ? Math.round(width * 0.26) : Math.round(width * 0.05);
  const textZoneWidth = width - textZoneLeft - textZoneRight;

  if (leftLogoUrl) {
    const leftLogoBuffer = await fetchImageBuffer(leftLogoUrl);
    const preparedLeftLogo = await fitLogo(
      leftLogoBuffer,
      logoBoxWidth,
      logoBoxHeight,
      foreground
    );

    composites.push({
      input: preparedLeftLogo,
      left: sideMargin,
      top: Math.round((height - logoBoxHeight) / 2)
    });
  }

  if (rightLogoUrl) {
    const rightLogoBuffer = await fetchImageBuffer(rightLogoUrl);
    const preparedRightLogo = await fitLogo(
      rightLogoBuffer,
      logoBoxWidth,
      logoBoxHeight,
      foreground
    );

    composites.push({
      input: preparedRightLogo,
      left: width - logoBoxWidth - sideMargin,
      top: Math.round((height - logoBoxHeight) / 2)
    });
  }

  const textComposites = await buildTextComposites({
    width: textZoneWidth,
    height,
    offsetLeft: textZoneLeft,
    line1,
    line2,
    line3,
    fill: foreground,
    fontFamilies,
    textScale
  });

  composites.push(...textComposites);

  return base.composite(composites).png().toBuffer();
}

app.post("/api/logos/search-or-generate", async (req, res) => {
  try {
    const { prompt, count = 3 } = req.body || {};
    const cleanPrompt = String(prompt || "").trim();
    const imageCount = Math.max(1, Math.min(Number(count) || 3, 3));

    if (!cleanPrompt) {
      return res.status(400).json({
        error: "Prompt logo manquant."
      });
    }

    const baseUrl = getBaseUrl(req);

    const finalPrompt = [
      "Créer un pictogramme/logo noir pour gravure laser.",
      "Fond totalement transparent.",
      "Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.",
      "Style pictogramme professionnel, lignes franches, peu de détails fins.",
      "Ne pas ajouter de texte ni de cadre.",
      `Sujet: ${cleanPrompt}`
    ].join(" ");

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
      background: "transparent",
      output_format: "png",
      quality: "medium",
      n: imageCount
    });

    const logos = [];

    for (let i = 0; i < (result.data || []).length; i += 1) {
      const item = result.data[i];
      if (!item.b64_json) continue;

      const fileBase = `${Date.now()}-${slugify(cleanPrompt)}-${i + 1}`;
      const fileName = `${fileBase}.png`;
      const filePath = path.join(logosDir, fileName);

      fs.writeFileSync(filePath, Buffer.from(item.b64_json, "base64"));

      logos.push({
        id: fileBase,
        url: `${baseUrl}/generated/logos/${fileName}`
      });
    }

    return res.json({ logos });
  } catch (error) {
    console.error("Erreur /api/logos/search-or-generate :", error);
    return res.status(500).json({
      error: error?.message || "Erreur interne génération logos."
    });
  }
});

app.post("/api/render/preview", async (req, res) => {
  try {
    const {
      line1 = "",
      line2 = "",
      line3 = "",
      leftLogoUrl = null,
      rightLogoUrl = null,
      dimension = "100x25mm",
      fontFamilies = {},
      textScale = {}
    } = req.body || {};

    const baseUrl = getBaseUrl(req);
    const previews = [];

    for (const [colorKey, bgUrl] of Object.entries(PLATE_BACKGROUNDS)) {
      const foreground = FOREGROUND_BY_COLOR[colorKey] || "#111111";

      const composedBuffer = await buildComposite({
        backgroundUrl: bgUrl,
        dimension,
        line1,
        line2,
        line3,
        leftLogoUrl,
        rightLogoUrl,
        foreground,
        fontFamilies,
        textScale
      });

      const fileName = `${Date.now()}-${slugify(colorKey)}-${Math.random().toString(36).slice(2, 8)}.png`;
      const filePath = path.join(previewsDir, fileName);

      fs.writeFileSync(filePath, composedBuffer);

      previews.push({
        color: colorKey,
        url: `${baseUrl}/generated/previews/${fileName}`
      });
    }

    return res.json({ previews });
  } catch (error) {
    console.error("Erreur /api/render/preview :", error);
    return res.status(500).json({
      error: error?.message || "Erreur interne génération aperçu."
    });
  }
});

app.post("/api/render/single-preview", async (req, res) => {
  try {
    const {
      line1 = "",
      line2 = "",
      line3 = "",
      leftLogoUrl = null,
      rightLogoUrl = null,
      dimension = "100x25mm",
      color = "",
      fontFamilies = {},
      textScale = {}
    } = req.body || {};

    const colorKey = normalizeColor(color);
    const bgUrl = PLATE_BACKGROUNDS[colorKey];

    if (!bgUrl) {
      return res.status(404).json({ error: "Couleur introuvable." });
    }

    const foreground = FOREGROUND_BY_COLOR[colorKey] || "#111111";
    const baseUrl = getBaseUrl(req);

    const composedBuffer = await buildComposite({
      backgroundUrl: bgUrl,
      dimension,
      line1,
      line2,
      line3,
      leftLogoUrl,
      rightLogoUrl,
      foreground,
      fontFamilies,
      textScale
    });

    const fileName = `${Date.now()}-single-${slugify(colorKey)}-${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(previewsDir, fileName);

    fs.writeFileSync(filePath, composedBuffer);

    return res.json({
      color: colorKey,
      url: `${baseUrl}/generated/previews/${fileName}`
    });
  } catch (error) {
    console.error("Erreur /api/render/single-preview :", error);
    return res.status(500).json({
      error: error?.message || "Erreur interne aperçu simple."
    });
  }
});

app.post("/api/render/production", async (req, res) => {
  try {
    const {
      line1 = "",
      line2 = "",
      line3 = "",
      dimension = "100x25mm",
      leftLogoUrl = null,
      rightLogoUrl = null,
      fontFamilies = {},
      textScale = {}
    } = req.body || {};

    const baseUrl = getBaseUrl(req);

    const productionBuffer = await buildComposite({
      backgroundUrl: null,
      dimension,
      line1,
      line2,
      line3,
      leftLogoUrl,
      rightLogoUrl,
      foreground: "#111111",
      fontFamilies,
      textScale
    });

    const fileName = `${Date.now()}-production-${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(productionDir, fileName);

    fs.writeFileSync(filePath, productionBuffer);

    return res.json({
      url: `${baseUrl}/generated/production/${fileName}`
    });
  } catch (error) {
    console.error("Erreur /api/render/production :", error);
    return res.status(500).json({
      error: error?.message || "Erreur interne génération production."
    });
  }
});

app.post("/api/variant/resolve", async (req, res) => {
  try {
    const dimension = normalizeDimension(req.body?.dimension || "");
    const thickness = normalizeThickness(req.body?.thickness || "");
    const color = normalizeColor(req.body?.color || "");

    if (!dimension || !thickness || !color) {
      return res.status(400).json({
        error: "Dimension, épaisseur ou couleur manquante."
      });
    }

    const allowedThickness = ALLOWED_THICKNESS_BY_COLOR[color];
    if (!allowedThickness) {
      return res.status(404).json({
        error: "Couleur introuvable."
      });
    }

    if (!allowedThickness.includes(thickness)) {
      return res.status(400).json({
        error: `L'épaisseur ${thickness} mm n'est pas disponible pour la couleur ${color}.`
      });
    }

    const found = VARIANT_MAP?.[dimension]?.[thickness]?.[color];

    if (!found) {
      return res.status(404).json({
        error: "Variant introuvable pour cette combinaison."
      });
    }

    return res.json(found);
  } catch (error) {
    console.error("Erreur /api/variant/resolve :", error);
    return res.status(500).json({
      error: "Erreur interne variant."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
