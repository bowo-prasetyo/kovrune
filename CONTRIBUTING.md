# Contributing to Kovrune

One way of working, for every contributor, person or agent. It exists because Kovrune's promise is measured: an answer labelled **Backed by quotes** must rarely be wrong ([`design.md` §1.6](docs/design.md#16-success-metrics)), and a change that isn't measured can break that silently.

## Kinds of change

| Kind | Examples | Needs |
| --- | --- | --- |
| **Model-facing** | Anything that can change what the model is shown, which answers pass, or how they are labelled: `src/agent/`, `src/tools/`, `src/documents/`, `src/sources/`, `src/models/`, `eval/harness/`, a suite's tasks | A harness bump, a changelog row and a measurement ([below](#changes-to-what-the-model-is-shown)) |
| **Defect fix** in model-facing code | A word that doesn't match its own plural; a document that can't be found by its name | The same, judged by the defect-fix clause in [`eval/field/README.md`](eval/field/README.md#rule-for-prompt-and-guard-changes), with a unit test that fails before the fix |
| **App, docs, tests, CI** | The app's screens (`src/app/`), the user guide, the CI files | Tests and typecheck |

CI's **Way of working** check (`scripts/way-of-working.ts`) decides from the changed paths which kind a pull request is, and fails a model-facing one that lacks any of the three. If you think it has misjudged a change, say why in the pull request; don't work around the check.

## Changes to what the model is shown

1. **Bump `HARNESS_VERSION`** in `eval/harness/benchmark.ts`, so results recorded before and after the change are never mixed. A change merged from `main` that took your number takes the next one.
2. **Add the version's row** to the changelog table at the end of [`docs/m0-benchmark.md`](docs/m0-benchmark.md): what changed, and what it did to the results.
3. **Measure it**, by the rule in [`eval/field/README.md`](eval/field/README.md#rule-for-prompt-and-guard-changes), with the cheapest tool that settles it:
   - **`npm run bench:replay -- --base main <recorded runs>`**: which recorded tasks the change can affect, with no model. When every replayable task is the same, that is the measurement; say how many were undecidable and why.
   - **`npm run bench:retrieval`**: search and chunking, with no model.
   - **A model run** on Qwen3.5-2B and Qwen3.5-4B, on the suites the rule names and the held-out suite, compared with `npm run bench:compare`: tasks gained and lost, p, and false reassurance before and after.

   Write it under **Measurement** in the pull request description, or commit the recorded run under `eval/results/`. A change that alters a label must report false reassurance before and after, and a rise is the project owner's decision.
   - **A measurement still to come is not one.** CI fails a Measurement section or changelog row that says "not yet measured", "measurement pending" or the like. Measure the change first, or split off the part that can't be measured yet.
   - **The label rules** (`src/agent/support.ts`, `evidence.ts`, `review.ts`, `crosscheck.ts`, `completeness.ts` and the field checks they call) need a false reassurance figure in the Measurement section. `npm run bench:rescore -- <recorded runs>` gives it without a model, and `npm run bench:baseline` gives it for every suite.
   - **Code that nothing calls** isn't merged into model-facing paths: it can't be measured. Bring it with the change that uses it.
4. **Don't tune on what you report.** Held-out suites are read as totals only. A rule fitted to the examples that justify it, such as a list of header names, needs a case in a suite it was not written for before it is called an improvement.

## Every change

- `npm run typecheck` and `npm test` pass. A new behaviour has a test that fails without it.
- Words people see are plain and short. When the app's wording changes, the [user guide](docs/user-guide.md) and the [README](README.md) change with it.
- Each commit is one step, with a message that says what changed and why. Squash fix-ups before review.
- Claims stay measured ([`design.md` §1.2](docs/design.md#12-core-principles)): don't call a model, browser or feature supported, or a change an improvement, until it has been tested under documented conditions.

## Where things are

Product code is in `src/`; the benchmark in `eval/` imports it, so results measure the code the app runs. The design and roadmap are in [`docs/design.md`](docs/design.md), and the current quality work is in [`docs/p0-research-quality.md`](docs/p0-research-quality.md). Security reports go by [`SECURITY.md`](SECURITY.md).
