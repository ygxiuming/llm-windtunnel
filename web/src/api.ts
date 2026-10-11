import type {
  BenchConfigT,
  EngineRegistryT,
  RunProgressT,
  RunResultT,
  RunStatusT,
  RunSummaryT,
} from "@windtunnel/shared";

export interface EngineMeta {
  engine: string;
  displayName: string;
  status: "active" | "archived";
  apiStyle: string;
  launchHint?: { en: string; zh: string };
  paramCount: number;
}

export interface ModelDetail {
  id: string;
  contextWindow?: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText} ${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  engines: () =>
    fetch("/api/engines").then((r) => json<EngineMeta[]>(r)),

  registry: (engine: string) =>
    fetch(`/api/registry/${encodeURIComponent(engine)}`).then((r) =>
      json<EngineRegistryT>(r)
    ),

  /** Proxy-loaded model list for an OpenAI-compatible endpoint. */
  models: (baseUrl: string, apiKey?: string) => {
    const q = new URLSearchParams({ baseUrl });
    if (apiKey) q.set("apiKey", apiKey);
    return fetch(`/api/llm/models?${q.toString()}`).then((r) =>
      json<{ models: string[]; details?: ModelDetail[]; error?: string }>(r)
    );
  },

  startRun: (config: BenchConfigT) =>
    fetch("/api/bench/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    }).then((r) => json<{ runId: string }>(r)),

  status: (runId: string) =>
    fetch(`/api/bench/status/${runId}`).then((r) =>
      json<{
        status: RunStatusT;
        progress: RunProgressT;
        result: RunResultT;
      }>(r)
    ),

  cancel: (runId: string) =>
    fetch(`/api/bench/cancel/${runId}`, { method: "POST" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),

  results: () =>
    fetch("/api/bench/results").then((r) => json<RunSummaryT[]>(r)),

  result: (id: string) =>
    fetch(`/api/bench/results/${id}`).then((r) => json<RunResultT>(r)),

  deleteResult: (id: string) =>
    fetch(`/api/bench/results/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),

  reportUrl: (id: string) => `/api/bench/results/${id}/report`,
};
