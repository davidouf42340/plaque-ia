import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";
import sharp from "sharp";
import { createCanvas, GlobalFonts, Image as CanvasImage } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Vérification variables d'environnement ──────────────────────────────────
const REQUIRED_ENV = [
  "OPENAI_API_KEY","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
  "SHOPIFY_STORE","SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET",
  "PUBLIC_BASE_URL","ADMIN_SECRET_TOKEN","SHOPIFY_ACCESS_TOKEN",
  "SHOPIFY_WEBHOOK_SECRET"
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error("❌ Variables d'environnement manquantes :", missingEnv.join(", "));
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Raw body pour webhook HMAC (DOIT être avant express.json) ───────────────
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Répertoires ─────────────────────────────────────────────────────────────
const generatedDir  = path.join(__dirname, "..", "generated");
const logosDir      = path.join(generatedDir, "logos");
const productionDir = path.join(generatedDir, "production");
const fontsDir      = path.join(__dirname, "fonts");

fs.mkdirSync(logosDir,      { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });
app.use("/generated", express.static(generatedDir));

// ── Enregistrement des polices ──────────────────────────────────────────────
const fontFiles = [
  "Allura","Amandine","Arlrdbd","Baskvill","Bernhc","Calinastiya",
  "Caribbean","Chewy","Chonburi","Coopbl","Dancingscript",
  "Dmserifdisplay","Sport","Electrolize","Exotic","Fishermills",
  "Galada","Greatvibes","Hujan","Julius","Justme","Luxes",
  "Manuscript","Marckscript","Meaculpa","Merienda","Newrocker",
  "Parisienne","Passionone","Playbill","Pompiere","Rammettoone",
  "Rancho","Rye","Seves","Sylfaen","Walto","Wendy"
];

for (const name of fontFiles) {
  const ttfPath = path.join(fontsDir, `${name}.ttf`);
  const otfPath = path.join(fontsDir, `${name}.otf`);
  if      (fs.existsSync(ttfPath)) { GlobalFonts.registerFromPath(ttfPath, name); console.log(`Police : ${name}`); }
  else if (fs.existsSync(otfPath)) { GlobalFonts.registerFromPath(otfPath, name); console.log(`Police (otf) : ${name}`); }
  else console.warn(`Police introuvable : ${name}`);
}

// ── Sécurité origine ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);

function checkOrigin(req, res, next) {
  if (process.env.NODE_ENV === "development") return next();
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) return next();
  if (!ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    console.warn(`Origin bloquée : ${origin}`);
    return res.status(403).json({ error: "Accès non autorisé." });
  }
  next();
}

function checkAdminToken(req, res, next) {
  const token = req.body?.token || req.headers["x-admin-token"] || "";
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) return res.status(401).json({ error: "Non autorisé." });
  next();
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const aiLimiter     = rateLimit({ windowMs:10*60*1000, max:50,  message:{code:"RATE_LIMIT",error:"Trop de générations."} });
const uploadLimiter = rateLimit({ windowMs:60*1000,    max:30,  message:{error:"Trop de requêtes."} });
const rateLimiter   = rateLimit({ windowMs:5*60*1000,  max:100, message:{error:"Trop de votes."} });

