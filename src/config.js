import path from "path";
import dotenv from "dotenv";

dotenv.config();

const ROOT_DIR = process.cwd();
const GENERATED_DIR = process.env.GENERATED_DIR || "generated";

export const config = {
  port: Number(process.env.PORT || 8787),
  allowOrigin: process.env.ALLOW_ORIGIN || "*",
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8787}`,
  defaultLogoStyle: process.env.DEFAULT_LOGO_STYLE || "gravure-simple-noir",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 24),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  paths: {
    root: ROOT_DIR,
    generated: path.join(ROOT_DIR, GENERATED_DIR),
    logosPng: path.join(ROOT_DIR, GENERATED_DIR, "logos", "png"),
    logosWebp: path.join(ROOT_DIR, GENERATED_DIR, "logos", "webp"),
    previews: path.join(ROOT_DIR, GENERATED_DIR, "previews"),
    production: path.join(ROOT_DIR, GENERATED_DIR, "production"),
    sessions: path.join(ROOT_DIR, GENERATED_DIR, "sessions"),
    data: path.join(ROOT_DIR, "src", "data"),
    logoLibrary: path.join(ROOT_DIR, "src", "data", "logo-library.json"),
    variantMap: path.join(ROOT_DIR, "src", "data", "variant-map.example.json")
  }
};
