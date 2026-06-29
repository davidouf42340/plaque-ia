import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const REQUIRED_ENV = [
  "OPENAI_API_KEY","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
  "SHOPIFY_STORE","SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET",
  "PUBLIC_BASE_URL","ADMIN_SECRET_TOKEN","SHOPIFY_ACCESS_TOKEN","SHOPIFY_WEBHOOK_SECRET"
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error("❌ Variables d'environnement manquantes :", missingEnv.join(", "));
  process.exit(1);
}

const app = express();
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const generatedDir  = path.join(__dirname, "..", "generated");
const logosDir      = path.join(generatedDir, "logos");
const productionDir = path.join(generatedDir, "production");
const fontsDir      = path.join(__dirname, "fonts");

fs.mkdirSync(logosDir,      { recursive: true });
fs.mkdirSync(productionDir, { recursive: true });
app.use("/generated", express.static(generatedDir));
app.use("/assets", express.static(path.join(__dirname, "../assets")));

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
  if (fs.existsSync(ttfPath)) { GlobalFonts.registerFromPath(ttfPath, name); console.log(`Police enregistrée : ${name}`); }
  else if (fs.existsSync(otfPath)) { GlobalFonts.registerFromPath(otfPath, name); console.log(`Police enregistrée (otf) : ${name}`); }
  else console.warn(`Police introuvable : ${name}`);
}

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
  const token = req.body?.token || req.headers["x-admin-token"] || req.query?.token || "";
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) return res.status(401).json({ error: "Non autorisé." });
  next();
}

const aiLimiter     = rateLimit({ windowMs:10*60*1000, max:50, standardHeaders:true, legacyHeaders:false, message:{code:"RATE_LIMIT",error:"Trop de générations. Réessayez dans quelques minutes."} });
const uploadLimiter = rateLimit({ windowMs:60*1000, max:30, standardHeaders:true, legacyHeaders:false, message:{error:"Trop de requêtes. Réessayez dans un moment."} });
const rateLimiter   = rateLimit({ windowMs:5*60*1000, max:100, standardHeaders:true, legacyHeaders:false, message:{error:"Trop de votes. Réessayez dans quelques minutes."} });

function getBaseUrl(req) { return process.env.PUBLIC_BASE_URL?.trim() || `${req.protocol}://${req.get("host")}`; }
function slugify(v="") { return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,80); }
function normalizeDimension(value="") { return String(value).trim().toLowerCase().replaceAll(" ",""); }
function normalizeThickness(value="") { return String(value).trim().toLowerCase().replace("mm","").replace(",",".").replace(" ","").trim(); }
function normalizeColor(value="") {
  const v = String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const map = {
    "acier brosse":"acier-brosse","acier brose":"acier-brosse","acier-brosse":"acier-brosse","acier":"acier-brosse",
    "or brosse":"or","or brose":"or","or":"or","cuivre":"cuivre","blanc":"blanc","noir":"noir",
    "noir brillant":"noir-brillant","noir-brillant":"noir-brillant","gris":"gris","noyer":"noyer","rose":"rose"
  };
  return map[v] || v;
}

function hashString(str="") { let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;} return Math.abs(h); }
function pickGalleryIndex(prompt="",items=[]) { if(!Array.isArray(items)||!items.length)return 0; return hashString(`${prompt}__${items.map(x=>x.fileBase||x.id||x.url||"").join("|")}`)%items.length; }

async function saveCreationBatch({prompt,category,creations=[]}) {
  const createdAt=new Date().toISOString(),groupId=`grp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,galIdx=pickGalleryIndex(prompt,creations);
  const entries=creations.map((entry,i)=>({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i+1}`,group_id:groupId,created_at:createdAt,prompt,category,in_gallery:i===galIdx,image_url:entry.imageUrl,local_url:entry.localUrl||null,shopify_url:entry.shopifyUrl||null,shopify_file_id:entry.shopifyFileId||null}));
  const{data,error}=await supabase.from("gallery_items").insert(entries).select();
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

const ALLOWED_THICKNESS_BY_COLOR = {
  "acier-brosse":["1.6","3.2"],"or":["1.6","3.2"],"cuivre":["1.6","3.2"],
  "blanc":["1.6","3.2"],"noir":["1.6","3.2"],"noir-brillant":["1.6","3.2"],
  "gris":["1.6","3.2"],"noyer":["1.6","3.2"],"rose":["1.6","3.2"]
};

const VARIANT_MAP = {
  "60x15mm":{
    "1.6":{"acier-brosse":{variantId:53265970790763},"or":{variantId:53265970856299},"cuivre":{variantId:53265970921835},"blanc":{variantId:53265970987371},"noir":{variantId:53265971052907},"noir-brillant":{variantId:53265971118443},"gris":{variantId:53265971183979},"noyer":{variantId:53265971249515},"rose":{variantId:53265971315051}},
    "3.2":{"acier-brosse":{variantId:53265970823531},"or":{variantId:53265970889067},"cuivre":{variantId:53265970954603},"blanc":{variantId:53265971020139},"noir":{variantId:53265971085675},"noir-brillant":{variantId:53265971151211},"gris":{variantId:53265971216747},"noyer":{variantId:53265971282283},"rose":{variantId:53265971347819}}
  },
  "100x25mm":{
    "1.6":{"acier-brosse":{variantId:53152486228331},"or":{variantId:53152486556011},"cuivre":{variantId:53152486883691},"noir":{variantId:53152487211371},"blanc":{variantId:53152487539051},"noir-brillant":{variantId:53152487866731},"noyer":{variantId:53152488194411},"gris":{variantId:53152488522091},"rose":{variantId:53152488849771}},
    "3.2":{"acier-brosse":{variantId:53152486261099},"or":{variantId:53152486588779},"cuivre":{variantId:53152486916459},"noir":{variantId:53152487244139},"blanc":{variantId:53152487571819},"noir-brillant":{variantId:53152487899499},"noyer":{variantId:53152488227179},"gris":{variantId:53152488554859},"rose":{variantId:53152488882539}}
  },
  "150x37mm":{
    "1.6":{"acier-brosse":{variantId:53152486293867},"or":{variantId:53152486621547},"cuivre":{variantId:53152486949227},"noir":{variantId:53152487276907},"blanc":{variantId:53152487604587},"noir-brillant":{variantId:53152487932267},"noyer":{variantId:53152488259947},"gris":{variantId:53152488587627},"rose":{variantId:53152488915307}},
    "3.2":{"acier-brosse":{variantId:53152486326635},"or":{variantId:53152486654315},"cuivre":{variantId:53152486981995},"noir":{variantId:53152487309675},"blanc":{variantId:53152487637355},"noir-brillant":{variantId:53152487965035},"noyer":{variantId:53152488292715},"gris":{variantId:53152488620395},"rose":{variantId:53152488948075}}
  },
  "200x50mm":{
    "1.6":{"acier-brosse":{variantId:53152486359403},"or":{variantId:53152486687083},"cuivre":{variantId:53152487014763},"noir":{variantId:53152487342443},"blanc":{variantId:53152487670123},"noir-brillant":{variantId:53152487997803},"noyer":{variantId:53152488325483},"gris":{variantId:53152488653163},"rose":{variantId:53152488980843}},
    "3.2":{"acier-brosse":{variantId:53152486392171},"or":{variantId:53152486719851},"cuivre":{variantId:53152487047531},"noir":{variantId:53152487375211},"blanc":{variantId:53152487702891},"noir-brillant":{variantId:53152488030571},"noyer":{variantId:53152488358251},"gris":{variantId:53152488685931},"rose":{variantId:53152489013611}}
  },
  "250x87mm":{
    "1.6":{"acier-brosse":{variantId:53152486424939},"or":{variantId:53152486752619},"cuivre":{variantId:53152487080299},"noir":{variantId:53152487407979},"blanc":{variantId:53152487735659},"noir-brillant":{variantId:53152488063339},"noyer":{variantId:53152488391019},"gris":{variantId:53152488718699},"rose":{variantId:53152489046379}},
    "3.2":{"acier-brosse":{variantId:53152486457707},"or":{variantId:53152486785387},"cuivre":{variantId:53152487113067},"noir":{variantId:53152487440747},"blanc":{variantId:53152487768427},"noir-brillant":{variantId:53152488096107},"noyer":{variantId:53152488423787},"gris":{variantId:53152488751467},"rose":{variantId:53152489079147}}
  },
  "300x100mm":{
    "1.6":{"acier-brosse":{variantId:53152486490475},"or":{variantId:53152486818155},"cuivre":{variantId:53152487145835},"noir":{variantId:53152487473515},"blanc":{variantId:53152487801195},"noir-brillant":{variantId:53152488128875},"noyer":{variantId:53152488456555},"gris":{variantId:53152488784235},"rose":{variantId:53152489111915}},
    "3.2":{"acier-brosse":{variantId:53152486523243},"or":{variantId:53152486850923},"cuivre":{variantId:53152487178603},"noir":{variantId:53152487506283},"blanc":{variantId:53152487833963},"noir-brillant":{variantId:53152488161643},"noyer":{variantId:53152488489323},"gris":{variantId:53152488817003},"rose":{variantId:53152489144683}}
  }
};

const RUE_VARIANT_MAP = {
  "150x100mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53152489177451},"or":{variantId:53152489210219},"cuivre":{variantId:53152489242987},"blanc":{variantId:53152489275755},"noir":{variantId:53152489308523},"gris":{variantId:53152489341291},"noyer":{variantId:53152489374059},"rose":{variantId:53152489406827}},
    "1.6mm - À fixer":{"acier-brosse":{variantId:53152489439595},"or":{variantId:53152489472363},"cuivre":{variantId:53152489505131},"blanc":{variantId:53152489537899},"noir":{variantId:53152489570667}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53152489603435},"or":{variantId:53152489636203},"cuivre":{variantId:53152489668971},"blanc":{variantId:53152489701739},"noir":{variantId:53152489734507}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53152489767275},"or":{variantId:53152489800043},"cuivre":{variantId:53152489832811},"blanc":{variantId:53152489865579},"noir":{variantId:53152489898347}}
  },
  "200x133mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53152489931115},"or":{variantId:53152489963883},"cuivre":{variantId:53152489996651},"blanc":{variantId:53152490029419},"noir":{variantId:53152490062187},"gris":{variantId:53152490094955},"noyer":{variantId:53152490127723},"rose":{variantId:53152490160491}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53152490193259},"or":{variantId:53152490226027},"cuivre":{variantId:53152490258795},"blanc":{variantId:53152490291563},"noir":{variantId:53152490324331}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53152490357099},"or":{variantId:53152490389867},"cuivre":{variantId:53152490422635},"blanc":{variantId:53152490455403},"noir":{variantId:53152490488171}}
  },
  "250x167mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53152490520939},"or":{variantId:53152490553707},"cuivre":{variantId:53152490586475},"blanc":{variantId:53152490619243},"noir":{variantId:53152490652011},"gris":{variantId:53152490684779},"noyer":{variantId:53152490717547},"rose":{variantId:53152490750315}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53152490783083},"or":{variantId:53152490815851},"cuivre":{variantId:53152490848619},"blanc":{variantId:53152490881387},"noir":{variantId:53152490914155}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53152490946923},"or":{variantId:53152490979691},"cuivre":{variantId:53152491012459},"blanc":{variantId:53152491045227},"noir":{variantId:53152491077995}}
  },
  "300x200mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53152491110763},"or":{variantId:53152491143531},"cuivre":{variantId:53152491176299},"blanc":{variantId:53152491209067},"noir":{variantId:53152491241835},"gris":{variantId:53152491274603},"noyer":{variantId:53152491307371},"rose":{variantId:53152491340139}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53152491372907},"or":{variantId:53152491405675},"cuivre":{variantId:53152491438443},"blanc":{variantId:53152491471211},"noir":{variantId:53152491503979}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53152491536747},"or":{variantId:53152491569515},"cuivre":{variantId:53152491602283},"blanc":{variantId:53152491635051},"noir":{variantId:53152491667819}}
  }
};


