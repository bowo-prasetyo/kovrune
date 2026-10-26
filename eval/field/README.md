# Field suite

Questions over real documents ([issue #35](https://github.com/bowo-prasetyo/kovrune/issues/35)). The research, unanswerable and pdf suites use a synthetic corpus; their results have not changed since harness 0.7.0, while the prompt and guard changes since then were driven by three live questions. The field suite gives those changes something real to be judged on.

```bash
npm run bench:endpoint -- --model <model> --suites field --modes constrained --out eval/results/<name>.json
```

It is reported as its own suite and is not part of the gate's evaluation set, so M0 comparisons stay valid.

## Rule for prompt and guard changes

Before a change to the research prompt or the guards (repeat, last-step, read-before-search, documents-first) is merged, it must **improve the field suite without regressing** the research, unanswerable and pdf suites, on Qwen3.5-2B and Qwen3.5-4B. A change that only fixes a live check is not enough.

## Results

Constrained mode, 4,096-token context, the committed tasks only. Each run also includes the research, unanswerable and pdf suites, so a later change has a current baseline for those suites too. All runs used native llama.cpp (`d854d98`) on CPU in a 4-core cloud container, with the same Q4_K_M files the class 1 laptop uses. The 0.16.0 and 0.17.0 runs used another container (Intel Xeon @ 2.80GHz, llama.cpp built with `-DGGML_NATIVE=ON`). Speeds do not carry over to other machines, and neither do individual task results: see [below](#runs-repeat-on-one-machine-not-across-machines).

| Model | Harness | Field | Research | Unanswerable | PDF | Quotes found, wrong (field) | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-2B | 0.14.0 | 15/24 (63%) | 15/22 | 5/8 | 3/4 | 2 of 13 | [json](../results/field-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.15.0 | **17/24 (71%)** | 15/22 | 5/8 | 3/4 | 3 of 16 | [json](../results/field-fix-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.16.0 | 16/24 (67%) | 16/22 | 5/8 | 3/4 | 2 of 8 | [json](../results/field-0.16-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.17.0, not adopted | 18/24 (75%) | 16/22 | 5/8 | 3/4 | 0 of 8 | [json](../results/full-sentences-qwen3.5-2b-q4km.json) |
| Qwen3.5-4B | 0.14.0 | 19/24 (79%) | 18/22 | 8/8 | 4/4 | 3 of 17 | [json](../results/field-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.15.0 | **20/24 (83%)** | 18/22 | 8/8 | 4/4 | 3 of 18 | [json](../results/field-fix-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.16.0 | 20/24 (83%) | 19/22 | 8/8 | 3/4 | 3 of 14 | [json](../results/field-0.16-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.17.0, not adopted | 17/24 (71%) | 20/22 | 8/8 | 4/4 | 3 of 15 | [json](../results/full-sentences-qwen3.5-4b-q4km.json) |

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

The first 24 tasks in `tasks.ts` cover each English document, two questions that need two documents, and four questions none of them answers. One of those is the live checks' invented "first person to be awarded a patent"; the licence's patent clauses are a distractor.

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
