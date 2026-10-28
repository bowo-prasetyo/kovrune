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
