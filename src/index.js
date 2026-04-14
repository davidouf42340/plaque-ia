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
app.use(express.json({ limit: "50mb" }));

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

// ─── Enregistrement des polices ──────────────────────────────────────────────
const fontFiles = [
  "Allura","Amandine","Arlrdbd","Baskvill","Bernhc","Calinastiya",
  "Caribbean","Chewy","Chonburi","Coopbl","Dancingscript",
  "Dmserifdisplay","Sport","Electrolize",
  "Exotic","Fishermills","Galada","Greatvibes","Hujan",
  "Julius","Justme","Luxes","Manuscript","Marckscript",
  "Meaculpa","Merienda","Newrocker","Parisienne",
  "Passionone","Playbill","Pompiere","Rammettoone","Rancho",
  "Rye","Seves","Sylfaen",
  "Walto","Wendy"
];

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
    console.warn(`Police introuvable : ${name}`);
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

async function getGalleryItems({ category = "tous", limit = 500 } = {}) {
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
  { key:"animaux",      words:["chien","chat","cheval","lion","tigre","lapin","oiseau","aigle","serpent","rottweiler","berger","bouledogue","caniche","animaux","animal","panda","poisson","requin","éléphant","elephant","tortue","papillon","coq","hibou","cochon","vache","mouton","loup","renard","cerf","dauphin","baleine","crabe","homard","singe","gorille","girafe","zèbre","zebre","rhinocéros","rhinoceros","hippopotame","crocodile","alligator","grenouille","lizard","lézard","ara","perroquet","flamant","pingouin","manchot","ours","panda","koala","kangourou","loutre","castor","écureuil","ecureuil","hérisson","herisson","armadillo","chauve-souris","chauve souris","mante","abeille","papillon","libellule","araignée","araignee","scorpion","tortue","cameleon","caméléon"] },
  { key:"sport",        words:["football","foot","basket","basketball","tennis","rugby","golf","haltère","haltere","musculation","fitness","vélo","velo","cyclisme","boxe","judo","karaté","karate","natation","running","course","sport","ballon","raquette","crossfit","marathon","ski","snowboard","surf","skateboard","roller","escalade","tir à l'arc","escrime","équitation","equitation","gym","gymnaste","handball","volleyball","volley","badminton","ping pong","bowling","billard","fléchettes","flechettes","poids","barbell","dumbbell","tapis","yoga","pilates","danse","athletisme","atletisme","sprint","saut","javelot","disque","perche","lutte","mma","taekwondo","aïkido","aikido","kung fu","capoeira"] },
  { key:"medical",      words:["pharmacie","pharmacien","dentiste","dentaire","stéthoscope","stethoscope","croix médicale","croix medicale","croix pharmacie","medecin","médecin","infirmier","infirmière","infirmiere","vétérinaire","veterinaire","santé","sante","seringue","hôpital","hopital","soin","paramedical","kiné","kine","pilule","médicament","medicament","ambulance","urgence","scalpel","bistouri","pince","compresse","bandage","plâtre","platre","fauteuil roulant","béquille","bequille","opticien","lunettes","otite","cardiologie","coeur","anatomie","squelette","os","dent","thermomètre","thermometre","tension","pression","sang","analyses","laboratoire","labo","radio","scanner","irm","psychologue","psy","cabinet","clinique"] },
  { key:"beaute",       words:["coiffeur","coiffure","ciseaux","ongle","ongles","esthétique","esthetique","maquillage","makeup","beauty","beauté","beaute","barbier","barber","massage","spa","shampoing","brosse","salon","peigne","sèche-cheveux","seche cheveux","fer à lisser","fer a lisser","boucleur","rasoir","mousse","gel","vernis","rouge à lèvres","rouge a levres","fond de teint","mascara","eye-liner","eyeliner","sourcils","cils","épilation","epilation","manucure","pédicure","pedicure","beauty","lash","nail","tatouage","piercing","dermatologue","crème","creme","lotion","parfum","eau de toilette"] },
  { key:"restauration", words:["pizza","burger","café","cafe","restaurant","fourchette","cuillère","cuillere","couteau","boulangerie","pâtisserie","patisserie","croissant","pain","boisson","vin","cocktail","chef","cuisine","tasse","assiette","verre","bouteille","bière","biere","champagne","whisky","sushi","pâtes","pates","salade","soupe","gâteau","gateau","dessert","chocolat","glace","confiserie","épicerie","epicerie","marché","marche","traiteur","snack","kebab","tacos","crêpe","crepe","gaufre","waffle","barbecue","bbq","steakhouse","rôtisserie","rotisserie","poissonnerie","boucherie","charcuterie","fromagerie","bar","brasserie","taverne","auberge","hôtel","hotel","fast food","fast-food","drive"] },
  { key:"batiment",     words:["maçon","macon","bâtiment","batiment","maison","toit","marteau","clé anglaise","cle anglaise","plombier","électricien","electricien","outils","tournevis","perceuse","construction","artisan","travaux","peintre","peinture","menuisier","menuiserie","charpente","charpentier","couvreur","toiture","carreleur","carrelage","vitrier","vitrerie","serrurier","serrure","chauffagiste","climatisation","clim","isolation","insulation","façade","facade","terrassier","terrassement","génie civil","genie civil","ingénieur","ingenieur","architecte","architecture","grues","grue","bulldozer","pelleteuse","niveau","équerre","equerre","mètre","metre","règle","regle","cordeau","brouette","ciment","béton","beton","brique","parpaing","acier","ferrailleur","soudeur","soudure","démolition","demolition","rénovation","renovation","agrandissement","extension","villa","immeuble","appartement","chantier","plan","blueprint"] },
  { key:"nature",       words:["arbre","fleur","montagne","soleil","lune","forêt","foret","feuille","nature","paysage","nuage","étoile","etoile","rose","plante","rivière","riviere","ocean","mer","vague","plage","sable","désert","desert","savane","jungle","tropique","palmier","bambou","cactus","herbe","prairie","colline","vallée","vallee","volcan","glacier","cascade","lac","étang","etang","marais","tourbière","tourbi","champignon","mousse","lichen","pin","chêne","chene","bouleau","sapin","cerisier","lavande","tournesol","coquelicot","marguerite","tulipe","orchidée","orchidee","lotus","nénuphar","nenuphar","algue","corail","mangrove","terrier","nid","ruche","toile araignée","toile araignee","météore","meteor","arc-en-ciel","aurore","brouillard","rosée","rosee","givre","neige","glace","vent","tempête","tempete"] },
  { key:"symboles",     words:["logo","icone","icône","minimaliste","symbole","symbol","coeur","cœur","éclair","eclair","flèche","fleche","couronne","croix","badge","blason","bouclier","épée","epee","bouclier","ancre","boussole","globe","monde","paix","infini","yin yang","étoile de david","croissant","om","trèfle","trefle","fer à cheval","fer a cheval","dreamcatcher","mandala","caducée","caducee","balance","justice","phare","clef","clé","cle","cadenas","cadre","ruban","nœud","noeud","aile","plume","main","poing","pouce","œil","oeil","pyramide","triangle","hexagone","octogone","cercle","spiral","galaxie","cosmos","atome","molécule","molecule","dna","adn","code","circuit","robot","intelligence artificielle","ia","wifi","bluetooth","numérique","numerique"] }
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

async function fetchImageBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Impossible de charger l'image : ${url}`);
  return Buffer.from(await r.arrayBuffer());
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
app.get("/api/fonts", (req,res) => res.json({ fonts: fontFiles }));

// ── Sert les fichiers TTF au navigateur client pour FontFace API ─────────────
app.get("/fonts/:fontName", (req, res) => {
  const name     = req.params.fontName;
  const safeName = path.basename(name); // sécurité : pas de path traversal
  const ttfPath  = path.join(fontsDir, safeName);
  const otfPath  = path.join(fontsDir, safeName.replace(/\.ttf$/i, ".otf"));

  if (fs.existsSync(ttfPath)) {
    res.setHeader("Content-Type", "font/ttf");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(ttfPath);
  }
  if (fs.existsSync(otfPath)) {
    res.setHeader("Content-Type", "font/otf");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(otfPath);
  }
  return res.status(404).json({ error: `Police introuvable : ${safeName}` });
});
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/fonts/debug", (req,res) => {
  try { res.json({ fontsDir, files:fs.readdirSync(fontsDir), count:fs.readdirSync(fontsDir).length }); }
  catch(e) { res.json({ error:e.message, fontsDir }); }
});

