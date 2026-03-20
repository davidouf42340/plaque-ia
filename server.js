import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OpenAI } from "openai";

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());
app.use(express.json({ limit: "20mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GENERATED_DIR = "generated";
const PREVIEW_DIR = path.join(GENERATED_DIR, "previews");
const PRODUCTION_DIR = path.join(GENERATED_DIR, "production");
const CREATIONS_FILE = "creations.json";

for (const dir of [GENERATED_DIR, PREVIEW_DIR, PRODUCTION_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(CREATIONS_FILE)) {
  fs.writeFileSync(CREATIONS_FILE, "[]", "
