# Clinical suite

Questions over clinical trial reports (harness 0.60.0). The other suites' documents are Wikipedia leads, a software licence, Kovrune's own documentation, and made-up Office files. None has an effect size, a confidence interval, a dose or a negative result, which is where reading a trial goes wrong. An audit of Kovrune from a health sciences researcher's point of view found that the sentence check passed exactly those errors, and that no suite could show how often ([clinical checks, 0.59.0](../field/README.md#clinical-units-directions-and-significance-0590-defect-fix)). This suite is what can.

```bash
npm run bench:endpoint -- --model <model> --suites clinical,clinicalholdout --modes constrained --out eval/results/<name>.json
```

`clinical` (23 questions) may be looked at task by task while a change is developed; `clinicalholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the papers before any model ran on them, and are not changed to fit a run. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

## The documents

Ten open-access trial reports, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), chosen to cover what a health sciences researcher reads:
- **Designs:** individually randomised trials, a crossover trial, a stepped wedge cluster trial, and a 50-year follow-up.
- **Results:** positive and negative primary outcomes.
- **Journals:** *The Lancet*, which prints decimals as "0·82" and thousands as "14 069", and *BMC Medicine* and *PLOS Medicine*, which print "0.82".
- **Overlap on purpose:** three trials in Malawi, two in pregnant women with malaria or anaemia, C-reactive protein measured in three, and numbers that differ only by arm, row or analysis.

They are their own library (`clinicalLibrary` in `eval/harness/field.ts`): a researcher's folder of papers, not the field documents.

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `typhoid-vaccine-malawi.md` | Priyanka D Patel et al. Efficacy of typhoid conjugate vaccine: final analysis of a 4-year, phase 3, randomised controlled trial in Malawian children. *Lancet* 2024. [doi:10.1016/S0140-6736(23)02031-7](https://doi.org/10.1016/S0140-6736(23)02031-7); [PMC10850983](https://europepmc.org/article/PMC/PMC10850983) | 49 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `iv-iron-pregnancy-malawi.md` | Sant-Rayn Pasricha et al. Ferric carboxymaltose versus standard-of-care oral iron to treat second-trimester anaemia in Malawian pregnant women: a randomised controlled trial. *Lancet* 2023. [doi:10.1016/S0140-6736(23)00278-7](https://doi.org/10.1016/S0140-6736(23)00278-7); [PMC10193370](https://europepmc.org/article/PMC/PMC10193370) | 62 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `ipt-malaria-pregnancy.md` | Hellen C Barsosio et al. Chemoprevention for malaria with monthly intermittent preventive treatment with dihydroartemisinin–piperaquine in pregnant women living with HIV on daily co-trimoxazole in Kenya and Malawi: a randomised, double-blind, placebo-controlled trial. *Lancet* 2024. [doi:10.1016/S0140-6736(23)02631-4](https://doi.org/10.1016/S0140-6736(23)02631-4); [PMC10865779](https://europepmc.org/article/PMC/PMC10865779) | 68 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `cruciferous-blood-pressure.md` | Emma L. Connolly et al. Cruciferous vegetables lower blood pressure in adults with mildly elevated blood pressure in a randomized, controlled, crossover trial: the VEgetableS for vaScular hEaLth (VESSEL) study. *BMC Medicine* 2024. [doi:10.1186/s12916-024-03577-8](https://doi.org/10.1186/s12916-024-03577-8); [PMC11367748](https://europepmc.org/article/PMC/PMC11367748) | 61 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `copcov-hydroxychloroquine.md` | William H. K. Schilling et al. Evaluation of hydroxychloroquine or chloroquine for the prevention of COVID-19 (COPCOV): A double-blind, randomised, placebo-controlled trial. *PLOS Medicine* 2024. [doi:10.1371/journal.pmed.1004428](https://doi.org/10.1371/journal.pmed.1004428); [PMC11392261](https://europepmc.org/article/PMC/PMC11392261) | 48 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `folic-acid-pregnancy.md` | L. Hilman et al. Cognitive benefits of folic acid supplementation during pregnancy track with epigenetic changes at an imprint regulator. *BMC Medicine* 2024. [doi:10.1186/s12916-024-03804-2](https://doi.org/10.1186/s12916-024-03804-2); [PMC11650848](https://europepmc.org/article/PMC/PMC11650848) | 71 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `azithromycin-severe-malaria.md` | Roisin Connon et al. Azithromycin in severe malaria bacterial co-infection in African children (TABS-PKPD): a phase II randomised controlled trial. *BMC Medicine* 2024. [doi:10.1186/s12916-024-03712-5](https://doi.org/10.1186/s12916-024-03712-5); [PMC11542398](https://europepmc.org/article/PMC/PMC11542398) | 53 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `carrageenan-insulin.md` | Robert Wagner et al. Carrageenan and insulin resistance in humans: a randomised double-blind cross-over trial. *BMC Medicine* 2024. [doi:10.1186/s12916-024-03771-8](https://doi.org/10.1186/s12916-024-03771-8); [PMC11590543](https://europepmc.org/article/PMC/PMC11590543) | 39 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `betamethasone-50-years.md` | Anthony G B Walters et al. General health and social outcomes 50 years after exposure to antenatal betamethasone: follow-up of a randomised controlled trial. *BMC Medicine* 2024. [doi:10.1186/s12916-024-03732-1](https://doi.org/10.1186/s12916-024-03732-1); [PMC11533403](https://europepmc.org/article/PMC/PMC11533403) | 40 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `crp-community-health-workers.md` | Emily J Ciccone et al. Point-of-care C-reactive protein measurement by community health workers safely reduces antimicrobial use among children with respiratory illness in rural Uganda: A stepped wedge cluster randomized trial. *PLOS Medicine* 2024. [doi:10.1371/journal.pmed.1004416](https://doi.org/10.1371/journal.pmed.1004416); [PMC11407643](https://europepmc.org/article/PMC/PMC11407643) | 55 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

**How they were made.** `source/jats2md.py` downloads each article's full-text XML from Europe PMC and writes it as Markdown. It refuses an article whose licence is not CC BY 4.0. The article's own text is kept, unchanged:
- the title, authors, licence statement, abstract, sections, references and acknowledgements;
- each table as one row per line, its cells in order, with its caption and footnotes;
- citations in brackets ("[12]").

These are the changes made, as the licence asks to be told:
- figures are kept as their captions only;
- supplementary material is left out;
- merged table cells become single cells, so some rows have fewer cells than their header.

To rebuild them:

```bash
python3 eval/clinical/source/jats2md.py
```

**Markdown, not PDF.** Europe PMC serves its PDFs behind a browser check, which a script cannot pass, so the papers are read as text. The suite therefore measures reading a trial report, not reading a PDF's layout: two columns, tables drawn as text, superscript citations joined to the word before them. A PDF suite needs PDFs a person downloads; `eval/field/local/` takes them, with tasks, without committing them ([local documents](../field/README.md#local-documents)).

## The questions

| Kind | `clinical` | `clinicalholdout` | What goes wrong |
| --- | --- | --- | --- |
| Effect: an effect size and its interval | 7 | 3 | Another estimate next to it: the 80·7% of an earlier analysis next to the final 78·3%; the incidence rate ratio next to the risk ratio; the meta-analysis next to the trial |
| Negative: a result that was not significant | 4 | 2 | "Did not reduce" turned into "reduced", often with the right number. Each such task has a fact group of the ways to say so ("did not", "no significant", "similar", …), so that answer fails |
| Dose: a dose or reading whose unit matters | 5 | 2 | µg for mg, one drug's dose for another's, the double dose for the first dose |
| Table: a value given only in a table | 3 | 1 | The next column (the other arm), or the unadjusted estimate for the adjusted one |
| Design: who was studied, how many | 1 | 1 | The planned size for the enrolled one |
| Comparison of two papers | 1 | 0 | Needs both papers' numbers |
| Not in the papers | 2 | 1 | A plausible question about a population or outcome the trial did not study |

`tests/field.test.ts` ("clinical suite") checks:
- every fact is in its cited document;
- every document is asked about;
- each suite has a negative and an unanswerable question;
- an answer that drops a negation, gives µg as mg, or reverses a direction fails its task.

## Results

**Search alone** (`npm run bench:retrieval`, no model, BM25 over the ten papers):

| | |
| --- | --- |
| Cited documents found | 96.7% (29 of 30 answerable questions) |
| Answer passages found | 84.1% |
| Everything found | 24 of 30 |

The questions where search falls short:
- **`c05` and `ch08`, values only in tables:** the row's words ("Age, years", "oral health fair/poor") are few.
- **`c11` and `ch06`:** search finds the paper but not the passage that answers.
- **`c08`:** one of the three answer passages is missed.
- **`c21`, the comparison of two papers:** search finds neither expected passage, nor the typhoid paper.

These are the gaps a researcher meets: tables, and questions that span papers. Search is lexical, with no synonyms. A question about a "heart attack" would not find "myocardial infarction". So every question here uses the papers' own terms, which flatters search.

**Models: not yet run.** A model could not be run where the suite was written: llama.cpp could not be built there. The plan, on the project owner's machine or a cloud container:

```bash
llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites clinical,clinicalholdout --out eval/results/clinical-0.60-qwen3.5-4b-q4km.json
```

Then the same with Qwen3.5-2B. Record, for each model:
- **Passed,** in total and by kind.
- **False reassurance:** answers labelled **Quotes found** that are wrong, against the design's 10% target (`docs/design.md` §1.6). This is the number the clinical checks of 0.59.0 exist to lower. `bench:rescore` on the same report with `src/agent/support.ts` as it was at 0.58.0 shows how many wrong answers they caught.
- **Negative results:** how many answers turned a negative into a positive, and with which label.

## Limits

- **Ten papers, 33 questions.** Enough to see whether Kovrune's labels can be trusted on trial reports, not to estimate a rate finely. One question is about 3% of a suite.
- **Written by one author, from the papers, without a clinician's review.** A health sciences researcher reviewing the questions and facts would make the suite stronger. Changes to a fact are made before a run, never to fit one.
- **The facts are substrings.** "No significant" in an answer passes a negative task, even if the answer goes on to say the opposite. The facts make the common error fail, not every error.
- **English only, and Markdown only** (above).
