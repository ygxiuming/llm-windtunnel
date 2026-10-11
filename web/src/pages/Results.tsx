import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { RunResultT, RunSummaryT } from "@windtunnel/shared";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Badge, Card, Spinner } from "../components/ui";

const SERIES_COLORS = ["#5b8dd9", "#6fe0a8", "#f2c67f", "#ff9db0"];

const axisLabel = { color: "#7d8fa8", fontSize: 11 };
const splitLine = { lineStyle: { color: "#1d2b45" } };

function Chart({ option }: { option: echarts.EChartsOption }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(option);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} className="h-72" />;
}

export default function Results() {
  const { t } = useTranslation();
  const [summaries, setSummaries] = useState<RunSummaryT[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detailed, setDetailed] = useState<Record<string, RunResultT>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .results()
      .then((list) => {
        setSummaries(list);
        setSelected(list.slice(0, 1).map((s) => s.id));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    for (const id of selected) {
      if (!detailed[id]) {
        api
          .result(id)
          .then((r) => setDetailed((prev) => ({ ...prev, [id]: r })))
          .catch((e) => setError(String(e)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selectedRuns = selected
    .map((id) => detailed[id])
    .filter((r): r is RunResultT => Boolean(r));

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 4
          ? prev
          : [...prev, id]
    );
  };

  const throughputOption = useMemo<echarts.EChartsOption>(() => {
    const concurrencies = [
      ...new Set(selectedRuns.flatMap((r) => r.levels.map((l) => l.concurrency))),
    ].sort((a, b) => a - b);
    return {
      backgroundColor: "transparent",
      textStyle: { color: "#7d8fa8" },
      tooltip: { trigger: "axis" },
      legend: { textStyle: axisLabel, top: 0 },
      grid: { left: 48, right: 16, top: 28, bottom: 28 },
      xAxis: {
        type: "category",
        name: t("results.concurrency"),
        nameTextStyle: axisLabel,
        data: concurrencies.map(String),
        axisLabel,
        splitLine,
      },
      yAxis: {
        type: "value",
        name: t("results.tokPerS"),
        nameTextStyle: axisLabel,
        axisLabel,
        splitLine,
      },
      series: selectedRuns.map((r, i) => ({
        name: r.id,
        type: "bar" as const,
        data: concurrencies.map(
          (c) => r.levels.find((l) => l.concurrency === c)?.outputThroughput ?? null
        ),
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      })),
    };
  }, [selectedRuns, t]);

  const ttftOption = useMemo<echarts.EChartsOption>(() => {
    const concurrencies = [
      ...new Set(selectedRuns.flatMap((r) => r.levels.map((l) => l.concurrency))),
    ].sort((a, b) => a - b);
    return {
      backgroundColor: "transparent",
      textStyle: { color: "#7d8fa8" },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(0)} ms` },
      legend: { textStyle: axisLabel, top: 0 },
      grid: { left: 48, right: 16, top: 28, bottom: 28 },
      xAxis: {
        type: "category",
        name: t("results.concurrency"),
        nameTextStyle: axisLabel,
        data: concurrencies.map(String),
        axisLabel,
        splitLine,
      },
      yAxis: {
        type: "value",
        name: t("results.ms"),
        nameTextStyle: axisLabel,
        axisLabel,
        splitLine,
      },
      series: selectedRuns.map((r, i) => ({
        name: r.id,
        type: "line" as const,
        smooth: true,
        data: concurrencies.map(
          (c) => r.levels.find((l) => l.concurrency === c)?.ttft?.p50 ?? null
        ),
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
        lineStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      })),
    };
  }, [selectedRuns, t]);

  const heatmapOption = useMemo<echarts.EChartsOption>(() => {
    const primary = selectedRuns[0];
    if (!primary) return {};
    const percentiles = ["p50", "p90", "p95", "p99"] as const;
    const levels = [...primary.levels].sort((a, b) => a.concurrency - b.concurrency);
    const data: [number, number, number][] = [];
    levels.forEach((l, yi) => {
      percentiles.forEach((p, xi) => {
        const v = l.ttft?.[p];
        if (v !== undefined) data.push([xi, yi, Math.round(v)]);
      });
    });
    const values = data.map((d) => d[2]);
    return {
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        formatter: (params) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as {
            data: [number, number, number];
          };
          return `C=${levels[p.data[1]]?.concurrency} · ${percentiles[p.data[0]]}: ${p.data[2]} ms`;
        },
      },
      grid: { left: 48, right: 96, top: 16, bottom: 40 },
      xAxis: {
        type: "category",
        data: percentiles,
        axisLabel,
        splitArea: { show: true, areaStyle: { color: ["#101a2e", "#0d1626"] } },
      },
      yAxis: {
        type: "category",
        data: levels.map((l) => `C=${l.concurrency}`),
        axisLabel,
        splitArea: { show: true, areaStyle: { color: ["#101a2e", "#0d1626"] } },
      },
      visualMap: {
        min: Math.min(...values, 0),
        max: Math.max(...values, 1),
        calculable: true,
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: axisLabel,
        inRange: { color: ["#1d3a5f", "#5b8dd9", "#f2c67f", "#ff9db0"] },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: true, color: "#dbe4f0", fontSize: 10 },
        },
      ],
    };
  }, [selectedRuns]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("results.title")}</h1>
        <p className="text-sm text-muted">{t("results.desc")}</p>
      </div>

      {error && (
        <Card>
          <div className="text-sm text-bad">
            {t("common.error")}: {error}
          </div>
        </Card>
      )}

      {!summaries ? (
        <Spinner />
      ) : summaries.length === 0 ? (
        <Card>
          <div className="text-sm text-muted">{t("results.empty")}</div>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5"></th>
                  <th className="px-4 py-2.5 font-medium">{t("results.run")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("results.date")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("results.model")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("results.endpoint")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("results.levels")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("results.status")}</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                        aria-label={`compare ${s.id}`}
                        className="h-4 w-4 accent-[#5b8dd9]"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.id}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.model}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.baseUrl}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">
                      {s.concurrencyLevels.join("/")}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={s.status === "completed" ? "good" : s.status === "running" ? "accent" : "bad"}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={api.reportUrl(s.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent-soft underline decoration-accent/40 underline-offset-2"
                      >
                        {t("common.openReport")}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("results.chartThroughput")}</h2>
                <span className="text-[11px] text-muted">{t("results.compareHint")}</span>
              </div>
              {selectedRuns.length > 0 ? (
                <Chart option={throughputOption} />
              ) : (
                <div className="grid h-72 place-items-center text-sm text-muted">{t("results.empty")}</div>
              )}
            </Card>
            <Card>
              <h2 className="mb-2 text-sm font-semibold">{t("results.chartTtft")}</h2>
              {selectedRuns.length > 0 ? (
                <Chart option={ttftOption} />
              ) : (
                <div className="grid h-72 place-items-center text-sm text-muted">{t("results.empty")}</div>
              )}
            </Card>
            <Card className="lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold">
                {t("results.chartHeatmap")}
                {selectedRuns[0] && (
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    run {selectedRuns[0].id}
                  </span>
                )}
              </h2>
              {selectedRuns.length > 0 ? (
                <Chart option={heatmapOption} />
              ) : (
                <div className="grid h-72 place-items-center text-sm text-muted">{t("results.empty")}</div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
