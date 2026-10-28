# AI/ML Audit, October 2026

An audit of Kovrune's AI and ML features at `d559ce4` (harness 0.33.0). It asks three things:

1. Do the features meet the requirements in [`m1-plan.md`](m1-plan.md#acceptance) and [design §1.6](design.md#16-success-metrics)?
2. Are the answers useful?
3. Does the system work reliably?

It covers the agent loop, retrieval, quote verification, sentence support, the self-review, the model adapters, the open sources and the evaluation harness. Every figure below comes from the committed reports in `eval/results/`, the code at this commit, or a script run against them. No model was run for this audit.

## Verdict

**The research agent meets its measured M1 targets on Qwen3.5-4B, and the trust layer works as designed.** The engineering discipline is unusually strong for a project this size. Every guard is tied to a recorded failure, decisions come with paired counts and p-values, a held-out suite exists, and runs repeat across CPUs with a portable build.

Four things limit how far the results can be trusted:

1. **The default in-browser path has never answered a question end to end.** Every quality figure comes from llama.cpp running GGUF Q4_K_M on a CPU. WebLLM runs a different quantization (MLC q4f16_1 or q4f32_1) on a different runtime.
2. **The evaluation is narrow.** There are 7 documents, most of the questions are single-fact lookups, and the questions were written by the same author who tuned the guards. Libraries of realistic size (hundreds of documents) have never been tested.
3. **Semantic errors are caught by one weak check.** The word-overlap checks pass contradictions such as a wrong month or a misplaced "not". The model's self-review is the only thing that can catch them, and on the recorded runs it caught 2 of the 8 wrong answers that reached it.
4. **The labels are cautious to the point of hiding good answers.** 36 of Qwen3.5-4B's 100 correct answers to answerable field and held-out questions do not get **Quotes found**. Most of them carry the amber "too short to check" label, and 28 of the 30 answers with that label are right.

## 1. Requirements

Gate model Qwen3.5-4B, constrained decoding. Research, unanswerable and pdf figures are from the 0.30.0 runs, which are still current. Field and held-out figures are from the 0.32.0 baselines.

| Requirement | Target | Qwen3.5-4B | Qwen3.5-2B | Met |
| --- | --- | --- | --- | --- |
| Original research set | ≥ 73% | 19/22 (86%) | 17/22 (77%) | ✅ |
| Unanswerable, correct refusals | ≥ 2/3 | 8/8 | **5/8 (63%)** | ✅ 4B / ❌ 2B |
| Valid actions | ≥ 95% | 100% (340/340 field) | 99.8% | ✅ |
| Every correct answer has a verified quote | yes | yes (scoring requires it) | yes | ✅ |
| False reassurance (wrong answers among those labelled **Quotes found**) | < 10% on 4B | field 2/46 (4.3%), held out 0/20, research 1/12 | field 3/40, held out 0/14 | ✅ |
| No hosted inference | network allow-list | holds by construction (adapters, CSP) | | ✅ |
| Browser path works on class 2 | answered task | **not run** ([issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9)) | | ⏳ |
| Usability, 3 of 5 users | | **not run** | | ⏳ |
| Time to first answer < 15 min | class 1 | about 7 min for a three-source question on class 1 (4B) | | ✅ (one observation) |

**Qwen3.5-2B is below the refusal target.** It is the model the app suggests on devices with 8 GB or less, and it answered 3 of 8 unanswerable questions. On the field and held-out suites, 13 of its 41 "too short to check" answers are wrong. The gate covers only 4B, but in practice 2B is the model many class 1 users will run. The app should say that 2B gives answers that need more checking. One option is to require the self-review for every 2B answer, short ones included.

## 2. Findings

Ordered by impact on users. Each finding gives the evidence and a fix.

### F1. High: the browser path has no quality measurement

All quality and false-reassurance figures come from `llama.cpp fae9ac5` on CPU. The browser path uses WebLLM (`src/models/webllm.ts`) with different weights (MLC q4f16_1, or q4f32_1 on GPUs without `shader-f16`), different kernels and a different grammar engine (XGrammar `json_object` with a schema, rather than llama.cpp's `json_schema`). The project already showed that a different llama.cpp build changes 20 of 58 tasks ([field README](../eval/field/README.md#runs-repeat-on-one-machine-not-across-machines)), so a different runtime and quantization cannot be assumed to match.

**Fix:** run `bench:browser` on the field and held-out suites on any real-GPU machine before claiming the browser path in M1 acceptance. It does not have to be class 2: a desktop GPU still tells whether WebLLM's constrained decoding and the q4f16 weights hold the 4B figures. Record it as its own report.

### F2. High: the word checks pass contradictions, and the self-review rarely catches them

`sentenceSupport` (`src/agent/support.ts`) counts a sentence as backed when it shares at least half its content words with the verified quotes. Its two extra rules catch less than they appear to:

- **The negation rule applies across all quotes.** If any quote says "not", every sentence may say "not". Checked with a script against the code:
  - Source: "Version 2.x did not support encryption at rest."
  - Answer: "LumenDB 3.0 does not support encryption at rest."
  - Result: the sentence is backed and the label is **Quotes found** (before the review).
- **Only digits are checked as values.** "LumenDB 3.0 was released in May 2024" is backed by a quote saying "March 2024". Month names, weekdays, units ("GB" against "MB") and named entities pass unchecked.

That leaves the self-review (`src/agent/review.ts`) as the only semantic check. On the recorded runs it is precise but has low recall:

| Run | Wrong answers the word checks passed | Caught by review | Right answers flagged by review |
| --- | --- | --- | --- |
| 4B field + held out (0.32.0) | 3 | 1 ("partly") | 0 of 64 |
| 2B field + held out (0.32.0) | 4 | 1 ("no") | 0 of 51 |
| 4B research (0.30.0) | 1 | 0 | 0 of 11 |

**The review fails open.** `labelledQuotesFound` gives **Quotes found** when the review returns nothing (an unreadable reply, a server error, or a thinking model that spends its 16 tokens inside `<think>`). A failed check then reads the same as a passed one.

**Fixes, cheapest first:**
- Make the review fail closed: no verdict means the "not confirmed" label, not **Quotes found**. A unit test can cover it, and it cannot change a benchmark answer.
- Scope the negation rule to the quote that backs the sentence: require the negating quote to share most of the sentence's content words, rather than accepting any negating quote.
- Add a value check for month names and units, as `numberCheck` does for digits.
- Make the review prompt more specific: list each number, date, name and condition of the answer and ask whether each is in a passage. The field README already proposes this. Judge it by re-reviewing the recorded answers, which takes one short call per answer rather than a full re-run.

### F3. Medium: the stemmer gives different stems for singular and plural of some words

`stem()` in `src/tools/search.ts` strips one suffix with a lazy match, so these pairs get different stems:

| Word | Stem | Plural | Stem |
| --- | --- | --- | --- |
| setting | `sett` | settings | `setting` |
| string | `str` | strings | `string` |
| warning | `warn` | warnings | `warning` |
| embedding | `embedd` | embeddings | `embedding` |
| speed | `spe` | speeds | `speed` |

A question with "setting" does not find a document that says "Settings". This is checked: the query "Where is the setting?" ranks a document with "Open Settings…" below one with "setting". Also, "note" and "notes" both stem to `not`, which is not a search stop word, so a "not" in a query matches every "note".

**A naive fix regresses retrieval.** Stripping the plural "s" first and then the suffix was tried for this audit and then reverted. It fixed the pairs above, but cited-document retrieval on the field suite fell from 97.4% to 96.1% (`f23` lost its second document), and one `tests/retrieval.test.ts` floor failed.

**Fix:** a proper fix needs care, for example a small Porter-style ordering or a lookup that keeps `-ing` nouns whole. Judge it under the defect-fix rule, with `bench:retrieval` first.

### F4. Medium: the context window is trusted, not checked

- **The server's context size is never checked.** For the local server, the context size is a number the user types (`ServerStep.tsx`), with 2048 as the only lower bound. llama.cpp reports its real per-slot context at `GET /props` (`n_ctx`). If the user types 8192 while the server runs `-c 4096`, or the server runs several slots (`-np`), which divide the context between them, the agent plans for a context the server does not have. Long tasks then fail with a server error partway through.
- **The token estimate is an assumption.** `estimateTokens` counts 3.5 characters a token. Code, URLs and Markdown tables, which are common in the user guide, use more tokens a character. No context overflow appears in the recorded runs, but nobody measured how much margin is left.
- **Dropped context is not recorded.** `fitToContext` silently replaces old tool results, including the document text the model will quote. Small models then quote from memory, which is the misquote pattern seen in the live checks. Reports do not record when this happens.

**Fixes:**
- Read `/props` on connect and warn when its context differs from the setting.
- Record the actual `promptTokens` of each call, and the number of results dropped, in `CallRecord` and the reports.
- Use `finish_reason === "length"` to detect cut-off replies, as well as the usage count. Usage is missing on some servers.

### F5. Medium: the evaluation is too narrow to predict real use

The project already discloses most of these points. Together they bound what the figures mean:

- **Library size.** The field suite has 7 documents. BM25 over chunks returns the top 3 hits. With hundreds of PDFs, similar chunks from other documents will push answer passages out of the top 3. There is no test of this.
- **Task mix.** Most questions are lookups of one fact. Two-document questions are the weakest kind: both models fail `f23` and `f84`. There are few of them, and they are the questions users with several documents will ask.
- **Who wrote the questions.** One author wrote the questions, the tasks and the guards, and most field documents are Kovrune's own docs. The held-out suite reduces tuning to the suite but has the same author and documents.
- **Unanswerable questions.** The unanswerable suite is 8 synthetic questions. On the field suite, unanswerable questions with a nearby number (`f23`, `f77`) still draw an answer.
- **Scoring.** Facts are scored by substring (`eval/harness/scoring.ts`). No recorded pass depends on this: every English fact that matched only inside a longer word was a stem chosen on purpose ("author" for "authors"). But a short number fact can match inside a longer one ("8 GB" inside "128 GB"), and an answer that hedges ("30 or 60 days") passes.

**Fixes:**
- Add a scale test: run `bench:retrieval` with 100 to 300 distractor documents added to the field library (for example public-domain texts or more Wikipedia leads). It needs no model and shows how retrieval degrades.
- Write more two-document questions, by a second author if one can be found.
- Match number facts on word boundaries.
- Add the usability testers' documents as local tasks, as `eval/field/README.md` already plans.

### F6. Low: the labels hide many correct answers

Here is what users would see, by label, on the 0.32.0 field and held-out runs:

| Label | 4B right | 4B wrong | 2B right | 2B wrong |
| --- | --- | --- | --- | --- |
| Quotes found | 64 | 2 | 51 | 3 |
| Quotes found, answer too short to check | **28** | 2 | 28 | 13 |
| k of n sentences backed | 8 | 1 | 4 | 3 |
| Answer not confirmed (review) | 0 | 1 | 0 | 1 |
| Some or all quotes not found, or no quotes | 0 | 2 | 0 | 10 |
| Not found in your sources | 14 | 4 | 9 | 4 |

On 4B the amber "too short to check" label is on 30 answers, and 28 of them are right. Warnings that are wrong this often teach users to ignore warnings.

**Fix:** send short answers through the self-review too. The answer is short, so the review prompt is cheap. Label them **Quotes found** on "yes" and keep amber otherwise. This can be measured by re-reviewing the recorded answers, and judged by the rule for label changes.

There are also 4 wrong "not found" results on each model: answerable questions that were refused. They are less dangerous than false reassurance, but they cost usefulness. Count them in the reports alongside false reassurance.

### F7. Low: reliability gaps outside the agent loop

- **No timeouts.** `LocalEndpointModel.generate` and `getJson` have no timeout. A server or source that hangs keeps the question waiting until the user presses Stop.
- **No retry on 429.** OpenAlex rate limits (HTTP 429) are reported but never retried. One retry after the `Retry-After` delay would turn most of them into results.
- **The time estimate is too low.** The self-check's estimate (`maxResearchTaskMinutes`) leaves out the translation calls (one per search per document language in another script) and the review call.
- **The search index is rebuilt for every question.** `ResearchLibrary` is built anew for each question (`ResearchPanel.tsx`), although its comment says "once, for many questions". This is fine at current library sizes, but the cost grows with the library (see F5).
- **A doc comment is misplaced.** In `src/agent/research.ts`, the comment for `textFor` sits above the `languages` getter.
- **Prompt injection is contained but not prevented.** A document that contains instructions can steer the answer, and its quotes will still verify, because they are real. The read-only tool set limits the harm to the answer itself. Showing the cited document next to each quote, which the app already does, is the right defence. Mention this in the user guide's privacy and trust section.

## 3. What works well

These should be kept as they are:

- **Constrained decoding with document-ID enums.** Citations cannot be invented under constrained decoding, and valid actions are 100% on 4B.
- **Verification against exactly what the model read.** Open-source text is cached for the question, cited-but-unread documents are fetched for the check, and matching uses whole words, handles ellipses with a negation guard, normalizes Markdown, and shows a closest-passage diff.
- **Guards that are each justified by a recorded failure.** The repeat, last-step, read-before-answer, documents-first and language guards are each measured, and their costs (calls and seconds) are recorded.
- **Statistical honesty.** The project reports Wilson intervals and McNemar tests, uses a held-out suite, compares runs only on the same machine or with a portable build, and has a written rule for adopting changes.
- **Resumable tasks.** Fingerprint-checked replay means an interrupted question never mixes a saved reply with a conversation that has changed.

## 4. Priorities

| # | Action | Effort | Needs a model run | Status |
| --- | --- | --- | --- | --- |
| 1 | Make the self-review fail closed (F2) | Small | No | Done in #80 |
| 2 | Read `n_ctx` from `/props` on connect; detect cut-offs from `finish_reason` (F4) | Small | No | `/props` in #80; `finish_reason` in harness 0.36.0 |
| 3 | Run the browser benchmark on a real GPU (F1) | Medium | Yes | Open: needs a machine with a GPU |
| 4 | Run the self-review on short answers; make the review prompt more specific (F2, F6) | Medium | Re-review only | Short answers in #80, limited to Qwen3.5-4B in #81; its run, and the prompt, are open |
| 5 | Scale test for retrieval with distractor documents (F5) | Small | No | Done in #80 |
| 6 | Stemmer fix, judged under the defect-fix rule (F3) | Medium | Yes | Open: needs runs of both models |
| 7 | Scope the negation rule to its quote; check month names and units (F2) | Medium | Re-scoring only | Harness 0.36.0, with `bench:rescore` |
| 8 | Record prompt tokens and dropped results per call (F4) | Small | No | Harness 0.36.0 |
| 9 | Timeouts, and one retry on 429 (F7) | Small | No | Harness 0.36.0 |
| 10 | Tell 2B users their answers need more checking (§1) | Small | No | Harness 0.36.0 |

The smaller F7 items are done too: the self-check's time estimate includes the review call, the misplaced comment in `research.ts` is fixed, and the user guide says what a document written to steer the model can and cannot do.

## How this audit was done

- Read `src/agent/`, `src/tools/`, `src/documents/`, `src/models/`, `src/sources/`, `eval/harness/`, and the plans and results docs.
- Ran `npm test` (318 passed) and `npm run typecheck` (clean).
- Re-analysed `field-0.32-baseline-*` and `field-0.30-guard-*` for each model:
  - label against correctness;
  - review verdict against correctness;
  - stop reasons and valid actions;
  - facts that match only as substrings.
- Ran the stemmer, sentence-support and evidence functions on the cases above.
- Ran `bench:retrieval` before and after a trial stemmer change, then reverted the change.

## Follow-up audit, at `927742b` (harness 0.36.0)

A second pass, after the fixes in #80 to #82. It checks those fixes and looks for what the first audit missed. As before, no model was run. Everything below comes from the code, the committed reports, `bench:retrieval`, `bench:rescore`, and scripts run against the functions named.

### Verdict

**The AI/ML features are coherent, and in good shape for what they have been measured on: lookups of one fact, with Qwen3.5-4B on llama.cpp.** The app and the benchmark run one code path. One function (`labelledQuotesFound`) decides the label for the app's trace and for `bench:rescore`. Every guard and label rule is tied to a recorded failure. The fixes from the first audit are in place and tested:

- the review fails closed;
- the negation rule is scoped to its quote;
- months and units are checked;
- cut-offs are detected from `finish_reason`;
- `/props` is read on connect;
- requests time out, and a 429 gets one retry;
- 2B users see a caution.

`npm test` passes (339 tests) and `npm run typecheck` is clean.

Three things are still unproven. Users will meet all three:

1. **The browser path** (F1). It is still unmeasured.
2. **Questions that need more than one passage.** They are the weakest kind, and the suites hardly test them (N2).
3. **The 4B short-answer review.** It shipped in 0.34.0 without the run that the project's own rule asks for. The field README says so. The predicted cost is small (at worst 3 of 67 wrong among answers labelled **Quotes found** on the field suite), but it is still a prediction.

### New findings

**N1. High: two adopted changes still wait for their runs.** The browser benchmark (F1) has not been run. The 4B short-answer review was adopted before its run, against the [rule for label changes](../eval/field/README.md#rule-for-prompt-and-guard-changes). Both runs need a model and nothing else. Until they are done, the README's label descriptions are predictions, not measurements.

**N2. Medium: the headline figures describe lookups.** In the 0.32.0 field and held-out runs, 104 of the 126 tasks are lookups. The other questions do much worse:

| Kind | 4B | 2B |
| --- | --- | --- |
| Lookup | 97/104 (93%) | 80/104 (77%) |
| Multi-hop and comparison | **3/7** | **3/7** |
| Unanswerable | 14/15 | 9/15 |

Seven tasks are too few to put a number on. Still, the agent's design limits it on these questions: 8 calls, a read guard after every search, 3 search results, and 2,400 characters for each read. That design fits single-passage lookups. The README's "86%" is from the original research set, which is also mostly lookups. **Fix:** write 15 to 20 two-document and comparison questions, by a second author if possible. Report them as their own row, so a change that helps lookups but hurts synthesis shows up.

**N3. Medium: an elided quote can say the opposite of its source and still verify.** `containsElided` blocks only a skipped negation word. Checked against the self-check documents:

- Source: "Cobble is released under the Business Source License 1.1, and each release converts to the Apache-2.0 license four years after…"
- Quote: "Cobble is released under ... the Apache-2.0 license"
- Answer: "Cobble is released under the Apache-2.0 license."
- Result: the quote is verified, the sentence is backed, and the word checks give **Quotes found**.

Only the review stands in the way. It does see the skipped text, because `quoteContext` spans the whole passage. Elided quotes are rare: 1 of about 400 quotes in the 0.30.0 and 0.32.0 runs, and that one was harmless. Still, "every quote is word for word in your documents" is not true of these quotes. **Fix:** do not verify an elision that skips a number, or a capitalised word missing from the quote, or more than about 80 characters. The recorded runs hold only one elided quote, so `bench:rescore` can measure the cost.

**N4. Low: chunk part labels are indexed as search words.** A chunk's title is "Handbook (part 4 of 12)", and titles are counted twice. So "part", "4" and "12" are search terms for every chunk. A question about "Kovrune 4" or "the second part of the plan" ranks `handbook#4` or `handbook#2` second, from the label alone (checked with `DocumentIndex`). With hundreds of long documents, this fills the 3 results with noise for any question that has a small number in it. **Fix:** index the title without the part label. Trying this for this audit left `bench:retrieval` unchanged: 69 of 74 at 0 and at 300 distractors, and research and pdf at 100%. The change was then reverted. It is a defect fix with no measured cost.

**N5. Low: numbers with a decimal comma are read as integers.** `numbers()` removes every comma as a thousands separator. So "1,5 Go" is 15, and the answer "La taille maximale du cache est de 15 Go" is backed by a quote saying "1,5 Go" (checked). The app supports French, German, Spanish, Italian, Portuguese and Dutch, which all write decimals with a comma. **Fix:** treat a comma followed by one or two digits, or by more than three, as a decimal mark.

**N6. Low: a resumed task goes a different way after a cut-off reply.** `ReplayingModel` saves only the text of each reply, not `finish_reason` or usage. On resume, a reply that was cut off reads as merely invalid. The agent then sends the format error instead of "you have more room", and keeps the 512-token limit. The next fingerprint differs, so replay stops and the live model takes over a step early. **Fix:** save `finishReason` (and usage) in `RecordedCall`, and replay them.

**N7. Low: the word checks still pass swapped names and opposite words.** As F2 said, the review is the only guard. Two checked cases:

- "Cobble uses the Mozilla Public License 2.0" is backed by a LumenDB quote.
- "Revenue decreased by 10%" is backed by "revenue increased by 10%".

On the recorded runs, the review caught 2 of the 8 wrong answers it was asked about. The more specific review prompt (priority 4) is still the most valuable change not yet made. It can be judged by re-reviewing recorded answers.

**N8. Low: the answer schema does not limit length.** Cut-offs come from long quotes, and the agent works around them with a retry at 1,024 tokens, which costs a call and context. `final_answer` could set `maxLength` on `quote` (about 300 characters) and `maxItems` on `evidence` (about 4). Constrained decoding would then never produce a reply that does not fit. Before relying on this, check that both grammar engines honour these keywords: llama.cpp's `json_schema` and the XGrammar version in WebLLM. This changes what the model can write, so it needs runs.

**N9. Low: Ollama's context is not checked.** Ollama has no `/props`. It truncates prompts that are longer than its `num_ctx` without saying so, and its default may be smaller than the 4,096 the app plans for. The Ollama path is marked experimental, but the server step should warn about this.

**Still open from the first audit:**

- the stemmer (F3), for example "running" gives `runn` and "used" does not match "use";
- the index is rebuilt for every question (F7);
- facts are scored as substrings (F5). No recorded pass depends on this: the two answers that match only inside a longer number give "21,196.18" for the fact "21,196", which is right.

### Priorities

| # | Action | Effort | Needs a model run |
| --- | --- | --- | --- |
| 1 | Run the 4B short-answer review on field and held out, and the browser benchmark on a GPU (N1, F1) | Medium | Yes |
| 2 | More specific review prompt, judged by re-reviewing recorded answers (N7, F2) | Medium | Re-review only |
| 3 | Write multi-passage questions and report them separately (N2) | Medium | Yes |
| 4 | Tighten elision: no skipped numbers or names, shorter gaps (N3) | Small | Re-scoring only |
| 5 | Index titles without part labels (N4) | Small | No (retrieval unchanged) |
| 6 | Decimal commas (N5); replay `finishReason` (N6); Ollama warning (N9) | Small | No |

**Done in harness 0.37.0:** N3, N4, N5 and N6 ([field README](../eval/field/README.md#elided-quotes-part-labels-decimal-commas-and-resumed-cut-offs-0370)). N3 differs from the fix proposed above. A quote that leaves out more than five words in one place is still found, but backs no sentence. Rejecting it outright would have failed the right answer to r01. Re-scoring all 52 reports changes no label, and search results are unchanged.

**Done in harness 0.38.0:** N9 (Ollama's context is read after the model test, with a warning when Ollama doesn't say), and the "note"/"not" collision from F3 ("not" and "no" are search stop words). The rest of F3, a stemmer whose forms of a word all meet, measured worse on retrieval with 3 results and waits for model runs ([field README](../eval/field/README.md#ollamas-context-and-not-in-searches-0380)).
| 7 | Length limits in the answer schema (N8) | Small | Yes |
