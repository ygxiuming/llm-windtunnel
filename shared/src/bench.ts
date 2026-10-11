import { z } from "zod";

/* ============================================================
 * Benchmark schemas — config, progress and result contracts.
 * Metric field naming aligns with `vllm bench serve`'s JSON
 * output so results stay comparable with the ecosystem.
 * ============================================================ */

/**
 * One measurement point. A run executes a list of scenarios sequentially,
 * which lets presets express mixed sweeps, prefill tests (output=1),
 * decode tests (tiny input, long output) and context-length scaling.
 */
export const BenchScenario = z.object({
  inputTokens: z.number().int().min(8).max(1048576),
  outputTokens: z.number().int().min(1).max(8192),
  concurrency: z.number().int().min(1).max(512),
  requests: z.number().int().min(1).max(2000).default(1),
  label: z.string().optional(),
});
export type BenchScenarioT = z.infer<typeof BenchScenario>;

export const BenchConfig = z.object({
  /** Base URL of an OpenAI-compatible endpoint, e.g. http://127.0.0.1:8080/v1 */
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  apiPath: z.enum(["chat/completions", "completions"]).default("chat/completions"),
  stream: z.boolean().default(true),
  /** Approximate input length of the synthetic prompt, in tokens. */
  inputTokens: z.number().int().min(8).max(32768).default(256),
  /** Requested output length per request, in tokens (max_tokens). */
  outputTokens: z.number().int().min(8).max(8192).default(128),
  temperature: z.number().min(0).max(2).default(1.0),
  topP: z.number().min(0).max(1).default(1.0),
  /** Extra sampling knobs — sent only when explicitly set, so default
   *  payloads stay compatible with strict OpenAI endpoints. */
  topK: z.number().int().min(-1).max(500).optional(),
  minP: z.number().min(0).max(1).optional(),
  repetitionPenalty: z.number().min(0.1).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  /** Keep generating past EOS until max_tokens (vLLM / llama.cpp). */
  ignoreEos: z.boolean().default(false),
  /** Arbitrary extra fields merged into the request body (engine-specific options). */
  extraBody: z.record(z.unknown()).optional(),
  /** Concurrency sweep: one measurement per level, executed sequentially. */
  concurrencyLevels: z
    .array(z.number().int().min(1).max(512))
    .min(1)
    .max(16)
    .default([1, 2, 4, 8]),
  requestsPerLevel: z.number().int().min(1).max(2000).default(20),
  /** Explicit scenario matrix — takes precedence over the concurrency sweep
   *  when present (used by the Prefill / Decode / Context presets). */
  scenarios: z.array(BenchScenario).min(1).max(32).optional(),
  /** Per-request timeout. */
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
});
export type BenchConfigT = z.infer<typeof BenchConfig>;

export const DistributionStats = z.object({
  unit: z.literal("ms"),
  mean: z.number(),
  min: z.number(),
  max: z.number(),
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
});
export type DistributionStatsT = z.infer<typeof DistributionStats>;

export const LevelMetrics = z.object({
  concurrency: z.number().int(),
  /** Human-readable scenario label, e.g. "256→128 @ C=4". */
  label: z.string().optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  totalRequests: z.number().int(),
  successfulRequests: z.number().int(),
  failedRequests: z.number().int(),
  /** Wall-clock duration of the whole level (including ramp-up). */
  durationMs: z.number(),
  /** Completed requests per second. */
  requestThroughput: z.number(),
  /** Generated (output) tokens per second across all workers. */
  outputThroughput: z.number(),
  /** Prompt-processing (prefill) tokens per second — only computed for
   *  scenarios with outputTokens <= 2, where TTFT ≈ prefill time. */
  prefillThroughput: z.number().optional(),
  /** prompt + output tokens per second. */
  totalTokenThroughput: z.number(),
  promptTokensTotal: z.number(),
  outputTokensTotal: z.number(),
  /** Time to first token. */
  ttft: DistributionStats.optional(),
  /** Per-request mean time per output token (excludes the first token). */
  tpot: DistributionStats.optional(),
  /** Pooled inter-token latencies across all requests. */
  itl: DistributionStats.optional(),
  /** End-to-end request latency. */
  e2e: DistributionStats.optional(),
  errors: z
    .array(z.object({ message: z.string(), count: z.number().int() }))
    .default([]),
});
export type LevelMetricsT = z.infer<typeof LevelMetrics>;

export const RunStatus = z.enum(["running", "completed", "failed", "cancelled"]);
export type RunStatusT = z.infer<typeof RunStatus>;

export const RunProgress = z.object({
  levelIndex: z.number().int(),
  levelCount: z.number().int(),
  requestsDone: z.number().int(),
  requestsTotal: z.number().int(),
});
export type RunProgressT = z.infer<typeof RunProgress>;

export const RunResult = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: RunStatus,
  config: BenchConfig,
  /** Token counting method actually used: server-provided usage or local tokenizer. */
  tokenCounting: z.enum(["server-usage", "local-tiktoken"]).optional(),
  levels: z.array(LevelMetrics).default([]),
  error: z.string().optional(),
});
export type RunResultT = z.infer<typeof RunResult>;

/** Compact shape returned by the results listing endpoint. */
export const RunSummary = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: RunStatus,
  model: z.string(),
  baseUrl: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  concurrencyLevels: z.array(z.number().int()),
  /** Headline numbers taken from the highest concurrency level with successes. */
  headline: z
    .object({
      concurrency: z.number().int(),
      outputThroughput: z.number(),
      ttftP50Ms: z.number().optional(),
      ttftP99Ms: z.number().optional(),
    })
    .optional(),
});
export type RunSummaryT = z.infer<typeof RunSummary>;
