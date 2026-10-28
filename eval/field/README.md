# Field suite

Questions over real documents ([issue #35](https://github.com/bowo-prasetyo/kovrune/issues/35)). The research, unanswerable and pdf suites use a synthetic corpus; their results have not changed since harness 0.7.0, while the prompt and guard changes since then were driven by three live questions. The field suite gives those changes something real to be judged on.

```bash
npm run bench:endpoint -- --model <model> --suites field --modes constrained --out eval/results/<name>.json
```

It is reported as its own suite and is not part of the gate's evaluation set, so M0 comparisons stay valid.

## Rule for prompt and guard changes

Before a change to the research prompt or the guards (repeat, last-step, read-before-search, documents-first) is merged, it must **improve the field suite without regressing** the research, unanswerable and pdf suites, on Qwen3.5-2B and Qwen3.5-4B. A change that only fixes a live check is not enough.

A change to search or chunking is measured first with `npm run bench:retrieval`, which takes seconds and needs no model (see [Retrieval](#retrieval)), and then by the same rule.

Since harness 0.27.0, the baseline and the change are also run on the [held-out suite](#held-out-suite) (`--suites field,research,unanswerable,pdf,holdout`), and compared with `npm run bench:compare -- <baseline>.json <change>.json`:
- **The held-out suite must not fall in total.** Its tasks are not looked at one by one while a change is developed, so it says whether a change carries over to questions it was not written for.
- **Every decision states its paired counts and p-value** (tasks gained, tasks lost, and the chance of a split that uneven if the change did nothing). [None of the recorded decisions](#how-sure-the-decisions-were) is below 0.25, so the rule still decides by direction, not by significance; the counts say how little a decision of one or two tasks rests on.

## Retrieval

Task success measures search, reading and answering together. `npm run bench:retrieval` measures search alone: for each answerable task, it searches with the question as the query, as the app's search tool does, and counts:
- **cited documents found:** for each citation group, whether one of its documents is among the results;
- **answer passages found:** for each fact group, whether the text of a result (the passage the model sees a snippet of and reads next) contains one of its spellings. This stands in for marking the passage that answers by hand.

The model writes its own queries, so this is a fixed yardstick for search, not a prediction of what the agent finds. Questions in another writing system than their documents (`f37`–`f39`, `f41`) are counted apart: search translates them with the model, which this measure does not run. `tests/retrieval.test.ts` keeps the figures at least where they are.

| Search | Research (19) | PDF (4) | Field (35): documents | Field: answer passages | Field: everything found |
| --- | --- | --- | --- | --- | --- |
| **3 results (the app, harness 0.26.0)** | 100% | 100% | 94.4% | 81.8% | 30 |
| 5 results, measured and run, [not adopted](#five-search-results) | 100% | 100% | 97.2% | 88.6% | 32 |
| 3 results with consistent stems and the parts of joined words, measured and run, [not adopted](#search-ranking) | 100% | 100% | 97.2% | 88.6% | 32 |
| At most one passage per document, 3 results, measured, not adopted | 100% | 100% | 97.2% | 81.8% | 30 |

- **The synthetic suites cannot tell search changes apart:** every variant finds everything there. Only the field suite's long, real documents do.
- **Some misses are where the false reassurance is.** With 3 results, search misses an answer passage of `f06`, `f13`, `f17`, `f23` and `f45`. The wrong answers to `f13` and `f17` were labelled **Quotes found**: the passage that answers was not among the results, and the model answered from the ones that were, with real quotes. `f23` is different: its top result holds both the 30-day cure period and the 60-day clause the models answered with, so that error is in reading. What search misses there is the other half of the question, the design document's statement of Kovrune's licence.
- **Five results find the answer passages for `f06` and `f23` and one of `f13`'s two facts.** On the benchmark, 4B's field suite improved by one task and 2B's fell by two, so it was [not adopted](#five-search-results): what search finds is not what a small model reads.
- **One passage per document finds one more cited document (`f23`'s design document) and no more answer passages:** in the field library the answer is often the second-best passage of the best document, which this hides.

## How sure the decisions were

`npm run bench:compare` pairs two runs task by task. Tasks with the same result in both say nothing about a change; the ones that pass in only one run decide it, and the exact McNemar test gives the chance of a split at least as uneven as theirs if the change did nothing. Over the recorded decisions, on the field suite:

| Decision | Model | Field before → after | Gained | Lost | p |
| --- | --- | --- | --- | --- | --- |
| 0.15.0 Markdown marks in quotes, adopted | 2B | 15 → 17 of 24 | 2 | 0 | 0.50 |
| | 4B | 19 → 20 of 24 | 1 | 0 | 1 |
| 0.17.0 full-sentence answers, not adopted | 2B | 16 → 18 of 24 | 2 | 0 | 0.50 |
| | 4B | 20 → 17 of 24 | 0 | 3 | 0.25 |
| 0.20.0 read before "not found", adopted (baseline on another CPU) | 2B | 25 → 25 of 36 | 0 | 0 | 1 |
| | 4B | 31 → 32 of 36 | 1 | 0 | 1 |
| 0.24.0 search translates, adopted | 2B | 27 → 30 of 42 | 8 | 5 | 0.58 |
| | 4B | 34 → 37 of 42 | 3 | 0 | 0.25 |
| 0.25.0 same-alphabet translation, not adopted (`f01`–`f42`) | 2B | 30 → 30 of 42 | 1 | 1 | 1 |
| | 4B | 37 → 36 of 42 | 0 | 1 | 1 |
| 0.26.0 five search results, not adopted | 2B | 35 → 33 of 47 | 1 | 3 | 0.63 |
| | 4B | 40 → 41 of 47 | 2 | 1 | 1 |

- **No decision is below 0.25.** With one to three tasks changing, none could be: it takes six tasks gained and none lost to go below 0.05. So each decision is a reasonable bet on its direction, not a measured improvement.
- **0.24.0 has the most behind it:** on the six questions across languages it was written for, 4B gained 3 and lost none, and 2B gained 4 and lost 1. Over all field tasks the 2B split is 8 to 5, because the other 36 tasks gained 4 and lost 4.
- **What this changes:** decisions keep the rule's direction test, now with their paired counts, and are confirmed on the held-out suite, so that a change is also judged on questions it was not written for.

## Held-out suite

Each guard and prompt change since 0.15.0 was written for a field task that failed, then judged on the same suite, so the field suite now flatters the changes made on it. `eval/field/holdout.ts` adds 16 questions over the same seven documents, in the field suite's mix: lookups in each document, a two-document question, questions in Japanese, Chinese and French, and two the documents do not answer. Their facts are checked against the documents by `tests/field.test.ts`, as the field suite's are.

To stay held out, they are used one way only: a change developed on the field suite is confirmed on them, by their totals. The benchmark prints no result for them as they run, and `bench:compare` gives them only as counts; their reports name each task, for the record, but are not read task by task while developing.

First runs, harness 0.27.0, on the machine of the 0.26.0 runs (constrained, native llama.cpp `fae9ac5`, Intel Xeon @ 2.30GHz):

| Model | Held out | Field, 0.26.0 baseline | Quotes found, wrong (held out) | Report |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B | 15/16, 94% (72–99%) | 40/47, 85% (72–93%) | 0 of 8 | [json](../results/holdout-0.27-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 10/16, 63% (39–82%) | 35/47, 74% (60–85%) | 1 of 9 | [json](../results/holdout-0.27-qwen3.5-2b-q4km.json) |

- **The intervals overlap:** with 16 tasks, the held-out suite cannot tell either model's rate apart from its field rate. It is a check that a change does not fall on new questions, not a second, finer measure.
- **They are new questions written after the field suite, not a random sample of one pool:** 13 of the 16 are lookups, so the two suites' rates are not expected to match.

## Results

Constrained mode, 4,096-token context, the committed tasks only. Each run also includes the research, unanswerable and pdf suites, so a later change has a current baseline for those suites too. All runs used native llama.cpp (`d854d98`) on CPU in a 4-core cloud container, with the same Q4_K_M files the class 1 laptop uses. The 0.16.0 to 0.21.0 runs used llama.cpp built with `-DGGML_NATIVE=ON`. The CPUs, as the reports record them: Intel Xeon @ 2.80GHz for 0.16.0 to 0.19.0, 0.24.0 and 0.25.0; Intel Xeon @ 2.10GHz for 0.20.0 and 0.21.0; Intel Xeon @ 2.30GHz, with llama.cpp `fae9ac5` built with `-DGGML_NATIVE=ON`, for 0.26.0 and later. So the 0.20.0 change was judged against a baseline on another CPU; on 4B, 30 of the 36 field tasks and 21 of the 22 research tasks still took the same actions. Speeds do not carry over to other machines, and neither do individual task results: see [below](#runs-repeat-on-one-machine-not-across-machines).

| Model | Harness | Field | Research | Unanswerable | PDF | Quotes found, wrong (field) | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-2B | 0.14.0 | 15/24 (63%) | 15/22 | 5/8 | 3/4 | 2 of 13 | [json](../results/field-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.15.0 | **17/24 (71%)** | 15/22 | 5/8 | 3/4 | 3 of 16 | [json](../results/field-fix-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.16.0 | 16/24 (67%) | 16/22 | 5/8 | 3/4 | 2 of 8 | [json](../results/field-0.16-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.17.0, not adopted | 18/24 (75%) | 16/22 | 5/8 | 3/4 | 0 of 8 | [json](../results/full-sentences-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.19.0 | 25/36 (69%): 16/24 and 9/12 in other languages | 16/22 | 5/8 | 3/4 | 2 of 11 | [json](../results/field-0.19-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.20.0 | 25/36 (69%) | 16/22 | 5/8 | 3/4 | 2 of 11 | [json](../results/field-0.20-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.24.0 tasks, before the change | 27/42 (64%): 25/36 and 2/6 across languages | not run | not run | not run | 2 of 14 | [json](../results/field-0.24-baseline-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.24.0 | **30/42 (71%)**: 25/36 and 5/6 across languages | not run | not run | not run | 4 of 16 | [json](../results/field-0.24-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.25.0 tasks, before the change | 33/47 (70%): 30/42 and 3/5 in the same alphabet | not run | not run | not run | 4 of 16 | [json](../results/field-0.25-baseline-new-tasks-qwen3.5-2b-q4km.json) (`f43`–`f47`; the others are the 0.24.0 run) |
| Qwen3.5-2B | 0.25.0, same-alphabet translation, not adopted | 32/47 (68%): 30/42 and 2/5 | not run | not run | not run | 4 of 15 | [json](../results/field-0.25-same-script-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.25.0, same-alphabet translation of matches with half the terms, not adopted | 31/47 (66%): 29/42 and 2/5 | not run | not run | not run | 2 of 14 | [json](../results/field-0.25-same-script-coverage-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.26.0 | 35/47 (74%) | 15/22 | 5/8 | 3/4 | 2 of 16 | [json](../results/field-0.26-baseline-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.26.0, five search results, not adopted | 33/47 (70%) | 15/22 | 5/8 | 3/4 | 2 of 13 | [json](../results/field-0.26-five-results-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.28.0, the model checks its answer | 35/47 (74%) | 15/22 | 5/8 | 3/4 | 2 of 16 | [json](../results/field-0.28-review-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.28.0, portable llama.cpp build | 32/47 (68%) | 17/22 | 5/8 | 3/4 | 2 of 17 | [json](../results/field-0.29-baseline-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.29.0, search ranking, not adopted | 33/47 (70%) | 17/22 | 5/8 | 3/4 | 1 of 15 | [json](../results/field-0.29-ranking-qwen3.5-2b-q4km.json) |
| Qwen3.5-4B | 0.14.0 | 19/24 (79%) | 18/22 | 8/8 | 4/4 | 3 of 17 | [json](../results/field-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.15.0 | **20/24 (83%)** | 18/22 | 8/8 | 4/4 | 3 of 18 | [json](../results/field-fix-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.16.0 | 20/24 (83%) | 19/22 | 8/8 | 3/4 | 3 of 14 | [json](../results/field-0.16-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.17.0, not adopted | 17/24 (71%) | 20/22 | 8/8 | 4/4 | 3 of 15 | [json](../results/full-sentences-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.19.0 | 31/36 (86%): 20/24 and 11/12 in other languages | 19/22 | 8/8 | 3/4 | 2 of 17 | [json](../results/field-0.19-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.20.0 | **32/36 (89%)** | 19/22 | 8/8 | **4/4** | 2 of 18 | [json](../results/field-0.20-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.21.0 | 32/36 (89%) | 19/22 | 8/8 | 4/4 | 2 of 18 | [json](../results/field-0.21-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.24.0 tasks, before the change | 34/42 (81%): 32/36 and 2/6 across languages | not run | not run | not run | 2 of 20 | [json](../results/field-0.24-baseline-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.24.0 | **37/42 (88%)**: 32/36 and 5/6 across languages | not run | not run | not run | 2 of 20 | [json](../results/field-0.24-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.25.0 tasks, before the change | 41/47 (87%): 37/42 and 4/5 in the same alphabet | not run | not run | not run | 2 of 22 | [json](../results/field-0.25-baseline-new-tasks-qwen3.5-4b-q4km.json) (`f43`–`f47`; the others are the 0.24.0 run) |
| Qwen3.5-4B | 0.25.0, same-alphabet translation, not adopted | 41/47 (87%): 36/42 and 5/5 | not run | not run | not run | 2 of 21 | [json](../results/field-0.25-same-script-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.25.0, same-alphabet translation of matches with half the terms, not adopted | 41/47 (87%): 37/42 and 4/5 | not run | not run | not run | 2 of 21 | [json](../results/field-0.25-same-script-coverage-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.26.0 | 40/47 (85%) | 19/22 | 8/8 | 4/4 | 2 of 22 | [json](../results/field-0.26-baseline-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.26.0, five search results, not adopted | 41/47 (87%) | 19/22 | 8/8 | 4/4 | 0 of 19 | [json](../results/field-0.26-five-results-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.28.0, the model checks its answer | 40/47 (85%) | 19/22 | 8/8 | 4/4 | **1 of 21** | [json](../results/field-0.28-review-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.28.0, portable llama.cpp build | 40/47 (85%) | 19/22 | 8/8 | 4/4 | 2 of 20 | [json](../results/field-0.29-baseline-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.29.0, search ranking, not adopted | 42/47 (89%) | 19/22 | 8/8 | 3/4 | 1 of 20 | [json](../results/field-0.29-ranking-qwen3.5-4b-q4km.json) |

**The first change judged on the suite: Markdown marks in quotes (harness 0.15.0).** In the 0.14.0 runs, the right answers to `f01` (2B) and `f12` (both models) failed only on the quote check. The sources say "called **Apps on device**" and "labelled **Quotes found**", and the models quoted them without the asterisks. Users add Markdown files too, so the app showed **Quotes not found** for real quotes. Quote matching now ignores `*`, `**`, `__` and backticks.
- **The field suite improves:** 2B goes from 15 to 17, and 4B from 19 to 20.
- **No regressions:** research, unanswerable and pdf are unchanged.
- **The runs are repeatable:** in the re-runs, every one of the 58 tasks took the same actions as before, for both models. Only the quote verdicts changed.
- **One side effect:** 2B's wrong answer to `f02` ("Apps on device", the permission that *is* needed) now has a found quote, so it counts as false reassurance. The label is accurate, because the quote is real, but it is not reassuring.

**A change judged on the suite and not adopted: full-sentence answers (0.17.0).** Since 0.16.0, an answer too short to compare with its quotes ("LumenDB 3.2", "40") is not labelled **Quotes found**. The research prompt was changed to ask for "a full sentence that names what the question asks about, for example "The museum opened in 1998." rather than "1998"", so that the sentence check could judge every answer.
- **It worked as meant:** no 4B answer was too short to judge (15 before), and 10 more right 4B answers were labelled **Quotes found**.
- **4B false reassurance rose**, from 3 of 26 (12%) to 5 of 36 (14%), over all suites. The two new ones are the kinds the sentence check cannot catch. `r04` gives one of the two fixed versions, as a full sentence its quote backs. `r12` cites a related document.
- **4B's field suite fell from 20 to 17.** In `f19` and `f06` the model now concluded "not found" without reading the document that answers. In `f07` it restated the question's premise as fact: "The keyboard shortcut to stop a running question in Kovrune is Ctrl+C."
- **2B improved:** field from 16 to 18, false reassurance from 3 of 19 to 0 of 20.
- **Not adopted:** the field suite regressed on 4B, which fails the [rule](#rule-for-prompt-and-guard-changes). The prompt is unchanged from 0.16.0.

**Documents in other languages (0.19.0).** Harness 0.18.0 made search, quote checks and chunking work in any script. The suite now has three Wikipedia leads in Japanese (富士山), Chinese (长城) and French (Tour Eiffel), with 12 tasks asked in each document's language. Each document has a nearby wrong number, and one question its lead does not answer.

| Task | 2B | 4B | What went wrong |
| --- | --- | --- | --- |
| `f28-fuji-last-eruption` | ❌ | ✅ | 2B answered "1936年", the year of the national park, with a real quote |
| `f30-wall-length` | ✅ | ❌ | 4B said the length is not given, from the search snippets, without reading part 2 where it is |
| `f32-wall-visitors` | ❌ | ✅ | 2B answered "43,721处", the number of wall sites, with a real quote |
| `f33-eiffel-height` | ❌ | ✅ | 2B's answer (330 m) was right, but its quote left out the pronunciation "[tuʁɛfɛl]" without marking the gap, so it is not word for word |

- **Both models handle the new languages about as well as English:** 4B passes 11 of the 12 tasks, and 2B 9.
- **No false reassurance:** of the 7 answers labelled **Quotes found**, none is wrong. 2B's two wrong answers to unanswerable questions are numbers too short to judge, so they read **Quotes found, answer too short to check** (0.16.0).
- **Most right answers are short too** ("3776.12 m", "2013年"), so only 4 of 4B's 11 right answers read **Quotes found**.
- **4B sometimes answers in English** when it finds nothing ("The provided documents do not contain information about…" for a Japanese question).
- **The 24 earlier tasks:** the new documents change the search statistics of the field library. Their results are the same on both models (20/24 and 16/24), but 3 tasks for 4B and 2 for 2B took other actions. One of them changed label: 4B's `f13` now says "not found" instead of a wrong answer labelled **Quotes found**. That is why 4B's false reassurance over all suites falls from 3 of 26 to 2 of 29; the label rule did not change.
- **The other suites** use their own documents, and both models repeated the 0.16.0 baseline exactly.

**A guard judged on the suite: read before "not found" (0.20.0).** Both models sometimes concluded that the documents did not answer a question from a search's snippets alone, without reading the document that had the answer (`f30` in 0.19.0, `f19` and `f06` in the 0.17.0 experiment). Now `final_answer` with `"found": false` is sent back once, while the last search's results are unread, asking the model to read what the search found. It may still conclude "not found" after reading, and the last step is never sent back.
- **4B improves**, from 61 to 63 of 70 tasks. `f30` (the wall's length) and `p04` (the PDF's audit cost and reporter) now pass, after reading the part that answers.
- **2B is unchanged:** the guard fired on 6 tasks, and each kept its result.
- **No regressions on either model.** The guard fired on 13 of 4B's tasks, including 6 unanswerable questions. After reading, 4B still said "not found" on all of them, which is the risk a guard like this carries. Tasks where the guard did not fire took the same actions as in 0.19.0 (57 of 57 for 4B, 64 of 64 for 2B).
- **Cost:** about one more model call on the tasks where it fires, 0.3 more calls per task on average for 4B and 0.2 for 2B.
- **Against the rule:** the field suite improves on 4B and is unchanged on 2B, and nothing regresses. Adopted.

**A guard for the reply's language (0.21.0).** 4B answered the Japanese question `f28` in English: "The provided documents do not contain information about…". Now `final_answer` is sent back once when the answer is in another writing system than the question (Latin, Chinese or Japanese, Korean, Cyrillic, Greek, Arabic, Hebrew, Devanagari, Thai). The model is asked to answer in the question's language and keep the quotes as they are. Answers too short to judge, such as "3776.12 m", are not checked.
- **`f28` is now answered in Japanese**, still correctly "not found". The model was sent back twice: first to read (0.20.0), then for the language.
- **Nothing else changed:** on 4B, the other 69 tasks took the same actions as in 0.20.0. 2B was not re-run. Checked against its 0.20.0 report, none of its 76 final answers would be sent back, so its run would repeat 0.20.0.
- **Limit:** writing systems, not languages, are compared, so an English answer to a French question passes. Telling them apart needs a language detector.
- **Languages in Latin script (0.23.0):** the guard now also compares English, French, German, Spanish, Italian, Portuguese and Dutch, by their function words (`src/documents/languages.ts`). A language is named only for a text with at least 3 of its function words and twice as many as any other language's, so short answers ("330 mètres") and mixed ones are not judged. All four French questions read as French and 45 of the 58 English ones as English; the rest are too short to tell, and the check then stays silent. Over the 1,033 final answers in the recorded reports, it would send none back: the models answered every French question in French. So runs are as in 0.21.0, and it guards against a failure not yet seen.

**Short answers in a quote that covers the question (0.22.0).** Most right lookup answers are short ("4 KiB", "1987年"), so since 0.16.0 they read **Quotes found, answer too short to check**. Now a short answer counts as backed when it is word for word in a verified quote, and that quote with its title shares more than two thirds of the question's content words. The question supplies the claim a bare answer does not make. Only the label changes, so re-checking the recorded reports gives the exact effect:

| Rule for a short answer (236 in the 12 reports: 162 right, 74 wrong) | Labelled | Right | Wrong |
| --- | --- | --- | --- |
| In a verified quote | 215 | 157 | 58 |
| In a quote sharing at least half of the question's words | 143 | 124 | 19 |
| **In a quote sharing more than two thirds** (adopted) | 59 | 59 | 0 |

- **Current runs:** false reassurance goes from 2 of 31 to 2 of 36 for 4B (0.21.0), and from 3 of 22 to 3 of 28 for 2B (0.20.0).
- **The answers that gain the label:** "4 KiB", "112 KiB", "about a minute", "defineStore()", "13", "1987年" and "Apps on device", all right.
- **Wrong answers it still refuses:** "40" (another company's head count), "1936年" (a park, not an eruption), "Ctrl+C". The nearest miss is "Cobble" for "Who is the CEO of Harrow Labs?", from a quote naming Harrow Labs, which covers exactly two thirds.
- **Most right short answers still read "too short to check":** the rule labels about a third of them.

**Questions across languages (0.24.0).** Six tasks ask in another language than the document that answers them (`f37`–`f42`): English questions about the Japanese, Chinese and French documents, a Japanese question about the English Ada Lovelace lead, and an English question none answers. Search matches words, so before this change an English query found only English documents, and both models passed 2 of the 6. Those two were `f40`, whose French document shares the word "Eiffel", and the unanswerable `f42`. Three ways were measured on the field suite, against a baseline run of the same tasks; the other suites were not run, because their documents are all in English and none of the three changes anything for them:

| Change | 4B: across languages | 4B: other 36 | 2B: across languages | 2B: other 36 |
| --- | --- | --- | --- | --- |
| None (baseline) | 2/6 | 32/36 | 2/6 | 25/36 |
| A prompt line naming the documents' languages, asking to search in each ([json](../results/field-0.24-prompt-line-qwen3.5-4b-q4km.json)) | 2/6 | 31/36 | not run | not run |
| Sending "not found" back once until each writing system was searched ([4B](../results/field-0.24-guard-qwen3.5-4b-q4km.json), [2B](../results/field-0.24-guard-qwen3.5-2b-q4km.json)) | 3/6 | 32/36 | 2/6 | 25/36 |
| **Search translates the query** (adopted) | **5/6** | 32/36 | **5/6** | 25/36 |

- **Told to search in Japanese or Chinese, neither model does.** With the prompt line or the guard, they searched in English again; only 4B's `f41` (a Japanese question about an English document) gained from the guard.
- **So search translates.** For each document language written in another script than the query, the research model translates the search terms in a short call of its own. Search runs again with the translation, and the best match in that language is added to the results: "Found by searching the Japanese documents for "富士山 最高地点"". Languages sharing the query's script are not translated. With documents in one script, nothing changes.
- **`f37`–`f39` now pass on both models**, and 2B's `f41` too. 4B's `f41` still fails: its query misspelled エイダ (Ada) as エイドア, and the translation, "Aida Loveless", found nothing. 2B's `f42` now fails, answered with "1952" from the Japanese document.
- **The other 36 tasks:** 4B keeps all 32 and no other result changes. 2B also keeps 25, but 4 tasks pass that failed and 4 fail that passed: the translated results change what it reads. Its wrong answers labelled **Quotes found** rise from 2 to 4 (`f10`, `f13`, `f24` are new). They are English questions about English documents that 2B has answered wrongly before, now with real quotes.
- **Cost:** about one more model call for each search the translation applies to, two in the field library for an English search. The median field task took 42.8 s instead of 36.7 s on 4B, and 24.4 s instead of 20.6 s on 2B.

**Across languages in the same alphabet (0.25.0, not adopted).** Search translates only into languages written in another script, so an English question about the French Eiffel Tower lead, or a French question about an English document, is searched in its own words. Five tasks test this (`f43`–`f47`): English questions about the French lead, and French questions about the MPL licence and the user guide, worded with few words in common with their answers. Before any change, 4B passed 4 of the 5 and 2B passed 3: English and French share enough words ("Eiffel", "licence", "Apps on device") that a search in the question's words often finds the document. Only `f45`, a French question about the licence's 30-day cure period, failed on both. Two changes were measured on the field suite, against the 0.24.0 run of `f01`–`f42` and a baseline run of the new tasks on the same machine:

| Change | 4B: `f43`–`f47` | 4B: other 42 | 2B: `f43`–`f47` | 2B: other 42 |
| --- | --- | --- | --- | --- |
| None (baseline) | 4/5 | 37/42 | 3/5 | 30/42 |
| Also translating into languages in the query's alphabet, when the question's language is known and differs ([4B](../results/field-0.25-same-script-qwen3.5-4b-q4km.json), [2B](../results/field-0.25-same-script-qwen3.5-2b-q4km.json)) | **5/5** | 36/42 | 2/5 | 30/42 |
| The same, adding a translated match only when it has at least half of the translated terms ([4B](../results/field-0.25-same-script-coverage-qwen3.5-4b-q4km.json), [2B](../results/field-0.25-same-script-coverage-qwen3.5-2b-q4km.json)) | 4/5 | 37/42 | 2/5 | 29/42 |

- **Neither change improves the suite.** 4B's total stays at 41 of 47 with both, and 2B's goes from 33 to 32, then 31. Under the rule above, neither is adopted, and search still translates only across scripts.
- **The translation fixes `f45` on 4B:** with the terms in English, search found §5.2 of the licence, and 4B answered "30 jours". 2B still fails it.
- **But the added match changes what the model reads.** In the field library, French has one document, so for any English question with a known language, the best French match was added, whatever it was about. 4B's `f06` then read the design document instead of the user guide, and answered "not found". 2B's `f46` read the same part of the user guide twice and answered without "Apps on device".
- **Keeping only matches that have most of the translated terms** restores 4B's `f06` and keeps `f45`, but 4B's `f47` now fails its quote check: a right answer, with a misquoted French sentence. The filter also applies across scripts, and 2B's results change on 12 of 47 tasks, 5 gained and 7 lost (`f28` and `f41` among the lost). Like the 0.24.0 change on 2B, this is sensitivity to what it reads, not a pattern a filter could target.
- **False reassurance** stays at 2 for 4B with both changes; for 2B it is 4 of 15 with the first and 2 of 14 with the second, against 4 of 16.
- **Cost:** one more model call per search when the question's language is known. The median field task took 48.2 s and 46.3 s instead of about 43 s on 4B.
- **The tasks stay** (harness 0.25.0, 47 field tasks), as the baseline for a later try.

**Numbers and negations in the sentence check (0.26.0).** A sentence counted as backed when half of its content words were in the verified quotes. "Not" is a stop word and one-digit numbers were dropped, so "The page size is 8 KiB" was backed by "The default page size is 4 KiB", "does not support" by "supports", and "Cobble is ... released under the Apache-2.0 license" verified against "Cobble is not released under…", all labelled **Quotes found**. Now:
- **Each number in a backed sentence must be quoted**, or be in a cited title or the question, or be the sum or difference of two quoted numbers within a factor of ten of each other ("by 30,000" from 180,000 and 150,000, but not 2021 from 2024 and version 3.0). Thousands separators and a list item's own number do not count.
- **A sentence that says "not"** (or "never", "no", and their French, German, Spanish, Italian, Portuguese and Dutch forms) **needs a quote that does.** The reverse, a quote that says "not" behind a sentence that doesn't, is not checked: in `f02` and `f09` the right answers are backed by quotes whose "not" is in another clause, or in the question.
- **A "…" in a quote may not leave out a negation.**
- **A sentence made only of the cited titles' words is not judged**, instead of counting as backed with nothing to compare.

Only the label changes, so the recorded reports were re-checked: of the 981 answers with `"found": true` whose final answer was recorded whole, 557 were labelled **Quotes found** and 39 of those were wrong. Now 555 are, still with 39 wrong. The two that lose the label are right answers to `r19` in the 0.17.0 runs, not adopted, that give Cobble's 290,000 operations per second from no quote. No quote's verdict changes. So the change catches none of the recorded false reassurance: those answers are incomplete (`f10`, `f17`, `f24`), off the question (`f13`) or take a quoted number from the wrong clause (`f23`, "60 days" where the cure period is 30), which a word check cannot see. It guards against wrong numbers and dropped negations, which small models are known for and the recorded runs have not yet shown. The current runs' false reassurance is unchanged.

<a id="five-search-results"></a>**Five search results (0.26.0, not adopted).** With three results, search misses an answer passage of five field tasks that five results find most of ([Retrieval](#retrieval)). Both models were run on all four suites, with three results and then five, on the same machine:

| Model | Field | Research | Unanswerable | PDF | Quotes found, wrong (field) | Same actions as with three |
| --- | --- | --- | --- | --- | --- | --- |
| 4B, three results | 40/47 | 19/22 | 8/8 | 4/4 | 2 of 22 | |
| 4B, five results | **41/47** | 19/22 | 8/8 | 4/4 | **0 of 19** | 54 of 81 tasks |
| 2B, three results | **35/47** | 15/22 | 5/8 | 3/4 | 2 of 16 | |
| 2B, five results | 33/47 | 15/22 | 5/8 | 3/4 | 2 of 13 | 46 of 81 tasks |

- **Where the new results helped, as the measure predicted:** 4B's `f17` read §1.12 of the licence, the fourth result, and listed the GPL, LGPL and AGPL, where with three results it searched twice, read four parts and concluded the licence lists none. 2B's `f06` read the user guide's `-c 4096` command, the fifth result, instead of answering "2048" from the design document.
- **Where they hurt:** the new results are also new distractors. 4B's `f10` read the design document's part 3, the fifth result, and answered "js-libp2p" (production) instead of Trystero (prototype). 2B's `f02` read the user guide's part 1, the fourth result, and answered with the permission that is needed instead of the one that is not. 2B's `f46` read the design document's part 8, the fifth result, after its first result, and concluded "not found" instead of reading the user guide.
- **The rest is sensitivity to a longer search result, not to what it adds:** 2B's `f09` and `r20` were lost and `r17` gained, and 4B's `f07` was gained (a right "not found" instead of "Ctrl+C"), but none of them read a fourth or fifth result. Only 54 of 81 4B tasks and 46 of 81 2B tasks took the same actions.
- **False reassurance falls on 4B,** from 2 of 22 to 0 of 19 on the field suite: `f23` and `f24` are still wrong but no longer labelled **Quotes found**. On 2B it stays at 2 on the field suite and falls from 1 to 0 on research.
- **Cost:** about 270 more prompt tokens per task on 2B and 20 on 4B, which took fewer steps (3.43 model calls per task instead of 3.58). Median task times change by at most 3 seconds in any suite.
- **Against the rule:** the field suite improves on 4B and falls on 2B, so it is not adopted, and search still shows three results. The retrieval measure stays the first check for search changes, but this run shows its limit: a passage that search puts in front of a small model is read only if it looks more relevant than the others, and two more results add two more to choose from. A change that ranks the answer passage higher, rather than showing more, is what the measure would need to see next.

**The model checks its answer (0.28.0).** The recorded false reassurance is answers a word check cannot see through: incomplete (`f24`), off the question (`f13`), a nearby wrong fact (`f10`), or a number from the wrong clause of a real quote (`f23`). Now an answer the word checks would label **Quotes found** goes back to the model in a short call of its own (`src/agent/review.ts`): the question, the answer, and each verified quote in the text around it, asking whether the passages state what the answer says. The reply is constrained to yes, partly or no; only yes keeps the label, and partly or no read **Quotes found, answer not confirmed**.

Both models were run on all five suites, on the machine of the 0.26.0 and 0.27.0 baselines. The check runs after the agent finishes, and all 97 tasks of each model took the same actions as in the baselines, so the labels with and without the check compare the same answers:

| Model | Answers checked | Verdicts | Wrong answers labelled **Quotes found**, without → with the check | Right answers that lose the label | Time per checked answer |
| --- | --- | --- | --- | --- | --- |
| 4B | 45 | 44 yes, 1 partly | 2 → **1** (field), 0 elsewhere | 0 | about 6 s |
| 2B | 39 | 39 yes | 5 → 5 (2 field, 1 research, 1 pdf, 1 held out) | 0 | about 2.5 s |

- **It caught 4B's `f24`,** which names llama.cpp and Ollama as supported without saying Ollama is experimental: "partly".
- **It missed 4B's `f23`:** the passage it was shown holds both the 60 days of the answer and the 30-day cure period, and the model still said yes.
- **2B says yes to everything,** right or wrong. A small model checking its own answer mostly agrees with it, and 2B more than 4B.
- **Against the rule for label changes:** false reassurance falls on 4B and stays on 2B, no right answer loses its label, and the held-out suite's labels are unchanged. Adopted, as a weak check: it costs one short call, only for answers the word checks would label. The prompt was not tuned on `f23`, which the held-out discipline would forbid; a stronger check would ask something more specific (each number or condition of the answer against its passage) and be judged the same way.

<a id="search-ranking"></a>**Search ranking (0.29.0, not adopted).** With three results, the answer passages of `f06`, `f13`, `f17` and `f23` ranked 4th to 6th. The cause was in tokenizing, not in BM25: a bonus for query words that appear in one sentence, tried at five weights, found no more answer passages, and at the higher weights fewer. Two defects did:
- **The stemmer was inconsistent:** it stripped one "s" from words ending in "ss", so "class" gave `clas` and "classes" gave `class`, and `f13`'s "Reference hardware classes" did not match the question's "class".
- **Words joined by "-" or "." were one term:** "llama-server" matched only "llama-server", and titles, which are file names ("kovrune-user-guide.md", or a user's "report.pdf"), matched no query at all.

Keeping a final "s" after another, and indexing each joined word's parts as well, gave three results the retrieval of five: cited documents 94.4% → 97.2%, answer passages 81.8% → 88.6%, everything found for 32 of 35 tasks instead of 30. Research and pdf still found everything; the held-out suite, checked once by its totals, went from 87.5% to 100% of answer passages. No recorded label changed (1,342 answers re-scored). Run on both models, all five suites, against a baseline of `main` on the same llama.cpp build:

| Model | Field | Research | Unanswerable | PDF | Held out | Quotes found, wrong (field) |
| --- | --- | --- | --- | --- | --- | --- |
| 4B, `main` | 40/47 | 19/22 | 8/8 | **4/4** | 15/16 | 2 of 20 |
| 4B, ranking | **42/47** (+2, −0, p 0.50) | 19/22 | 8/8 | 3/4 | 15/16 | 1 of 20 |
| 2B, `main` | 32/47 | 17/22 | 5/8 | 3/4 | **10/16** | 2 of 17 |
| 2B, ranking | **33/47** (+1, −0, p 1) | 17/22 | 5/8 | 3/4 | 9/16 | 1 of 15 |

- **The field suite gains what retrieval predicted:** 4B's `f13` and 2B's `f06`, both answer passages the fix brought into the first three. 4B's `f07` was gained too, as a right "not found".
- **Each model loses one task in a suite the rule protects.** 4B's `p04`: search now shows both documents the question needs at once, and 4B answered from the snippets, "spent EUR on security audits", without reading the report and its 96,000; with the old ranking it was sent back to read first and got the number. 2B lost one held-out task in total.
- **False reassurance moves both ways:** on the field suite it falls on both models, by one answer each; on 4B's research suite it rises from 1 of 12 to 2 of 13.
- **Against the rule:** the field suite improves on both models, but the pdf suite falls on 4B and the held-out suite on 2B, so it is not adopted and search is unchanged. The two defects are real, and the second keeps a user's documents from being found by their file names; a later change can fix them together with what made `p04` answer from snippets (the read-before-answering guards), and be judged the same way.

### Runs repeat on one machine, not across machines

- **On one machine, runs repeat exactly.** Running the 4B baseline and the 0.17.0 change a second time gave the same actions on all 58 tasks, and the same results.
- **Across machines, they differ.** The 0.16.0 baseline used the same llama.cpp commit and model files as the 0.15.0 runs, and the same prompt. Its actions differed on 20 of 58 tasks for 4B and 34 of 58 for 2B. A few results changed: `p04` (4B) now fails, and `r17` (2B) now passes. The likely cause is floating-point differences between CPUs and builds, which change which token wins at temperature 0.
- **So a change is judged against a baseline run on the same machine, never against a report from another one.** One run of each is enough there, but a difference of one or two tasks is still specific to that machine.
- **A portable llama.cpp build may make runs repeat across machines (0.29.0).** The container moved between three CPUs during the 0.29.0 runs, and a llama.cpp built with `-DGGML_NATIVE=ON` on one stopped with an illegal instruction on another. Rebuilt with `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON`, the same 12 tasks (8 field, 4 research, Qwen3.5-2B) took the same actions and gave the same final answers on an Intel Xeon @ 2.80GHz and @ 2.10GHz. Twelve tasks on two CPUs is evidence, not proof; if it holds, a baseline from another machine with this build is comparable, which the native builds never were.
- **A portable run is not comparable with a native one:** the same code with the two builds took the same actions on 30 of 47 field tasks for 4B and 28 of 47 for 2B, and 2B's field suite went from 35 to 32 (the native runs were on a third CPU, so the build is not the only difference). So reports from 0.29.0 on name the build in their notes, and baselines are run with the build of the change.

**What the suite shows that the synthetic suites don't** (0.15.0 failures):

| Task | 2B | 4B | What went wrong |
| --- | --- | --- | --- |
| `f02-not-local-network` | ❌ | ✅ | Answered with the permission that is needed instead of the one that is not |
| `f06-context-flag` | ❌ | ✅ | Said the guide doesn't give the `-c 4096` context size; it is in a code block |
| `f07-stop-shortcut` | ❌ | ✅ | Kovrune has no stop shortcut; 2B answered with llama-server's **Ctrl+C**, with a real quote |
| `f10-signaling` | ❌ | ✅ | Named js-libp2p (production) instead of Trystero (prototype), with a quote it made up |
| `f13-class-1` | ❌ | ❌ | Both models answered "laptops", without the integrated GPU and 8 GB that the design's list of reference hardware classes gives |
| `f17-secondary-licenses` | ✅ | ❌ | 4B said the licence lists no Secondary Licenses; §1.12 names the GPL, LGPL and AGPL |
| `f23-license-and-cure` | ❌ | ❌ | Both models answered **60 days**, from the reinstatement clause in §5.1, instead of the 30-day cure period. Asked about the licence alone (`f15`), both models answer correctly |
| `f24-servers` | ❌ | ❌ | Neither model says Ollama is experimental; 2B says it is not supported, and 4B says it is supported |

- **Distractors work as intended.** The most common failure is a nearby wrong fact backed by a real quote (`f02`, `f07`, `f23`). The app labels most of these answers **Quotes found**: this is the false reassurance problem ([issue #32](https://github.com/bowo-prasetyo/kovrune/issues/32)) on real text.
- **Two-document questions are the weakest kind.** Both models fail `f23` and `f24`, and neither failure appears in the synthetic multi-hop tasks.
- **Unanswerable questions about real documents are mostly refused.** Both models refused the questions about the steering committee's approval date, the euro fine and Ada Lovelace's patent. Only 4B refused the stop shortcut question.

## Committed documents

Frozen copies, so later edits to the originals do not change the suite. All seven may be committed under their licences.

| Document | Kind | Source | Licence |
| --- | --- | --- | --- |
| `kovrune-user-guide.md` | How-to manual, Markdown, 15 KB | `docs/user-guide.md` at commit `aeeb5e9` | MPL-2.0 |
| `kovrune-design-r3.pdf` | Long report, 18-page PDF | `docs/design.md` (revision 3) at commit `aeeb5e9`, converted with LibreOffice as plain text | MPL-2.0 |
| `mpl-2.0.txt` | Legal text | The Mozilla Public License 2.0 (`LICENSE`) | The licence text itself may be copied verbatim |
| `ada-lovelace-lead.txt` | Encyclopedia article | Lead of the English Wikipedia article [Ada Lovelace](https://en.wikipedia.org/wiki/Ada_Lovelace), as read on 25 October 2026, reference markers removed (also `tests/fixtures/`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `mount-fuji-ja-lead.txt` | Encyclopedia article in Japanese | Lead of the Japanese Wikipedia article [富士山](https://ja.wikipedia.org/wiki/%E5%AF%8C%E5%A3%AB%E5%B1%B1), revision 111513999 (25 October 2026), as plain text from the MediaWiki API | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `great-wall-zh-lead.txt` | Encyclopedia article in Chinese | Lead of the Chinese Wikipedia article [长城](https://zh.wikipedia.org/wiki/%E9%95%BF%E5%9F%8E), revision 94640681 (29 September 2026), in Simplified Chinese (`zh-cn`), as plain text from the MediaWiki API | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `eiffel-tower-fr-lead.txt` | Encyclopedia article in French | Lead of the French Wikipedia article [Tour Eiffel](https://fr.wikipedia.org/wiki/Tour_Eiffel), revision 240706197 (25 October 2026), as plain text from the MediaWiki API | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The first 24 tasks in `tasks.ts` cover each English document, two questions that need two documents, and four questions none of them answers. One of those is the live checks' invented "first person to be awarded a patent"; the licence's patent clauses are a distractor. Tasks `f25`–`f36` ask about the Japanese, Chinese and French documents in their own language: three questions each that the document answers, and one it does not.

What the committed set still lacks is what users brought in the live checks and will bring to the usability test: slide decks (like the Papyrus tutorial), scanned-looking layouts, papers with columns and tables. Those documents are usually not ours to commit.

## Local documents

Documents that may not be committed, such as usability testers' PDFs (with their permission), go in `eval/field/local/`, which git ignores:

```text
eval/field/local/
├── tasks.json
└── papyrus-tutorial.pdf
```

`tasks.json` lists the documents and the tasks over them, in the same form as `tasks.ts`:

```json
{
  "documents": [{ "id": "papyrus-tutorial", "title": "papyrus-tutorial.pdf", "file": "papyrus-tutorial.pdf" }],
  "tasks": [
    {
      "id": "l01-activity-diagram",
      "kind": "lookup",
      "question": "How do I create an activity diagram?",
      "answerable": true,
      "facts": [["Papyrus Project"], ["Activity"]],
      "citations": [["papyrus-tutorial"]]
    }
  ]
}
```

- **Merging:** local tasks run with the committed ones. A report then says how many were local, because its results are not comparable with runs on other machines.
- **What to commit:** commit a report from a run with local tasks only if its local task IDs and questions may be published. Otherwise save it as `eval/results/*.local.json`, which git also ignores.
- **Facts and citations** work as in the research suite: each `facts` group lists accepted spellings, and each `citations` group lists acceptable document IDs.