// ── Helpers ──────────────────────────────────────────────────────────────────
function getBaseUrl(req) { return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`; }
function slugify(v="")            { return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,80); }
function normalizeDimension(v="") { return String(v).trim().toLowerCase().replaceAll(" ",""); }
function normalizeThickness(v="") { return String(v).trim().toLowerCase().replace("mm","").replace(",",".").replace(" ","").trim(); }
function normalizeColor(v="") {
  const val = String(v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const map = {
    "acier brosse":"acier-brosse","acier brose":"acier-brosse","acier-brosse":"acier-brosse","acier":"acier-brosse",
    "acier brosse":"acier-brosse","or brosse":"or","or":"or","cuivre":"cuivre","blanc":"blanc","noir":"noir",
    "noir brillant":"noir-brillant","noir-brillant":"noir-brillant","gris":"gris","noyer":"noyer","rose":"rose"
  };
  return map[val] || val;
}

function hashString(str="") { let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;} return Math.abs(h); }
function pickGalleryIndex(prompt="",items=[]) { if(!Array.isArray(items)||!items.length)return 0; return hashString(`${prompt}__${items.map(x=>x.fileBase||x.id||x.url||"").join("|")}`)%items.length; }

// ── Couleurs ─────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  "acier-brosse": { background:"#d8d8d8", foreground:"#111111" },
  "or":           { background:"#c7a34c", foreground:"#111111" },
  "cuivre":       { background:"#b76e4a", foreground:"#111111" },
  "blanc":        { background:"#fafafa", foreground:"#111111" },
  "noir":         { background:"#111111", foreground:"#f5f5f5" },
  "noir-brillant":{ background:"#0a0a0a", foreground:"#f5f5f5" },
  "gris":         { background:"#6b7280", foreground:"#f5f5f5" },
  "noyer":        { background:"#7c5c3a", foreground:"#f5f5f5" },
  "rose":         { background:"#e8a0b0", foreground:"#1a1a1a" },
};
const WHITE_ELEMENTS = ["noir","noir-brillant","gris","noyer","rose"];

// ── VARIANT_MAP ──────────────────────────────────────────────────────────────
const VARIANT_MAP = {
  "60x15mm":{
    "1.6":{"acier-brosse":{variantId:53265970790763},"or":{variantId:53265970856299},"cuivre":{variantId:53265970921835},"blanc":{variantId:53265970987371},"noir":{variantId:53265971052907},"noir-brillant":{variantId:53265971118443},"gris":{variantId:53265971183979},"noyer":{variantId:53265971249515},"rose":{variantId:53265971315051}},
    "3.2":{"acier-brosse":{variantId:53265970823531},"or":{variantId:53265970889067},"cuivre":{variantId:53265970954603},"blanc":{variantId:53265971020139},"noir":{variantId:53265971085675},"noir-brillant":{variantId:53265971151211},"gris":{variantId:53265971216747},"noyer":{variantId:53265971282283},"rose":{variantId:53265971347819}}
  },
  "100x25mm":{
    "1.6":{"acier-brosse":{variantId:53152486228331},"or":{variantId:53152486556011},"cuivre":{variantId:53152486883691},"noir":{variantId:53152487211371},"blanc":{variantId:53152487539051},"noir-brillant":{variantId:53152487866731},"noyer":{variantId:53152488194411},"gris":{variantId:53152488522091},"rose":{variantId:53152488849771}},
    "3.2":{"acier-brosse":{variantId:53152486392171},"or":{variantId:53152486719851},"cuivre":{variantId:53152487047531},"noir":{variantId:53152487375211},"blanc":{variantId:53152487702891},"noir-brillant":{variantId:53152488030571},"noyer":{variantId:53152488358251},"gris":{variantId:53152488685931},"rose":{variantId:53152489013611}}
  },
  "150x37mm":{
    "1.6":{"acier-brosse":{variantId:53152489341291},"or":{variantId:53152489668971},"cuivre":{variantId:53152489996651},"noir":{variantId:53152490324331},"blanc":{variantId:53152490652011},"noir-brillant":{variantId:53152490979691},"noyer":{variantId:53152491307371},"gris":{variantId:53152491635051},"rose":{variantId:53152491962731}},
    "3.2":{"acier-brosse":{variantId:53152489504811},"or":{variantId:53152489832491},"cuivre":{variantId:53152490160171},"noir":{variantId:53152490487851},"blanc":{variantId:53152490815531},"noir-brillant":{variantId:53152491143211},"noyer":{variantId:53152491470891},"gris":{variantId:53152491798571},"rose":{variantId:53152492126251}}
  },
  "200x50mm":{
    "1.6":{"acier-brosse":{variantId:53152492453931},"or":{variantId:53152492781611},"cuivre":{variantId:53152493109291},"noir":{variantId:53152493436971},"blanc":{variantId:53152493764651},"noir-brillant":{variantId:53152494092331},"noyer":{variantId:53152494420011},"gris":{variantId:53152494747691},"rose":{variantId:53152495075371}},
    "3.2":{"acier-brosse":{variantId:53152492617771},"or":{variantId:53152492945451},"cuivre":{variantId:53152493273131},"noir":{variantId:53152493600811},"blanc":{variantId:53152493928491},"noir-brillant":{variantId:53152494256171},"noyer":{variantId:53152494583851},"gris":{variantId:53152494911531},"rose":{variantId:53152495239211}}
  },
  "250x87mm":{
    "1.6":{"acier-brosse":{variantId:53152495566891},"or":{variantId:53152495894571},"cuivre":{variantId:53152496222251},"noir":{variantId:53152496549931},"blanc":{variantId:53152496877611},"noir-brillant":{variantId:53152497205291},"noyer":{variantId:53152497532971},"gris":{variantId:53152497860651},"rose":{variantId:53152498188331}},
    "3.2":{"acier-brosse":{variantId:53152495730411},"or":{variantId:53152496058091},"cuivre":{variantId:53152496385771},"noir":{variantId:53152496713451},"blanc":{variantId:53152497041131},"noir-brillant":{variantId:53152497368811},"noyer":{variantId:53152497696491},"gris":{variantId:53152498024171},"rose":{variantId:53152498351851}}
  },
  "300x100mm":{
    "1.6":{"acier-brosse":{variantId:53152498679531},"or":{variantId:53152499007211},"cuivre":{variantId:53152499334891},"noir":{variantId:53152499662571},"blanc":{variantId:53152499990251},"noir-brillant":{variantId:53152500317931},"noyer":{variantId:53152500645611},"gris":{variantId:53152500973291},"rose":{variantId:53152501300971}},
    "3.2":{"acier-brosse":{variantId:53152498843051},"or":{variantId:53152499170731},"cuivre":{variantId:53152499498411},"noir":{variantId:53152499826091},"blanc":{variantId:53152500153771},"noir-brillant":{variantId:53152500481451},"noyer":{variantId:53152500809131},"gris":{variantId:53152501136811},"rose":{variantId:53152501464491}}
  }
};

// ── DIMENSIONS canvas (px à 300dpi) ─────────────────────────────────────────
const DIMENSION_MAP_BAL = {
  "60x15mm":   { w:709,  h:177  },
  "100x25mm":  { w:1181, h:295  },
  "150x37mm":  { w:1772, h:437  },
  "200x50mm":  { w:2362, h:591  },
  "250x87mm":  { w:2953, h:1028 },
  "300x100mm": { w:3543, h:1181 },
};

const DIMENSION_MAP_RUE = {
  "150x100mm": { w:1772, h:1181 },
  "200x133mm": { w:2362, h:1571 },
  "250x167mm": { w:2953, h:1972 },
  "300x200mm": { w:3543, h:2362 },
};

// ── Shopify API helpers ──────────────────────────────────────────────────────
const SHOPIFY_SHOP    = (process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").trim();
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VER = "2024-01";

async function shopifyFetch(path, method="GET", body=null) {
  const url = `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VER}${path}`;
  const opts = {
    method,
    headers: {
      "Content-Type":           "application/json",
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) { console.error(`[Shopify] ${method} ${path} → ${res.status}:`, text.slice(0, 300)); }
  else if (path.includes("graphql")) { console.log(`[Shopify GQL] ${method} ${path} → ${res.status}:`, text.slice(0, 500)); }
  try { return JSON.parse(text); } catch { return text; }
}

async function uploadImageToShopify(buffer, filename, altText = "Plaque") {
  try {
    const b64 = buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const createQuery = `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { ... on MediaImage { id image { url } } }
        userErrors { field message }
      }
    }`;
    const result = await shopifyFetch("/graphql.json", "POST", {
      query: createQuery,
      variables: { files: [{ alt: altText, contentType: "IMAGE", originalSource: dataUrl }] }
    });
    console.log("[PAG] fileCreate raw:", JSON.stringify(result?.data?.fileCreate));
    const errors = result?.data?.fileCreate?.userErrors;
    if (errors && errors.length > 0) console.warn("[PAG] fileCreate errors:", JSON.stringify(errors));
    const files = result?.data?.fileCreate?.files || [];
    const file = files[0];
    // Shopify peut retourner un GenericFile ou MediaImage selon le type
    const url = file?.image?.url || file?.url || file?.originalSource || null;
    if (url) console.log("[PAG] Upload GraphQL OK:", url.slice(0, 80));
    else console.warn("[PAG] Upload GraphQL: pas d URL, file=", JSON.stringify(file));
    return url ? { url } : null;
  } catch (e) {
    console.warn("[PAG] uploadImageToShopify error:", e.message);
    return null;
  }
}

async function updateOrderNote(orderId, note) {
  return shopifyFetch(`/orders/${orderId}.json`, "PUT", { order:{ id:orderId, note } });
}

async function setOrderMetafield(orderId, key, value) {
  return shopifyFetch(`/orders/${orderId}/metafields.json`, "POST", {
    metafield: {
      namespace: "pag_production",
      key,
      value,
      type: "single_line_text_field",
    }
  });
}

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function saveCreationBatch({prompt,category,creations=[]}) {
  const createdAt=new Date().toISOString(),groupId=`grp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,galIdx=pickGalleryIndex(prompt,creations);
  const entries=creations.map((entry,i)=>({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i+1}`,group_id:groupId,created_at:createdAt,prompt,category,in_gallery:i===galIdx,image_url:entry.imageUrl,local_url:entry.localUrl||null,shopify_url:entry.shopifyUrl||null,shopify_file_id:entry.shopifyFileId||null}));
  const {data,error}=await supabase.from("gallery_items").insert(entries).select();
  if(error)throw new Error(`Supabase insert failed: ${error.message}`);
  return data||[];
}

async function getGalleryItems({category="tous",limit=500}={}) {
  let q=supabase.from("gallery_items").select("*").eq("in_gallery",true).order("created_at",{ascending:false}).limit(limit);
  if(category&&category!=="tous")q=q.eq("category",category);
  const{data,error}=await q;
  if(error)throw new Error("Impossible de charger la galerie");
  return data||[];
}

async function getAllGalleryItemsForCategories() {
  const{data,error}=await supabase.from("gallery_items").select("category").eq("in_gallery",true);
  if(error)throw new Error("Impossible de charger les catégories");
  return data||[];
}

async function getRandomGalleryItems(limit=12) {
  const{data,error}=await supabase.from("gallery_items").select("*").eq("in_gallery",true).limit(300);
  if(error)throw new Error("Impossible de charger la galerie aléatoire");
  return [...(data||[])].sort(()=>0.5-Math.random()).slice(0,limit);
}

// ── Épaisseurs autorisées ────────────────────────────────────────────────────
const ALLOWED_THICKNESS_BY_COLOR = {
  "acier-brosse":["1.6","3.2"],"or":["1.6","3.2"],"cuivre":["1.6","3.2"],
  "blanc":["1.6","3.2"],"noir":["1.6","3.2"],"noir-brillant":["1.6","3.2"],
  "gris":["1.6","3.2"],"noyer":["1.6","3.2"],"rose":["1.6","3.2"]
};

// ── Détection catégorie ──────────────────────────────────────────────────────
function detectCategory(prompt="") {
  const p=prompt.toLowerCase();
  if(/chien|chat|lapin|oiseau|cheval|animal|canin|f[ée]lin/.test(p)) return "animaux";
  if(/sport|foot|tennis|rugby|v[eé]lo|run|boxe|natation/.test(p))    return "sport";
  if(/m[eé]decin|pharmacie|croix|coeur|sant[eé]|h[oô]pital/.test(p)) return "medical";
  if(/coiff|beaut[eé]|ongle|spa|ciseaux/.test(p))                     return "beaute";
  if(/restaurant|chef|cuisine|fourchette|pizza/.test(p))              return "restauration";
  if(/maison|maçon|bâtiment|construction|outil/.test(p))              return "batiment";
  if(/fleur|arbre|feuille|nature|jardin/.test(p))                     return "nature";
  if(/ancre|étoile|lune|soleil|symbole|fleur de lis/.test(p))        return "symboles";
  return "divers";
}

// ============================================================
// GÉNÉRATION CANVAS SERVEUR — PNG TRANSPARENT
// Identique au canvas client mais côté Node avec @napi-rs/canvas
// ============================================================

/**
 * Charge une image distante et retourne un objet Image canvas-compatible
 */
async function loadRemoteImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const img = new CanvasImage();
    img.src = buffer;
    return img;
  } catch (e) {
    console.warn("[PAG] loadRemoteImage error:", e.message);
    return null;
  }
}

/**
 * Colorise un logo (PNG transparent) en noir ou blanc selon la couleur de plaque
 * Renvoie un Buffer PNG
 */
async function colorizeLogoBuffer(logoUrl, targetColor) {
  if (!logoUrl) return null;
  try {
    const res    = await fetch(logoUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data);
    const isWhite = WHITE_ELEMENTS.includes(targetColor);
    const [r, g, b] = isWhite ? [245, 245, 245] : [17, 17, 17];
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i+3] > 30) {
        pixels[i]   = r;
        pixels[i+1] = g;
        pixels[i+2] = b;
      }
    }
    return sharp(Buffer.from(pixels), { raw:{ width:info.width, height:info.height, channels:4 } }).png().toBuffer();
  } catch (e) {
    console.warn("[PAG] colorizeLogoBuffer error:", e.message);
    return null;
  }
}

/**
 * Génère le fichier de production BAL — PNG transparent (noir sur transparent)
 * Reproduit fidèlement le rendu canvas client
 */
async function renderProdBAL({ dimension, color, lines, fontFamily, fontSize, textAlign, leftLogoUrl, rightLogoUrl, flippedLeft, flippedRight }) {
  const dimKey = normalizeDimension(dimension);
  const dims   = DIMENSION_MAP_BAL[dimKey] || DIMENSION_MAP_BAL["100x25mm"];
  const W = dims.w, H = dims.h;

  // Canvas transparent
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const hasLeft  = !!leftLogoUrl;
  const hasRight = !!rightLogoUrl;
  const logoZoneW = Math.round(W * 0.25);
  let textLeft  = 0, textWidth = W;
  if (hasLeft && !hasRight)  { textLeft = logoZoneW;  textWidth = W - logoZoneW; }
  if (!hasLeft && hasRight)  { textLeft = 0;           textWidth = W - logoZoneW; }
  if (hasLeft && hasRight)   { textLeft = logoZoneW;  textWidth = W - logoZoneW * 2; }

  // ── Logos ──────────────────────────────────────────────────────────────────
  const logoH = Math.round(H * 0.97);

  async function drawLogo(logoUrl, xPos, flipped) {
    const colBuf = await colorizeLogoBuffer(logoUrl, color);
    if (!colBuf) return;
    // Redimensionner le logo pour tenir dans la zone
    const meta    = await sharp(colBuf).metadata();
    const aspect  = (meta.width||1) / (meta.height||1);
    const drawW   = Math.round(logoH * aspect);
    const drawH   = logoH;
    const resized = await sharp(colBuf).resize(drawW, drawH, { fit:"contain", background:{ r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
    const img     = new CanvasImage();
    img.src       = resized;
    const imgX    = xPos + Math.round((logoZoneW - drawW) / 2);
    const imgY    = Math.round((H - drawH) / 2);
    ctx.save();
    if (flipped) {
      ctx.translate(xPos + logoZoneW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(logoZoneW - drawW) / 2, imgY, drawW, drawH);
    } else {
      ctx.drawImage(img, imgX, imgY, drawW, drawH);
    }
    ctx.restore();
  }

  if (hasLeft)  await drawLogo(leftLogoUrl,  0,          flippedLeft  || false);
  if (hasRight) await drawLogo(rightLogoUrl, W - logoZoneW, flippedRight || false);

  // ── Texte ──────────────────────────────────────────────────────────────────
  const filteredLines = (lines || []).filter(l => l.trim().length > 0);
  if (filteredLines.length) {
    // Auto fontSize si non fourni
    const fs_val = fontSize || calcAutoFontSizeServer(filteredLines, textWidth, H, hasLeft, hasRight);
    const scaledFs = Math.round(fs_val * (H / 190)); // scale par rapport canvas preview 190px
    const fontName = fontFamily || "Baskvill";
    const lineGap  = Math.round(scaledFs * 1.28);
    const totalH   = lineGap * filteredLines.length;
    const startY   = Math.round((H - totalH) / 2 + scaledFs * 0.82);
    const align    = textAlign || "center";

    ctx.fillStyle    = "#111111"; // Toujours noir sur transparent pour prod
    ctx.font         = `bold ${scaledFs}px "${fontName}", Arial, sans-serif`;
    ctx.textAlign    = align;
    ctx.textBaseline = "alphabetic";

    let cx;
    if      (align === "left")  cx = textLeft + Math.round(textWidth * 0.05);
    else if (align === "right") cx = textLeft + textWidth - Math.round(textWidth * 0.05);
    else                        cx = textLeft + Math.round(textWidth / 2);

    filteredLines.forEach((line, i) => {
      ctx.fillText(line, cx, startY + i * lineGap);
    });
  }

  return canvas.toBuffer("image/png");
}

/**
 * Génère le fichier de production RUE — PNG transparent
 */
async function renderProdRUE({ dimension, color, number, streetLines, fontFamily, numScale, streetScale, logoUrl, layout }) {
  const dimKey = normalizeDimension(dimension);
  const dims   = DIMENSION_MAP_RUE[dimKey] || DIMENSION_MAP_RUE["150x100mm"];
  const W = dims.w, H = dims.h;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const zoneH = Math.round(H * 0.75);
  const bandH = H - zoneH;
  const imgW  = Math.round(W * 0.50);
  const numW  = W - imgW;

  // ── Logo ───────────────────────────────────────────────────────────────────
  if (logoUrl) {
    const colBuf = await colorizeLogoBuffer(logoUrl, color);
    if (colBuf) {
      const meta   = await sharp(colBuf).metadata();
      const aspect = (meta.width||1) / (meta.height||1);
      const mW = imgW * 0.95, mH = zoneH * 0.95;
      let dW, dH;
      if (aspect > mW/mH) { dW = mW; dH = mW / aspect; }
      else                 { dH = mH; dW = mH * aspect; }
      const resized = await sharp(colBuf).resize(Math.round(dW), Math.round(dH), { fit:"contain", background:{ r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
      const img     = new CanvasImage();
      img.src       = resized;
      const imgX    = layout === "image-left" ? 0 : numW;
      ctx.drawImage(img, imgX + Math.round((imgW - dW) / 2), Math.round((zoneH - dH) / 2), Math.round(dW), Math.round(dH));
    }
  }

  const fontName = fontFamily || "Baskvill";
  ctx.fillStyle    = "#111111";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";

  // ── Numéro ─────────────────────────────────────────────────────────────────
  if (number) {
    const numBase = Math.round(zoneH * 0.50);
    const numSize = Math.round(numBase * ((numScale || 100) / 100));
    ctx.font = `bold ${numSize}px "${fontName}", Arial, sans-serif`;
    const numX = layout === "image-left"
      ? Math.round(imgW + numW / 2)
      : Math.round(numW / 2);
    ctx.fillText(number, numX, Math.round(zoneH / 2));
  }

  // ── Nom de rue ─────────────────────────────────────────────────────────────
  const sl = Array.isArray(streetLines) && streetLines.length ? streetLines : [];
  if (sl.length) {
    const nLines    = sl.length;
    const streetBase = Math.round((bandH / (nLines + 0.4)) * 0.85);
    const streetSize = Math.round(streetBase * ((streetScale || 100) / 100));
    ctx.font     = `bold ${streetSize}px "${fontName}", Arial, sans-serif`;
    const lineGap = Math.round(streetSize * 1.2);
    const totalH  = lineGap * (nLines - 1);
    const startY  = Math.round(zoneH + bandH / 2) - Math.round(totalH / 2);
    sl.forEach((line, i) => {
      ctx.fillText(line.toUpperCase(), Math.round(W / 2), startY + i * lineGap);
    });
  }

  return canvas.toBuffer("image/png");
}

function calcAutoFontSizeServer(lines, textWidth, H, hasLeft, hasRight) {
  if (!lines.length) return Math.round(H * 0.25);
  const lc = lines.length;
  let len = 1;
  lines.forEach(l => { if (l.length > len) len = l.length; });
  let base;
  if      (lc === 1) base = (hasLeft&&hasRight)?H*0.42:(hasLeft||hasRight)?H*0.48:H*0.55;
  else if (lc === 2) base = (hasLeft&&hasRight)?H*0.26:(hasLeft||hasRight)?H*0.30:H*0.36;
  else if (lc === 3) base = (hasLeft&&hasRight)?H*0.19:(hasLeft||hasRight)?H*0.22:H*0.26;
  else               base = (hasLeft&&hasRight)?H*0.15:(hasLeft||hasRight)?H*0.17:H*0.20;
  const ratio = len > 10 ? 10/len : 1;
  return Math.max(Math.round(base * ratio), Math.round(H * 0.05));
}

// ============================================================
// WEBHOOK SHOPIFY — orders/paid
// ============================================================
app.post("/webhook/orders-paid", async (req, res) => {

  // ── 1. Vérification HMAC ────────────────────────────────────────────────
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const secret     = process.env.SHOPIFY_WEBHOOK_SECRET;
  const digest     = crypto.createHmac("sha256", secret).update(req.body).digest("base64");

  if (digest !== hmacHeader) {
    console.warn("[PAG Webhook] Signature invalide — ignorée");
    return res.status(401).send("Unauthorized");
  }

  // Répondre immédiatement à Shopify (max 5s)
  res.status(200).send("OK");

  // ── 2. Parser la commande ───────────────────────────────────────────────
  let order;
  try { order = JSON.parse(req.body.toString()); }
  catch (e) { console.error("[PAG Webhook] Erreur parsing:", e); return; }

  console.log(`[PAG Webhook] Commande reçue : #${order.order_number} — ${order.email}`);
  console.log("[PAG Debug] Line items:", JSON.stringify((order.line_items || []).map(i => ({ id: i.id, title: i.title, props: (i.properties || []).map(p => p.name) }))));

  // ── 3. Trouver les line items PAG ───────────────────────────────────────
  const pagItems = (order.line_items || []).filter(item =>
    item.properties && item.properties.length > 0 &&
    item.properties.some(p => p.name === "_pag_type")
  );

  if (!pagItems.length) {
    console.log(`[PAG Webhook] Commande #${order.order_number} : pas de plaque PAG — ignorée`);
    return;
  }

  const notesParts = [];
  const sep = "=".repeat(50);
  const timestamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

  for (const item of pagItems) {
    const p = {};
    item.properties.forEach(prop => { p[prop.name] = prop.value; });

    const pagType    = p["_pag_type"] || "bal";    // "bal" ou "rue"
    const lineItemId = item.id;

    console.log(`[PAG Webhook] Traitement item #${lineItemId} — type: ${pagType}`);

    try {
      let prodBuffer, prodFilename, previewUrl, prodUrl;

      // ── 4a. Générer fichier production BAL ───────────────────────────────
      if (pagType === "bal") {
        const lines = [
          p["Ligne 1"] || "", p["Ligne 2"] || "",
          p["Ligne 3"] || "", p["Ligne 4"] || "",
        ].filter(l => l.trim().length > 0);

        prodBuffer = await renderProdBAL({
          dimension:    p["Dimension"]     || "100x25mm",
          color:        normalizeColor(p["Couleur plaque"] || "acier-brosse"),
          lines,
          fontFamily:   p["Police"]        || "Baskvill",
          fontSize:     null,              // auto
          textAlign:    p["Alignement"]    || "center",
          leftLogoUrl:  p["_logo_gauche"]  || null,
          rightLogoUrl: p["_logo_droite"]  || null,
          flippedLeft:  p["_flip_gauche"]  === "true",
          flippedRight: p["_flip_droite"]  === "true",
        });

        prodFilename = `prod-bal-${order.order_number}-${lineItemId}.png`;

      // ── 4b. Générer fichier production RUE ───────────────────────────────
      } else if (pagType === "rue") {
        const streetRaw = p["Nom de rue"] || p["Ligne 1 rue"] || "";
        const sl = [
          p["Ligne 1 rue"] || "", p["Ligne 2 rue"] || "", p["Ligne 3 rue"] || "",
        ].filter(l => l.trim().length > 0);

        prodBuffer = await renderProdRUE({
          dimension:   p["Dimension"]        || "150x100mm",
          color:       normalizeColor(p["Couleur"] || "acier-brosse"),
          number:      p["Numéro"]           || "",
          streetLines: sl.length ? sl : (streetRaw ? [streetRaw] : []),
          fontFamily:  p["Police"]           || "Baskvill",
          numScale:    Number(p["_num_scale"]    || 100),
          streetScale: Number(p["_street_scale"] || 100),
          logoUrl:     p["_logo_url"]        || null,
          layout:      p["_layout"]          || "image-left",
        });

        prodFilename = `prod-rue-${order.order_number}-${lineItemId}.png`;
      }

      if (!prodBuffer) { console.warn(`[PAG Webhook] Buffer vide pour item ${lineItemId}`); continue; }

      // ── 5. Upload sur Shopify CDN ────────────────────────────────────────
      const shopifyFile = await uploadImageToShopify(prodBuffer, prodFilename, `Production #${order.order_number}`);
      prodUrl = shopifyFile?.url || null;

      if (prodUrl) {
        console.log(`[PAG Webhook] ✅ Fichier prod uploadé : ${prodUrl}`);
      } else {
        // Fallback : sauvegarder localement et servir via Railway
        const localPath = path.join(productionDir, prodFilename);
        fs.writeFileSync(localPath, prodBuffer);
        prodUrl = `${process.env.PUBLIC_BASE_URL}/generated/production/${prodFilename}`;
        console.warn(`[PAG Webhook] Shopify upload échoué, fallback local : ${prodUrl}`);
      }

      previewUrl = p["Aperçu plaque"] || p["_image"] || "";

      // ── 6. Metafields sur la commande ────────────────────────────────────
      await setOrderMetafield(order.id, `prod_url_${lineItemId}`, prodUrl);
      if (previewUrl) {
        await setOrderMetafield(order.id, `preview_url_${lineItemId}`, previewUrl);
      }

      // ── 7. Construire la note de commande ────────────────────────────────
      const colorLabel = {
        "acier-brosse":"Acier brossé","or":"Or","cuivre":"Cuivre",
        "blanc":"Blanc","noir":"Noir","noir-brillant":"Noir brillant",
        "gris":"Gris","noyer":"Noyer","rose":"Rose"
      }[normalizeColor(p["Couleur plaque"] || p["Couleur"] || "")] || "—";

      if (pagType === "bal") {
        notesParts.push(`${sep}
PLAQUE BAL — Item #${lineItemId}
${sep}
Couleur    : ${colorLabel}
Dimension  : ${p["Dimension"] || "—"}
Épaisseur  : ${p["Epaisseur"] || "—"} mm
Police     : ${p["Police"] || "—"}
Alignement : ${p["Alignement"] || "—"}
Texte      : ${[p["Ligne 1"],p["Ligne 2"],p["Ligne 3"],p["Ligne 4"]].filter(Boolean).join(" / ") || "—"}
Logo G     : ${p["_logo_gauche"] || "aucun"}
Logo D     : ${p["_logo_droite"] || "aucun"}
${sep}
📎 Aperçu client  : ${previewUrl || "—"}
🖨️  Fichier prod   : ${prodUrl}
${sep}`);
      } else {
        notesParts.push(`${sep}
PLAQUE RUE — Item #${lineItemId}
${sep}
Couleur    : ${colorLabel}
Dimension  : ${p["Dimension"] || "—"}
Épaisseur  : ${p["Épaisseur"] || "—"} mm
Fixation   : ${p["Fixation"] || "—"}
Numéro     : ${p["Numéro"] || "—"}
Rue        : ${p["Nom de rue"] || [p["Ligne 1 rue"],p["Ligne 2 rue"],p["Ligne 3 rue"]].filter(Boolean).join(" / ") || "—"}
Police     : ${p["Police"] || "—"}
Logo       : ${p["_logo_url"] || "aucun"}
${sep}
📎 Aperçu client  : ${previewUrl || "—"}
🖨️  Fichier prod   : ${prodUrl}
${sep}`);
      }

    } catch (e) {
      console.error(`[PAG Webhook] Erreur item ${lineItemId}:`, e);
      notesParts.push(`${sep}
ERREUR génération — Item #${lineItemId}
${e.message}
${sep}`);
    }
  }

  // ── 8. Écrire la note finale sur la commande ─────────────────────────────
  const noteFinale = `PAG — FICHIERS DE PRODUCTION
Commande  : #${order.order_number}
Client    : ${order.billing_address?.first_name || ""} ${order.billing_address?.last_name || ""} <${order.email}>
Généré le : ${timestamp}

${notesParts.join("\n\n")}`;

  await updateOrderNote(order.id, noteFinale);
  console.log(`[PAG Webhook] ✅ Note + metafields écrits sur commande #${order.order_number}`);
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status:"ok", service:"PAG Railway" }));

