import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const generatedDir = path.join(__dirname, "..", "generated");
const logosDir = path.join(generatedDir, "logos");
const productionDir = path.join(generatedDir, "production");
const fontsDir = path.join(__dirname, "fonts");

fs.mkdirSync(logosDir, { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });

app.use("/generated", express.static(generatedDir));

function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`;
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeDimension(value = "") {
  return String(value).trim().toLowerCase().replaceAll(" ", "");
}

function normalizeThickness(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace("mm", "")
    .replace(",", ".")
    .trim();
}

function normalizeColor(value = "") {
  const v = String(value).trim().toLowerCase();
  const map = {
    "acier brossé": "acier-brosse",
    "acier-brosse": "acier-brosse",
    "acier": "acier-brosse",
    "or brossé": "or",
    "or": "or",
    "cuivre": "cuivre",
    "blanc": "blanc",
    "noir": "noir",
    "noir brillant": "noir-brillant",
    "noir-brillant": "noir-brillant",
    "gris": "gris",
    "noyer": "noyer",
    "rose": "rose"
  };
  return map[v] || v;
}

function hashString(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickGalleryIndex(prompt = "", items = []) {
  if (!Array.isArray(items) || !items.length) return 0;
  const seed = `${prompt}__${items.map((x) => x.fileBase || x.id || x.url || "").join("|")}`;
  return hashString(seed) % items.length;
}

async function saveCreationBatch({ prompt, category, creations = [] }) {
  const createdAt = new Date().toISOString();
  const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const galleryIndex = pickGalleryIndex(prompt, creations);

  const entries = creations.map((entry, index) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index + 1}`,
    group_id: groupId,
    created_at: createdAt,
    prompt,
    category,
    in_gallery: index === galleryIndex,
    image_url: entry.imageUrl,
    local_url: entry.localUrl || null,
    shopify_url: entry.shopifyUrl || null,
    shopify_file_id: entry.shopifyFileId || null
  }));

  const { data, error } = await supabase
    .from("gallery_items")
    .insert(entries)
    .select();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data || [];
}

async function getGalleryItems({ category = "tous", limit = 60 } = {}) {
  let query = supabase
    .from("gallery_items")
    .select("*")
    .eq("in_gallery", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category && category !== "tous") query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error("Impossible de charger la galerie");
  return data || [];
}

async function getAllGalleryItemsForCategories() {
  const { data, error } = await supabase
    .from("gallery_items")
    .select("category")
    .eq("in_gallery", true);

  if (error) throw new Error("Impossible de charger les catégories");
  return data || [];
}

