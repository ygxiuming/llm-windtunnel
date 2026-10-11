import { useEffect, useRef, useState } from "react";
import type { BenchScenarioT, RunResultT } from "@windtunnel/shared";
import { useTranslation } from "react-i18next";
import { api, type ModelDetail } from "../api";
import { Badge, Card, MetricTip, Spinner } from "../components/ui";

type StatusState = {
  status: RunResultT["status"];
  progress: { levelIndex: number; levelCount: number; requestsDone: number; requestsTotal: number };
  result: RunResultT;
};

type ModelState = "idle" | "loading" | "ok" | "error";
type Mode = "mixed" | "prefill" | "decode" | "context";

export const inputCls =
  "w-full rounded-lg border border-border bg-bg/80 px-3 py-2 text-sm text-text outline-none transition-all placeholder:text-muted/50 hover:border-border/80 focus:border-accent focus:shadow-[0_0_0_3px_rgba(91,141,217,.15)]";

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

function Toggle({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-[38px] w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors ${
        on
          ? "border-accent/70 bg-accent/10 text-accent-soft"
          : "border-border text-muted hover:border-border/80"
      }`}
    >
      <span className="font-semibold">{on ? "ON" : "OFF"}</span>
      <span className={`relative h-4 w-8 rounded-full transition-colors ${on ? "bg-accent/70" : "bg-border"}`}>
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-text transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/** Model id combobox: suggestions fetched from the endpoint, free typing allowed. */
function ModelField({
  value,
  onChange,
  models,
  state,
  onRefresh,
}: {
  value: string;
  onChange: (v: string) => void;
  models: string[];
  state: ModelState;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = models
    .filter((m) => (value ? m.toLowerCase().includes(value.toLowerCase()) : true))
    .slice(0, 50);
  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <input
          required
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (models.length > 0) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="qwen3.8-27b"
          autoComplete="off"
          className={inputCls}
        />
        <button
          type="button"
          onClick={onRefresh}
          title={t("bench.refreshModels")}
          aria-label={t("bench.refreshModels")}
          className="h-[38px] shrink-0 rounded-lg border border-border px-3 text-muted transition-colors hover:border-accent/60 hover:text-text"
        >
          <span className={state === "loading" ? "inline-block animate-spin" : "inline-block"}>⟳</span>
        </button>
      </div>
      {open && list.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface/95 py-1 shadow-2xl backdrop-blur-md">
          {list.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m);
                  setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left font-mono text-xs transition-colors hover:bg-accent/15 ${
                  m === value ? "text-accent-soft" : "text-text/85"
                }`}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span
        className={`mt-1 block text-[11px] ${
          state === "error"
            ? "text-warn/90"
            : state === "ok"
              ? "text-good/80"
              : "text-muted/70"
        }`}
      >
        {state === "loading" && t("bench.modelsLoading")}
        {state === "ok" && t("bench.modelsLoaded", { count: models.length })}
        {state === "error" && t("bench.modelsError")}
        {state === "idle" && t("bench.modelHint")}
      </span>
    </div>
  );
}

const MODES: { id: Mode; labelKey: string }[] = [
  { id: "mixed", labelKey: "bench.modeMixed" },
  { id: "prefill", labelKey: "bench.modePrefill" },
  { id: "decode", labelKey: "bench.modeDecode" },
  { id: "context", labelKey: "bench.modeContext" },
];

const parseNums = (s: string): number[] =>
  s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