const FAMILLE_VARIANT_MAP = {
  "150x100mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423897674091},"or":{variantId:53423897706859},"cuivre":{variantId:53423897739627},"blanc":{variantId:53423897772395},"noir":{variantId:53423897805163},"gris":{variantId:53423897837931},"noyer":{variantId:53423897870699},"rose":{variantId:53423897903467}},
    "1.6mm - À fixer":{"acier-brosse":{variantId:53423897936235},"or":{variantId:53423897969003},"cuivre":{variantId:53423898001771},"blanc":{variantId:53423898034539},"noir":{variantId:53423898067307}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423898100075},"or":{variantId:53423898132843},"cuivre":{variantId:53423898165611},"blanc":{variantId:53423898198379},"noir":{variantId:53423898231147}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423898263915},"or":{variantId:53423898296683},"cuivre":{variantId:53423898329451},"blanc":{variantId:53423898362219},"noir":{variantId:53423898394987}}
  },
  "200x133mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423898427755},"or":{variantId:53423898460523},"cuivre":{variantId:53423898493291},"blanc":{variantId:53423898526059},"noir":{variantId:53423898558827},"gris":{variantId:53423898591595},"noyer":{variantId:53423898624363},"rose":{variantId:53423898657131}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423898689899},"or":{variantId:53423898722667},"cuivre":{variantId:53423898755435},"blanc":{variantId:53423898788203},"noir":{variantId:53423898820971}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423898853739},"or":{variantId:53423898886507},"cuivre":{variantId:53423898919275},"blanc":{variantId:53423898952043},"noir":{variantId:53423898984811}}
  },
  "250x167mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423899672939},"or":{variantId:53423899705707},"cuivre":{variantId:53423899738475},"blanc":{variantId:53423899771243},"noir":{variantId:53423899804011},"gris":{variantId:53423899836779},"noyer":{variantId:53423899869547},"rose":{variantId:53423899902315}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423899935083},"or":{variantId:53423899967851},"cuivre":{variantId:53423900000619},"blanc":{variantId:53423900033387},"noir":{variantId:53423900066155}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423900098923},"or":{variantId:53423900131691},"cuivre":{variantId:53423900164459},"blanc":{variantId:53423900197227},"noir":{variantId:53423900229995}}
  },
  "300x200mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423900262763},"or":{variantId:53423900295531},"cuivre":{variantId:53423900328299},"blanc":{variantId:53423900361067},"noir":{variantId:53423900393835},"gris":{variantId:53423900426603},"noyer":{variantId:53423900459371},"rose":{variantId:53423900492139}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423900524907},"or":{variantId:53423900557675},"cuivre":{variantId:53423900590443},"blanc":{variantId:53423900623211},"noir":{variantId:53423900655979}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423900688747},"or":{variantId:53423900721515},"cuivre":{variantId:53423900754283},"blanc":{variantId:53423900787051},"noir":{variantId:53423900819819}}
  }
};

const PROFESSIONNEL_VARIANT_MAP = {
  "150x100mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423982313835},"or":{variantId:53423990735211},"cuivre":{variantId:53423990767979},"blanc":{variantId:53423990800747},"noir":{variantId:53423990833515},"gris":{variantId:53423990866283},"noyer":{variantId:53423990899051},"rose":{variantId:53423990931819}},
    "1.6mm - À fixer":{"acier-brosse":{variantId:53423990964587},"or":{variantId:53423990997355},"cuivre":{variantId:53423991030123},"blanc":{variantId:53423991062891},"noir":{variantId:53423991095659}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423991128427},"or":{variantId:53423991161195},"cuivre":{variantId:53423991193963},"blanc":{variantId:53423991226731},"noir":{variantId:53423991259499}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423991292267},"or":{variantId:53423991325035},"cuivre":{variantId:53423991357803},"blanc":{variantId:53423991390571},"noir":{variantId:53423991423339}}
  },
  "200x133mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423991456107},"or":{variantId:53423991488875},"cuivre":{variantId:53423991521643},"blanc":{variantId:53423991554411},"noir":{variantId:53423991587179},"gris":{variantId:53423991619947},"noyer":{variantId:53423991652715},"rose":{variantId:53423991685483}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423991718251},"or":{variantId:53423991751019},"cuivre":{variantId:53423991783787},"blanc":{variantId:53423991816555},"noir":{variantId:53423991849323}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423991882091},"or":{variantId:53423991914859},"cuivre":{variantId:53423991947627},"blanc":{variantId:53423991980395},"noir":{variantId:53423992013163}}
  },
  "250x167mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423993028971},"or":{variantId:53423993061739},"cuivre":{variantId:53423993094507},"blanc":{variantId:53423993127275},"noir":{variantId:53423993160043},"gris":{variantId:53423993192811},"noyer":{variantId:53423993225579},"rose":{variantId:53423993258347}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423993291115},"or":{variantId:53423993323883},"cuivre":{variantId:53423993356651},"blanc":{variantId:53423993389419},"noir":{variantId:53423993422187}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423993454955},"or":{variantId:53423993487723},"cuivre":{variantId:53423993520491},"blanc":{variantId:53423993553259},"noir":{variantId:53423993586027}}
  },
  "300x200mm":{
    "1.6mm - À coller":{"acier-brosse":{variantId:53423993618795},"or":{variantId:53423993651563},"cuivre":{variantId:53423993684331},"blanc":{variantId:53423993717099},"noir":{variantId:53423993749867},"gris":{variantId:53423993782635},"noyer":{variantId:53423993815403},"rose":{variantId:53423993848171}},
    "3.2mm - À coller":{"acier-brosse":{variantId:53423993880939},"or":{variantId:53423993913707},"cuivre":{variantId:53423993946475},"blanc":{variantId:53423993979243},"noir":{variantId:53423994012011}},
    "3.2mm - À fixer":{"acier-brosse":{variantId:53423994044779},"or":{variantId:53423994077547},"cuivre":{variantId:53423994110315},"blanc":{variantId:53423994143083},"noir":{variantId:53423994175851}}
  }
};

// ── DIMENSIONS canvas prod (px à 300dpi) ────────────────────────────────────
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

const DIMENSION_MAP_FAMILLE = {
  "150x100mm": { w:1772, h:1181 },
  "200x133mm": { w:2362, h:1571 },
  "250x167mm": { w:2953, h:1972 },
  "300x200mm": { w:3543, h:2362 },
};

const TYPES_MEMBRES_SERVER = [
  { key:"pap",    heightRatio:1.00 },
  { key:"mum",    heightRatio:1.00 },
  { key:"ado",    heightRatio:0.82 },
  { key:"adof",   heightRatio:0.82 },
  { key:"garcon", heightRatio:0.65 },
  { key:"fille",  heightRatio:0.65 },
  { key:"bb",     heightRatio:0.45 },
];
const TYPES_ANIMAUX_SERVER = [
  { key:"cat", heightRatio:0.45 },
  { key:"dog", heightRatio:0.45 },
];
const SINGLE_VARIANT_FAMILLE = new Set(["pap","mum","bb"]);
function buildPngKeyServer(key, variant) {
  return SINGLE_VARIANT_FAMILLE.has(key) ? `${key}.png` : `${key}${variant}.png`;
}

const FAMILLE_DECO_URL = "https://cdn.shopify.com/s/files/1/0983/8569/0987/files/famille-deco.png?v=1782296677";

const WHITE_ELEMENTS_PROD = ["noir","noir-brillant","gris","noyer","rose"];

const CATEGORY_RULES=[{key:"animaux",words:["chien","chat","cheval","lion","tigre","lapin","oiseau","aigle","serpent","rottweiler","berger","bouledogue","caniche","animaux","animal","panda","poisson","requin","éléphant","elephant","tortue","papillon","coq","hibou","cochon","vache","mouton","loup","renard","cerf","dauphin","baleine","crabe","homard","singe","gorille","girafe","zèbre","zebre","rhinocéros","rhinoceros","hippopotame","crocodile","alligator","grenouille","lizard","lézard","ara","perroquet","flamant","pingouin","manchot","ours","koala","kangourou","loutre","castor","écureuil","ecureuil","hérisson","herisson","armadillo","chauve-souris","chauve souris","mante","abeille","libellule","araignée","araignee","scorpion","cameleon","caméléon","colibri","cygne","hirondelle","gecko","poney","veau","chevre","canard","oie","mouton","belier","taureau","tigre"]},{key:"sport",words:["football","foot","basket","basketball","tennis","rugby","golf","haltère","haltere","musculation","fitness","vélo","velo","cyclisme","boxe","judo","karaté","karate","natation","running","course","sport","ballon","raquette","crossfit","marathon","ski","snowboard","surf","skateboard","roller","escalade","escrime","équitation","equitation","gym","gymnaste","handball","volleyball","volley","badminton","ping pong","bowling","billard","fléchettes","flechettes","poids","barbell","dumbbell","yoga","pilates","danse","athletisme","atletisme","sprint","saut","javelot","disque","perche","lutte","mma","taekwondo","aikido","kung fu","capoeira","piston","retrogaming"]},{key:"medical",words:["pharmacie","pharmacien","dentiste","dentaire","stéthoscope","stethoscope","croix médicale","croix medicale","medecin","médecin","infirmier","infirmière","infirmiere","vétérinaire","veterinaire","santé","sante","seringue","hôpital","hopital","soin","paramedical","kiné","kine","pilule","médicament","medicament","ambulance","urgence","scalpel","bistouri","pince","compresse","bandage","fauteuil roulant","béquille","bequille","opticien","lunettes","cardiologie","coeur","anatomie","squelette","os","dent","thermomètre","thermometre","tension","sang","laboratoire","labo","radio","scanner","psychologue","cabinet","clinique"]},{key:"beaute",words:["coiffeur","coiffure","ciseaux","ongle","ongles","esthétique","esthetique","maquillage","makeup","beauty","beauté","beaute","barbier","barber","massage","spa","shampoing","brosse","salon","peigne","sèche-cheveux","seche cheveux","rasoir","mousse","gel","vernis","rouge à lèvres","rouge a levres","fond de teint","mascara","eyeliner","sourcils","cils","épilation","epilation","manucure","pédicure","pedicure","lash","nail","tatouage","piercing","dermatologue","crème","creme","lotion","parfum"]},{key:"restauration",words:["pizza","burger","café","cafe","restaurant","fourchette","cuillère","cuillere","couteau","boulangerie","pâtisserie","patisserie","croissant","pain","boisson","vin","cocktail","chef","cuisine","tasse","assiette","verre","bouteille","bière","biere","champagne","whisky","sushi","pâtes","pates","salade","soupe","gâteau","gateau","dessert","chocolat","glace","confiserie","épicerie","epicerie","marché","marche","traiteur","snack","kebab","tacos","crêpe","crepe","gaufre","waffle","barbecue","bbq","steakhouse","rôtisserie","rotisserie","boucherie","fromagerie","bar","brasserie","taverne","auberge","hôtel","hotel","fast food","fast-food"]},{key:"batiment",words:["maçon","macon","bâtiment","batiment","maison","toit","marteau","clé anglaise","cle anglaise","plombier","électricien","electricien","outils","tournevis","perceuse","construction","artisan","travaux","peintre","peinture","menuisier","menuiserie","charpente","charpentier","couvreur","toiture","carreleur","carrelage","vitrier","serrurier","serrure","chauffagiste","climatisation","clim","isolation","façade","facade","terrassier","génie civil","genie civil","ingénieur","ingenieur","architecte","architecture","grue","bulldozer","pelleteuse","niveau","équerre","equerre","mètre","metre","ciment","béton","beton","brique","parpaing","ferrailleur","soudeur","démolition","demolition","rénovation","renovation","villa","immeuble","appartement","chantier","blueprint","chateau"]},{key:"nature",words:["arbre","fleur","montagne","soleil","lune","forêt","foret","feuille","nature","paysage","nuage","étoile","etoile","rose","plante","rivière","riviere","ocean","mer","vague","plage","sable","désert","desert","savane","jungle","tropique","palmier","bambou","cactus","herbe","prairie","colline","vallée","vallee","volcan","glacier","cascade","lac","étang","etang","marais","champignon","mousse","lichen","pin","chêne","chene","bouleau","sapin","cerisier","lavande","tournesol","coquelicot","marguerite","tulipe","orchidée","orchidee","lotus","algue","corail","nid","ruche","météore","meteor","arc-en-ciel","aurore","neige","glace","vent","tempête","tempete"]},{key:"symboles",words:["logo","icone","icône","minimaliste","symbole","symbol","coeur","cœur","éclair","eclair","flèche","fleche","couronne","croix","badge","blason","bouclier","épée","epee","ancre","boussole","globe","monde","paix","infini","yin yang","trèfle","trefle","fer à cheval","fer a cheval","dreamcatcher","mandala","caducée","caducee","balance","justice","phare","clef","clé","cle","cadenas","ruban","nœud","noeud","aile","plume","main","poing","œil","oeil","pyramide","triangle","hexagone","cercle","spiral","galaxie","cosmos","atome","molécule","molecule","dna","adn","robot","intelligence artificielle","ia","wifi","numérique","numerique","cancer","capricorne","gemeaux","sagitaire","verseau","vierge","vikings","corse","france","italie","portugal","stoppub","btc","bitcoin","casque audio","catwoman","woody","dolly"]}];

