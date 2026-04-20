import path from "path";
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pluginRoot = path.join(__dirname, "..");

export function getPath(...paths) {
  return path.join(pluginRoot, ...paths);
}