export default function Bench({ onNavigate }: { onNavigate: (page: "results") => void }) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8088/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [apiPath, setApiPath] = useState<"chat/completions" | "completions">("chat/completions");
  const [stream, setStream] = useState(true);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);

  // scenario knobs per mode
  const [mode, setMode] = useState<Mode>("mixed");
  const [inputTokens, setInputTokens] = useState(256);
  const [outputTokens, setOutputTokens] = useState(128);
  const [levelsText, setLevelsText] = useState("1, 2, 4, 8");
  const [requestsPerLevel, setRequestsPerLevel] = useState(20);
  const [inputLevelsText, setInputLevelsText] = useState("128, 1024, 4096, 16384");
  const [contextLevelsText, setContextLevelsText] = useState("4096, 16384, 65536");
  const [singleConcurrency, setSingleConcurrency] = useState("1");

  // advanced knobs — empty/"" means "not sent at all"
  const [topK, setTopK] = useState("");
  const [minP, setMinP] = useState("");
  const [repetitionPenalty, setRepetitionPenalty] = useState("");
  const [presencePenalty, setPresencePenalty] = useState("");
  const [frequencyPenalty, setFrequencyPenalty] = useState("");
  const [seed, setSeed] = useState("");
  const [ignoreEos, setIgnoreEos] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState("120");
  const [extraBodyText, setExtraBodyText] = useState("");

  const [models, setModels] = useState<string[]>([]);
  const [modelDetails, setModelDetails] = useState<ModelDetail[]>([]);
  const [modelState, setModelState] = useState<ModelState>("idle");

  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Auto-load the model list whenever the endpoint config settles (debounced).
  useEffect(() => {
    const url = baseUrl.trim();
    if (!url) {
      setModels([]);
      setModelDetails([]);
      setModelState("idle");
      return;
    }
    setModelState("loading");
    const handle = window.setTimeout(async () => {
      try {
        const r = await api.models(url, apiKey.trim() || undefined);
        setModels(r.models);
        setModelDetails(r.details ?? []);
        setModelState(r.error || r.models.length === 0 ? "error" : "ok");
        setModel((prev) => prev || r.models[0] || "");
      } catch {
        setModels([]);
        setModelDetails([]);
        setModelState("error");
      }
    }, 600);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey]);

  const reloadModels = async () => {
    setModelState("loading");
    try {
      const r = await api.models(baseUrl.trim(), apiKey.trim() || undefined);
      setModels(r.models);
      setModelDetails(r.details ?? []);
      setModelState(r.error || r.models.length === 0 ? "error" : "ok");
    } catch {
      setModelState("error");
    }
  };

  const maxContext = modelDetails.find((d) => d.id === model)?.contextWindow;

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === "mixed") {
      setInputTokens(256);
      setOutputTokens(128);
      setLevelsText("1, 2, 4, 8");
      setRequestsPerLevel(20);
    } else if (m === "prefill") {
      setInputLevelsText("128, 1024, 4096, 16384");
      setRequestsPerLevel(2);
      setSingleConcurrency("1");
    } else if (m === "decode") {
      setInputTokens(32);
      setOutputTokens(512);
      setLevelsText("1, 2, 4");
      setRequestsPerLevel(10);
      setIgnoreEos(true);
    } else {
      setContextLevelsText("4096, 16384, 65536");
      setOutputTokens(16);
      setRequestsPerLevel(1);
      setSingleConcurrency("1");
    }
  };

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
      const optInt = (s: string): number | undefined => {
        const v = parseInt(s, 10);
        return Number.isFinite(v) ? v : undefined;
      };
      const optFloat = (s: string): number | undefined => {
        const v = parseFloat(s);
        return Number.isFinite(v) ? v : undefined;
      };
      let extraBody: Record<string, unknown> | undefined;
      if (extraBodyText.trim()) {
        try {
          extraBody = JSON.parse(extraBodyText) as Record<string, unknown>;
        } catch {
          throw new Error(t("bench.invalidExtraBody"));
        }
      }

      let scenarios: BenchScenarioT[];
      if (mode === "prefill") {
        const levels = parseNums(inputLevelsText);
        if (levels.length === 0) throw new Error("invalid input lengths");
        scenarios = levels.map((n) => ({
          inputTokens: n,
          outputTokens: 1,
          concurrency: Math.max(1, optInt(singleConcurrency) ?? 1),
          requests: requestsPerLevel,
        }));
      } else if (mode === "context") {
        const levels = parseNums(contextLevelsText);
        if (levels.length === 0) throw new Error("invalid context lengths");
        scenarios = levels.map((n) => ({
          inputTokens: n,
          outputTokens,
          concurrency: Math.max(1, optInt(singleConcurrency) ?? 1),
          requests: requestsPerLevel,
        }));
      } else {
        const levels = parseNums(levelsText);
        if (levels.length === 0) throw new Error("invalid concurrency levels");
        scenarios = levels.map((c) => ({
          inputTokens,
          outputTokens: mode === "decode" ? Math.max(outputTokens, 64) : outputTokens,
          concurrency: c,
          requests: requestsPerLevel,
        }));
      }

      const { runId } = await api.startRun({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        apiPath,
        stream,
        inputTokens: scenarios[0]!.inputTokens,
        outputTokens: scenarios[0]!.outputTokens,
        temperature,
        topP,
        topK: optInt(topK),
        minP: optFloat(minP),
        repetitionPenalty: optFloat(repetitionPenalty),
        presencePenalty: optFloat(presencePenalty),
        frequencyPenalty: optFloat(frequencyPenalty),
        seed: optInt(seed),
        ignoreEos,
        extraBody,
        concurrencyLevels: [1],
        requestsPerLevel,
        timeoutMs: Math.max(1, optInt(timeoutSec) ?? 120) * 1000,
        scenarios,
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
  const modeHintKey =
    mode === "mixed"
      ? "bench.modeMixedHint"
      : mode === "prefill"
        ? "bench.modePrefillHint"
        : mode === "decode"
          ? "bench.modeDecodeHint"
          : "bench.modeContextHint";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("bench.title")}</h1>
        <p className="text-sm text-muted">{t("bench.desc")}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card className="grid gap-4 md:grid-cols-4">
          <Field label={t("bench.endpoint")}>
            <input
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t("bench.endpointHint")}
              className={inputCls}
            />
          </Field>
          <div className="space-y-1.5">
            <span className="flex items-center text-xs font-medium text-muted">
              {t("bench.model")}
            </span>
            <ModelField
              value={model}
              onChange={setModel}
              models={models}
              state={modelState}
              onRefresh={reloadModels}
            />
            {maxContext !== undefined && (
              <span className="block text-[11px] text-accent-soft/80">
                {t("bench.maxContext", { n: maxContext.toLocaleString() })}
              </span>
            )}
          </div>
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

          <div className="md:col-span-2 lg:col-span-4">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("bench.mode")}</span>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMode(m.id)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all ${
                    mode === m.id
                      ? "border-transparent bg-gradient-to-r from-accent/30 to-accent-soft/10 text-accent-soft shadow-[inset_0_0_0_1px_rgba(91,141,217,.4)]"
                      : "border-border text-muted hover:border-accent/40 hover:text-text"
                  }`}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted/80">{t(modeHintKey)}</p>
          </div>

          {(mode === "mixed" || mode === "decode") && (
            <>
              <Field label={t("bench.inputTokens")}>
                <input
                  type="number"
                  min={8}
                  max={1048576}
                  value={inputTokens}
                  onChange={(e) => setInputTokens(parseInt(e.target.value, 10))}
                  className={inputCls}
                />
              </Field>
              <Field label={t("bench.outputTokens")}>
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={outputTokens}
                  onChange={(e) => setOutputTokens(parseInt(e.target.value, 10))}
                  className={inputCls}
                />
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
            </>
          )}

          {mode === "prefill" && (
            <>
              <Field label={t("bench.inputLevels")} hint={t("bench.inputLevelsHint")}>
                <input
                  required
                  value={inputLevelsText}
                  onChange={(e) => setInputLevelsText(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label={t("bench.singleConcurrency")}>
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={singleConcurrency}
                  onChange={(e) => setSingleConcurrency(e.target.value)}
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
              <div className="flex items-end pb-1 text-[11px] text-muted/80">
                output = 1 token（TTFT ≈ prefill）
              </div>
            </>
          )}

          {mode === "context" && (
            <>
              <Field
                label={t("bench.contextLevels")}
                hint={
                  maxContext
                    ? `${t("bench.contextLevelsHint")} · ${t("bench.maxContext", { n: maxContext.toLocaleString() })}`
                    : t("bench.contextLevelsHint")
                }
              >
                <input
                  required
                  value={contextLevelsText}
                  onChange={(e) => setContextLevelsText(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label={t("bench.singleConcurrency")}>
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={singleConcurrency}
                  onChange={(e) => setSingleConcurrency(e.target.value)}
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
              <Field label={t("bench.outputTokens")}>
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={outputTokens}
                  onChange={(e) => setOutputTokens(parseInt(e.target.value, 10))}
                  className={inputCls}
                />
              </Field>
            </>
          )}

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
            <Toggle on={stream} onClick={() => setStream(!stream)} />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={running}
              className="h-[38px] flex-1 rounded-lg bg-gradient-to-r from-accent to-accent-soft px-4 text-sm font-bold text-[#07101f] shadow-lg shadow-accent/25 transition-all hover:brightness-110 active:scale-[.98] disabled:opacity-40 disabled:hover:brightness-100"
            >
              {t("bench.start")}
            </button>
            {runId && status?.status === "running" && (
              <button
                type="button"
                onClick={stop}
                className="h-[38px] rounded-lg border border-bad/50 px-4 text-sm text-bad transition-colors hover:bg-bad/10"
              >
                {t("bench.stop")}
              </button>
            )}
          </div>

          <details className="md:col-span-2 lg:col-span-4 rounded-lg border border-border/70 bg-bg/30 px-4 py-3">
            <summary className="cursor-pointer select-none text-xs font-medium text-muted transition-colors hover:text-text">
              {t("bench.advancedToggle")}
            </summary>
            <p className="mt-2 text-[11px] text-muted/70">{t("bench.advancedHint")}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-4">
              <Field label="top_k">
                <input type="number" step="1" value={topK} onChange={(e) => setTopK(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="min_p">
                <input type="number" step="0.01" min={0} max={1} value={minP} onChange={(e) => setMinP(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="repetition_penalty">
                <input type="number" step="0.05" min={0.1} max={2} value={repetitionPenalty} onChange={(e) => setRepetitionPenalty(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="seed" hint={t("bench.seedHint")}>
                <input type="number" step="1" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="presence_penalty">
                <input type="number" step="0.1" min={-2} max={2} value={presencePenalty} onChange={(e) => setPresencePenalty(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label="frequency_penalty">
                <input type="number" step="0.1" min={-2} max={2} value={frequencyPenalty} onChange={(e) => setFrequencyPenalty(e.target.value)} placeholder="—" className={inputCls} />
              </Field>
              <Field label={t("bench.timeout")}>
                <input type="number" step="1" min={1} value={timeoutSec} onChange={(e) => setTimeoutSec(e.target.value)} className={inputCls} />
              </Field>
              <Field label="ignore_eos" hint={t("bench.ignoreEosHint")}>
                <Toggle on={ignoreEos} onClick={() => setIgnoreEos(!ignoreEos)} />
              </Field>
              <div className="md:col-span-2 lg:col-span-4">
                <Field label={t("bench.extraBody")} hint={t("bench.extraBodyHint")}>
                  <textarea
                    rows={2}
                    value={extraBodyText}
                    onChange={(e) => setExtraBodyText(e.target.value)}
                    placeholder='{ "top_k": 20, "options": { "num_ctx": 4096 } }'
                    className={`${inputCls} font-mono text-xs`}
                  />
                </Field>
              </div>
            </div>
          </details>
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
                  className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent-soft transition-colors hover:bg-accent/10"
                >
                  {t("common.openReport")}
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate("results")}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
                >
                  {t("bench.viewResults")} →
                </button>
              </>
            )}
          </div>

          {status.status === "running" && (
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-soft transition-all"
                style={{
                  width: `${((status.progress.levelIndex * status.progress.requestsTotal + status.progress.requestsDone) / Math.max(1, status.progress.levelCount * status.progress.requestsTotal)) * 100}%`,
                }}
              />
            </div>
          )}

          {result && result.levels.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {result.levels.map((l) => (
                <div
                  key={l.label ?? l.concurrency}
                  className="rounded-xl border border-border bg-gradient-to-b from-surface to-bg p-4 transition-colors hover:border-accent/40"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold text-accent-soft" title={l.label}>
                      {l.label ?? `C=${l.concurrency}`}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {l.successfulRequests}/{l.totalRequests} ok
                    </span>
                  </div>
                  <dl className="space-y-2 text-xs">
                    {(
                      l.prefillThroughput !== undefined
                        ? ([
                            ["prefillThroughput", `${l.prefillThroughput.toFixed(0)} tok/s`],
                            ["ttft", l.ttft ? `${l.ttft.p50.toFixed(0)} / ${l.ttft.p99.toFixed(0)} ms` : null],
                            ["e2e", l.e2e ? `${l.e2e.p50.toFixed(0)} ms` : null],
                          ] as [string, string | null][])
                        : ([
                            ["outputThroughput", `${l.outputThroughput.toFixed(1)} tok/s`],
                            ["ttft", l.ttft ? `${l.ttft.p50.toFixed(0)} / ${l.ttft.p99.toFixed(0)} ms` : null],
                            ["tpot", l.tpot ? `${l.tpot.p50.toFixed(1)} ms` : null],
                            ["itl", l.itl ? `${l.itl.p50.toFixed(1)} ms` : null],
                            ["e2e", l.e2e ? `${l.e2e.p50.toFixed(0)} ms` : null],
                            ["requestThroughput", `${l.requestThroughput.toFixed(2)} req/s`],
                          ] as [string, string | null][])
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

      {submitting && <Spinner />}
    </div>
  );
}
