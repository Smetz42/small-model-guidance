# Design notes

Rationale behind the settled semantics, for agents working in this repo.

## Why creation-time conditioning plus pre-step reconciliation

Prompt assembly runs **before** the `agent/pre-step` waterfall of a step
(`agent-loop`'s `preStep()` assembles first, then dispatches the waterfall),
so a section first registered during a pre-step always misses that step's
request. The tracer bullet originally registered only from pre-step and could
never satisfy "the first request carries the guidance". The plugin therefore
conditions twice:

- `agent/created` puts the sections in place before the agent's first assemble;
- `agent/pre-step` reconciles each step, so a mid-session model switch replaces
  the sections — the switch takes effect on the step after the one that notices,
  which is exactly the "replaces the section on the next pre-step" contract.

The two listeners share one registration `WeakMap`: section names are unique
per scope, so two listeners with independent bookkeeping would race duplicate
registrations and throw.

## Why the additive baseline (ADR-0001 recap)

A fresh install must have proven value without authoring: `includeBaseline`
defaults true, shipping the qwen3.8-27b run_code guidance as an ordinary
binding ordered before operator bindings. Additive means an operator override
is an edit, not a replacement: bindings stack, and the byte-identical collapse
makes the common template flow — copy the baseline into an operator binding,
then edit — safe. Snapshot pins hold the baseline text verbatim so accidental
wording drift fails CI, and the shipped binding carries no route pin because a
published artifact must not name deployment-local routes.

## Why identical-collapse, and why byte-identical only

Match-exclusivity (first match wins) was rejected: genuinely different texts
from different bindings are legitimate to stack, and exclusivity would make
the template flow silently drop guidance. Collapse catches exactly the
double-injection hazard — the same text twice — with no fuzzy matching to
explain or tune. Byte-identical is the honest boundary: normalizing
whitespace or case would silently merge texts an operator wrote to differ.

## Why warnings, not throws, for unresolvable route pins

Route pins name the provider registry, which the plugin can read
(`listProviders` + `listConfigurableProviders`), so an unknown pin surfaces at
the earliest resolvable point: load, re-checked at the first agent creation
for adapters that register after the plugin. It warns once, naming the binding
index and the pin, rather than throwing, because a configurable route can
still activate later through settings — failing loud would forbid that flow.
Model ids are provider runtime registries with no enumeration API; an id no
agent ever carries simply never matches, and the harness surfaces unknown
models when an agent tries to use one. Guidance errs toward silence at
runtime and toward loudness at load.
