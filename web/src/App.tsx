import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import { setLang } from "./i18n";
import ParamBrowser from "./pages/ParamBrowser";
import Bench from "./pages/Bench";
import Results from "./pages/Results";

type Page = "params" | "bench" | "results";

const NAV: { id: Page; key: string }[] = [
  { id: "params", key: "nav.params" },
  { id: "bench", key: "nav.bench" },
  { id: "results", key: "nav.results" },
];

export default function App() {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const [page, setPage] = useState<Page>("params");

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
            <div className="flex items-baseline gap-2.5">
              <span className="text-lg font-bold tracking-tight">
                🌬️ {t("app.title")}
              </span>
              <span className="hidden text-xs text-muted md:inline">
                {t("app.tagline")}
              </span>
            </div>
            <nav className="ml-auto flex gap-1">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    page === item.id
                      ? "bg-accent/15 font-medium text-accent-soft"
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
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-text"
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
