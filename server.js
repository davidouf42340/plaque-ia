import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";

if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR);
}

app.use("/generated", express.static(GENERATED_DIR));

app.post("/generate-plaque-base", async (req, res) => {
  try {
    const {
      plateColor,
      engravingColor,
      leftIcon,
      rightIcon
    } = req.body;

    console.log("REQ OK");

    const result = await openai.images.generate({
      model: "gpt-image-1",
      size: "1024x1024",
      prompt: "simple minimal icon left and right, empty center, transparent background"
    });

    const b64 = result.data[0].b64_json;
    const buffer = Buffer.from(b64, "base64");

    const fileName = Date.now() + ".png";
    const filePath = path.join(GENERATED_DIR, fileName);

    await sharp(buffer)
      .resize(1200, 300)
      .png()
      .toFile(filePath);

    res.json({
      url: "/generated/" + fileName
    });

  } catch (err) {
    console.error
