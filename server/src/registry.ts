import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { EngineRegistry, type EngineRegistryT } from "@windtunnel/shared";
import { ROOT } from "./paths";

const ENGINES_DIR = path.join(ROOT, "registry", "engines");

let cache: Map<string, EngineRegistryT> | null = null;

function loadAll(): Map<string, EngineRegistryT> {
  const map = new Map<string, EngineRegistryT>();
  const files = readdirSync(ENGINES_DIR).filter((f) =>
    f.endsWith(".yaml")
  );
  if (files.length === 0) {
    throw new Error(`No registry files found in ${ENGINES_DIR}`);
  }
  for (const file of files) {
    const raw = yaml.load(readFileSync(path.join(ENGINES_DIR, file), "utf8"));
    const parsed = EngineRegistry.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid registry file ${file}: ${issues}`);
    }
    map.set(parsed.data.engine, parsed.data);
  }
  return map;
}

function registry(): Map<string, EngineRegistryT> {
  cache ??= loadAll();
  return cache;
}

export function listEngines(): EngineRegistryT[] {
  return [...registry().values()];
}

export function getEngine(id: string): EngineRegistryT | undefined {
  return registry().get(id);
}