app.post("/api/logos/search-or-generate", async (req,res) => {
  try {
    const { prompt, count=3 } = req.body||{};
    const cleanPrompt = String(prompt||"").trim();
    const imageCount  = Math.max(1,Math.min(Number(count)||3,3));
    if (!cleanPrompt) return res.status(400).json({ code:"MISSING_PROMPT", error:"Prompt image manquant." });
    const baseUrl     = getBaseUrl(req);
    const finalPrompt = [
  "Créer un pictogramme noir pour gravure laser.",
  "Fond totalement transparent.",
  "Visuel simple, propre, centré, lisible, sans décor, sans ombre, sans fond.",
  "Style pictogramme professionnel, lignes franches, peu de détails fins.",
  "Ne pas ajouter de texte ni de cadre.",
  `Sujet: ${cleanPrompt}`
].join(" ");
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

// ─── /api/render/production-from-image ───────────────────────────────────────
// Reçoit le PNG base64 capturé par html2canvas.
// Supprime le fond clair → transparent, met les éléments en noir #111111.
app.post("/api/render/production-from-image", async (req, res) => {
  try {
    const {
      imageBase64,
      color        = "blanc",
      dimension    = "100x25mm",
      thickness    = "1.6",
      line1        = "",
      line2        = "",
      line3        = "",
      flippedLeft  = false,
      flippedRight = false
    } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 manquant." });
    }

    const baseUrl = getBaseUrl(req);

    // ── Extraction robuste du base64 ─────────────────────────────────────────
    let base64Data = imageBase64;
    const commaIndex = imageBase64.indexOf(",");
    if (commaIndex !== -1) {
      base64Data = imageBase64.slice(commaIndex + 1);
    }
    // Nettoyage des caractères invalides base64
    base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, "");

    if (!base64Data || base64Data.length < 100) {
      return res.status(400).json({ error: "Image base64 invalide ou vide." });
    }

    const inputBuffer = Buffer.from(base64Data, "base64");
    console.log(`Production image buffer : ${inputBuffer.length} bytes`);

    if (inputBuffer.length < 100) {
      return res.status(400).json({ error: "Buffer image trop petit, capture échouée." });
    }

    // ── Traitement Sharp : fond → transparent, éléments → noir ───────────────
    const meta = await sharp(inputBuffer).metadata();
    const { width, height } = meta;

    const { data: rawPixels } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels      = Buffer.from(rawPixels);
    const totalPixels = width * height;

    for (let i = 0; i < totalPixels; i++) {
      const o = i * 4;
      const r = pixels[o], g = pixels[o+1], b = pixels[o+2], a = pixels[o+3];

      // Pixel transparent → on garde transparent
      if (a < 30) {
        pixels[o] = pixels[o+1] = pixels[o+2] = pixels[o+3] = 0;
        continue;
      }

      // Luminosité
      const lum = r * 0.299 + g * 0.587 + b * 0.114;

      if (lum > 180) {
        // Fond clair → transparent
        pixels[o] = pixels[o+1] = pixels[o+2] = pixels[o+3] = 0;
      } else {
        // Élément foncé → noir opaque
        pixels[o] = pixels[o+1] = pixels[o+2] = 17;
        pixels[o+3] = 255;
      }
    }

    const productionBuffer = await sharp(pixels, {
      raw: { width, height, channels: 4 }
    }).png().toBuffer();

    // Sauvegarde locale
    // Nommage : couleur-dimension-epaisseur-timestamp
    const timestamp = new Date().toISOString().replace(/[-:T]/g,"").slice(0,14);
    const fileName  = `${slugify(color)}-${slugify(dimension)}-${normalizeThickness(thickness)}mm-${timestamp}.png`;
    fs.writeFileSync(path.join(productionDir, fileName), productionBuffer);
    const localUrl = `${baseUrl}/generated/production/${fileName}`;

    // Upload Shopify
    let shopifyUrl = null, shopifyFileId = null;
    try {
      const altText = [`Plaque ${dimension}`, color, thickness+"mm", line1, line2, line3].filter(Boolean).join(" | ");
      const uploaded = await uploadImageToShopify(productionBuffer, fileName, altText);
      shopifyUrl    = uploaded.url;
      shopifyFileId = uploaded.id;
    } catch(e) {
      console.error("Shopify production upload failed:", e.message);
    }

    return res.json({
      url:           shopifyUrl || localUrl,
      shopifyUrl,
      shopifyFileId,
      localUrl
    });

  } catch(error) {
    console.error("Erreur /api/render/production-from-image :", error);
    return res.status(500).json({ error: error?.message || "Erreur interne génération production." });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

const RUE_VARIANT_MAP = {
  "150x100mm": {
    "1.6mm - À coller": {"acier-brosse":{variantId:53672841478471},"or":{variantId:53672841511239},"cuivre":{variantId:53672841544007},"blanc":{variantId:53672841576775},"noir":{variantId:53672841609543},"gris":{variantId:53672841642311},"noyer":{variantId:53672841675079},"rose":{variantId:53672841707847}},
    "1.6mm - À fixer":  {"acier-brosse":{variantId:53672841740615},"or":{variantId:53672841773383},"cuivre":{variantId:53672841806151},"blanc":{variantId:53672841838919},"noir":{variantId:53672841871687}},
    "3.2mm - À coller": {"acier-brosse":{variantId:53672841904455},"or":{variantId:53672841937223},"cuivre":{variantId:53672841969991},"blanc":{variantId:53672842002759},"noir":{variantId:53672842035527}},
    "3.2mm - À fixer":  {"acier-brosse":{variantId:53672842068295},"or":{variantId:53672842101063},"cuivre":{variantId:53672842133831},"blanc":{variantId:53672842166599},"noir":{variantId:53672842199367}}
  },
  "200x133mm": {
    "1.6mm - À coller": {"acier-brosse":{variantId:53672935194951},"or":{variantId:53672935227719},"cuivre":{variantId:53672935260487},"blanc":{variantId:53672935293255},"noir":{variantId:53672935326023},"gris":{variantId:53672935358791},"noyer":{variantId:53672935391559},"rose":{variantId:53672935424327}},
    "3.2mm - À coller": {"acier-brosse":{variantId:53672935457095},"or":{variantId:53672935489863},"cuivre":{variantId:53672935522631},"blanc":{variantId:53672935555399},"noir":{variantId:53672935588167}},
    "3.2mm - À fixer":  {"acier-brosse":{variantId:53672935620935},"or":{variantId:53672935653703},"cuivre":{variantId:53672935686471},"blanc":{variantId:53672935719239},"noir":{variantId:53672935752007}}
  },
  "250x167mm": {
    "1.6mm - À coller": {"acier-brosse":{variantId:53672935784775},"or":{variantId:53672935817543},"cuivre":{variantId:53672935850311},"blanc":{variantId:53672935883079},"noir":{variantId:53672935915847},"gris":{variantId:53672935948615},"noyer":{variantId:53672935981383},"rose":{variantId:53672936014151}},
    "3.2mm - À coller": {"acier-brosse":{variantId:53672936046919},"or":{variantId:53672936079687},"cuivre":{variantId:53672936112455},"blanc":{variantId:53672936145223},"noir":{variantId:53672936177991}},
    "3.2mm - À fixer":  {"acier-brosse":{variantId:53672936210759},"or":{variantId:53672936243527},"cuivre":{variantId:53672936276295},"blanc":{variantId:53672936309063},"noir":{variantId:53672936341831}}
  },
  "300x200mm": {
    "1.6mm - À coller": {"acier-brosse":{variantId:53672936374599},"or":{variantId:53672936407367},"cuivre":{variantId:53672936440135},"blanc":{variantId:53672936472903},"noir":{variantId:53672936505671},"gris":{variantId:53672936538439},"noyer":{variantId:53672936571207},"rose":{variantId:53672936603975}},
    "3.2mm - À coller": {"acier-brosse":{variantId:53672936636743},"or":{variantId:53672936669511},"cuivre":{variantId:53672936702279},"blanc":{variantId:53672936735047},"noir":{variantId:53672936767815}},
    "3.2mm - À fixer":  {"acier-brosse":{variantId:53672936800583},"or":{variantId:53672936833351},"cuivre":{variantId:53672936866119},"blanc":{variantId:53672936898887},"noir":{variantId:53672936931655}}
  }
};

app.post("/api/variant/resolve", async (req,res) => {
  try {
    const dimension=normalizeDimension(req.body?.dimension||""), thickness=normalizeThickness(req.body?.thickness||""), color=normalizeColor(req.body?.color||"");
    const fixation = req.body?.fixation || null;
    const productHandle = req.body?.productHandle || null;

    if (!dimension||!thickness||!color) return res.status(400).json({error:"Dimension, épaisseur ou couleur manquante."});

    // Plaque de rue — RUE_VARIANT_MAP
    if (productHandle && productHandle.includes("rue")) {
      const epFix = thickness+"mm - "+(fixation==="fixer"?"À fixer":"À coller");
      const found = RUE_VARIANT_MAP?.[dimension]?.[epFix]?.[color];
      if (found) return res.json(found);
      return res.status(404).json({error:`Variant rue introuvable: ${dimension} / ${epFix} / ${color}`});
    }

    // Plaque BAL — VARIANT_MAP
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
    const itemsRaw = await getGalleryItems({category:cat,limit:500});
    const allForCats = await getAllGalleryItemsForCategories();
    const items = itemsRaw.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:cat||"tous"});
  } catch(e) { console.error(e); res.status(500).json({error:"gallery error"}); }
});

app.get("/api/gallery/random", async (req,res) => {
  try {
    const randomItems = await getRandomGalleryItems(500);
    const allForCats  = await getAllGalleryItemsForCategories();
    const items = randomItems.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:"tous"});
  } catch(e) { console.error(e); res.status(500).json({error:"gallery error"}); }
});

