# P0 — Strengthen Research Quality and Trustworthiness

This package hardens the evidence and evaluation loop before adding new product surface area. It builds on Kovrune's existing quote verification, answer review, report completeness checks, benchmark suites, and browser benchmark.

## Scope

### 1. Accuracy metrics must not reward substring coincidences

Evaluation facts often contain short numbers, acronyms, units, or names. A substring check can incorrectly score `4` as present in `14`, `MPL` in `AMPL`, or `born` in `unborn`. The evaluation harness now uses case-insensitive, Unicode-normalized phrase matching with alphanumeric token boundaries. Punctuation remains significant, so decimals and version identifiers stay distinguishable.

The matcher is applied to report-section keyword/fact scoring. The existing retrieval recall metric is deliberately kept unchanged for now: its published per-suite floors were calibrated with the prior normalizer, and changing that scale requires a separate baseline review rather than silently lowering regression gates. Neither change affects production answer labels.

### 2. Research accuracy and evidence

Keep the current independent checks: verbatim quote verification, sentence support, answer review, and model-specific completeness checks. Do not collapse them into a single confidence score. Report each failure class separately:

- retrieval miss (the needed source or passage was not surfaced);
- unsupported or contradicted answer sentence;
- incomplete multi-part answer;
- citation/quote mismatch;
- correct abstention versus false reassurance.

Use held-out tasks for release comparisons. Do not tune a guard against the same examples used to claim its improvement.

### 3. Report intelligence

Use the report suite's expected-section coverage and factual correctness as separate measures. A plan that mentions a section is not proof that the final answer covers it. Track unmatched sections, incorrect sections labelled `Quotes found`, fallbacks, and cost/time as separate dimensions. The evaluation matcher rejects partial-token coincidences in both section keywords and facts.

### 4. Retrieval at realistic library sizes

Run the deterministic retrieval benchmark at baseline and with 100, 300, and 1,000 generated distractor documents:

```sh
npm run bench:retrieval
npm run bench:retrieval -- --distractors 100
npm run bench:retrieval -- --distractors 300
npm run bench:retrieval -- --distractors 1000
```

Record document recall, passage recall, and complete-task count per suite. Compare top-3 with top-5/top-10 before changing the production default. Do not introduce embeddings or hybrid retrieval unless the benchmark shows a repeatable improvement on held-out tasks without regressing precision or latency.

### 5. Browser runtime validation

The browser benchmark records runtime, exact model ID, context length, hardware class, browser/GPU/device metadata, model-load time, self-check, task results, and timings. A local-server result is not a substitute for a WebLLM result: quantization, kernels, browser memory pressure, and GPU support differ.

For the class-2 confirmation run:

1. Run the full research, unanswerable, and PDF suites on a 16 GB machine using the pinned WebLLM Qwen3.5-4B candidate.
2. Record browser/OS, CPU/GPU, device memory, cross-origin isolation, model ID, runtime, context, load time, decode/prefill speed, median task time, and all task results.
3. Repeat once after a clean reload; report both runs rather than selecting the better one.
4. Run the same model family through the local-server adapter when possible, and compare quality separately from speed.
5. Keep the browser path marked *unvalidated* on hardware classes without a completed report.

Start the runner with `npm run bench:browser`, open its local page, choose WebLLM, the pinned Qwen3.5-4B model, class 2, Full, Research + Unanswerable + PDF, and both decoding modes. The benchmark JSON is the source of truth. A quick preset or partial task-ID run is diagnostic only, not a release gate.

## Acceptance criteria

- [ ] Report evaluation phrase matching has boundary regression tests for short numbers, acronyms, names, decimals, and Unicode compatibility forms.
- [ ] Research and PDF retrieval floors remain green; field/domain retrieval is reported separately.
- [ ] 100/300/1,000-distractor runs are captured and compared before changing retrieval strategy or result limits.
- [ ] Report plan coverage, final factual coverage, unmatched sections, and false reassurance are reported separately.
- [ ] Browser class-2 validation uses a full run, records the complete environment/model identity, and is repeated after a clean reload.
- [ ] No model/runtime is described as production-ready solely because it loads or passes a tool self-check.

## Non-goals

This P0 does not add a coding agent, collaboration/circles, cloud inference, telemetry, or a new vector database. It does not weaken quote verification or use an LLM judge as the only correctness signal.

## Implementation notes: source coverage and scientific tables

