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

### Model runs

**Not yet run.** The suite is committed with its documents, questions and search figures; the model runs on both Qwen3.5 models come next, under [the rule for prompt and guard changes](../field/README.md#rule-for-prompt-and-guard-changes), and will be recorded here as the clinical and CS suites' first runs are. Rescoring every recorded report with this change gives the same label for every one of 6,699 answers: the suite adds tasks and a library, and changes no check.

What the runs are expected to show, from the other suites' results and the 0.71.0 audit:

- whether the laboratory units, opposites and names checks of 0.71.0 catch anything a model actually writes, which no recorded run can show;
- whether 4B's **Quotes found** label stays under the design's 10% false-reassurance target on bench papers, as it does on trial reports (2 of 20) and CS papers (1 of 13);
- whether the name questions behave like the CS suite's acronym questions, which 4B answered 0 of 4 times.

## Limits

- **Journal papers with full text in Europe PMC**, so the sample leans to *eLife*, *PLOS*, Elsevier and ASM. bioRxiv preprints, which much of this literature circulates as, are not here.
- **Text, not PDF:** see above.
- **No supplementary data and no figure panels.** Much of a bench paper's numbers live there, and a question whose answer is only in a panel could not be asked. This is the biggest gap between the suite and a researcher's real question.
- **One author** wrote the questions, as for the other suites, reading each paper's abstract, results and methods; they use the papers' own terms except the three alias questions. A biologist reviewing the questions and facts would make the suite stronger. Changes to a fact are made before a run, never to fit one.
- **Fields:** immunology, metabolism, microbiology, epigenetics, cancer cell biology, neuroscience, enzymology and plant physiology. No structural biology beyond one crystallography table, no ecology, no human genetics or GWAS, no single-cell or sequencing-pipeline papers.
