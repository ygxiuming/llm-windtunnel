import type { LevelMetricsT, RunResultT } from "@windtunnel/shared";

/**
 * Single-file self-contained HTML report (Locust/k6 style):
 * inline CSS + server-generated inline SVG charts + embedded raw JSON.
 * No CDN, no external assets — the file works offline forever.
 */

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0b1220; color: #dbe4f0; font: 14px/1.6 -apple-system, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 32px 0 12px; color: #9fb6d4; text-transform: uppercase; letter-spacing: .08em; }
.muted { color: #7d8fa8; font-size: 12px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #1d2b45; color: #9cc0ff; }
.badge.completed { background: #123c2a; color: #6fe0a8; }
.badge.failed, .badge.cancelled { background: #46202a; color: #ff9db0; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { padding: 8px 10px; text-align: right; border-bottom: 1px solid #1d2b45; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: #9fb6d4; font-weight: 600; font-size: 12px; }
tr:hover td { background: #101a2e; }
.charts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.card { background: #101a2e; border: 1px solid #1d2b45; border-radius: 12px; padding: 16px; }
@media (max-width: 800px) { .charts { grid-template-columns: 1fr; } }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px; }
.kpi { background: #101a2e; border: 1px solid #1d2b45; border-radius: 12px; padding: 14px 16px; }
.kpi .v { font-size: 20px; font-weight: 700; color: #eaf1fb; }
.kpi .l { font-size: 11px; color: #7d8fa8; text-transform: uppercase; letter-spacing: .06em; }
code { background: #1d2b45; padding: 1px 6px; border-radius: 6px; font-size: 12px; }
`;

function fmt(v: number | undefined, digits = 1): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(digits);
}

function barChart(
  levels: LevelMetricsT[],
  title: string,
  unit: string,
  pick: (l: LevelMetricsT) => number | undefined
): string {
  const w = 460;
  const h = 240;
  const pad = { l: 46, r: 12, t: 18, b: 30 };
  const values = levels.map(pick).map((v) => (v === undefined ? 0 : v));
  const max = Math.max(1e-9, ...values);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bw = iw / Math.max(1, levels.length) - 12;
  const bars = levels
    .map((l, i) => {
      const v = values[i]!;
      const bh = (v / max) * ih;
      const x = pad.l + (iw / levels.length) * i + 6;
      const y = pad.t + ih - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="#5b8dd9"><title>concurrency ${l.concurrency}: ${fmt(v)} ${unit}</title></rect>
<text x="${(x + bw / 2).toFixed(1)}" y="${(h - 10).toFixed(1)}" text-anchor="middle" font-size="10" fill="#7d8fa8">${l.concurrency}</text>
<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#9fb6d4">${fmt(v)}</text>`;
    })
    .join("\n");
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%">
<text x="${pad.l}" y="12" font-size="11" fill="#9fb6d4">${title} (${unit})</text>
<line x1="${pad.l}" y1="${pad.t + ih}" x2="${w - pad.r}" y2="${pad.t + ih}" stroke="#1d2b45"/>
${bars}</svg>`;
}

function lineChart(
  levels: LevelMetricsT[],
  title: string,
  unit: string,
  series: { name: string; color: string; pick: (l: LevelMetricsT) => number | undefined }[]
): string {
  const w = 460;
  const h = 240;
  const pad = { l: 46, r: 12, t: 18, b: 30 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const all: number[] = [];
  for (const l of levels) {
    for (const s of series) {
      const v = s.pick(l);
      if (v !== undefined) all.push(v);
    }
  }
  const max = Math.max(1e-9, ...all);
  const maxC = Math.max(...levels.map((l) => l.concurrency), 1);
  const x = (c: number) => pad.l + (c / maxC) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const gridY = [0.25, 0.5, 0.75, 1].map(
    (f) =>
      `<line x1="${pad.l}" y1="${(pad.t + ih - f * ih).toFixed(1)}" x2="${w - pad.r}" y2="${(pad.t + ih - f * ih).toFixed(1)}" stroke="#1d2b45"/><text x="${pad.l - 6}" y="${(pad.t + ih - f * ih + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#7d8fa8">${fmt(max * f, 0)}</text>`
  );
  const paths = series
    .filter((s) => levels.some((l) => s.pick(l) !== undefined))
    .map((s) => {
      const pts = levels
        .map((l) => ({ c: l.concurrency, v: s.pick(l) }))
        .filter((p): p is { c: number; v: number } => p.v !== undefined);
      const line = pts.map((p) => `${x(p.c).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
      const dots = pts
        .map(
          (p) =>
            `<circle cx="${x(p.c).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="${s.color}"><title>${s.name} @ ${p.c}: ${fmt(p.v)} ${unit}</title></circle>`
        )
        .join("");
      const legendX = pad.l + 4;
      const idx = series.indexOf(s);
      return `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}
<rect x="${legendX + idx * 110}" y="${h - 8}" width="8" height="3" fill="${s.color}"/><text x="${legendX + idx * 110 + 12}" y="${h - 4}" font-size="10" fill="#9fb6d4">${s.name}</text>`;
    })
    .join("\n");
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%">
<text x="${pad.l}" y="12" font-size="11" fill="#9fb6d4">${title} (${unit})</text>
${gridY.join("\n")}
<line x1="${pad.l}" y1="${pad.t + ih}" x2="${w - pad.r}" y2="${pad.t + ih}" stroke="#1d2b45"/>
${paths}</svg>`;
}

export function renderReport(result: RunResultT): string {
  const { config, levels } = result;
  const best = [...levels].reverse().find((l) => l.successfulRequests > 0);
  const totalOk = levels.reduce((s, l) => s + l.successfulRequests, 0);
  const totalReq = levels.reduce((s, l) => s + l.totalRequests, 0);
  const rows = levels
    .map(
      (l) => `<tr>
<td>C=${l.concurrency}</td>
<td>${l.successfulRequests}/${l.totalRequests}</td>
<td>${fmt(l.outputThroughput)}</td>
<td>${fmt(l.requestThroughput, 2)}</td>
<td>${fmt(l.ttft?.p50)}</td><td>${fmt(l.ttft?.p90)}</td><td>${fmt(l.ttft?.p99)}</td>
<td>${fmt(l.tpot?.p50)}</td><td>${fmt(l.itl?.p50)}</td>
<td>${fmt(l.e2e?.p50, 0)}</td>
<td>${l.failedRequests > 0 ? `<span class="badge failed">${l.errors[0]?.message ?? "failed"}</span>` : "—"}</td>
</tr>`
    )
    .join("\n");

  const kpis = best
    ? `<div class="kpis">
<div class="kpi"><div class="v">${fmt(best.outputThroughput)}</div><div class="l">Output tok/s @ C=${best.concurrency}</div></div>
<div class="kpi"><div class="v">${fmt(best.ttft?.p50)}</div><div class="l">TTFT p50 (ms)</div></div>
<div class="kpi"><div class="v">${fmt(best.ttft?.p99)}</div><div class="l">TTFT p99 (ms)</div></div>
<div class="kpi"><div class="v">${fmt(best.tpot?.p50)}</div><div class="l">TPOT p50 (ms)</div></div>
<div class="kpi"><div class="v">${fmt(best.requestThroughput, 2)}</div><div class="l">Req/s @ C=${best.concurrency}</div></div>
</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>llm-windtunnel report — ${result.id}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <h1>🌬️ llm-windtunnel report</h1>
  <div class="muted">
    run <code>${result.id}</code> · <span class="badge ${result.status}">${result.status}</span>
    · <code>${config.baseUrl}</code> · model <code>${config.model}</code>
    · ${config.inputTokens}→${config.outputTokens} tokens · ${totalOk}/${totalReq} requests ok
    · tokens: ${result.tokenCounting ?? "local-tiktoken"}
    · ${new Date(result.createdAt).toLocaleString()}
  </div>

  ${kpis}

  <h2>Per-concurrency breakdown</h2>
  <table>
    <thead><tr>
      <th>Level</th><th>Requests ok</th><th>Output tok/s</th><th>Req/s</th>
      <th>TTFT p50</th><th>TTFT p90</th><th>TTFT p99</th>
      <th>TPOT p50</th><th>ITL p50</th><th>E2E p50</th><th>Errors</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="muted">All latency figures in ms.</p>

  <h2>Charts</h2>
  <div class="charts">
    <div class="card">${barChart(levels, "Output throughput by concurrency", "tok/s", (l) => l.outputThroughput)}</div>
    <div class="card">${barChart(levels, "Total token throughput by concurrency", "tok/s", (l) => l.totalTokenThroughput)}</div>
    <div class="card">${lineChart(levels, "TTFT percentiles vs concurrency", "ms", [
      { name: "p50", color: "#6fe0a8", pick: (l) => l.ttft?.p50 },
      { name: "p90", color: "#9cc0ff", pick: (l) => l.ttft?.p90 },
      { name: "p99", color: "#ff9db0", pick: (l) => l.ttft?.p99 },
    ])}</div>
    <div class="card">${lineChart(levels, "Latency profile vs concurrency", "ms", [
      { name: "TPOT p50", color: "#6fe0a8", pick: (l) => l.tpot?.p50 },
      { name: "ITL p50", color: "#9cc0ff", pick: (l) => l.itl?.p50 },
      { name: "E2E p50", color: "#f2c67f", pick: (l) => l.e2e?.p50 },
    ])}</div>
  </div>

  <h2>Raw result JSON</h2>
  <p class="muted">The complete machine-readable result is embedded below and in the comments of this section.</p>
  <script type="application/json" id="run-result-json">${JSON.stringify(result).replace(/</g, "\\u003c")}</script>
  <p class="muted">Generated by llm-windtunnel v0.1.0 — a wind tunnel for LLM inference engines.</p>
</div>
</body>
</html>`;
}
