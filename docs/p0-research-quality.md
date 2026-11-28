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

Run the deterministic retrieval benchmark at baseline and in a larger library: every suite's real documents together, and the field suite also with 100, 300 and 1,000 generated documents. `bench:retrieval:scale` does all of it in one table ([recorded comparison](#retrieval-in-a-larger-library-recorded-comparison-28-november-2026)):

```sh
npm run bench:retrieval                       # each suite in its own library
npm run bench:retrieval:scale                 # the same suites in a larger library
npm run bench:retrieval:scale -- --limit 5    # and with more results
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

## Continuous measurement

Every pull request's CI writes one table per result limit (3, the app's; 5; 10) to its job summary: `npm run bench:retrieval:scale` (`eval/retrieval-scale.ts`). Each real-document suite is searched in its own library, then in one library holding every suite's documents (87 distinct real documents), as a researcher's mixed library would be. The field suite is also searched with 100, 300 and 1,000 generated documents added. The figures are diagnostics, not new gates: the retrieval floors in `npm test` still decide, and model-dependent quality and false reassurance still need paired model runs under [the contributor measurement rule](../CONTRIBUTING.md#changes-to-what-the-model-is-shown).

The report-plan coverage diagnostic is different: `npm run bench:plancoverage -- <report-run>.json [...]` needs recorded report runs, so it is not a CI step. It compares the plan's hints with how the written sections turned out ([below](#the-plan-screens-source-check-judged-by-outcome)).

### Retrieval in a larger library: recorded comparison (28 November 2026)

At the app's 3 results:

| Suite | Own library: documents, passages, complete | In all 87 real documents | Tasks lost |
| --- | --- | --- | --- |
| field | 98.7%, 93.3%, 70 of 74 | 97.4%, 93.3%, 70 of 74 | 0 |
| field, also 100 generated | | 92.2%, 88.8%, 66 of 74 | 4 |
| field, also 300 generated | | 89.6%, 87.6%, 65 of 74 | 5 |
| field, also 1,000 generated | | 88.3%, 86.5%, 65 of 74 | 5 |
| office | 100%, 95.2%, 18 of 19 | 100%, 95.2%, 18 of 19 | 0 |
| clinical | 100%, 90.7%, 26 of 30 | 100%, 88.4%, 25 of 30 | 1 |
| engineering | 100%, 100%, 32 of 32 | unchanged | 0 |
| physics | 100%, 95.6%, 31 of 33 | unchanged | 0 |
| math | 100%, 100%, 34 of 34 | unchanged | 0 |
| cs | 97.2%, 82.2%, 27 of 34 | 97.2%, 84.4%, 26 of 34 | 1 |
| lab | 97.6%, 94.5%, 39 of 40 | 97.6%, 90.9%, 38 of 40 | 1 |
| chem | 98%, 94%, 46 of 49 | 98%, 91%, 44 of 49 | 2 |
| socsci | 100%, 87.7%, 39 of 44 | unchanged | 0 |
| materials | 100%, 94%, 52 of 56 | 98.2%, 90.4%, 48 of 56 | 4 |

- **Real neighbours compete; generated ones barely do.** With every suite's real documents in one library, 9 of 445 tasks lose a cited document or answer passage that search found in their own library. The losses are where fields share vocabulary: materials (4), chemistry (2), laboratory, clinical and computer science (1 each). Generated documents cost the field suite 4 tasks at 100 and only 5 at 1,000, so they measure volume poorly. The real-document library is the better yardstick, and the reason the suites' documents are pooled.
- **More results recover most of it, in search alone.** At 5 results the pooled library loses 5 of 445 tasks, and the own libraries find more too (materials 55 of 56, field 73 of 74). This is not a reason to change the default: when 5 results were tried with the models, Qwen3.5-4B's field suite gained one task and Qwen3.5-2B's lost two ([field README](../eval/field/README.md#five-search-results)). A smaller model reads less of what it is shown. Any change to the limit is judged by model runs, not by this table.
- **Not measured:** questions in another writing system than their documents (search translates them with the model), and libraries larger than 87 real documents.

## Acceptance criteria

- [x] Report evaluation phrase matching has boundary regression tests for short numbers, acronyms, names, decimals, and Unicode compatibility forms (`tests/eval-matching.test.ts`, #213).
- [x] Research and PDF retrieval floors remain green; field/domain retrieval is reported separately (`tests/retrieval.test.ts`; `bench:retrieval` and `bench:retrieval:scale` report each suite apart).
- [x] 100/300/1,000-distractor runs are captured and compared before changing retrieval strategy or result limits ([recorded comparison](#retrieval-in-a-larger-library-recorded-comparison-28-november-2026), with every suite's real documents as well; in each pull request's CI summary).
- [x] Report plan coverage, final factual coverage, unmatched sections, and false reassurance are reported separately (`bench:report` summary; the plan hint against section results since 0.110.0).
- [ ] Browser class-2 validation uses a full run, records the complete environment/model identity, and is repeated after a clean reload. **Open: waits on a class 2 tester ([bowo-prasetyo/kovrune#9](https://github.com/bowo-prasetyo/kovrune/issues/9)).**
- [x] No model/runtime is described as production-ready solely because it loads or passes a tool self-check (the README and design call the browser path experimental and unmeasured on class 2; standing rule, re-checked at each release).

## Non-goals

This P0 does not add a coding agent, collaboration/circles, cloud inference, telemetry, or a new vector database. It does not weaken quote verification or use an LLM judge as the only correctness signal.

## Implementation notes: source coverage and scientific tables

### Claim-level evidence provenance

`AnswerSentence.claims` now exposes each independently stated clause alongside the verified quote(s) that lexically match it. A clause is attributed to a source only when that source alone shares at least 60% of the clause's content words; words from separate documents are never pooled to manufacture one source attribution. At most three matching quotes are returned per clause, in descending lexical match order.

This provenance is intentionally advisory. It does not replace the semantic checks for negation, dates, units, direction, named entities, scientific properties or contradictions, and it does not itself change the answer verdict. The sentence-level verdict remains the result of the existing independent checks. A regression test uses two claims supported by two different documents and asserts that each claim points to its own source.


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


## Trustworthiness hardening (harness 0.112.0)

The first implementation slice adds `src/agent/trustworthiness.ts` and deterministic regression tests:

- **Semantic contradictions:** the production answer-support path now checks explicit opposing predicates (direction, presence, significance, polarity and effect). It is deliberately conservative: the topic must overlap, explicit quantities must match, and recognized time/group/in-vitro scopes must be identical. The exact passage already quoted by the answer is not treated as independent contradiction evidence. A conflict is surfaced through the existing contradiction path, so it prevents a reassuring answer label. It does not detect implicit paraphrases or establish which source is correct.
- **Multi-document reconciliation:** `reconcileClaims` groups structured claims only when subject, predicate and explicit condition agree, and reports different values with their source IDs. It does not collapse different populations, time points or conditions into one result.
- **Claim-level evidence:** `assessClaimEvidence` checks a claim against one source at a time, including quantities and explicit polarity. It does not pool words across sources and labels its result as a provenance assessment, not entailment.
- **Independent numerical checks:** `verifyArithmetic` recomputes sums, differences, ratios and percentage changes from supplied operands, rejects incompatible units for additive operations, and uses an explicit numerical tolerance. It does not perform general dimensional analysis or unit conversion; callers must supply normalized, compatible inputs.
- **Report completeness:** `reportSectionState` distinguishes not researched, no evidence, insufficient evidence, contradictory evidence and evidence-backed sections. A plan or retrieval hit alone cannot make a section complete.
- **Scientific tables:** `interpretScientificTable` preserves the mapping from each value to its header and parses a numeric value/unit only when the cell explicitly contains one. It does not infer omitted headers, missing cells or ambiguous visual layout.
- **Mixed-library retrieval:** `summarizeMixedLibrary` reports both macro-average suite results and task-weighted pooled results, preventing large suites from hiding a weak specialist domain.

These helpers establish explicit contracts for the next integrations; the report state, arithmetic, structured reconciliation, table interpretation and mixed-suite summary are not yet wired into every production workflow. The existing BM25 scale benchmark remains the production retrieval regression; this slice does not change ranking or the default result limit.

### Measurement and release gate

- Deterministic tests cover opposite directions, significance, different time points, different quantities/topics, quoted-passage exclusion, source reconciliation, claim polarity/quantity, arithmetic, report states, table columns and macro-vs-pooled retrieval.
- The new semantic check can change an answer's contradiction verdict. Before treating it as an improvement or enabling broader predicate families, run `bench:rescore --labels` on the recorded reports and paired Qwen3.5-2B/4B open plus held-out suites under `CONTRIBUTING.md`. Report right answers rejected, wrong answers still labelled, and false reassurance separately.
- Open risks: non-English polarity, implicit contradictions, statistical qualifiers, causation vs association, population mismatch, unit conversion, and table extraction fidelity. These require held-out examples before production expansion.
