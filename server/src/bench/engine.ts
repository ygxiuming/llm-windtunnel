import { encodingForModel } from "js-tiktoken";
import type {
  BenchConfigT,
  DistributionStatsT,
  LevelMetricsT,
} from "@windtunnel/shared";

/**
 * The wind tunnel's built-in load engine.
 *
 * Design mirrors perftok / vllm bench serve conventions:
 * - streaming chat/completions requests against any OpenAI-compatible endpoint
 * - TTFT = time until the first content delta arrives
 * - ITL = inter-token latencies (pooled across all requests)
 * - TPOT = per-request (e2e - ttft) / (outputTokens - 1)
 * - a fixed synthetic prompt per level so numbers stay comparable
 * - token counts prefer server-reported usage, falling back to a local tokenizer
 */

const tokenizer = encodingForModel("gpt-4o");

interface OneResult {
  ok: boolean;
  error?: string;
  ttft?: number;
  itls: number[];
  e2e: number;
  outputTokens: number;
  serverUsage: boolean;
}

const WORD_SENTENCE =
  "The research team measured inference latency across heterogeneous GPU clusters while evaluating token throughput under realistic production traffic patterns ";

function buildPrompt(targetTokens: number): { text: string; tokens: number } {
  const reps = Math.ceil((targetTokens * 2) / 22) + 2;
  const long = WORD_SENTENCE.repeat(reps);
  const ids = tokenizer.encode(long).slice(0, targetTokens);
  return { text: tokenizer.decode(ids), tokens: ids.length };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "request timeout / aborted";
    }
    return err.message;
  }
  return String(err);
}

