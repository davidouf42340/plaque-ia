import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const generatedDir = path.join(__dirname, "..", "generated");
const logosDir = path.join(generatedDir, "logos");

fs.mkdirSync(logosDir, { recursive: true });

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

    const finalPrompt = [
      "Créer un pictogramme/logo noir pour gravure laser.",
      "Fond totalement transparent.",
      "Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.",
      "Style pictogramme professionnel, lignes franches, peu de détails fins.",
      "Ne pas ajouter de texte ni de cadre.",
      `Sujet: ${cleanPrompt}`
    ].join(" ");

    const result = await openai.images.generate({
      model: "gpt-image-1.5",
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
        url: `${PUBLIC_BASE_URL}/generated/logos/${fileName}`
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

/**
 * Version preview de test
 */
app.post("/api/render/preview", async (req, res) => {
  try {
    const previews = [
      {
        color: "Noir",
        url: "https://placehold.co/1200x300/000000/FFFFFF/png?text=Plaque+Noir"
      },
      {
        color: "Or",
        url: "https://placehold.co/1200x300/C9A227/000000/png?text=Plaque+Or"
      },
      {
        color: "Argent",
        url: "https://placehold.co/1200x300/C0C0C0/000000/png?text=Plaque+Argent"
      },
      {
        color: "Blanc",
        url: "https://placehold.co/1200x300/FFFFFF/000000/png?text=Plaque+Blanc"
      },
      {
        color: "Rouge",
        url: "https://placehold.co/1200x300/B22222/FFFFFF/png?text=Plaque+Rouge"
      },
      {
        color: "Bleu",
        url: "https://placehold.co/1200x300/1E3A8A/FFFFFF/png?text=Plaque+Bleu"
      },
      {
        color: "Vert",
        url: "https://placehold.co/1200x300/166534/FFFFFF/png?text=Plaque+Vert"
      },
      {
        color: "Gris",
        url: "https://placehold.co/1200x300/6B7280/FFFFFF/png?text=Plaque+Gris"
      },
      {
        color: "Champagne",
        url: "https://placehold.co/1200x300/D6C6A5/000000/png?text=Plaque+Champagne"
      }
    ];

    return res.json({ previews });
  } catch (error) {
    console.error("Erreur /api/render/preview :", error);
    return res.status(500).json({
      error: "Erreur interne génération aperçu."
    });
  }
});

/**
 * Version production de test
 */
app.post("/api/render/production", async (req, res) => {
  try {
    return res.json({
      url: "https://placehold.co/1200x300/png?text=Fichier+Production+Transparent"
    });
  } catch (error) {
    console.error("Erreur /api/render/production :", error);
    return res.status(500).json({
      error: "Erreur interne génération production."
    });
  }
});

/**
 * Variant test
 */
app.post("/api/variant/resolve", async (req, res) => {
  try {
    const { dimension, thickness } = req.body || {};

    if (!dimension || !thickness) {
      return res.status(400).json({
        error: "Dimension ou épaisseur manquante."
      });
    }

    return res.json({
      variantId: 12345678901234,
      price: "19.90",
      priceFormatted: "19,90 €"
    });
  } catch (error) {
    console.error("Erreur /api/variant/resolve :", error);
    return res.status(500).json({
      error: "Erreur interne variant."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const generatedDir = path.join(__dirname, "..", "generated");
const logosDir = path.join(generatedDir, "logos");

fs.mkdirSync(logosDir, { recursive: true });

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

    const finalPrompt = [
      "Créer un pictogramme/logo noir pour gravure laser.",
      "Fond totalement transparent.",
      "Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.",
      "Style pictogramme professionnel, lignes franches, peu de détails fins.",
      "Ne pas ajouter de texte ni de cadre.",
      `Sujet: ${cleanPrompt}`
    ].join(" ");

    const result = await openai.images.generate({
      model: "gpt-image-1.5",
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
        url: `${PUBLIC_BASE_URL}/generated/logos/${fileName}`
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

/**
 * Version preview de test
 */
app.post("/api/render/preview", async (req, res) => {
  try {
    const previews = [
      {
        color: "Noir",
        url: "https://placehold.co/1200x300/000000/FFFFFF/png?text=Plaque+Noir"
      },
      {
        color: "Or",
        url: "https://placehold.co/1200x300/C9A227/000000/png?text=Plaque+Or"
      },
      {
        color: "Argent",
        url: "https://placehold.co/1200x300/C0C0C0/000000/png?text=Plaque+Argent"
      },
      {
        color: "Blanc",
        url: "https://placehold.co/1200x300/FFFFFF/000000/png?text=Plaque+Blanc"
      },
      {
        color: "Rouge",
        url: "https://placehold.co/1200x300/B22222/FFFFFF/png?text=Plaque+Rouge"
      },
      {
        color: "Bleu",
        url: "https://placehold.co/1200x300/1E3A8A/FFFFFF/png?text=Plaque+Bleu"
      },
      {
        color: "Vert",
        url: "https://placehold.co/1200x300/166534/FFFFFF/png?text=Plaque+Vert"
      },
      {
        color: "Gris",
        url: "https://placehold.co/1200x300/6B7280/FFFFFF/png?text=Plaque+Gris"
      },
      {
        color: "Champagne",
        url: "https://placehold.co/1200x300/D6C6A5/000000/png?text=Plaque+Champagne"
      }
    ];

    return res.json({ previews });
  } catch (error) {
    console.error("Erreur /api/render/preview :", error);
    return res.status(500).json({
      error: "Erreur interne génération aperçu."
    });
  }
});

/**
 * Version production de test
 */
app.post("/api/render/production", async (req, res) => {
  try {
    return res.json({
      url: "https://placehold.co/1200x300/png?text=Fichier+Production+Transparent"
    });
  } catch (error) {
    console.error("Erreur /api/render/production :", error);
    return res.status(500).json({
      error: "Erreur interne génération production."
    });
  }
});

/**
 * Variant test
 */
app.post("/api/variant/resolve", async (req, res) => {
  try {
    const { dimension, thickness } = req.body || {};

    if (!dimension || !thickness) {
      return res.status(400).json({
        error: "Dimension ou épaisseur manquante."
      });
    }

    return res.json({
      variantId: 12345678901234,
      price: "19.90",
      priceFormatted: "19,90 €"
    });
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
