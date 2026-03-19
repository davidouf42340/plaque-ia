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

// IMPORTANT
app.options("*", cors());

// IMPORTANT
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const previewDir = "generated/previews";
const productionDir = "generated/production";
const pictoDir = "generated/pictos";
const creationsFile = "creations.json";

for (const dir of ["generated", previewDir, productionDir, pictoDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(creationsFile)) fs.writeFileSync(creationsFile, "[]");

app.use("/generated", express.static("generated"));

const VALID_MATERIALS = ["acier", "blanc", "cuivre", "gris", "noirB", "noirM", "noyer", "or", "rose"];
const THICKNESS_RULES = {
  "1.6": ["acier", "blanc", "cuivre", "gris", "noirB", "noirM", "noyer", "or", "rose"],
  "3.2": ["acier", "blanc", "cuivre", "or", "noirM"]
};
const WHITE_ON = ["noirM", "noirB", "noyer", "rose", "gris"];

function textColor(material) {
  return WHITE_ON.includes(material) ? "#ffffff" : "#000000";
}

function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeXml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function mmToPx(mm, dpi = 600) {
  return Math.round((mm / 25.4) * dpi);
}

function getRealPxSize(dimension) {
  const [wMm, hMm] = String(dimension).split("x").map(Number);
  return {
    width: mmToPx(wMm || 200, 600),
    height: mmToPx(hMm || 50, 600)
  };
}

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
  return loadCreations().find((c) => c.id === id) || null;
}

function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : "application/octet-stream";

  const file = fs.readFileSync(filePath);
  return `data:${mime};base64,${file.toString("base64")}`;
}

async function generatePicto(name) {
  const key = slugify(name || "picto");
  const filePath = path.join(pictoDir, `${key}.png`);

  if (fs.existsSync(filePath)) return filePath;

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: `simple black engraving-style icon, transparent background, no text, no brand, ${name}`,
    size: "1024x1024",
    background: "transparent"
  });

  const base64 = response.data[0].b64_json;
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

async function parsePrompt(prompt = "") {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Retourne uniquement ce JSON:
{
  "line1":"",
  "line2":"",
  "line3":"",
  "icon_left":"",
  "icon_right":""
}
Règles:
- 3 lignes max
- si un seul pictogramme sans précision, mets-le à droite
- si gauche demandé, mets à gauche
- si droite demandé, mets à droite`
        },
        { role: "user", content: prompt }
      ]
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return {
      line1: parsed.line1 || "",
      line2: parsed.line2 || "",
      line3: parsed.line3 || "",
      icon_left: parsed.icon_left || "",
      icon_right: parsed.icon_right || ""
    };
  } catch {
    const parts = String(prompt).split(",").map((s) => s.trim());
    return {
      line1: parts[0] || "",
      line2: parts[1] || "",
      line3: parts[2] || "",
      icon_left: "",
      icon_right: ""
    };
  }
}

function fontFamilyFromStyle(fontStyle = "design") {
  const map = {
    design: "Arial, sans-serif",
    modern: "Helvetica, Arial, sans-serif",
    script: "Georgia, serif",
    handwriting: "Georgia, serif",
    classic: "Times New Roman, serif",
    elegant: "Times New Roman, serif",
    impact: "Arial Black, Arial, sans-serif"
  };
  return map[fontStyle] || map.design;
}

function buildFrame(frameStyle, W, H, stroke) {
  if (!frameStyle || frameStyle === "none") return "";

  if (frameStyle === "simple") {
    return `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  }

  if (frameStyle === "double") {
    return `
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${stroke}" stroke-width="2"/>
      <rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${stroke}" stroke-width="1.5"/>
    `;
  }

  if (frameStyle === "vintage") {
    return `
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${stroke}" stroke-width="2"/>
      <path d="M30 20 H140 M${W - 140} 20 H${W - 30} M30 ${H - 20} H140 M${W - 140} ${H - 20} H${W - 30}" stroke="${stroke}" stroke-width="2" fill="none"/>
    `;
  }

  return "";
}

function buildOrnament(ornamentStyle, W, H, stroke) {
  if (!ornamentStyle || ornamentStyle === "none") return "";

  if (ornamentStyle === "line") {
    return `
      <line x1="${W * 0.2}" y1="${H * 0.1}" x2="${W * 0.8}" y2="${H * 0.1}" stroke="${stroke}" stroke-width="2"/>
      <line x1="${W * 0.2}" y1="${H * 0.9}" x2="${W * 0.8}" y2="${H * 0.9}" stroke="${stroke}" stroke-width="2"/>
    `;
  }

  if (ornamentStyle === "stars") {
    return `
      <text x="${W * 0.5}" y="${H * 0.12}" text-anchor="middle" font-size="20" fill="${stroke}">✦ ✦ ✦</text>
      <text x="${W * 0.5}" y="${H * 0.95}" text-anchor="middle" font-size="20" fill="${stroke}">✦ ✦ ✦</text>
    `;
  }

  if (ornamentStyle === "flourish") {
    return `
      <path d="M${W * 0.35} ${H * 0.1} C${W * 0.42} ${H * 0.02}, ${W * 0.58} ${H * 0.02}, ${W * 0.65} ${H * 0.1}" stroke="${stroke}" stroke-width="2" fill="none"/>
      <path d="M${W * 0.35} ${H * 0.9} C${W * 0.42} ${H * 0.98}, ${W * 0.58} ${H * 0.98}, ${W * 0.65} ${H * 0.9}" stroke="${stroke}" stroke-width="2" fill="none"/>
    `;
  }

  return "";
}

