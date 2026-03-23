import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { ensureDir } from "./lib/storage.js";
import { normalizeLogoPrompt } from "./lib/normalize.js";
import { findReusableLogos, getLogoById, incrementLogoUsage, storeGeneratedLogo } from "./lib/logoLibrary.js";
import { generateLogosWithOpenAi } from "./lib/imageGenerator.js";
import { renderPreviewSet, renderProductionFile } from "./lib/renderers.js";
import { getVariantMap, resolveVariant } from "./lib/variantResolver.js";

const app = express();
app.use(cors({ origin: config.allowOrigin }));
app.use(express.json({ limit: "20mb" }));
app.use("/generated", express.static(config.paths.generated));

[
  config.paths.generated,
  config.paths.logosPng,
  config.paths.logosWebp,
  config.paths.previews,
  config.paths.production,
  config.paths.sessions
].forEach(ensureDir);

const sessions = new Map();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "plaque-configurator-server" });
});

app.get("/api/variants", (_req, res) => {
  res.json(getVariantMap());
});

app.post("/api/session/start", (req, res) => {
  const sessionId = `cfg_${nanoid(12)}`;
  const session = {
    sessionId,
    startedAt: new Date().toISOString(),
    generationLocked: false,
    generationDone: false,
    selectedColor: null,
    selectedVariant: null,
    selectedDimension: null,
    selectedThickness: null,
    line1: "",
    line2: "",
    line3: "",
    fontFamily: "Arial, sans-serif",
    textSizes: { line1: 32, line2: 22, line3: 18 },
    leftLogoScale: 1,
    rightLogoScale: 1,
    leftLogoId: null,
    rightLogoId: null
  };
  sessions.set(sessionId, session);
  res.json(session);
});

app.post("/api/logos/suggest", async (req, res) => {
  try {
    const { sessionId, prompt, count = 3 } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session introuvable." });
    if (session.generationLocked) return res.status(409).json({ error: "La génération est déjà verrouillée pour cette session." });
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: "Prompt logo manquant." });

    const keywordMain = normalizeLogoPrompt(prompt);
    const reusable = findReusableLogos(keywordMain, count);
    const missingCount = Math.max(0, count - reusable.length);
    const generated = [];

    if (missingCount > 0) {
      const pngBuffers = await generateLogosWithOpenAi({ prompt, count: missingCount });
      for (const pngBuffer of pngBuffers) {
        const logo = await storeGeneratedLogo({
          keywordMain,
          keywordsSecondary: [],
          promptOriginal: prompt,
          promptNormalized: keywordMain,
          style: config.defaultLogoStyle,
          pngBuffer
        });
        generated.push(logo);
      }
    }

    session.generationLocked = true;
    session.generationDone = true;
    sessions.set(sessionId, session);

    res.json({
      sessionId,
      keywordMain,
      reusedCount: reusable.length,
      generatedCount: generated.length,
      locked: true,
      logos: [...reusable, ...generated].slice(0, count)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erreur génération logos." });
  }
});

app.post("/api/session/update", (req, res) => {
  const { sessionId, patch } = req.body || {};
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "Session introuvable." });
  Object.assign(session, patch || {});
  sessions.set(sessionId, session);
  res.json(session);
});

app.post("/api/render/previews", async (req, res) => {
  try {
    const payload = req.body || {};
    const previews = await renderPreviewSet(payload);
    res.json({ previews });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erreur génération aperçus." });
  }
});

app.post("/api/render/production", async (req, res) => {
  try {
    const payload = req.body || {};
    const production = await renderProductionFile(payload);
    if (payload.leftLogoId || payload.rightLogoId) {
      incrementLogoUsage([payload.leftLogoId, payload.rightLogoId].filter(Boolean));
    }
    res.json({ production });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erreur génération production." });
  }
});

app.post("/api/variant/resolve", (req, res) => {
  const { dimension, thickness } = req.body || {};
  const variant = resolveVariant({ dimension, thickness });
  if (!variant) return res.status(404).json({ error: "Variant introuvable." });
  res.json({ variant });
});

app.get("/api/logo/:id", (req, res) => {
  const logo = getLogoById(req.params.id);
  if (!logo) return res.status(404).json({ error: "Logo introuvable." });
  res.json({ logo });
});

app.listen(config.port, () => {
  console.log(`Plaque configurator server running on ${config.appBaseUrl}`);
});
