import type { Context } from '@deepseek-ai/cordis';
// Type-only imports: they erase at runtime but pull the declaration-file
// augmentations this module's types rely on (Context.systemPrompt, the
// agent/pre-step Events member) into the compiling program.
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { Config, parseGuidanceConfig, type GuidanceBinding } from './config.js';
import { matchesBinding } from './match.js';

/** Composition id; matches the bundle patch insert row and the section name. */
export const name = 'small-model-guidance';

/** Order for the guidance section: just below the tool-guidance band (100-199). */
export const GUIDANCE_ORDER = 90;

export { Config };

/** Structural view of the agent this plugin reads: identity plus its service store. */
interface GuidanceAgent {
  options?: { provider?: string; model?: string };
  ctx: { get(key: string): unknown };
}

interface RegisteredSection {
  text: string;
  dispose: () => void;
}

/**
 * Reconcile one agent's guidance section against the bindings. Registers on
 * first match, keeps the section when the desired text is unchanged
 * (re-registering the same name in one scope throws), disposes and
 * re-registers when the match changes, and disposes when nothing matches.
 * Missing provider or model identity never matches, so such agents carry no
 * guidance section.
 */
function reconcileSection(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSection>, agent: GuidanceAgent): void {
  const desired = bindings
    .find(binding => matchesBinding(binding, agent.options?.provider, agent.options?.model))
    ?.text;
  const current = registered.get(agent);
  if (desired === undefined) {
    if (current) {
      current.dispose();
      registered.delete(agent);
    }
    return;
  }
  if (current?.text === desired) return;
  current?.dispose();
  // Optional-service read: ctx.<name> is reserved for declared injections and
  // this plugin declares none, so the service store is read strictly.
  const systemPrompt = agent.ctx.get('systemPrompt') as SystemPrompt | undefined;
  const dispose = systemPrompt?.section({
    name,
    order: GUIDANCE_ORDER,
    text: desired,
  });
  if (!dispose) return;
  registered.set(agent, { text: desired, dispose });
}

/**
 * Create the agent/created listener: initial conditioning. Prompt assembly
 * runs before the pre-step waterfall of a step, so a section first registered
 * during a pre-step would miss that step's request; conditioning at creation
 * puts the section in place before the agent's first assemble. The section
 * effect is owned by the agent's scope, so it unwinds with the agent.
 */
export function createAgentCreatedHandler(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSection> = new WeakMap()): (payload: { agent: GuidanceAgent }) => void {
  return ({ agent }) => {
    reconcileSection(bindings, registered, agent);
  };
}

/**
 * Create the agent/pre-step waterfall handler: per-step reconciliation. After
 * delegating via next(), it re-evaluates the agent's identity against the
 * bindings and repairs the agent-scoped section when the match changed — a
 * mid-session model switch is picked up here and replaces the section on the
 * next pre-step. The handler must delegate: it awaits next() and returns the
 * downstream decision untouched.
 */
export function createPreStepHandler<P extends { agent: GuidanceAgent }, D>(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSection> = new WeakMap()): (payload: P, next: () => Promise<D>) => Promise<D> {
  return async (payload, next) => {
    const decision = await next();
    reconcileSection(bindings, registered, payload.agent);
    return decision;
  };
}

/**
 * Mount the guidance plugin. Operator config is validated here so semantic
 * violations fail loud at load. Conditioning happens twice, over one shared
 * registration bookkeeping so the two listeners reconcile the same per-agent
 * section instead of racing duplicate registrations of one section name: once
 * at agent/created, so the section is present from the agent's first assembled
 * request, and once per agent/pre-step, so a mid-session model switch
 * replaces the section. Both listeners rely on fiber unload for disposal,
 * matching the shipped loop-hygiene plugins' cleanup pattern; the per-agent
 * section effects themselves unwind with each agent's scope.
 */
export function apply(ctx: Context, config: Config): void {
  const bindings = parseGuidanceConfig(config).bindings;
  const registered = new WeakMap<object, RegisteredSection>();
  ctx.on('agent/created', createAgentCreatedHandler(bindings, registered));
  ctx.on('agent/pre-step', createPreStepHandler(bindings, registered));
}
