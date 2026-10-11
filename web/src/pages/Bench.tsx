import { useEffect, useRef, useState } from "react";
import type { RunResultT } from "@windtunnel/shared";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Badge, Card, MetricTip, Spinner } from "../components/ui";

type StatusState = {
  status: RunResultT["status"];
  progress: { levelIndex: number; levelCount: number; requestsDone: number; requestsTotal: number };
  result: RunResultT;
};

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted/50 focus:border-accent";

function Field({
  label,
  hint,
  tipKey,
  children,
}: {
  label: string;
  hint?: string;
  tipKey?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center text-xs font-medium text-muted">
        {label}
        {tipKey && <MetricTip metricKey={tipKey} />}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}

export default function Bench({ onNavigate }: { onNavigate: (page: "results") => void }) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8080/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [apiPath, setApiPath] = useState<"chat/completions" | "completions">("chat/completions");
  const [stream, setStream] = useState(true);
  const [inputTokens, setInputTokens] = useState(256);
  const [outputTokens, setOutputTokens] = useState(128);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [levelsText, setLevelsText] = useState("1, 2, 4, 8");
  const [requestsPerLevel, setRequestsPerLevel] = useState(20);

  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Poll run status while a run is active.
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const s = await api.status(runId);
        if (stopped) return;
        setStatus(s);
        if (s.status === "running") {
          timer.current = window.setTimeout(poll, 800);
        }
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [runId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      const concurrencyLevels = levelsText
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (concurrencyLevels.length === 0) throw new Error("invalid concurrency levels");
      const { runId } = await api.startRun({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        apiPath,
        stream,
        inputTokens,
        outputTokens,
        temperature,
        topP,
        concurrencyLevels,
        requestsPerLevel,
        timeoutMs: 120000,
      });
      setRunId(runId);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const stop = async () => {
    if (runId) await api.cancel(runId).catch(() => undefined);
  };

  const running = status?.status === "running" || submitting;
  const result = status?.result;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("bench.title")}</h1>
        <p className="text-sm text-muted">{t("bench.desc")}</p>
      </div>

      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="md:col-span-2 lg:col-span-4 grid gap-4 md:grid-cols-4">
          <Field label={t("bench.endpoint")}>
            <input
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t("bench.endpointHint")}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.model")} hint={t("bench.modelHint")}>
            <input
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen3.8-27b"
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.apiKey")}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="—"
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.apiPath")}>
            <select
              value={apiPath}
              onChange={(e) => setApiPath(e.target.value as typeof apiPath)}
              className={inputCls}
            >
              <option value="chat/completions">/chat/completions</option>
              <option value="completions">/completions</option>
            </select>
          </Field>

          <Field label={t("bench.concurrencyLevels")} hint={t("bench.concurrencyLevelsHint")}>
            <input
              required
              value={levelsText}
              onChange={(e) => setLevelsText(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.requestsPerLevel")}>
            <input
              type="number"
              min={1}
              max={2000}
              value={requestsPerLevel}
              onChange={(e) => setRequestsPerLevel(parseInt(e.target.value, 10))}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.inputTokens")}>
            <input
              type="number"
              min={8}
              max={32768}
              value={inputTokens}
              onChange={(e) => setInputTokens(parseInt(e.target.value, 10))}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.outputTokens")}>
            <input
              type="number"
              min={8}
              max={8192}
              value={outputTokens}
              onChange={(e) => setOutputTokens(parseInt(e.target.value, 10))}
              className={inputCls}
            />
          </Field>

          <Field label={t("bench.temperature")}>
            <input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.topP")}>
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={t("bench.stream")} hint={t("bench.streamHint")}>
            <button
              type="button"
              onClick={() => setStream(!stream)}
              className={`flex h-[38px] w-full items-center justify-between rounded-lg border px-3 text-sm ${
                stream ? "border-accent text-accent-soft" : "border-border text-muted"
              }`}
            >
              <span>{stream ? "ON" : "OFF"}</span>
              <span
                className={`h-4 w-8 rounded-full transition-colors relative ${
                  stream ? "bg-accent/60" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-text transition-all ${
                    stream ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={running}
              className="h-[38px] flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t("bench.start")}
            </button>
            {runId && status?.status === "running" && (
              <button
                type="button"
                onClick={stop}
                className="h-[38px] rounded-lg border border-bad/50 px-4 text-sm text-bad hover:bg-bad/10"
              >
                {t("bench.stop")}
              </button>
            )}
          </div>
        </Card>
      </form>

      {error && (
        <Card>
          <div className="text-sm text-bad">
            {t("common.error")}: {error}
          </div>
        </Card>
      )}

      {status && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">
              {status.status === "running" &&
                t("bench.running", {
                  level: status.progress.levelIndex + 1,
                  count: status.progress.levelCount,
                  done: status.progress.requestsDone,
                  total: status.progress.requestsTotal,
                })}
              {status.status === "completed" && t("bench.completed")}
              {status.status === "failed" && t("bench.failed")}
              {status.status === "cancelled" && t("bench.cancelled")}
            </span>
            <Badge tone={status.status === "completed" ? "good" : status.status === "running" ? "accent" : "bad"}>
              {status.status}
            </Badge>
            <span className="font-mono text-xs text-muted">run {status.result.id}</span>
            {result?.tokenCounting && (
              <span className="text-[11px] text-muted">
                {t("bench.tokenCounting")}: {result.tokenCounting}
              </span>
            )}
            <span className="flex-1" />
            {result && (
              <>
                <a
                  href={api.reportUrl(result.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent-soft hover:bg-accent/10"
                >
                  {t("common.openReport")}
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate("results")}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent/50"
                >
                  {t("bench.viewResults")} →
                </button>
              </>
            )}
          </div>

          {status.status === "running" && (
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${((status.progress.levelIndex * status.progress.requestsTotal + status.progress.requestsDone) / Math.max(1, status.progress.levelCount * status.progress.requestsTotal)) * 100}%`,
                }}
              />
            </div>
          )}

          {result && result.levels.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {result.levels.map((l) => (
                <div key={l.concurrency} className="rounded-xl border border-border bg-bg p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-accent-soft">
                      {t("bench.perLevel", { c: l.concurrency })}
                    </span>
                    <span className="text-[11px] text-muted">
                      {l.successfulRequests}/{l.totalRequests} ok
                    </span>
                  </div>
                  <dl className="space-y-2 text-xs">
                    {(
                      [
                        ["outputThroughput", `${l.outputThroughput.toFixed(1)} tok/s`],
                        ["ttft", l.ttft ? `${l.ttft.p50.toFixed(0)} / ${l.ttft.p99.toFixed(0)} ms` : null],
                        ["tpot", l.tpot ? `${l.tpot.p50.toFixed(1)} ms` : null],
                        ["itl", l.itl ? `${l.itl.p50.toFixed(1)} ms` : null],
                        ["e2e", l.e2e ? `${l.e2e.p50.toFixed(0)} ms` : null],
                        ["requestThroughput", `${l.requestThroughput.toFixed(2)} req/s`],
                      ] as [string, string | null][]
                    ).map(([key, value]) =>
                      value ? (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <dt className="flex items-center text-muted">
                            {t(`metrics.${key}.name`)}
                            <MetricTip metricKey={key} />
                          </dt>
                          <dd className="font-mono text-text/90">{value}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                  {l.failedRequests > 0 && (
                    <div className="mt-3 rounded-lg border border-bad/30 bg-bad/5 p-2 text-[11px] text-bad">
                      {t("bench.errors")}:{" "}
                      {l.errors.slice(0, 2).map((e) => `${e.message} ×${e.count}`).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!status && !error && !runId && (
        <Card className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-text/70">{t("bench.examples")}</span>
          <div className="mt-1.5 space-y-0.5 font-mono">
            <div>vLLM · http://127.0.0.1:8000/v1</div>
            <div>Ollama · http://127.0.0.1:11434/v1</div>
            <div>llama.cpp · http://127.0.0.1:8080/v1</div>
          </div>
        </Card>
      )}
      {submitting && <Spinner />}
    </div>
  );
}
