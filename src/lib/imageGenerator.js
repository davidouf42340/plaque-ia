import OpenAI from "openai";
import sharp from "sharp";
import { config } from "../config.js";

const client = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

function buildLogoPrompt(userPrompt) {
  return [
    "Create a clean monochrome pictogram for laser engraving on personalized plaques.",
    "Subject:",
    userPrompt,
    "Requirements: black artwork only, transparent background, centered subject, no text, bold simple silhouette, low detail, high contrast, ready for engraving, no shadow, no border, no frame."
  ].join(" ");
}

async function transparentPng(buffer) {
  return sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .threshold(180)
    .negate()
    .ensureAlpha()
    .png()
    .toBuffer();
}

export async function generateLogosWithOpenAi({ prompt, count = 1 }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY missing. Add it in .env before generating logos.");
  }

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: buildLogoPrompt(prompt),
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
    background: "transparent",
    n: count
  });

  const items = response.data || [];
  const buffers = [];
  for (const item of items) {
    if (!item.b64_json) continue;
    const pngBuffer = Buffer.from(item.b64_json, "base64");
    buffers.push(await transparentPng(pngBuffer));
  }

  return buffers;
}
