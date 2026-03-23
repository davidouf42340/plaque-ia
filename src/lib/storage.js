import fs from "fs";
import path from "path";

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureJsonFile(filePath, initialData) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), "utf8");
  }
}

export function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Unable to read JSON ${filePath}`, error);
    return fallback;
  }
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function fileUrl(baseUrl, absoluteFilePath, generatedRootPath) {
  const relativePath = absoluteFilePath.replace(generatedRootPath, "").replaceAll(path.sep, "/");
  return `${baseUrl}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}
