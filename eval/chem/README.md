# Chemistry suite

Questions over chemistry papers (harness 0.94.0). The field suite's documents are Wikipedia leads, a software licence, Kovrune's own documentation and made-up Office files; the clinical suite's are trial reports; the CS suite's are machine learning papers; the lab suite's are bench biology papers; the engineering and physics suites' are made-up datasheets, reports and papers. None has a screening table of catalysts and solvents, a yield next to an enantiomeric ratio, a reduction potential against a reference electrode, a chemical shift next to its coupling constants, or a reagent written as a formula in one paper and spelled out in another. Those are where reading a chemistry paper goes wrong. An audit of Kovrune from a chemistry researcher's point of view found the sentence check marking 38 of 51 wrong chemistry sentences backed, and fixed them at 0.93.0 ([chemistry checks](../field/README.md#chemistry-mhchem-formulas-chemistry-units-opposites-and-names-0930-defect-fix)), but no suite could show how often that matters. This suite is what can (recommendation 3 of the audit). Its search measurement also bridges recommendation 4, chemical names written another way ([below](#chemical-names-in-search-0940)).

```bash
npm run bench:endpoint -- --model <model> --suites chem,chemholdout --modes constrained --out eval/results/<name>.json
```

`chem` (40 questions) may be looked at task by task while a change is developed; `chemholdout` (12) is read only as totals, like the other held-out suites. The questions and their facts were written from the papers before any model ran on them, and are not changed to fit a run. A fact that is plainly wrong is fixed as a task defect and recorded here with the scores before and after. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

## The documents

Eight open-access journal papers, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), chosen to cover what a chemist reads: synthesis methods with their screening tables, catalysis, photochemistry, electrochemistry and computation.

- **Overlap on purpose:** two are nickel-catalysed couplings (one thermal, one photochemical); three use light, with different catalysts and wavelengths (purple 399 nm, blue 465 nm, 427 nm); three concern CO₂ (an electrocatalyst on carbon making formate, homogeneous iron porphyrins making CO, a computational frustrated Lewis pair inserting it into an epoxide); and reduction potentials appear in four, against three reference electrodes (SCE, RHE, Fc/Fc⁺).
- **What goes wrong:** mol% against equiv, ppm against Hz, ns against µs, kcal/mol against eV, K against °C; a potential's sign and its reference; one entry of a screening table read for its neighbour; NiCl₂ for NiBr₂, 2-iodo- for 2-bromobenzofuran, Cu(311) for Cu(111); (R) for (S), J- for H-aggregates; a direction reversed; a control that showed nothing.

