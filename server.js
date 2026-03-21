import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";

if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

app.use("/generated", express.static(GENERATED_DIR));

const WIDTH = 1600;
const HEIGHT = 400;

const LEFT_ZONE = WIDTH * 0.25;
const RIGHT_ZONE = WIDTH * 0.25;

async function generateLogo(icon, color) {
  if (!icon) return null;

  const result = await openai.images.generate({
    model: "gpt-image-1",
    size: "1024x1024",
    prompt: `
clean engraved icon
transparent background
no text
no frame
simple vector style
icon: ${icon}
color: ${color}
`
  });

  const buffer = Buffer.from(result.data[0].b64_json, "base64");

  return sharp(buffer)
    .resize(300, 300, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

app.post("/generate-production", async (req, res) => {
  try {
    const {
      leftIcon,
      rightIcon,
      engravingColor = "black"
    } = req.body;

    const composites = [];

    const leftLogo = await generateLogo(leftIcon, engravingColor);
    const rightLogo = await generateLogo(rightIcon, engravingColor);

    if (leftLogo) {
      composites.push({
        input: leftLogo,
        left: 100,
        top: 50
      });
    }

    if (rightLogo) {
      composites.push({
        input: rightLogo,
        left: WIDTH - 350,
        top: 50
      });
    }

    const canvas = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png()
      .toBuffer();

    const filename = `${Date.now()}.png`;
    const filepath = path.join(GENERATED_DIR, filename);

    await fs.promises.writeFile(filepath, canvas);

    res.json({
      url: `/generated/${filename}`
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "production error" });
  }
});

app.post("/upload-preview", async (req, res) => {
  const { image } = req.body;

  const buffer = Buffer.from(image.split(",")[1], "base64");

  const filename = `${Date.now()}-preview.png`;
  const filepath = path.join(GENERATED_DIR, filename);

  await fs.promises.writeFile(filepath, buffer);

  res.json({
    url: `/generated/${filename}`
  });
});

app.listen(3000, () => console.log("Server OK"));
