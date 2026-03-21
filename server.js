import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";

if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

app.use("/generated", express.static(GENERATED_DIR));

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 300;

const PRODUCTION_WIDTH = 1600;
const PRODUCTION_HEIGHT = 400;

const PREVIEW_QUARTER = Math.round(PREVIEW_WIDTH * 0.25);
const PRODUCTION_QUARTER = Math.round(PRODUCTION_WIDTH * 0.25);

const PREVIEW_MARGIN_X = 24;
const PREVIEW_MARGIN_Y = 28;

const PRODUCTION_MARGIN_X = 32;
const PRODUCTION_MARGIN_Y = 36;

const PREVIEW_ICON_MAX_WIDTH = PREVIEW_QUARTER - PREVIEW_MARGIN_X * 2;
const PREVIEW_ICON_MAX_HEIGHT = PREVIEW_HEIGHT - PREVIEW_MARGIN_Y * 2;

const PRODUCTION_ICON_MAX_WIDTH = PRODUCTION_QUARTER - PRODUCTION_MARGIN_X * 2;
const PRODUCTION_ICON_MAX_HEIGHT = PRODUCTION_HEIGHT - PRODUCTION_MARGIN_Y * 2;

function buildSingleLogoPrompt({ engravingColor, iconName }) {
  const color = engravingColor === "white" ? "white" : "black";

  return `
Create a single isolated logo for an engraved nameplate.

STRICT RULES:
- transparent background only
- one single icon only
- no text
- no letters
- no words
- no border
- no frame
- no plate
- no rectangle
- no background
- no scene
- centered icon
- simple engraving style
- vector-like lines
- clean professional look

ICON:
${iconName}

COLOR:
- use only ${color}
- everything else transparent

OUTPUT:
- one isolated transparent PNG
