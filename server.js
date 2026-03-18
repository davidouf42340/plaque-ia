import express from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { OpenAI } from "openai"

const app = express()
app.use(cors())
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const PORT = process.env.PORT || 3000

// dossiers
const previewDir = "generated/previews"
const pictoDir = "generated/pictos"
const productionDir = "generated/production"

if (!fs.existsSync("generated")) fs.mkdirSync("generated")
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir)
if (!fs.existsSync(pictoDir)) fs.mkdirSync(pictoDir)
if (!fs.existsSync(productionDir)) fs.mkdirSync(productionDir)

app.use("/generated", express.static("generated"))

// couleurs foncées = texte blanc
const darkMaterials = ["noirB", "noirM", "noyer", "rose", "gris"]

function textColor(material) {
  return darkMaterials.includes(material) ? "#ffffff" : "#000000"
}

// base64
function fileToDataUri(filePath) {
  const ext = path.extname(filePath)
  const mime =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
      ? "image/png"
      : "application/octet-stream"

  const file = fs.readFileSync(filePath)
  return `data:${mime};base64,${file.toString("base64")}`
}

// génération picto IA (avec cache simple)
async function generatePicto(prompt) {

  const fileNameSafe = prompt.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const existing = `${pictoDir}/${fileNameSafe}.png`

  if (fs.existsSync(existing)) {
    return existing
  }

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: `black engraving icon, simple, no color, transparent background, ${prompt}`,
    size: "1024x1024",
    background: "transparent"
  })

  const base64 = response.data[0].b64_json

  fs.writeFileSync(existing, Buffer.from(base64, "base64"))

  return existing
}

// SVG preview + prod IDENTIQUE
async function buildSvg({
  line1 = "",
  line2 = "",
  line3 = "",
  iconLeft = "",
  iconRight = "",
  material = "acier"
}) {

  const textCol = textColor(material)

  let iconLeftData = ""
  let iconRightData = ""

  if (iconLeft) iconLeftData = fileToDataUri(iconLeft)
  if (iconRight) iconRightData = fileToDataUri(iconRight)

  return `
<svg width="1200" height="300" viewBox="0 0 1200 300" xmlns="http://www.w3.org/2000/svg">

<rect width="1200" height="300" fill="transparent"/>

${
iconLeftData
?
`<image href="${iconLeftData}" x="0" y="15" width="270" height="270"/>`
:
""
}

${
iconRightData
?
`<image href="${iconRightData}" x="930" y="15" width="270" height="270"/>`
:
""
}

<text x="600" y="120" font-size="80" text-anchor="middle" fill="${textCol}" font-family="Arial">${line1}</text>

<text x="600" y="200" font-size="80" text-anchor="middle" fill="${textCol}" font-family="Arial">${line2}</text>

<text x="600" y="280" font-size="80" text-anchor="middle" fill="${textCol}" font-family="Arial">${line3}</text>

</svg>
`
}

// conversion PNG 600 DPI
async function svgToPng(svg, outputPath) {

  const buffer = Buffer.from(svg)

  await sharp(buffer)
    .resize(7087, 1772) // équivalent 300mm à 600 DPI
    .png({
      compressionLevel: 9,
      quality: 100
    })
    .toFile(outputPath)
}

// API principale
app.post("/compose", async (req, res) => {

  try {

    const { prompt, material } = req.body

    let line1 = ""
    let line2 = ""
    let line3 = ""

    if (prompt) {
      const lines = prompt.split(",")
      line1 = lines[0] || ""
      line2 = lines[1] || ""
      line3 = lines[2] || ""
    }

    let iconLeft = ""
    let iconRight = ""

    if (prompt.toLowerCase().includes("chien") || prompt.toLowerCase().includes("chat")) {
      iconLeft = await generatePicto(prompt)
    }

    if (prompt.toLowerCase().includes("maison") || prompt.toLowerCase().includes("foot")) {
      iconRight = await generatePicto(prompt)
    }

    const svg = await buildSvg({
      line1,
      line2,
      line3,
      iconLeft,
      iconRight,
      material
    })

    const previewName = `preview-${Date.now()}.svg`
    const previewPath = `${previewDir}/${previewName}`

    fs.writeFileSync(previewPath, svg)

    const productionName = `prod-${Date.now()}.png`
    const productionPath = `${productionDir}/${productionName}`

    await svgToPng(svg, productionPath)

    res.json({
      preview: `${req.protocol}://${req.get("host")}/${previewPath}`,
      production: `${req.protocol}://${req.get("host")}/${productionPath}`
    })

  } catch (e) {

    console.log(e)
    res.status(500).json({ error: "erreur serveur" })

  }

})

// test route
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});