The report planner now runs a separate deterministic retrieval check for every generated section and attaches the initial result to the plan. The plan screen names documents whose passages surfaced, and explicitly says when no passage surfaced. This is a retrieval diagnostic only: a hit does not establish that the source answers the question, and no hit is not proof that the answer is absent. Editing a question removes its match from the visible snapshot rather than presenting stale coverage as current.

Office/OpenDocument table extraction also recognizes a small, explicit set of conventional two-column scientific headers (for example, `Parameter | Value`, `Analyte | Concentration`, and `Dose | Response`). It labels subsequent values with their column names while leaving arbitrary two-column label/value tables unchanged.

The remaining safeguards are deliberately model- and evidence-aware rather than enabled by assumption:

- Multi-document research already has a topic-by-topic search/read path and a read-before-answer guard. Keep it covered by multi-passage and multi-document held-out tasks.
- Retrieval remains deterministic BM25 with domain-specific name/abbreviation expansion. Do not change the production result limit or introduce embeddings until the 100/300/1,000-distractor recall, precision, and latency runs justify it.
- Contradiction detection currently uses lexical/negation evidence and has known limits around implicit denials and different conditions or time points. Broader detection needs held-out tests for those cases before it can safely change answer labels.
- Completeness checking remains enabled only for models whose measured behavior justifies it; enabling a weaker checker can reject correct answers.
- Table interpretation remains bounded by extraction fidelity: a header-aware row is easier to read, but extracted text is not a substitute for inspecting a chart or a scanned table when the source layout is ambiguous.

These changes improve visibility and a narrow, deterministic part of scientific table interpretation; they do not claim that all six P0 areas have passed their release gates.

## Measured (harness 0.110.0)

The two changes above were merged without a measurement. This section adds it, as [`CONTRIBUTING.md`](../CONTRIBUTING.md) now requires of every model-facing change.

### The plan screen's source check, judged by outcome

A hint is worth its space only if it tells sections that will fail from sections that won't; being visible says nothing. `npm run bench:plancoverage` takes recorded report runs, works out the check again for each planned question (it is deterministic), and counts each written section's result by the hint it got (`predictFromCoverage` in `eval/harness/report-score.ts`). From 0.110.0, `bench:report` records the hint with each plan and prints the same count.

Over the ten recorded report runs (harness 0.51.0 to 0.55.0, Qwen3.5-2B and 4B, 297 written sections, 81 of them matched to an expected section):

| Hint | Open reports: sections, right | Held-out reports: sections, right |
| --- | --- | --- |
| No passage surfaced | 0 | 0 |
| A passage in the document the facts are in | 48, 19 right (40%) | 19, 19 right (100%) |
| Passages only in other documents | 1, 0 right | 13, 4 right (31%) |

- **The warning never fires.** In a seven-document library, some passage always surfaces, so "no matching passage surfaced" was shown for none of 297 sections. Feeding uncovered sections back to the planner, the follow-up the audit suggested, would act on none of them.
- **The positive message doesn't predict success on the open reports.** 29 of the 48 sections whose hint names the right document fail anyway: report mode's failures are in reading and answering, not in finding the document. Nor does the share of the question's words found (`coverage`) sort them: sections whose best match covers under 40% of the question's words are right 18 of 39 times, 40–60% 15 of 26, 60–80% 6 of 13, and above 80% 3 of 3.
- **The held-out split looks better** (19 of 19 against 4 of 13), but it rests on 32 sections, and the reader can't see which listed document is "the expected one", so it doesn't reach them as a signal.
- **Caveats:** the hint is worked out on today's code for answers recorded at 0.51.0–0.55.0. No run since then has used the report suite.

**Decision for the owner:** this does not count as P0 progress. Either drop the hint, or keep it and measure a version that could fail. For example, show it only for a section whose best match covers less than a set share of its words, with the threshold chosen on the open reports and checked on the held-out ones.

### Two-column scientific table headers

`npm run bench:replay -- --base cb92369 --head 77d5c08` over the latest recorded run of every suite (12 reports): 430 of 454 tasks make the same requests of the model, 0 differ, and 24 can't be decided. The same 24 can't be decided when the code before the change is replayed against itself, so that is older recording drift, not this change. **No suite document has one of the 20 header pairs**, so the rule changes nothing that is measured. It is a list fitted to its own examples, and it needs a case in a suite before it is called an improvement.
