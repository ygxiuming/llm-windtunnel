import { useEffect, useState } from "react";
import type { EngineRegistryT } from "@windtunnel/shared";
import { useTranslation } from "react-i18next";
import { api, type EngineMeta } from "../api";
import { Badge, Card, Spinner } from "../components/ui";
import { ParamTip } from "../components/ParamTip";

export default function ParamBrowser() {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const lang = zh ? "zh" : "en";

  const [engines, setEngines] = useState<EngineMeta[] | null>(null);
  const [engineId, setEngineId] = useState<string | null>(null);
  const [registry, setRegistry] = useState<EngineRegistryT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .engines()
      .then((list) => {
        setEngines(list);
        setEngineId(list[0]?.engine ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!engineId) return;
    setRegistry(null);
    api
      .registry(engineId)
      .then(setRegistry)
      .catch((e) => setError(String(e)));
  }, [engineId]);

  if (error) {
    return (
      <Card>
        <div className="text-bad">{t("common.error")}: {error}</div>
      </Card>
    );
  }
  if (!engines) return <Spinner />;

  const q = query.trim().toLowerCase();
  const filtered = (registry?.params ?? []).filter((p) => {
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.apiField ?? "").toLowerCase().includes(q) ||
      (p.flag ?? "").toLowerCase().includes(q) ||
      p.description[lang].toLowerCase().includes(q)
    );
  });

  const sections = (registry?.categories ?? [])
    .map((cat) => ({
      cat,
      params: filtered.filter((p) => p.category === cat.id),
    }))
    .filter((s) => s.params.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{t("nav.params")}</h1>
          <p className="text-sm text-muted">{t("app.tagline")}</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common.search")}
          className="w-72 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {engines.map((e) => (
          <button
            key={e.engine}
            type="button"
            onClick={() => setEngineId(e.engine)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
              e.engine === engineId
                ? "border-accent bg-accent/15 text-accent-soft"
                : "border-border bg-surface text-text/80 hover:border-accent/50"
            }`}
          >
            <span className="font-medium">{e.displayName}</span>
            <span className="text-[11px] text-muted">{e.paramCount}</span>
            {e.status === "archived" && (
              <Badge tone="warn">{t("params.statusArchived")}</Badge>
            )}
          </button>
        ))}
      </div>

      {!registry ? (
        <Spinner />
      ) : (
        <>
          <Card className="space-y-1.5 text-xs text-muted">
            <div>
              <span className="text-text/70">{t("params.launchHint")}: </span>
              <code>{registry.launchHint?.[lang] ?? registry.launchHint?.en}</code>
            </div>
            {registry.source && (
              <div>
                <span className="text-text/70">{t("params.metadataSource")}: </span>
                <a
                  href={registry.source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-soft underline decoration-accent/40 underline-offset-2"
                >
                  {registry.source}
                </a>
              </div>
            )}
            {registry.status === "archived" && (
              <div className="text-warn">{t("params.archivedEngine")}</div>
            )}
          </Card>

          {sections.length === 0 ? (
            <Card>
              <div className="text-sm text-muted">{t("params.noResults")}</div>
            </Card>
          ) : (
            sections.map(({ cat, params }) => (
              <section key={cat.id}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent-soft/90">
                  {cat.name[lang]} · {cat.name.en}
                </h2>
                <Card className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                        <th className="px-4 py-2.5 font-medium">Parameter</th>
                        <th className="px-4 py-2.5 font-medium">{t("params.scopeRequest")} / {t("params.scopeServer")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("params.fieldType")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("params.fieldDefault")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("params.fieldRange")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.map((p) => (
                        <tr
                          key={`${p.scope}-${p.name}`}
                          className="border-b border-border/60 last:border-0 hover:bg-bg/40"
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[13px] text-text">
                              {p.name}
                            </span>
                            <ParamTip param={p} />
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={p.scope === "request" ? "accent" : "default"}>
                              {t(`params.scope${p.scope === "request" ? "Request" : "Server"}`)}
                            </Badge>
                            {p.status !== "documented" && (
                              <span className="ml-1.5">
                                <Badge tone="warn">
                                  {t(`params.status${p.status === "runtime-only" ? "RuntimeOnly" : "Archived"}`)}
                                </Badge>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted">
                            {p.type}
                            {p.choices?.length ? (
                              <span className="ml-1 text-muted/70">
                                [{p.choices.slice(0, 3).join(", ")}
                                {p.choices.length > 3 ? "…" : ""}]
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-text/85">
                            {p.default !== undefined ? String(p.default) : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted">
                            {p.range && (p.range.min !== undefined || p.range.max !== undefined)
                              ? `${p.range.min ?? "-∞"} – ${p.range.max ?? "+∞"}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
