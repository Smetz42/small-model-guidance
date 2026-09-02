# Guidance ships as an additive baseline with identical-collapse multi-match

The plugin ships its qwen3.8-27b tool-call-leak guidance as a built-in **baseline binding** (includeBaseline, default true) beside operator-authored bindings, rather than requiring operators to author the text themselves: a fresh install has proven value, and extending means adding bindings without restating the baseline.

When multiple guidance bindings match one agent, all inject in deterministic order and byte-identical resolved text collapses to a single section. Match-exclusivity was rejected because the common template flow — copying the baseline into an operator binding and editing it — must not silently double-inject, while genuinely different texts from different bindings are legitimate to stack. Collapsing only byte-identical text keeps that distinction exact without fuzzy matching.
