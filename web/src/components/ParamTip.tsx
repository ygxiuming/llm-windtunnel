import * as Tooltip from "@radix-ui/react-tooltip";
import type { ParamDefinitionT } from "@windtunnel/shared";
import { useTranslation } from "react-i18next";

/**
 * The core differentiator: a rich bilingual tooltip for one engine parameter,
 * driven entirely by the registry YAML (description.{en,zh} + metadata rows).
 */
export function ParamTip({ param }: { param: ParamDefinitionT }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const description = zh ? param.description.zh : param.description.en;

  const rows: [string, string][] = [];
  rows.push([t(`params.fieldType`), param.type]);
  if (param.default !== undefined) {
    rows.push([t(`params.fieldDefault`), String(param.default)]);
  }
  if (param.range && (param.range.min !== undefined || param.range.max !== undefined)) {
    const min = param.range.min ?? "-∞";
    const max = param.range.max ?? "+∞";
    rows.push([t(`params.fieldRange`), `${min} – ${max}`]);
  }
  if (param.choices?.length) {
    rows.push([t(`params.fieldChoices`), param.choices.join(", ")]);
  }
  if (param.scope === "server" && param.flag) {
    rows.push([t(`params.fieldFlag`), param.flag]);
  }
  if (param.apiField) {
    rows.push([t(`params.fieldApiField`), param.apiField]);
  }
  if (param.since) {
    rows.push([t(`params.fieldSince`), param.since]);
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={`${param.name} — ${t("common.detail")}`}
          className="ml-1.5 inline-flex h-[15px] w-[15px] shrink-0 cursor-help items-center justify-center rounded-full border border-accent/50 align-middle text-[10px] font-bold leading-none text-accent-soft/80 transition-colors hover:bg-accent/25"
        >
          ?
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-96 max-w-[90vw] rounded-xl border border-border bg-surface p-4 shadow-2xl"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <code className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent-soft">
              {param.name}
            </code>
            <span className="rounded-full border border-border px-2 text-[10px] text-muted">
              {t(`params.scope${param.scope === "request" ? "Request" : "Server"}`)}
            </span>
            {param.status !== "documented" && (
              <span className="rounded-full border border-warn/40 px-2 text-[10px] text-warn">
                {t(`params.status${param.status === "runtime-only" ? "RuntimeOnly" : "Archived"}`)}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-text/90">{description}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11px]">
            {rows.map(([k, v]) => (
              <div key={k} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all text-text/80">{v}</dd>
              </div>
            ))}
          </dl>
          <Tooltip.Arrow className="fill-border" width={11} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
