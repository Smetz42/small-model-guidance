# small-model-guidance

A standalone DeepSeek Harness plugin bundle that injects model-scoped guidance sections into the system prompt when the serving route or model matches a configured guidance binding.

## Language

**Guidance binding**:
The configuration unit pairing the models it targets with the text to inject: a list of model ids, an optional provider route, and the section text. One text serves every listed model; a present route pins the binding to that endpoint's behavior, an absent route follows the model anywhere it is served.
_Avoid_: rule, trigger, directive

**Guidance section**:
The system-prompt section a matching guidance binding contributes, ordered just below the tool-guidance band so it amends the tool contract without restating it.
_Avoid_: injection, context, note

**Baseline binding**:
The shipped, snapshot-pinned guidance binding enabled by default; it binds the qwen3.8-27b model id with no route pin and is the proven-value template for operators.
_Avoid_: default binding, preset

**Runtime context**:
The per-assembly durable history snapshot surface other harness plugins contribute; guidance never uses it — guidance text is static prompt content, not changing state.
_Avoid_: context injection (when naming guidance)

**Operator-scoped mounting**:
The rule that the bundle patch is mounted only in deployments whose tool contract the guidance text states truthfully (code-mode profiles); the plugin contributes whatever it is configured with, wherever it is mounted.
_Avoid_: auto-detection, mode detection