function detectCategory(prompt="") {
  const p=String(prompt||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  for(const rule of CATEGORY_RULES){if(rule.words.some(w=>p.includes(w)))return rule.key;}
  return "divers";
}

function getGalleryCategories(items=[]) {
  const defaultOrder=["tous","animaux","sport","medical","beaute","restauration","batiment","nature","symboles","divers"];
  const existing=new Set(items.map(i=>i.category).filter(Boolean));
  const ordered=defaultOrder.filter(cat=>cat==="tous"||existing.has(cat));
  for(const item of existing){if(!ordered.includes(item))ordered.push(item);}
  return ordered;
}

let shopifyTokenCache={accessToken:null,expiresAt:0};
async function getShopifyAdminAccessToken() {
  const shop=process.env.SHOPIFY_STORE,clientId=process.env.SHOPIFY_CLIENT_ID,clientSecret=process.env.SHOPIFY_CLIENT_SECRET;
  if(!shop||!clientId||!clientSecret)throw new Error("Variables Shopify manquantes");
  const now=Date.now();
  if(shopifyTokenCache.accessToken&&now<shopifyTokenCache.expiresAt-60000)return shopifyTokenCache.accessToken;
  const body=new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret});
  const r=await fetch(`https://${shop}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body.toString()});
  const data=await r.json();
  if(!r.ok||!data?.access_token)throw new Error("Impossible d\'obtenir le token Admin Shopify");
  shopifyTokenCache.accessToken=data.access_token;
  shopifyTokenCache.expiresAt=now+((Number(data.expires_in)||86399)*1000);
  return shopifyTokenCache.accessToken;
}

async function shopifyGraphQL(query,variables={}) {
  const shop=process.env.SHOPIFY_STORE,version=process.env.SHOPIFY_API_VERSION||"2025-01";
  const token=await getShopifyAdminAccessToken();
  const r=await fetch(`https://${shop}/admin/api/${version}/graphql.json`,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},body:JSON.stringify({query,variables})});
  const data=await r.json();
  if(!r.ok||data.errors)throw new Error("Erreur GraphQL Shopify");
  return data.data;
}

async function wait(ms){return new Promise(r=>setTimeout(r,ms));}

async function getShopifyFileById(fileId) {
  const data=await shopifyGraphQL(`query getFile($id:ID!){node(id:$id){__typename...on MediaImage{id alt fileStatus status image{url}preview{image{url}}}...on GenericFile{id alt fileStatus url preview{image{url}}}}}`,{id:fileId});
  return data?.node||null;
}

async function waitForShopifyFileReady(fileId,maxAttempts=30,delayMs=2000) {
  for(let i=1;i<=maxAttempts;i++){
    const file=await getShopifyFileById(fileId);
    if(!file)throw new Error("Fichier Shopify introuvable");
    const url=file?.image?.url||file?.preview?.image?.url||file?.url||null;
    if(url)return{id:file.id,url};
    if(file.status==="FAILED"||file.fileStatus==="FAILED")throw new Error("Traitement Shopify échoué");
    await wait(delayMs);
  }
  throw new Error("Timeout Shopify");
}

async function uploadImageToShopify(buffer,filename,alt="") {
  const mimeType="image/png";
  const staged=await shopifyGraphQL(`mutation stagedUploadsCreate($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{field message}}}`,{input:[{filename,mimeType,httpMethod:"POST",resource:"FILE",fileSize:String(buffer.length)}]});
  const sp=staged.stagedUploadsCreate;
  if(sp.userErrors?.length)throw new Error(sp.userErrors[0].message);
  const target=sp.stagedTargets[0];
  const form=new FormData();
  target.parameters.forEach(p=>form.append(p.name,p.value));
  form.append("file",new Blob([buffer],{type:mimeType}),filename);
  const uploadRes=await fetch(target.url,{method:"POST",body:form});
  if(!uploadRes.ok)throw new Error(`Upload Shopify échoué: ${await uploadRes.text()}`);
  const fc=await shopifyGraphQL(`mutation fileCreate($files:[FileCreateInput!]!){fileCreate(files:$files){files{__typename...on MediaImage{id alt fileStatus status image{url}preview{image{url}}}...on GenericFile{id alt fileStatus url preview{image{url}}}}userErrors{field message}}}`,{files:[{alt,contentType:"IMAGE",originalSource:target.resourceUrl}]});
  const fp=fc.fileCreate;
  if(fp.userErrors?.length)throw new Error(fp.userErrors[0].message);
  const created=fp.files?.[0];
  if(!created?.id)throw new Error("Fichier Shopify sans identifiant");
  const immediateUrl=created?.image?.url||created?.preview?.image?.url||created?.url||null;
  if(immediateUrl)return{id:created.id,url:immediateUrl};
  const ready=await waitForShopifyFileReady(created.id);
  return{id:ready.id,url:ready.url};
}

