import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { OpenAI } from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📁 DOSSIERS
const previewDir = "generated/previews";
const productionDir = "generated/production";
const pictoDir = "generated/pictos";
const fontsDir = "fonts";

// 📁 CRÉATION DOSSIERS
["generated", previewDir, productionDir, pictoDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use("/generated", express.static("generated"));

// 🎨 COULEUR TEXTE
const darkMaterials = ["noirB","noirM","noyer","rose","gris"];

function textColor(material){
  return darkMaterials.includes(material) ? "#ffffff" : "#000000";
}

// 🔤 CHARGEMENT FONTS (BASE64)
function loadFontBase64(file){
  const fontPath = path.join(fontsDir, file);
  const data = fs.readFileSync(fontPath);
  return data.toString("base64");
}

// 🔤 MAPPING FONTS
const FONT_MAP = {
  design: "design.ttf",
  modern: "modern.ttf",
  script: "script.ttf",
  handwriting: "script.ttf",
  classic: "elegant.ttf",
  elegant: "elegant.ttf",
  impact: "impact.ttf"
};

// 🧠 SVG AVEC FONT EMBED
function buildSVG({ line1, line2, line3, fontStyle, material }) {

  const fontFile = FONT_MAP[fontStyle] || "design.ttf";
  const fontBase64 = loadFontBase64(fontFile);
  const color = textColor(material);

  return `
<svg width="1200" height="300" xmlns="http://www.w3.org/2000/svg">

<style>
@font-face {
  font-family: "CustomFont";
  src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
}
</style>

<rect width="100%" height="100%" fill="transparent"/>

<text x="50%" y="100" font-size="80" text-anchor="middle" fill="${color}" font-family="CustomFont">${line1}</text>
<text x="50%" y="180" font-size="70" text-anchor="middle" fill="${color}" font-family="CustomFont">${line2}</text>
<text x="50%" y="250" font-size="60" text-anchor="middle" fill="${color}" font-family="CustomFont">${line3}</text>

</svg>
`;
}

// 🎯 API
app.post("/compose", async (req, res) => {

  try {

    const { prompt, material, fontStyle, line1, line2, line3 } = req.body;

    const l1 = line1 || (prompt ? prompt.split(",")[0] : "");
    const l2 = line2 || (prompt ? prompt.split(",")[1] : "");
    const l3 = line3 || (prompt ? prompt.split(",")[2] : "");

    const svg = buildSVG({
      line1: l1,
      line2: l2,
      line3: l3,
      fontStyle,
      material
    });

    const filename = `plaque-${Date.now()}.svg`;
    const filePath = `${previewDir}/${filename}`;

    fs.writeFileSync(filePath, svg);

    res.json({
      preview: `${req.protocol}://${req.get("host")}/${filePath}`,
      production: `${req.protocol}://${req.get("host")}/${filePath}`
    });

  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Erreur serveur" });
  }

});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Serveur IA lancé sur le port " + PORT);
});
app.get("/", (req, res) => {
  res.status(200).send("Serveur IA OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Serveur IA lancé sur le port " + PORT);
});
