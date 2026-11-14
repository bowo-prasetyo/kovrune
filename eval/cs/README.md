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

Qwen3.5-4B and Qwen3.5-2B are being run on both suites; their results are added here when the runs finish.

## Limits

- **Journal papers, not arXiv preprints.** Europe PMC holds the full text of CS papers published in open-access journals (here MDPI *Sensors*, *Frontiers*, *PLOS One*, *Scientific Reports*), not the conference papers and arXiv preprints most CS researchers read. Their tables and acronyms are of the same kind; their typesetting is not.
- **Text, not PDF:** see above. Equations read as a PDF's text layer gives them, which is the hard case, but the tables are clean rows, which a PDF's are not.
- **One author** wrote the questions, as for the other suites. The questions use the papers' terms, except the four acronym questions, which use the words an acronym stands for on purpose.
- **Fields:** machine learning systems and NLP. No theory papers (proofs, lemmas), no systems papers with code listings, no HCI studies.
