# Materials suite

Questions over materials science papers and test data (harness 0.108.0), recommendation 6 of the materials science audit ([`docs/materials-science-audit.md`](../../docs/materials-science-audit.md), MS10). The chemistry suite has no materials paper, and the engineering and physics suites' documents are made up. None of them has a tensile table of several alloys in several tempers, a creep rate in powers of ten, a battery's capacity at four C-rates beside its Coulombic efficiency and retention, a solar cell's Voc, Jsc, FF and PCE side by side, a ceramic's hardness, modulus and toughness in one row, a CIF, or a property table with an empty cell. Those are where reading the field goes wrong: which property has the value, of which sample and condition, in which unit, and which phase or mechanism. The audit found the sentence check marking 41 of 72 wrong materials sentences backed; this suite measures how a model answers such questions.

```bash
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites materials,materialsholdout --out eval/results/materials-qwen3.5-4b-q4km.json
```

`materials` (47 questions) may be looked at task by task while a change is developed; `materialsholdout` (13) is read only as totals, like the other held-out suites. The questions and their facts were written from the documents before any model ran on them, and are not changed to fit a run. A fact that is plainly wrong is fixed as a task defect and recorded here with the scores before and after. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right. The scorer matches lower-cased substrings, so a unit whose prefix is only a case apart is asked for in `casedFacts` ("mS", not "S"), and it can't tell "TiB2 intergranular, SiC transgranular" from the reverse; the reports are read for that.

## The documents

Eight open-access journal papers, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and three made-up documents. They are their own library (`materialsLibrary` in `eval/harness/field.ts`).

