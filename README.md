# 🌬️ llm-windtunnel

**A wind tunnel for LLM inference engines.**
Benchmark vLLM, Ollama, llama.cpp, TGI and any OpenAI-compatible endpoint —
TTFT, ITL, TPOT, throughput and latency percentiles — with **every parameter
explained in English and 中文**, right where you hover.

[中文说明](README.zh-CN.md) · [开源调研报告 (research survey)](docs/research/opensource-survey-2026-10.md)

---

## Why

Existing LLM benchmark tools are CLI-first, English-only, and engine-specific.
When you tune a local engine you constantly ask: *what does this parameter do,
what's the default, what should I try next?* — and then re-run the benchmark by hand.

llm-windtunnel puts the answers in the UI:

- **Parameter browser** — every engine parameter (vLLM `EngineArgs`/`SamplingParams`,
  Ollama Modelfile, llama.cpp `llama-server`, TGI launcher) structured in a
  [versioned YAML registry](registry/) with bilingual descriptions, types,
  defaults, ranges and CLI flags. Hover the **?** icon for the full story.
- **Benchmark console** — streaming load against any OpenAI-compatible endpoint:
  concurrency sweeps (C=1,2,4,8…), full percentile coverage (P50/P90/P95/P99),
  token-accurate counting (server `usage` when available, local tiktoken otherwise).
- **Results & comparison** — history with interactive charts (throughput bars,
  TTFT lines, concurrency × percentile heatmap) plus a **single-file self-contained
  HTML report** per run, ready to share.
- **中/EN one-click switch** — the whole UI, including every parameter explanation.

## Quick start

Prerequisites: **Node.js ≥ 20** (no Python needed).

```bash
npm install          # installs server + web + shared workspaces

# development: Fastify API on :8787 + Vite dev server on :5173
npm run dev

# production: build the SPA, then a single process serves everything
npm run build
npm start            # → http://127.0.0.1:8787
```

Then open http://127.0.0.1:5173 (dev) or http://127.0.0.1:8787 (prod),
head to **Benchmark**, point it at your engine — e.g.
`http://127.0.0.1:8000/v1` (vLLM), `http://127.0.0.1:11434/v1` (Ollama),
`http://127.0.0.1:8080/v1` (llama.cpp) — and hit **Start benchmark**.

> The web UI deliberately listens on **8787** to avoid clashing with llama.cpp's
> default port 8080 and Ollama's 11434.

## What gets measured

| Metric | Definition | Notes |
|---|---|---|
| TTFT | time from request sent to first content token | streaming only |
| TPOT | per-request mean time per output token (excl. first) | smoothness of streaming |
| ITL | inter-token gaps, pooled across all requests | P50/P90/P95/P99 |
| E2E | request end-to-end latency | |
| Output throughput | generated tok/s across all in-flight requests | system-level decode throughput |
| Request throughput | completed req/s | |
| Total token throughput | prompt + output tok/s | aligned with `vllm bench` field |

Field naming follows `vllm bench serve`'s JSON schema so results stay comparable
with the wider ecosystem. Each run embeds whether tokens were counted from the
server's `usage` chunk or locally (o200k tokenizer).

## The parameter registry (core asset)

`registry/engines/*.yaml` is a hand-curated, source-linked, bilingual registry of
inference-engine parameters — to our knowledge the **first cross-engine parameter
registry with structured metadata** (see the
[research survey](docs/research/opensource-survey-2026-10.md), module 2).
Five engines shipped in v0.1: **vLLM (33 params), Ollama (20), llama.cpp (23),
TGI (17, archived), OpenAI-compatible subset (13)** — ~100 parameters with
`documented` / `runtime-only` / `archived` provenance flags.

Add an engine or fix a description by editing YAML — the UI picks it up on
restart, and invalid files (schema violations, missing translations) block the
server from starting. Format spec: [registry/README.md](registry/README.md).

## Architecture

```
┌────────────────────────── web/ (React+Vite+TS) ──────────────────────────┐
│  Param Browser      Benchmark console       Results & charts             │
│  (registry + ?tips) (form → run → poll)     (ECharts + HTML reports)     │
│              react-i18next · zh-CN / EN · Radix tooltips                 │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ REST /api/*
┌──────────────────────────────┴───────────────────────────────────────────┐
│                     server/ (Fastify, Node 20+, TS)                      │
│  registry loader (YAML → zod-validated JSON)                             │
│  bench engine  : streaming fetch pool → TTFT/ITL/TPOT/throughput         │
│  sweep runner  : concurrency levels, background jobs, results/*.json     │
│  report gen    : single-file self-contained HTML (inline SVG + JSON)     │
└──────────────────────────────────────────────────────────────────────────┘
```

One language (TypeScript) end to end, one `npm install`, one process in
production. Rationale and the survey behind these choices:
[docs/architecture.md](docs/architecture.md).

## Roadmap

- [ ] External engine adapters — orchestrate GuideLLM / NVIDIA AIPerf as
      subprocesses and normalize their JSON artifacts (survey module 1)
- [ ] Grid search sweeps (parameter × parameter matrices) with Pareto frontier
      views (borrowed from `vllm bench sweep` design)
- [ ] GPU telemetry (DCGM) columns next to every run
- [ ] Sanity/correctness checks (garbled output, repetition) from LLMPerf's playbook
- [ ] Radar view for engine-vs-engine comparison; threshold badges in reports
- [ ] Community translations via Weblate

Contributions welcome — especially registry translations and new engine YAMLs.

## License

[Apache-2.0](LICENSE)
