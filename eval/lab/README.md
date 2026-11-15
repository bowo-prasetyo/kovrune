# Lab suite

Questions over laboratory biology papers (harness 0.72.0). The field suite's documents are Wikipedia leads, a software licence, Kovrune's own documentation and made-up Office files; the clinical suite's are trial reports; the CS suite's are machine learning papers; the engineering suite's are made-up datasheets and test reports. None has a molar concentration, a knockout genotype, a protein name that one Greek letter tells from another, a direction of regulation, or a control that did not respond. Those are where reading a bench paper goes wrong. An audit of Kovrune from a biological and biomedical sciences researcher's point of view ran the sentence check on 22 wrong sentences of that kind and found 17 marked backed, and that no suite could show how often that matters ([laboratory units, opposites and names, 0.71.0](../field/README.md#laboratory-units-opposites-and-names-0710-defect-fix)). This suite is what can.

```bash
npm run bench:endpoint -- --model <model> --suites lab,labholdout --modes constrained --out eval/results/<name>.json
```

`lab` (32 questions) may be looked at task by task while a change is developed; `labholdout` (11) is read only as totals, like the other held-out suites. The questions and their facts were written from the papers before any model ran on them, and are not changed to fit a run. A fact that is plainly wrong is fixed as a task defect and recorded here with the scores before and after, as the clinical suite does. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

## The documents

Ten open-access journal papers, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), chosen to cover what a biological and biomedical sciences researcher reads at the bench:

- **Systems:** mice (three), a chicken line, zebrafish, *Arabidopsis*, *Staphylococcus aureus*, *Bacillus methanolicus* enzymes, and human cell lines.
- **Methods:** knockout and knockdown genotypes, enzyme kinetics (IC50, KM, Ki, KD), immunoblots, confocal imaging of organelles, antibiotic MICs and killing curves, ChIP and histone marks, and qPCR.
- **Results:** effects that go one way and not the other, values that differ by sex, genotype, organelle, cell line or paralog, and controls that showed no effect (the heterozygote, the other PPAR isoforms, FN1 against POSTN, p53 R273H against Y220C, MIC against tolerance).
- **Names one character apart:** PPARα against Pparγ and Pparδ, H3K27me3 against H3K4me2/3, p53Y220C against R273H, R280K and S241F, slc13a5a against slc13a5b and the double mutant, IL10 against the enhancer mutant.
- **Overlap on purpose:** three papers use knockout or null mice, three measure an immune or inflammatory response, two concern p53 or a tumour, two are enzyme-inhibition studies, and concentrations in μM appear in four with different values.

They are their own library (`labLibrary` in `eval/harness/field.ts`): a researcher's folder of papers, not the field, clinical, CS or engineering documents.

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `il10-tolerance-birds.md` | Dominique Meunier, Andres Corona-Torres et al. Interleukin 10 controls the balance between tolerance, pathogen elimination, and immunopathology in birds. *eLife* 2025. [doi:10.7554/eLife.106252](https://doi.org/10.7554/eLife.106252); [PMC12530801](https://europepmc.org/article/PMC/PMC12530801) | 64 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `ppara-brown-adipocytes.md` | Deletion of PPARα in mouse brown adipocytes increases their De Novo Lipogenesis. *Molecular Metabolism* 2025. [doi:10.1016/j.molmet.2025.102184](https://doi.org/10.1016/j.molmet.2025.102184); [PMC12221382](https://europepmc.org/article/PMC/PMC12221382) | 64 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `meca-daptomycin-tolerance.md` | Expression of mecA increases daptomycin tolerance in *Staphylococcus aureus*. *mBio* 2025. [doi:10.1128/mbio.02250-25](https://doi.org/10.1128/mbio.02250-25); [PMC12607837](https://europepmc.org/article/PMC/PMC12607837) | 48 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `scml2-sperm-chromatin.md` | Polycomb protein SCML2 mediates paternal epigenetic inheritance through sperm chromatin. *Nucleic Acids Research* 2023. [doi:10.1093/nar/gkad479](https://doi.org/10.1093/nar/gkad479); [PMC10359620](https://europepmc.org/article/PMC/PMC10359620) | 76 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `alk-postn-neuroblastoma.md` | ALK upregulates POSTN and WNT signaling to drive neuroblastoma. *Cell Reports* 2024. [doi:10.1016/j.celrep.2024.113927](https://doi.org/10.1016/j.celrep.2024.113927); [PMC11101011](https://europepmc.org/article/PMC/PMC11101011) | 60 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `fmrp-map1b-migration.md` | FMRP regulates postnatal neuronal migration via MAP1B. *eLife* 2024. [doi:10.7554/eLife.88782](https://doi.org/10.7554/eLife.88782); [PMC11101172](https://europepmc.org/article/PMC/PMC11101172) | 44 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `zebrafish-seizure-zinc.md` | Modulation of NMDA receptor signaling and zinc chelation prevent seizure-like events in a zebrafish model of SLC13A5 epilepsy. *PLOS Biology* 2025. [doi:10.1371/journal.pbio.3002499](https://doi.org/10.1371/journal.pbio.3002499); [PMC12047791](https://europepmc.org/article/PMC/PMC12047791) | 84 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `adp-ribose-methanol-dehydrogenase.md` | ADP-ribose is a competitive inhibitor of methanol dehydrogenases from *Bacillus methanolicus*. *Journal of Biological Chemistry* 2025. [doi:10.1016/j.jbc.2025.110599](https://doi.org/10.1016/j.jbc.2025.110599); [PMC12926040](https://europepmc.org/article/PMC/PMC12926040) | 48 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `cabozantinib-p53-y220c.md` | Cabozantinib selectively induces proteasomal degradation of p53 somatic mutant Y220C and impedes tumor growth. *Journal of Biological Chemistry* 2025. [doi:10.1016/j.jbc.2025.108167](https://doi.org/10.1016/j.jbc.2025.108167); [PMC11847077](https://europepmc.org/article/PMC/PMC11847077) | 52 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `aba-stomata-hydrogen-peroxide.md` | Abscisic acid increases hydrogen peroxide in mitochondria to facilitate stomatal closure. *Plant Physiology* 2023. [doi:10.1093/plphys/kiac601](https://doi.org/10.1093/plphys/kiac601); [PMC10152677](https://europepmc.org/article/PMC/PMC10152677) | 88 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Each document names its authors in full, as published; the table names the first authors where the list is short enough to read.

**How they were made.** `source/build.py` downloads each article's full-text XML from Europe PMC and writes it as Markdown with the clinical suite's converter (`eval/clinical/source/jats2md.py`), with displayed equations kept as the CS suite keeps them. It refuses an article whose licence is not CC BY 4.0. The article's own text is kept, unchanged: the title, authors, journal, licence statement, abstract, sections, tables (one row per line), references and acknowledgements. These are the changes made, as the licence asks to be told:

- figures are kept as their captions only, so a value shown only in a panel is in the suite only where the caption or the text gives it;
- supplementary material is left out, which for these papers holds many of the per-figure statistics;
- merged table cells become single cells, so some rows have fewer cells than their header;
- displayed and inline equations are flattened to the text of their symbols, losing superscripts;
- tables a publisher floats after the article are placed after the paragraph that first cites them.

To rebuild them:

```bash
python3 eval/lab/source/build.py
```

The clinical and CS documents rebuild unchanged with the same converter.

**Markdown, not PDF.** As for the clinical and CS suites, the papers are read as text, so the suite measures reading a bench paper's prose, figure captions and tables, not a PDF's layout: two columns, superscripts, Greek letters from symbol fonts. A PDF variant needs PDFs a person downloads; `eval/field/local/` takes them, with tasks, without committing them ([local documents](../field/README.md#local-documents)).

## The questions

Each task's comment names its kind, counted here by its first kind:

| Kind | `lab` | `labholdout` | What goes wrong |
| --- | --- | --- | --- |
| Name: a result belonging to one of two names one character apart | 10 | 3 | Pparγ or Pparδ for Pparα; R273H for Y220C; slc13a5b for slc13a5a; H3K4me3 for H3K27me3 |
| Direction: which way a gene, protein or treatment went | 6 | 1 | "More tolerant" turned into "less tolerant", "upregulates" into "downregulates", a knockdown rescue into an overexpression one. The answer that reverses it shares every other word with the source |
| Concentration: a dose or concentration whose prefix matters | 6 | 3 | mM for μM (a thousandfold error in a protocol), ng/mL for µg/mL, the agonist's 1 mg/kg for tamoxifen's 60 mg/kg, a nanomolar KD given as micromolar |
| Negative: a control or comparison with no effect | 3 | 1 | "Did not affect" turned into "reduced". Each such task has a fact group of the ways to say so ("did not", "no difference", "unaffected", …), so that answer fails |
| Result: a value given once, in a caption or a sentence | 2 | 1 | The other sex's value, the other time point, the other organelle |
| Alias: asked in a researcher's own spelling of a name | 2 | 1 | "IL-10" where the paper writes "IL10", "PPAR-alpha" for "PPARα", "RNAi" for "RNA-interference". Search matches words, so the name itself cannot be bridged |
| Comparison of two papers | 1 | 0 | Needs both papers' values |
| Not in the papers | 2 | 1 | A measurement another paper of the library reports: rapamycin for an mTOR inhibitor, vancomycin for daptomycin, maize for *Arabidopsis* |

`tests/field.test.ts` ("lab suite") checks:

- every fact is in its cited document, and every document is asked about;
- each suite has a negative and an unanswerable question, and `lab` a comparison over two papers;
- the papers keep their licence statements, and the names the suite exists for survive the converter (`PPARα`, `5a−/−`, `p53Y220C`, `2.4 ± 0.7 μM`);
- an answer that reverses a direction, swaps a unit's prefix (µg/mL for ng/mL, μM for mM) or names the other point mutant fails its task, and right answers in either notation pass.

`tests/retrieval.test.ts` keeps search on these papers at least where it is, and records the alias gap as its own test.

## Results

**Search alone** (`npm run bench:retrieval`, no model, BM25 over the ten papers):

| | |
| --- | --- |
| Cited documents found | 97.6% (40 of the 41 documents the 40 answerable questions cite) |
| Answer passages found | 94.5% |
| Everything found | 39 of 40 |

For comparison, the clinical suite's search finds 96.7% of documents and 83.7% of passages (24 of 30 complete), and the CS suite's 97.2% and 82.6% (27 of 34).

**Search does better here than on the other papers' suites, and that is a limit of the suite, not a strength of search.** These papers are each about a different organism and system, so most questions name words that appear in one paper only ("daptomycin", "guard cells", "neuroblastoma"); and bench papers state a result in the text as well as in a figure, so the passage that answers is usually prose, not a table cell. The one miss is `l28`, over two papers, which search finds one of.

**The alias gap, measured.** The three alias questions all retrieve, but not because the name matched: the rest of the question finds the paper. Searching the name alone shows the gap (`tests/retrieval.test.ts`, "does not find the IL10 paper for a researcher's own spelling of its name"):

| Query | The three papers search returns |
| --- | --- |
| `IL10` | the IL10 paper |
| `IL-10` | the cabozantinib, daptomycin and methanol dehydrogenase papers — **not** the IL10 paper |
| `PPARα` | the PPARα paper |
| `PPAR-alpha` | the PPARα paper (its "ppar" part token bridges it) |

So a question asking about "IL-10" in a library of papers that each use their own terms is carried by its other words; in a researcher's real library, where many papers are about the same pathway, it would not be. That is the gap [recommendation 3 of the audit](../field/README.md#laboratory-units-opposites-and-names-0710-defect-fix) addresses — matching gene and protein names however they are written — and this test is what should fail when it is fixed.

### The first model runs (0.72.0)

Both models ran on llama.cpp `0c1e570` (the copy vendored in llama-cpp-python 0.3.36, since github.com is not reachable from the container), built portably (`-DGGML_NATIVE=OFF`), on CPU in a 4-core cloud container (Intel Xeon @ 2.10GHz, 16 GB), at 4,096 tokens of context, in constrained mode, with the same Q4_K_M files as the other suites:

```bash
llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites lab,labholdout --out eval/results/lab-0.72-qwen3.5-4b-q4km.json
```

The build is the one the CS suite's runs used, not the clinical and field runs', and runs on another build or CPU do not repeat task by task ([field README](../field/README.md#runs-repeat-on-one-machine-not-across-machines)). Compare these figures with other suites' as totals, not task by task.

Re-scored with the one task defect below fixed (`npm run bench:rescore`), which no model run repeats:

| Model | `lab` | `labholdout` | Labelled **Quotes found**, wrong | Median time per question | Report |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | **28/32 (88%)** | 10/11 | **1 of 28 (4%)**: 1 of 20 and 0 of 8 | 107 s | [json](../results/lab-0.72-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 22/32 (69%) | 9/11 | 4 of 19 (21%): 3 of 11 and 1 of 8 | 50 s | [json](../results/lab-0.72-qwen3.5-2b-q4km.json) |

As run, before the defect fix, 4B passed 27 of 32 with 2 of 28 labelled answers wrong; 2B's figures do not change.

For comparison, on the clinical suite 4B passes 19 of 23 (83%) and on the CS suite 17 of 26 (65%). **Bench papers are the easiest of the three paper suites for 4B**, for the same reason search does well on them ([above](#results)): each paper is about its own organism, and a bench paper states its result in prose as well as in a figure. 4B's green label is wrong once in 28, under the design's 10% target; 2B's is wrong once in five, as on the clinical (36%) and CS (33%) papers.

`lab` by kind, re-scored (`labholdout` is read only as totals):

| Kind | 4B | 2B |
| --- | --- | --- |
| Name | 8/10 | 6/10 |
| Direction | **6/6** | 5/6 |
| Concentration | **6/6** | 3/6 |
| Negative | **3/3** | **3/3** |
| Result | 1/2 | **2/2** |
| Alias | **2/2** | 1/2 |
| Comparison of two papers | 0/1 | 0/1 |
| Not in the papers | **2/2** | **2/2** |

#### The 0.71.0 laboratory checks fired once in 86 answers, and that once was a false positive

**This is the suite's main result, and it does not confirm what the audit expected.** The suite was built to show what the laboratory units, opposites and names rules of 0.71.0 gain on text a model writes. Recomputing every recorded answer's sentence marks with this tree and with the tree before those rules (`798e792^`, the same reports, the same quotes) isolates their effect exactly:

| | 4B | 2B |
| --- | --- | --- |
| Answers whose sentences are marked, with the rules | 7 | 13 |
| Answers whose sentences are marked, without them | 7 | 13 |
| Sentences the rules marked that were backed before | 0 | **1** |
| Labels changed | 0 | 0 |
| Task results changed | 0 | 0 |

The single firing is 2B's `l07`, and it is a **false positive on a right answer**. Asked whether PPARαBATKO mice differed in body weight, 2B answered, rightly, that "PPARα deletion did not alter body weight gain in HFD-induced obese mice, meaning the body weight of PPARαBATKO mice was similar to that of control mice", quoting Figure 2's legend: "BAT specific deletion of PPARα does not alter glucose tolerance or body weight gain in HFD-induced obese mice." The names rule marks the sentence because `PPARαBATKO`, a Greek-letter name, is not in that quote, which says only `PPARα`; the genotype is the paper's own, three paragraphs away. Removing the name from the sentence makes it backed again, which is how the rule was identified. The answer's label does not change — its first sentence was already marked, by the older checks — and the task still passes, so nothing a user would see differs. But the mark is wrong, and it points at a real gap in the rule: a name that is a **compound of a backed name** (`PPARα` + `BATKO`) counts as absent. **Fixed at 0.74.0** ([write-up](../field/README.md#a-backed-name-with-a-plain-suffix-0740-defect-fix)): a name that adds a **plain suffix** to a name the quotes give is backed, where the suffix is letters and digits and does not begin with a Greek letter's name. So `PPARαBATKO` is backed by `PPARα`, while `TNF-β` is still not backed by `TNF`, nor `CD45+` by `CD45`, because there the suffix is the distinguishing character itself. Re-scoring every recorded report, that one sentence is the only change in 7,321 answers, and no label or task result moves.

**Why the rules found nothing to catch.** The audit's 22 probe sentences were written by hand, each carrying one wrong unit, direction or name while every other word matched a real quote. Neither model wrote such a sentence over these ten papers. 4B answered every concentration question right (6/6, prefixes included) and every direction question right (6/6). Where the models were wrong, they were wrong in ways no word rule can see:

- **A value invented wholesale** (2B's `l04`): "reduced by approximately 50% in female mice and by approximately 60% in male mice", where the paper says up to 97% and 83%. The quote check and sentence check both rejected it (0 of 1 sentences backed), so it was not labelled — the older checks doing their job.
- **A dose in the wrong unit entirely** (2B's `l06`): asked the daily dose of the β3-adrenergic agonist (1 mg/kg), 2B answered "100 μg/kg/day". This is the closest thing here to the error the unit rule is for, and the unit rule did not catch it: that rule marks a sentence only when the quotes give *the same number* another unit, and no quote gives 100. The number check marked it instead, and the answer was not labelled.
- **The value never found** (4B's `l04`): 4B read Figure 1C's legend and the paragraphs around it and answered that the documents "do not contain the specific numerical values"; the sentence giving them is in the results text it did not reach. 2B's `l08` likewise returned no answer for the daptomycin MIC.
- **Half an answer, labelled Quotes found** (2B's `l22`): asked what ADP-ribose changed BmMDH2's KM *from and to*, 2B answered "80 ± 20 μM" alone, inside a quote that gives both values. The CS suite recorded the same pattern (`cs09`).
- **A real quote that does not answer the question** (2B's `l27`): asked what happened to the ABA-induced ROS increase in the quintuple receptor mutant (it was lost), 2B answered with the noun phrase "ABA-induced ROS increase in guard cell mitochondria".
- **One side of a both-sided sentence** (2B's `l17`): asked which manipulation of MAP1B rescued the migratory defects (knockdown), 2B answered "MAP1B overexpression", from a quote that names both: "We show MAP1B overexpression in Fmr1-mutated neurons and rescue the migratory defects through RNA-interference-induced KD." A quote stating both sides of a pair backs either, by the rule's own design ([0.71.0 limits](../field/README.md#laboratory-units-opposites-and-names-0710-defect-fix)), so this is the documented limit meeting a real answer.
- **An unanswerable question answered anyway** (2B's `lh10`): asked for a maize stomatal aperture, which no paper measures, 2B gave *Arabidopsis* timings. 4B refused both of its unanswerable questions.
- **An incomplete answer** (4B's `l16`): asked by how much MAP1B was raised in Fmr1-null mice (1.6×), 4B answered that "elevated levels of MAP1B were detected" without the number.
- **A number from the wrong place** (4B's `l28`): in the two-paper question it gave Pparα's reduction as "approximately 50%" where the paper says 97% in females, while naming both zebrafish paralogs right. Search finds only one of that question's two papers ([above](#results)).

So the honest reading: **the 0.71.0 rules are a guard against an error these two models did not make on these ten papers.** They cost no label here, and their one mark was wrong. Whether they ever fire usefully needs a model that writes more confidently wrong sentences, or papers whose values invite a prefix slip. What does reach a green label on these papers is semantic, and the next section is the clearest instance.

#### One wrong answer kept its green label, and every check agreed with it

4B's `l03` is the false reassurance the suite was built to catch, and it shows why the word checks cannot be the last line.

- **The question:** in the IL10 chicken study, what effect did the heterozygous IL10 knockout have on pathogen clearance and inflammation?
- **The paper:** "Neither the heterozygous IL10 knockout nor a homozygous IL10 enhancer mutation had a major effect on pathogen clearance or inflammation in any of the challenge models."
- **4B's answer:** "the heterozygous IL10 knockout (which resulted in reduced expression of IL10) led to increased pathogen clearance at the expense of increased inflammation."
- **Its quote, real and word for word,** from the introduction: "We describe the lack of dosage compensation in heterozygous mutation and present evidence that the reduced expression of IL10 leads to increased pathogen clearance at the expense of increased inflammation."

Every check passed it: the sentence check found 1 of 1 sentences backed, the model's review answered "yes", and the cross-check, shown the passages without the answer, read out "increased pathogen clearance at the expense of increased inflammation" and agreed. The answer's words all come from its quote, so no word check can see the error; the quote is about reduced IL10 expression in general, and the sentence that speaks of the heterozygote says the opposite. This is [audit finding F2](../../docs/ai-ml-audit.md#f2-high-the-word-checks-pass-contradictions-and-the-self-review-rarely-catches-them) on a bench paper: the model's own review confirms its own reading of its own quote.

**What would catch it** is not another word rule but a look for the source's own sentence about the thing asked. The answer attributes to the heterozygote a claim the paper makes about something else, and the paper's sentence naming the heterozygote contradicts it; nothing in the pipeline looks for a contradicting sentence in a document the model read. `inSourceSupport` already searches the read documents for a passage that would back a marked sentence ([field README](../field/README.md)); the mirror of it — a passage that denies a *backed* sentence — is a change this suite could measure, and is left to its own change under [the rule](../field/README.md#rule-for-prompt-and-guard-changes).

#### One task defect, fixed at 0.72.0

**`l01` asked for a word the paper does not use.** Its fact group listed "prevented autocrine inhibition" without an article, so 4B's answer — "The absence of IL10 prevented **the** autocrine inhibition of nitric oxide production in macrophages", right and quoting the abstract word for word — matched none of its options and failed. The group now also accepts "prevented the autocrine inhibition" and "prevents (the) autocrine inhibition". Only the facts changed, not the question, so `bench:rescore` gives the exact effect and no model was run again:

| Model | `lab` as run | re-scored | Labelled wrong, as run | re-scored |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B | 27/32 | **28/32** | 2 of 28 | **1 of 28** |
| Qwen3.5-2B | 22/32 | 22/32 | 4 of 19 | 4 of 19 |

A wrong answer ("reduced nitric oxide production") still matches none of the group. 2B's answer to `l01` fails either way. Nothing else in either report changes.

**What the runs suggest, in order of what they would gain on this suite:**

1. ~~**Look for a sentence of the source that contradicts a backed sentence**~~ (`l03`). Done at 0.76.0 ([above](#three-changes-from-the-first-runs-0760)).
2. ~~**Reach the results text, not only the figure legend**~~ (4B's `l04`, `lh04`). Done at 0.76.0 ([above](#three-changes-from-the-first-runs-0760)): `l04` passes, and `lh04`, whose value is in a part search does not return at all, does not.
3. **Require every part of a "from what to what" question** (2B's `l22`), which the completeness check, asked of 2B, did not find missing.
4. **Look for a distinguishing name in the documents the model read**, not only in its quotes. The plain-suffix fix of 0.74.0 covers `l07`; a name the paper uses in another form still needs the read documents, as `inSourceSupport` uses them for sentences.
5. Match gene and protein names however they are written. **Measured at 0.76.0 before building anything:** every one of the ten papers is found by the spelling it uses for a key name, and 8 of 28 spellings a researcher might type are not — a hyphen or space inside a name ("IL-10" for "IL10", "mec A", "H3K27 me3", "Bm MDH2") and a Greek letter written as its name ("PPARalpha"). `tests/retrieval.test.ts` records those misses, and should fail when a change bridges them.
6. **Europe PMC's synonym option: measured and dropped.** Asked with `synonym=TRUE`, Europe PMC *lost* 2 of 6 of these papers that it found with the option off, and gained none: the IL10 paper's query goes from 436 hits to 3,550 and the paper falls off the first page. Kovrune keeps the five best of 25 candidates, so a wider hit set pushes the right paper out. Not adopted.

### Three changes from the first runs (0.76.0)

The runs above named four things to try. Three are done here, and one was measured and dropped.

- **Where a figure is discussed** (`figuresDiscussedElsewhere` in `src/tools/search.ts`, `figureNote` in `src/tools/research.ts`). A paper gives a figure's values in the prose that cites it, while the legend repeats the design, so search ranks the legend high and the prose that answers sits elsewhere: 4B read Figure 1's legend and Figure 6's and answered that the documents "do not contain the specific numerical values", though the sentence citing "(Figure 1C)" gives both (`l04`). A part that holds a legend now ends with where that figure is discussed — "[Figure 1 is discussed in ppara-brown-adipocytes#13.]" — the mirror of [0.73.0's pointer](../cs/README.md#four-changes-from-the-first-runs-0730) from prose to a table it cites. At most two figures are named, and shortening an old read drops the note.
- **A sentence of a source that says otherwise** (`contradictedSupport` in `src/agent/support.ts`). The one wrong answer that kept a green label, `l03`, quoted the introduction's sentence about reduced IL10 expression to say what the *heterozygous* knockout did, while the paper's own sentence about the heterozygote denies it. The answer and that sentence share two words in five, so no comparison between them can see it; what marks it is the **question**, which the paper's sentence covers to 78% while denying it. So the documents the model read are searched for a sentence that covers three quarters of the question's content words and speaks with a negation or denies significance, where the answer does neither. Such a sentence takes the label and is shown to the reader as **Quotes found, a source says otherwise** (`describeStatus`), with the sentence itself. A sentence inside a verified quote is skipped, so an answer that quotes a denial and reports it is not accused of contradicting it.
- **A preprint's published version** (`publishedVersion` in `src/sources/europepmc.ts`). Europe PMC links a preprint to its published version ("Preprint of"); that version's reference and PMID now head the preprint's text, beside the retraction and protocol notes. Nothing in this suite exercises it — its papers are all published — so it is a feature with a unit test, not a measured change.

**The threshold of the contradiction check is fitted to one answer**, the only instance in 86. That is a reason to judge it by what it costs rather than by what it gains, which is what the measurement below does.

#### What the three were measured against

**Search alone** (`bench:retrieval`): unchanged on every suite, as all three changes act after search — the figure note when a part is read, the other two after the answer. `tests/retrieval.test.ts` keeps its floors.

**Recorded answers** (`bench:rescore --labels` on each of the 132 reports, 7,321 answers): **exactly one line changes**, `l03` losing its label, and it is a wrong answer. No right answer loses its label, no sentence count moves and no task result changes. This is the whole cost of the contradiction check over everything recorded, and it satisfies the rule stated before it was written: adopt only if it costs no right answer its label and takes the label from at least one wrong one.

**The suites the rule protects cannot change.** The figure note reaches only a part that holds a figure's legend whose figure another part discusses. Counted over every library: 0 of the research and unanswerable parts, 0 of 2 pdf parts, 0 of 61 field parts (so holdout and multi too), 0 of 80 office, 0 of 415 clinical, 0 of 13 engineering — and 23 of 534 CS parts and 53 of 451 lab parts. So no run of the protected suites can differ, and none was made for them.

**These runs were made before `main`'s 0.75.0 turned llama-server's prompt cache off.** All four — both baselines and both changes — ran with the cache on, as every earlier run in this file did, on one server and one model file per model, so the pairing holds and the comparison is between the code versions. But 0.75.0 was adopted because with the cache the same request can get another reply depending on what ran before it, so a task-by-task repeat of these runs under the new setting may differ, and the totals are the part to trust. Re-running the pair with `cache_prompt: false` is the way to confirm them.

**Models, on the lab suites.** `bench:replay` could not shorten this: the 0.72.0 recordings no longer replay even on unmodified `main`, because 0.73.0's chunking change moved the parts (`main` against `main` gives the same 34 undecidable tasks). So a fresh baseline was run on `main` at 0.74.0, on the same machine, build and model files as the change.

| Model | Suite | Before (`main`) | After | Gained | Lost | p (McNemar) |
| --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | `lab` | 27/32 | **29/32** | 2 | 0 | 0.50 |
| Qwen3.5-4B | `labholdout` | 9/11 | 9/11 | 0 | 0 | 1 |
| Qwen3.5-2B | `lab` | 20/32 | **21/32** | 1 | 0 | 1 |
| Qwen3.5-2B | `labholdout` | 9/11 | 9/11 | 0 | 0 | 1 |

Neither model lost a task, and neither held-out total fell. 4B gained `l04`, the task the figure note was written for, and `l28`; 2B gained `l07`, whose answer the 0.71.0 names rule had marked and 0.74.0 unmarked. With so few discordant tasks McNemar's p cannot be small (2 gained and 0 lost gives 0.5), so this shows no harm and points the right way, as the rule's recorded decisions do. **The mechanism is confirmed, not assumed:** in the new run 4B read `ppara-brown-adipocytes#14`, the Figure 1 legend, then read `#13`, the part the note points to, and answered "reduced by up to 97% in female mice and 83% in male mice". Labelled answers that are wrong: on 4B, 0 of 25 before and 0 of 26 after; on 2B, 5 of 24 before and 5 of 25 after, the share 2B shows on every paper suite.

**`l03` answered itself this time.** In the new run 4B's first answer was rejected by the read-before-answering guard, and its second said "neither the heterozygous IL10 knockout nor a homozygous IL10 enhancer mutation had a major effect" — the right answer — so the contradiction check had nothing to fire on. The error it guards against is not deterministic: it is in the recorded 0.72.0 run, where rescoring shows the check removing its label. A guard is worth having for an error a model makes some of the time, but one run cannot show it firing.

**The CS suites were run at 0.77.0**, and they narrowed the rule: a part that holds table rows takes no figure note, because on `cs04` the note sent 4B away from the table it was reading and its quote began mid-row ([CS suite](../cs/README.md#the-figure-note-and-why-it-is-not-given-to-a-tables-part-0770)). All 53 of this suite's noted parts keep their note, so the figures above stand unchanged. Still not measured: both models' protected suites, which the count above shows cannot change.

## Limits

- **Journal papers with full text in Europe PMC**, so the sample leans to *eLife*, *PLOS*, Elsevier and ASM. bioRxiv preprints, which much of this literature circulates as, are not here.
- **Text, not PDF:** see above.
- **No supplementary data and no figure panels.** Much of a bench paper's numbers live there, and a question whose answer is only in a panel could not be asked. This is the biggest gap between the suite and a researcher's real question.
- **One author** wrote the questions, as for the other suites, reading each paper's abstract, results and methods; they use the papers' own terms except the three alias questions. A biologist reviewing the questions and facts would make the suite stronger. Changes to a fact are made before a run, never to fit one.
- **Fields:** immunology, metabolism, microbiology, epigenetics, cancer cell biology, neuroscience, enzymology and plant physiology. No structural biology beyond one crystallography table, no ecology, no human genetics or GWAS, no single-cell or sequencing-pipeline papers.
