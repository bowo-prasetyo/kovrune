# Field suite

Questions over real documents ([issue #35](https://github.com/bowo-prasetyo/kovrune/issues/35)). The research, unanswerable and pdf suites use a synthetic corpus; their results have not changed since harness 0.7.0, while the prompt and guard changes since then were driven by three live questions. The field suite gives those changes something real to be judged on.

```bash
npm run bench:endpoint -- --model <model> --suites field --modes constrained --out eval/results/<name>.json
```

It is reported as its own suite and is not part of the gate's evaluation set, so M0 comparisons stay valid.

## Rule for prompt and guard changes

Before a change to the research prompt or the guards (repeat, last-step, read-before-search, documents-first) is merged, it must **improve the field suite without regressing** the research, unanswerable and pdf suites, on Qwen3.5-2B and Qwen3.5-4B. A change that only fixes a live check is not enough.

## Results

Constrained mode, 4,096-token context, the committed tasks only. Each run also includes the research, unanswerable and pdf suites, so a later change has a current baseline for those suites too. All four runs used native llama.cpp (`d854d98`) on CPU in a 4-core cloud container, with the same Q4_K_M files the class 1 laptop uses. Quality results carry over to other machines, but the speeds do not.

| Model | Harness | Field | Research | Unanswerable | PDF | Quotes found, wrong (field) | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-2B | 0.14.0 | 15/24 (63%) | 15/22 | 5/8 | 3/4 | 2 of 13 | [json](../results/field-qwen3.5-2b-q4km.json) |
| Qwen3.5-2B | 0.15.0 | **17/24 (71%)** | 15/22 | 5/8 | 3/4 | 3 of 16 | [json](../results/field-fix-qwen3.5-2b-q4km.json) |
| Qwen3.5-4B | 0.14.0 | 19/24 (79%) | 18/22 | 8/8 | 4/4 | 3 of 17 | [json](../results/field-qwen3.5-4b-q4km.json) |
| Qwen3.5-4B | 0.15.0 | **20/24 (83%)** | 18/22 | 8/8 | 4/4 | 3 of 18 | [json](../results/field-fix-qwen3.5-4b-q4km.json) |

**The first change judged on the suite: Markdown marks in quotes (harness 0.15.0).** In the 0.14.0 runs, the right answers to `f01` (2B) and `f12` (both models) failed only on the quote check. The sources say "called **Apps on device**" and "labelled **Quotes found**", and the models quoted them without the asterisks. Users add Markdown files too, so the app showed **Quotes not found** for real quotes. Quote matching now ignores `*`, `**`, `__` and backticks.
- **The field suite improves:** 2B goes from 15 to 17, and 4B from 19 to 20.
- **No regressions:** research, unanswerable and pdf are unchanged.
- **The runs are repeatable:** in the re-runs, every one of the 58 tasks took the same actions as before, for both models. Only the quote verdicts changed.
- **One side effect:** 2B's wrong answer to `f02` ("Apps on device", the permission that *is* needed) now has a found quote, so it counts as false reassurance. The label is accurate, because the quote is real, but it is not reassuring.

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

Frozen copies, so later edits to the originals do not change the suite. All four may be committed under their licences.

| Document | Kind | Source | Licence |
| --- | --- | --- | --- |
| `kovrune-user-guide.md` | How-to manual, Markdown, 15 KB | `docs/user-guide.md` at commit `aeeb5e9` | MPL-2.0 |
| `kovrune-design-r3.pdf` | Long report, 18-page PDF | `docs/design.md` (revision 3) at commit `aeeb5e9`, converted with LibreOffice as plain text | MPL-2.0 |
| `mpl-2.0.txt` | Legal text | The Mozilla Public License 2.0 (`LICENSE`) | The licence text itself may be copied verbatim |
| `ada-lovelace-lead.txt` | Encyclopedia article | Lead of the English Wikipedia article [Ada Lovelace](https://en.wikipedia.org/wiki/Ada_Lovelace), as read on 25 October 2026, reference markers removed (also `tests/fixtures/`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The 24 tasks in `tasks.ts` cover each document, two questions that need two documents, and four questions none of them answers. One of those is the live checks' invented "first person to be awarded a patent"; the licence's patent clauses are a distractor.

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