// ── OAuth Callback ────────────────────────────────────────────────────────────
app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Pas de code OAuth");
  try {
    const shopDomain   = SHOPIFY_SHOP;
    const clientId     = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const tokenRes     = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ client_id:clientId, client_secret:clientSecret, code }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      res.send(`<html><body style="font-family:sans-serif;padding:40px;max-width:600px">
        <h2>✅ Token Shopify obtenu !</h2>
        <p>Copie ce token dans Railway → Variables → <strong>SHOPIFY_ACCESS_TOKEN</strong></p>
        <textarea style="width:100%;padding:12px;font-size:14px;border:2px solid #444;border-radius:8px" rows="3">${tokenData.access_token}</textarea>
        <p style="color:#888;font-size:13px">Scope : ${tokenData.scope}</p>
      </body></html>`);
    } else {
      res.send("<h2>❌ Erreur</h2><pre>" + JSON.stringify(tokenData, null, 2) + "</pre>");
    }
  } catch (e) { res.status(500).send("Erreur: " + e.message); }
});

// ── Fonts API ─────────────────────────────────────────────────────────────────
app.get("/api/fonts", (req, res) => {
  res.json({ fonts: fontFiles.filter(name => {
    return fs.existsSync(path.join(fontsDir, `${name}.ttf`)) ||
           fs.existsSync(path.join(fontsDir, `${name}.otf`));
  })});
});