function computeLayout({ W, H, lines, hasLeft, hasRight, frameStyle }) {
  const marginX = Math.round(W * 0.008);
  const usableW = W - marginX * 2;

  const iconCount = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
  const hasFrame = frameStyle && frameStyle !== "none";
  const frameInset = hasFrame ? Math.round(W * 0.013) : 0;

  const iconZoneW = Math.round(usableW * 0.25) - frameInset;
  const iconH = Math.round(H * (hasFrame ? 0.88 : 0.95));
  const iconY = Math.round((H - iconH) / 2);

  const leftIconX = hasFrame ? Math.round(W * 0.008) : 0;
  const rightIconX = hasFrame ? W - iconZoneW - Math.round(W * 0.008) : W - iconZoneW;

  let textStart = marginX;
  let textEnd = W - marginX;

  if (iconCount === 1 && hasRight) {
    textStart = Math.round(W * 0.015);
    textEnd = Math.round(W * 0.75) - Math.round(W * 0.008);
  }

  if (iconCount === 1 && hasLeft) {
    textStart = Math.round(W * 0.25) + Math.round(W * 0.008);
    textEnd = W - Math.round(W * 0.015);
  }

  if (iconCount === 2) {
    textStart = Math.round(W * 0.25) + Math.round(W * 0.008);
    textEnd = Math.round(W * 0.75) - Math.round(W * 0.008);
  }

  const textCenter = (textStart + textEnd) / 2;
  const textWidth = textEnd - textStart;
  const longest = Math.max(...lines.map((l) => l.length), 1);

  let fontSize = Math.round(H * 0.24);

  if (iconCount === 2) {
    fontSize = Math.round(H * 0.21);
    if (longest > 16) fontSize = Math.round(H * 0.18);
    if (longest > 22) fontSize = Math.round(H * 0.145);
    if (longest > 28) fontSize = Math.round(H * 0.12);
  } else if (iconCount === 1) {
    fontSize = Math.round(H * 0.23);
    if (longest > 20) fontSize = Math.round(H * 0.20);
    if (longest > 28) fontSize = Math.round(H * 0.165);
    if (longest > 36) fontSize = Math.round(H * 0.14);
  } else {
    fontSize = Math.round(H * 0.245);
    if (longest > 24) fontSize = Math.round(H * 0.21);
    if (longest > 34) fontSize = Math.round(H * 0.18);
    if (longest > 42) fontSize = Math.round(H * 0.153);
  }

  if (textWidth < W * 0.35) fontSize = Math.min(fontSize, Math.round(H * 0.13));
  if (textWidth < W * 0.27) fontSize = Math.min(fontSize, Math.round(H * 0.105));

  const yMap = {
    1: [Math.round(H * 0.566)],
    2: [Math.round(H * 0.416), Math.round(H * 0.733)],
    3: [Math.round(H * 0.293), Math.round(H * 0.566), Math.round(H * 0.84)]
  };

  return {
    iconZoneW,
    iconH,
    iconY,
    leftIconX,
    rightIconX,
    textCenter,
    fontSize,
    ys: yMap[lines.length] || [Math.round(H * 0.566)]
  };
}

