import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { config } from "../config.js";
import { ensureDir, ensureJsonFile, readJson, writeJson, fileUrl } from "./storage.js";

ensureJsonFile(config.paths.logoLibrary, { logos: [] });
ensureDir(config.paths.logosPng);
ensureDir(config.paths.logosWebp);

function loadLibrary() {
  return readJson(config.paths.logoLibrary, { logos: [] }) || { logos: [] };
}

function saveLibrary(library) {
  writeJson(config.paths.logoLibrary, library);
}

function rankLogo(a, b) {
  return (b.usageCount || 0) - (a.usageCount || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function findReusableLogos(keywordMain, limit = 3) {
  const library = loadLibrary();
  return library.logos
    .filter((logo) => logo.validated && logo.usableForGraving && (logo.keywordMain === keywordMain || (logo.keywordsSecondary || []).includes(keywordMain)))
    .sort(rankLogo)
    .slice(0, limit)
    .map((logo) => withPublicUrls(logo));
}

export async function storeGeneratedLogo({
  keywordMain,
  keywordsSecondary = [],
  promptOriginal,
  promptNormalized,
  style,
  pngBuffer,
  source = "generated"
}) {
  const id = `logo_${nanoid(10)}`;
  const pngPath = path.join(config.paths.logosPng, `${id}.png`);
  const webpPath = path.join(config.paths.logosWebp, `${id}.webp`);

  await sharp(pngBuffer).png().toFile(pngPath);
  await sharp(pngBuffer).webp({ quality: 90 }).toFile(webpPath);

  const library = loadLibrary();
  const record = {
    id,
    keywordMain,
    keywordsSecondary,
    promptOriginal,
    promptNormalized,
    style,
    imagePathPng: pngPath,
    imagePathWebp: webpPath,
    validated: true,
    usableForGraving: true,
    usageCount: 0,
    background: "transparent",
    colorMode: "black",
    createdAt: new Date().toISOString(),
    source
  };

  library.logos.push(record);
  saveLibrary(library);

  return withPublicUrls(record);
}

export function incrementLogoUsage(logoIds = []) {
  const library = loadLibrary();
  const idSet = new Set(logoIds);
  let changed = false;

  library.logos = library.logos.map((logo) => {
    if (!idSet.has(logo.id)) return logo;
    changed = true;
    return { ...logo, usageCount: (logo.usageCount || 0) + 1 };
  });

  if (changed) saveLibrary(library);
}

export function getLogoById(id) {
  const library = loadLibrary();
  const logo = library.logos.find((item) => item.id === id);
  return logo ? withPublicUrls(logo) : null;
}

function withPublicUrls(logo) {
  return {
    ...logo,
    imageUrlPng: fileUrl(config.appBaseUrl, logo.imagePathPng, config.paths.generated),
    imageUrlWebp: fileUrl(config.appBaseUrl, logo.imagePathWebp, config.paths.generated)
  };
}

export function getLogoBufferById(id) {
  const library = loadLibrary();
  const logo = library.logos.find((item) => item.id === id);
  if (!logo) return null;
  if (!fs.existsSync(logo.imagePathPng)) return null;
  return fs.readFileSync(logo.imagePathPng);
}
