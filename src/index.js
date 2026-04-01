import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const generatedDir  = path.join(__dirname, "..", "generated");
const logosDir      = path.join(generatedDir, "logos");
const productionDir = path.join(generatedDir, "production");
const fontsDir      = path.join(__dirname, "fonts");

fs.mkdirSync(logosDir,      { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });

app.use("/generated", express.static(generatedDir));

// ─── Enregistrement de toutes les polices ────────────────────────────────────
// Chaque fichier TTF dans src/fonts/ est enregistré avec son nom de fichier
// (sans extension) comme family name. Ex: "Allura-regular" → family "Allura-regular"
const fontFiles = [
  "Allura-regular",
  "Amandine",
  "Arlrdbd",
  "Baskvill",
  "Bernhc",
  "Calinastiya-demo",
  "Caribbean",
  "Chewy-regular",
  "Chonburi-regular",
  "Coopbl",
  "Dancingscript-regular",
  "Dmserifdisplay-regular",
  "Ea-sports-covers-sc-1-5",
  "Electrolize-regular",
  "Exotc350-bd-bt-bold",
  "Fishermills",
  "Galada-regular",
  "Greatvibes-regular",
  "Hujan",
  "Juliussansone-regular",
  "Justmeagaindownhere",
  "Luxes",
  "Manuscript",
  "Marckscript-regular",
  "Meaculpa-regular",
  "Merienda-regular",
  "Newrocker-regular",
  "Parisienne-regular",
  "Passionone-regular",
  "Playbill",
  "Pompiere-regular",
  "Rammettoone-regular",
  "Rancho-regular",
  "Rye-regular",
  "Sevesbrg",
  "Stardosstencil-bold",
  "Stardosstencil-regular",
  "Sylfaen",
  "Thailand",
  "Viking-n",
  "Waltographui",
  "Wendyone-regular"
];