function buildSvg({
  W,
  H,
  transparentBackground = false,
  line1 = "",
  line2 = "",
  line3 = "",
  iconLeftData = "",
  iconRightData = "",
  foregroundColor = "#000000",
  fontStyle = "design",
  frameStyle = "none",
  ornamentStyle = "none"
}) {
  const lines = [line1, line2, line3].filter(Boolean);
  const layout = computeLayout({
    W,
    H,
    lines,
    hasLeft: !!iconLeftData,
    hasRight: !!iconRightData,
    frameStyle
  });

  const fontFamily = fontFamilyFromStyle(fontStyle);
  const iconFilter = foregroundColor === "#ffffff" ? 'filter="url(#makeWhite)"' : "";

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="makeWhite" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="
        0 0 0 0 1
        0 0 0 0 1
        0 0 0 0 1
        0 0 0 1 0
      "/>
    </filter>
  </defs>

  ${transparentBackground ? "" : `<rect width="${W}" height="${H}" fill="#ffffff"/>`}

  ${buildFrame(frameStyle, W, H, foregroundColor)}
  ${buildOrnament(ornamentStyle, W, H, foregroundColor)}

  ${
    iconLeftData
      ? `<image href="${iconLeftData}" x="${layout.leftIconX}" y="${layout.iconY}" width="${layout.iconZoneW}" height="${layout.iconH}" preserveAspectRatio="xMidYMid meet" ${iconFilter}/>`
      : ""
  }

  ${
    iconRightData
      ? `<image href="${iconRightData}" x="${layout.rightIconX}" y="${layout.iconY}" width="${layout.iconZoneW}" height="${layout.iconH}" preserveAspectRatio="xMidYMid meet" ${iconFilter}/>`
      : ""
  }

  ${lines
    .map(
      (line, index) => `
    <text
      x="${layout.textCenter}"
      y="${layout.ys[index]}"
      font-size="${layout.fontSize}"
      text-anchor="middle"
      fill="${foregroundColor}"
      font-family="${fontFamily}"
      font-weight="700"
    >${escapeXml(line)}</text>`
    )
    .join("")}
</svg>
`;
}

async function svgToPng(svgString, outputPath, density = 300) {
  await sharp(Buffer.from(svgString), { density })
    .png({
      compressionLevel: 9,
      quality: 100
    })
    .toFile(outputPath);
}

app.get("/", (req, res) => {
  res.send("Serveur IA Plaques OK 🚀");
});

app.get("/creation/:id", (req, res) => {
  const creation = getCreation(req.params.id);
  if (!creation) return res.status(404).json({ error: "Création introuvable" });
  res.json(creation);
});

app.post("/compose", async (req, res) => {
  try {
    console.log("BODY REÇU :", req.body);

    const {
      prompt = "",
      material = "acier",
      dimension = "200x50",
      thickness = "1.6",
      line1 = "",
      line2 = "",
      line3 = "",
      fontStyle = "design",
      frameStyle = "none",
      ornamentStyle = "none",
      templateId = ""
    } = req.body;

    if (!VALID_MATERIALS.includes(material)) {
      return res.status(400).json({ error: "Matériau invalide" });
    }

    if (!THICKNESS_RULES[thickness]?.includes(material)) {
      return res.status(400).json({ error: "Combinaison couleur / épaisseur invalide" });
    }

    let parsed = await parsePrompt(prompt);

    if (templateId) {
      const tpl = getCreation(templateId);
      if (tpl) {
        parsed.icon_left = tpl.icon_left || "";
        parsed.icon_right = tpl.icon_right || "";
      }
    }

    if (line1 || line2 || line3) {
      parsed = {
        ...parsed,
        line1: line1 || "",
        line2: line2 || "",
        line3: line3 || ""
      };
    }

    let iconLeftPath = "";
    let iconRightPath = "";

    if (parsed.icon_left) {
      iconLeftPath = await generatePicto(parsed.icon_left);
    }

    if (parsed.icon_right) {
      iconRightPath = await generatePicto(parsed.icon_right);
    }

    const iconLeftData = iconLeftPath ? fileToDataUri(iconLeftPath) : "";
    const iconRightData = iconRightPath ? fileToDataUri(iconRightPath) : "";

    const PREVIEW_W = 1200;
    const PREVIEW_H = 300;

    const realSize = getRealPxSize(dimension);
    const PROD_W = realSize.width;
    const PROD_H = realSize.height;

    const previewSvg = buildSvg({
      W: PREVIEW_W,
      H: PREVIEW_H,
      transparentBackground: false,
      line1: parsed.line1,
      line2: parsed.line2,
      line3: parsed.line3,
      iconLeftData,
      iconRightData,
      foregroundColor: textColor(material),
      fontStyle,
      frameStyle,
      ornamentStyle
    });

    const productionSvg = buildSvg({
      W: PROD_W,
      H: PROD_H,
      transparentBackground: true,
      line1: parsed.line1,
      line2: parsed.line2,
      line3: parsed.line3,
      iconLeftData,
      iconRightData,
      foregroundColor: "#000000",
      fontStyle,
      frameStyle,
      ornamentStyle
    });

    const jobId = `job-${Date.now()}`;
    const previewName = `${jobId}-preview.png`;
    const productionName = `${jobId}-production.png`;

    const previewPath = path.join(previewDir, previewName);
    const productionPath = path.join(productionDir, productionName);

    await svgToPng(previewSvg, previewPath, 300);
    await svgToPng(productionSvg, productionPath, 600);

    const creation = {
      id: jobId,
      preview: `/generated/previews/${previewName}`,
      production: `/generated/production/${productionName}`,
      prompt,
      material,
      dimension,
      thickness,
      line1: parsed.line1,
      line2: parsed.line2,
      line3: parsed.line3,
      icon_left: parsed.icon_left,
      icon_right: parsed.icon_right,
      fontStyle,
      frameStyle,
      ornamentStyle,
      createdAt: new Date().toISOString(),
      status: "preview_only"
    };

    addCreation(creation);

    res.json({
      preview: creation.preview,
      production: creation.production,
      line1: creation.line1,
      line2: creation.line2,
      line3: creation.line3,
      creationId: creation.id
    });
  } catch (err) {
    console.error("ERREUR SERVEUR :", err);

    res.status(500).json({
      error: err.message || "Erreur serveur",
      stack: err.stack || ""
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
