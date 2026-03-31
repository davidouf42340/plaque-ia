import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIG PLAQUES
========================= */

const DIMENSIONS_MAP = {
  "100x25mm": { width: 100, height: 25 },
  "150x37mm": { width: 150, height: 37 },
  "200x50mm": { width: 200, height: 50 },
  "250x87mm": { width: 250, height: 87 },
  "300x100mm": { width: 300, height: 100 }
};

/* =========================
   TEXT SVG BUILDER
========================= */

function buildProductionTextSvg({
  width,
  height,
  lines,
  hasLeftLogo,
  hasRightLogo
}) {
  const marginLeft = hasLeftLogo ? width * 0.20 : 0;
  const marginRight = hasRightLogo ? width * 0.20 : 0;

  const usableWidth = width - marginLeft - marginRight;
  const centerX = marginLeft + usableWidth / 2;

  const visibleLines = lines.filter(l => l && l.trim());

  const lineCount = visibleLines.length || 1;
  const longestLineLength = Math.max(...visibleLines.map(l => l.length), 1);

  // 🔥 Taille BOOSTÉE pour remplir visuellement la plaque
  let baseFontSize;
  if (lineCount === 1) {
    baseFontSize = height * 0.68;
  } else if (lineCount === 2) {
    baseFontSize = height * 0.42;
  } else {
    baseFontSize = height * 0.30;
  }

  let widthRatio = 1;
  if (longestLineLength > 8) {
    widthRatio = 8 / longestLineLength;
  }

  const fontSize = Math.max(baseFontSize * widthRatio, 12);

  const totalHeight = lineCount * fontSize * 1.1;
  const startY = height / 2 - totalHeight / 2 + fontSize;

  let svg = "";

  visibleLines.forEach((line, i) => {
    const y = startY + i * fontSize * 1.1;

    svg += `
      <text 
        x="${centerX}" 
        y="${y}" 
        font-size="${fontSize}" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >
        ${line}
      </text>
    `;
  });

  return svg;
}

/* =========================
   ROUTE PRODUCTION
========================= */

app.post("/api/render/production", async (req, res) => {
  try {
    const {
      line1,
      line2,
      line3,
      dimension,
      leftLogoUrl,
      rightLogoUrl
    } = req.body;

    const dim = DIMENSIONS_MAP[dimension];
    if (!dim) {
      return res.status(400).json({ error: "Dimension invalide" });
    }

    const width = dim.width;
    const height = dim.height;

    const hasLeft = !!leftLogoUrl;
    const hasRight = !!rightLogoUrl;

    const textSvg = buildProductionTextSvg({
      width,
      height,
      lines: [line1, line2, line3],
      hasLeftLogo: hasLeft,
      hasRightLogo: hasRight
    });

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        
        ${hasLeft ? `
          <image href="${leftLogoUrl}" x="0" y="0" width="${width * 0.20}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
        ` : ""}

        ${hasRight ? `
          <image href="${rightLogoUrl}" x="${width * 0.80}" y="0" width="${width * 0.20}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
        ` : ""}

        ${textSvg}

      </svg>
    `;

    res.json({
      ok: true,
      url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur génération" });
  }
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
