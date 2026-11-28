## Summary

<!-- What changes for the user, and why. -->

## Kind of change

<!-- Tick one. CONTRIBUTING.md says what each needs. -->

- [ ] **Model-facing:** changes what the model is shown, which answers pass, or how they are labelled (`src/agent`, `src/tools`, `src/documents`, `src/sources`, `src/models`, `eval/harness`, suite tasks). Needs a harness bump, a changelog row in `docs/m0-benchmark.md`, and the measurement below. CI checks all three.
- [ ] **Defect fix** in model-facing code, shown by a unit test that fails before and passes after. Same three, judged by the defect-fix clause in `eval/field/README.md`.
- [ ] **App, docs, tests or CI only.** No harness bump or measurement needed.

## Measurement

<!--
Model-facing changes only. How it was measured, by the rule in eval/field/README.md:
- bench:replay against the base: tasks same / differ / undecidable, per report;
- or bench:retrieval figures before and after, for search and chunking;
- or a model run on Qwen3.5-2B and Qwen3.5-4B: suites, paired counts (gained / lost) and p from bench:compare,
  false reassurance before and after, and the held-out totals.
Say what decided it, and anything not measured.
A measurement still to come ("not yet measured", "pending") fails CI: measure first, or split it off.
A change to the label rules (src/agent/support.ts, evidence.ts, review.ts and the checks they call) gives
false reassurance before and after; bench:rescore gives it without a model.
-->

## Checks

- [ ] `npm run typecheck` and `npm test` pass
- [ ] User-facing wording changed? `docs/user-guide.md` and the README match
- [ ] One commit per step, each message saying what changed and why
