import express from "express";
import cors from "cors";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

/**
 * Route de test
 */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Serveur configurateur plaque en ligne"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * 1) Recherche / génération de logos
 * Pour l'instant : version de test pour remettre tout en ligne
 */
app.post("/api/logos/search-or-generate", async (req, res) => {
  try {
    const { prompt, count = 3 } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: "Prompt logo manquant."
      });
    }

    const safePrompt = encodeURIComponent(String(prompt).trim());

    const logos = Array.from({ length: Number(count) || 3 }).map((_, i) => ({
      id: `logo_${i + 1}`,
      url: `https://placehold.co/600x240/png?text=${safePrompt}+${i + 1}`
    }));

    return res.json({ logos });
  } catch (error) {
    console.error("Erreur /api/logos/search-or-generate :", error);
    return res.status(500).json({
      error: "Erreur interne génération logos."
    });
  }
});

/**
 * 2) Génération des aperçus couleur
 * Version de test
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
 * 3) Génération du fichier production
 * Version de test
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
 * 4) Résolution du variant Shopify
 * Version de test
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
