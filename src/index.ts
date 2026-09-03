import type { Context } from '@deepseek-ai/cordis';
// Type-only imports: they erase at runtime but pull the declaration-file
// augmentations this module's types rely on (Context.systemPrompt, the
// agent/pre-step Events member) into the compiling program.
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { Config, parseGuidanceConfig, resolveBindings, type GuidanceBinding } from './config.js';
import { matchesBinding } from './match.js';

/** Composition id; matches the bundle patch insert row and the base section name. */
export const name = 'small-model-guidance';

/** Order for the guidance sections: just below the tool-guidance band (100-199). */
export const GUIDANCE_ORDER = 90;

export { Config };

/** Structural view of the agent this plugin reads: identity plus its service store. */
interface GuidanceAgent {
  options?: { provider?: string; model?: string };
  ctx: { get(key: string): unknown };
}

/** One section the agent should carry: stable name plus its guidance text. */
interface DesiredSection {
  name: string;
  text: string;
}

/** Bookkeeping for the sections currently registered for one agent. */
interface RegisteredSections {
  /** Canonical form of the registered set; identical desired sets reconcile to a no-op. */
  signature: string;
  disposeAll: () => void;
}

/**
 * Structural surface this plugin reads from the llm registry to validate
 * route pins. Read shape-only so the published types stay free of any llm
 * dependency; both methods are optional because the service may be absent or
 * older than this plugin.
 */
interface LlmRouteSurface {
  listProviders?: () => { id: string }[];
  listConfigurableProviders?: () => { provider: string }[];
}

/** One operator route pin that no known provider route serves, with its binding index. */
export interface UnknownRoutePin {
  index: number;
  route: string;
}

/**
 * Route pins among the operator bindings that no registered or configurable
 * provider route serves. Model ids are not checkable here: they are runtime
 * registries resolved per provider (an id no agent ever carries simply never
 * matches, and the harness surfaces unknown models when an agent tries to use
 * one), while route pins name the provider registry this surface can read.
 */
export function unknownRoutePins(bindings: GuidanceBinding[], knownRoutes: ReadonlySet<string>): UnknownRoutePin[] {
  const unknown: UnknownRoutePin[] = [];
  bindings.forEach((binding, index) => {
    if (binding.route !== undefined && !knownRoutes.has(binding.route)) unknown.push({ index, route: binding.route });
  });
  return unknown;
}

/**
 * Resolve the sections one agent should carry from the binding list. Every
 * matching binding contributes a section, in deterministic listed order;
 * bindings whose text is byte-identical collapse to the first occurrence so a
 * copied-as-template binding cannot inject the same guidance twice. One
 * section keeps the bare composition name; several sections are numbered in
 * listed order.
 */
export function desiredSections(bindings: GuidanceBinding[], provider: string | undefined, model: string | undefined): DesiredSection[] {
  const desired: DesiredSection[] = [];
  const seenTexts = new Set<string>();
  for (const binding of bindings) {
    if (!matchesBinding(binding, provider, model)) continue;
    if (seenTexts.has(binding.text)) continue;
    seenTexts.add(binding.text);
    const index = desired.length;
    desired.push({
      name: index === 0 ? name : `${name}:${index + 1}`,
      text: binding.text,
    });
  }
  return desired;
}

/**
 * Reconcile one agent's guidance sections against the bindings. Registers the
 * desired set on first match, keeps it while the canonical form is unchanged
 * (re-registering a name in one scope throws), disposes and re-registers when
 * the match set changes, and disposes everything when nothing matches. A
 * partial multi-section registration failure rolls back what registered
 * before rethrowing. Missing provider or model identity never matches, so
 * such agents carry no guidance sections.
 */
function reconcileSections(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSections>, agent: GuidanceAgent): void {
  const desired = desiredSections(bindings, agent.options?.provider, agent.options?.model);
  const signature = JSON.stringify(desired);
  const current = registered.get(agent);
  if (current?.signature === signature) return;
  current?.disposeAll();
  if (desired.length === 0) {
    registered.delete(agent);
    return;
  }
  // Optional-service read: ctx.<name> is reserved for declared injections and
  // this plugin declares none, so the service store is read strictly.
  const systemPrompt = agent.ctx.get('systemPrompt') as SystemPrompt | undefined;
  if (!systemPrompt) return;
  const disposers: (() => void)[] = [];
  try {
    for (const section of desired) {
      disposers.push(systemPrompt.section({ name: section.name, order: GUIDANCE_ORDER, text: section.text }));
    }
  } catch (error) {
    for (const dispose of disposers.splice(0).reverse()) dispose();
    throw error;
  }
  registered.set(agent, {
    signature,
    disposeAll: () => {
      for (const dispose of disposers.splice(0)) dispose();
    },
  });
}

