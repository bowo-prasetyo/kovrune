# Clinical suite

Questions over clinical trial reports (harness 0.60.0). The other suites' documents are Wikipedia leads, a software licence, Kovrune's own documentation, and made-up Office files. None has an effect size, a confidence interval, a dose or a negative result, which is where reading a trial goes wrong. An audit of Kovrune from a health sciences researcher's point of view found that the sentence check passed exactly those errors, and that no suite could show how often ([clinical checks, 0.59.0](../field/README.md#clinical-units-directions-and-significance-0590-defect-fix)). This suite is what can.

```bash
npm run bench:endpoint -- --model <model> --suites clinical,clinicalholdout --modes constrained --out eval/results/<name>.json
```

`clinical` (23 questions) may be looked at task by task while a change is developed; `clinicalholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the papers before any model ran on them, and are not changed to fit a run. A fact that is plainly wrong, such as one asking for something its question does not, is fixed as a task defect: it is recorded here with the scores before and after, which `bench:rescore` gives exactly from the recorded answers (`c03` and `c20`, 0.61.0). Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

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

### The first model runs (0.60.0)

Both models ran on llama.cpp `09338b8`, built portably (`-DGGML_NATIVE=OFF`), on CPU in a 4-core cloud container, at 4,096 tokens of context, in constrained mode, with the same Q4_K_M files as the field suite:

```bash
llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites clinical,clinicalholdout --out eval/results/clinical-0.60-qwen3.5-4b-q4km.json
```

| Model | `clinical` | `clinicalholdout` | Labelled **Quotes found**, wrong | Median time per question | Report |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | 17/23 (74%) | 7/10 | 3 of 20 (15%): 2 of 15 and 1 of 5 | 101 s | [json](../results/clinical-0.60-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 13/23 (57%) | 4/10 | 5 of 14 (36%): 2 of 10 and 3 of 4 | 35 s | [json](../results/clinical-0.60-qwen3.5-2b-q4km.json) |

Re-scored at 0.61.0, with the two task defects below fixed (`npm run bench:rescore -- eval/results/clinical-0.60-qwen3.5-*.json`):

| Model | `clinical` | `clinicalholdout` | Labelled **Quotes found**, wrong |
| --- | --- | --- | --- |
| Qwen3.5-4B | **19/23 (83%)** | 7/10 | **2 of 20 (10%)**: 1 of 15 and 1 of 5 |
| Qwen3.5-2B | 13/23 (57%) | 4/10 | 5 of 14 (36%): 2 of 10 and 3 of 4 |

For comparison, the field suite's latest 4B baseline passes 80 of 89. On trial reports, 4B's green label is wrong 2 times in 20, at the edge of the design's target (under 10%). 2B's is wrong more than a third of the time.

`clinical` by kind, re-scored at 0.61.0 (`clinicalholdout` is read only as totals):

| Kind | 4B | 2B |
| --- | --- | --- |
| Effect | 6/7 | 4/7 |
| Negative | 4/4 (2/4 as run) | 3/4 |
| Dose | 5/5 | 3/5 |
| Table | 2/3 | 2/3 |
| Design | 0/1 | 0/1 |
| Two papers | 0/1 | 0/1 |
| Not in the papers | 2/2 | 1/2 |

**What went wrong.** The questions in `clinical`, answer by answer:

- **The planned sample size, given as the enrolled one (`c09`).** Both models answered that the VESSEL trial recruited 25 participants. They quoted "a desired sample size of 25 participants was calculated" (4B) and "we were unable to recruit the desired sample size of 25 participants" (2B). The trial recruited 18. Both quotes are real, the model's own review said yes, and both answers were labelled **Quotes found**. The 4B sentence passes the word check because "25" and "participants" are in the quote; the 2B answer, a bare "25", is inside a quote that covers the question. This is the error a researcher extracting data would most need caught. Since 0.62.0, a check does ([below](#a-target-is-not-a-count-0620)).
- **A short answer to another question (`c06`, 2B).** Asked for a risk ratio, 2B answered "15%". Its quote was "approximately 15% of women in the co-trimoxazole plus placebo group had evidence of at least one malaria infection". That is a proportion, from one arm. The model's review said yes, and its completeness check found the question's one part answered. So the answer was labelled **Quotes found**.
- **The answer not found, because search did not offer it (`c06` 4B, `c05`, `c21`).** For `c06`, the model's search returned three parts of the Discussion, which repeat its terms more often than the abstract's Findings, where the risk ratio is. The model read those parts and the ones around them, never the Findings, and answered "not found". `c05` (a value only in Table 1) and `c21` (two papers) were the questions search alone missed too.
- **Numbers made up, or taken from the wrong paper, caught by the quote check (2B).** In `c01`, 2B gave the vaccine's efficacy as 98.7%; the paper says 78·3%. In `c21`, it gave the typhoid trial's two arms, 14,069 and 14,061, as the sizes of the two trials. Their quotes were not in the papers, so neither answer was labelled.
- **A population the trial did not study (`c22`, 2B).** Asked about adults, 2B answered "80·7%": the children's efficacy at the earlier analysis. It was not labelled.
- **Negative results:** no answer turned a negative result into a positive one. Both models said "did not reduce" where the papers do.

**What the clinical checks of 0.59.0 changed in these runs.** These reports were re-scored with `src/agent/support.ts` as it was at 0.58.0 (`bench:rescore` in a worktree of `44cce55`). Two labels change, both on 4B:
- The right answer to `c01`, which quotes "78·3% (95% CI 66·3–86·1)", gains **Quotes found**: the "·" decimal.
- One held-out answer the scorer marks wrong gains it too, for the same reason. Held-out tasks are read only as totals, so it was not looked at.

The unit, direction and significance checks marked nothing: no model made those errors here.

**Two task defects, fixed in 0.61.0.** The runs showed two questions whose facts were wrong. Only the facts changed, not the questions, so the recorded answers are re-scored exactly; no model was run again:
- **`c03` asked for more than it said.** Its question is "did ferric carboxymaltose reduce the prevalence of anaemia…?", but its facts also required the prevalence ratio, 0·92. Both models answered rightly that it did not, with the paper's sentence as their quote, and failed. 4B's answer was labelled **Quotes found**, so it counted as one of 4B's three wrong labelled answers, though it is right. The 0·92 group is dropped. 4B's answer now passes, and 4B's wrong labelled answers are 2 of 20. 2B's answer still fails: its quote was not found in the paper.
- **The ways to say "no difference" left out "no statistical difference" (`c20`).** 4B wrote "Yes, clinical failure occurred at a slightly lower frequency … but there was no statistical difference (OR 0.41, 95% CI: 0.09 to 1.83)". With "no statistical" in the list, it passes. Its substance is right; its "Yes" answers whether failure was lower, not whether it differed, which a reader may find misleading. The answer was not labelled **Quotes found**, so the label counts do not change.
- **Nothing else changes:** the other negative questions' answers, and both held-out suites' totals, score as before. `tests/field.test.ts` scores both 4B answers, and fails without the fix.

### A target is not a count (0.62.0)

Both models' wrong answers to `c09` were labelled **Quotes found**. They had taken the sample size the trial wanted for the number it recruited. Now a sentence that says how many were recruited, enrolled, randomised or included is not backed by a quote that gives that number only as a target (`countsBacked` in `src/agent/support.ts`). A bare count, such as "25", likewise no longer counts as found in such a quote for a question about recruitment.
- **What makes a number a target:** a planning word ("desired", "planned", "target", "intended", "anticipated", "required", "needed", "calculated", "aim", "goal") up to five words before it in the same clause, or "was/were calculated (required, planned…)" just after it. So "a desired sample size of 25 participants was calculated" gives 25 as a target. "18 of the planned 25 participants were enrolled" gives 18 as a count and 25 as a target.
- **What still passes:** a number that any quote gives as a count, and a sentence about the plan itself ("the planned sample size was 25").

**Effect, re-scored from the 0.60.0 runs** (`bench:rescore`, exact, since the check runs after the final answer):

| Model | `clinical` labelled, wrong | `clinicalholdout` labelled, wrong | Both |
| --- | --- | --- | --- |
| Qwen3.5-4B | 1 of 15 → **0 of 14** | 1 of 5 | 2 of 20 → **1 of 19** |
| Qwen3.5-2B | 2 of 10 → **1 of 9** | 3 of 4 | 5 of 14 → **4 of 13** |

- **What changed:** both `c09` answers lose the label, and nothing else in the 4,902 recorded answers of every report changes. No task passes or fails differently.
- **What 2B still gets wrong under the label:** 2B's remaining wrong labelled answer in `clinical` is `c06`, an arm's proportion given for a risk ratio.

**A fix to `bench:rescore` with it.** Rescoring had reused every recorded review. But the app asks the review only when the word checks pass, or, for Qwen3.5-4B, for a short answer. So 2B's "25", no longer backed, kept the label in a rescore, though the app would not ask its review and would not label it. `eval/rescore.ts` now uses a recorded review only where the app would ask for one. In the 4,902 answers, this changes one more label: a right short answer from `field-0.39-stemmer-qwen3.5-2b-q4km.json`, a measured experiment that was not adopted. Its review was recorded, but since 0.35.0 the app does not review 2B's short answers.

### A paper's first parts first (0.63.0, measured, not adopted)

In `c06`, 4B searched "monthly dihydroartemisinin–piperaquine daily co-trimoxazole pregnant women HIV malaria risk ratio". The three results were Discussion parts of the right paper (#44, #46, #33), which repeat those terms. The abstract's Findings (#3), which give the risk ratio, were not among them. The model read the Discussion and the parts around it, and answered "not found".

**Showing five results instead of three** was measured in 0.26.0 and not adopted: 2B's field suite fell. So this change ranked a long document's parts by position as well as relevance: a paper's abstract, a report's summary and a manual's overview say briefly what later parts say at length.

**First design: a weight on every first part, across documents. Rejected.** Part n's score was multiplied by 1 + 0.3 × e^(−(n−1)/3): ×1.30 for part 1, ×1.15 for part 3, ×1.04 by part 7. With 300 generated documents added to the field library, cited documents found fell from 93.5% to 88.3%, and complete tasks from 68 to 65. The first parts of documents that do not answer took the place of the one that does. A researcher's library is many papers, so this is the wrong way to fail.

**Second design: the weight ordered only a document's own parts** (`leadWeight` and `search` in `src/tools/search.ts`, on #141's branch). Relevance alone still decided which documents the results came from, and how many parts of each. Within a document, its parts were ranked by relevance times the weight. So a paper's abstract could take a slot from its own Discussion, but not from another paper.

**Search alone** (`bench:retrieval`; and the models' own searches recorded in the 0.60.0 runs, each re-run, counting the tasks where some search shows every fact):

| | Before | After |
| --- | --- | --- |
| `c06`'s recorded search | #44, #46, #33 | **#1, #3, #2** (the Findings) |
| Clinical: the models' recorded searches show every fact | 46 of 58 tasks | **52 of 58** |
| Clinical, the question as query: complete | 24 of 30 | 25 of 30 (`c08`, `c11` gain; `c04` loses its passage) |
| Field, the question as query | passages 93.3%, 69 complete | 92.1%, 68 complete (`f46` loses its passage) |
| Field, 4B's recorded searches (0.54.0) | 101 of 111 | 102 of 111 |
| Field + 300 or 1,000 generated documents | cited 93.5% / 92.2% | **unchanged**; one passage fewer (`f46`) |
| Research, pdf, holdout, multi, office | | unchanged |

The weight (0.3) and decay (3 parts) were chosen from six settings for the first design, and four for this one, on these measures. Heavier weights helped the clinical suite more but cost the multi and office suites. On #141's branch, the retrieval floors in `tests/retrieval.test.ts` were lowered by the one field passage lost (`f46`, the French question that headings also cost in 0.57.0); on `main` they are unchanged.

**Models, on the clinical suites** (same machine and build as the 0.60.0 runs; both runs re-scored with the 0.62.0 harness, so the 0.61.0 and 0.62.0 changes count on both sides):

| Model | `clinical` | `clinicalholdout` | Labelled **Quotes found**, wrong | Report |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B | 19/23 → 20/23 | 7/10 → 6/10 | 1 of 19 → 1 of 18 | [json](../results/clinical-lead-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 13/23 → 14/23 | 4/10 → 4/10 | 4 of 13 → 4 of 14 | [json](../results/clinical-lead-qwen3.5-2b-q4km.json) |

- **`c06` passes on both models.** 4B searched as before, read part 3, the Findings, and answered 0.45. That is what the change was for.
- **`c02` fails on both:** the mean age in the Vi-TT group, given only in Table 1. 4B read the abstract (#2) instead and answered "not found". This is the change's cost: a value that only a later part gives is shown less often.
- **The other changes vary from run to run:**
  - 4B gains `c09` and `c21` and loses `c20`, where it read the abstract's "similar" and answered "differed".
  - 2B gains `c03` and `c08` and loses `c15`.
  - Only 10 of 4B's 23 tasks took the same actions as before.
- **`clinicalholdout`** is one task lower on 4B, and the same on 2B.

**Not adopted.** The change helps the question it was made for, and costs about as much elsewhere:
- **The cost is built in:** the weight moves a paper's opening parts ahead of its later ones, and a value given only in a table or in the Results is in a later part (`c02` on both models, `c04` in search alone, `f46` in the field suite).
- **The gain is about one task either way:** the totals moved by one task in each direction.

The field and protected suites' runs the rule asks for were not made: with `bench:replay` (0.64.0) they would take about 5–6 hours here, for a change that is unlikely to be more than even. The code, the lowered floors and the write-up as proposed are on the branch of [#141](https://github.com/bowo-prasetyo/kovrune/pull/141), closed unmerged; the reports are [4B](../results/clinical-lead-qwen3.5-4b-q4km.json) and [2B](../results/clinical-lead-qwen3.5-2b-q4km.json).

**What `c02`, `c05` and `c06` share.** The model cannot see where in a paper a part is. In `c06` it read the Discussion without knowing the Findings were part 3; in `c02` and `c05`, Table 1 was a part it did not know to ask for. Re-ranking helps one of these and hurts the other. Showing the model a long document's outline (its section headings and table captions, with their part numbers) could let it read the Findings or Table 1 directly. That is the next change to measure on these suites.

### A long document's outline (#144, measured, not adopted)

Measured on an unmerged branch ([#144](https://github.com/bowo-prasetyo/kovrune/pull/144), closed), whose harness was numbered 0.65.0 before `main` gave that number to the [0.8B browser model](../../docs/m0-benchmark.md); its reports say 0.65.0. Its one defect fix, the overflow retry below, is adopted as 0.66.0.

The idea from the lead-weight experiment above: let the model see where in a paper each part is, instead of ranking parts by position. Reading a part of a document in four or more parts now appends, once per document and question, its outline: the parts that hold headings or table captions, with their first two (`src/documents/outline.ts`, `tools/research.ts`). For the IPTp trial, after reading part 44 the model sees "… #2 Methods; #3 Findings; … #18 Results; #19 Table 1: Baseline characteristics by study group; … #33 Discussion …". Reading the whole document gives the outline instead of a bare list of part IDs. An outline is cut at about 150 tokens; for the field suite's user guide it is about 120. Search is unchanged, so `bench:retrieval` is too.

**Models** (same machine and build as the 0.60.0 runs, re-scored with the current harness):

| Model | `clinical` | `clinicalholdout` | Labelled **Quotes found**, wrong | Report |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B | 19/23 → **21/23** | 7/10 → **8/10** | 1 of 19 → 1 of 21 | [json](../results/clinical-outline-qwen3.5-4b-q4km.json) |
| Qwen3.5-2B | 13/23 → 12/23 | 4/10 → 5/10 | 4 of 13 → 3 of 12 | [json](../results/clinical-outline-qwen3.5-2b-q4km.json) |

- **4B uses the outline.**
  - It gains `c05` (Table 1's mean age: it read parts 31, 19, 22, 21, 20, 23 and answered 22.2), `c06` (it read part 46, then part 3, the Findings, and answered 0.45) and `c21`.
  - It loses `c11`: it read six parts of the COPCOV paper, an earlier result had to be dropped, and its last reply was not valid JSON.
  - `c02`, which the lead weight lost, passes: it read part 8, then part 16, which holds Table 1.
  - Over `clinical`, it read 46 parts, against 82 for 2B.
- **2B does not use it.** It reads the same part again and again (`c02`: part 16 three times; `c06`: part 46 three times), with or without the outline: of its reads, 57 follow another read of the same document in both runs.
  - It loses `c02` with the right answer, 6.1 years, because its quote was not word for word in the paper.
  - The held-out suite gains one task.
  - Both look like run-to-run variation.

**A defect it found: the server refused a prompt as too long.** In the first 4B run, one held-out task's prompt reached 4,111 tokens against llama.cpp's 4,096, and the task ended in an error.
- **The cause:** the agent fits prompts by `estimateTokens` (3.5 characters a token), which counts ordinary text short. On a trial report's part it estimated 476 tokens where the model's tokenizer counted 549, and on the user guide's 507 where it counted 622. The outlines themselves are estimated close: 167 for 149, 118 for 119. The outline used up the slack that had hidden the estimate's error; no earlier recorded run met the error.
- **The fix:** on llama.cpp's `exceed_context_size_error`, the agent now fits the conversation to as much less as the prompt was over and asks the step again, up to three times (`contextOverflow` in `src/agent/agent.ts`). Only a task that would end in that error takes this path.
- **Measured with `bench:replay`:** replaying the 4B run on the fixed code called 32 tasks "same" and the errored one undecidable. That one was run again, finished without an error, and was merged into the report. 2B ran with the fix and met no error.

**Not adopted: the rule's runs.** By [the rule](../field/README.md#rule-for-prompt-and-guard-changes), the outline changes what the model reads, so research, unanswerable, pdf, field and holdout were run on both models: the change once with replies recorded, then `main` (`f274fdd`) on the tasks `bench:replay` said differ (76 of 160 on 2B, 74 on 4B), on the same machine and build.

- **First run: a defect in the outline.** On 4B, field fell from 80/89 to 78/89 (lost `f75`, `f83`, none gained). The MPL-2.0 underlines its headings ("5. Termination" over a line of dashes, Setext style), which `partHeadings` did not take, so its outline stopped at part 10 and left out Termination, Litigation and Exhibit A. The model took the outline as the whole document: it read parts 1 to 6 in order and answered "not found". These reports are kept as `field-outline-nosetext-*`.
- **The fix:** `partHeadings` takes Setext headings (a unit test). Of the 14 documents in the field and clinical libraries, only the MPL-2.0's outline changes, so the clinical results above stand. `bench:replay` against the first run found 19 tasks on 4B and 20 on 2B whose requests the fix changes, all about the licence; they were run again and merged with the others' recorded results.
- **With the fix:**

| Model | research | unanswerable | pdf | field | holdout |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | 19/22 → 19/22 | 8/8 → 8/8 | 4/4 → 4/4 | 80/89 → 80/89 (0 gained, 0 lost) | 34/37 → 34/37 |
| Qwen3.5-2B | 15/22 → 15/22 | 5/8 → 5/8 | 3/4 → 3/4 | 63/89 → 63/89 (+`f11`, `f52`; −`f51`, `f61`; p = 1) | 24/37 → 25/37 |

Reports: [4B base](../results/field-outline-base-qwen3.5-4b-q4km.json), [4B outline](../results/field-outline-qwen3.5-4b-q4km.json), [2B base](../results/field-outline-base-qwen3.5-2b-q4km.json), [2B outline](../results/field-outline-qwen3.5-2b-q4km.json).

Nothing regresses, but the field suite does not improve on either model, so the rule does not adopt the outline. Its gains are on the clinical suites, where long papers are what the questions are about; the field suite's long documents are a user guide, a licence and a design document, whose questions 4B already answers by search. The overflow retry is a defect fix in its own right, a unit test showing the error it handles, and is adopted on its own under the rule's defect clause as harness 0.66.0 ([field suite](../field/README.md#a-prompt-the-server-refuses-as-too-long-0660-defect-fix)).

### Europe PMC as a source (live, no model and with Qwen3.5-4B)

Europe PMC is one of the open sources the agent can search (`src/sources/europepmc.ts`). It reads an open-access paper in full from the same JATS XML these documents were made from, with `jats2md.py` ported to TypeScript (`src/sources/jats.ts`). `npm run bench:europepmc` checks it live, with no model:

- **Reading:** each of the ten papers, read through the source by its PMID, gives this suite's document byte for byte (10 of 10, 13 November 2026). So what the models were measured on here is what the app reads from Europe PMC.
- **Search:** each question with a document, searched as typed, the longest query a model could write. Without the function words a question is asked in ("what", "was", "the"), which Europe PMC otherwise required in a paper's full text, the paper is in the top five for 13 of 21 `clinical` questions (first for 5), against 9 with them, and for 6 of 9 `clinicalholdout` questions, against 3. The held-out suite was run once, after the change, and read only as totals.

**With a model.** Qwen3.5-4B on the 0.66.0 harness's machine and build, with Europe PMC as its only source and no documents, answered the first five `clinical` questions, scored as the suite scores, with the paper to cite named by its Europe PMC ID. This is a check, not a run of the suite: five questions, and Europe PMC's index changes. Two of five passed:

| Task | Result | What happened |
| --- | --- | --- |
| `c01` | pass | Found the trial with its first search, read it, and answered 78·3% (66·3–86·1) |
| `c02` | pass | Quoted "Mean (SD) 6·1 (3·3)" from Table 1, which the abstract does not give |
| `c03` | fail | The right answer ("did not reduce"), from the wrong paper: the later REVAMP-TT trial of ferric carboxymaltose in the third trimester (Nat Med 2025), which reports the same |
| `c04` | fail | Its searches ("REVAMP trial oral iron standard-of-care", and two more) found the later trial and a secondary analysis of the cohort, not the trial asked about; answered "not found" |
| `c05` | fail | Found a follow-up of the trial (postpartum outcomes, Lancet Glob Health 2024) and the later trial, read seven parts, answered "not found" |

So reading works, tables included, and the failures were finding the paper: a trial's name brings up the papers that followed it, which the suite's own library of ten did not have. The questions were written for that library, and name the trial as its readers would; in the open literature, "the REVAMP trial" is three papers. A question that names the year or journal, or asks the model to check that it has the primary report, is what a researcher would do; the agent does neither yet.

#### A trial's own report first (Europe PMC's ranking)

Europe PMC ranks a paper by a query's words anywhere in its full text, so the papers that followed a trial, which name it in their methods, came before its own report: for the model's search "REVAMP trial oral iron standard-of-care", the report was 16th, after a secondary analysis, two substudies, a cohort analysis and papers about anaemia care that cite it. Since then, the source asks for 25 results and shows the five whose title and abstract hold the largest share of the search words, that share raised by the paper's citations (× 1 + 0.3 log10(1 + citations); `rankHits` in `src/sources/europepmc.ts`), Europe PMC's order breaking ties. Results say when a paper is a secondary analysis, substudy or protocol, and a protocol's text starts with a note that it gives what was planned.

- **Search, no model:** each question searched as typed puts its paper first for 15 of 21 `clinical` questions (5 before) and in the top five for 16 (13), and first for 6 of 9 `clinicalholdout` questions (2) and in the top five for 8 (6), the held-out suite read as totals. Reading still gives the ten documents byte for byte.
- **The model's own searches,** from the run above: the REVAMP report moves into the top five for 4 of 6 (1 before). The other two ("… dose frequency", "… dose 325 mg") never return it among Europe PMC's first 25.
- **The weight:** from 0 to 0.3 it finds as many papers as no weight, and puts more first. Added to the match instead of multiplying it, a weight of 0.2 let the American Heart Association's yearly statistics, cited thousands of times and matching one word in twelve, take three of the five places for a search on the VESSEL trial; scaled, a paper that matches little gains little.
- **With Qwen3.5-4B,** the first ten `clinical` questions, as above: **7 of 10, as before** (`c01`–`c05` 2 of 5 before, `c06`–`c10` 5 of 5, run on `main` the same day).
  - Gained `c03`: it read the REVAMP report and answered from it.
  - `c04` and `c05` now read the REVAMP report first, and still fail inside it: the part read first does not hold the dose or Table 1. In `c04` the model then read the trial's protocol and answered with its plan (120 mg daily), with or without the note; in `c05` it read six of the report's parts and none with Table 1. That is reading a long paper, which the outline experiment (#144) measured, not finding it.
  - Lost `c08`: the model read the VESSEL trial's second paper, on glycaemic control, ranked second, which reports the same 2·5 mmHg fall; the scoring asks for the blood pressure paper. A trial that reports its outcomes in several papers is ambiguous for any ranking.

So search now finds a trial's own report far more often, and the model's failures with Europe PMC have moved from finding the paper to reading it.

## Limits

- **Ten papers, 33 questions.** Enough to see whether Kovrune's labels can be trusted on trial reports, not to estimate a rate finely. One question is about 3% of a suite.
- **Written by one author, from the papers, without a clinician's review.** A health sciences researcher reviewing the questions and facts would make the suite stronger. Changes to a fact are made before a run, never to fit one.
- **The facts are substrings.** "No significant" in an answer passes a negative task, even if the answer goes on to say the opposite. The facts make the common error fail, not every error.
- **English only, and Markdown only** (above).
