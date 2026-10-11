import { z } from "zod";

/* ============================================================
 * Registry schemas — the cross-engine parameter registry.
 * This is llm-windtunnel's core data asset: every engine
 * parameter is structured, categorized, and bilingual.
 * ============================================================ */

export const LocalizedText = z.object({
  en: z.string(),
  zh: z.string(),
});
export type LocalizedTextT = z.infer<typeof LocalizedText>;

export const ParamCategoryId = z.enum([
  "sampling",
  "scheduler",
  "memory-parallel",
  "quantization",
  "server",
]);
export type ParamCategoryIdT = z.infer<typeof ParamCategoryId>;

/** Where the parameter takes effect. */
export const ParamScope = z.enum([
  /** Sent inside the inference request body (OpenAI-compatible `options`-style). */
  "request",
  /** Set when launching the engine server process. */
  "server",
]);
export type ParamScopeT = z.infer<typeof ParamScope>;

/** Documentation confidence for the parameter. */
export const ParamStatus = z.enum([
  /** Documented by the engine's official docs. */
  "documented",
  /** Accepted by the engine runtime but no longer (or never) in official doc tables. */
  "runtime-only",
  /** Parameter of an archived/frozen engine. */
  "archived",
]);
export type ParamStatusT = z.infer<typeof ParamStatus>;

export const ParamValueType = z.enum([
  "number",
  "integer",
  "string",
  "boolean",
  "string[]",
  "enum",
]);
export type ParamValueTypeT = z.infer<typeof ParamValueType>;

export const ParamDefinition = z.object({
  /** Canonical name as used by the engine (e.g. `max_num_seqs`, `num_ctx`). */
  name: z.string(),
  scope: ParamScope,
  category: ParamCategoryId,
  /** CLI flag for server-scope params (e.g. `--tensor-parallel-size`). */
  flag: z.string().optional(),
  /** Request-body field / options path for request-scope params (e.g. `temperature`, `options.num_ctx`). */
  apiField: z.string().optional(),
  type: ParamValueType,
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  range: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  choices: z.array(z.string()).optional(),
  status: ParamStatus.default("documented"),
  /** Engine version when the parameter/default was last verified, e.g. "0.31". */
  since: z.string().optional(),
  description: LocalizedText,
});
export type ParamDefinitionT = z.infer<typeof ParamDefinition>;

export const EngineRegistry = z.object({
  engine: z.string(),
  displayName: z.string(),
  homepage: z.string(),
  /** `archived` engines are read-only references (e.g. TGI). */
  status: z.enum(["active", "archived"]),
  apiStyle: z.string(),
  /** How to launch the engine / where the endpoint lives. */
  launchHint: LocalizedText.optional(),
  /** Where the parameter metadata was extracted from. */
  source: z.string().optional(),
  categories: z.array(
    z.object({ id: ParamCategoryId, name: LocalizedText })
  ),
  params: z.array(ParamDefinition),
});
export type EngineRegistryT = z.infer<typeof EngineRegistry>;