// ── Supabase Storage — fichiers production PNG (purge auto 30j) ───────────
async function uploadToSupabaseStorage(buffer, filename) {
  try {
    const { data, error } = await supabase.storage
      .from("production-files")
      .upload(filename, buffer, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    const { data: urlData } = supabase.storage.from("production-files").getPublicUrl(filename);
    return urlData.publicUrl;
  } catch(e) {
    console.warn("Supabase Storage upload failed:", e.message);
    return null;
  }
}

async function purgeOldSupabaseFiles() {
  try {
    const { data, error } = await supabase.storage.from("production-files").list("", { limit: 1000 });
    if (error || !data) return;
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const toDelete = data.filter(f => new Date(f.created_at).getTime() < cutoff).map(f => f.name);
    if (!toDelete.length) return;
    await supabase.storage.from("production-files").remove(toDelete);
    console.log(`Purge Supabase Storage: ${toDelete.length} fichiers supprimés`);
  } catch(e) { console.warn("Purge Supabase Storage failed:", e.message); }
}
setInterval(purgeOldSupabaseFiles, 24 * 60 * 60 * 1000);

app.get("/",       (req,res)=>res.json({ok:true,message:"Serveur configurateur plaque en ligne"}));
app.get("/health", (req,res)=>res.json({ok:true}));
app.get("/api/fonts",(req,res)=>res.json({fonts:fontFiles}));

app.get("/fonts/:fontName",(req,res)=>{
  const safeName=path.basename(req.params.fontName);
  const ttfPath=path.join(fontsDir,safeName),otfPath=path.join(fontsDir,safeName.replace(/\.ttf$/i,".otf"));
  if(fs.existsSync(ttfPath)){res.setHeader("Content-Type","font/ttf");res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","public, max-age=86400");return res.sendFile(ttfPath);}
  if(fs.existsSync(otfPath)){res.setHeader("Content-Type","font/otf");res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","public, max-age=86400");return res.sendFile(otfPath);}
  return res.status(404).json({error:`Police introuvable : ${safeName}`});
});

app.get("/api/fonts/debug",(req,res)=>{
  try{res.json({fontsDir,files:fs.readdirSync(fontsDir),count:fs.readdirSync(fontsDir).length});}
  catch(e){res.json({error:e.message,fontsDir});}
});

app.post("/api/logos/search-or-generate", checkOrigin, aiLimiter, async(req,res)=>{
  try {
    const{prompt,count=3}=req.body||{};
    const cleanPrompt=String(prompt||"").trim();
    const imageCount=Math.max(1,Math.min(Number(count)||3,3));
    if(!cleanPrompt)return res.status(400).json({code:"MISSING_PROMPT",error:"Prompt image manquant."});
    const baseUrl=getBaseUrl(req);
    const subjectPrompt = `${cleanPrompt}, premium black vector line-art illustration, laser-ready artwork, semi-detailed premium style, isolated subject only, no frame`;
    const finalPrompt = [
      "Create a black laser-ready illustrated design on a fully transparent background.",
      "Create the subject only, isolated on transparent background.",
      "Style: premium vector line-art illustration, laser-ready custom artwork, semi-detailed premium illustration.",
      "Use the available canvas efficiently, but do not draw any border or enclosing shape.",
      "The subject must not be placed inside a square, rectangle, circle, badge, medallion, stamp, panel or frame.",
      "No geometric container around the illustration.",
      "No outline box around the design.",
      "No square frame, no rectangular frame, no circular frame.",
      "No background scene, no poster layout, no sign layout.",
      "The image must feel decorative, professional and high quality.",
      "The design must be more detailed than a basic icon, but still simplified for laser engraving.",
      "Use bold black outer contours and a refined medium-rich level of interior details.",
      "Show the essential forms, posture, movement and main visual features of the subject.",
      "Use approximately 12 to 20 clean interior detail strokes or shapes.",
      "Interior details must remain large, clean, well separated and readable.",
      "Keep the overall result balanced, elegant and attractive.",
      "The result must stay readable when engraved small on a personalized plaque.",
      "Pure black only.",
      "No gray, no white fill, no color, no gradients.",
      "White or empty areas must be transparent.",
      "No photorealism, no realistic shading, no cross-hatching, no dense textures.",
      "No overly fine lines, no messy detailing, no engraving-style overload.",
      "No vintage etching, no sketch effect, no pencil effect.",
      "No background, no text, no frame, no border, no box, no badge.",
      `Subject: ${subjectPrompt}`
    ].join(" ");
    const result=await openai.images.generate({model:"gpt-image-1",prompt:finalPrompt,size:"1024x1024",background:"transparent",output_format:"png",quality:"medium",n:1});
    const logos=[],creationsToSave=[];
    const category=detectCategory(cleanPrompt);
    for(let i=0;i<(result.data||[]).length;i++){
      const item=result.data[i];
      if(!item.b64_json)continue;
      const fileBase=`${Date.now()}-${slugify(cleanPrompt)}-${i+1}`,fileName=`${fileBase}.png`;
      const buffer=Buffer.from(item.b64_json,"base64");
      fs.writeFileSync(path.join(logosDir,fileName),buffer);
      let shopifyUrl=null,shopifyFileId=null;
      try{const u=await uploadImageToShopify(buffer,fileName,`Logo IA: ${cleanPrompt}`);shopifyUrl=u.url;shopifyFileId=u.id;}catch(e){console.error("Shopify upload failed:",e.message);}
      const localUrl=`${baseUrl}/generated/logos/${fileName}`,finalUrl=shopifyUrl||localUrl;
      creationsToSave.push({fileBase,imageUrl:finalUrl,localUrl,shopifyUrl,shopifyFileId});
      logos.push({id:fileBase,url:finalUrl,localUrl,shopifyUrl,shopifyFileId,category});
    }
    if(creationsToSave.length)await saveCreationBatch({prompt:cleanPrompt,category,creations:creationsToSave});
    return res.json({logos});
  } catch(error) {
    console.error("Erreur generation IA:", error?.message, "status:", error?.status, "code:", error?.code);
    const raw=String(error?.message||"").toLowerCase(),status=Number(error?.status||500);
    if(status===429||raw.includes("rate limit")||raw.includes("too many"))return res.status(429).json({code:"RATE_LIMIT",error:"La génération est momentanément très sollicitée. Merci de réessayer dans quelques secondes."});
    if(raw.includes("quota")||raw.includes("billing")||raw.includes("insufficient")||raw.includes("credit"))return res.status(503).json({code:"BILLING_UNAVAILABLE",error:"Le service de génération est momentanément indisponible."});
    if(raw.includes("api key")||raw.includes("unauthorized")||status===401)return res.status(503).json({code:"AUTH_ERROR",error:"Le service de génération est momentanément indisponible."});
    return res.status(500).json({code:"GENERIC_GENERATION_ERROR",error:"Une erreur est survenue. Merci de réessayer.", detail: error?.message});
  }
});

app.post("/api/render/production-from-image", checkOrigin, uploadLimiter, async(req,res)=>{
  try {
    const{imageBase64,color="blanc",dimension="100x25mm",thickness="1.6",line1="",line2="",line3=""}=req.body||{};
    if(!imageBase64)return res.status(400).json({error:"imageBase64 manquant."});
    const baseUrl=getBaseUrl(req);
    let base64Data=imageBase64;
    const commaIndex=imageBase64.indexOf(",");
    if(commaIndex!==-1)base64Data=imageBase64.slice(commaIndex+1);
    base64Data=base64Data.replace(/[^A-Za-z0-9+/=]/g,"");
    if(!base64Data||base64Data.length<100)return res.status(400).json({error:"Image base64 invalide ou vide."});
    const inputBuffer=Buffer.from(base64Data,"base64");
    if(inputBuffer.length<100)return res.status(400).json({error:"Buffer image trop petit, capture échouée."});
    const meta=await sharp(inputBuffer).metadata();
    const{width,height}=meta;
    const{data:rawPixels}=await sharp(inputBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const pixels=Buffer.from(rawPixels);
    const totalPixels=width*height;
    for(let i=0;i<totalPixels;i++){
      const o=i*4;
      const r=pixels[o],g=pixels[o+1],b=pixels[o+2],a=pixels[o+3];
      if(a<30){pixels[o]=pixels[o+1]=pixels[o+2]=pixels[o+3]=0;continue;}
      const lum=r*0.299+g*0.587+b*0.114;
      if(lum>180){pixels[o]=pixels[o+1]=pixels[o+2]=pixels[o+3]=0;}
      else{pixels[o]=pixels[o+1]=pixels[o+2]=17;pixels[o+3]=255;}
    }
    const productionBuffer=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
    const timestamp=new Date().toISOString().replace(/[-:T]/g,"").slice(0,14);
    const fileName=`${slugify(color)}-${slugify(dimension)}-${normalizeThickness(thickness)}mm-${timestamp}.png`;
    fs.writeFileSync(path.join(productionDir,fileName),productionBuffer);
    const localUrl=`${baseUrl}/generated/production/${fileName}`;
    // Upload Supabase Storage (PNG garanti, persistant)
    const supabaseUrl=await uploadToSupabaseStorage(productionBuffer,fileName);
    // Upload Shopify pour aperçu miniature commande
    let shopifyUrl=null,shopifyFileId=null;
    try{const altText=[`Plaque ${dimension}`,color,thickness+"mm",line1,line2,line3].filter(Boolean).join(" | ");const uploaded=await uploadImageToShopify(productionBuffer,fileName,altText);shopifyUrl=uploaded.url;shopifyFileId=uploaded.id;}
    catch(e){console.error("Shopify production upload failed:",e.message);}
    // URL Supabase en priorité (PNG), fallback localUrl
    return res.json({url:supabaseUrl||localUrl,shopifyUrl,shopifyFileId,localUrl,supabaseUrl});
  } catch(error){console.error("Erreur /api/render/production-from-image :",error);return res.status(500).json({error:error?.message||"Erreur interne génération production."});}
});

// ── Preview RUE (upsell popup) ────────────────────────────────────────────────
app.post("/api/preview/rue", checkOrigin, async(req,res)=>{
  try {
    const { color="acier-brosse", number="", streetLines=[], fontFamily="Baskvill", logoUrl=null, dimension="150x100mm", numScale=100, streetScale=100 } = req.body||{};
    const buf = await renderProdRUE({
      dimension, color: normalizeColor(color), number,
      streetLines: Array.isArray(streetLines) ? streetLines : [streetLines].filter(Boolean),
      fontFamily, numScale: Number(numScale)||100, streetScale: Number(streetScale)||100,
      logoUrl: logoUrl||null, layout:"image-left"
    });
    // Resize to thumbnail ~600×400 for fast delivery
    const thumb = await sharp(buf).resize(600, 400, { fit:"contain", background:{r:0,g:0,b:0,alpha:0} }).png().toBuffer();
    const b64 = thumb.toString("base64");
    return res.json({ image: "data:image/png;base64," + b64 });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

app.post("/api/variant/resolve", checkOrigin, async(req,res)=>{
  try {
    const rawColor=req.body?.color||"",rawDim=req.body?.dimension||"",rawThick=req.body?.thickness||"";
    const fixation=req.body?.fixation||null,productHandle=req.body?.productHandle||null;
    const color=normalizeColor(rawColor),dimension=normalizeDimension(rawDim),thickness=normalizeThickness(rawThick);
    if(!dimension||!thickness||!color)return res.status(400).json({error:"Dimension, épaisseur ou couleur manquante."});
    if(productHandle&&productHandle.includes("professionnel")){
      const epFix=thickness+"mm - "+(fixation==="fixer"?"À fixer":"À coller");
      const found=PROFESSIONNEL_VARIANT_MAP?.[dimension]?.[epFix]?.[color];
      if(found)return res.json(found);
      return res.status(404).json({error:`Variant professionnel introuvable: ${dimension} / ${epFix} / ${color}`});
    }
    if(productHandle&&productHandle.includes("famille")){
      const epFix=thickness+"mm - "+(fixation==="fixer"?"À fixer":"À coller");
      const found=FAMILLE_VARIANT_MAP?.[dimension]?.[epFix]?.[color];
      if(found)return res.json(found);
      return res.status(404).json({error:`Variant famille introuvable: ${dimension} / ${epFix} / ${color}`});
    }
    if(productHandle&&productHandle.includes("rue")){
      const epFix=thickness+"mm - "+(fixation==="fixer"?"À fixer":"À coller");
      const found=RUE_VARIANT_MAP?.[dimension]?.[epFix]?.[color];
      if(found)return res.json(found);
      return res.status(404).json({error:`Variant rue introuvable: ${dimension} / ${epFix} / ${color}`});
    }
    const allowed=ALLOWED_THICKNESS_BY_COLOR[color];
    if(!allowed)return res.status(404).json({error:"Couleur introuvable."});
    if(!allowed.includes(thickness))return res.status(400).json({error:`L\'épaisseur ${thickness} mm n\'est pas disponible pour la couleur ${color}.`});
    const found=VARIANT_MAP?.[dimension]?.[thickness]?.[color];
    if(!found)return res.status(404).json({error:"Variant introuvable pour cette combinaison."});
    return res.json(found);
  } catch(error){return res.status(500).json({error:"Erreur interne variant."});}
});

app.get("/api/gallery/categories",async(req,res)=>{
  try{res.json({categories:getGalleryCategories(await getAllGalleryItemsForCategories())});}
  catch(e){res.status(500).json({error:"gallery categories error"});}
});

app.get("/api/gallery",async(req,res)=>{
  try{
    const cat=String(req.query.category||"tous").toLowerCase().trim();
    const itemsRaw=await getGalleryItems({category:cat,limit:500});
    const allForCats=await getAllGalleryItemsForCategories();
    const items=itemsRaw.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:cat||"tous"});
  }catch(e){res.status(500).json({error:"gallery error"});}
});

app.get("/api/gallery/random",async(req,res)=>{
  try{
    const randomItems=await getRandomGalleryItems(500);
    const allForCats=await getAllGalleryItemsForCategories();
    const items=randomItems.map(i=>({id:i.id,preview:i.image_url,prompt:i.prompt,category:i.category||"divers",imageUrl:i.image_url,shopifyUrl:i.shopify_url||null,localUrl:i.local_url||null,createdAt:i.created_at}));
    res.json({items,categories:getGalleryCategories(allForCats),activeCategory:"tous"});
  }catch(e){res.status(500).json({error:"gallery error"});}
});

app.post("/api/gallery/rate", checkOrigin, rateLimiter, async(req,res)=>{
  try{
    const{imageUrl,stars}=req.body||{};
    if(!imageUrl||!stars||stars<1||stars>5)return res.status(400).json({error:"imageUrl et stars (1-5) requis"});
    const{error:insertError}=await supabase.from("gallery_ratings").insert({image_url:imageUrl,stars:Number(stars)});
    if(insertError){return res.json({avg:Number(stars),count:1});}
    const{data,error:avgError}=await supabase.from("gallery_ratings").select("stars").eq("image_url",imageUrl);
    if(avgError||!data||!data.length)return res.json({avg:Number(stars),count:1});
    const count=data.length,avg=data.reduce((sum,r)=>sum+r.stars,0)/count;
    res.json({avg:Math.round(avg*10)/10,count});
  }catch(e){res.status(500).json({error:"rating error"});}
});

app.post("/api/gallery/increment-use", checkOrigin, async(req,res)=>{
  try{
    const{imageUrl}=req.body||{};
    if(!imageUrl)return res.status(400).json({error:"imageUrl requis"});
    const{error}=await supabase.rpc("increment_gallery_use",{p_image_url:imageUrl});
    if(error){await supabase.from("gallery_items").update({use_count:supabase.raw("use_count + 1")}).eq("image_url",imageUrl);}
    res.json({ok:true});
  }catch(e){res.status(500).json({error:"increment error"});}
});

app.post("/api/gallery/recategorize", checkAdminToken, async(req,res)=>{
  try{
    const{data,error}=await supabase.from("gallery_items").select("id,prompt,category").eq("in_gallery",true);
    if(error)return res.status(500).json({error:error.message});
    let updated=0;
    for(const item of data){const newCat=detectCategory(item.prompt||"");if(newCat!==item.category){await supabase.from("gallery_items").update({category:newCat}).eq("id",item.id);updated++;}}
    res.json({ok:true,total:data.length,updated});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/gallery/delete", checkAdminToken, async(req,res)=>{
  try{
    const{id}=req.body||{};
    if(!id)return res.status(400).json({error:"id requis"});
    const{error}=await supabase.from("gallery_items").delete().eq("id",id);
    if(error)throw error;
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/gallery/import-batch", checkAdminToken, async(req,res)=>{
  try{
    const{items}=req.body||{};
    if(!Array.isArray(items)||!items.length)return res.status(400).json({error:"items[] requis"});
    const results={success:0,errors:[]};
    const createdAt=new Date().toISOString();
    for(const item of items){
      const url=(item.url||"").trim(),prompt=(item.prompt||"").trim();
      const category=detectCategory(prompt)!=="divers"?detectCategory(prompt):(item.category||"divers");
      if(!url){results.errors.push({item,error:"url manquante"});continue;}
      const entry={id:`import-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,group_id:`batch-import-${Date.now()}`,created_at:createdAt,prompt:prompt||item.name||"icône",category,in_gallery:true,image_url:url,local_url:null,shopify_url:url,shopify_file_id:null};
      const{error}=await supabase.from("gallery_items").insert(entry);
      if(error){results.errors.push({item,error:error.message});}else{results.success++;}
    }
    res.json({ok:true,success:results.success,errors:results.errors.length,detail:results.errors});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/realized/save", checkOrigin, uploadLimiter, async(req,res)=>{
  try{
    const{imageBase64,color,dimension,thickness,leftLogoUrl,rightLogoUrl}=req.body||{};
    if(!imageBase64)return res.json({ok:true});
    const base64Data=imageBase64.replace(/^data:image\/\w+;base64,/,"");
    const inputBuffer=Buffer.from(base64Data,"base64");
    const optimized=await sharp(inputBuffer).resize(1200,300,{fit:"inside",withoutEnlargement:true}).png({compressionLevel:8}).toBuffer();
    const timestamp=Date.now();
    const fileName=`realized-${(color||"plaque").replace(/[^a-z0-9-]/gi,"")}-${timestamp}.png`;
    fs.writeFileSync(path.join(productionDir,fileName),optimized);
    const baseUrl=process.env.PUBLIC_BASE_URL||"https://simulateur-pag.up.railway.app";
    const localUrl=`${baseUrl}/generated/production/${fileName}`;
    let finalUrl=localUrl;
    try{const result=await uploadImageToShopify(optimized,fileName,"Réalisation plaque");if(result?.url)finalUrl=result.url;}catch(e){console.warn("Realized Shopify upload failed:",e.message);}
    res.json({ok:true,url:finalUrl});
    (async()=>{try{await supabase.from("realized_plaques").insert({image_url:finalUrl,color:color||null,dimension:dimension||null,thickness:thickness||null,left_logo_url:leftLogoUrl||null,right_logo_url:rightLogoUrl||null,created_at:new Date().toISOString()});}catch(e){console.warn("Supabase realized error:",e.message);}})();
  }catch(e){res.json({ok:false});}
});

app.post("/api/upload-base64", checkOrigin, uploadLimiter, async(req,res)=>{
  try{
    const{imageBase64,filename}=req.body||{};
    if(!imageBase64)return res.status(400).json({error:"imageBase64 requis"});
    const base64Data=imageBase64.replace(/^data:image\/\w+;base64,/,"");
    const buffer=Buffer.from(base64Data,"base64");
    const fname=filename||`preview-${Date.now()}.png`;
    const result=await uploadImageToShopify(buffer,fname,"Aperçu plaque");
    res.json({ok:true,url:result.url});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/logo/process", checkOrigin, uploadLimiter, async(req,res)=>{
  try{
    const{imageBase64}=req.body||{};
    if(!imageBase64)return res.status(400).json({error:"imageBase64 requis"});
    const base64Data=imageBase64.replace(/^data:image\/\w+;base64,/,"");
    const inputBuffer=Buffer.from(base64Data,"base64");
    const{data,info}=await sharp(inputBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const pixels=new Uint8Array(data);
    const w=info.width,h=info.height;
    let transparentCount=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<30)transparentCount++;}
    const transparentRatio=transparentCount/(w*h);
    const needsProcessing=transparentRatio<0.05;
    let processedPixels=Buffer.from(pixels),method="direct";
    if(needsProcessing){
      method="canvas";
      for(let i=0;i<processedPixels.length;i+=4){const r=processedPixels[i],g=processedPixels[i+1],b=processedPixels[i+2];const brightness=(r*0.299+g*0.587+b*0.114);if(r>200&&g>200&&b>200){processedPixels[i+3]=0;continue;}processedPixels[i]=0;processedPixels[i+1]=0;processedPixels[i+2]=0;processedPixels[i+3]=Math.min(255,Math.round((1-brightness/255)*255*1.5));}
    } else {
      method="transparent";
      for(let i=0;i<processedPixels.length;i+=4){if(processedPixels[i+3]<30)continue;processedPixels[i]=0;processedPixels[i+1]=0;processedPixels[i+2]=0;}
    }
    const outputBuffer=await sharp(processedPixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
    const filename=`client-logo-${Date.now()}.png`;
    const result=await uploadImageToShopify(outputBuffer,filename,"Logo client");
    res.json({ok:true,url:result.url,method});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/realized/delete", checkAdminToken, async(req,res)=>{
  try{
    const{id}=req.body||{};
    if(!id)return res.status(400).json({error:"id requis"});
    const{error}=await supabase.from("realized_plaques").delete().eq("id",id);
    if(error)throw error;
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/realized", async(req,res)=>{
  try{
    const limit=Math.min(Number(req.query.limit)||100,500);
    const{data,error}=await supabase.from("realized_plaques").select("id, image_url, color, dimension, thickness, left_logo_url, right_logo_url, created_at").order("created_at",{ascending:false}).limit(limit);
    if(error)return res.status(500).json({error:error.message});
    res.json({items:data||[]});
  }catch(e){res.status(500).json({error:e.message});}
});


// ── Shopify REST helpers ──────────────────────────────────────────────────────
const SHOPIFY_SHOP_HOST = (process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").trim();
const SHOPIFY_ACCESS_TOKEN_DIRECT = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VER = "2024-01";

async function shopifyREST(path, method="GET", body=null) {
  const url = `https://${SHOPIFY_SHOP_HOST}/admin/api/${SHOPIFY_API_VER}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN_DIRECT } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) console.error(`[Shopify REST] ${method} ${path} → ${res.status}:`, text.slice(0,200));
  try { return JSON.parse(text); } catch { return text; }
}

async function updateOrderNote(orderId, note) {
  return shopifyREST(`/orders/${orderId}.json`, "PUT", { order:{ id:orderId, note } });
}

async function setOrderMetafield(orderId, key, value) {
  return shopifyREST(`/orders/${orderId}/metafields.json`, "POST", {
    metafield: { namespace:"pag_production", key, value, type:"single_line_text_field" }
  });
}

// ── Colorisation logo pour production ────────────────────────────────────────
async function colorizeLogoBuffer(logoUrl, forceBlack=true) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data);
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i+3] > 30) { pixels[i]=17; pixels[i+1]=17; pixels[i+2]=17; }
    }
    return sharp(Buffer.from(pixels), { raw:{ width:info.width, height:info.height, channels:4 } }).png().toBuffer();
  } catch (e) { console.warn("[PAG] colorizeLogoBuffer error:", e.message); return null; }
}

function calcAutoFontSizeServer(lines, textWidth, H, hasLeft, hasRight) {
  if (!lines.length) return Math.round(H * 0.25);
  const lc = lines.length; let len = 1;
  lines.forEach(l => { if (l.length > len) len = l.length; });
  let base;
  if      (lc===1) base=(hasLeft&&hasRight)?H*0.42:(hasLeft||hasRight)?H*0.48:H*0.55;
  else if (lc===2) base=(hasLeft&&hasRight)?H*0.26:(hasLeft||hasRight)?H*0.30:H*0.36;
  else if (lc===3) base=(hasLeft&&hasRight)?H*0.19:(hasLeft||hasRight)?H*0.22:H*0.26;
  else             base=(hasLeft&&hasRight)?H*0.15:(hasLeft||hasRight)?H*0.17:H*0.20;
  const ratio = len > 10 ? 10/len : 1;
  return Math.max(Math.round(base * ratio), Math.round(H * 0.05));
}

// ── Génération fichier production BAL ────────────────────────────────────────
async function renderProdBAL({ dimension, color, lines, fontFamily, fontSize, textAlign, leftLogoUrl, rightLogoUrl, flippedLeft, flippedRight }) {
  const dimKey = normalizeDimension(dimension);
  const dims   = DIMENSION_MAP_BAL[dimKey] || DIMENSION_MAP_BAL["100x25mm"];
  const W = dims.w, H = dims.h;
  const CLIENT_H = 190, scaleY = H / CLIENT_H;
  const hasLeft = !!leftLogoUrl, hasRight = !!rightLogoUrl;
  const logoZoneW = Math.round(W * 0.25);
  let textLeft = 0, textWidth = W;
  if (hasLeft && !hasRight)  { textLeft = logoZoneW; textWidth = W - logoZoneW; }
  if (!hasLeft && hasRight)  { textLeft = 0;          textWidth = W - logoZoneW; }
  if (hasLeft && hasRight)   { textLeft = logoZoneW; textWidth = W - logoZoneW * 2; }
  const composites = [];
  const logoH = Math.round(H * 0.97);

  async function prepareLogo(logoUrl, xPos, flipped) {
    const colBuf = await colorizeLogoBuffer(logoUrl, true);
    if (!colBuf) return;
    const meta = await sharp(colBuf).metadata();
    const aspect = (meta.width||1) / (meta.height||1);
    let drawW, drawH;
    if (aspect > logoZoneW/logoH) { drawW=logoZoneW; drawH=Math.round(logoZoneW/aspect); }
    else                           { drawH=logoH;     drawW=Math.round(logoH*aspect); }
    drawW=Math.max(1,drawW); drawH=Math.max(1,drawH);
    let resized = await sharp(colBuf).resize(drawW,drawH,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    if (flipped) resized = await sharp(resized).flop().png().toBuffer();
    const imgX = xPos + Math.round((logoZoneW-drawW)/2);
    const imgY = Math.round((H-drawH)/2);
    composites.push({ input:resized, left:Math.max(0,imgX), top:Math.max(0,imgY) });
  }

  if (hasLeft)  await prepareLogo(leftLogoUrl,  0,             flippedLeft  || false);
  if (hasRight) await prepareLogo(rightLogoUrl, W-logoZoneW,   flippedRight || false);

  const filteredLines = (lines||[]).filter(l=>l.trim().length>0);
  if (filteredLines.length) {
    const fontName = fontFamily || "Baskvill";
    const align    = textAlign || "center";
    let scaledFs;
    if (fontSize) {
      scaledFs = Math.max(Math.round(fontSize * scaleY), 8);
    } else {
      // Compute base font size from height ratio (no character-count penalty)
      const lc = filteredLines.length;
      let baseRatio;
      if      (lc===1) baseRatio = (hasLeft&&hasRight)?0.42:(hasLeft||hasRight)?0.48:0.55;
      else if (lc===2) baseRatio = (hasLeft&&hasRight)?0.26:(hasLeft||hasRight)?0.30:0.36;
      else if (lc===3) baseRatio = (hasLeft&&hasRight)?0.19:(hasLeft||hasRight)?0.22:0.26;
      else             baseRatio = (hasLeft&&hasRight)?0.15:(hasLeft||hasRight)?0.17:0.20;
      scaledFs = Math.max(Math.round(CLIENT_H * baseRatio * scaleY), 8);
      // Shrink until the widest line fits within 93% of textWidth
      const testCanvas = createCanvas(W, H);
      const testCtx = testCanvas.getContext("2d");
      let iterations = 0;
      while (scaledFs > 8 && iterations < 40) {
        testCtx.font = `bold ${scaledFs}px "${fontName}", Arial, sans-serif`;
        const maxW = Math.max(...filteredLines.map(l => testCtx.measureText(l).width));
        if (maxW <= textWidth * 0.93) break;
        scaledFs = Math.max(Math.round(scaledFs * 0.92), 8);
        iterations++;
      }
    }
    const lineGap  = Math.round(scaledFs * 1.28);
    const totalTH  = lineGap * filteredLines.length;
    const startY   = Math.round((H-totalTH)/2 + scaledFs*0.82);
    const textCanvas = createCanvas(W, H);
    const ctx = textCanvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#111111"; ctx.font=`bold ${scaledFs}px "${fontName}", Arial, sans-serif`;
    ctx.textAlign=align; ctx.textBaseline="alphabetic";
    let cx;
    if      (align==="left")  cx = textLeft + Math.round(textWidth*0.05);
    else if (align==="right") cx = textLeft + textWidth - Math.round(textWidth*0.05);
    else                      cx = textLeft + Math.round(textWidth/2);
    filteredLines.forEach((line,i) => { ctx.fillText(line, cx, startY+i*lineGap); });
    const textBuf = await sharp(textCanvas.toBuffer("image/png")).ensureAlpha().png().toBuffer();
    composites.push({ input:textBuf, left:0, top:0 });
  }

  const base = sharp({ create:{ width:W, height:H, channels:4, background:{r:0,g:0,b:0,alpha:0} } }).png();
  return composites.length > 0 ? base.composite(composites).toBuffer() : base.toBuffer();
}

// ── Génération fichier production RUE ────────────────────────────────────────
async function renderProdRUE({ dimension, color, number, streetLines, fontFamily, numScale, streetScale, logoUrl, layout }) {
  const dimKey = normalizeDimension(dimension);
  const dims   = DIMENSION_MAP_RUE[dimKey] || DIMENSION_MAP_RUE["150x100mm"];
  const W = dims.w, H = dims.h;
  const zoneH = Math.round(H*0.75), bandH = H-zoneH;
  const imgW = Math.round(W*0.50), numW = W-imgW;
  const composites = [];

  if (logoUrl) {
    const colBuf = await colorizeLogoBuffer(logoUrl, true);
    if (colBuf) {
      const meta = await sharp(colBuf).metadata();
      const aspect = (meta.width||1)/(meta.height||1);
      const mW=imgW*0.95, mH=zoneH*0.95;
      let dW,dH;
      if (aspect>mW/mH) { dW=mW; dH=mW/aspect; } else { dH=mH; dW=mH*aspect; }
      dW=Math.max(1,Math.round(dW)); dH=Math.max(1,Math.round(dH));
      const resized = await sharp(colBuf).resize(dW,dH,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
      const imgX = (layout==="image-left"?0:numW) + Math.round((imgW-dW)/2);
      const imgY = Math.round((zoneH-dH)/2);
      composites.push({ input:resized, left:Math.max(0,imgX), top:Math.max(0,imgY) });
    }
  }

  const fontName = fontFamily || "Baskvill";
  const textCanvas = createCanvas(W, H);
  const ctx = textCanvas.getContext("2d");
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="#111111"; ctx.textBaseline="middle"; ctx.textAlign="center";

  if (number) {
    const numSize = Math.round(Math.round(zoneH*0.50) * ((numScale||100)/100));
    ctx.font = `bold ${numSize}px "${fontName}", Arial, sans-serif`;
    const numX = layout==="image-left" ? Math.round(imgW+numW/2) : Math.round(numW/2);
    ctx.fillText(number, numX, Math.round(zoneH/2));
  }

  const sl = Array.isArray(streetLines)&&streetLines.length ? streetLines : [];
  if (sl.length) {
    const nLines=sl.length;
    const streetSize = Math.round(Math.round((bandH/(nLines+0.4))*0.85) * ((streetScale||100)/100));
    ctx.font = `bold ${streetSize}px "${fontName}", Arial, sans-serif`;
    const lineGap=Math.round(streetSize*1.2), totalTH=lineGap*(nLines-1);
    const startY=Math.round(zoneH+bandH/2)-Math.round(totalTH/2);
    sl.forEach((line,i) => { ctx.fillText(line.toUpperCase(), Math.round(W/2), startY+i*lineGap); });
  }

  const textBuf = await sharp(textCanvas.toBuffer("image/png")).ensureAlpha().png().toBuffer();
  composites.push({ input:textBuf, left:0, top:0 });

  const base = sharp({ create:{ width:W, height:H, channels:4, background:{r:0,g:0,b:0,alpha:0} } }).png();
  return composites.length>0 ? base.composite(composites).toBuffer() : base.toBuffer();
}

// ── Génération fichier production BAL TEMPLATE ───────────────────────────────
async function renderProdBALTemplate({ templateHandle, zoneValues, fontFamily, fontSize }) {
  // 1. Récupérer le template depuis Supabase
  const { data: tpl, error } = await supabase.from("templates").select("*")
    .eq("shopify_product_handle", templateHandle).neq("active", false).single();
  if (error || !tpl) throw new Error(`Template introuvable: ${templateHandle}`);

  // 2. Télécharger le PNG du template
  const imgResp = await fetch(tpl.image_url);
  if (!imgResp.ok) throw new Error(`Impossible de télécharger le template PNG: ${tpl.image_url}`);
  const imgBuf = Buffer.from(await imgResp.arrayBuffer());
  const meta = await sharp(imgBuf).metadata();
  const SCALE = 3;
  const W = meta.width * SCALE, H = meta.height * SCALE;

  // 3. Rendre le fond blanc transparent, puis redimensionner à 3×
  const { data: rawData, info: rawInfo } = await sharp(imgBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < rawData.length; i += 4) {
    if (rawData[i] > 230 && rawData[i+1] > 230 && rawData[i+2] > 230) rawData[i+3] = 0;
  }
  const transparentTpl = await sharp(Buffer.from(rawData), {
    raw: { width: rawInfo.width, height: rawInfo.height, channels: 4 }
  }).resize(W, H, { fit: "fill" }).png().toBuffer();
  const scaledTpl = transparentTpl;

  // 4. Dessiner le texte des zones
  const composites = [{ input: scaledTpl, left: 0, top: 0 }];
  const zones = Array.isArray(tpl.zones) ? tpl.zones : [];
  const fontName = fontFamily || "Baskvill";

  if (zones.length) {
    const textCanvas = createCanvas(W, H);
    const ctx = textCanvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    zones.forEach(z => {
      const key = z.label || z.id;
      const text = ((zoneValues[key] || zoneValues[z.id] || "")).trim();
      if (!text) return;
      // zones stockées en % (0-100) dans Supabase
      const zx = (z.x/100) * W, zy = (z.y/100) * H, zw = (z.w/100) * W, zh = (z.h/100) * H;

      let fs = fontSize ? Math.round(fontSize * SCALE) : null;
      if (!fs) {
        fs = Math.floor(zh * 0.75);
        const minFs = 8;
        while (fs > minFs) {
          ctx.font = `bold ${fs}px "${fontName}", Arial, sans-serif`;
          if (ctx.measureText(text).width <= zw * 0.92) break;
          fs = Math.max(Math.round(fs * 0.92), minFs);
        }
      }
      ctx.font = `bold ${fs}px "${fontName}", Arial, sans-serif`;
      ctx.fillText(text, zx + zw / 2, zy + zh / 2);
    });

    const textBuf = await sharp(textCanvas.toBuffer("image/png")).ensureAlpha().png().toBuffer();
    composites.push({ input: textBuf, left: 0, top: 0 });
  }

  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().composite(composites).toBuffer();
}

// ── Génération fichier production FAMILLE ────────────────────────────────────
async function renderProdFamille({ dimension, membres, animaux, nom, numero, fontNom, fontPrenom, fontNumero, nomSize, numeroSize }) {
  const dimKey = normalizeDimension(dimension);
  const dims = DIMENSION_MAP_FAMILLE[dimKey] || DIMENSION_MAP_FAMILLE["200x133mm"];
  const W = dims.w, H = dims.h;
  const composites = [];
  const RAILWAY_BASE = (process.env.PUBLIC_BASE_URL || "https://simulateur-pag.up.railway.app").replace(/\/$/, "");

  // 1. Deco (noir sur transparent)
  try {
    const decoResp = await fetch(FAMILLE_DECO_URL);
    if (decoResp.ok) {
      const decoBuf = Buffer.from(await decoResp.arrayBuffer());
      const { data: dd, info: di } = await sharp(decoBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < dd.length; i += 4) { if (dd[i+3] > 10) { dd[i]=17; dd[i+1]=17; dd[i+2]=17; } }
      const decoBlack = await sharp(Buffer.from(dd), { raw:{ width:di.width, height:di.height, channels:4 } })
        .resize(W, H, { fit:"fill" }).png().toBuffer();
      composites.push({ input: decoBlack, left: 0, top: 0 });
    }
  } catch (e) { console.warn("[PAG Famille] deco error:", e.message); }

  // 2. Canvas texte (nom, prénoms, numéro)
  const textCanvas = createCanvas(W, H);
  const ctx = textCanvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#111111";

  // Nom de famille (1-3 lignes, textarea \n)
  const nomLines = (nom || "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 3);
  const NOM_AREA_TOP = Math.round(H * 0.04);
  let TOP_H = Math.round(H * 0.24);
  if (nomLines.length) {
    const longest = nomLines.reduce((a, b) => a.length >= b.length ? a : b, "");
    const nomBasePx = Math.min(H * 0.092, (W * 0.70) / Math.max(1, longest.length * 0.54 + 1));
    const nomPx = Math.round(nomBasePx * ((nomSize || 100) / 100));
    const nomLineH = Math.round(nomPx * 1.20);
    const nomStartY = NOM_AREA_TOP + Math.round(nomPx * 0.5);
    ctx.font = `bold ${nomPx}px "${fontNom || "Baskvill"}", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    nomLines.forEach((line, li) => { ctx.fillText(line, Math.round(W * 0.49), nomStartY + li * nomLineH); });
    TOP_H = Math.max(TOP_H, Math.round(NOM_AREA_TOP + nomLines.length * nomLineH + nomPx * 0.5));
  }

  // Layout personnages
  const all = [...(membres || []), ...(animaux || [])];
  const numSizeFactor = (numeroSize || 100) / 100;
  const showNum = !!(numero || "").trim();
  const NUM_W = showNum ? Math.round(W * Math.min(0.40, Math.max(0.10, 0.10 + numSizeFactor * 0.14))) : 0;
  const CHARS_W = W - NUM_W;
  const ZONE_H = H - TOP_H - 6;
  const PRENOM_H = Math.round(H * 0.058);
  const CHAR_H = ZONE_H - PRENOM_H;
  const slotW = all.length > 0 ? CHARS_W / all.length : CHARS_W;
  const allTypes = [...TYPES_MEMBRES_SERVER, ...TYPES_ANIMAUX_SERVER];

  // 3. Personnages (PNG noir)
  for (let idx = 0; idx < all.length; idx++) {
    const item = all[idx];
    const typeInfo = allTypes.find(t => t.key === item.type) || { heightRatio: 0.70 };
    const pKey = buildPngKeyServer(item.type, item.variant || 1);
    try {
      const pngResp = await fetch(`${RAILWAY_BASE}/assets/famille/${pKey}`);
      if (pngResp.ok) {
        const pngBuf = Buffer.from(await pngResp.arrayBuffer());
        const { data: pd, info: pi } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < pd.length; i += 4) { if (pd[i+3] > 10) { pd[i]=17; pd[i+1]=17; pd[i+2]=17; } }
        const dh = Math.max(1, Math.round(CHAR_H * typeInfo.heightRatio));
        const dw = Math.max(1, Math.round(dh * (pi.width / pi.height)));
        const offX = item.offX || 0;
        const cx = Math.round(slotW * idx + slotW / 2 + offX * slotW);
        const left = Math.max(0, Math.min(W - dw, cx - Math.round(dw / 2)));
        const top = Math.max(0, Math.round(TOP_H + CHAR_H - dh));
        const blackPng = await sharp(Buffer.from(pd), { raw:{ width:pi.width, height:pi.height, channels:4 } })
          .resize(dw, dh, { fit:"fill" }).png().toBuffer();
        composites.push({ input: blackPng, left, top });
      }
    } catch (e) { console.warn(`[PAG Famille] PNG ${pKey} error:`, e.message); }

    // Prénom + soulignement
    if (item.prenom) {
      const ps = Math.max(10, Math.min(Math.round(PRENOM_H * 0.70), Math.round(slotW / Math.max(1, item.prenom.length * 0.6 + 1))));
      const offX = item.offX || 0;
      const cx2 = slotW * idx + slotW / 2 + offX * slotW;
      ctx.font = `${ps}px "${fontPrenom || "Baskvill"}", Arial, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const py = TOP_H + CHAR_H + 4;
      ctx.fillText(item.prenom, cx2, py);
      const tw = ctx.measureText(item.prenom).width;
      ctx.strokeStyle = "#111111"; ctx.lineWidth = Math.max(1.5, ps * 0.11);
      ctx.beginPath(); ctx.moveTo(cx2 - tw/2, py + ps + 1); ctx.lineTo(cx2 + tw/2, py + ps + 1); ctx.stroke();
    }
  }

  // Numéro (bas droite)
  if (showNum) {
    const numPx = Math.round(Math.min(NUM_W * 0.88, ZONE_H * 0.70) * numSizeFactor);
    ctx.font = `bold ${numPx}px "${fontNumero || "Baskvill"}", Arial, sans-serif`;
    ctx.fillStyle = "#111111"; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText(numero, W - Math.round(W * 0.02), H - Math.round(H * 0.04));
  }

  const textBuf = await sharp(textCanvas.toBuffer("image/png")).ensureAlpha().png().toBuffer();
  composites.push({ input: textBuf, left: 0, top: 0 });

  return sharp({ create:{ width:W, height:H, channels:4, background:{ r:0, g:0, b:0, alpha:0 } } })
    .png().composite(composites).toBuffer();
}

// ── Génération fichier production RUE TEMPLATE ────────────────────────────────
async function renderProdRueTemplate({ templateId, zoneValues, dimension }) {
  const { data: tpl, error } = await supabase.from("rue_templates").select("*").eq("id", templateId).single();
  if (error || !tpl) throw new Error(`Template RUE introuvable: ${templateId}`);

  const dimKey = normalizeDimension(dimension);
  const dims = DIMENSION_MAP_RUE[dimKey] || DIMENSION_MAP_RUE["200x133mm"];
  const W = dims.w, H = dims.h;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const zones = Array.isArray(tpl.zones) ? tpl.zones : [];
  for (const z of zones) {
    const key = z.label || z.id;
    const rawText = (zoneValues[key] || "").trim();
    if (!rawText) continue;
    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const zx = (z.x / 100) * W, zy = (z.y / 100) * H;
    const zw = (z.w / 100) * W, zh = (z.h / 100) * H;
    const fontName = zoneValues["_police_" + key] || "Baskvill";
    const fixedFs = parseInt(zoneValues["_taille_" + key]) || 0;
    const fontPre = (z.bold ? "bold " : "") + (z.italic ? "italic " : "");
    const lineH = zh / lines.length;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let fontSize = fixedFs || Math.round(lineH * 0.75);
      ctx.font = `${fontPre}${fontSize}px "${fontName}", Arial, sans-serif`;
      while (fontSize > 8 && ctx.measureText(line).width > zw * 0.95) {
        fontSize -= 2;
        ctx.font = `${fontPre}${fontSize}px "${fontName}", Arial, sans-serif`;
      }
      ctx.fillStyle = "#111111";
      ctx.textAlign = z.align || "center";
      ctx.textBaseline = "middle";
      const tx = z.align === "left" ? zx + zw * 0.02 : z.align === "right" ? zx + zw * 0.98 : zx + zw / 2;
      ctx.fillText(line, tx, zy + li * lineH + lineH / 2);
    }
  }

  return canvas.toBuffer("image/png");
}

// ── WEBHOOK SHOPIFY orders/paid ───────────────────────────────────────────────
app.post("/webhook/orders-paid", async (req, res) => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const secret     = process.env.SHOPIFY_WEBHOOK_SECRET;
  const digest     = crypto.createHmac("sha256", secret).update(req.body).digest("base64");
  if (digest !== hmacHeader) { console.warn("[PAG Webhook] Signature invalide"); return res.status(401).send("Unauthorized"); }

  res.status(200).send("OK");

  let order;
  try { order = JSON.parse(req.body.toString()); }
  catch (e) { console.error("[PAG Webhook] Erreur parsing:", e); return; }

  console.log(`[PAG Webhook] Commande reçue : #${order.order_number} — ${order.email}`);

  const pagItems = (order.line_items||[]).filter(item =>
    item.properties && item.properties.some(p => p.name === "_pag_type")
  );

  if (!pagItems.length) { console.log(`[PAG Webhook] #${order.order_number} : pas de plaque PAG`); return; }

  const notesParts = [], sep = "=".repeat(50);
  const timestamp = new Date().toLocaleString("fr-FR", { timeZone:"Europe/Paris" });

  for (const item of pagItems) {
    const p = {}; item.properties.forEach(prop => { p[prop.name] = prop.value; });
    const pagType = p["_pag_type"] || "bal";
    const lineItemId = item.id;
    console.log(`[PAG Webhook] Traitement item #${lineItemId} — type: ${pagType}`);

    try {
      let prodBuffer, prodFilename, previewUrl, prodUrl;

      if (pagType === "bal") {
        const lines = [p["Ligne 1"]||"",p["Ligne 2"]||"",p["Ligne 3"]||"",p["Ligne 4"]||""].filter(l=>l.trim());
        prodBuffer = await renderProdBAL({
          dimension:    p["Dimension"]    || "100x25mm",
          color:        normalizeColor(p["Couleur plaque"] || "acier-brosse"),
          lines, fontFamily: p["Police"] || "Baskvill", fontSize: null,
          textAlign:    p["Alignement"]   || "center",
          leftLogoUrl:  p["_logo_gauche"] || null,
          rightLogoUrl: p["_logo_droite"] || null,
          flippedLeft:  p["_flip_gauche"] === "true",
          flippedRight: p["_flip_droite"] === "true",
        });
        prodFilename = `prod-bal-${order.order_number}-${lineItemId}.png`;

      } else if (pagType === "rue") {
        const sl = [p["Ligne 1 rue"]||"",p["Ligne 2 rue"]||"",p["Ligne 3 rue"]||""].filter(l=>l.trim());
        prodBuffer = await renderProdRUE({
          dimension:   p["Dimension"]       || "150x100mm",
          color:       normalizeColor(p["Couleur"] || "acier-brosse"),
          number:      p["Numéro"]          || "",
          streetLines: sl.length ? sl : (p["Nom de rue"] ? [p["Nom de rue"]] : []),
          fontFamily:  p["Police"]          || "Baskvill",
          numScale:    Number(p["_num_scale"]    || 100),
          streetScale: Number(p["_street_scale"] || 100),
          logoUrl:     p["_logo_url"]       || null,
          layout:      p["_layout"]         || "image-left",
        });
        prodFilename = `prod-rue-${order.order_number}-${lineItemId}.png`;

      } else if (pagType === "bal-template") {
        // Récupérer les valeurs des zones (toutes les propriétés sans préfixe _)
        const zoneValues = {};
        Object.entries(p).forEach(([k, v]) => { if (!k.startsWith("_") && k !== "Template") zoneValues[k] = v; });
        prodBuffer = await renderProdBALTemplate({
          templateHandle: p["_template_handle"] || "",
          zoneValues,
          fontFamily:     p["_Police"]   || "Baskvill",
          fontSize:       p["_FontSize"] ? Number(p["_FontSize"]) : null,
        });
        prodFilename = `prod-bal-tpl-${order.order_number}-${lineItemId}.png`;

      } else if (pagType === "famille") {
        let membres = [], animaux = [];
        try { membres = JSON.parse(p["_membres"] || "[]"); } catch (e) {}
        try { animaux = JSON.parse(p["_animaux"] || "[]"); } catch (e) {}
        prodBuffer = await renderProdFamille({
          dimension:  p["Dimension"]      || "200x133mm",
          membres,
          animaux,
          nom:        p["Nom de famille"] || "",
          numero:     p["Numéro"]         || "",
          fontNom:    p["Police nom"]     || "Baskvill",
          fontPrenom: p["Police prénoms"] || "Baskvill",
          fontNumero: p["Police numéro"]  || "Baskvill",
          nomSize:    Number(p["_nom_size"]    || 100),
          numeroSize: Number(p["_numero_size"] || 100),
        });
        prodFilename = `prod-famille-${order.order_number}-${lineItemId}.png`;

      } else if (pagType === "rue-template") {
        const RUE_TPL_SKIP = new Set(["Dimension","Couleur","Couleur plaque","Épaisseur","Fixation"]);
        const zoneValues = {};
        Object.entries(p).forEach(([k, v]) => {
          if (k.startsWith("_police_") || k.startsWith("_taille_")) { zoneValues[k] = v; }
          else if (!k.startsWith("_") && !RUE_TPL_SKIP.has(k)) { zoneValues[k] = v; }
        });
        prodBuffer = await renderProdRueTemplate({
          templateId: p["_template_id"] || "",
          zoneValues,
          dimension:  p["Dimension"] || "200x133mm",
        });
        prodFilename = `prod-rue-tpl-${order.order_number}-${lineItemId}.png`;
      }

      if (!prodBuffer) { console.warn(`[PAG Webhook] Buffer vide item ${lineItemId}`); continue; }

      // Upload Shopify CDN
      const uploaded = await uploadImageToShopify(prodBuffer, prodFilename, `Production #${order.order_number}`);
      prodUrl = uploaded?.url || null;

      if (prodUrl) {
        console.log(`[PAG Webhook] ✅ Fichier prod : ${prodUrl.slice(0,80)}`);
      } else {
        const localPath = path.join(productionDir, prodFilename);
        fs.writeFileSync(localPath, prodBuffer);
        prodUrl = `${process.env.PUBLIC_BASE_URL}/generated/production/${prodFilename}`;
        console.warn(`[PAG Webhook] Fallback local : ${prodUrl.slice(0,80)}`);
      }

      previewUrl = p["Aperçu plaque"] || p["_image"] || p["_Aperçu"] || "";
      await setOrderMetafield(order.id, `prod_url_${lineItemId}`, prodUrl);
      if (previewUrl) await setOrderMetafield(order.id, `preview_url_${lineItemId}`, previewUrl);

      // ── INSERT realized_plaques — réalisation client ───────────────────────
      try {
        await supabase.from("realized_plaques").insert({
          image_url:      previewUrl || prodUrl,
          color:          normalizeColor(p["Couleur plaque"] || p["Couleur"] || ""),
          dimension:      p["Dimension"] || null,
          thickness:      p["Epaisseur"] || p["Épaisseur"] || null,
          left_logo_url:  pagType === "bal" ? (p["_logo_gauche"] || null) : null,
          right_logo_url: pagType === "bal" ? (p["_logo_droite"] || null) : (p["_logo_url"] || null),
          created_at:     new Date().toISOString(),
        });
        console.log(`[PAG Webhook] ✅ realized_plaques inséré — #${order.order_number}/${lineItemId}`);
      } catch (e) {
        console.warn("[PAG Webhook] realized_plaques insert failed:", e.message);
      }
      // ── FIN INSERT realized_plaques ────────────────────────────────────────

      const colorLabel = {"acier-brosse":"Acier brossé","or":"Or","cuivre":"Cuivre","blanc":"Blanc","noir":"Noir","noir-brillant":"Noir brillant","gris":"Gris","noyer":"Noyer","rose":"Rose"}[normalizeColor(p["Couleur plaque"]||p["Couleur"]||"")] || "—";

      if (pagType === "bal") {
        notesParts.push(`${sep}\nPLAQUE BAL — Item #${lineItemId}\n${sep}\nCouleur    : ${colorLabel}\nDimension  : ${p["Dimension"]||"—"}\nÉpaisseur  : ${p["Epaisseur"]||"—"} mm\nPolice     : ${p["Police"]||"—"}\nAlignement : ${p["Alignement"]||"—"}\nTexte      : ${[p["Ligne 1"],p["Ligne 2"],p["Ligne 3"],p["Ligne 4"]].filter(Boolean).join(" / ")||"—"}\nLogo G     : ${p["_logo_gauche"]||"aucun"}\nLogo D     : ${p["_logo_droite"]||"aucun"}\n${sep}\n📎 Aperçu client  : ${previewUrl||"—"}\n🖨️  Fichier prod   : ${prodUrl}\n${sep}`);
      } else if (pagType === "bal-template") {
        const zoneLines = Object.entries(p).filter(([k])=>!k.startsWith("_")&&k!=="Template").map(([k,v])=>`${k.padEnd(10)}: ${v}`).join("\n");
        notesParts.push(`${sep}\nPLAQUE TEMPLATE — Item #${lineItemId}\n${sep}\nTemplate   : ${p["_Template"]||p["_template_handle"]||"—"}\nPolice     : ${p["_Police"]||"—"}\n${zoneLines}\n${sep}\n📎 Aperçu client  : ${previewUrl||"—"}\n🖨️  Fichier prod   : ${prodUrl}\n${sep}`);
      } else if (pagType === "rue-template") {
        const zoneLines = Object.entries(p).filter(([k])=>!k.startsWith("_")).map(([k,v])=>`${k.padEnd(12)}: ${v}`).join("\n");
        notesParts.push(`${sep}\nPLAQUE PRO TEMPLATE — Item #${lineItemId}\n${sep}\nTemplate   : ${p["_template_name"]||p["_template_id"]||"—"}\nDimension  : ${p["Dimension"]||"—"}\nCouleur    : ${colorLabel}\nÉpaisseur  : ${p["Épaisseur"]||"—"} mm\nFixation   : ${p["Fixation"]||"—"}\n${zoneLines}\n${sep}\n📎 Aperçu client  : ${previewUrl||"—"}\n🖨️  Fichier prod   : ${prodUrl}\n${sep}`);
      } else if (pagType === "famille") {
        notesParts.push(`${sep}\nPLAQUE FAMILLE — Item #${lineItemId}\n${sep}\nCouleur    : ${colorLabel}\nDimension  : ${p["Dimension"]||"—"}\nÉpaisseur  : ${p["Épaisseur"]||"—"} mm\nFixation   : ${p["Fixation"]||"—"}\nNom        : ${p["Nom de famille"]||"—"}\nNuméro     : ${p["Numéro"]||"—"}\nPolice nom : ${p["Police nom"]||"—"}\nPolice pré : ${p["Police prénoms"]||"—"}\nMembres    : ${p["_membres"]||"—"}\nAnimaux    : ${p["_animaux"]||"—"}\n${sep}\n📎 Aperçu client  : ${previewUrl||"—"}\n🖨️  Fichier prod   : ${prodUrl}\n${sep}`);
      } else {
        notesParts.push(`${sep}\nPLAQUE RUE — Item #${lineItemId}\n${sep}\nCouleur    : ${colorLabel}\nDimension  : ${p["Dimension"]||"—"}\nÉpaisseur  : ${p["Épaisseur"]||"—"} mm\nFixation   : ${p["Fixation"]||"—"}\nNuméro     : ${p["Numéro"]||"—"}\nRue        : ${p["Nom de rue"]||[p["Ligne 1 rue"],p["Ligne 2 rue"],p["Ligne 3 rue"]].filter(Boolean).join(" / ")||"—"}\nPolice     : ${p["Police"]||"—"}\nLogo       : ${p["_logo_url"]||"aucun"}\n${sep}\n📎 Aperçu client  : ${previewUrl||"—"}\n🖨️  Fichier prod   : ${prodUrl}\n${sep}`);
      }

    } catch (e) {
      console.error(`[PAG Webhook] Erreur item ${lineItemId}:`, e.message);
      notesParts.push(`${sep}\nERREUR génération — Item #${lineItemId}\n${e.message}\n${sep}`);
    }
  }

  const noteFinale = `PAG — FICHIERS DE PRODUCTION\nCommande  : #${order.order_number}\nClient    : ${order.billing_address?.first_name||""} ${order.billing_address?.last_name||""} <${order.email}>\nGénéré le : ${timestamp}\n\n${notesParts.join("\n\n")}`;
  await updateOrderNote(order.id, noteFinale);
  console.log(`[PAG Webhook] ✅ Note écrite sur commande #${order.order_number}`);
});
// ── TEMPLATES CRUD ────────────────────────────────────────────────────────────

app.get("/api/templates", async(req,res)=>{
  try{
    const token=req.headers["x-admin-token"]||req.query.token||req.body?.token||"";
    const isAdmin=token&&token===process.env.ADMIN_SECRET_TOKEN;
    const showAll=req.query.all==="1"&&isAdmin;
    let q=supabase.from("templates").select("*").order("created_at",{ascending:false});
    if(!showAll)q=q.eq("active",true);
    const{data,error}=await q;
    if(error)throw error;
    res.json(data||[]);
  }catch(e){res.status(500).json({error:e.message});}
});

// Upload image pour template → Shopify CDN (base64 JSON, auth par token pas origin)
app.post("/api/templates/upload-image", checkAdminToken, uploadLimiter, async(req,res)=>{
  try{
    const{imageBase64,filename}=req.body||{};
    if(!imageBase64)return res.status(400).json({error:"imageBase64 requis"});
    const base64Data=imageBase64.replace(/^data:image\/\w+;base64,/,"");
    const fileBuffer=Buffer.from(base64Data,"base64");
    const fname="template-"+Date.now()+"-"+(filename||"tpl.png");
    const optimized=await sharp(fileBuffer).resize(1400,null,{fit:"inside",withoutEnlargement:true}).png({compressionLevel:8}).toBuffer();
    const result=await uploadImageToShopify(optimized,fname,"Template plaque");
    res.json({ok:true,url:result.url});
  }catch(e){console.error("Template upload error:",e.message);res.status(500).json({error:e.message});}
});

app.get("/api/templates/by-handle/:handle", async(req,res)=>{
  try{
    const{data,error}=await supabase.from("templates").select("*").eq("shopify_product_handle",req.params.handle).neq("active",false).single();
    if(error)throw error;
    if(!data)return res.status(404).json({error:"Template introuvable"});
    res.json(data);
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/templates", checkAdminToken, async(req,res)=>{
  try{
    const{name,image_url,zones,shopify_product_handle,shape_mode}=req.body||{};
    if(!name||!image_url)return res.status(400).json({error:"name et image_url requis"});
    const{data,error}=await supabase.from("templates").insert({name,image_url,zones:zones||[],shopify_product_handle:shopify_product_handle||null,active:true,shape_mode:shape_mode===true}).select().single();
    if(error)throw error;
    res.json({ok:true,template:data});
  }catch(e){res.status(500).json({error:e.message});}
});

app.put("/api/templates/:id", checkAdminToken, async(req,res)=>{
  try{
    const{name,image_url,zones,shopify_product_handle,active,shape_mode}=req.body||{};
    const update={name,image_url,zones,shopify_product_handle,active};
    if(shape_mode!==undefined)update.shape_mode=shape_mode===true;
    const{data,error}=await supabase.from("templates").update(update).eq("id",req.params.id).select().single();
    if(error)throw error;
    res.json({ok:true,template:data});
  }catch(e){res.status(500).json({error:e.message});}
});

app.delete("/api/templates/:id", checkAdminToken, async(req,res)=>{
  try{
    const{error}=await supabase.from("templates").delete().eq("id",req.params.id);
    if(error)throw error;
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// ── RUE TEMPLATES CRUD ────────────────────────────────────────────────────────

app.get("/api/rue-templates", async(req,res)=>{
  try{
    const token=req.headers["x-admin-token"]||req.query.token||req.body?.token||"";
    const isAdmin=token&&token===process.env.ADMIN_SECRET_TOKEN;
    const showAll=req.query.all==="1"&&isAdmin;
    let q=supabase.from("rue_templates").select("*").order("created_at",{ascending:false});
    if(!showAll)q=q.eq("active",true);
    const{data,error}=await q;
    if(error)throw error;
    res.json(data||[]);
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/rue-templates/by-handle/:handle", async(req,res)=>{
  try{
    const{data,error}=await supabase.from("rue_templates").select("*").eq("shopify_product_handle",req.params.handle).eq("active",true);
    if(error)throw error;
    res.json(data||[]);
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/rue-templates", checkAdminToken, async(req,res)=>{
  try{
    const{name,zones,shopify_product_handle}=req.body||{};
    if(!name)return res.status(400).json({error:"name requis"});
    const{data,error}=await supabase.from("rue_templates").insert({name,zones:zones||[],shopify_product_handle:shopify_product_handle||null,active:true}).select().single();
    if(error)throw error;
    res.json({ok:true,template:data});
  }catch(e){res.status(500).json({error:e.message});}
});

app.put("/api/rue-templates/:id", checkAdminToken, async(req,res)=>{
  try{
    const{name,zones,shopify_product_handle,active}=req.body||{};
    const update={};
    if(name!==undefined)update.name=name;
    if(zones!==undefined)update.zones=zones;
    if(shopify_product_handle!==undefined)update.shopify_product_handle=shopify_product_handle;
    if(active!==undefined)update.active=active;
    const{data,error}=await supabase.from("rue_templates").update(update).eq("id",req.params.id).select().single();
    if(error)throw error;
    res.json({ok:true,template:data});
  }catch(e){res.status(500).json({error:e.message});}
});

app.delete("/api/rue-templates/:id", checkAdminToken, async(req,res)=>{
  try{
    const{error}=await supabase.from("rue_templates").delete().eq("id",req.params.id);
    if(error)throw error;
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// ── Bot de votes automatiques galerie ────────────────────────────────────────
const BOT_VOTES_PER_RUN = 20;         // nombre de logos votés à chaque session
const BOT_INTERVAL_H    = 2;          // toutes les X heures
const BOT_STARS_MIN     = 4;          // étoiles minimum (4 ou 5 pour garder une bonne moyenne)
const BOT_STARS_MAX     = 5;

async function autoRateGallery(){
  try{
    const{data:items,error}=await supabase.from("gallery_items").select("image_url").limit(500);
    if(error||!items||!items.length)return;
    // Mélange aléatoire et sélection de N items
    const shuffled=items.sort(()=>Math.random()-0.5).slice(0,BOT_VOTES_PER_RUN);
    for(const item of shuffled){
      const stars=Math.floor(Math.random()*(BOT_STARS_MAX-BOT_STARS_MIN+1))+BOT_STARS_MIN;
      await supabase.from("gallery_ratings").insert({image_url:item.image_url,stars});
      // Petite pause entre chaque vote pour paraître naturel
      await new Promise(r=>setTimeout(r,Math.round(Math.random()*3000+1000)));
    }
    console.log(`[BOT] ${shuffled.length} votes auto galerie (${BOT_STARS_MIN}-${BOT_STARS_MAX}★)`);
  }catch(e){console.warn("[BOT] autoRateGallery error:",e.message);}
}

setInterval(autoRateGallery, BOT_INTERVAL_H * 60 * 60 * 1000);

app.listen(PORT,()=>{
  console.log(`Server running on port ${PORT}`);
  console.log(`${fontFiles.length} polices configurées`);
  console.log("OPENAI_API_KEY présente :",!!process.env.OPENAI_API_KEY);
  console.log("SHOPIFY_STORE présent :",!!process.env.SHOPIFY_STORE);
  console.log("SUPABASE_URL présent :",!!process.env.SUPABASE_URL);
  console.log("ALLOWED_ORIGINS :",process.env.ALLOWED_ORIGINS||"(non configuré)");
  // Lancer un premier passage après 2 minutes
  setTimeout(autoRateGallery, 2 * 60 * 1000);
});
