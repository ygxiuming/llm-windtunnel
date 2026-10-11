import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { BenchConfig } from "@windtunnel/shared";
import { ROOT } from "./paths";
import { listEngines, getEngine } from "./registry";
import {
  startRun,
  getRunState,
  cancelRun,
  listResults,
  loadResult,
  deleteResult,
} from "./bench/runner";
import { renderReport } from "./report";

const app = Fastify({
  logger: { level: "info" },
  bodyLimit: 1024 * 1024,
});

await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  name: "llm-windtunnel",
  version: "0.1.0",
}));

app.get("/api/engines", async () => {
  return listEngines().map((e) => ({
    engine: e.engine,
    displayName: e.displayName,
    status: e.status,
    apiStyle: e.apiStyle,
    launchHint: e.launchHint,
    paramCount: e.params.length,
  }));
});

app.get("/api/registry/:engine", async (req, reply) => {
  const { engine } = req.params as { engine: string };
  const data = getEngine(engine);
  if (!data) {
    return reply.code(404).send({ error: `Unknown engine: ${engine}` });
  }
  return data;
});

/**
 * Server-side proxy for GET {baseUrl}/models — avoids CORS restrictions that
 * browsers impose on direct calls to local inference engines. Also extracts
 * the engine-reported max context length when available (vLLM: max_model_len,
 * llama.cpp-derived servers: context_window).
 */
app.get("/api/llm/models", async (req, reply) => {
  const { baseUrl, apiKey } = req.query as { baseUrl?: string; apiKey?: string };
  if (!baseUrl) {
    return reply.code(400).send({ error: "baseUrl query parameter is required" });
  }
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const res = await fetch(url, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { models: [], details: [], error: `HTTP ${res.status} from ${url}` };
    }
    const json = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
      models?: Array<Record<string, unknown>>;
    };
    const raw = json.data ?? json.models ?? [];
    type ModelDetail = { id: string; contextWindow?: number };
    const details = raw
      .map((m): ModelDetail | null => {
        const id = (m.id ?? m.name) as string | undefined;
        if (!id) return null;
        const ctx = (m.context_window ?? m.max_model_len) as number | undefined;
        return { id, contextWindow: typeof ctx === "number" ? ctx : undefined };
      })
      .filter((m): m is ModelDetail => m !== null);
    const ids = [...new Set(details.map((m) => m.id))].sort((a, b) =>
      a.localeCompare(b)
    );
    return { models: ids, details };
  } catch (err) {
    return { models: [], details: [], error: String(err) };
  }
});

app.post("/api/bench/run", async (req, reply) => {
  const body = (req.body ?? {}) as { config?: unknown };
  const parsed = BenchConfig.safeParse(body.config);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid bench config",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  const runId = startRun(parsed.data);
  return reply.code(201).send({ runId });
});

app.get("/api/bench/status/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const state = getRunState(id);
  if (!state) {
    return reply.code(404).send({ error: `Unknown run: ${id}` });
  }
  return state;
});

app.post("/api/bench/cancel/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!cancelRun(id)) {
    return reply.code(404).send({ error: `Unknown run: ${id}` });
  }
  return { ok: true };
});

app.get("/api/bench/results", async () => listResults());

app.get("/api/bench/results/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const result = await loadResult(id);
  if (!result) {
    return reply.code(404).send({ error: `Unknown result: ${id}` });
  }
  return result;
});

app.get("/api/bench/results/:id/report", async (req, reply) => {
  const { id } = req.params as { id: string };
  const result = await loadResult(id);
  if (!result) {
    return reply.code(404).send({ error: `Unknown result: ${id}` });
  }
  reply.type("text/html; charset=utf-8");
  return renderReport(result);
});

app.delete("/api/bench/results/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const out = await deleteResult(id);
  if (!out.ok) {
    return reply.code(400).send({ error: out.error });
  }
  return { ok: true };
});

// ---- Static hosting of the built frontend (production mode) ----
const distDir = path.join(ROOT, "web", "dist");
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
} else {
  app.log.warn(`web/dist not found — run "npm run build" to build the frontend`);
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
