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

const allowedOrigins = [
  "https://www.plaquesagraver.fr",
  "https://plaquesagraver.fr",
  "https://simulateur-pag.up.railway.app"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const generatedDir = path.join(__dirname, "..", "generated");
const logosDir = path.join(generatedDir, "logos");
const productionDir = path.join(generatedDir, "production");

fs.mkdirSync(logosDir, { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });

app.use("/generated", express.static(generatedDir));

function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function slugify(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function getCanvasSize(dimension) {
  const map = {
    "100x25mm": { width: 1181, height: 295 },
    "150x37mm": { width: 1772, height: 437 },
    "200x50mm": { width: 2362, height: 591 }
  };
  return map[dimension] || map["100x25mm"];
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function fitLogo(buffer, width, height) {
  return sharp(buffer)
    .resize(width, height, { fit: "contain" })
    .png()
    .toBuffer();
}

async function buildProductionComposite({
  dimension,
  color,
  line1,
  line2,
  leftLogoUrl,
  rightLogoUrl
}) {
  const { width, height } = getCanvasSize(dimension);

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const composites = [];

  if (leftLogoUrl) {
    const buf = await fetchImageBuffer(leftLogoUrl);
    const logo = await fitLogo(buf, width * 0.25, height);
    composites.push({ input: logo, left: 0, top: 0 });
  }

  if (rightLogoUrl) {
    const buf = await fetchImageBuffer(rightLogoUrl);
    const logo = await fitLogo(buf, width * 0.25, height);
    composites.push({ input: logo, left: width * 0.75, top: 0 });
  }

  const svg = Buffer.from(`
    <svg width="${width}" height="${height}">
      <text x="50%" y="40%" text-anchor="middle" font-size="120" fill="black">VOTRE TEXTE</text>
      <text x="50%" y="70%" text-anchor="middle" font-size="80" fill="black">ICI</text>
    </svg>
  `);

  composites.push({ input: svg, left: 0, top: 0 });

  return base.composite(composites).png().toBuffer();
}

app.post("/api/logos/search-or-generate", async (req, res) => {
  try {
    const { prompt, count = 2 } = req.body;

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `pictogramme noir gravure laser ${prompt}`,
      size: "1024x1024",
      background: "transparent",
      n: count
    });

    const baseUrl = getBaseUrl(req);

    const logos = [];

    for (let i = 0; i < result.data.length; i++) {
      const fileName = `${Date.now()}-${i}.png`;
      const filePath = path.join(logosDir, fileName);

      fs.writeFileSync(filePath, Buffer.from(result.data[i].b64_json, "base64"));

      logos.push({
        url: `${baseUrl}/generated/logos/${fileName}`
      });
    }

    res.json({ logos });

  } catch (error) {
    console.error(error);

    if (error.message.includes("rate limit")) {
      return res.status(429).json({
        code: "RATE_LIMIT",
        error: "Merci de patienter quelques secondes avant une nouvelle génération."
      });
    }

    return res.status(500).json({
      error: "Erreur génération image"
    });
  }
});

app.get("/api/gallery/random", async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);

    const files = fs.readdirSync(logosDir).filter(f => f.endsWith(".png"));

    if (!files.length) {
      return res.json({ items: [] });
    }

    const getRandom = () => files[Math.floor(Math.random() * files.length)];

    const items = [];

    for (let i = 0; i < 6; i++) {
      try {
        const left = getRandom();
        const right = Math.random() > 0.5 ? getRandom() : null;

        const leftUrl = `${baseUrl}/generated/logos/${left}`;
        const rightUrl = right ? `${baseUrl}/generated/logos/${right}` : null;

        const buffer = await buildProductionComposite({
          dimension: "150x37mm",
          color: "blanc",
          line1: "VOTRE TEXTE",
          line2: "ICI",
          leftLogoUrl: leftUrl,
          rightLogoUrl: rightUrl
        });

        const fileName = `gallery-${Date.now()}-${i}.png`;
        const filePath = path.join(productionDir, fileName);

        fs.writeFileSync(filePath, buffer);

        items.push({
          preview: `${baseUrl}/generated/production/${fileName}`,
          leftLogo: leftUrl,
          rightLogo: rightUrl
        });

      } catch (e) {
        console.error("item error", e);
      }
    }

    res.json({ items });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "gallery error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