async function getRandomGalleryItems(limit = 12) {
  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .eq("in_gallery", true)
    .limit(300);

  if (error) throw new Error("Impossible de charger la galerie aléatoire");

  const shuffled = [...(data || [])].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

const ALLOWED_THICKNESS_BY_COLOR = {
  "acier-brosse": ["1.6", "3.2"],
  "or": ["1.6", "3.2"],
  "cuivre": ["1.6", "3.2"],
  "blanc": ["1.6", "3.2"],
  "noir": ["1.6", "3.2"],
  "noir-brillant": ["1.6"],
  "gris": ["1.6"],
  "noyer": ["1.6"],
  "rose": ["1.6"]
};

const WHITE_ELEMENTS = ["noir", "noir-brillant", "gris", "noyer", "rose"];

const DIMENSION_MAP = {
  "100x25mm": { width: 1181, height: 295 },
  "150x37mm": { width: 1772, height: 437 },
  "200x50mm": { width: 2362, height: 591 },
  "250x87mm": { width: 2953, height: 1028 },
  "300x100mm": { width: 3543, height: 1181 },
  "100x25": { width: 1181, height: 295 },
  "150x37": { width: 1772, height: 437 },
  "200x50": { width: 2362, height: 591 },
  "250x87": { width: 2953, height: 1028 },
  "300x100": { width: 3543, height: 1181 }
};

function getCanvasSize(dimension = "100x25mm") {
  const key = normalizeDimension(dimension);
  return DIMENSION_MAP[key] || DIMENSION_MAP["100x25mm"];
}

const VARIANT_MAP = {
  "100x25mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180430151 },
      "or": { variantId: 53556221837639 },
      "cuivre": { variantId: 53556222165319 },
      "noir": { variantId: 53556222492999 },
      "blanc": { variantId: 53556222820679 },
      "noir-brillant": { variantId: 53556223148359 },
      "noyer": { variantId: 53556223476039 },
      "gris": { variantId: 53556223803719 },
      "rose": { variantId: 53556224131399 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183870791 },
      "or": { variantId: 53556221870407 },
      "cuivre": { variantId: 53556222198087 },
      "noir": { variantId: 53556222525767 },
      "blanc": { variantId: 53556222853447 }
    }
  },
  "150x37mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180462919 },
      "or": { variantId: 53556221903175 },
      "cuivre": { variantId: 53556222230855 },
      "noir": { variantId: 53556222558535 },
      "blanc": { variantId: 53556222886215 },
      "noir-brillant": { variantId: 53556223213895 },
      "noyer": { variantId: 53556223541575 },
      "gris": { variantId: 53556223869255 },
      "rose": { variantId: 53556224196935 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183903559 },
      "or": { variantId: 53556221935943 },
      "cuivre": { variantId: 53556222263623 },
      "noir": { variantId: 53556222591303 },
      "blanc": { variantId: 53556222918983 }
    }
  },
  "200x50mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180495687 },
      "or": { variantId: 53556221968711 },
      "cuivre": { variantId: 53556222296391 },
      "noir": { variantId: 53556222624071 },
      "blanc": { variantId: 53556222951751 },
      "noir-brillant": { variantId: 53556223279431 },
      "noyer": { variantId: 53556223607111 },
      "gris": { variantId: 53556223934791 },
      "rose": { variantId: 53556224262471 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183936327 },
      "or": { variantId: 53556222001479 },
      "cuivre": { variantId: 53556222329159 },
      "noir": { variantId: 53556222656839 },
      "blanc": { variantId: 53556222984519 }
    }
  },
  "250x87mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180528455 },
      "or": { variantId: 53556222034247 },
      "cuivre": { variantId: 53556222361927 },
      "noir": { variantId: 53556222689607 },
      "blanc": { variantId: 53556223017287 },
      "noir-brillant": { variantId: 53556223344967 },
      "noyer": { variantId: 53556223672647 },
      "gris": { variantId: 53556224000327 },
      "rose": { variantId: 53556224328007 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526183969095 },
      "or": { variantId: 53556222067015 },
      "cuivre": { variantId: 53556222394695 },
      "noir": { variantId: 53556222722375 },
      "blanc": { variantId: 53556223050055 }
    }
  },
  "300x100mm": {
    "1.6": {
      "acier-brosse": { variantId: 53526180561223 },
      "or": { variantId: 53556222099783 },
      "cuivre": { variantId: 53556222427463 },
      "noir": { variantId: 53556222755143 },
      "blanc": { variantId: 53556223082823 },
      "noir-brillant": { variantId: 53556223410503 },
      "noyer": { variantId: 53556223738183 },
      "gris": { variantId: 53556224065863 },
      "rose": { variantId: 53556224393543 }
    },
    "3.2": {
      "acier-brosse": { variantId: 53526184001863 },
      "or": { variantId: 53556222132551 },
      "cuivre": { variantId: 53556222460231 },
      "noir": { variantId: 53556222787911 },
      "blanc": { variantId: 53556223115591 }
    }
  }
};

