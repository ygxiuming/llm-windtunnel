# Architecture

> llm-windtunnel v0.1 — decisions and the research behind them.
> Full survey: [research/opensource-survey-2026-10.md](research/opensource-survey-2026-10.md)

## Layered view

```
┌──────────────────────────── presentation ────────────────────────────┐
│ web/  React 18 + Vite 5 + TypeScript + Tailwind v4                   │
│   pages/ParamBrowser  engine tabs → registry table → ? tooltips      │
│   pages/Bench         config form → background run → progress → KPIs │
│   pages/Results       history table → ECharts (bar/line/heatmap)     │
│   components/ParamTip Radix tooltip fed by registry description.*    │
│   i18n                react-i18next, locales/{en,zh-CN}.json         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST /api/*  (JSON, zod-validated)
┌───────────────────────────────┴──────────────────────────────────────┐
│ server/  Fastify 5 (Node ≥ 20, run with tsx)                          │
│   registry.ts      loads registry/engines/*.yaml → zod validation     │
│   bench/engine.ts  built-in load engine (below)                      │
│   bench/runner.ts  job map + progress + results/*.json persistence   │
│   report.ts        single-file self-contained HTML reports           │
│   static hosting   serves web/dist when present (single process)     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ streaming HTTP (OpenAI-compatible)
              vLLM / Ollama / llama.cpp / TGI / any /v1 endpoint
```

## Key decisions

### 1. TypeScript end to end (npm workspaces)

Chosen for a unified contribution surface: shared zod schemas
(`@windtunnel/shared`) type both the API payloads and the frontend, `npm
install` is one command, and production is one Node process. The trade-off —
documented in the survey (module 1) — is that Python-only engines (GuideLLM,
AIPerf) cannot be reused as in-process libraries; they become **external
adapter** targets (subprocess + JSON artifact parsing) on the roadmap. The
built-in engine covers the OpenAI-compatible surface all of them expose anyway.

### 2. Built-in load engine (server/src/bench/engine.ts)

Mirrors the perftok/vllm-bench-serve school of design:

- fixed synthetic prompt per level (token-length controlled via o200k
  tokenizer) → apples-to-apples comparisons across levels and runs;
- streaming chat/completions via `fetch` + SSE parsing;
- TTFT = first content delta; ITL = deltas between consecutive chunks (pooled);
  TPOT = (E2E − TTFT) / (outputTokens − 1) per request;
- token counting prefers the server's `usage` chunk
  (`stream_options.include_usage`), falls back to local tokenization — the
  method used is recorded on every run;
- concurrency implemented as a fixed worker pool over an atomic request index —
  same semantics as `--max-concurrency` in vllm bench.

### 3. Registry as data, UI as renderer

Parameter knowledge lives **entirely in YAML** (`registry/`), validated by the
same zod schemas the API serves. The React `ParamTip` component renders
whatever the registry provides — no hardcoded strings — which is why adding an
engine requires zero frontend code. `status` marks documentation confidence
(`documented` / `runtime-only` / `archived`) so engine doc-drift (e.g. Ollama's
trimmed Modelfile table) is visible instead of silently wrong.

### 4. i18n split: registry vs chrome

Two sources, on purpose:

- **Parameter explanations** → `registry/engines/*.yaml` (`description.en/zh`)
  because they belong to the data, not the app;
- **UI chrome** (buttons, labels, metric names) → `locales/*.json` with
  `react-i18next`, one-click switch persisted in localStorage.

Metric definitions (`metrics.*` keys) live in locales so they can also
annotate the KPI cards with the same "?" interaction.

### 5. Reports: single-file, offline-forever

Following Locust/k6 practice: reports inline CSS + server-generated SVG +
embedded raw JSON — no CDN, no build step, opens anywhere. (Interactive
ECharts live in the app; the static report is the shareable artifact.)

### 6. Ports

Server default **8787** (never 8080 — llama.cpp claims it; never 11434 —
Ollama claims it). Dev mode proxies `/api` → 8787 from Vite :5173.

## Result data contract

Aligned with `vllm bench serve` naming so results interoperate:

```
RunResult {
  id, createdAt, status, tokenCounting: "server-usage" | "local-tiktoken",
  config: BenchConfig { baseUrl, model, apiPath, stream, inputTokens,
                        outputTokens, temperature, topP,
                        concurrencyLevels[], requestsPerLevel, timeoutMs },
  levels: [ LevelMetrics {
    concurrency, totalRequests, successfulRequests, failedRequests,
    durationMs, requestThroughput, outputThroughput, totalTokenThroughput,
    promptTokensTotal, outputTokensTotal,
    ttft?: { mean,min,max,p50,p90,p95,p99 }, tpot?, itl?, e2e?,
    errors: [{ message, count }]
  } ]
}
```

Persisted at `results/<run-id>.json` and embedded verbatim in HTML reports.

## Roadmap rationale

Priorities follow the survey's gap analysis (module 6): the un-owned territory
is the **registry + bilingual parameter browser** (shipped in v0.1) and
**sweep → interactive report**; external engine adapters and GPU telemetry
build on established tools (GuideLLM, AIPerf) rather than reimplementing them.
