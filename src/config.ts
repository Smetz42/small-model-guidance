import z from '@deepseek-ai/schemastery';

/** One guidance binding: the models it targets, an optional route pin, and the section text. */
export interface GuidanceBinding {
  /** Model ids this binding targets; exact match, one text serves every listed id. */
  models: string[];
  /** Provider route pin; omit to follow the model on any route serving it. */
  route?: string;
  /** The guidance section text contributed for matching agents. */
  text: string;
}

/** Plugin configuration: operator-authored guidance bindings plus the shipped baseline. */
export interface Config {
  /** Operator-authored bindings, ordered; equal-text matches collapse per ticket #3 semantics. */
  bindings: GuidanceBinding[];
  /**
   * Whether the shipped baseline binding set is active. Default true: a
   * zero-config install carries the qwen3.8-27b run_code guidance.
   */
  includeBaseline?: boolean;
}

const BindingSchema = z.object({
  models: z.array(z.string()).required(),
  route: z.string(),
  text: z.string().required(),
});

/** Structural schema for operator configuration; semantic checks live in {@link parseGuidanceConfig}. */
export const Config: z<Config> = z.object({
  bindings: z.array(BindingSchema).default([]),
  includeBaseline: z.boolean().default(true),
});

/**
 * The shipped baseline guidance text: the run_code tool-call protocol for
 * code-mode profiles, adapted from the session's prompt-block capture. It
 * names the dead-turn consequence, states the lossless-JSON completion
 * contract, the try/catch idiom, the per-call description requirement,
 * output curation, and the re-issue rule; it carries no backend diagnostics
 * and shows no raw wrapper markup.
 */
export const BASELINE_TEXT = 'Tool-call protocol: in this harness the only directly callable tool is run_code. Never emit a tool-call block naming any other tool: that block is not executed \u2014 it is demoted to plain assistant text, the turn ends with no result and no error, and the raw wrapper markup sits visible in your message (a silently dead turn). Never retry that shape. Do all tool work inside run_code programs: pass code (an async function body) and description (a short active-voice summary), and call other tools as await tools.<name>(args) inside the program. Several called tools require a description argument in their args (bash, edit, workflow, and the subagent surfaces): a call rejected with missing required property "description" is an arguments bug, not a harness fault \u2014 re-issue the same call with the description added. Wrap each await tools call in try/catch and return a structured error object on failure instead of throwing. The program must complete with a lossless JSON value: no undefined fields in the returned value \u2014 sanitize with return JSON.parse(JSON.stringify(out)) and map optional fields with ?? null. Only what you return or console.log reaches the conversation: curate output by slicing long strings and projecting large results to compact fields. If a turn ever ends with raw tool-call markup visible in your message, re-issue the identical work once as a run_code program.';

/**
 * The shipped baseline binding: qwen3.8-27b with no route pin (a published
 * artifact carries no deployment-local route names), ordered before operator
 * bindings.
 */
export const BASELINE_BINDING: GuidanceBinding = {
  models: ['qwen3.8-27b'],
  text: BASELINE_TEXT,
};

/**
 * Resolve the effective binding list: the baseline first (so it orders before
 * operator bindings in a multi-match assembly), then the operator's bindings.
 * includeBaseline: false drops the baseline without touching operator
 * bindings.
 */
export function resolveBindings(config: Config): GuidanceBinding[] {
  return config.includeBaseline === false ? config.bindings : [BASELINE_BINDING, ...config.bindings];
}

/**
 * Validate and normalize operator configuration. Schemastery throws its
 * ValidationError on structural violations; semantic violations (empty model
 * list, empty text) throw naming the offending binding. Both fail loud at
 * plugin load.
 */
export function parseGuidanceConfig(input: unknown): Config {
  // Schema instances are callable resolvers; the declared input type narrows to
  // the validated shape, but this boundary takes unvalidated operator config.
  const validate = Config as unknown as (data: unknown) => Config;
  const value = validate(input);
  value.bindings.forEach((binding, i) => {
    if (binding.models.length === 0) throw new Error(`bindings[${i}]: models must list at least one model id`);
    if (binding.text.trim() === '') throw new Error(`bindings[${i}]: text must not be empty`);
  });
  return value;
}