- **Overlap on purpose:** three alloys (a cast Al–Si–Cu–Mg with nickel, a titanium alloy in creep, a medium-manganese steel); two battery materials (a LiFePO₄ cathode and a garnet LLZO electrolyte, the LLZO also as a CIF); three hot-pressed or sintered ceramics (LLZO, boron carbide, zirconia-toughened alumina); a polymer; a perovskite solar cell; and Ti-6Al-4V beside the TC25 titanium alloy.
- **What goes wrong:** a value given to the property next to it (yield strength and UTS, hardness and modulus, Voc and Jsc, Coulombic efficiency and capacity retention); a table read by the wrong row or column, or across an empty cell; a unit's prefix (mS and S, μs and ns); a power of ten; a direction; a phase, structure, space group, fracture mode or mechanism the wrong way round; something that did not happen or was not measured; and a material or process asked for by another of its names.

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `al-si-cu-mg-nickel-alloys.md` | Ehab Samuel et al. Analysis of Ni-Cu Interaction in Aluminum-Based Alloys: Hardness, Tensile and Precipitation Behavior. *Materials* 2024. [doi:10.3390/ma17184676](https://doi.org/10.3390/ma17184676); [PMC11433832](https://europepmc.org/article/PMC/PMC11433832) | 49 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `tc25-titanium-creep.md` | The Influence of Heat Treatment on the Tensile Creep Life of the TC25 Titanium Alloy. *Materials* 2024. [doi:10.3390/ma17235821](https://doi.org/10.3390/ma17235821); [PMC11642185](https://europepmc.org/article/PMC/PMC11642185) | 32 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `medium-manganese-steel-heating-rate.md` | The Effect of Heating Rate on the Microstructure Evolution and Hardness of Heterogeneous Manganese Steel. *Materials* 2024. [doi:10.3390/ma17215321](https://doi.org/10.3390/ma17215321); [PMC11547944](https://europepmc.org/article/PMC/PMC11547944) | 49 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `lifepo4-combustion-synthesis.md` | Haozhi Duan et al. Solution Combustion Synthesis of High-Performance Nano-LiFePO4/C Cathode Material from Cost-Effective Mixed Fuels. *Materials* 2023. [doi:10.3390/ma16227155](https://doi.org/10.3390/ma16227155); [PMC10672621](https://europepmc.org/article/PMC/PMC10672621) | 32 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `perovskite-pai-passivation.md` | Fulin Sun et al. Enhancing Perovskite Solar Cell Performance through Propylamine Hydroiodide Passivation. *Nanomaterials* 2024. [doi:10.3390/nano14171416](https://doi.org/10.3390/nano14171416); [PMC11397452](https://europepmc.org/article/PMC/PMC11397452) | 37 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `llzo-hot-pressing-sps.md` | Mikihisa Fukuda et al. High-Temperature Sintering of Garnet Solid Electrolyte Li7La3Zr2O12: A Comparative Study of Induction Hot Pressing and Spark Plasma Sintering. *Small* 2025. [doi:10.1002/smll.202506257](https://doi.org/10.1002/smll.202506257); [PMC12530038](https://europepmc.org/article/PMC/PMC12530038) | 39 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `boron-carbide-sic-tib2.md` | Improving the Fracture Toughness of Boron Carbide via Minor Additions of SiC and TiB2 Through Hot-Press Sintering. *Materials* 2024. [doi:10.3390/ma17246233](https://doi.org/10.3390/ma17246233); [PMC11678037](https://europepmc.org/article/PMC/PMC11678037) | 34 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `pla-starch-hydrothermal-ageing.md` | Differentiation between Hydrolytic and Thermo-Oxidative Degradation of Poly(lactic acid) and Poly(lactic acid)/Starch Composites in Warm and Humid Environments. *Materials* 2024. [doi:10.3390/ma17153683](https://doi.org/10.3390/ma17153683); [PMC11313141](https://europepmc.org/article/PMC/PMC11313141) | 46 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `llzo-al-cubic.cif` | Made up for the suite: Al-doped cubic LLZO as a CIF, with its space group written with spaces ("I a -3 d"), as CIF files write it | 2 KB | this repository's licence |
| `ti64-slm-tensile-log.csv` | Made up for the suite: a tensile test log of Ti-6Al-4V coupons built by selective laser melting, in three conditions and two build orientations, one test without a valid elongation | 1 KB | this repository's licence |
| `zta-test-report.pdf` | Made up for the suite: a test report of zirconia-toughened alumina whose property table leaves a cell empty where a value was not measured | 24 KB | this repository's licence |

Each paper names its authors as its XML gives them.

**How they were made.** `source/build.ts` downloads each article's full-text XML from Europe PMC and writes it as Markdown with the app's own converter (`src/sources/jats.ts`), so each reads as Kovrune reads it from Europe PMC: merged table cells spread over their columns and rows, and since 0.107.0 powers of ten as superscripts ("1.2855 × 10¹²", which read "1.2855 × 1012" before) and line breaks in a table cell as spaces. It refuses an article whose XML licence is not CC BY 4.0. The article's own text is kept; as the licence asks to be told, figures are kept as their captions only, and supplementary material is left out. `source/make_docs.py` writes the CIF, the CSV and the PDF (reportlab, `invariant=1`, so the PDF rebuilds byte for byte).

```bash
node --experimental-strip-types eval/materials/source/build.ts
python3 eval/materials/source/make_docs.py
```

**Which papers, and which not.** Candidates came from Europe PMC searches of *Materials*, *Nanomaterials*, *Polymers*, *Nature Communications* and other journals (2023–2025, open access, CC BY), on cathodes, perovskite solar cells, garnet electrolytes, ceramic toughness, polymer ageing, and alloys' tensile, creep and hardness behaviour. Papers whose tables are images, review articles and papers longer than about 50 KB of text were left out. Six of the eight are MDPI papers, as most materials full texts in Europe PMC are; none is from an Elsevier materials journal, which Europe PMC does not hold (audit MS9).

**What the documents disagree on, and the questions avoid.** Three papers state a value in their text that their table gives otherwise: the LiFePO₄ paper's conclusion says U1.6S0.8 retained "more than 98%" after 200 cycles, its Table 3 95.8%; the steel paper's text gives the highest XRD dislocation density as 1.5332 × 10¹² cm⁻², its Table 2 1.4832, and its prior austenite grain size as 8.63 μm in the results and 8.36 μm in the conclusions; the boron carbide abstract says SiC raised the strength to 551 MPa, which its table gives for 5 wt% SiC, where 10 wt% reached 605 MPa (`m33` asks for the 10 wt% value). The LLZO paper's Table 4 gives LLZO's Young's modulus as 154.9 MPa, likely meaning GPa. No question asks for the values the documents disagree on.

## The questions

Each task's comment names its kind, counted here by its first kind:

| Kind | `materials` | `materialsholdout` | What goes wrong |
| --- | --- | --- | --- |
| Property: a value with others in the same unit beside it | 13 | 5 | Yield-strength loss of one alloy for another's, a Coulombic efficiency for a retention, Jsc for Voc, toughness for strength or hardness, a modulus for a hardness |
| Table: a value by its row and column | 9 | 5 | One temper, temperature, heating rate or rate column of several; a row with an empty cell; a CIF's occupancy; a CSV row |
| Power or unit | 5 | 0 | 7.2 × 10⁻⁸ s⁻¹; 1.2855 × 10¹² cm⁻²; mS cm⁻¹; μs and ns; cm⁻¹ |
| Direction | 4 | 0 | Hardness rose, sorbitol raised the combustion temperature, SiC lowered the hardness, the inverted cell was the better one |
| Phase, structure, mechanism | 6 | 0 | Grain-boundary sliding and dislocation climb; intergranular and transgranular; cubic; Ia-3d; hydrolysis; a new phase |
| Negative | 5 | 0 | Nickel not a grain refiner, no combustion with urea alone, no band-gap change, no change of sintering mechanism, specimens that could not be tested |
| Alias | 3 | 0 | "lithium iron phosphate" for LiFePO₄, "lithium lanthanum zirconate" for LLZO, "laser powder bed fusion" for SLM |
| Comparison of two documents | 1 | 0 | Two hot-pressing pressures in two papers |
| Not in the documents | 3 | 1 | A blank cell of the PDF's table, which the PDF reader drops (audit MS5); a conductivity at a temperature the table stops before; a creep test temperature not run; a cycle count not run |

`tests/field.test.ts` ("materials suite") checks that every fact is in its cited documents, that every document is asked about in the open set, that each suite has an unanswerable question, that the open set has a comparison and the held-out set is at least a quarter of its size, that the papers keep their licence statements and that what they are read for survives the converter (`1.2855 × 10¹² cm−2`, `7.2 × 10⁻⁸ s−1`, the LLZO conductivity table's empty cell, the CIF's `I a -3 d`, a CSV row by column). It also checks that an answer giving the capacity retention for the Coulombic efficiency, S cm⁻¹ for mS cm⁻¹, or "1012" for 10¹² fails its task, and the right answer passes.

## Materials names in search (0.108.0)

Recommendation 4 of the audit (MS7), measured on this suite's library before anything was built.

**The gap.** Each spelling was searched alone, and counted as found when its document was among the first three results, as the chemistry suite's name test does. The documents' own spellings found their document 25 of 26 times (the miss, "garnet" for the CIF, is ranking: the LLZO paper's parts fill the first three places). Other spellings a materials scientist might type found theirs **20 of 31** times. The misses were "LFP", "LLZTO", "silicon carbide", "titanium diboride", "BT25", "L-PBF", "LPBF", "TC4", "hot isostatic pressing", "YSZ" and "A354". The papers define most of their own abbreviations, which the library's abbreviations bridge (`src/tools/abbreviations.ts`), but not a formula and its acronym (LLZO and Li7La3Zr2O12), a word and its formula (titania and TiO₂), or a process and its several acronyms (SLM, L-PBF, LPBF).

**The change** (`src/tools/chemical-names.ts`, `MATERIALS_NAMES`): about 150 entries for battery materials and electrolytes, oxides and non-oxides, 2D materials, perovskite photovoltaics, polymers, characterization techniques, processes, alloys, structures and mechanisms. A query naming any spelling also searches the terms of the entry's other spellings, as for the chemical names, with three differences, each found by measuring:

1. **Every spelling added to every passage cost the suite three questions.** With the chemical names' rule (a query naming an entry by abbreviation adds every spelling), the alias spellings found their document 29 of 31 times, but the suite's own questions found everything they need **49 of 56** times against 52 without the list. The questions that lost (`m24`, `m30`, `m45`) name a paper's own abbreviation ("the SPS-sintered Al-LLZO", "the hot-pressed B4C"), and the added words ("field", "assisted", "current", "lithium", "oxide", "boron") ranked the papers' introductions over the tables that answer them. As a query writing "Vi-TT" lost clinical passages when it searched its long form's words (`search.ts`, `expandedTerms`), a query naming a materials entry by abbreviation now adds only its abbreviations, formulas and one-word names: 50 of 56.
2. **An abbreviation of two entries names neither for sure.** "LFP" is laser flash photolysis among the chemical names and lithium iron phosphate here. Searched alone it added "laser", "flash" and "photolysis", which found the laser-melting CSV. A spelling of two entries now adds only their one-word spellings, so "LFP" adds "LiFePO4". Spellings whose terms are ordinary words or fragments are left out ("FAST" for SPS added "fast"; "Ta-LLZO" added "ta").
3. **A material's other spellings count only where the query's own spelling is not.** Synonyms are alternatives, so a part that already writes "LLZO", as the query does, gains nothing from also writing "Li7La3Zr2O12", and a part that writes only the formula is found by it (`materialsNameAlternatives`, used by `DocumentIndex.search`). A part has the query's spelling when it has every term of it: "carbide" alone, of "boron carbide", is not "silicon carbide". The suite's questions are back to **52 of 56**, as without the list.

| | Without the list | Every spelling (chemical names' rule) | 0.108.0 |
| --- | --- | --- | --- |
| Other spellings that find their document | 20 of 31 | 29 of 31 | **29 of 31** |
| Suite questions with everything found (`bench:retrieval`) | 52 of 56 | 49 of 56 | **52 of 56** |
| The audit's 34 names in its 16-passage library | 12 of 34 | 31 of 34 | 21 of 34 |

The two spellings still missed are ranking alone: "titanium diboride" adds "tib2" and "hot isostatic pressing" adds "hip", and the parts of the TC25 and LLZO papers that write "titanium" or "hot pressing" fill the first three places. The audit's small library does worse under rule 1 than with every spelling, as its passages define none of their abbreviations, so "TBC" no longer finds a passage that writes only "thermal barrier coating"; real papers define theirs, as all eight here do.

**Nothing else moves.** `bench:retrieval` gives every other suite exactly the figures it gave before (research, pdf, field, office, clinical, engineering, physics, cs, lab, math, chem, socsci), the chemistry entries add what they added before, and `bench:replay --base origin/main` on the latest recorded runs of every suite (field and held out at 0.75.0, clinical at 0.84.0, CS, lab and their held-out sets at 0.78.0, engineering at 0.68.0, physics at 0.91.0, chemistry at 0.94.0, mathematics at 0.100.0, social sciences at 0.104.0) finds **no task that makes a different request**. The tasks it can't decide are the same with `main` against itself. Tests: `tests/retrieval.test.ts` ("materials names in search"), `tests/chemical-names.test.ts` ("materials names").

## Results

Qwen3.5-4B (Q4_K_M, llama.cpp `fae9ac5`, 4,096 tokens of context, thinking off, constrained mode), harness 0.108.0, run on a 4-core CPU at about 8 tokens a second ([`eval/results/materials-0.108-qwen3.5-4b-q4km.json`](../results/materials-0.108-qwen3.5-4b-q4km.json), merged from six runs of ten tasks):

| Suite | Passed | Labelled "Quotes found" | Of them wrong |
| --- | --- | --- | --- |
| materials | 40 of 47 | 26 | 4 |
| materialsholdout | 12 of 13 | 11 | 0 |
| both | 52 of 60 | 37 | 4 |

Every failure was read, and none is a defect of its task (the value asked for is in its document, in the words the facts accept):

- **Search missed the passage** (m08): the TC25 composition table was not retrieved; the model said so instead of guessing.
- **The model stopped short** (m01, m04, m19): it gave the other alloy's yield-strength loss (65 MPa for B4N), left out the 15–20% grain refining it was asked for, and said the 1.5 mg/mL fill factor was not given although the table row was in its passage.
- **Unanswerable questions answered** (m44, m46, m47, mh13): no unanswerable question was declined. Three were answered with a quote of a near neighbour, and labelled "Quotes found": the conductivity at 1100 °C for 1150 °C (m46), the creep life at 550 °C for 600 °C (m47), and, in m44, the MS5 probe, 5.9 GPa as the hardness of ZTA-20. 5.9 is its fracture toughness: the PDF's empty hardness cell is dropped, so the row reads "ZTA-20 20 98.6 5.9 610" and the quote is found word for word. This is the failure the audit predicted (MS5); recommendation 7 is its fix. mh13 gave the 200-cycle retention for 500 cycles, but said it was not the value asked for, and was not labelled.

The four wrong answers labelled "Quotes found" all quote a real value of a neighbouring condition; the label says the quotes are in the documents, which they are, not that they answer the question. `bench:rescore` gives the same labels.

## Limits

- **Eight papers, six from one publisher.** MDPI's journals are where most materials full texts in Europe PMC are; the field's main journals (*Acta Materialia*, *Materials Science and Engineering A*, *Journal of Power Sources*) reach Kovrune only as PDFs, which this suite has one of, made up.
- **Text, not figures.** Stress–strain curves, XRD patterns, micrographs and cycling plots are kept as captions, so no question asks for a value given only in a figure.
- **One author** wrote the questions, the facts and the made-up documents, and chose the papers.
- **The names are a list**, written with this suite's spellings in view; the 29 of 31 measures the gap closed, not how general the list is.
