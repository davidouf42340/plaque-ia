const STOP_WORDS = new Set([
  "un", "une", "des", "de", "du", "la", "le", "les", "logo", "logos", "icone", "icones",
  "pictogramme", "pictogrammes", "image", "images", "simple", "noir", "fond", "transparent",
  "pour", "avec", "style", "grave", "gravure", "plaque", "sur", "et"
]);

export function stripAccents(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeLogoPrompt(prompt = "") {
  const raw = stripAccents(String(prompt).toLowerCase())
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = raw.split(" ").filter(Boolean).filter((token) => !STOP_WORDS.has(token));
  const normalized = tokens.slice(0, 3).join(" ").trim();
  return normalized || raw || "logo";
}

export function slugify(value = "") {
  return stripAccents(String(value).toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
