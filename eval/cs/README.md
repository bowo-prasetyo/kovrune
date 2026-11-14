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
| Answer passages found | 82.6% |
| Everything found | 27 of 34 |

The questions where search falls short:
- **`cs11` and `cs22`, the acronym questions:** asked about "the commitment-bound verification mechanism" and "entity-sensitive contextual augmentation", search finds the paper but not the passage, which says "CBV" and "w/o ESCA". `cs21`, which asks with the acronym "HCE-RAG", finds its table. This is the gap the researcher's audit expected.
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
- **The one wrong green label (`cs24`).** Asked how stereotypical gender assumption changed in the 500-record evaluation, 4B answered "the framework consistently reduced Stereotypical Gender Assumption", with a real quote, and its review and cross-check agreed. The facts ask for the numbers (14.4% to 11.0%), which the answer leaves out. **This is arguably a task defect:** the question does not say it wants the numbers, and the answer is not wrong, only vague. It is left as written, so the run stays comparable; the owner may decide to reword it ("from what to what") or relax its facts, as `c03` was ([clinical README](../clinical/README.md#the-first-model-runs-0600)).

**What went wrong, 2B.** 2B found more values than 4B, and gave the wrong one more often:
- **Wrong numbers with real quotes, labelled Quotes found (`cs01`, `cs22`).** For FedBAT's accuracy, "0.19 percentage points" (an accuracy difference from another paragraph); for the accuracy without ESCA, "29 percentage points" (the abstract's Recall@10 gain). Both are short answers inside quotes that cover most of the question's words.
- **Half an answer labelled Quotes found (`cs09`).** Asked for the computation and the communication savings, 2B gave "90.25%" alone. Its quote gives both, and its completeness check found nothing missing.
- **Another value from the right sentence (`cs04`, `cs12`, `cs17`, `cs05`, `cs07`).** StabFL's own 72.82 for FedProx's; the 3.8-point drop for the accuracy; the learning rate without the weight decay, written once as "10^{-3}", a notation the facts do not list (the answer fails either way, for the missing weight decay); fine-tuning epochs without head epochs.
- **Negative questions (`cs16`, `cs23`):** 2B gave an empty answer with `found: false`. It never said a method improved where the paper says it did not.

**What 4B did well:** every setup question, including both powers of ten (written "10^-3" and "5×10−4"), the KB/MB storage question, and every negative question: it wrote "did not consistently outperform", "was not statistically significant" and "did not improve" where the papers say so. It refused the unanswerable Gemini question, though Gemini-2.5 Flash is in another paper of the library.

**What the runs suggest, in order of what they would gain on this suite:**
1. **Show a table with the paragraph that discusses it,** or let the model see that the part before holds "Table 4" (`cs04`, `cs12`). The clinical suite's outline experiment ([#144](https://github.com/bowo-prasetyo/kovrune/pull/144), not adopted) is one way.
2. **Split long tables at rows, with caption and header repeated** (`cs01`, `ch01`).
3. **Bridge acronyms in search,** for example by indexing each "expansion (ACRONYM)" a paper defines as aliases of each other (`cs11`, `cs22`). `bench:retrieval` measures it without a model.
4. **Accept a quote cut with "…" up to the cut** (`cs21`), as a defect fix.

Each changes what the model sees, so each is judged under [the rule](../field/README.md#rule-for-prompt-and-guard-changes), with this suite added to the ones it runs.

## Limits

- **Journal papers, not arXiv preprints.** Europe PMC holds the full text of CS papers published in open-access journals (here MDPI *Sensors*, *Frontiers*, *PLOS One*, *Scientific Reports*), not the conference papers and arXiv preprints most CS researchers read. Their tables and acronyms are of the same kind; their typesetting is not.
- **Text, not PDF:** see above. Equations read as a PDF's text layer gives them, which is the hard case, but the tables are clean rows, which a PDF's are not.
- **One author** wrote the questions, as for the other suites. The questions use the papers' terms, except the four acronym questions, which use the words an acronym stands for on purpose.
- **Fields:** machine learning systems and NLP. No theory papers (proofs, lemmas), no systems papers with code listings, no HCI studies.
