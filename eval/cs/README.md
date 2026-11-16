# CS suite

Questions over computer science research papers (harness 0.69.0). The field suite's documents are Wikipedia leads, a software licence, Kovrune's own documentation and made-up Office files, and the clinical suite's are trial reports. None has a results table of methods against datasets, a learning rate written as a power of ten, an ablation, or a paper whose terms are mostly acronyms. Those are where reading a CS paper goes wrong. An audit of Kovrune from a computer and information sciences researcher's point of view found that search, which matches words, cannot find "retrieval-augmented generation" for "RAG" or "large language models" for "LLMs", and that no suite could show how often that matters. This suite can.

```bash
npm run bench:endpoint -- --model <model> --suites cs,csholdout --modes constrained --out eval/results/<name>.json
```

`cs` (26 questions) may be looked at task by task while a change is developed; `csholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the papers before any model ran on them, and are not changed to fit a run. A fact that is plainly wrong is fixed as a task defect and recorded here with the scores before and after, as the clinical suite does. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

## The documents

Ten open-access journal papers, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), chosen to cover what a CS researcher reading related work meets:
- **Fields:** federated learning (five papers), retrieval-augmented generation and LLMs (three), and knowledge distillation (two, one of them also federated).
- **Results:** tables of methods against datasets and settings, with mean ± standard deviation; ablations; significance tests that find no difference; a method that underperforms the baseline it was meant to beat.
- **Setup:** hyperparameters written as powers of ten whose superscripts the text lost ("10−3" for 10⁻³, "5×10−4"), and values whose unit matters (KB and MB, ms and s).
- **Acronyms:** HCE-RAG, ESCA, CQR, HRRF, CBV, GA, SGA, KD, NIDS. Several tables use only the acronym, so a question in the words it stands for has to bridge it.
- **Overlap on purpose:** FedAvg, FedProx, CIFAR-10 and MNIST appear in most of the federated papers, with different values in each; GPT-4o, Llama and Gemini appear in two LLM papers; and many numbers differ only by row, column, dataset or skew level.

They are their own library (`csLibrary` in `eval/harness/field.ts`): a researcher's folder of papers, not the field or clinical documents.

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `fedcode-compression.md` | Emanuel Guberović et al. FEDCODE: A Framework and Experimental Study of Model-Update Compression for Communication-Efficient Federated Learning. *Sensors* 2026. [doi:10.3390/s26196297](https://doi.org/10.3390/s26196297); [PMC13667620](https://europepmc.org/article/PMC/PMC13667620) | 175 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `stabfl-label-skew.md` | StabFL: Stabilized Logit Adjustment with Queue-Augmented Representation Learning for Label-Skewed Federated Learning. *Sensors* 2026. [doi:10.3390/s26196033](https://doi.org/10.3390/s26196033); [PMC13667722](https://europepmc.org/article/PMC/PMC13667722) | 77 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `fl-plant-disease-stabilization.md` | A Comparative Study of Client-Level Stabilization Techniques in Federated Learning for Robust Plant Disease Recognition. *Sensors* 2026. [doi:10.3390/s26206566](https://doi.org/10.3390/s26206566); [PMC13709045](https://europepmc.org/article/PMC/PMC13709045) | 82 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `vcfedadam-verifiable.md` | VCFedAdam: A Verifiable and Compressed FedAdam Aggregation Scheme for Federated Learning in Distributed Sensor Networks. *Sensors* 2026. [doi:10.3390/s26185814](https://doi.org/10.3390/s26185814); [PMC13611767](https://europepmc.org/article/PMC/PMC13611767) | 60 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `fl-iiot-poisoning.md` | Privacy-Preserving and Poisoning-Robust Federated Learning for Industrial IoT. *Sensors* 2026. [doi:10.3390/s26165297](https://doi.org/10.3390/s26165297); [PMC13517349](https://europepmc.org/article/PMC/PMC13517349) | 68 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `imflkd-incentive.md` | IMFLKD: an incentive mechanism for decentralized federated learning based on knowledge distillation. *Scientific Reports* 2026. [doi:10.1038/s41598-026-46234-1](https://doi.org/10.1038/s41598-026-46234-1); [PMC13039868](https://europepmc.org/article/PMC/PMC13039868) | 44 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `kd-intrusion-detection.md` | A temperature-adaptive logit-standardized knowledge distillation for lightweight network intrusion detection. *PLOS One* 2026. [doi:10.1371/journal.pone.0361860](https://doi.org/10.1371/journal.pone.0361860); [PMC13726990](https://europepmc.org/article/PMC/PMC13726990) | 67 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `arabic-rag-noise.md` | Benchmarking retrieval augmented generation LLMs for Arabic noise robustness. *Frontiers in Big Data* 2026. [doi:10.3389/fdata.2026.1884673](https://doi.org/10.3389/fdata.2026.1884673); [PMC13526670](https://europepmc.org/article/PMC/PMC13526670) | 50 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `longtail-entity-rag.md` | Hierarchical context enhancement for long-tail entity retrieval augmented generation. *Frontiers in Artificial Intelligence* 2026. [doi:10.3389/frai.2026.1861536](https://doi.org/10.3389/frai.2026.1861536); [PMC13269389](https://europepmc.org/article/PMC/PMC13269389) | 60 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `llm-bias-rule-induction.md` | Feedback-driven rule induction and retrieval-augmented bias mitigation for large language models. *Frontiers in Artificial Intelligence* 2026. [doi:10.3389/frai.2026.1925701](https://doi.org/10.3389/frai.2026.1925701); [PMC13638623](https://europepmc.org/article/PMC/PMC13638623) | 69 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Each document names its authors in full; the table names the first author where the list is short enough to read.

**How they were made.** `source/build.py` downloads each article's full-text XML from Europe PMC and writes it as Markdown with the clinical suite's converter (`eval/clinical/source/jats2md.py`). It refuses an article whose licence is not CC BY 4.0. The article's own text is kept, unchanged, as for the clinical papers: the title, authors, licence statement, abstract, sections, tables (one row per line), references and acknowledgements. These are the changes made, as the licence asks to be told:
- figures are kept as their captions only;
- supplementary material is left out;
- merged table cells become single cells, so some rows have fewer cells than their header, and a two-row header is two rows;
- **displayed equations are kept as the text of their symbols**, one to a line with their number ("A c c u r a c y = T P + T N T P + T N + F P + F N (12)"), as a PDF's text layer gives them. Inline formulas are flattened the same way. Superscripts are lost, so 10⁻³ reads "10−3". Where a journal typesets a formula as an image (*Scientific Reports*), it is missing, as it is from the publisher's text;
- **tables that MDPI puts after the article** (`<floats-group>`) are placed after the paragraph that first cites them, where a reader of the printed page meets them. Tables in an appendix (`<app-group>`) are kept.

The last two are new in the converter, and the clinical papers do not use them: rebuilt with it, the ten clinical documents are byte for byte the same.

To rebuild them:

```bash
python3 eval/cs/source/build.py
```

**Markdown, not PDF.** arXiv, where most CS papers are read, could not be reached from the container the suite was written in, so these are journal papers whose full text Europe PMC holds. The suite therefore measures reading a CS paper's text and tables, not a PDF's layout: two columns, tables drawn as positioned text, ligatures. arXiv papers are read as PDFs by the app (`src/sources/arxiv.ts`), and a PDF variant of this suite needs PDFs a person downloads; `eval/field/local/` takes them, with tasks, without committing them ([local documents](../field/README.md#local-documents)).

## The questions

| Kind | `cs` | `csholdout` | What goes wrong |
| --- | --- | --- | --- |
| Result: a value in a results or ablation table | 9 | 4 | The next row or column: another method, dataset, skew level or attack; a value in the abstract for one in a table; the same number for something else (`ch07`: 69.33 is also Llama-3's accuracy at 80% noise) |
| Setup: a hyperparameter or configuration | 5 | 2 | A power of ten one off, or the learning rate for the weight decay; KB for MB, ms for s; another dataset's optimizer |
| Acronym: asked in other words than the paper's tables use | 4 | 0 | Search matches words, so "entity-sensitive contextual augmentation" does not find a table row "w/o ESCA" |
| Negative: a method that did not improve | 4 | 1 | "Does not consistently outperform" or "underperforms" turned into "outperforms". Each such task has a fact group of the ways to say so ("does not", "not significant", "underperform", …), so that answer fails |
| Design: what was studied, how many | 2 | 1 | Another experiment's count from the same paper |
| Comparison of two papers | 1 | 1 | Needs both papers' values |
| Not in the papers | 1 | 1 | A model or dataset another paper of the library reports on: Gemini-2.5 Flash, FEMNIST |

`tests/field.test.ts` ("cs suite") checks:
- every fact is in its cited document;
- every document is asked about;
- each suite has a negative, an unanswerable and a comparison question;
- tables are kept as rows, a floated table follows the paragraph that cites it, and equations keep their number;
- an answer that turns a negative result into a positive one, gives KB as MB, or gives a power of ten one off fails its task, and right answers in other notations ("0.001", "1e-3", "10−3") pass.

`tests/retrieval.test.ts` keeps search on these papers at least where it is now.

## Results

**Search alone** (`npm run bench:retrieval`, no model, BM25 over the ten papers):

| | |
| --- | --- |
| Cited documents found | 97.2% (35 of the 36 documents the 34 answerable questions cite) |
| Answer passages found | 82.6% (86.7% since 0.73.0) |
| Everything found | 27 of 34 (29 since 0.73.0) |

The questions where search falls short:
- **`cs11` and `cs22`, the acronym questions:** asked about "the commitment-bound verification mechanism" and "entity-sensitive contextual augmentation", search finds the paper but not the passage, which says "CBV" and "w/o ESCA". `cs21`, which asks with the acronym "HCE-RAG", finds its table. This is the gap the researcher's audit expected. The abbreviation search of 0.70.0 (`src/tools/abbreviations.ts`) does not close it here: it finds both definitions and adds "CBV" and "ESCA" to the query, but the parts that define and discuss each term share more of the question's words, and fill the three results before the ablation table that uses only the abbreviation.
- **`cs01` and `ch01`, values only in FEDCODE's Table 5:** FEDCODE is the longest paper (118 parts), and its Tables 4 and 5, MNIST and CIFAR-10, share every word but the dataset's name. Search returns parts 66, 71 and 91 (Table 4, the text after Table 5, and the CIFAR-10 CAADS table) for both questions.
- **A table cut in the middle of a row (`cs01`).** Table 5 is longer than a part (1,800 characters), and the chunker splits a paragraph that long at sentences, then words. So part 69 ends "| Full updates | | 8b Quant." and part 70 begins with that row's numbers. FedBAT's row, which `cs01` asks for, is in part 70, which has no caption, no column headers and no "CIFAR-10". A model that reads it cannot tell which table, dataset or column a number belongs to. Results tables longer than a part are common in CS papers, and rare in the other suites' documents. Splitting a long table at its rows, with its caption and header repeated in each part, is the fix this suite can now measure; it changes every suite's parts, so it is left to its own change under [the rule](../field/README.md#rule-for-prompt-and-guard-changes).
- **`cs16`, a negative result:** search returns parts 10, 37 and 31 of the right paper, but not the paragraph after Table 7 that says the differences "do not reach statistical significance". The question's words ("full model", "standard knowledge distillation", "statistically significant") are spread over many parts.
- **`cs20`:** the abstract (part 2) gives both counts; search returns parts 36, 4 and 10, and only part 4 has one of them.
- **`ch09`, two papers:** search returns three parts of StabFL, none holding its table of rounds, and nothing of FEDCODE.

For comparison, the clinical suite's search finds 96.7% of documents and 83.7% of passages, everything for 24 of 30.

### The first model runs (0.69.0)

Both models ran on llama.cpp `0c1e570` (the copy vendored in llama-cpp-python 0.3.36), built portably (`-DGGML_NATIVE=OFF`), on CPU in a 4-core cloud container, at 4,096 tokens of context, in constrained mode, with the same Q4_K_M files as the other suites:

```bash
llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites cs,csholdout --out eval/results/cs-0.69-qwen3.5-4b-q4km.json
```

The build is not the one the clinical and field runs used, and runs on another build or CPU do not repeat task by task ([field README](../field/README.md#runs-repeat-on-one-machine-not-across-machines)). Compare these figures with other suites' as totals, not task by task.

| Model | `cs` | `csholdout` | Labelled **Quotes found**, wrong | Median time per question | Report |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | 17/26 (65%) | 9/10 | 1 of 13 (8%): 1 of 10 and 0 of 3 | 91 s | [json](../results/cs-0.69-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 11/26 (42%) | 7/10 | 4 of 12 (33%): 3 of 9 and 1 of 3 | 39 s | [json](../results/cs-0.69-qwen3.5-2b-q4km.json) |

Re-scored with the 0.71.0 harness (`bench:rescore`), both reports keep every label and result: the 0.70.0 and 0.71.0 sentence checks change nothing here.

For comparison, on the clinical suite 4B passes 19 of 23 (83%) and 2B 13 of 23 (57%), re-scored at 0.61.0. CS papers are harder for both models. 4B's green label stays under the design's 10% target here; 2B's is wrong a third of the time, as on the clinical papers.

`cs` by kind (`csholdout` is read only as totals):

| Kind | 4B | 2B |
| --- | --- | --- |
| Result (table value) | 5/9 | 3/9 |
| Setup | **5/5** | 3/5 |
| Acronym | **0/4** | 1/4 |
| Negative | **4/4** | 2/4 |
| Design | 1/2 | 1/2 |
| Two papers | 1/1 | 0/1 |
| Not in the papers | 1/1 | 1/1 |

**What went wrong, 4B.** Six of its nine failures are "not found": the value was in the paper, and the model concluded it was not.
- **The table one part before the paragraph it read (`cs04`, `cs12`).** Both papers discuss a table in the paragraph after it. Search found that paragraph, the model read it ("Table 4 provides the numerical results under severe skew…"; "removing majority voting causes a 3.8-point drop"), saw that it gives a difference, not the value, and answered "not found". The table was in the part just before: `stabfl-label-skew#28` and `fl-iiot-poisoning#43`. It never read them. A model that could see where a part sits, or a read that showed the table a paragraph cites, would have had the answer.
- **A table split mid-row (`cs01`).** The model read parts 66, 72 and 1 of FEDCODE, never 70, where FedBAT's CIFAR-10 row is, without caption or header (see search above).
- **The table never reached (`cs19`).** The model read the introduction (part 6), which gives GPT-4o's 0% noise accuracy, and concluded the 80% figure was not given. Table 1 is part 22.
- **The acronym questions (`cs11`, `cs22`).** Asked about "commitment-bound verification" and "entity-sensitive contextual augmentation", 4B searched in those words three and one times, read the abstract and nearby parts, and answered "not found". The values are in the ablation, written "CBV" and "w/o ESCA". This is the gap the suite was built to show: search cannot bridge an acronym, and a 4B model does not try the acronym itself, though `cs22`'s answer names "(ESCA)".
- **A quote copied from a search snippet (`cs21`).** The answer, 0.82, is right. Its quote ends "compared to both general-purpose RAG baselines and domain-specifi…": the snippet search showed, cut at 220 characters, not the part's text, which the model had read. A quote cut mid-word with "…" is not word for word, so the answer is labelled **Quotes not found** and fails. Search snippets that end in "…" invite this; checking such a quote up to its "…" would accept it.
- **A part label read as a count (`cs20`).** 4B answered "300 questions and 38 documents", and quoted the part's title, "…(part 36 of 38)", for the 38. The benchmark has 6,196 documents. The quote check passed, because a part's title is in the text the model is shown, but the sentence check found the answer's sentence not backed by its quotes, so it reads "0 of 1 sentences backed", not **Quotes found**.
- **The one wrong green label (`cs24`).** Asked how stereotypical gender assumption changed in the 500-record evaluation, 4B answered "the framework consistently reduced Stereotypical Gender Assumption", with a real quote, and its review and cross-check agreed. The facts ask for the numbers (14.4% to 11.0%), which the answer leaves out. **A task defect, fixed in 0.73.0:** the question does not say it wants the numbers, and the answer is not wrong, only vague. As for `c03` ([clinical README](../clinical/README.md#the-first-model-runs-0600)), the question is unchanged and its facts now ask for what it asks: the direction ("reduc", "decreas", "lower", … or "from 14.4"). An answer that the measure rose still fails. Re-scored with `bench:rescore`, 4B's answer now passes: `cs` 18/26, and its wrong answers under **Quotes found** 0 of 13. 2B's answer passed already; nothing else in the 6,045 recorded answers of `eval/results/` changes.

**What went wrong, 2B.** 2B found more values than 4B, and gave the wrong one more often:
- **Wrong numbers with real quotes, labelled Quotes found (`cs01`, `cs22`).** For FedBAT's accuracy, "0.19 percentage points" (an accuracy difference from another paragraph); for the accuracy without ESCA, "29 percentage points" (the abstract's Recall@10 gain). Both are short answers inside quotes that cover most of the question's words.
- **Half an answer labelled Quotes found (`cs09`).** Asked for the computation and the communication savings, 2B gave "90.25%" alone. Its quote gives both, and its completeness check found nothing missing.
- **Another value from the right sentence (`cs04`, `cs12`, `cs17`, `cs05`, `cs07`).** StabFL's own 72.82 for FedProx's; the 3.8-point drop for the accuracy; the learning rate without the weight decay, written once as "10^{-3}", a notation the facts do not list (the answer fails either way, for the missing weight decay); fine-tuning epochs without head epochs.
- **Negative questions (`cs16`, `cs23`):** 2B gave an empty answer with `found: false`. It never said a method improved where the paper says it did not.

**What 4B did well:** every setup question, including both powers of ten (written "10^-3" and "5×10−4"), the KB/MB storage question, and every negative question: it wrote "did not consistently outperform", "was not statistically significant" and "did not improve" where the papers say so. It refused the unanswerable Gemini question, though Gemini-2.5 Flash is in another paper of the library.

**What the runs suggested,** in order of what they would gain on this suite, and what became of each in 0.73.0 ([below](#four-changes-from-the-first-runs-0730)):
1. **Point to a table from the paragraph that discusses it** (`cs04`, `cs12`): a table note after the part.
2. **Split long tables at rows, with caption and header repeated** (`cs01`, `ch01`).
3. **Bridge acronyms in search further** (`cs11`, `cs22`): a result kept for a passage that uses only the abbreviation.
4. **Accept a quote cut with "…" up to the cut** (`cs21`): not done as such. Harness 0.8.0 refused quotes cut mid-word on purpose, after a model finished "…can sometimes match hum…" from memory; the same release made OpenAlex snippets end at a whole word. 0.73.0 does that for the user's documents' snippets instead, so a copied snippet is a quote the check accepts.

### Four changes from the first runs (0.73.0)

Three of the four are kept; the abbreviation place was taken out in 0.77.0 ([below](#the-other-suites-and-the-rules-decisions-0770)).

**What changed.**
- **Tables split between rows** (`splitTable` in `src/documents/chunk.ts`). A table longer than a part is cut between rows, never inside one, and each later piece starts with "**Table 5** (continued)", its caption's first sentence and its first row, the column names. Search does not index those repeated lines (`withoutRepeatedLead`): indexed, Table 3's caption in every piece of the typhoid trial's table outranked the passages that answer `c01`, which lost two of its three answer passages in `bench:retrieval`.
- **A note where a cited table is** (`DocumentIndex.tablesCitedElsewhere`, `tableNote` in `src/tools/research.ts`). A part of the user's document that cites a table held in another part ends with "[Table 4 is in stabfl-label-skew#28.]". A caption is a line that starts with "**Table 4**", "Table 4." or "Table 4:"; a paragraph that starts "Table 4 provides…" cites it. An old read that is shortened to fit the context loses the note, as an outline is lost.
- **A place for a passage that uses only the abbreviation** (`search` in `src/tools/search.ts`). When a query spells out a term of two words or more that the library abbreviates ("commitment-bound verification", defined as CBV), and no result uses the abbreviation without the long form, the best-ranked passage that does takes the last of the three places; one place at most. A first version also took one-word long forms and one place per abbreviation: in the lab suite (merged meanwhile), "controls" matched "control (Ctrl)", and with "RMS" two of `l16`'s three results went to such passages, and its answer passage with them. Replaying this suite's recorded runs on the final version, every task makes the same requests except 4B's `c01`, which was run again (below).
- **Snippets cut at a word** (`cutAtWord`). A snippet sentence longer than 220 characters ends after its last whole word, marked "[…]", which the quote check ignores at a quote's edge.

The reports of these runs record harness "0.72.0": the change was numbered so before `main` gave 0.72.0 to the lab suite. `main`'s 0.72.0 changed no code outside `eval/`, so the base (0.71.0) is `main`'s code.

Where they apply: of the libraries' parts, 8 CS, 10 clinical and 1 lab table pieces are continued, and 25 CS and 16 clinical parts get a table note; no field, office, engineering, research or pdf document has a table longer than a part or a cited table in another part. Snippets change wherever a sentence is longer than 220 characters: in 327 of the 534 CS parts and 295 of the 415 clinical ones, but 7 field, 7 office, 1 research and 1 pdf part; and in 314 of the lab suite's 451 parts.

**Search alone** (`bench:retrieval`): `cs` and `csholdout` find everything for 29 of 34 answerable questions, up from 27 (`cs11` and `cs22`), and every other suite, the lab suite included, is unchanged, with and without 300 generated documents. `tests/retrieval.test.ts`'s CS floor is raised to these figures.

**Recorded answers** (`bench:rescore --labels` over every report in `eval/results/`): none of the 6,045 changes label, as the changes are to what the model is shown. The one answer that changes, `cs24`, is the task defect above.

**Models, on the clinical and CS suites** (same machine, build and model files as the 0.69.0 runs). Following [the rule's fewer runs](../field/README.md#rule-for-prompt-and-guard-changes): the change was run with its replies recorded; `bench:replay` found 61 of the 69 tasks differ from `main` (0.71.0), almost all from their first search, whose snippets now end at a word; `main` was run on those 61, and the rest taken from the replay. Both sides re-scored with the 0.73.0 harness, so `cs24`'s fix counts on both:

| Model | Suite | `main` | 0.73.0 | Gained | Lost | p | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | `cs` | 19/26 | **21/26** | 3 | 1 | 0.63 | [before](../results/cs-clinical-0.71-base-qwen3.5-4b-q4km.json), [after](../results/cs-clinical-0.73-qwen3.5-4b-q4km.json) |
| | `csholdout` | 9/10 | 10/10 | 1 | 0 | 1 | |
| | `clinical` | 17/23 | 17/23 | 0 | 0 | 1 | |
| | `clinicalholdout` | 7/10 | 6/10 | 0 | 1 | 1 | |
| Qwen3.5-2B | `cs` | 11/26 | 12/26 | 1 | 0 | 1 | [before](../results/cs-clinical-0.71-base-qwen3.5-2b-q4km.json), [after](../results/cs-clinical-0.73-qwen3.5-2b-q4km.json) |
| | `csholdout` | 7/10 | 7/10 | 0 | 0 | 1 | |
| | `clinical` | 10/23 | 10/23 | 1 | 1 | 1 | |
| | `clinicalholdout` | 4/10 | 5/10 | 1 | 0 | 1 | |

Over the four suites, 4B gains 4 tasks and loses 2, and 2B gains 3 and loses 1. Labelled **Quotes found**, wrong: 4B 1 of 31 before and 3 of 32 after, the two new ones both in `clinicalholdout`, which is read only as totals; 2B 7 of 25 before and 5 of 22 after. Median time per question is unchanged (4B 100 s clinical, 89 → 83 s CS; 2B about 40 s).

**What each change did, 4B, `cs`:**
- **The table note: `cs12` gained.** 4B read the paragraph after Table 2, as before, then the part its note named (`fl-iiot-poisoning#43`), and answered 80.5. In `cs04` it was not enough: search now ranks Table 4's part first, and the note pointed to it, but 4B read only the discussion and answered "not found", as on `main`.
- **The abbreviation's place: `cs22` gained, `cs11` lost.** For `cs22` the kept place went to the ablation table (`w/o ESCA`), which 4B read first and answered 0.6508. For `cs11` it went to another part that uses only "CBV" (part 22, section 5.6, "Sketch Verification"), not the ablation (part 30); 4B read it and two others and answered "not found". On `main`, 4B had passed `cs11` by searching "CBV" itself on its third search; here its later searches were worded differently. The place goes to the best-ranked such passage, which need not be the one that answers.
- **Snippets cut at a word: `cs21` gained.** 4B gave the same right answer, 0.82, with its quote copied from the snippet as before; the snippet now ends "…baselines and […]", and the quote verifies.
- **Table pieces: `cs01` still fails, differently.** 4B now read parts 68 and 69: Table 4's later piece, which starts "**Table 4** (continued) … on MNIST.", and the start of Table 5. It answered 95.27%, FedBAT's MNIST accuracy from Table 4, not its CIFAR-10 accuracy from Table 5. The continued label named the dataset, and the model took the number anyway. The cross-check read 95.27 ± 0.10 from the passages and did not agree, so the answer is not labelled **Quotes found**.

**2B:** it gains `cs23`, now reading part 30 and saying HyDE "did not improve", and `clinicalholdout` one task, and trades `c06` for `c11`. In `c06` it read parts 45 and 47 instead of 44, 46, 40 and 3: a long table earlier in that paper is now two pieces, so its later parts are numbered one higher, and the search results and reads differ from there. Its two fewer wrong labels under **Quotes found** are `cs22`, now right, and one held-out answer no longer labelled.

### The other suites, and the rule's decisions (0.78.0)

**How they were run.** The rule asks for research, unanswerable, pdf, field and holdout on both models, and the lab suites (merged after 0.73.0) were added to them. Run in the order the decision needs (4B's protected suites, then 4B's field and lab, then 2B), in chunks of at most 10 tasks, each its own report, so a run that stops resumes at the next chunk. `main`'s recordings were reused wherever they replay: the 0.70.0 field and holdout runs and the 0.72.0 lab runs on `main`'s code (`0396484`), with `bench:replay` naming the tasks whose requests differ; only those ran, on both sides. 4B's `c01`, the one clinical or CS task whose requests changed with the final abbreviation place, was run again on that code and passes as before ([report](../results/cs-clinical-0.73-c01-qwen3.5-4b-q4km.json)). Research and unanswerable have no recent recording, so the change ran all 30 and `main` the 2 whose requests differ. Both sides used llama-server's prompt cache, as every run before harness 0.75.0, so these are a full run's results only per chunk: a comparison of a few tasks is noisier than its p says ([the prompt cache](../field/README.md#the-prompt-cache-makes-a-task-depend-on-the-tasks-before-it)).

**0.73.0 against `main`** ([before](../results/protected-0.73-base-qwen3.5-4b-q4km.json), [after](../results/protected-0.73-qwen3.5-4b-q4km.json); 2B: [before](../results/protected-0.73-base-qwen3.5-2b-q4km.json), [after](../results/protected-0.73-qwen3.5-2b-q4km.json)):

| Suite | 4B `main` | 4B 0.73.0 | Gained / lost | 2B `main` | 2B 0.73.0 | Gained / lost |
| --- | --- | --- | --- | --- | --- | --- |
| `research` | 19/22 | 19/22 | 0 / 0 | 15/22 | 15/22 | 0 / 0 |
| `unanswerable` | 8/8 | 8/8 | 0 / 0 | 5/8 | 5/8 | 0 / 0 |
| `pdf` | 4/4 | 4/4 | 0 / 0 | 3/4 | 3/4 | 0 / 0 |
| `holdout` | 36/37 | 36/37 | 0 / 0 | 23/37 | 23/37 | 0 / 0 |
| `labholdout` | 10/11 | 9/11 | 0 / 1 | 9/11 | 9/11 | 1 / 1 |
| `field` | 80/89 | 80/89 | 0 / 0 | 69/89 | 68/89 | 0 / 1 |
| `lab` | 27/32 | 27/32 | 2 / 2 | 22/32 | 20/32 | 1 / 3 |

**Which change each flip came from.** Reports do not keep what the tools returned, so each flipped task's recorded actions were run through the tools of both versions and the observations compared:
- **Abbreviation place:** the only difference in `l03` (4B, gained) and `l06` (2B, gained), and one of two in `l07` (2B, lost): a passage using only "BAT" or "HFD" took the third result. With `cs22` gained and `cs11` lost, it gained 3 tasks and lost 2.
- **Table pieces:** `l11` (4B) and `l30` (2B), both lost, on the one lab paper with a long table (mecA): its parts after the table are numbered one higher and its search results re-ranked.
- **Snippets cut at a word:** the only difference in `l17` (4B, gained), `l23` (4B, lost), `l16` and `f82` (2B, lost): a snippet's last words. With `cs21` gained, 2 gained and 3 lost.
- **Table note:** in no flipped task; no field, lab or protected document has a table cited from another part.

**Decisions, under [the rule](../field/README.md#rule-for-prompt-and-guard-changes).**
- **Table pieces and snippets** fix defects (a table cut inside a row; a snippet whose quote the check refused), so the defect-fix clause applies: adopted unless a protected suite loses two more than it gains, or loses with p < 0.25. None does: every protected suite is unchanged except `labholdout`, 0 / 1 on 4B (p = 1) and 1 / 1 on 2B, and `clinicalholdout`, 0 / 1 and 1 / 0. **Adopted.** Their lab and field flips (5 lost, 2 gained) are each a re-ranking or a snippet's last words, not a wrong reading of a table or a snippet.
- **The table note** is a heuristic: it must improve the domain suites without a protected loss. It gained `cs12` and reaches no other suite's documents. **Adopted.**
- **The abbreviation place** is a heuristic too. It gained 3 and lost 2 (p = 1), no clear improvement, and the lab held-out total fell on 4B. **Not adopted: taken out in 0.77.0.** The place goes to the best-ranked passage using the abbreviation, which need not be the one that answers (`cs11` above); a later version could ask for the query's other terms too.

**Without the abbreviation place (0.78.0).** `bench:replay` of every 0.73.0 recording on the code without it finds 17 tasks per model whose requests differ (lab, clinical and CS; none in research, unanswerable, pdf, field or holdout). Those were run again on that code and on `main`'s, with the prompt cache off on both ([before](../results/noslot-0.77-base-qwen3.5-4b-q4km.json), [after](../results/noslot-0.77-qwen3.5-4b-q4km.json); 2B: [before](../results/noslot-0.77-base-qwen3.5-2b-q4km.json), [after](../results/noslot-0.77-qwen3.5-2b-q4km.json)): 4B gains `l07` and one held-out task and loses none, 2B is unchanged. With the other tasks taken from the 0.73.0 runs, 0.77.0 against `main`:

| Model | Protected suites | `labholdout` | `lab` | `field` | `cs` | `csholdout` | `clinical` | `clinicalholdout` | All |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | unchanged | 10 → 10 | 26 → 26 (2 / 2) | 80 → 80 | 19 → **21** | 9 → 10 | 17 → 17 | 7 → 7 (1 / 1) | 6 gained, 3 lost |
| Qwen3.5-2B | unchanged | 9 → 10 | 22 → 20 (0 / 2) | 69 → 68 | 11 → 12 | 7 → 7 | 10 → 10 (1 / 1) | 4 → 5 | 4 gained, 4 lost |

"Protected suites" are research, unanswerable, pdf and holdout, each the same before and after. `bench:retrieval`'s CS figures go back to 27 of 34 found in full (`cs11` and `cs22` lose their answer passages), and `tests/retrieval.test.ts`'s CS floor with them; every other suite is unchanged. The 17 tasks were run on 0.73.0's code without the place, not on 0.76.0's: 0.76.0's figure note (lab suite) was measured with the place in.

### The figure note, and why it is not given to a table's part (0.78.0)

The lab suite's 0.76.0 [figure note](../lab/README.md#three-changes-from-the-first-runs-0760) — a part holding a figure's legend ends with where that figure is discussed — reaches 23 of these papers' 534 parts, and its write-up left the CS runs undone. They are here, and they changed the rule.

Both models ran on llama.cpp `0c1e570` built portably, on CPU in a 4-core cloud container, at 4,096 tokens of context, in constrained mode, against a baseline on `main` at 0.75.0 on the same machine, build and model file. **These are the first CS runs with llama-server's prompt cache off** (`main`'s 0.75.0), which makes a run about twice as slow and its replies independent of what ran before.

**All four runs were made before `main`'s 0.77.0 took out the abbreviation place**, so each of them — baselines and changes alike — had it. The pairs are therefore internally consistent and the comparison is between the code versions, but the figures are not what these suites give on `main` today; a fresh baseline is needed before they are quoted as current.

| Model | Suite | Baseline (no note) | The note as merged (0.76.0) | The note narrowed (0.78.0) |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B | `cs` | 22/26 | 21/26 (0 gained, **1 lost**) | **22/26** (0, 0) |
| Qwen3.5-4B | `csholdout` | 10/10 | 10/10 | 10/10 |
| Qwen3.5-2B | `cs` | 13/26 | not run | **13/26** (0, 0) |
| Qwen3.5-2B | `csholdout` | 7/10 | not run | 7/10 |

For comparison, the 0.69.0 runs of these suites passed 17 of 26 on 4B and 11 of 26 on 2B, with the prompt cache on and before 0.73.0's tables and 0.76.0's checks. The baseline above is what the suites stand at now, so it is what a change is judged against.

**The task the note cost, and what the reports show.** `cs04` asks for FedProx's macro-F1 on PAMAP2 under severe label skew. In both the baseline and the 0.76.0 run, 4B searched with the same query, read the same part (`stabfl-label-skew#28`) and gave the same right value, 72.37±1.84. The difference is the **quote**: without the note it quoted Table 4's row whole, and with the note it quoted the row from the middle, "FedProx | 76.90±4.21 | …", which is not word for word in the source. The quote check rejected it (`evidence: false`) and the task failed, though the answer was right.

That part holds **Table 4 — the table the question needs — as well as Figure 2's legend**. The note sent the model away from the values it already had in front of it.

**So a part that holds table rows takes no figure note** (`TABLE_ROW` in `figuresDiscussedElsewhere`). A part with rows of values is where an answer is read, not a place to point away from; a legend among prose still points to its discussion, which is what the lab case needs.

The narrowing is measured, not assumed:
- **Of the lab suite's 53 noted parts, all 53 keep their note**, so every lab prompt is unchanged and 0.76.0's lab measurement (4B 27→29 of 32, 2B 20→21, nothing lost) carries over with no model run.
- **Of these suites' 23, 20 keep it**; the three dropped include `#28`. With them dropped, both models sit exactly on their baselines: 0 gained, 0 lost, `cs04` passing again.
- `bench:retrieval` is unchanged on every suite, and `bench:rescore --labels` over every recorded report gives the same line for each answer: the note is read-time only.

**What this says about the note.** On bench papers, where a figure's values live in the prose that cites it, it gains two tasks on 4B and one on 2B. On these CS papers, where the values are in tables the model reads directly, it gains nothing and, before the narrowing, cost one task through a quote that began mid-row. A pointer helps where the answer is elsewhere and distracts where it is already in hand, which is what the rule now encodes.

## Computer science venues (0.79.0)

The CS suite reads journal papers from Europe PMC, but a computer science researcher reads conference papers: the ACL Anthology for NLP, and NeurIPS, ICLR and ICML for machine learning, with OpenReview's reviews. Kovrune runs in the browser and runs no proxy ([design](../../docs/design.md), §5.1), so it can only read a site that lets web pages read it. Checked on 15 November 2026:

| Site | What it serves | Readable by a web page? |
| --- | --- | --- |
| aclanthology.org | PDFs, BibTeX, pages | No: no `Access-Control-Allow-Origin` |
| api2.openreview.net | papers, reviews, replies (JSON) | No: allowed only for `openreview.net` |
| openreview.net | PDFs | No: refused outside a browser session there |
| raw.githubusercontent.com (the Anthology's records) | titles, abstracts, links, as one XML file per volume (ACL 2023: 2.8 MB) | Yes, but no full texts and no search |
| api.openalex.org | records of both | Yes |

So these venues are reached through OpenAlex (`OPENALEX_VENUES` in `src/sources/openalex.ts`):

- **A search can be limited to a venue**, under OpenAlex's limits: the **ACL Anthology** by its DOI prefix (`10.18653`; ACL, EMNLP, NAACL, EACL, Findings and workshops; 7,058 works from 2023 and 11,113 from 2025 in OpenAlex), or **NeurIPS** by its OpenAlex source, on any of a work's locations (3,516 and 5,832). OpenAlex holds 4 of ICLR's 2023 papers, none of ICML's or JMLR's, and 2 of USENIX Security's, so those are not offered; their papers are nearly all on arXiv, which the arXiv source searches. TACL, whose DOIs are MIT Press's, is not in the ACL filter.
- **A paper is read in full from arXiv** when its OpenAlex record links there, as before, or, new, when an arXiv paper on DataCite has the same title, compared as letters and digits, and no other does (`findArxivByTitle`). OpenAlex often keeps a conference paper and its preprint as two works. A title of fewer than four words is not looked up. The paper is cited as the arXiv version read, with OpenAlex's authors.
- **Otherwise the abstract names the free PDF**, such as `aclanthology.org/2023.eacl-main.252.pdf`, for the user to download and add to their documents, where it is read in full like any PDF.

**Coverage**, with this code on 40 papers sampled by OpenAlex for each venue and year (`sample=40`, `seed=11`):

| Venue, year | Read from arXiv, linked | Read from arXiv, by title | Abstract, free PDF named | Abstract only |
| --- | --- | --- | --- | --- |
| ACL Anthology, 2023 | 17 | 0 | 23 | 0 |
| ACL Anthology, 2025 | 22 | 4 | 14 | 0 |
| NeurIPS, 2023 | 26 | 5 | 2 | 7 |
| NeurIPS, 2025 | 33 | 1 | 0 | 6 |

108 of 160 are read in full, 10 of them found by title. For 6 of those 10, arXiv's first author was compared with OpenAlex's, and all 6 are the same person. Every ACL paper had an abstract; 11 NeurIPS 2023 and 5 NeurIPS 2025 papers had none. An ACL paper not on arXiv still needs the user to add its PDF, which is two clicks but not none.

**Not covered:** OpenReview's reviews and the authors' replies, which no route reaches from a web page; ICLR and ICML papers by venue; and the camera-ready version where it differs from the arXiv one, since the arXiv version is what is read. None of the benchmark suites reads OpenAlex, so no recorded run changes; the venue limit, the title lookup and the PDF note are tested in `tests/cs-venues.test.ts`.

## arXiv papers from their LaTeX source (0.81.0)

Most arXiv papers in computer science are submitted as LaTeX, and arXiv serves the source to anyone, web pages included (`arxiv.org/src/<id>`, `Access-Control-Allow-Origin: *`; `arxiv.org/e-print/<id>` redirects there without the header). Since 0.81.0 the arXiv source reads a paper from it (`readLatexSource` in `src/sources/arxiv.ts`): the archive is unpacked in the browser (`src/documents/tar.ts`, with a cap on its inflated size) and its LaTeX converted (`src/documents/latex.ts`) into the text the other documents use:

| LaTeX | Read as |
| --- | --- |
| `\section{Method}` (the third) | `## 3 Method`; after `\appendix`, `## A …`, `### A.1 …` |
| `table` with `\caption` and `tabular` | `**Table 2** Its caption.` then `\| a \| b \|` per row; `\multicolumn{2}` keeps its columns |
| `figure` with `\caption` | `*Figure 3: Its caption.*` |
| `equation`, `align` | its LaTeX on a line of its own, then its number, `(1)`; an `align` numbers each row not marked `\nonumber` |
| `$O(n^2)$` | as written |
| `\citep{a,b}`, `\citet{a}`, `\cite{a}` | `(Lewis et al., 2020; Liu et al., 2023)`, `Liu et al. (2023)` from natbib's `.bbl`, or `[3]` |
| `\ref`, `\cref`, `\eqref` | `2`, `Table 2`, `(1)`, from the labels numbered as LaTeX numbers them |
| the `.bbl` | `## References` where the paper prints its bibliography, numbered |
| the paper's own `\newcommand` and `\def` | expanded; a class or style file's redefinitions of LaTeX's own commands are not |

A paper without a source (arXiv then serves its PDF), one whose archive can't be read, or one that converts to fewer than 800 words or with more unresolved `\ref`s than one per 500 words, is read from its PDF as before.

**Measured on 30 papers**, 15 from the ACL Anthology and 15 from NeurIPS, 2024–2025, sampled from OpenAlex among those linked to arXiv, each read both ways with the code here:

- **Every one had a source and converted**, in 23 to 408 ms (median 69) to unpack and convert. The sources are 143 MB to download, against 120 MB for the PDFs; the largest is 25.5 MB, under the 30 MB download limit.
- **Nothing the reader needs is lost.** Of the PDF text's words (four letters or more), 89% are in the converted text, and 91% of the converted text's words are in the PDF's. What the PDF has and the source doesn't is equations' loose symbols ("xkxt", "ukxt") and text drawn inside figures (one paper's prompts are images); what the source has and the PDF doesn't is math markup (`\frac`, `\mathcal`).
- **Equations keep their structure.** The 30 papers have 397 numbered equations and 2,742 inline formulas with a sub- or superscript. In the PDF's text, equation (3) of 2509.22741 reads `t=0 / XT / t QXt + U T / t RUt / dt / . (3)` over seven lines; from the source, `J_{T} = \mathbb{E}\left[\int_{t=0}^{T}\left(X^{\mathrm{T}}_{t}QX_{t}+U_t^{\mathrm{T}}RU_t\right)dt\right]\,. (3)`.
- **Tables are about even.** 296 tables, 1,871 rows with two or more numbers: 1,849 (98.8%) were already whole on one line of the PDF's text, read by layout since 0.70.0. The source adds the columns' boundaries and ties the caption to the table.

**Sources with a `.bib` and no `.bbl` (0.85.0).** arXiv takes a source without the `.bbl` BibTeX made, and then the converter had nothing to resolve `\cite` from: PlanetServe (2504.20101) read "relatively modest [samsi2023words]", and a preview user's quote carried the key. The converter now reads the `.bib` files instead (`readBib`, `bibReferences`): the entries the paper cites, in citation order, each cited by its authors and year, "(Samsi et al., 2023)". The PDF prints the numbers its bibliography style gives, which only BibTeX can work out; names and a year say more than a number, and the quote check reads the converted text. Of the 30 sampled papers, 3 have no `.bbl`; their raw keys go from 122 to none (the 2 bracketed words left are a grant number and a formula), and the 27 with a `.bbl` are unchanged.

**Limits.** A quote from the source shows no page. Text inside figures is read only from the PDF. Packages that define their own table or list environments, and macros with unusual argument syntax, can leave stray words, as can `tikz` drawings. The converter was checked on the 30 papers and on 9 well-known ones (the Transformer, BERT, RAG, Toolformer, LoRA, Chain-of-Thought, InstructGPT, Self-RAG, Lost in the Middle); no benchmark suite reads arXiv, so how much it changes the model's answers is not measured. A suite of CC BY arXiv papers with questions on their equations and tables would measure it.

## Following citations through OpenAlex (0.84.0)

A literature review follows citations: what a paper builds on, and who built on it since. OpenAlex holds both directions (`cited_by:` and `cites:` filters), so the OpenAlex source now reads two search forms (`citationQuery` in `src/sources/openalex.ts`):

- `references of <paper>: <topic>` lists the works the paper cites, and `citing <paper>: <topic>` the works citing it, best matching the topic, or, without one, the most cited first. The user's limits (year, field, venue, open access) apply.
- The paper is named by its OpenAlex ID, its DOI (with or without `doi:`), its arXiv ID (`arxiv:2310.11511`, looked up as arXiv's DOI), or its title. A title names the work whose title starts with it, or is the start of it ("Self-RAG"); a subtitle after a colon is tried whole first. A title that names no work is searched as words. A placeholder copied from the instructions ("citing W123: words") counts as no topic.
- A work read from OpenAlex shows `Cited by 1,088 works in OpenAlex; its references there: 32.` OpenAlex's reference lists can be short: it has 32 of Self-RAG's 58 references, and all 47 of Lost in the Middle's.

Live, the forms find what they should: Self-RAG's references include PPO, the GPT-4 report and Llama 2; the works citing RAG on "medical question answering" include MedExpQA; the most cited works citing Lost in the Middle are two surveys and GraphRAG; an ACL paper is found by its DOI.

**Whether the model uses them** (`npm run bench:citations`; searches counted as 0.84.0's parser reads them; five questions that name a paper and ask about one it cites or one citing it; Qwen3.5-4B, OpenAlex and arXiv, no documents, prompt cache off, same day):

| What the model is told | Passed | Searches that followed citations | Report |
| --- | --- | --- | --- |
| Nothing (`main`, 0.81.0) | 4 of 5 | none | [report](../results/citations-0.81-base-qwen3.5-4b-q4km.json) |
| A note after a work's first read | 4 of 5 | 1: "citing GRAG: …", a title, which was not read as one then | [report](../results/citations-note-qwen3.5-4b-q4km.json) |
| The note, and the forms in `search_openalex`'s usage line | 2 of 5 | 9, in 3 questions: "citing W4391876619: words", a bare DOI, and papers it had read rather than the one named | [report](../results/citations-usage-qwen3.5-4b-q4km.json) |
| The same, titles, bare DOIs and placeholders read, usage reworded | 3 of 5 | 6, in 3 questions; one right (q5), the rest the wrong paper or direction | [report](../results/citations-usage-fixed-qwen3.5-4b-q4km.json) |

Four of the five questions can also be answered by searching for the cited paper's subject, which the model did without the forms; told about them, it spent its steps following the citations of whatever it had just read (MedExpQA's references for "which paper cites RAG"), and concluded "not found". Under [the rule](../field/README.md#rule-for-prompt-and-guard-changes), telling the model is not adopted: it is a setting, **Let the model follow citations (experimental)**, off by default (`followCitations` in `createOpenAlex`, `followsCitations` on the source). With it off, the model sees only the citation counts, as in the second row. Five questions on one day are few; a larger model, or questions no subject search answers, may come out otherwise.

## Reading a long paper part after part (measured, not adopted)

A preview user's reports read long papers part after part: parts 1 to 8 of a 119-part arXiv paper after its best-matching part 62, ending "not found", and parts 1 to 8 of a 20-part one. A guard was tried: in a document of many parts, the third read in a row of the next part gave the unread part that best matches the question instead, with a note naming the part asked for, and asking again gave it (the agent let that second ask through its repeat guard).

**On the benchmark suites** (`bench:replay` of the latest cache-off recordings against `main`, then both sides run on the tasks whose requests change, cache off). With the guard on documents of 10 parts or more, 4B's tasks were unchanged (`l26`, 63 parts, read otherwise and passed on both sides), and 2B lost field task `f49`: on the 11-part user guide it was given part 10 for part 4, read it twice and answered "localhost" without the port ([before](../results/paging-base-qwen3.5-2b-q4km.json), [after](../results/paging-guard10-qwen3.5-2b-q4km.json); 4B: [before](../results/paging-base-qwen3.5-4b-q4km.json), [after](../results/paging-guard10-qwen3.5-4b-q4km.json)). At 20 parts or more, no field, holdout, research, unanswerable, pdf, CS or lab-holdout task's requests change; the suites' long papers are rarely read this way.

**On the user's questions** (`npm run bench:paging`, three section questions from the reports, Qwen3.5-4B, OpenAlex and arXiv, cache off, same day, guard at 20 parts; [before](../results/paging-base-live-qwen3.5-4b-q4km.json), [after](../results/paging-guard-live-qwen3.5-4b-q4km.json)). Two did not page on either side, and ran the same. The third did: `main` read parts 7, 8, 9 and 10 of the 20-part paper, one method section, and answered with 4 of 4 sentences backed. With the guard, part 10 gave part 5 and part 12 gave part 16; each time the model asked again for the part it had asked for, as the note offered, and it read 9 parts to answer with 1 of 3 sentences backed.

**Not adopted.** Reading on through a section is often right, and nothing tells it apart from paging through an introduction: ranked by the question, the 20-part paper's parts 9 to 11, which answered, came 14th to 17th of 20, while the 119-part paper's parts 1 to 5 came 6th to 14th. So neither a run of reads nor a part's match tells the guard when to step in. The reports' case was a real loss all the same: the 119-part paper (2308.10502) answers the question in its sections 3 and 4, on its training procedure and its Proof-of-Work, and the model, paging through the introduction and related work, never reached them. `bench:paging` stays, for the next attempt; what may serve better is a note after the third part read in a row that points to the sections the outline (shown at the first read) names, rather than a part given in place of the one asked for.

## Limits

- **Journal papers, not arXiv preprints.** Europe PMC holds the full text of CS papers published in open-access journals (here MDPI *Sensors*, *Frontiers*, *PLOS One*, *Scientific Reports*), not the conference papers and arXiv preprints most CS researchers read. Their tables and acronyms are of the same kind; their typesetting is not.
- **Text, not PDF:** see above. Equations read as a PDF's text layer gives them, which is the hard case, but the tables are clean rows, which a PDF's are not.
- **One author** wrote the questions, as for the other suites. The questions use the papers' terms, except the four acronym questions, which use the words an acronym stands for on purpose.
- **Fields:** machine learning systems and NLP. No theory papers (proofs, lemmas), no systems papers with code listings, no HCI studies.
