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

/** Plugin configuration: operator-authored guidance bindings. */
export interface Config {
  bindings: GuidanceBinding[];
}

const BindingSchema = z.object({
  models: z.array(z.string()).required(),
  route: z.string(),
  text: z.string().required(),
});

/** Structural schema for operator configuration; semantic checks live in {@link parseGuidanceConfig}. */
export const Config: z<Config> = z.object({
  bindings: z.array(BindingSchema).default([]),
});

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