async function runOne(
  cfg: BenchConfigT,
  outputTokens: number,
  prompt: string,
  runSignal: AbortSignal
): Promise<OneResult> {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = `${base}/${cfg.apiPath}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const signal = AbortSignal.any([runSignal, AbortSignal.timeout(cfg.timeoutMs)]);

  const isChat = cfg.apiPath === "chat/completions";
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: outputTokens,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    stream: cfg.stream,
    stream_options: cfg.stream ? { include_usage: true } : undefined,
  };
  // Advanced knobs are only attached when explicitly set — default payloads
  // stay compatible with strict OpenAI-style endpoints.
  if (cfg.topK !== undefined && cfg.topK > 0) body.top_k = cfg.topK;
  if (cfg.minP !== undefined && cfg.minP > 0) body.min_p = cfg.minP;
  if (cfg.repetitionPenalty !== undefined && cfg.repetitionPenalty !== 1) {
    body.repetition_penalty = cfg.repetitionPenalty;
  }
  if (cfg.presencePenalty) body.presence_penalty = cfg.presencePenalty;
  if (cfg.frequencyPenalty) body.frequency_penalty = cfg.frequencyPenalty;
  if (cfg.seed !== undefined) body.seed = cfg.seed;
  if (cfg.ignoreEos) body.ignore_eos = true;
  if (cfg.extraBody) Object.assign(body, cfg.extraBody);
  if (isChat) {
    body.messages = [{ role: "user", content: prompt }];
  } else {
    body.prompt = prompt;
  }

  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return {
        ok: false,
        error: `HTTP ${res.status}: ${detail}`,
        itls: [],
        e2e: performance.now() - start,
        outputTokens: 0,
        serverUsage: false,
      };
    }

    if (!cfg.stream) {
      const json = (await res.json()) as {
        usage?: { completion_tokens?: number };
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string };
          text?: string;
        }>;
      };
      // Reasoning models emit thinking tokens via `reasoning_content` — they
      // are real decode work and must count toward throughput/latency.
      const content = isChat
        ? (json.choices?.[0]?.message?.content ?? "") +
          (json.choices?.[0]?.message?.reasoning_content ?? "")
        : (json.choices?.[0]?.text ?? "");
      const usageTokens = json.usage?.completion_tokens;
      return {
        ok: true,
        itls: [],
        e2e: performance.now() - start,
        outputTokens: usageTokens ?? tokenizer.encode(content).length,
        serverUsage: usageTokens !== undefined,
      };
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ttft: number | undefined;
    const itls: number[] = [];
    let last = start;
    let content = "";
    let usageTokens: number | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let json: {
          usage?: { completion_tokens?: number };
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
            text?: string;
          }>;
          error?: { message?: string };
        };
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.error) {
          return {
            ok: false,
            error: `stream error: ${json.error.message ?? "unknown"}`,
            itls,
            e2e: performance.now() - start,
            outputTokens: tokenizer.encode(content).length,
            serverUsage: false,
          };
        }
        if (json.usage?.completion_tokens !== undefined) {
          usageTokens = json.usage.completion_tokens;
        }
        const delta = isChat
          ? (json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.delta?.reasoning_content ??
            "")
          : (json.choices?.[0]?.text ?? "");
        if (delta) {
          if (ttft === undefined) {
            ttft = now - start;
          } else {
            itls.push(now - last);
          }
          last = now;
          content += delta;
        }
      }
    }

    const e2e = performance.now() - start;
    if (ttft === undefined) {
      return {
        ok: false,
        error: "stream closed before any content was produced",
        itls,
        e2e,
        outputTokens: 0,
        serverUsage: usageTokens !== undefined,
      };
    }
    return {
      ok: true,
      ttft,
      itls,
      e2e,
      outputTokens: usageTokens ?? tokenizer.encode(content).length,
      serverUsage: usageTokens !== undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: errMessage(err),
      itls: [],
      e2e: performance.now() - start,
      outputTokens: 0,
      serverUsage: false,
    };
  }
}

function dist(samples: number[]): DistributionStatsT | undefined {
  if (samples.length === 0) return undefined;
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number): number => {
    const idx = (p / 100) * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
  };
  const mean = s.reduce((acc, v) => acc + v, 0) / s.length;
  return {
    unit: "ms",
    mean,
    min: s[0]!,
    max: s[s.length - 1]!,
    p50: q(50),
    p90: q(90),
    p95: q(95),
    p99: q(99),
  };
}

export interface LevelOutcome {
  metrics: LevelMetricsT;
  tokenCounting: "server-usage" | "local-tiktoken";
}

export interface ScenarioInput {
  inputTokens: number;
  outputTokens: number;
  concurrency: number;
  requests: number;
  label?: string;
}

export async function runScenario(
  cfg: BenchConfigT,
  sc: ScenarioInput,
  opts: {
    signal: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<LevelOutcome> {
  const prompt = buildPrompt(sc.inputTokens);
  const total = sc.requests;
  const results: OneResult[] = new Array(total);
  let next = 0;
  let done = 0;

  const wallStart = performance.now();
  const worker = async (): Promise<void> => {
    for (;;) {
      if (opts.signal.aborted) return;
      const i = next++;
      if (i >= total) return;
      results[i] = await runOne(cfg, sc.outputTokens, prompt.text, opts.signal);
      done++;
      opts.onProgress?.(done, total);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(sc.concurrency, total) }, worker)
  );
  const durationMs = performance.now() - wallStart;

  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  const outputTokensTotal = ok.reduce((s, r) => s + r.outputTokens, 0);
  const promptTokensTotal = ok.length * prompt.tokens;
  const durS = Math.max(durationMs / 1000, 1e-6);

  const tpotSamples = ok
    .filter((r) => r.ttft !== undefined && r.outputTokens > 1)
    .map((r) => (r.e2e - r.ttft!) / (r.outputTokens - 1));

  const ttftStats = dist(ok.map((r) => r.ttft!).filter((v) => v !== undefined));
  // Prefill throughput: with a 1-token (or 0-token) generation budget, TTFT
  // is essentially the whole prompt-processing time.
  const prefillThroughput =
    sc.outputTokens <= 2 && ttftStats && ok.length > 0
      ? promptTokensTotal / (ttftStats.mean / 1000)
      : undefined;

  const errorCounts = new Map<string, number>();
  for (const r of bad) {
    const key = r.error ?? "unknown error";
    errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
  }

  const metrics: LevelMetricsT = {
    concurrency: sc.concurrency,
    label:
      sc.label ??
      `${sc.inputTokens}→${sc.outputTokens} @ C=${sc.concurrency}`,
    inputTokens: sc.inputTokens,
    outputTokens: sc.outputTokens,
    totalRequests: total,
    successfulRequests: ok.length,
    failedRequests: bad.length,
    durationMs,
    requestThroughput: ok.length / durS,
    outputThroughput: outputTokensTotal / durS,
    prefillThroughput,
    totalTokenThroughput: (promptTokensTotal + outputTokensTotal) / durS,
    promptTokensTotal,
    outputTokensTotal,
    ttft: ttftStats,
    tpot: dist(tpotSamples),
    itl: dist(ok.flatMap((r) => r.itls)),
    e2e: dist(ok.map((r) => r.e2e)),
    errors: [...errorCounts.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count),
  };

  return {
    metrics,
    tokenCounting: ok.some((r) => r.serverUsage)
      ? "server-usage"
      : "local-tiktoken",
  };
}
