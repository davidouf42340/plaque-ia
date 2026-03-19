import express from "express";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage, registerFont } from "canvas";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));

// === DOSSIERS ===
const GENERATED_DIR = "generated";
const PREVIEW_DIR = path.join(GENERATED_DIR, "previews");
const PRODUCTION_DIR = path.join(GENERATED_DIR, "production");

// création auto
[GENERATED_DIR, PREVIEW_DIR, PRODUCTION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// === FONTS (SAFE) ===
const FONT_MAP = {
  design: "fonts/design.ttf",
  modern: "fonts/modern.ttf",
  script: "fonts/script.ttf",
  elegant: "fonts/elegant.ttf",
  impact: "fonts/impact.ttf"
};

Object.entries(FONT_MAP).forEach(([key, fontPath]) => {
  try {
    if (fs.existsSync(fontPath)) {
      registerFont(fontPath, { family: key });
      console.log("Font loaded:", key);
    } else {
      console.log("Font missing:", key);
    }
  } catch (e) {
    console.log("Font error:", key, e.message);
  }
});

// === HELPER ===
function generateId() {
  return Date.now() + "_" + Math.floor(Math.random() * 10000);
}

// === ROUTE TEST ===
app.get("/", (req, res) => {
  res.send("Serveur IA Plaques OK 🚀");
});

// === COMPOSE ===
app.post("/compose", async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const {
      material = "acier",
      line1 = "",
      line2 = "",
      line3 = "",
      fontStyle = "design",
      dimension = "200x50"
    } = req.body;

    // === DIMENSIONS ===
    const [w, h] = dimension.split("x").map(Number);

    const scale = 10; // pour haute qualité
    const canvas = createCanvas(w * scale, h * scale);
    const ctx = canvas.getContext("2d");

    // === FOND ===
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // === TEXTE COULEUR ===
    let textColor = "#000000";
    if (["noirM", "noirB", "noyer", "rose", "gris"].includes(material)) {
      textColor = "#ffffff";
    }

    ctx.fillStyle = textColor;
    ctx.textAlign = "center";

    // === FONT SAFE ===
    const font = FONT_MAP[fontStyle] ? fontStyle : "sans-serif";

    // === AUTO SIZE TEXTE ===
    function fitText(text, maxWidth, baseSize) {
      let size = baseSize;
      do {
        ctx.font = `${size}px ${font}`;
        size -= 2;
      } while (ctx.measureText(text).width > maxWidth && size > 10);
      return size;
    }

    const maxWidth = canvas.width * 0.9;

    // === LIGNE 1 ===
    if (line1) {
      const size = fitText(line1, maxWidth, 120);
      ctx.font = `${size}px ${font}`;
      ctx.fillText(line1, canvas.width / 2, canvas.height * 0.3);
    }

    // === LIGNE 2 ===
    if (line2) {
      const size = fitText(line2, maxWidth, 90);
      ctx.font = `${size}px ${font}`;
      ctx.fillText(line2, canvas.width / 2, canvas.height * 0.55);
    }

    // === LIGNE 3 ===
    if (line3) {
      const size = fitText(line3, maxWidth, 70);
      ctx.font = `${size}px ${font}`;
      ctx.fillText(line3, canvas.width / 2, canvas.height * 0.75);
    }

    // === ID ===
    const id = generateId();

    // === PREVIEW (fond blanc) ===
    const previewPath = `${PREVIEW_DIR}/${id}.png`;
    fs.writeFileSync(previewPath, canvas.toBuffer("image/png"));

    // === PRODUCTION (TRANSPARENT 600 DPI) ===
    const prodCanvas = createCanvas(w * scale, h * scale);
    const prodCtx = prodCanvas.getContext("2d");

    prodCtx.clearRect(0, 0, prodCanvas.width, prodCanvas.height);
    prodCtx.drawImage(canvas, 0, 0);

    const productionPath = `${PRODUCTION_DIR}/${id}.png`;
    fs.writeFileSync(productionPath, prodCanvas.toBuffer("image/png"));

    console.log("SUCCESS:", id);

    res.json({
      preview: `/generated/previews/${id}.png`,
      production: `/generated/production/${id}.png`,
      creationId: id,
      line1,
      line2,
      line3
    });

  } catch (err) {
    console.error("ERREUR SERVEUR :", err);

    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

// === STATIC ===
app.use("/generated", express.static("generated"));

app.get("/", (req, res) => {
  res.send("Serveur IA Plaques OK 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Serveur IA lancé sur le port " + PORT);
});
