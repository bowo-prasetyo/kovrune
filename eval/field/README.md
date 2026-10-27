# Field suite

Questions over real documents ([issue #35](https://github.com/bowo-prasetyo/kovrune/issues/35)). The research, unanswerable and pdf suites use a synthetic corpus; their results have not changed since harness 0.7.0, while the prompt and guard changes since then were driven by three live questions. The field suite gives those changes something real to be judged on.

```bash
npm run bench:endpoint -- --model <model> --suites field --modes constrained --out eval/results/<name>.json
```

It is reported as its own suite and is not part of the gate's evaluation set, so M0 comparisons stay valid.

## Rule for prompt and guard changes

Before a change to the research prompt or the guards (repeat, last-step, read-before-search, documents-first) is merged, it must **improve the field suite without regressing** the research, unanswerable and pdf suites, on Qwen3.5-2B and Qwen3.5-4B. A change that only fixes a live check is not enough.

## Results

Constrained mode, 4,096-token context, the committed tasks only. Each run also includes the research, unanswerable and pdf suites, so a later change has a current baseline for those suites too. All runs used native llama.cpp (`d854d98`) on CPU in a 4-core cloud container, with the same Q4_K_M files the class 1 laptop uses. The 0.16.0, 0.17.0, 0.19.0, 0.20.0 and 0.21.0 runs used another container (Intel Xeon @ 2.80GHz, llama.cpp built with `-DGGML_NATIVE=ON`). Speeds do not carry over to other machines, and neither do individual task results: see [below](#runs-repeat-on-one-machine-not-across-machines).

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
| Qwen3.5-4B | 0.14.0 | 19/24 (79%) | 18/22 | 8/8 | 4/4 | 3 of 17 | [json](../results/field-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.15.0 | **20/24 (83%)** | 18/22 | 8/8 | 4/4 | 3 of 18 | [json](../results/field-fix-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.16.0 | 20/24 (83%) | 19/22 | 8/8 | 3/4 | 3 of 14 | [json](../results/field-0.16-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.17.0, not adopted | 17/24 (71%) | 20/22 | 8/8 | 4/4 | 3 of 15 | [json](../results/full-sentences-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.19.0 | 31/36 (86%): 20/24 and 11/12 in other languages | 19/22 | 8/8 | 3/4 | 2 of 17 | [json](../results/field-0.19-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.20.0 | **32/36 (89%)** | 19/22 | 8/8 | **4/4** | 2 of 18 | [json](../results/field-0.20-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.21.0 | 32/36 (89%) | 19/22 | 8/8 | 4/4 | 2 of 18 | [json](../results/field-0.21-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.24.0 tasks, before the change | 34/42 (81%): 32/36 and 2/6 across languages | not run | not run | not run | 2 of 20 | [json](../results/field-0.24-baseline-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.24.0 | **37/42 (88%)**: 32/36 and 5/6 across languages | not run | not run | not run | 2 of 20 | [json](../results/field-0.24-qwen3.5-4b-q4km.json) |

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

### Runs repeat on one machine, not across machines

- **On one machine, runs repeat exactly.** Running the 4B baseline and the 0.17.0 change a second time gave the same actions on all 58 tasks, and the same results.
- **Across machines, they differ.** The 0.16.0 baseline used the same llama.cpp commit and model files as the 0.15.0 runs, and the same prompt. Its actions differed on 20 of 58 tasks for 4B and 34 of 58 for 2B. A few results changed: `p04` (4B) now fails, and `r17` (2B) now passes. The likely cause is floating-point differences between CPUs and builds, which change which token wins at temperature 0.
- **So a change is judged against a baseline run on the same machine, never against a report from another one.** One run of each is enough there, but a difference of one or two tasks is still specific to that machine.

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