// ── /api/gallery/rate ─────────────────────────────────────────────────────
// Enregistre une note (1-5 étoiles) anonyme dans Supabase
// Table attendue : gallery_ratings (id, image_url, stars, created_at)
// Note moyenne calculée côté serveur et renvoyée au client
app.post("/api/gallery/rate", async (req, res) => {
  try {
    const { imageUrl, stars } = req.body || {};
    if (!imageUrl || !stars || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "imageUrl et stars (1-5) requis" });
    }

    // Insère ou met à jour le vote (on stocke chaque vote, pas d'identifiant user)
    const { error: insertError } = await supabase
      .from("gallery_ratings")
      .insert({ image_url: imageUrl, stars: Number(stars) });

    if (insertError) {
      console.error("Rate insert error:", insertError.message);
      // Si la table n'existe pas encore, on renvoie quand même un résultat
      return res.json({ avg: Number(stars), count: 1 });
    }

    // Calcule la moyenne pour cette image
    const { data, error: avgError } = await supabase
      .from("gallery_ratings")
      .select("stars")
      .eq("image_url", imageUrl);

    if (avgError || !data || !data.length) {
      return res.json({ avg: Number(stars), count: 1 });
    }

    const count = data.length;
    const avg   = data.reduce((sum, r) => sum + r.stars, 0) / count;
    res.json({ avg: Math.round(avg * 10) / 10, count });

  } catch (e) {
    console.error("Erreur /api/gallery/rate:", e.message);
    res.status(500).json({ error: "rating error" });
  }
});