const CATEGORY_RULES = [
  { key: "animaux", words: ["chien","chat","cheval","lion","tigre","lapin","oiseau","aigle","serpent","rottweiler","berger","bouledogue","caniche","animaux","animal","panda","poisson","requin","éléphant","elephant","tortue","papillon","coq","hibou"] },
  { key: "sport", words: ["football","foot","basket","tennis","rugby","golf","haltère","haltere","musculation","fitness","vélo","velo","cyclisme","boxe","judo","karaté","karate","natation","running","course","sport","ballon","raquette","crossfit","marathon"] },
  { key: "medical", words: ["pharmacie","pharmacien","dentiste","dentaire","stéthoscope","stethoscope","croix médicale","croix medicale","croix pharmacie","medecin","médecin","infirmier","infirmière","infirmiere","vétérinaire","veterinaire","santé","sante","seringue","hôpital","hopital","soin","paramedical","kiné","kine"] },
  { key: "beaute", words: ["coiffeur","coiffure","ciseaux","ongle","ongles","esthétique","esthetique","maquillage","makeup","beauty","beauté","beaute","barbier","barber","massage","spa","shampoing","brosse","salon"] },
  { key: "restauration", words: ["pizza","burger","café","cafe","restaurant","fourchette","cuillère","cuillere","couteau","boulangerie","pâtisserie","patisserie","croissant","pain","boisson","vin","cocktail","chef","cuisine","tasse"] },
  { key: "batiment", words: ["maçon","macon","bâtiment","batiment","maison","toit","marteau","clé anglaise","cle anglaise","plombier","électricien","electricien","outils","tournevis","perceuse","construction","artisan","travaux"] },
  { key: "nature", words: ["arbre","fleur","montagne","soleil","lune","forêt","foret","feuille","nature","paysage","nuage","étoile","etoile","rose","plante","rivière","riviere"] },
  { key: "symboles", words: ["logo","icone","icône","minimaliste","symbole","symbol","coeur","cœur","éclair","eclair","flèche","fleche","couronne","croix","badge","blason"] }
];

function detectCategory(prompt = "") {
  const p = String(prompt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((word) => p.includes(word))) return rule.key;
  }
  return "divers";
}

function getGalleryCategories(items = []) {
  const defaultOrder = ["tous","animaux","sport","medical","beaute","restauration","batiment","nature","symboles","divers"];
  const existing = new Set(items.map((item) => item.category).filter(Boolean));
  const ordered = defaultOrder.filter((cat) => cat === "tous" || existing.has(cat));
  for (const item of existing) {
    if (!ordered.includes(item)) ordered.push(item);
  }
  return ordered;
}

function hexToRgb(hex = "#111111") {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossible de charger l'image : ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getElementColor(color = "blanc") {
  return WHITE_ELEMENTS.includes(normalizeColor(color)) ? "#ffffff" : "#111111";
}

