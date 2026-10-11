import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import { setLang } from "./i18n";
import ParamBrowser from "./pages/ParamBrowser";
import Bench from "./pages/Bench";
import Results from "./pages/Results";

type Page = "bench" | "results" | "params";

const NAV: { id: Page; key: string }[] = [
  { id: "bench", key: "nav.bench" },
  { id: "results", key: "nav.results" },
  { id: "params", key: "nav.params" },
];

export default function App() {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const [page, setPage] = useState<Page>("bench");

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
            <div className="flex items-baseline gap-2.5">
              <span className="bg-gradient-to-r from-accent-soft via-text to-accent-soft bg-clip-text text-lg font-bold tracking-tight text-transparent">
                🌬️ {t("app.title")}
              </span>
              <span className="hidden text-xs text-muted md:inline">
                {t("app.tagline")}
              </span>
            </div>
            <nav className="ml-auto flex items-center gap-1 rounded-full border border-border/70 bg-surface/70 p-1">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                    page === item.id
                      ? "bg-gradient-to-r from-accent/30 to-accent-soft/15 font-medium text-accent-soft shadow-[inset_0_0_0_1px_rgba(91,141,217,.35)]"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {t(item.key)}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => setLang(zh ? "en" : "zh-CN")}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-all hover:border-accent/60 hover:text-text"
              aria-label="switch language"
            >
              🌐 {t("common.langSwitch")}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {page === "params" && <ParamBrowser />}
          {page === "bench" && <Bench onNavigate={setPage} />}
          {page === "results" && <Results />}
        </main>

        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-[11px] text-muted/70">
          Apache-2.0 · github.com/ygxiuming/llm-windtunnel ·{" "}
          {t("app.tagline")}
        </footer>
      </div>
    </Tooltip.Provider>
  );
}