// ── /api/gallery/increment-use ────────────────────────────────────────────
// Incrémente le compteur d'utilisation quand une image est ajoutée au panier
app.post("/api/gallery/increment-use", async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: "imageUrl requis" });

    // Incrément via RPC Supabase ou update direct
    const { error } = await supabase.rpc("increment_gallery_use", { p_image_url: imageUrl });
    if (error) {
      // Fallback : update manuel
      const { error: upErr } = await supabase
        .from("gallery_items")
        .update({ use_count: supabase.raw("use_count + 1") })
        .eq("image_url", imageUrl);
      if (upErr) console.error("increment-use fallback error:", upErr.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur /api/gallery/increment-use:", e.message);
    res.status(500).json({ error: "increment error" });
  }
});

// ── /api/gallery/recategorize ─────────────────────────────────────────────
// Recatégorise TOUTES les images en base selon les mots-clés actuels
// Appel unique depuis le dashboard admin
app.post("/api/gallery/recategorize", async (req, res) => {
  try {
    const { data, error } = await supabase.from("gallery_items").select("id,prompt,category").eq("in_gallery", true);
    if (error) return res.status(500).json({ error: error.message });

    let updated = 0;
    for (const item of data) {
      const newCat = detectCategory(item.prompt || "");
      if (newCat !== item.category) {
        await supabase.from("gallery_items").update({ category: newCat }).eq("id", item.id);
        updated++;
      }
    }
    res.json({ ok: true, total: data.length, updated, message: `${updated} images recatégorisées sur ${data.length}` });
  } catch(e) {
    console.error("Erreur recategorize:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/realized/save ────────────────────────────────────────────────────
// Sauvegarde une réalisation client — NON BLOQUANT : répond toujours 200
// même si Shopify ou Supabase échoue, pour ne jamais crasher le serveur
app.post("/api/realized/save", async (req, res) => {
  // Traitement synchrone pour retourner l'URL à l'appelant
  try {
    const { imageBase64, color, dimension, thickness, leftLogoUrl, rightLogoUrl } = req.body || {};
    if (!imageBase64) return res.json({ ok: true });

    // Upload image colorée sur Shopify pour miniature panier
    const base64Data  = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, "base64");
    const optimized   = await sharp(inputBuffer)
      .resize(1200, 300, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();

    const timestamp = Date.now();
    const fileName  = `realized-${(color||"plaque").replace(/[^a-z0-9-]/gi,"")}-${timestamp}.png`;
    const localPath = path.join(productionDir, fileName);
    fs.writeFileSync(localPath, optimized);
    const baseUrl  = process.env.PUBLIC_BASE_URL || "https://simulateur-pag.up.railway.app";
    const localUrl = `${baseUrl}/generated/production/${fileName}`;

    let finalUrl = localUrl;
    try {
      const result = await uploadImageToShopify(optimized, fileName, "Réalisation plaque");
      if (result?.url) finalUrl = result.url;
    } catch(e) {
      console.warn("Realized Shopify upload failed:", e.message);
    }

    // Retourne l'URL immédiatement
    res.json({ ok: true, url: finalUrl });

    // Sauvegarde Supabase en arrière-plan si logo présent
    if (leftLogoUrl || rightLogoUrl) {
      (async () => {
        try {
          await supabase.from("realized_plaques").insert({
            image_url:     finalUrl,
            color:         color      || null,
            dimension:     dimension  || null,
            thickness:     thickness  || null,
            left_logo_url:  leftLogoUrl  || null,
            right_logo_url: rightLogoUrl || null,
            created_at:    new Date().toISOString()
          });
        } catch(e) { console.warn("Supabase realized error:", e.message); }
      })();
    }

  } catch(e) {
    console.error("Realized save error:", e.message);
    res.json({ ok: false });
  }

});

// ── /api/upload-base64 ────────────────────────────────────────────────────
// Upload une image base64 directement sur Shopify sans traitement
app.post("/api/upload-base64", async (req, res) => {
  try {
    const { imageBase64, filename } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 requis" });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fname = filename || `preview-${Date.now()}.png`;
    const result = await uploadImageToShopify(buffer, fname, "Aperçu plaque");
    res.json({ ok: true, url: result.url });
  } catch(e) {
    console.error("Erreur /api/upload-base64:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/logo/process ─────────────────────────────────────────────────────
// Traite un logo uploadé par le client :
// 1. Analyse si fond transparent + N&B → direct
// 2. Tente suppression fond blanc + conversion N&B via Sharp
// 3. Si échec → envoi à l'IA pour transformation
app.post("/api/logo/process", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 requis" });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, "base64");

    const meta = await sharp(inputBuffer).metadata();
    const hasAlpha = meta.channels === 4;

    // Récupère les pixels RGBA
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const w = info.width, h = info.height;

    // Analyse le fond : compte les pixels transparents et les pixels "blancs"
    let transparentCount = 0, whiteCount = 0, totalVisible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
      if (a < 30) { transparentCount++; continue; }
      totalVisible++;
      if (r > 220 && g > 220 && b > 220) whiteCount++;
    }

    const transparentRatio = transparentCount / (w * h);
    const whiteRatio = totalVisible > 0 ? whiteCount / totalVisible : 0;
    const needsProcessing = transparentRatio < 0.05; // peu ou pas de transparence

    let processedPixels = Buffer.from(pixels);
    let method = "direct";

    if (needsProcessing) {
      // Tente suppression fond blanc/clair + conversion N&B
      method = "canvas";
      for (let i = 0; i < processedPixels.length; i += 4) {
        const r = processedPixels[i], g = processedPixels[i+1], b = processedPixels[i+2];
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
        
        // Fond blanc → transparent
        if (r > 200 && g > 200 && b > 200) {
          processedPixels[i+3] = 0;
          continue;
        }
        // Pixels visibles → noir pur
        processedPixels[i] = 0;
        processedPixels[i+1] = 0;
        processedPixels[i+2] = 0;
        // Ajuste l'alpha selon la luminosité inverse
        processedPixels[i+3] = Math.min(255, Math.round((1 - brightness/255) * 255 * 1.5));
      }
    } else {
      // Déjà fond transparent → juste convertir en noir
      method = "transparent";
      for (let i = 0; i < processedPixels.length; i += 4) {
        const a = processedPixels[i+3];
        if (a < 30) continue; // déjà transparent
        processedPixels[i] = 0;
        processedPixels[i+1] = 0;
        processedPixels[i+2] = 0;
      }
    }

    // Génère le PNG final
    const outputBuffer = await sharp(processedPixels, {
      raw: { width: w, height: h, channels: 4 }
    }).png().toBuffer();

    // Upload sur Shopify CDN
    const filename = `client-logo-${Date.now()}.png`;
    const result = await uploadImageToShopify(outputBuffer, filename, "Logo client");

    res.json({ ok: true, url: result.url, method });
  } catch(e) {
    console.error("Erreur /api/logo/process:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/realized/delete ──────────────────────────────────────────────────
app.post("/api/realized/delete", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id requis" });
    const { error } = await supabase.from("realized_plaques").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) {
    console.error("Delete realized error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/realized ──────────────────────────────────────────────────────────
// Retourne les réalisations pour la galerie publique
app.get("/api/realized", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabase
      .from("realized_plaques")
      .select("id, image_url, color, dimension, thickness, left_logo_url, right_logo_url, created_at")
      .not("left_logo_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  } catch(e) {
    console.error("Erreur /api/realized:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`${fontFiles.length} polices configurées`);
  console.log("OPENAI_API_KEY présente :", !!process.env.OPENAI_API_KEY);
  console.log("SHOPIFY_STORE présent :", !!process.env.SHOPIFY_STORE);
  console.log("SUPABASE_URL présent :", !!process.env.SUPABASE_URL);
});