// Tente TTF puis OTF
for (const name of fontFiles) {
  const ttfPath = path.join(fontsDir, `${name}.ttf`);
  const otfPath = path.join(fontsDir, `${name}.otf`);
  if (fs.existsSync(ttfPath)) {
    GlobalFonts.registerFromPath(ttfPath, name);
    console.log(`Police enregistrée : ${name}`);
  } else if (fs.existsSync(otfPath)) {
    GlobalFonts.registerFromPath(otfPath, name);
    console.log(`Police enregistrée (otf) : ${name}`);
  } else {
    console.warn(`Police introuvable : ${name}.ttf / .otf`);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`;
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function normalizeDimension(value = "") { return String(value).trim().toLowerCase().replaceAll(" ", ""); }
function normalizeThickness(value = "") { return String(value).trim().toLowerCase().replace("mm","").replace(",",".").trim(); }

function normalizeColor(value = "") {
  const v = String(value).trim().toLowerCase();
  const map = {
    "acier brossé":"acier-brosse","acier-brosse":"acier-brosse","acier":"acier-brosse",
    "or brossé":"or","or":"or","cuivre":"cuivre","blanc":"blanc","noir":"noir",
    "noir brillant":"noir-brillant","noir-brillant":"noir-brillant",
    "gris":"gris","noyer":"noyer","rose":"rose"
  };
  return map[v] || v;
}

function hashString(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

function pickGalleryIndex(prompt = "", items = []) {
  if (!Array.isArray(items) || !items.length) return 0;
  return hashString(`${prompt}__${items.map(x => x.fileBase||x.id||x.url||"").join("|")}`) % items.length;
}

async function saveCreationBatch({ prompt, category, creations = [] }) {
  const createdAt = new Date().toISOString();
  const groupId   = `grp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const galIdx    = pickGalleryIndex(prompt, creations);
  const entries   = creations.map((entry, i) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i+1}`,
    group_id: groupId, created_at: createdAt, prompt, category,
    in_gallery: i === galIdx,
    image_url: entry.imageUrl, local_url: entry.localUrl||null,
    shopify_url: entry.shopifyUrl||null, shopify_file_id: entry.shopifyFileId||null
  }));
  const { data, error } = await supabase.from("gallery_items").insert(entries).select();
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data || [];
}

async function getGalleryItems({ category = "tous", limit = 60 } = {}) {
  let q = supabase.from("gallery_items").select("*").eq("in_gallery",true).order("created_at",{ascending:false}).limit(limit);
  if (category && category !== "tous") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw new Error("Impossible de charger la galerie");
  return data || [];
}

async function getAllGalleryItemsForCategories() {
  const { data, error } = await supabase.from("gallery_items").select("category").eq("in_gallery",true);
  if (error) throw new Error("Impossible de charger les catégories");
  return data || [];
}

async function getRandomGalleryItems(limit = 12) {
  const { data, error } = await supabase.from("gallery_items").select("*").eq("in_gallery",true).limit(300);
  if (error) throw new Error("Impossible de charger la galerie aléatoire");
  return [...(data||[])].sort(() => 0.5 - Math.random()).slice(0, limit);
}

const ALLOWED_THICKNESS_BY_COLOR = {
  "acier-brosse":["1.6","3.2"],"or":["1.6","3.2"],"cuivre":["1.6","3.2"],
  "blanc":["1.6","3.2"],"noir":["1.6","3.2"],
  "noir-brillant":["1.6"],"gris":["1.6"],"noyer":["1.6"],"rose":["1.6"]
};

const WHITE_ELEMENTS = ["noir","noir-brillant","gris","noyer","rose"];

const PRODUCTION_WIDTH  = 1181;
const PRODUCTION_HEIGHT = 295;

const VARIANT_MAP = {
  "100x25mm": {
    "1.6": {"acier-brosse":{variantId:53526180430151},"or":{variantId:53556221837639},"cuivre":{variantId:53556222165319},"noir":{variantId:53556222492999},"blanc":{variantId:53556222820679},"noir-brillant":{variantId:53556223148359},"noyer":{variantId:53556223476039},"gris":{variantId:53556223803719},"rose":{variantId:53556224131399}},
    "3.2": {"acier-brosse":{variantId:53526183870791},"or":{variantId:53556221870407},"cuivre":{variantId:53556222198087},"noir":{variantId:53556222525767},"blanc":{variantId:53556222853447}}
  },
  "150x37mm": {
    "1.6": {"acier-brosse":{variantId:53526180462919},"or":{variantId:53556221903175},"cuivre":{variantId:53556222230855},"noir":{variantId:53556222558535},"blanc":{variantId:53556222886215},"noir-brillant":{variantId:53556223213895},"noyer":{variantId:53556223541575},"gris":{variantId:53556223869255},"rose":{variantId:53556224196935}},
    "3.2": {"acier-brosse":{variantId:53526183903559},"or":{variantId:53556221935943},"cuivre":{variantId:53556222263623},"noir":{variantId:53556222591303},"blanc":{variantId:53556222918983}}
  },
  "200x50mm": {
    "1.6": {"acier-brosse":{variantId:53526180495687},"or":{variantId:53556221968711},"cuivre":{variantId:53556222296391},"noir":{variantId:53556222624071},"blanc":{variantId:53556222951751},"noir-brillant":{variantId:53556223279431},"noyer":{variantId:53556223607111},"gris":{variantId:53556223934791},"rose":{variantId:53556224262471}},
    "3.2": {"acier-brosse":{variantId:53526183936327},"or":{variantId:53556222001479},"cuivre":{variantId:53556222329159},"noir":{variantId:53556222656839},"blanc":{variantId:53556222984519}}
  },
  "250x87mm": {
    "1.6": {"acier-brosse":{variantId:53526180528455},"or":{variantId:53556222034247},"cuivre":{variantId:53556222361927},"noir":{variantId:53556222689607},"blanc":{variantId:53556223017287},"noir-brillant":{variantId:53556223344967},"noyer":{variantId:53556223672647},"gris":{variantId:53556224000327},"rose":{variantId:53556224328007}},
    "3.2": {"acier-brosse":{variantId:53526183969095},"or":{variantId:53556222067015},"cuivre":{variantId:53556222394695},"noir":{variantId:53556222722375},"blanc":{variantId:53556223050055}}
  },
  "300x100mm": {
    "1.6": {"acier-brosse":{variantId:53526180561223},"or":{variantId:53556222099783},"cuivre":{variantId:53556222427463},"noir":{variantId:53556222755143},"blanc":{variantId:53556223082823},"noir-brillant":{variantId:53556223410503},"noyer":{variantId:53556223738183},"gris":{variantId:53556224065863},"rose":{variantId:53556224393543}},
    "3.2": {"acier-brosse":{variantId:53526184001863},"or":{variantId:53556222132551},"cuivre":{variantId:53556222460231},"noir":{variantId:53556222787911},"blanc":{variantId:53556223115591}}
  }
};

const CATEGORY_RULES = [
  { key:"animaux",      words:["chien","chat","cheval","lion","tigre","lapin","oiseau","aigle","serpent","rottweiler","berger","bouledogue","caniche","animaux","animal","panda","poisson","requin","éléphant","elephant","tortue","papillon","coq","hibou"] },
  { key:"sport",        words:["football","foot","basket","tennis","rugby","golf","haltère","haltere","musculation","fitness","vélo","velo","cyclisme","boxe","judo","karaté","karate","natation","running","course","sport","ballon","raquette","crossfit","marathon"] },
  { key:"medical",      words:["pharmacie","pharmacien","dentiste","dentaire","stéthoscope","stethoscope","croix médicale","croix medicale","croix pharmacie","medecin","médecin","infirmier","infirmière","infirmiere","vétérinaire","veterinaire","santé","sante","seringue","hôpital","hopital","soin","paramedical","kiné","kine"] },
  { key:"beaute",       words:["coiffeur","coiffure","ciseaux","ongle","ongles","esthétique","esthetique","maquillage","makeup","beauty","beauté","beaute","barbier","barber","massage","spa","shampoing","brosse","salon"] },
  { key:"restauration", words:["pizza","burger","café","cafe","restaurant","fourchette","cuillère","cuillere","couteau","boulangerie","pâtisserie","patisserie","croissant","pain","boisson","vin","cocktail","chef","cuisine","tasse"] },
  { key:"batiment",     words:["maçon","macon","bâtiment","batiment","maison","toit","marteau","clé anglaise","cle anglaise","plombier","électricien","electricien","outils","tournevis","perceuse","construction","artisan","travaux"] },
  { key:"nature",       words:["arbre","fleur","montagne","soleil","lune","forêt","foret","feuille","nature","paysage","nuage","étoile","etoile","rose","plante","rivière","riviere"] },
  { key:"symboles",     words:["logo","icone","icône","minimaliste","symbole","symbol","coeur","cœur","éclair","eclair","flèche","fleche","couronne","croix","badge","blason"] }
];

function detectCategory(prompt = "") {
  const p = String(prompt||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  for (const rule of CATEGORY_RULES) { if (rule.words.some(w => p.includes(w))) return rule.key; }
  return "divers";
}

function getGalleryCategories(items = []) {
  const defaultOrder = ["tous","animaux","sport","medical","beaute","restauration","batiment","nature","symboles","divers"];
  const existing     = new Set(items.map(i => i.category).filter(Boolean));
  const ordered      = defaultOrder.filter(cat => cat === "tous" || existing.has(cat));
  for (const item of existing) { if (!ordered.includes(item)) ordered.push(item); }
  return ordered;
}

function hexToRgb(hex = "#111111") {
  const clean = hex.replace("#","");
  const full  = clean.length === 3 ? clean.split("").map(c=>c+c).join("") : clean;
  return { r:parseInt(full.slice(0,2),16), g:parseInt(full.slice(2,4),16), b:parseInt(full.slice(4,6),16) };
}

async function fetchImageBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Impossible de charger l'image : ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function fitLogo(buffer, boxWidth, boxHeight, colorHex = "#111111") {
  const { r, g, b } = hexToRgb(colorHex);
  const resized = await sharp(buffer).ensureAlpha().trim()
    .resize({ width:boxWidth, height:boxHeight, fit:"contain", withoutEnlargement:true, background:{r:0,g:0,b:0,alpha:0} })
    .png().toBuffer();
  const meta  = await sharp(resized).metadata();
  const logoW = meta.width || boxWidth, logoH = meta.height || boxHeight;
  const alpha = await sharp(resized).ensureAlpha().extractChannel("alpha").toBuffer();
  const colored = await sharp({ create:{width:logoW,height:logoH,channels:3,background:{r,g,b}} }).joinChannel(alpha).png().toBuffer();
  const left = Math.max(0, Math.round((boxWidth-logoW)/2)), top = Math.max(0, Math.round((boxHeight-logoH)/2));
  return sharp({ create:{width:boxWidth,height:boxHeight,channels:4,background:{r:0,g:0,b:0,alpha:0}} })
    .composite([{ input:colored, left, top }]).png().toBuffer();
}

// ─── Mapping fontKey → family name (identique au fichier TTF sans extension) ─
function getFontName(fontKey = "Allura-regular") {
  // fontKey EST directement le nom du fichier sans extension
  // Ex: "Allura-regular" → police "Allura-regular" enregistrée au démarrage
  if (fontFiles.includes(fontKey)) return fontKey;
  // Fallback si police inconnue
  return fontFiles[0] || "sans-serif";
}

// ─── TEXTE PRODUCTION via @napi-rs/canvas ────────────────────────────────────
function buildProductionTextCanvas({ width, height, line1="", line2="", line3="", fontFamilies={} }) {
  const lines = [
    { key:"line1", text:String(line1||"").trim() },
    { key:"line2", text:String(line2||"").trim() },
    { key:"line3", text:String(line3||"").trim() }
  ].filter(l => l.text.length > 0);

  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  if (!lines.length) return canvas.toBuffer("image/png");

  const lineCount = lines.length;

  let baseFontSize;
  if (lineCount === 1)      baseFontSize = height * 0.62;
  else if (lineCount === 2) baseFontSize = height * 0.38;
  else                      baseFontSize = height * 0.26;

  const maxTextWidth = width * 0.94;

  // Calcul taille optimale par dichotomie pour chaque ligne indépendamment
  const lineFontSizes = lines.map(line => {
    const fontName = getFontName(fontFamilies[line.key] || fontFiles[0]);
    let lo = 10, hi = Math.round(baseFontSize);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      ctx.font = `700 ${mid}px "${fontName}"`;
      if (ctx.measureText(line.text).width <= maxTextWidth) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(lo, Math.round(height * 0.08));
  });

  // On prend la taille minimum pour que toutes les lignes rentrent
  const fontSize = Math.min(...lineFontSizes);

  const lineGap = Math.round(fontSize * 1.25);
  const totalH  = lineGap * lineCount;
  const startY  = Math.round((height - totalH) / 2 + fontSize * 0.82);

  ctx.fillStyle    = "#111111";
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";

  lines.forEach((line, i) => {
    const fontName = getFontName(fontFamilies[line.key] || fontFiles[0]);
    ctx.font = `700 ${fontSize}px "${fontName}"`;
    ctx.fillText(line.text, Math.round(width / 2), startY + i * lineGap);
  });

  return canvas.toBuffer("image/png");
}
// ─────────────────────────────────────────────────────────────────────────────

async function buildProductionComposite({ line1="", line2="", line3="", leftLogoUrl=null, rightLogoUrl=null, fontFamilies={} }) {
  const width = PRODUCTION_WIDTH, height = PRODUCTION_HEIGHT;
  const base  = sharp({ create:{ width, height, channels:4, background:{r:0,g:0,b:0,alpha:0} } });
  const composites = [];
  const hasLeft = !!leftLogoUrl, hasRight = !!rightLogoUrl;
  const logoZoneW = Math.round(width * 0.20), logoBoxH = Math.round(height * 0.97);

  let textLeft = 0, textWidth = width;
  if (hasLeft && !hasRight)  { textLeft = logoZoneW;    textWidth = width - logoZoneW; }
  if (!hasLeft && hasRight)  { textLeft = 0;            textWidth = width - logoZoneW; }
  if (hasLeft && hasRight)   { textLeft = logoZoneW;    textWidth = width - logoZoneW * 2; }

  if (leftLogoUrl) {
    const logo = await fitLogo(await fetchImageBuffer(leftLogoUrl), logoZoneW, logoBoxH, "#111111");
    composites.push({ input:logo, left:0, top:Math.round((height-logoBoxH)/2) });
  }
  if (rightLogoUrl) {
    const logo = await fitLogo(await fetchImageBuffer(rightLogoUrl), logoZoneW, logoBoxH, "#111111");
    composites.push({ input:logo, left:width-logoZoneW, top:Math.round((height-logoBoxH)/2) });
  }

  const textBuffer = buildProductionTextCanvas({ width:textWidth, height, line1, line2, line3, fontFamilies });
  composites.push({ input:textBuffer, left:textLeft, top:0 });

  return base.composite(composites).png().toBuffer();
}

let shopifyTokenCache = { accessToken:null, expiresAt:0 };

async function getShopifyAdminAccessToken() {
  const shop=process.env.SHOPIFY_STORE, clientId=process.env.SHOPIFY_CLIENT_ID, clientSecret=process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop||!clientId||!clientSecret) throw new Error("Variables Shopify manquantes");
  const now = Date.now();
  if (shopifyTokenCache.accessToken && now < shopifyTokenCache.expiresAt-60000) return shopifyTokenCache.accessToken;
  const body = new URLSearchParams({ grant_type:"client_credentials", client_id:clientId, client_secret:clientSecret });
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:body.toString() });
  const data = await r.json();
  if (!r.ok || !data?.access_token) throw new Error("Impossible d'obtenir le token Admin Shopify");
  shopifyTokenCache.accessToken = data.access_token;
  shopifyTokenCache.expiresAt   = now + ((Number(data.expires_in)||86399)*1000);
  return shopifyTokenCache.accessToken;
}

async function shopifyGraphQL(query, variables={}) {
  const shop=process.env.SHOPIFY_STORE, version=process.env.SHOPIFY_API_VERSION||"2025-01";
  const token = await getShopifyAdminAccessToken();
  const r = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method:"POST", headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token}, body:JSON.stringify({query,variables})
  });
  const data = await r.json();
  if (!r.ok || data.errors) throw new Error("Erreur GraphQL Shopify");
  return data.data;
}

async function wait(ms) { return new Promise(r => setTimeout(r,ms)); }

async function getShopifyFileById(fileId) {
  const data = await shopifyGraphQL(`query getFile($id:ID!){node(id:$id){__typename...on MediaImage{id alt fileStatus status image{url}preview{image{url}}}...on GenericFile{id alt fileStatus url preview{image{url}}}}}`,{id:fileId});
  return data?.node||null;
}

async function waitForShopifyFileReady(fileId, maxAttempts=30, delayMs=2000) {
  for (let i=1;i<=maxAttempts;i++) {
    const file = await getShopifyFileById(fileId);
    if (!file) throw new Error("Fichier Shopify introuvable");
    const url = file?.image?.url||file?.preview?.image?.url||file?.url||null;
    if (url) return { id:file.id, url };
    if (file.status==="FAILED"||file.fileStatus==="FAILED") throw new Error("Traitement Shopify échoué");
    await wait(delayMs);
  }
  throw new Error("Timeout Shopify");
}

async function uploadImageToShopify(buffer, filename, alt="") {
  const mimeType = "image/png";
  const staged = await shopifyGraphQL(`mutation stagedUploadsCreate($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{field message}}}`,
    {input:[{filename,mimeType,httpMethod:"POST",resource:"FILE",fileSize:String(buffer.length)}]});
  const sp = staged.stagedUploadsCreate;
  if (sp.userErrors?.length) throw new Error(sp.userErrors[0].message);
  const target = sp.stagedTargets[0];
  const form = new FormData();
  target.parameters.forEach(p => form.append(p.name,p.value));
  form.append("file", new Blob([buffer],{type:mimeType}), filename);
  const uploadRes = await fetch(target.url,{method:"POST",body:form});
  if (!uploadRes.ok) throw new Error(`Upload Shopify échoué: ${await uploadRes.text()}`);
  const fc = await shopifyGraphQL(`mutation fileCreate($files:[FileCreateInput!]!){fileCreate(files:$files){files{__typename...on MediaImage{id alt fileStatus status image{url}preview{image{url}}}...on GenericFile{id alt fileStatus url preview{image{url}}}}userErrors{field message}}}`,
    {files:[{alt,contentType:"IMAGE",originalSource:target.resourceUrl}]});
  const fp = fc.fileCreate;
  if (fp.userErrors?.length) throw new Error(fp.userErrors[0].message);
  const created = fp.files?.[0];
  if (!created?.id) throw new Error("Fichier Shopify sans identifiant");
  const immediateUrl = created?.image?.url||created?.preview?.image?.url||created?.url||null;
  if (immediateUrl) return { id:created.id, url:immediateUrl };
  const ready = await waitForShopifyFileReady(created.id);
  return { id:ready.id, url:ready.url };
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

app.get("/",       (req,res) => res.json({ ok:true, message:"Serveur configurateur plaque en ligne" }));
app.get("/health", (req,res) => res.json({ ok:true }));

// Route pour exposer la liste des polices disponibles au configurateur
app.get("/api/fonts", (req,res) => res.json({ fonts: fontFiles }));

app.post("/api/logos/search-or-generate", async (req,res) => {
  try {
    const { prompt, count=3 } = req.body||{};
    const cleanPrompt = String(prompt||"").trim();
    const imageCount  = Math.max(1,Math.min(Number(count)||3,3));
    if (!cleanPrompt) return res.status(400).json({ code:"MISSING_PROMPT", error:"Prompt image manquant." });
    const baseUrl     = getBaseUrl(req);
    const finalPrompt = ["Créer un pictogramme noir pour gravure laser.","Fond totalement transparent.","Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.","Style pictogramme professionnel, lignes franches, peu de détails fins.","Ne pas ajouter de texte ni de cadre.",`Sujet: ${cleanPrompt}`].join(" ");
    const result   = await openai.images.generate({ model:"gpt-image-1", prompt:finalPrompt, size:"1024x1024", background:"transparent", output_format:"png", quality:"medium", n:imageCount });
    const logos=[], creationsToSave=[];
    const category = detectCategory(cleanPrompt);
    for (let i=0;i<(result.data||[]).length;i++) {
      const item = result.data[i];
      if (!item.b64_json) continue;
      const fileBase=`${Date.now()}-${slugify(cleanPrompt)}-${i+1}`, fileName=`${fileBase}.png`;
      const buffer = Buffer.from(item.b64_json,"base64");
      fs.writeFileSync(path.join(logosDir,fileName), buffer);
      let shopifyUrl=null, shopifyFileId=null;
      try { const u=await uploadImageToShopify(buffer,fileName,`Logo IA: ${cleanPrompt}`); shopifyUrl=u.url; shopifyFileId=u.id; } catch(e) { console.error("Shopify upload failed:",e.message); }
      const localUrl=`${baseUrl}/generated/logos/${fileName}`, finalUrl=shopifyUrl||localUrl;
      creationsToSave.push({fileBase,imageUrl:finalUrl,localUrl,shopifyUrl,shopifyFileId});
      logos.push({id:fileBase,url:finalUrl,localUrl,shopifyUrl,shopifyFileId,category});
    }
    if (creationsToSave.length) await saveCreationBatch({prompt:cleanPrompt,category,creations:creationsToSave});
    return res.json({ logos });
  } catch(error) {
    console.error("Erreur /api/logos/search-or-generate :",error);
    const raw=String(error?.message||"").toLowerCase(), status=Number(error?.status||500);
    if (status===429||raw.includes("rate limit")||raw.includes("too many")) return res.status(429).json({code:"RATE_LIMIT",error:"La génération est momentanément très sollicitée. Merci de réessayer dans quelques secondes."});
    if (raw.includes("quota")||raw.includes("billing")||raw.includes("insufficient")||raw.includes("credit")) return res.status(503).json({code:"BILLING_UNAVAILABLE",error:"Le service de génération est momentanément indisponible."});
    if (raw.includes("api key")||raw.includes("unauthorized")||status===401) return res.status(503).json({code:"AUTH_ERROR",error:"Le service de génération est momentanément indisponible."});
    return res.status(500).json({code:"GENERIC_GENERATION_ERROR",error:"Une erreur est survenue. Merci de réessayer."});
  }
});

app.post("/api/render/production", async (req,res) => {
  try {
    const { line1="", line2="", line3="", color="blanc", dimension="100x25mm", thickness="1.6", leftLogoUrl=null, rightLogoUrl=null, fontFamilies={} } = req.body||{};
    const baseUrl = getBaseUrl(req);
    const productionBuffer = await buildProductionComposite({ line1, line2, line3, leftLogoUrl, rightLogoUrl, fontFamilies });
    const fileName = `${Date.now()}-production-${slugify(dimension)}-${slugify(color)}-${normalizeThickness(thickness)}-${Math.random().toString(36).slice(2,8)}.png`;
    fs.writeFileSync(path.join(productionDir,fileName), productionBuffer);
    const localUrl = `${baseUrl}/generated/production/${fileName}`;
    let shopifyUrl=null, shopifyFileId=null;
    try {
      const altText = [`Plaque ${dimension}`,color,thickness+"mm",line1,line2,line3].filter(Boolean).join(" | ");
      const uploaded = await uploadImageToShopify(productionBuffer,fileName,altText);
      shopifyUrl=uploaded.url; shopifyFileId=uploaded.id;
    } catch(e) { console.error("Shopify production upload failed:",e.message); }
    return res.json({ url:shopifyUrl||localUrl, shopifyUrl, shopifyFileId, localUrl });
  } catch(error) {
    console.error("Erreur /api/render/production :",error);
    return res.status(500).json({ error:error?.message||"Erreur interne génération production." });
  }
});

app.post("/api/variant/resolve", async (req,res) => {
  try {
    const dimension=normalizeDimension(req.body?.dimension||""), thickness=normalizeThickness(req.body?.thickness||""), color=normalizeColor(req.body?.color||"");
    if (!dimension||!thickness||!color) return res.status(400).json({error:"Dimension, épaisseur ou couleur manquante."});
    const allowed = ALLOWED_THICKNESS_BY_COLOR[color];
    if (!allowed) return res.status(404).json({error:"Couleur introuvable."});
    if (!allowed.includes(thickness)) return res.status(400).json({error:`L'épaisseur ${thickness} mm n'est pas disponible pour la couleur ${color}.`});
    const found = VARIANT_MAP?.[dimension]?.[thickness]?.[color];
    if (!found) return res.status(404).json({error:"Variant introuvable pour cette combinaison."});
    return res.json(found);
  } catch(error) { console.error("Erreur /api/variant/resolve :",error); return res.status(500).json({error:"Erreur interne variant."}); }
});

app.get("/api/gallery/categories", async (req,res) => {
  try { res.json({ categories:getGalleryCategories(await getAllGalleryItemsForCategories()) }); }
  catch(e) { console.error(e); res.status(500).json({error:"gallery categories error"}); }
});

app.get("/api/gallery", async (req,res) => {
  try {
    const cat = String(req.query.category||"tous").toLowerCase().trim();
    const itemsRaw = await getGalleryItems({category:cat,limit:60});
    const allForCats = await getAllGalleryItemsForCategories();
    const items = itemsRaw.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:cat||"tous"});
  } catch(e) { console.error(e); res.status(500).json({error:"gallery error"}); }
});

app.get("/api/gallery/random", async (req,res) => {
  try {
    const randomItems = await getRandomGalleryItems(12);
    const allForCats  = await getAllGalleryItemsForCategories();
    const items = randomItems.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:"tous"});
  } catch(e) { console.error(e); res.status(500).json({error:"gallery error"}); }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Production canvas fixe : ${PRODUCTION_WIDTH}x${PRODUCTION_HEIGHT}px (100x25mm)`);
  console.log(`${fontFiles.length} polices configurées`);
  console.log("OPENAI_API_KEY présente :", !!process.env.OPENAI_API_KEY);
  console.log("SHOPIFY_STORE présent :", !!process.env.SHOPIFY_STORE);
  console.log("SUPABASE_URL présent :", !!process.env.SUPABASE_URL);
});