app.use("/fonts", express.static(fontsDir));

// ── Variant resolve ───────────────────────────────────────────────────────────
app.post("/api/variant/resolve", checkOrigin, (req, res) => {
  try {
    const { dimension, thickness, color } = req.body || {};
    const dimKey   = normalizeDimension(dimension || "");
    const thickKey = normalizeThickness(thickness || "1.6");
    const colorKey = normalizeColor(color || "acier-brosse");
    const dimData  = VARIANT_MAP[dimKey];
    if (!dimData) return res.status(404).json({ error:`Dimension inconnue: ${dimKey}` });
    const thickData = dimData[thickKey];
    if (!thickData) return res.status(404).json({ error:`Épaisseur inconnue: ${thickKey}` });
    const variantData = thickData[colorKey];
    if (!variantData) return res.status(404).json({ error:`Couleur inconnue: ${colorKey}` });
    res.json({ variantId: variantData.variantId, dimension:dimKey, thickness:thickKey, color:colorKey });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Logos generate / search ───────────────────────────────────────────────────
app.post("/api/logos/search-or-generate", checkOrigin, aiLimiter, async (req, res) => {
  try {
    const { prompt, count=1, forceNew=false } = req.body || {};
    if (!prompt) return res.status(400).json({ error:"prompt requis" });

    const category = detectCategory(prompt);

    if (!forceNew) {
      const { data:existing } = await supabase
        .from("gallery_items").select("*").eq("in_gallery", true)
        .ilike("prompt", `%${prompt.slice(0,20)}%`).limit(3);
      if (existing && existing.length > 0) {
        return res.json({ logos: existing.map(i => ({ url: i.image_url||i.shopify_url, prompt: i.prompt, source:"gallery" })), source:"gallery" });
      }
    }

    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:"OpenAI non configuré" });

    const fullPrompt = `Create a clean monochrome pictogram for laser engraving on personalized plaques. Subject: ${prompt}. Requirements: black artwork only, transparent background, centered subject, no text, bold simple silhouette, low detail, high contrast, ready for engraving, no shadow, no border, no frame.`;

    const response = await openai.images.generate({
      model: "gpt-image-1", prompt: fullPrompt, size:"1024x1024",
      quality:"medium", output_format:"png", background:"transparent", n: Math.min(count, 3)
    });

    const logos = [];
    for (const item of response.data || []) {
      if (!item.b64_json) continue;
      let pngBuffer = Buffer.from(item.b64_json, "base64");
      pngBuffer = await sharp(pngBuffer).flatten({ background:{ r:255,g:255,b:255 } }).threshold(180).negate().ensureAlpha().png().toBuffer();
      const filename = `logo-${Date.now()}-${Math.random().toString(36).slice(2,6)}.png`;
      const shopifyFile = await uploadImageToShopify(pngBuffer, filename, prompt);
      const url = shopifyFile?.url || null;
      if (!url) continue;
      const entry = await saveCreationBatch({ prompt, category, creations:[{ imageUrl:url, shopifyUrl:url, shopifyFileId:shopifyFile?.id }] });
      logos.push({ url, prompt, source:"generated", id:entry[0]?.id });
    }

    res.json({ logos, source:"generated" });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Galerie ───────────────────────────────────────────────────────────────────
app.get("/api/gallery", checkOrigin, async (req, res) => {
  try {
    const category = req.query.category || "tous";
    const items    = await getGalleryItems({ category });
    const allCats  = await getAllGalleryItemsForCategories();
    const cats     = [...new Set(allCats.map(i => i.category).filter(Boolean))];
    res.json({ items, categories:cats, total:items.length });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.get("/api/gallery/random", checkOrigin, async (req, res) => {
  try { res.json({ items: await getRandomGalleryItems(Number(req.query.limit)||12) }); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

app.post("/api/gallery/rate", checkOrigin, rateLimiter, async (req, res) => {
  try {
    const { imageUrl, stars } = req.body || {};
    if (!imageUrl || !stars) return res.status(400).json({ error:"imageUrl + stars requis" });
    const { error } = await supabase.from("gallery_ratings").insert({ image_url:imageUrl, stars:Number(stars), created_at:new Date().toISOString() });
    if (error) throw error;
    const { data, error:avgError } = await supabase.from("gallery_ratings").select("stars").eq("image_url", imageUrl);
    if (avgError || !data?.length) return res.json({ avg:Number(stars), count:1 });
    const count = data.length, avg = data.reduce((s,r)=>s+r.stars,0)/count;
    res.json({ avg:Math.round(avg*10)/10, count });
  } catch (e) { res.status(500).json({ error:"rating error" }); }
});

app.post("/api/gallery/increment-use", checkOrigin, async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error:"imageUrl requis" });
    const { error } = await supabase.rpc("increment_gallery_use", { p_image_url:imageUrl });
    if (error) { await supabase.from("gallery_items").update({ use_count:supabase.raw("use_count + 1") }).eq("image_url", imageUrl); }
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ error:"increment error" }); }
});

app.post("/api/gallery/delete", checkAdminToken, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error:"id requis" });
    const { error } = await supabase.from("gallery_items").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.post("/api/gallery/recategorize", checkAdminToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from("gallery_items").select("id,prompt,category").eq("in_gallery", true);
    if (error) return res.status(500).json({ error:error.message });
    let updated = 0;
    for (const item of data) {
      const newCat = detectCategory(item.prompt || "");
      if (newCat !== item.category) { await supabase.from("gallery_items").update({ category:newCat }).eq("id", item.id); updated++; }
    }
    res.json({ ok:true, total:data.length, updated });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.post("/api/gallery/import-batch", checkAdminToken, async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error:"items[] requis" });
    const results = { success:0, errors:[] };
    const createdAt = new Date().toISOString();
    for (const item of items) {
      const url = (item.url||"").trim(), prompt = (item.prompt||"").trim();
      const category = detectCategory(prompt) !== "divers" ? detectCategory(prompt) : (item.category||"divers");
      if (!url) { results.errors.push({ item, error:"url manquante" }); continue; }
      const entry = { id:`import-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, group_id:`batch-import-${Date.now()}`, created_at:createdAt, prompt:prompt||item.name||"icône", category, in_gallery:true, image_url:url, local_url:null, shopify_url:url, shopify_file_id:null };
      const { error } = await supabase.from("gallery_items").insert(entry);
      if (error) { results.errors.push({ item, error:error.message }); } else { results.success++; }
    }
    res.json({ ok:true, success:results.success, errors:results.errors.length, detail:results.errors });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Upload base64 vers Shopify CDN ───────────────────────────────────────────
app.post("/api/upload-base64", checkOrigin, uploadLimiter, async (req, res) => {
  try {
    const { imageBase64, filename } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error:"imageBase64 requis" });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer     = Buffer.from(base64Data, "base64");
    const fname      = filename || `preview-${Date.now()}.png`;
    const result     = await uploadImageToShopify(buffer, fname, "Aperçu plaque");
    res.json({ ok:true, url:result?.url });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Logo process (suppression fond) ─────────────────────────────────────────
app.post("/api/logo/process", checkOrigin, uploadLimiter, async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error:"imageBase64 requis" });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, "base64");
    const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
    const pixels = new Uint8Array(data);
    const w = info.width, h = info.height;
    let transparentCount = 0;
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i+3] < 30) transparentCount++; }
    const transparentRatio = transparentCount / (w * h);
    const needsProcessing  = transparentRatio < 0.05;
    let processedPixels = Buffer.from(pixels), method = "direct";
    if (needsProcessing) {
      method = "canvas";
      for (let i = 0; i < processedPixels.length; i += 4) {
        const r=processedPixels[i],g=processedPixels[i+1],b=processedPixels[i+2];
        const brightness = r*0.299 + g*0.587 + b*0.114;
        if (r>200 && g>200 && b>200) { processedPixels[i+3]=0; continue; }
        processedPixels[i]=0; processedPixels[i+1]=0; processedPixels[i+2]=0;
        processedPixels[i+3] = Math.min(255, Math.round((1-brightness/255)*255*1.5));
      }
    } else {
      method = "transparent";
      for (let i = 0; i < processedPixels.length; i += 4) {
        if (processedPixels[i+3] < 30) continue;
        processedPixels[i]=0; processedPixels[i+1]=0; processedPixels[i+2]=0;
      }
    }
    const outputBuffer = await sharp(processedPixels, { raw:{ width:w, height:h, channels:4 } }).png().toBuffer();
    const filename     = `client-logo-${Date.now()}.png`;
    const result       = await uploadImageToShopify(outputBuffer, filename, "Logo client");
    res.json({ ok:true, url:result?.url, method });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Réalisations ──────────────────────────────────────────────────────────────
app.post("/api/realized/save", checkOrigin, uploadLimiter, async (req, res) => {
  try {
    const { imageBase64, color, dimension, thickness, leftLogoUrl, rightLogoUrl } = req.body || {};
    if (!imageBase64) return res.json({ ok:true });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, "base64");
    const optimized   = await sharp(inputBuffer).resize(1200, 300, { fit:"inside", withoutEnlargement:true }).png({ compressionLevel:8 }).toBuffer();
    const fileName    = `realized-${(color||"plaque").replace(/[^a-z0-9-]/gi,"")}-${Date.now()}.png`;
    fs.writeFileSync(path.join(productionDir, fileName), optimized);
    const baseUrl   = process.env.PUBLIC_BASE_URL || "https://simulateur-pag.up.railway.app";
    const localUrl  = `${baseUrl}/generated/production/${fileName}`;
    let finalUrl    = localUrl;
    try { const r = await uploadImageToShopify(optimized, fileName, "Réalisation plaque"); if (r?.url) finalUrl = r.url; } catch (e) { console.warn("Realized Shopify upload failed:", e.message); }
    res.json({ ok:true, url:finalUrl });
    if (leftLogoUrl || rightLogoUrl) {
      (async () => { try { await supabase.from("realized_plaques").insert({ image_url:finalUrl, color:color||null, dimension:dimension||null, thickness:thickness||null, left_logo_url:leftLogoUrl||null, right_logo_url:rightLogoUrl||null, created_at:new Date().toISOString() }); } catch (e) { console.warn("Supabase realized error:", e.message); } })();
    }
  } catch (e) { res.json({ ok:false }); }
});

app.post("/api/realized/delete", checkAdminToken, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error:"id requis" });
    const { error } = await supabase.from("realized_plaques").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.get("/api/realized", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit)||100, 500);
    const { data, error } = await supabase.from("realized_plaques").select("id, image_url, color, dimension, thickness, left_logo_url, right_logo_url, created_at").order("created_at", { ascending:false }).limit(limit);
    if (error) return res.status(500).json({ error:error.message });
    res.json({ items: data||[] });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PAG] Serveur démarré sur le port ${PORT}`);
  console.log(`[PAG] ${fontFiles.length} polices configurées`);
  console.log("[PAG] OPENAI_API_KEY :", !!process.env.OPENAI_API_KEY);
  console.log("[PAG] SHOPIFY_STORE  :", !!process.env.SHOPIFY_STORE);
  console.log("[PAG] SUPABASE_URL   :", !!process.env.SUPABASE_URL);
  console.log("[PAG] WEBHOOK_SECRET :", !!process.env.SHOPIFY_WEBHOOK_SECRET);
  console.log("[PAG] ACCESS_TOKEN   :", !!process.env.SHOPIFY_ACCESS_TOKEN);
  console.log("[PAG] ALLOWED_ORIGINS:", process.env.ALLOWED_ORIGINS || "(non configuré)");
});
