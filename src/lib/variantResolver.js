import { config } from "../config.js";
import { readJson } from "./storage.js";

const variantMap = readJson(config.paths.variantMap, { variants: [] }) || { variants: [] };

export function resolveVariant({ dimension, thickness }) {
  return variantMap.variants.find((item) => item.dimension === dimension && item.thickness === thickness) || null;
}

export function getVariantMap() {
  return variantMap;
}
