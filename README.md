# small-model-guidance

Model-scoped guidance sections for the DeepSeek Harness system prompt — a standalone DSH plugin bundle. When the serving route or model matches a configured **guidance binding**, the plugin contributes an agent-scoped **guidance section** to the system prompt; a shipped, snapshot-pinned **baseline binding** covers the qwen3.8-27b tool-call leak out of the box.

**Status:** the approved ticket chain lives in the repo's GitHub Issues. Working agreements in [AGENTS.md](AGENTS.md); vocabulary in [CONTEXT.md](CONTEXT.md); design rationale in [docs/agents/design-notes.md](docs/agents/design-notes.md).

## Install

```
dsh plugin --profile <name> add Smetz42/small-model-guidance
```

Verified against the real install path (dsh 0.1.1-rc.2, pnpm 11.7):

1. The CLI initializes the profile on first use and forwards to pnpm in the profile directory.
2. A git-hosted bundle builds on install through its `prepare` script; pnpm blocks that build until the package is allowlisted. Follow the exact `allowBuilds` key pnpm prints: add it under `allowBuilds` in the profile's `pnpm-workspace.yaml`, then re-run the add.
3. The CLI reconciles the profile's `dsh.profile.bundles` layer list, and the installed bundle's `cordis.patch.yml` mounts the plugin.

Zero config then works: the shipped baseline binding injects the qwen3.8-27b run_code tool-call protocol guidance (see `src/config.ts` `BASELINE_TEXT`, pinned verbatim by tests). npm publishing stays a deliberate later act; once published, `dsh plugin --profile <name> add small-model-guidance` resolves from the registry.

## Model experience

- **Nothing matches: zero model-visible tokens.** A non-matching agent gets no section registered at all — nothing enters the assembled prompt, on any request.
- **One or more bindings match: a static section on every request.** Matching texts enter the system prompt as sections ordered just below the tool-guidance band (order 90). Per-request cost is the matched text plus one blank-line separator each; the baseline runs a few hundred tokens. The text never varies across requests, so it caches like any static prefix content.
- **Multi-match semantics: inject-all, listed order, identical-collapse.** Every matching binding contributes a section, in the order the bindings are listed. Bindings whose text is byte-identical collapse to one section — copying the baseline into an operator binding as an editing template is safe.
- **Model switches replace the section on the next pre-step.** Prompt assembly precedes the pre-step waterfall, so the step that notices a mid-session model switch still carries the previous section; the following step carries the replacement.

## Operator-scoped mounting

**Mount where the guidance is true.** The bundle patch is written for profiles whose tool contract the guidance states truthfully — code-mode profiles where `run_code` is the direct tool surface. The plugin contributes whatever it is configured with, wherever it is mounted; it performs no mode detection.

## Configuration

```yaml
small-model-guidance:
  includeBaseline: true   # shipped qwen3.8-27b baseline binding; orders before yours
  bindings:
    - models: [qwen3.8-27b]     # exact model ids; one text serves all listed ids
      # route: gumdrop          # optional provider-route pin; omit to follow the model
      text: |
        Your guidance text.
```

- **Fail loud at load:** an empty model list, empty text, or a wrong-shape binding throws at plugin load, naming the offending binding.
- **Fail toward silence at runtime:** missing provider or model identity never matches, so an agent without identity carries no guidance.
- **Route pins surface, not silently miss:** a pin that no registered or configurable provider declares warns at load — naming the binding and the pin — and re-checks at the first agent creation (for adapters that register later). A route may still activate later through settings, so this warns rather than throws.
- **Model ids are runtime registries.** The plugin cannot enumerate a provider's models at load; an id no agent ever carries simply never matches. The harness itself surfaces unknown model ids when an agent tries to use one.

## Sections

Each matching binding contributes one named section (`small-model-guidance`, then `small-model-guidance:2`, `:3`, ... in listed order). Same-named sections in one scope collide, so the plugin reconciles: it keeps a section whose text is unchanged, disposes and re-registers on change, and unwinds everything with the agent's scope.