async function fitLogo(buffer, boxWidth, boxHeight, colorHex = "#111111") {
  const { r, g, b } = hexToRgb(colorHex);

  const resizedBuffer = await sharp(buffer)
    .ensureAlpha()
    .trim()
    .resize({
      width: boxWidth,
      height: boxHeight,
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  const meta = await sharp(resizedBuffer).metadata();
  const logoW = meta.width || boxWidth;
  const logoH = meta.height || boxHeight;

  const alpha = await sharp(resizedBuffer)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  const coloredLogo = await sharp({
    create: {
      width: logoW,
      height: logoH,
      channels: 3,
      background: { r, g, b }
    }
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();

  const left = Math.max(0, Math.round((boxWidth - logoW) / 2));
  const top = Math.max(0, Math.round((boxHeight - logoH) / 2));

  return sharp({
    create: {
      width: boxWidth,
      height: boxHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: coloredLogo, left, top }])
    .png()
    .toBuffer();
}

function normalizeLogoScale(logoScale = {}) {
  const parseScale = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1.0, Math.max(0.4, n));
  };

  return {
    single: parseScale(logoScale.single, 1),
    left: parseScale(logoScale.left, 1),
    right: parseScale(logoScale.right, 1)
  };
}

function escapeXml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getFontFamily(fontKey = "sans") {
  const map = {
    sans: "Arial Black, Arial, sans-serif",
    serif: "Georgia, serif",
    mono: "Courier New, monospace",
    design: "Trebuchet MS, Verdana, sans-serif",
    script: "ScriptCustom, cursive"
  };
  return map[fontKey] || map.sans;
}

function getFontFaceCss() {
  const scriptPath = path.join(fontsDir, "script.ttf");
  const blocks = [];

  if (fs.existsSync(scriptPath)) {
    const scriptUrl = `file://${scriptPath.replace(/\\/g, "/")}`;
    blocks.push(`
      @font-face {
        font-family: 'ScriptCustom';
        src: url('${scriptUrl}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    `);
  }

  return blocks.join("\n");
}

// ─── PRODUCTION TEXT SVG ────────────────────────────────────────────────────
// Lit maintenant fontSize (px par ligne) envoyé par le configurateur.
// Si fontSize est absent ou invalide, calcul auto identique à l'ancien.
function buildProductionTextSvg({
  width,
  height,
  line1 = "",
  line2 = "",
  line3 = "",
  fontSize = {},      // { line1: px, line2: px, line3: px } — nouveau système
  fontFamilies = {},
  colorHex = "#111111"
}) {
  const rawLines = [
    { key: "line1", text: String(line1 || "").trim() },
    { key: "line2", text: String(line2 || "").trim() },
    { key: "line3", text: String(line3 || "").trim() }
  ].filter(l => l.text.length > 0);

  if (!rawLines.length) {
    return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`);
  }

  const lineCount = rawLines.length;

  // ── Calcul de la taille par ligne ──────────────────────────────────────────
  // Ratio de conversion : les px du visuel (basé sur un viewport ~760px large)
  // doivent être mis à l'échelle vers le canvas de production.
  // Le visuel affiche un max-width de 760px, la zone texte peut être 60-100%.
  // On utilise le ratio width/760 comme facteur de conversion approximatif.
  const PREVIEW_WIDTH = 760;
  const scaleFactor = width / PREVIEW_WIDTH;

  const lineSizes = rawLines.map(l => {
    const previewPx = Number(fontSize?.[l.key]);

    if (Number.isFinite(previewPx) && previewPx > 0) {
      // Taille définie par le client dans le configurateur → on scale vers la production
      return Math.max(Math.round(previewPx * scaleFactor), Math.round(height * 0.08));
    }

    // Fallback auto si pas de fontSize (compatibilité ancienne version)
    const longestLen = Math.max(...rawLines.map(r => r.text.length), 1);
    let base;
    if (lineCount === 1) base = height * 0.68;
    else if (lineCount === 2) base = height * 0.42;
    else base = height * 0.30;
    const widthRatio = longestLen > 8 ? 8 / longestLen : 1;
    return Math.max(Math.round(base * widthRatio), Math.round(height * 0.09));
  });

  // ── Positionnement vertical centré ────────────────────────────────────────
  // On centre le bloc de texte verticalement.
  const lineGaps = rawLines.map((_, i) => lineSizes[i] * 1.18);
  const totalBlockHeight = lineGaps.reduce((a, v) => a + v, 0) - lineGaps[lineGaps.length - 1] * 0.18;
  const startY = Math.round((height - totalBlockHeight) / 2 + lineSizes[0] * 0.5);

  // ── Construction des éléments SVG ─────────────────────────────────────────
  const fontFaceCss = getFontFaceCss();
  let currentY = startY;

  const textElements = rawLines.map((line, index) => {
    const safeLine = escapeXml(line.text);
    const fontKey = fontFamilies[line.key] || "sans";
    const family = getFontFamily(fontKey);
    const size = lineSizes[index];
    const y = index === 0 ? currentY : (currentY += Math.round(lineSizes[index - 1] * 1.18));

    return `<text
      x="${Math.round(width / 2)}"
      y="${y}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="${family}"
      font-size="${size}px"
      font-weight="700"
      fill="${colorHex}"
    >${safeLine}</text>`;
  }).join("\n");

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>${fontFaceCss}</style>
    ${textElements}
  </svg>`);
}
// ─────────────────────────────────────────────────────────────────────────────

async function buildProductionComposite({
  dimension = "100x25mm",
  color = "blanc",
  line1 = "",
  line2 = "",
  line3 = "",
  leftLogoUrl = null,
  rightLogoUrl = null,
  fontSize = {},
  logoScale = {},
  fontFamilies = {}
}) {
  const { width, height } = getCanvasSize(dimension);

  // Le fichier production est toujours en noir (pour gravure laser)
  const elementColor = "#111111";

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const composites = [];
  const hasLeft = !!leftLogoUrl;
  const hasRight = !!rightLogoUrl;

  const logoScales = normalizeLogoScale(logoScale);

  const logoZoneWidth = Math.round(width * 0.20);
  const logoBoxHeight = Math.round(height * 0.97);

  const leftScale = hasRight ? logoScales.left : logoScales.single;
  const rightScale = hasLeft ? logoScales.right : logoScales.single;

  const leftLogoWidth = Math.round(logoZoneWidth * leftScale);
  const rightLogoWidth = Math.round(logoZoneWidth * rightScale);

  let textZoneLeft = 0;
  let textZoneWidth = width;

  if (hasLeft && !hasRight) {
    textZoneLeft = logoZoneWidth;
    textZoneWidth = width - logoZoneWidth;
  }

  if (!hasLeft && hasRight) {
    textZoneLeft = 0;
    textZoneWidth = width - logoZoneWidth;
  }

  if (hasLeft && hasRight) {
    textZoneLeft = logoZoneWidth;
    textZoneWidth = width - (logoZoneWidth * 2);
  }

  if (leftLogoUrl) {
    const leftLogoBuffer = await fetchImageBuffer(leftLogoUrl);
    const preparedLeftLogo = await fitLogo(leftLogoBuffer, leftLogoWidth, logoBoxHeight, elementColor);

    composites.push({
      input: preparedLeftLogo,
      left: Math.max(0, Math.round((logoZoneWidth - leftLogoWidth) / 2)),
      top: Math.round((height - logoBoxHeight) / 2)
    });
  }

  if (rightLogoUrl) {
    const rightLogoBuffer = await fetchImageBuffer(rightLogoUrl);
    const preparedRightLogo = await fitLogo(rightLogoBuffer, rightLogoWidth, logoBoxHeight, elementColor);

    composites.push({
      input: preparedRightLogo,
      left: width - logoZoneWidth + Math.max(0, Math.round((logoZoneWidth - rightLogoWidth) / 2)),
      top: Math.round((height - logoBoxHeight) / 2)
    });
  }

  // ── Ajustement du fontSize pour la zone texte ─────────────────────────────
  // Le scaleFactor global (width/760) est calculé dans buildProductionTextSvg.
  // Mais la zone texte peut être < 100% de la largeur si des logos sont présents.
  // On passe la largeur réelle de la zone texte pour que le calcul soit correct.
  const textSvg = buildProductionTextSvg({
    width: textZoneWidth,
    height,
    line1,
    line2,
    line3,
    fontSize,
    fontFamilies,
    colorHex: elementColor
  });

  composites.push({
    input: textSvg,
    left: textZoneLeft,
    top: 0
  });

  return base.composite(composites).png().toBuffer();
}

let shopifyTokenCache = {
  accessToken: null,
  expiresAt: 0
};

async function getShopifyAdminAccessToken() {
  const shop = process.env.SHOPIFY_STORE;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new Error("Variables Shopify manquantes : SHOPIFY_STORE, SHOPIFY_CLIENT_ID ou SHOPIFY_CLIENT_SECRET");
  }

  const now = Date.now();

  if (
    shopifyTokenCache.accessToken &&
    shopifyTokenCache.expiresAt &&
    now < shopifyTokenCache.expiresAt - 60000
  ) {
    return shopifyTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  const data = await response.json();

  if (!response.ok || !data?.access_token) {
    throw new Error("Impossible d'obtenir le token Admin Shopify");
  }

  shopifyTokenCache.accessToken = data.access_token;
  shopifyTokenCache.expiresAt = now + ((Number(data.expires_in) || 86399) * 1000);
  return shopifyTokenCache.accessToken;
}

async function shopifyGraphQL(query, variables = {}) {
  const shop = process.env.SHOPIFY_STORE;
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  const accessToken = await getShopifyAdminAccessToken();
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await res.json();
  if (!res.ok || data.errors) throw new Error("Erreur GraphQL Shopify");
  return data.data;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getShopifyFileById(fileId) {
  const data = await shopifyGraphQL(`
    query getFile($id: ID!) {
      node(id: $id) {
        __typename
        ... on MediaImage {
          id
          alt
          fileStatus
          status
          image { url }
          preview { image { url } }
        }
        ... on GenericFile {
          id
          alt
          fileStatus
          url
          preview { image { url } }
        }
      }
    }
  `, { id: fileId });

  return data?.node || null;
}

async function waitForShopifyFileReady(fileId, maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const file = await getShopifyFileById(fileId);
    if (!file) throw new Error("Fichier Shopify introuvable après création");

    const mediaStatus = file.status || null;
    const fileStatus = file.fileStatus || null;
    const finalUrl = file?.image?.url || file?.preview?.image?.url || file?.url || null;

    if (finalUrl) {
      return { id: file.id, url: finalUrl, raw: file };
    }

    if (mediaStatus === "FAILED" || fileStatus === "FAILED") {
      throw new Error("Le traitement Shopify du fichier a échoué");
    }

    await wait(delayMs);
  }

  throw new Error("Timeout en attente de l'URL Shopify");
}

async function uploadImageToShopify(buffer, filename, alt = "") {
  const mimeType = "image/png";

  const staged = await shopifyGraphQL(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `, {
    input: [{
      filename,
      mimeType,
      httpMethod: "POST",
      resource: "FILE",
      fileSize: String(buffer.length)
    }]
  });

  const stagedPayload = staged.stagedUploadsCreate;

  if (stagedPayload.userErrors?.length) {
    throw new Error(stagedPayload.userErrors[0].message || "Erreur staged upload Shopify");
  }

  const target = stagedPayload.stagedTargets[0];
  const form = new FormData();

  target.parameters.forEach((p) => {
    form.append(p.name, p.value);
  });

  form.append("file", new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, {
    method: "POST",
    body: form
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload binaire Shopify échoué: ${text}`);
  }

  const fileCreate = await shopifyGraphQL(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          __typename
          ... on MediaImage {
            id
            alt
            fileStatus
            status
            image { url }
            preview { image { url } }
          }
          ... on GenericFile {
            id
            alt
            fileStatus
            url
            preview { image { url } }
          }
        }
        userErrors { field message }
      }
    }
  `, {
    files: [{
      alt,
      contentType: "IMAGE",
      originalSource: target.resourceUrl
    }]
  });

  const filePayload = fileCreate.fileCreate;

  if (filePayload.userErrors?.length) {
    throw new Error(filePayload.userErrors[0].message || "Erreur fileCreate Shopify");
  }

  const createdFile = filePayload.files?.[0];
  if (!createdFile?.id) throw new Error("Fichier Shopify créé sans identifiant");

  const immediateUrl =
    createdFile?.image?.url ||
    createdFile?.preview?.image?.url ||
    createdFile?.url ||
    null;

  if (immediateUrl) {
    return { id: createdFile.id, url: immediateUrl };
  }

  const readyFile = await waitForShopifyFileReady(createdFile.id);
  return { id: readyFile.id, url: readyFile.url };
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Serveur configurateur plaque en ligne" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/logos/search-or-generate", async (req, res) => {
  try {
    const { prompt, count = 3 } = req.body || {};
    const cleanPrompt = String(prompt || "").trim();
    const imageCount = Math.max(1, Math.min(Number(count) || 3, 3));

    if (!cleanPrompt) {
      return res.status(400).json({
        code: "MISSING_PROMPT",
        error: "Prompt image manquant."
      });
    }

    const baseUrl = getBaseUrl(req);

    const finalPrompt = [
      "Créer un pictogramme noir pour gravure laser.",
      "Fond totalement transparent.",
      "Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.",
      "Style pictogramme professionnel, lignes franches, peu de détails fins.",
      "Ne pas ajouter de texte ni de cadre.",
      `Sujet: ${cleanPrompt}`
    ].join(" ");

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
      background: "transparent",
      output_format: "png",
      quality: "medium",
      n: imageCount
    });

    const logos = [];
    const creationsToSave = [];
    const category = detectCategory(cleanPrompt);

    for (let i = 0; i < (result.data || []).length; i += 1) {
      const item = result.data[i];
      if (!item.b64_json) continue;

      const fileBase = `${Date.now()}-${slugify(cleanPrompt)}-${i + 1}`;
      const fileName = `${fileBase}.png`;
      const filePath = path.join(logosDir, fileName);
      const buffer = Buffer.from(item.b64_json, "base64");

      fs.writeFileSync(filePath, buffer);

      let shopifyUrl = null;
      let shopifyFileId = null;

      try {
        const uploaded = await uploadImageToShopify(buffer, fileName, `Logo IA: ${cleanPrompt}`);
        shopifyUrl = uploaded.url;
        shopifyFileId = uploaded.id;
      } catch (e) {
        console.error("Shopify upload failed:", e.message);
      }

      const localUrl = `${baseUrl}/generated/logos/${fileName}`;
      const finalUrl = shopifyUrl || localUrl;

      creationsToSave.push({
        fileBase,
        imageUrl: finalUrl,
        localUrl,
        shopifyUrl,
        shopifyFileId
      });

      logos.push({
        id: fileBase,
        url: finalUrl,
        localUrl,
        shopifyUrl,
        shopifyFileId,
        category
      });
    }

    if (creationsToSave.length) {
      await saveCreationBatch({
        prompt: cleanPrompt,
        category,
        creations: creationsToSave
      });
    }

    return res.json({ logos });
  } catch (error) {
    console.error("Erreur /api/logos/search-or-generate :", error);

    const rawMessage = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || 500);

    if (status === 429 || rawMessage.includes("rate limit") || rawMessage.includes("too many requests")) {
      return res.status(429).json({
        code: "RATE_LIMIT",
        error: "La génération d'images est momentanément très sollicitée. Merci de réessayer dans quelques secondes."
      });
    }

    if (rawMessage.includes("quota") || rawMessage.includes("billing") || rawMessage.includes("insufficient") || rawMessage.includes("credit")) {
      return res.status(503).json({
        code: "BILLING_UNAVAILABLE",
        error: "Le service de génération d'images est momentanément indisponible."
      });
    }

    if (rawMessage.includes("api key") || rawMessage.includes("unauthorized") || status === 401) {
      return res.status(503).json({
        code: "AUTH_ERROR",
        error: "Le service de génération d'images est momentanément indisponible."
      });
    }

    return res.status(500).json({
      code: "GENERIC_GENERATION_ERROR",
      error: "Une erreur est survenue lors de la génération des images. Merci de réessayer."
    });
  }
});

// ─── /api/render/production ──────────────────────────────────────────────────
// Changements :
//   1. Lit `fontSize` (px par ligne) au lieu de `textScale`
//   2. Upload le fichier production sur Shopify Files et renvoie shopifyUrl
//   3. La réponse contient { url, shopifyUrl, localUrl }
app.post("/api/render/production", async (req, res) => {
  try {
    const {
      line1 = "",
      line2 = "",
      line3 = "",
      dimension = "100x25mm",
      thickness = "1.6",
      color = "blanc",
      leftLogoUrl = null,
      rightLogoUrl = null,
      fontSize = {},       // ← nouveau : taille en px par ligne
      logoScale = {},
      fontFamilies = {}
    } = req.body || {};

    const baseUrl = getBaseUrl(req);

    const productionBuffer = await buildProductionComposite({
      dimension,
      color,
      line1,
      line2,
      line3,
      leftLogoUrl,
      rightLogoUrl,
      fontSize,
      logoScale,
      fontFamilies
    });

    const fileName = `${Date.now()}-production-${slugify(dimension)}-${slugify(color)}-${normalizeThickness(thickness)}-${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(productionDir, fileName);

    fs.writeFileSync(filePath, productionBuffer);

    const localUrl = `${baseUrl}/generated/production/${fileName}`;

    // ── Upload sur Shopify Files pour URL CDN pérenne ──────────────────────
    let shopifyUrl = null;
    let shopifyFileId = null;

    try {
      const altText = [
        `Plaque ${dimension}`,
        color,
        thickness + "mm",
        line1,
        line2,
        line3
      ].filter(Boolean).join(" | ");

      const uploaded = await uploadImageToShopify(
        productionBuffer,
        fileName,
        altText
      );

      shopifyUrl = uploaded.url;
      shopifyFileId = uploaded.id;
    } catch (e) {
      // L'upload Shopify est non-bloquant : on renvoie quand même le localUrl
      console.error("Shopify production upload failed:", e.message);
    }

    return res.json({
      url: shopifyUrl || localUrl,   // URL principale (Shopify si dispo, sinon locale)
      shopifyUrl,                    // URL CDN Shopify (null si échec)
      shopifyFileId,                 // ID fichier Shopify
      localUrl                       // URL locale de secours
    });

  } catch (error) {
    console.error("Erreur /api/render/production :", error);
    return res.status(500).json({
      error: error?.message || "Erreur interne génération production."
    });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/variant/resolve", async (req, res) => {
  try {
    const dimension = normalizeDimension(req.body?.dimension || "");
    const thickness = normalizeThickness(req.body?.thickness || "");
    const color = normalizeColor(req.body?.color || "");

    if (!dimension || !thickness || !color) {
      return res.status(400).json({ error: "Dimension, épaisseur ou couleur manquante." });
    }

    const allowedThickness = ALLOWED_THICKNESS_BY_COLOR[color];
    if (!allowedThickness) {
      return res.status(404).json({ error: "Couleur introuvable." });
    }

    if (!allowedThickness.includes(thickness)) {
      return res.status(400).json({
        error: `L'épaisseur ${thickness} mm n'est pas disponible pour la couleur ${color}.`
      });
    }

    const found = VARIANT_MAP?.[dimension]?.[thickness]?.[color];
    if (!found) {
      return res.status(404).json({ error: "Variant introuvable pour cette combinaison." });
    }

    return res.json(found);
  } catch (error) {
    console.error("Erreur /api/variant/resolve :", error);
    return res.status(500).json({ error: "Erreur interne variant." });
  }
});

