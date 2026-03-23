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
const tmpDir = path.join(generatedDir, "tmp");

fs.mkdirSync(logosDir, { recursive: true });
fs.mkdirSync(previewsDir, { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

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

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`;
}

/**
 * IMPORTANT :
 * Remplace ces URLs par TES vraies images Shopify Files
 */
const PLATE_BACKGROUNDS = {
  noir: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-noir.png",
  or: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-or.png",
  argent: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-argent.png",
  blanc: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-blanc.png",
  rouge: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-rouge.png",
  bleu: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-bleu.png",
  vert: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-vert.png",
  gris: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-gris.png",
  champagne: "https://cdn.shopify.com/s/files/1/0000/0000/0000/files/plaque-champagne.png"
};

/**
 * Dimensions de travail / production
 * Adapte selon tes vrais gabarits
 */
const DIMENSION_MAP = {
  "100x25": { width: 1181, height: 295 },
  "150x50": { width: 1772, height: 591 },
  "200x50": { width: 2362, height: 591 }
};

/**
 * Variant map test
 * Remplace par tes vrais variants Shopify
 */
const VARIANT_MAP = {
  "100x25": {
    "2.6": { variantId: 12345678901234, price: "19.90", priceFormatted: "19,90 €" },
    "3.2": { variantId: 12345678901235, price: "21.90", priceFormatted: "21,90 €" }
  },
  "150x50": {
    "2.6": { variantId: 12345678901236, price: "24.90", priceFormatted: "24,90 €" },
    "3.2": { variantId: 12345678901237, price: "26.90", priceFormatted: "26,90 €" }
  },
  "200x50": {
    "2.6": { variantId: 12345678901238, price: "29.90", priceFormatted: "29,90 €" },
    "3.2": { variantId: 12345678901239, price: "31.90", priceFormatted: "31,90 €" }
  }
};

function getCanvasSize(dimension = "100x25") {
  return DIMENSION_MAP[dimension] || DIMENSION_MAP["100x25"];
}

function escapeXml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildTextSvg({
  width,
  height,
  line1 = "",
  line2 = "",
  line3 = "",
  fill = "#111111"
}) {
  const safe1 = escapeXml(line1);
  const safe2 = escapeXml(line2);
  const safe3 = escapeXml(line3);

  const font1 = Math.round(height * 0.34);
  const font2 = Math.round(height * 0.23);
  const font3 = Math.round(height * 0.18);

  const x = Math.round(width / 2);

  const y1 = Math.round(height * 0.30);
  const y2 = Math.round(height * 0.60);
  const y3 = Math.round(height * 0.82);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .l1 { font: 700 ${font1}px Arial, sans-serif; fill: ${fill}; }
        .l2 { font: 500 ${font2}px Arial, sans-serif; fill: ${fill}; }
        .l3 { font: 500 ${font3}px Arial, sans-serif; fill: ${fill}; }
      </style>
      ${safe1 ? `<text x="${x}" y="${y1}" text-anchor="middle" class="l1">${safe1}</text>` : ""}
      ${safe2 ? `<text x="${x}" y="${y2}" text-anchor="middle" class="l2">${safe2}</text>` : ""}
      ${safe3 ? `<text x="${x}" y="${y3}" text-anchor="middle" class="l3">${safe3}</text>` : ""}
    </svg>
  `);
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de charger l'image : ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fitLogo(buffer, boxWidth, boxHeight, tint = null) {
  let img = sharp(buffer).resize({
    width: boxWidth,
    height: boxHeight,
    fit: "contain",
    withoutEnlargement: true
  });

  if (tint) {
    img = img.tint(tint);
  }

  return img.png().toBuffer();
}

async function buildComposite({
  backgroundUrl = null,
  dimension = "100x25",
  line1 = "",
  line2 = "",
  line3 = "",
  leftLogoUrl = null,
  rightLogoUrl = null,
  textFill = "#111111",
  output = "preview"
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

  const logoBoxWidth = Math.round(width * 0.16);
  const logoBoxHeight = Math.round(height * 0.62);
  const sideMargin = Math.round(width * 0.03);

  const textZoneLeft = hasLeft ? Math.round(width * 0.17) : Math.round(width * 0.04);
  const textZoneRight = hasRight ? Math.round(width * 0.17) : Math.round(width * 0.04);
  const textZoneWidth = width - textZoneLeft - textZoneRight;

  if (leftLogoUrl) {
    const leftLogoBuffer = await fetchImageBuffer(leftLogoUrl);
    const preparedLeftLogo = await fitLogo(
      leftLogoBuffer,
      logoBoxWidth,
      logoBoxHeight,
      output === "production" ? "#111111" : null
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
      output === "production" ? "#111111" : null
    );

    composites.push({
      input: preparedRightLogo,
      left: width - logoBoxWidth - sideMargin,
      top: Math.round((height - logoBoxHeight) / 2)
    });
  }

  const textSvg = buildTextSvg({
    width: textZoneWidth,
    height,
    line1,
    line2,
    line3,
    fill: textFill
  });

  composites.push({
    input: textSvg,
    left: textZoneLeft,
    top: 0
  });

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
      dimension = "100x25"
    } = req.body || {};

    const baseUrl = getBaseUrl(req);
    const previews = [];

    for (const [colorKey, bgUrl] of Object.entries(PLATE_BACKGROUNDS)) {
      const composedBuffer = await buildComposite({
        backgroundUrl: bgUrl,
        dimension,
        line1,
        line2,
        line3,
        leftLogoUrl,
        rightLogoUrl,
        textFill: "#111111",
        output: "preview"
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

app.post("/api/render/production", async (req, res) => {
  try {
    const {
      line1 = "",
      line2 = "",
      line3 = "",
      dimension = "100x25",
      leftLogoUrl = null,
      rightLogoUrl = null
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
      textFill: "#111111",
      output: "production"
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
    const { dimension, thickness } = req.body || {};

    if (!dimension || !thickness) {
      return res.status(400).json({
        error: "Dimension ou épaisseur manquante."
      });
    }

    const found = VARIANT_MAP?.[dimension]?.[thickness];

    if (!found) {
      return res.status(404).json({
        error: "Variant introuvable pour cette dimension / épaisseur."
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
