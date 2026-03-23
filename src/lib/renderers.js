import path from "path";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { ensureDir, fileUrl } from "./storage.js";
import { getLogoBufferById } from "./logoLibrary.js";

ensureDir(config.paths.previews);
ensureDir(config.paths.production);

const COLOR_MAP = {
  noir: { background: "#111111", foreground: "#f5f5f5" },
  blanc: { background: "#fafafa", foreground: "#111111" },
  argent: { background: "#d8d8d8", foreground: "#111111" },
  or: { background: "#c7a34c", foreground: "#111111" },
  cuivre: { background: "#b76e4a", foreground: "#111111" },
  champagne: { background: "#d7c3a1", foreground: "#111111" },
  laiton: { background: "#b8963f", foreground: "#111111" },
  anthracite: { background: "#3a3a3a", foreground: "#f5f5f5" },
  bleu: { background: "#204a73", foreground: "#f5f5f5" }
};

const DIMENSION_MAP = {
  "100x25": { widthPx: 1181, heightPx: 295 },
  "150x50": { widthPx: 1772, heightPx: 591 },
  "200x50": { widthPx: 2362, heightPx: 591 },
  "300x80": { widthPx: 3543, heightPx: 945 }
};

function svgText({ width, height, lines, fontFamily, sizes, fill }) {
  const lineYs = [0.34, 0.58, 0.8].map((ratio) => Math.round(height * ratio));
  const safe = lines.map((line) => escapeXml(line || ""));
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="transparent"/>
      <text x="50%" y="${lineYs[0]}" fill="${fill}" font-family="${fontFamily}" font-size="${sizes.line1}" text-anchor="middle" dominant-baseline="middle">${safe[0]}</text>
      <text x="50%" y="${lineYs[1]}" fill="${fill}" font-family="${fontFamily}" font-size="${sizes.line2}" text-anchor="middle" dominant-baseline="middle">${safe[1]}</text>
      <text x="50%" y="${lineYs[2]}" fill="${fill}" font-family="${fontFamily}" font-size="${sizes.line3}" text-anchor="middle" dominant-baseline="middle">${safe[2]}</text>
    </svg>
  `);
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function prepareLogo(inputBuffer, targetHeight, fillColor) {
  const meta = await sharp(inputBuffer).metadata();
  const aspect = (meta.width || 1) / (meta.height || 1);
  const width = Math.max(1, Math.round(targetHeight * aspect));
  return sharp(inputBuffer)
    .resize({ width, height: targetHeight, fit: "contain" })
    .tint(fillColor)
    .png()
    .toBuffer();
}

function getCanvasSize(dimension) {
  return DIMENSION_MAP[dimension] || DIMENSION_MAP["100x25"];
}

export async function renderPreviewSet(payload) {
  const colors = payload.colors || Object.keys(COLOR_MAP);
  const out = [];
  for (const colorKey of colors) {
    out.push(await renderSinglePreview({ ...payload, color: colorKey }));
  }
  return out;
}

export async function renderSinglePreview(payload) {
  const { dimension = "100x25", color = "noir" } = payload;
  const { widthPx, heightPx } = getCanvasSize(dimension);
  const palette = COLOR_MAP[color] || COLOR_MAP.noir;

  const canvas = sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 4,
      background: palette.background
    }
  });

  const composites = [];
  const textSizes = scaleTextSizes(payload.textSizes || {}, heightPx);
  composites.push({
    input: svgText({
      width: widthPx,
      height: heightPx,
      lines: [payload.line1, payload.line2, payload.line3],
      fontFamily: payload.fontFamily || "Arial, sans-serif",
      sizes: textSizes,
      fill: palette.foreground
    }),
    top: 0,
    left: 0
  });

  const logos = await logoComposites({
    widthPx,
    heightPx,
    leftLogoId: payload.leftLogoId,
    rightLogoId: payload.rightLogoId,
    leftScale: payload.leftLogoScale || 1,
    rightScale: payload.rightLogoScale || 1,
    fillColor: palette.foreground
  });

  composites.push(...logos);

  const output = await canvas.composite(composites).png().toBuffer();
  const fileName = `preview_${nanoid(10)}_${color}.png`;
  const filePath = path.join(config.paths.previews, fileName);
  await sharp(output).png().toFile(filePath);

  return {
    color,
    fileName,
    filePath,
    url: fileUrl(config.appBaseUrl, filePath, config.paths.generated)
  };
}

export async function renderProductionFile(payload) {
  const { dimension = "100x25" } = payload;
  const { widthPx, heightPx } = getCanvasSize(dimension);

  const canvas = sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const composites = [];
  const textSizes = scaleTextSizes(payload.textSizes || {}, heightPx);
  composites.push({
    input: svgText({
      width: widthPx,
      height: heightPx,
      lines: [payload.line1, payload.line2, payload.line3],
      fontFamily: payload.fontFamily || "Arial, sans-serif",
      sizes: textSizes,
      fill: "#000000"
    }),
    top: 0,
    left: 0
  });

  const logos = await logoComposites({
    widthPx,
    heightPx,
    leftLogoId: payload.leftLogoId,
    rightLogoId: payload.rightLogoId,
    leftScale: payload.leftLogoScale || 1,
    rightScale: payload.rightLogoScale || 1,
    fillColor: "#000000"
  });
  composites.push(...logos);

  const fileName = `production_${nanoid(10)}.png`;
  const filePath = path.join(config.paths.production, fileName);
  await canvas.composite(composites).png().toFile(filePath);

  return {
    fileName,
    filePath,
    url: fileUrl(config.appBaseUrl, filePath, config.paths.generated)
  };
}

async function logoComposites({ widthPx, heightPx, leftLogoId, rightLogoId, leftScale, rightScale, fillColor }) {
  const list = [];
  const baseHeight = Math.round(heightPx * 0.44);

  if (leftLogoId) {
    const buffer = getLogoBufferById(leftLogoId);
    if (buffer) {
      const resized = await prepareLogo(buffer, Math.round(baseHeight * leftScale), fillColor);
      const meta = await sharp(resized).metadata();
      list.push({
        input: resized,
        left: Math.round(widthPx * 0.03),
        top: Math.round((heightPx - (meta.height || 0)) / 2)
      });
    }
  }

  if (rightLogoId) {
    const buffer = getLogoBufferById(rightLogoId);
    if (buffer) {
      const resized = await prepareLogo(buffer, Math.round(baseHeight * rightScale), fillColor);
      const meta = await sharp(resized).metadata();
      list.push({
        input: resized,
        left: Math.round(widthPx - (meta.width || 0) - widthPx * 0.03),
        top: Math.round((heightPx - (meta.height || 0)) / 2)
      });
    }
  }

  return list;
}

function scaleTextSizes(rawSizes, heightPx) {
  const factor = heightPx / 295;
  return {
    line1: Math.max(14, Math.round((rawSizes.line1 || 32) * factor)),
    line2: Math.max(12, Math.round((rawSizes.line2 || 22) * factor)),
    line3: Math.max(10, Math.round((rawSizes.line3 || 18) * factor))
  };
}
