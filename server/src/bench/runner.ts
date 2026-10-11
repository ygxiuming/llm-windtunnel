import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BenchConfigT,
  BenchScenarioT,
  RunProgressT,
  RunResultT,
  RunSummaryT,
} from "@windtunnel/shared";
import { ROOT } from "../paths";
import { runScenario } from "./engine";

const RESULTS_DIR = path.join(ROOT, "results");

/** Scenario list for a config: explicit matrix, or the concurrency sweep. */
function scenariosOf(config: BenchConfigT): BenchScenarioT[] {
  return (
    config.scenarios ??
    config.concurrencyLevels.map((c) => ({
      inputTokens: config.inputTokens,
      outputTokens: config.outputTokens,
      concurrency: c,
      requests: config.requestsPerLevel,
    }))
  );
}

interface RunState {
  result: RunResultT;
  progress: RunProgressT;
  controller: AbortController;
}

const runs = new Map<string, RunState>();

async function persist(result: RunResultT): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${result.id}.json`);
  await writeFile(file, JSON.stringify(result, null, 2), "utf8");
}

async function execute(state: RunState): Promise<void> {
  const { result, controller, progress } = state;
  const scenarios = scenariosOf(result.config);
  try {
    for (let si = 0; si < scenarios.length; si++) {
      if (controller.signal.aborted) break;
      const sc = scenarios[si]!;
      progress.levelIndex = si;
      progress.levelCount = scenarios.length;
      progress.requestsDone = 0;
      progress.requestsTotal = sc.requests;

      const outcome = await runScenario(result.config, sc, {
        signal: controller.signal,
        onProgress: (done, total) => {
          progress.requestsDone = done;
          progress.requestsTotal = total;
        },
      });
      result.levels.push(outcome.metrics);
      if (outcome.tokenCounting === "server-usage") {
        result.tokenCounting = "server-usage";
      } else if (!result.tokenCounting) {
        result.tokenCounting = "local-tiktoken";
      }
      await persist(result);
    }
  } catch (err) {
    if (!result.error) result.error = String(err);
  } finally {
    if (controller.signal.aborted) {
      result.status = "cancelled";
    } else if (result.error) {
      result.status = "failed";
    } else {
      result.status = "completed";
    }
    await persist(result);
  }
}

export function startRun(config: BenchConfigT): string {
  const id = randomUUID().slice(0, 8);
  const controller = new AbortController();
  const state: RunState = {
    result: {
      id,
      createdAt: new Date().toISOString(),
      status: "running",
      config,
      levels: [],
    },
    progress: {
      levelIndex: 0,
      levelCount: scenariosOf(config).length,
      requestsDone: 0,
      requestsTotal: config.requestsPerLevel,
    },
    controller,
  };
  runs.set(id, state);
  void execute(state);
  return id;
}

export function getRunState(
  id: string
): { status: RunResultT["status"]; progress: RunProgressT; result: RunResultT } | undefined {
  const state = runs.get(id);
  if (!state) return undefined;
  return {
    status: state.result.status,
    progress: { ...state.progress },
    result: state.result,
  };
}

export function cancelRun(id: string): boolean {
  const state = runs.get(id);
  if (!state) return false;
  state.controller.abort();
  return true;
}

export function getResult(id: string): RunResultT | undefined {
  return runs.get(id)?.result;
}

function toSummary(result: RunResultT): RunSummaryT {
  const best = [...result.levels]
    .reverse()
    .find((l) => l.successfulRequests > 0);
  return {
    id: result.id,
    createdAt: result.createdAt,
    status: result.status,
    model: result.config.model,
    baseUrl: result.config.baseUrl,
    inputTokens: result.config.inputTokens,
    outputTokens: result.config.outputTokens,
    concurrencyLevels: result.config.concurrencyLevels,
    headline: best
      ? {
          concurrency: best.concurrency,
          outputThroughput: best.outputThroughput,
          ttftP50Ms: best.ttft?.p50,
          ttftP99Ms: best.ttft?.p99,
        }
      : undefined,
  };
}

export async function listResults(): Promise<RunSummaryT[]> {
  let files: string[] = [];
  try {
    files = (await readdir(RESULTS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const summaries: RunSummaryT[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(
        await readFile(path.join(RESULTS_DIR, file), "utf8")
      ) as RunResultT;
      summaries.push(toSummary(raw));
    } catch {
      // skip unreadable result files
    }
  }
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return summaries;
}

export async function loadResult(id: string): Promise<RunResultT | undefined> {
  const inMemory = getResult(id);
  if (inMemory) return inMemory;
  if (!/^[0-9a-f]{8}$/i.test(id)) return undefined;
  try {
    const raw = await readFile(path.join(RESULTS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as RunResultT;
  } catch {
    return undefined;
  }
}

/** Delete a stored run report. In-flight runs must be cancelled first. */
export async function deleteResult(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f]{8}$/i.test(id)) {
    return { ok: false, error: "invalid run id" };
  }
  const state = runs.get(id);
  if (state && state.result.status === "running") {
    return { ok: false, error: "run is still in progress — cancel it first" };
  }
  runs.delete(id);
  try {
    await unlink(path.join(RESULTS_DIR, `${id}.json`));
    return { ok: true };
  } catch {
    return state
      ? { ok: true }
      : { ok: false, error: "result not found" };
  }
}