app.get("/api/gallery/categories", async (req, res) => {
  try {
    const items = await getAllGalleryItemsForCategories();
    const categories = getGalleryCategories(items);
    res.json({ categories });
  } catch (error) {
    console.error("Erreur gallery categories :", error);
    res.status(500).json({ error: "gallery categories error" });
  }
});

app.get("/api/gallery", async (req, res) => {
  try {
    const requestedCategory = String(req.query.category || "tous").toLowerCase().trim();

    const itemsRaw = await getGalleryItems({
      category: requestedCategory,
      limit: 60
    });

    const allForCategories = await getAllGalleryItemsForCategories();

    const items = itemsRaw.map((item) => ({
      id: item.id,
      preview: item.image_url,
      prompt: item.prompt,
      category: item.category || "divers",
      imageUrl: item.image_url,
      shopifyUrl: item.shopify_url || null,
      localUrl: item.local_url || null,
      createdAt: item.created_at
    }));

    res.json({
      items,
      categories: getGalleryCategories(allForCategories),
      activeCategory: requestedCategory || "tous"
    });
  } catch (e) {
    console.error("Erreur gallery :", e);
    res.status(500).json({ error: "gallery error" });
  }
});

app.get("/api/gallery/random", async (req, res) => {
  try {
    const randomItems = await getRandomGalleryItems(12);
    const allForCategories = await getAllGalleryItemsForCategories();

    const items = randomItems.map((item) => ({
      id: item.id,
      preview: item.image_url,
      prompt: item.prompt,
      category: item.category || "divers",
      imageUrl: item.image_url,
      shopifyUrl: item.shopify_url || null,
      localUrl: item.local_url || null,
      createdAt: item.created_at
    }));

    res.json({
      items,
      categories: getGalleryCategories(allForCategories),
      activeCategory: "tous"
    });
  } catch (e) {
    console.error("Erreur gallery random :", e);
    res.status(500).json({ error: "gallery error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Fonts dir:", fontsDir);
  console.log("OPENAI_API_KEY présente :", !!process.env.OPENAI_API_KEY);
  console.log("SHOPIFY_STORE présent :", !!process.env.SHOPIFY_STORE);
  console.log("SHOPIFY_CLIENT_ID présent :", !!process.env.SHOPIFY_CLIENT_ID);
  console.log("SHOPIFY_CLIENT_SECRET présent :", !!process.env.SHOPIFY_CLIENT_SECRET);
  console.log("SHOPIFY_API_VERSION :", process.env.SHOPIFY_API_VERSION || "2025-01");
  console.log("SUPABASE_URL présent :", !!process.env.SUPABASE_URL);
  console.log("SUPABASE_SERVICE_ROLE_KEY présente :", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
});
