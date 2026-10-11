import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";

/** The signature "?" icon attached to every parameter and metric. */
export function QuestionMark({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="ml-1.5 inline-flex h-[15px] w-[15px] shrink-0 cursor-help items-center justify-center rounded-full border border-accent/50 align-middle text-[10px] font-bold leading-none text-accent-soft/80 transition-colors hover:bg-accent/25"
    >
      ?
    </button>
  );
}

/** Generic rich tooltip: bold title + body content, keyboard accessible (Radix). */
export function InfoTip({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <QuestionMark label={title} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-sm rounded-xl border border-border bg-surface p-3.5 shadow-2xl"
        >
          <div className="mb-1 text-sm font-semibold text-accent-soft">
            {title}
          </div>
          <div className="text-xs leading-relaxed text-text/90">
            {children}
          </div>
          <Tooltip.Arrow className="fill-border" width={11} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Tooltip fed from the bilingual metrics.* i18n keys. */
export function MetricTip({ metricKey }: { metricKey: string }) {
  const { t } = useTranslation();
  return (
    <InfoTip title={t(`metrics.${metricKey}.name`)}>
      {t(`metrics.${metricKey}.desc`)}
    </InfoTip>
  );
}

const badgeTones: Record<string, string> = {
  default: "border-border text-muted",
  accent: "border-accent/50 text-accent-soft",
  good: "border-good/40 text-good",
  warn: "border-warn/40 text-warn",
  bad: "border-bad/40 text-bad",
};

export function Badge({
  tone = "default",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] leading-snug ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <span>…</span>
    </div>
  );
}
