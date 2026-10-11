import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (server/src/paths.ts → up two levels). */
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