/**
 * Create the agent/created listener: initial conditioning. Prompt assembly
 * runs before the pre-step waterfall of a step, so a section first registered
 * during a pre-step would miss that step's request; conditioning at creation
 * puts the sections in place before the agent's first assemble. The section
 * effects are owned by the agent's scope, so they unwind with the agent.
 */
export function createAgentCreatedHandler(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSections> = new WeakMap()): (payload: { agent: GuidanceAgent }) => void {
  return ({ agent }) => {
    reconcileSections(bindings, registered, agent);
  };
}

/**
 * Create the agent/pre-step waterfall handler: per-step reconciliation. After
 * delegating via next(), it re-evaluates the agent's identity against the
 * bindings and repairs the agent-scoped sections when the match set changed —
 * a mid-session model switch is picked up here and replaces the sections on
 * the next pre-step. The handler must delegate: it awaits next() and returns
 * the downstream decision untouched.
 */
export function createPreStepHandler<P extends { agent: GuidanceAgent }, D>(bindings: GuidanceBinding[], registered: WeakMap<object, RegisteredSections> = new WeakMap()): (payload: P, next: () => Promise<D>) => Promise<D> {
  return async (payload, next) => {
    const decision = await next();
    reconcileSections(bindings, registered, payload.agent);
    return decision;
  };
}

/**
 * Mount the guidance plugin. Operator config is validated here so semantic
 * violations fail loud at load. Route pins that no registered or configurable
 * provider serves surface as load-time warnings (and once more at the first
 * agent creation, for adapters that register after this plugin), naming the
 * binding and the pin; a route may still activate later through settings, so
 * this warns rather than throws. Conditioning happens twice, over one shared
 * registration bookkeeping so the two listeners reconcile the same per-agent
 * section set instead of racing duplicate registrations of one section name:
 * once at agent/created, so the sections are present from the agent's first
 * assembled request, and once per agent/pre-step, so a mid-session model
 * switch replaces them. Both listeners rely on fiber unload for disposal,
 * matching the shipped loop-hygiene plugins' cleanup pattern; the per-agent
 * section effects themselves unwind with each agent's scope.
 */
export function apply(ctx: Context, config: Config): void {
  const parsed = parseGuidanceConfig(config);
  const bindings = resolveBindings(parsed);
  // Route pins are checked against the operator's bindings only; the shipped
  // baseline carries no pin by design.
  const pendingPins = new Map<number, string>();
  parsed.bindings.forEach((binding, index) => {
    if (binding.route !== undefined) pendingPins.set(index, binding.route);
  });
  const surfaceUnknownPins = (): void => {
    if (pendingPins.size === 0) return;
    const llm = ctx.get('llm') as LlmRouteSurface | undefined;
    if (!llm?.listProviders || !llm.listConfigurableProviders) return;
    const known = new Set<string>();
    for (const provider of llm.listProviders()) known.add(provider.id);
    for (const provider of llm.listConfigurableProviders()) known.add(provider.provider);
    for (const [index, pin] of [...pendingPins]) {
      pendingPins.delete(index);
      if (known.has(pin)) continue;
      ctx.logger.warn(`${name}: bindings[${index}] pins route "${pin}", which no registered or configurable provider declares; the binding matches nothing until that route exists`);
    }
  };
  // Earliest resolvable point: plugin load, when the llm registry is already
  // up; the agent/created listener re-checks for adapters that register later.
  surfaceUnknownPins();
  const registered = new WeakMap<object, RegisteredSections>();
  ctx.on('agent/created', () => surfaceUnknownPins());
  ctx.on('agent/created', createAgentCreatedHandler(bindings, registered));
  ctx.on('agent/pre-step', createPreStepHandler(bindings, registered));
}
