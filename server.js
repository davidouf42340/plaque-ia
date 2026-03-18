import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PORT = 3000;

/* =========================
   DOSSIERS
========================= */

const previewDir = "generated/previews";
const productionDir = "generated/production";
const pictoDir = "generated/pictos";
const materialsDir = "materials";
const creationsFile = "creations.json";
const localPictosDir = "pictos";

for (const dir of ["generated", previewDir, productionDir, pictoDir, materialsDir, localPictosDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(creationsFile)) fs.writeFileSync(creationsFile, "[]");

app.use("/generated", express.static("generated"));
app.use("/pictos", express.static("pictos"));
app.use("/materials", express.static("materials"));

/* =========================
   CONFIG
========================= */

const VALID_MATERIALS = [
  "acier",
  "blanc",
  "cuivre",
  "gris",
  "noirB",
  "noirM",
  "noyer",
  "or",
  "rose"
];

const THICKNESS_RULES = {
  "1.6": ["acier", "blanc", "cuivre", "gris", "noirB", "noirM", "noyer", "or", "rose"],
  "3.2": ["acier", "blanc", "cuivre", "or", "noirM"]
};

const WHITE_ON = ["noirM", "noirB", "noyer", "rose", "gris"];

function textColor(material) {
  return WHITE_ON.includes(material) ? "#ffffff" : "#000000";
}

/* =========================
   UTILS
========================= */

function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeXml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function mmToPx(mm, dpi = 600) {
  return Math.round((mm / 25.4) * dpi);
}

function getRealPxSize(dimension) {
  const [wMm, hMm] = dimension.split("x").map(Number);
  return {
    width: mmToPx(wMm, 600),
    height: mmToPx(hMm, 600)
  };
}

/* =========================
   DATA
========================= */

function loadCreations() {
  return JSON.parse(fs.readFileSync(creationsFile, "utf8"));
}

function saveCreations(data) {
  fs.writeFileSync(creationsFile, JSON.stringify(data, null, 2));
}

function addCreation(data) {
  const creations = loadCreations();
  creations.unshift(data);
  saveCreations(creations);
}

function getCreation(id) {
  return loadCreations().find((c) => c.id === id);
}

/* =========================
   FICHIERS
========================= */

function fileToDataUri(filePath) {
  const file = fs.readFileSync(filePath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

function getMaterialDataUri(material) {
  const filePath = path.join(materialsDir, `${material}.jpg`);
  if (!fs.existsSync(filePath)) throw new Error("matière introuvable");
  return fileToDataUri(filePath);
}

/* =========================
   PICTOS
========================= */

async function generatePicto(name) {
  const key = slugify(name);
  const filePath = path.join(pictoDir, `${key}.png`);

  if (fs.existsSync(filePath)) return filePath;

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: `black icon engraving style transparent background ${name}`,
    size: "1024x1024",
    background: "transparent"
  });

  fs.writeFileSync(filePath, Buffer.from(response.data[0].b64_json, "base64"));
  return filePath;
}

async function resolvePicto(name) {
  if (!name) return "";
  return await generatePicto(name);
}

/* =========================
   IA TEXTE
========================= */

async function parsePrompt(prompt) {
  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Retourne JSON {line1,line2,line3,icon_left,icon_right}`
      },
      { role: "user", content: prompt }
    ]
  });

  return JSON.parse(res.choices[0].message.content);
}

/* =========================
   LAYOUT UNIQUE
========================= */

function computeLayout(W, H, hasLeft, hasRight) {
  const iconW = W * 0.25;
  const iconH = H * 0.9;

  let textStart = 0;
  let textEnd = W;

  if (hasLeft && hasRight) {
    textStart = W * 0.25;
    textEnd = W * 0.75;
  } else if (hasRight) {
    textEnd = W * 0.75;
  } else if (hasLeft) {
    textStart = W * 0.25;
  }

  return {
    iconW,
    iconH,
    textCenter: (textStart + textEnd) / 2
  };
}

/* =========================
   BUILD SVG
========================= */

function buildSvg({
  W,
  H,
  materialData,
  transparent,
  line1,
  line2,
  line3,
  iconLeftData,
  iconRightData,
  color
}) {
  const lines = [line1, line2, line3].filter(Boolean);
  const layout = computeLayout(W, H, !!iconLeftData, !!iconRightData);

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${
    transparent
      ? ""
      : `<image href="${materialData}" width="${W}" height="${H}" />`
  }

  ${
    iconLeftData
      ? `<image href="${iconLeftData}" x="0" y="0" width="${layout.iconW}" height="${layout.iconH}" />`
      : ""
  }

  ${
    iconRightData
      ? `<image href="${iconRightData}" x="${W - layout.iconW}" y="0" width="${layout.iconW}" height="${layout.iconH}" />`
      : ""
  }

  ${lines
    .map(
      (l, i) => `
    <text x="${layout.textCenter}" y="${H / 2 + i * 60}" 
      font-size="60" text-anchor="middle" fill="${color}">
      ${escapeXml(l)}
    </text>`
    )
    .join("")}
</svg>
`;
}

async function svgToPng(svg, output, dpi = 600) {
  await sharp(Buffer.from(svg), { density: dpi })
    .png()
    .toFile(output);
}

/* =========================
   ROUTE PRINCIPALE
========================= */

app.post("/compose", async (req, res) => {
  try {
    const {
      prompt,
      material,
      dimension,
      thickness,
      line1,
      line2,
      line3
    } = req.body;

    if (!VALID_MATERIALS.includes(material)) {
      return res.status(400).json({ error: "matériau invalide" });
    }

    if (!THICKNESS_RULES[thickness]?.includes(material)) {
      return res.status(400).json({ error: "épaisseur incompatible" });
    }

    let parsed = await parsePrompt(prompt);

    if (line1 || line2 || line3) {
      parsed.line1 = line1 || "";
      parsed.line2 = line2 || "";
      parsed.line3 = line3 || "";
    }

    const iconLeft = await resolvePicto(parsed.icon_left);
    const iconRight = await resolvePicto(parsed.icon_right);

    const iconLeftData = iconLeft ? fileToDataUri(iconLeft) : "";
    const iconRightData = iconRight ? fileToDataUri(iconRight) : "";

    const PREVIEW_W = 1200;
    const PREVIEW_H = 300;

    const real = getRealPxSize(dimension);

    const previewSvg = buildSvg({
      W: PREVIEW_W,
      H: PREVIEW_H,
      materialData: getMaterialDataUri(material),
      transparent: false,
      line1: parsed.line1,
      line2: parsed.line2,
      line3: parsed.line3,
      iconLeftData,
      iconRightData,
      color: textColor(material)
    });

    const productionSvg = buildSvg({
      W: real.width,
      H: real.height,
      materialData: "",
      transparent: true,
      line1: parsed.line1,
      line2: parsed.line2,
      line3: parsed.line3,
      iconLeftData,
      iconRightData,
      color: "#000"
    });

    const id = `job-${Date.now()}`;

    const previewPath = `${previewDir}/${id}.png`;
    const productionPath = `${productionDir}/${id}.png`;

    await svgToPng(previewSvg, previewPath, 300);
    await svgToPng(productionSvg, productionPath, 600);

    const creation = {
      id,
      preview: "/" + previewPath,
      production: "/" + productionPath,
      ...parsed
    };

    addCreation(creation);

    res.json({
      previewUrl: creation.preview,
      productionUrl: creation.production,
      creationId: id
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "server error" });
  }
});

app.listen(PORT, () => {
  console.log("OK serveur lancé");
});