They are their own library (`chemLibrary` in `eval/harness/field.ts`).

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `nickel-fluorobenzofuran-coupling.md` | Takeshi Fujita et al. Nickel-catalyzed cross-coupling of 2-fluorobenzofurans with arylboronic acids via aromatic C–F bond activation. *Beilstein J. Org. Chem.* 2025. [doi:10.3762/bjoc.21.8](https://doi.org/10.3762/bjoc.21.8); [PMC11744694](https://europepmc.org/article/PMC/PMC11744694) | 17 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `nickel-photoredox-hydroxytrifluoroethylation.md` | Feng Chen et al. Visible-light-induced nickel-catalyzed α-hydroxytrifluoroethylation of alkyl carboxylic acids. *Beilstein J. Org. Chem.* 2023. [doi:10.3762/bjoc.19.98](https://doi.org/10.3762/bjoc.19.98); [PMC10509543](https://europepmc.org/article/PMC/PMC10509543) | 17 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `propargylation-biisoquinoline-dioxide.md` | Enantioselective regiospecific addition of propargyltrichlorosilane to aldehydes catalyzed by biisoquinoline N,N'-dioxides. *Beilstein J. Org. Chem.* 2024. [PMC11610484](https://europepmc.org/article/PMC/PMC11610484) | 22 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `photoredox-isonitrile-arylation.md` | Photoredox-catalyzed arylation of isonitriles by diaryliodonium salts towards benzamides. *Beilstein J. Org. Chem.* 2025. [PMC12302481](https://europepmc.org/article/PMC/PMC12302481) | 23 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `polyaza-helicene-photoredox.md` | Mechanistic investigations of polyaza[7]helicene in photoredox and energy transfer catalysis. *Beilstein J. Org. Chem.* 2024. [PMC11181280](https://europepmc.org/article/PMC/PMC11181280) | 38 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `copper-step-edges-co2-reduction.md` | Direct formation of copper nanoparticles from atoms at graphitic step edges lowers overpotential and improves selectivity of electrocatalytic CO2 reduction. *Communications Chemistry* 2024. [doi:10.1038/s42004-024-01218-y](https://doi.org/10.1038/s42004-024-01218-y); [PMC11190262](https://europepmc.org/article/PMC/PMC11190262) | 41 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `porphyrin-aggregation-co2-reduction.md` | Porphyrin aggregation under homogeneous conditions inhibits electrocatalysis: a case study on CO2 reduction. *ACS Central Science* 2024. [doi:10.1021/acscentsci.4c00121](https://doi.org/10.1021/acscentsci.4c00121); [PMC11212130](https://europepmc.org/article/PMC/PMC11212130) | 62 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `frustrated-lewis-pairs-co2-capture.md` | Computational design for enantioselective CO2 capture: asymmetric frustrated Lewis pairs in epoxide transformations. *Beilstein J. Org. Chem.* 2024. [PMC11514440](https://europepmc.org/article/PMC/PMC11514440) | 44 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Each document names its authors in full, as published.

**How they were made.** `source/build.py` downloads each article's full-text XML from Europe PMC and writes it as Markdown with the clinical suite's converter (`eval/clinical/source/jats2md.py`), with displayed equations kept as the CS and lab suites keep them. It refuses an article whose licence is not CC BY 4.0. The article's own text is kept, unchanged: title, authors, journal, licence statement, abstract, sections, tables (one row per line), references and acknowledgements. As the licence asks to be told, the changes are those of the lab suite: figures and schemes are kept as their captions only, supplementary material is left out, merged table cells become single cells, equations are flattened to the text of their symbols (losing superscripts: "≈109 M−1 s−1" for 10⁹), and floating tables are placed after the paragraph that first cites them.

```bash
python3 eval/chem/source/build.py
```

**Which papers, and which not.** Candidates came from Europe PMC searches of *Beilstein J. Org. Chem.*, *Chemical Science*, *Communications Chemistry*, *JACS Au* and *ACS Central Science* (2022–2025, open access) on the topics above. Four *Chemical Science* papers were dropped: three carry no licence statement in their XML, and one is CC BY 3.0. Several *JACS Au* and *ACS Central Science* papers have no full text in Europe PMC. So the suite has **no materials paper** (a MOF, a battery electrolyte): the one candidate was the CC BY 3.0 paper.

**Markdown, not PDF.** As for the clinical, CS and lab suites, the papers are read as text, so the suite measures reading a chemistry paper's prose, captions and tables, not a PDF's layout, its structures drawn as images, or its subscripts set apart (`CO 2`). Formulas are as the XML gives them, with subscripts as plain digits ("Ni(cod)2", "K2CO3").

## The questions

Each task's comment names its kind, counted here by its first kind:

| Kind | `chem` | `chemholdout` | What goes wrong |
| --- | --- | --- | --- |
| Unit: a value whose unit matters | 10 | 4 | mol% for equiv, Hz for ppm, µs for ns, °C for K; a potential without its sign or reference electrode |
| Direction | 6 | 1 | "Decreased" for "increased" (a narrower chiral pocket lowered the selectivity), an onset potential shifted the other way, a rate that fell as the catalyst concentration rose |
| Name: a result of one of two names a character or a word apart | 6 | 4 | NiCl₂(dtbbpy) for NiBr₂(dtbbpy), 2-iodo- for 2-bromobenzofuran, Cu(311) for Cu(111), Ir(ppy)₃ for Ru(bpy)₃, zinc for nickel |
| Negative: a control or comparison that showed nothing | 5 | 1 | "Not detected", "no leaching", "no photocatalyst needed" turned into a finding. Each such task has a fact group of the ways to say so |
| Alias: asked in a chemist's own spelling of a name | 5 | 0 | "Hünig's base" for the paper's "N,N-diisopropylethylamine", "tricyclohexylphosphine" for "PCy3", "dichloromethane" for "CH2Cl2", "acetonitrile" for "MeCN", "sodium carbonate" for "Na2CO3" |
| Stereo: an enantiomer, a ratio, a regiochemistry, an aggregate type | 4 | 1 | (S) for (R), 22:78 for 78:22, J- for H-aggregates, the other C–O bond |
| Condition: one entry of a screening table | 1 | 0 | DMF for NMP |
| Comparison of two papers | 1 | 0 | Two potentials against two reference electrodes |
| Not in the papers | 2 | 1 | A formate efficiency for the porphyrins, which make CO; an ee for an achiral product; a turnover number the other photocatalyst has |

`tests/field.test.ts` ("chemistry suite") checks that every fact is in its cited document, that every document is asked about in each suite, that each suite has a negative and an unanswerable question, that `chem` has a comparison, that the papers keep their licence statements and that what they are read for survives the converter (`Ni(cod)2 (10 mol %)`, `55.0 ppm (JFP = 53, 42 Hz)`, `−1.17 V vs SCE`, `78:22 er`, `(S)-epoxide`). It also checks that an answer swapping mol% and equiv, ppm and Hz, a potential's sign, (R) and (S), a direction, ns and µs, J- and H-aggregates, a negative or K and °C fails its task, and the right answer passes.

## Results

**Search alone** (`npm run bench:retrieval`, no model, BM25 over the eight papers), on the 49 answerable questions:

| | Before the chemical names (0.94.0 suite, `c77500d`) | With them |
| --- | --- | --- |
| Cited documents found | 98% | 98% |
| Answer passages found | 92.5% | 94% |
| Everything found | 45 of 49 | **46 of 49** |

The gain is `c35`, the asymmetric FLP's enantiomer: the question writes "enantiomeric excess", and the passage that gives the 96% writes "%ee". The misses: `c24` (the singlet and triplet lifetimes are in two passages, and search finds one), `c31` (the inverse dependence is said in many places, none of which search ranks first), and `c38`, the comparison, which finds one of its two papers.

RESULTS_PLACEHOLDER

## Chemical names in search (0.94.0)

**The gap, measured before anything was built.** For each paper, the spellings it uses for its reagents, solvents and catalysts were searched alone (the first three results, as the lab suite's name test does), and so were the spellings a chemist might type instead. Every one of the papers' own 23 spellings found its paper; **13 of 30** other spellings did. The misses: "tricyclohexylphosphine" (the paper writes PCy3), "dibromomethane" (CH2Br2), "DMA" (DMAc), "HEH" (Hantzsch ester), "iPr2NEt" and "Hünig's base" in its other forms (N,N-diisopropylethylamine), "dichloromethane" and "DCM" (CH2Cl2), "isocyanide" (isonitrile), "cesium carbonate" (Cs2CO3), "paraquat" (methyl viologen), "potassium bicarbonate" (KHCO3), "formic acid" (formate), "FeTPP" (iron tetraphenylporphyrin), "ferrocenium" (Fc/Fc+), "Bu4NPF6" (TBAPF6), "methyloxirane" and "1,2-epoxypropane" (propylene oxide). Chemists rarely define these, so the library's own abbreviations (`src/tools/abbreviations.ts`, which reads "zero-voltage switching (ZVS)") bridge none of them.

**The change** (`src/tools/chemical-names.ts`): a built-in list of 161 entries, each the spellings of one solvent, base, acid, reagent, catalyst, ligand, small molecule, technique or metal. A query naming any spelling of an entry also searches the terms of the entry's other spellings. As for the gene-name forms of 0.87.0 ([lab suite](../lab/README.md#matching-a-gene-or-protein-name-however-a-query-writes-it-0870)), only the query is expanded: the index and a document's own words are unchanged. Two rules keep it from reading ordinary words as chemicals:
- **An abbreviation or a formula is matched in its case**, as a whole word: "HER" (the hydrogen evolution reaction) is not "her", "DMA" is not "dma", "Pd" in "Pd(OAc)2" is palladium.
- **A name written in ordinary words adds only formulas, abbreviations and one-word names**, not names of several words. A first version let "methanol" add "methyl alcohol", and the lab suite's question about methanol dehydrogenase, an enzyme, then also searched "methyl" and "alcohol" (found by `bench:replay`, below). A query writing the formula or abbreviation ("MeOH", "FeTPP") is about the chemical, and adds every spelling.

**30 of 30** of the other spellings now find their paper, and all 23 own spellings still do (`tests/retrieval.test.ts`, "chemical names in search"). That is not a measure of how general the list is: it was written with these 30 in view. What it does show is that nothing else moves. **`bench:retrieval` gives every other suite exactly the figures it gave before** (research, pdf, field, office, clinical, engineering, physics, cs, lab), and the chemistry suite gains one task (above).

**Replaying the recorded runs.** `bench:replay --base c77500d` runs each recorded task of the latest reports with replies (field and held out at 0.75.0, clinical, CS and lab at 0.84.0, the CS and lab held-out suites at 0.78.0, physics at 0.91.0, both models) on the code without the list and with it. **No task of research, unanswerable, pdf, field, holdout, csholdout, labholdout, clinical, cs or physics makes a different request.** The ones it cannot decide (two research, one unanswerable, one clinical, three physics) cannot be decided on `main` against itself either. One lab task differs on both models, `l21-mdh-act-mechanism`, whose question names "methanol dehydrogenase": its paper writes "CH3OH" once, and the list's "methanol" now finds it. It was run with both models at both versions (below).

L21_PLACEHOLDER

## Limits

- **Eight papers, mostly one journal.** Five are *Beilstein J. Org. Chem.*, whose full texts Europe PMC serves under CC BY 4.0; *Chemical Science* full texts there often carry no licence statement, and many ACS papers have none there. Organic synthesis and catalysis lead; there is no materials, analytical, polymer or biochemistry paper.
- **Text, not PDF**, and **no supplementary information**. Much of a synthesis paper's data, its NMR listings and substrate tables, lives in the SI; schemes and figures are kept as captions, so a yield given only in a scheme could not be asked. Two of the papers state a result in the text and a different one in a table (wet-chemistry Cu/GNF: 43% and 20% in the text, 40% and 60% in Table 1); no question asks about those.
- **Structures are not read.** A compound is its label ("3bb", "(S)-8") and its name; a question about a structure drawn in a scheme cannot be asked.
- **The chemical names are a list**, not a chemistry engine: 161 entries chosen for common solvents, reagents, catalysts, techniques and metals. A name not on it (a ligand, a trade name, an IUPAC name of a product) is still searched only as written. PubChem, which knows millions of synonyms, would cover far more, and is not used: it would send the query's chemical names to an online service.
