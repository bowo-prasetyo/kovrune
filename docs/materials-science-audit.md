# Materials Science Audit, November 2026

An audit of Kovrune from a materials scientist's point of view (metallurgy, ceramics, polymers, battery and energy materials, thin films and semiconductors), at `8c70d93` (harness 0.106.0). It asks two things:

1. Is Kovrune already useful for research in materials science?
2. What stands in the way, and what should change first?

Like the earlier audits, it ran the app's own code without a model, on five kinds of input:

- 72 pairs of answer sentences written for the audit, one right and one wrong for each, against a quote typical of the field ([Appendix](#appendix-the-72-sentence-pairs));
- 34 abbreviations and other names materials scientists type, searched alone in a small library of 16 materials passages;
- 14 open-access papers from *Materials*, *Nanomaterials*, *Nature Communications* and *Science Advances*, read with the app's JATS reader;
- two PDFs made for the audit (formulas with subscripts, a space group, a property table with empty cells), read with pdf.js as the app reads them;
- a CIF file.

Coverage figures come from Europe PMC and, in part, OpenAlex. The model's own checks (review, cross-check, completeness, contradiction) were **not** run, so the findings on sentence checks say what the word checks let through to them, not what reaches the user.

## Verdict

**Useful today as a private reading assistant for your own papers, datasheets and test data, with checked quotes. Not yet trustworthy for the question a materials scientist asks most: which property, of which phase, composition and condition, has which value?**

What works well:

- **Local-first matters even more in materials than in most fields.** Much of the field works in or with industry. Unpublished compositions, process windows, test data under an NDA, and alloy or battery data under export control (ITAR, EAR) cannot go to an online AI service. Kovrune sends nothing you add to such a service.
- **The field's own files are read.** CIF files (cell, space group, atom sites as a table), JCAMP-DX spectra (Raman, IR) with their peak tables, Excel and CSV test data, Word reports, and PDFs. In a PDF, subscripts join their formula ("Li7La3Zr2O12") and superscripts stay exponents ("10⁻³ S cm⁻¹").
- **Tables in Europe PMC papers come through well.** Merged cells are expanded, so a composition table keeps every element under its column, and a WDS table keeps its phases.
- **Many checks already fit the field.** The unit check tells GPa from MPa, Å from nm, °C from K, eV from meV, at.% from wt.%. The formula check tells NMC811 from NMC622, LiNi0.8Mn0.1Co0.1O2 from LiNi0.6Mn0.2Co0.2O2, Ta- from Al-doped LLZO, Fe3O4 from Fe2O3 and SiC from Si3N4. Alloy grades and tempers (316L/304L, 7075-T6/T73), ZIF-8/ZIF-67, Miller indices, 2θ positions, a grain size "from 12 to 45 μm" reversed, and n-type/p-type are all caught. **68 of 72 right sentences stay backed.**
- **The sources reach part of the field.** OpenAlex has a Materials Science field filter, arXiv searches can be limited to `cond-mat.mtrl-sci`, and Europe PMC holds the full text of about 15,000 *Materials*, *Nanomaterials* and *Polymers* papers from 2023 alone (MS9).

What gets in the way (details in [Findings](#findings)):

1. **A value given to the wrong property passes.** "Yield strength of 950 MPa", where 950 MPa is the paper's UTS, is backed, as is hardness for modulus, Tg for Tm, Voc for Jsc, porosity for density, and remanence for saturation magnetization. The number and the unit are the quote's, so no check sees the error. This is the field's most common reading error.
2. **Phases, crystal structures and the field's opposites are not compared.** fcc/bcc, anatase/rutile, austenite/ferrite, cubic/tetragonal, γ′/γ″, ductile/brittle, intergranular/transgranular, direct/indirect band gap, coarse/fine, harder/softer and Fm-3m/Pm-3m all pass.
3. **Europe PMC's JATS reader drops superscripts.** "1.2855 × 10<sup>12</sup> cm<sup>−2</sup>" reads as "1.2855 × 1012 cm−2". The right answer, "1.2855 × 10¹² cm⁻²", is then marked not backed, and the garbled one is backed.
4. **Search doesn't know the field's names.** 12 of 34 common abbreviations find their paper alone: LLZO, NMC811, L-PBF, SLM, HIP, SPS, MAPbI3, titania, Ti3C2 and HEMT do not.
5. **PDF property tables lose their empty cells,** so a hardness slides into the toughness column. Most of the field's papers (Elsevier, Springer, Wiley) reach Kovrune only as PDFs.

Of the 72 wrong sentences, the word checks caught 31, and at least four of those only by accident (MS3). Recommendations 1–4 are small, deterministic and testable without a model, and should come first.

**Status (harness 0.107.0):** recommendations 1–3 are done. MS4: Europe PMC full texts keep a power of ten ("10¹²") and read a line break in a table cell as a space. MS3: a unit is read with the units and powers after it, its powers are not numbers, K and °C are one in a rate, ppm K⁻¹ is 10⁻⁶ K⁻¹, and the hardness scales, μΩ, mS, S, dpa, emu and μB are units. MS8: barred digits and spaced space-group symbols are read in one form, in quote matching and search. On the 72 pairs, 38 wrong sentences are now caught (31 before) and 70 right ones backed (68 before). Re-scoring 10,065 recorded answers changes no label, and search gives every suite the same figures ([field README](../eval/field/README.md#materials-science-powers-of-ten-in-europe-pmc-compound-units-and-crystallographic-notation-01070-defect-fix)). Recommendations 4–10 remain.

**Status (harness 0.108.0):** recommendations 4–6 are done. MS7: about 150 materials names, abbreviations and process names are searched as one another, so "LLZO" finds a garnet electrolyte written out and "SPS" finds spark plasma sintering; of 31 other spellings tried on the suite's library, 29 now find their document (20 before), and every other suite's search figures are unchanged. MS9 and MS11: the user guide says which materials journals Europe PMC holds, and that a paper's figures are read only as their captions. MS10: the materials suite ([`eval/materials/`](../eval/materials/README.md)), 47 open and 13 held-out questions on eight CC BY papers, a CIF, a CSV log and a PDF report. Qwen3.5-4B passes 52 of 60; of 37 answers labelled "Quotes found", 4 are wrong, one of them the MS5 probe, read from a dropped empty cell as the audit predicted. Recommendations 7–10 remain.

## Findings

### MS1. High: a value given to the wrong property passes

Each quote gives two properties with the same unit; each wrong sentence gives one property the other's value. All 10 wrong sentences were marked backed:

| Quote | Wrong sentence |
| --- | --- |
| yield strength of 880 MPa and an ultimate tensile strength of 950 MPa | yield strength of 950 MPa |
| a hardness of 12 GPa and an elastic modulus of 210 GPa | a hardness of 210 GPa |
| fracture toughness K_IC … 4.5 MPa·m^1/2 | a flexural strength of 4.5 MPa (see MS3) |
| saturation magnetization was 45 emu g−1 and the remanence 12 emu g−1 | the remanence was 45 emu g−1 |
| a glass transition at 105 °C and melting at 165 °C | a glass transition at 165 °C |
| a Voc of 1.18 V and a Jsc of 25.6 mA cm−2 | a Jsc of 1.18 V |
| Coulombic efficiency of 99.5% | a capacity retention of 99.5% |
| power conversion efficiency of 25.1% | a fill factor of 25.1% |
| 98% relative density | 98% porosity |
| electron mobility reached 120 cm2 V−1 s−1 | hole mobility reached 120 … |

**Why it matters:** materials papers report many properties side by side, in the same units: yield strength, UTS and fatigue limit in MPa; hardness and modulus in GPa; Tg, Tm and Tc in °C; efficiencies in %. A small model reading a table row or a dense sentence picks the neighbour's value often (the chemistry suite saw the same with screening tables). The number and the unit are then the quote's, and only the property name differs, which the share-of-words test lets through.

**Fix:** generalize `percentOf` in `src/agent/support.ts`, which already ties a percentage to what it is a share of ("92% ee" is not "92% yield"). Tie each value to the property named just before it ("yield strength of", "UTS =", "Tg:", "a Voc of") or in its table column, from a list of the field's properties and their symbols. A sentence that gives a value to a property is then not backed by quotes that give that value only to another property of the list. Measure it on the suite of MS10.

### MS2. High: phases, structures and the field's opposites are not compared

None of these wrong sentences was caught:

| Kind | Missed |
| --- | --- |
| Crystal structure and phase | fcc ↔ bcc; hcp ↔ bcc; anatase ↔ rutile; austenitic ↔ ferritic; cubic ↔ tetragonal; γ′ ↔ γ″; ordered ↔ disordered; single-crystal ↔ polycrystalline; thermoplastic ↔ thermoset; space group Fm-3m ↔ Pm-3m; Raman G band ↔ D band |
| Behaviour | ductile ↔ brittle; intergranular ↔ transgranular; harder ↔ softer; coarse ↔ fine grains; direct ↔ indirect band gap; ferroelectric ↔ paraelectric; remained passive ↔ pitted; annealed in argon ↔ in air |
| Word order | "austenite into martensite" ↔ "martensite into austenite"; "yield stress in compression exceeded that in tension" reversed; Hall–Petch reversed ("hardness increased as grain size increased") |

Caught: n-type ↔ p-type (a physics pair), and α- ↔ β-phase (the name check reads Greek prefixes). "Wurtzite ↔ zinc blende" was caught only because "zinc" names a metal the quote doesn't. "Sphalerite" passes.

**Fix, in two parts:**

1. Add the field's pairs to `OPPOSITES`: ductile/brittle, intergranular/transgranular, harder/softer, coarse/fine, direct/indirect, ordered/disordered, ferroelectric/paraelectric, thermoplastic/thermoset, single-crystal/polycrystalline, passive/active.
2. Add exclusive sets to `DESCRIPTORS` in `src/agent/chemistry.ts`, as it already does for (R)/(S) and ortho/meta/para: lattice (fcc, bcc, hcp, and their spelled-out forms), crystal system (cubic, tetragonal, orthorhombic, hexagonal, trigonal, monoclinic, triclinic), TiO₂ polymorphs (anatase, rutile, brookite), steel phases (austenite, ferrite, martensite, bainite, pearlite, cementite), and zinc-blende forms (wurtzite, zinc blende, sphalerite). A sentence naming one where the quotes name only another is not backed. Space groups belong here too, once written in one form (MS8).

Word order ("A into B", "in X exceeded that in Y") needs the comparison rule of 0.105.0 (`restatesComparison`) widened to "into", "to" and "that in". Leave it to the model's checks until the suite shows it matters.

### MS3. Medium-high: units the check doesn't know, and unit exponents read as numbers

- **Unknown units:** hardness scales (HV, HB, HRC: "320 HV" backs "320 HB"), μΩ (`ENGINEERING_UNITS` has mΩ, kΩ and MΩ, so "5.2 μΩ cm" backs "5.2 mΩ cm"), dpa ("10 dpa" backs "10 Gy"), emu.
- **A unit's later parts are not read**, since only its first word is compared. "4.5 MPa·m^1/2" (a toughness) backs "4.5 MPa" (a strength), and "45 mV dec−1" (a Tafel slope) backs "45 mV".
- **A unit's exponent is read as a number.** "g−1" gives a 1 and "cm−2" a 2. So "185 mAh g−1 at 0.1C" backs "at 1C", from the 1 of "g−1". "An areal capacity of 185 mAh cm−2" was caught only because the quote has no 2; written "per square centimetre", it passes.
- **"mS" is read as milliseconds** (`UNITS` matches in lower case), so "1.2 ms" backs "1.2 mS". The wrong "1.2 S cm−1" for "1.2 mS cm−1" was caught as seconds against milliseconds, by accident.
- **Three right sentences lose their label** because equal units are written another way: "5 K min−1" for "5 °C min−1" (a rate, where K and °C are the same step), "8.6 ppm K−1" for "8.6 × 10−6 K−1", and "1.2 × 10−3 S cm−1" for "1.2 mS cm−1".

**Fix:** read a unit with its exponents and later parts as one unit ("mAh g−1", "mAh/g" and "mAh per gram" are one; "mAh cm−2" is another; "MPa·m^1/2", "MPa√m" and "MPa m0.5" are one, not MPa), and never read an exponent inside a unit as a number. Add HV, HB, HRC, HK, μΩ, dpa, emu, μB, S (after a number and before "cm" or "m"), and mV dec−1. Treat K and °C as equal in a rate ("per min", "/s"), and ppm K−1 as 10⁻⁶ K⁻¹. Rescore every recorded run: outside materials no verdict should change.

### MS4. Medium-high: Europe PMC full texts lose superscripts and line breaks

`jatsToMarkdown` (`src/sources/jats.ts`) writes the text inside `<sup>` and `<sub>` as plain characters, and drops `<break/>` without a space:

- **Positive powers of ten become digits.** "10<sup>12</sup>" is "1012", while "10<sup>−5</sup>" survives as "10−5", since its sign tells `numberText` it is an exponent. 2 of the 14 papers have 16 such values (dislocation densities, carrier concentrations, cycle counts). With the quote "1.2855 × 1012 cm−2", the right sentences "1.2855 × 10^12 cm−2" and "1.2855 × 10¹² cm⁻²" are **not backed**, and "1.2855 × 1012 cm−2", which a model would read as about 1,300, **is**.
- **Line breaks inside a table cell join words.** "Precipitation of Al-Si eutectic`<break/>`Precipitation of post-eutectic β-Al5FeSi phase" reads "eutecticPrecipitation", and "into`<break/>`π-Al8Mg3FeSi6" reads "intoπ-Al8Mg3FeSi6". 9 of the 14 papers use `<break/>`, mostly in table cells. A quote of such a cell is not found.

**Fix:** write a `<sup>` of digits and signs as Unicode superscripts, as the PDF reader has done since 0.91.0 (`pdf-layout.ts`), so "10¹²" reads as a power, and "Fe³⁺" and "cm⁻²" read as they print. Write `<break/>` as a space. Both are a few lines, and their effect on recorded runs can be measured with `bench:rescore`.

### MS5. Medium: PDF property tables lose their empty cells

A table made for the audit, with an empty cell in three rows, comes out of pdf.js as:

```
Sample Density (%) HV (GPa) KIC (MPa m1/2) E (GPa)
Al2O3 99.1 4.1 380
Al2O3-5SiC 98.4 21.3 402
ZTA 17.9 6.8
```

Read in order, Al₂O₃ has a hardness of 4.1 GPa and a toughness of 380 MPa m^1/2, and ZTA a density of 17.9%. The social-sciences audit found the same for regression tables (S4); only its JATS half was fixed.

**Why it matters:** property tables (composition, processing, density, hardness, strength, elongation, conductivity, capacity) are where materials papers keep their results, and the field's main journals (*Acta Materialia*, *Materials Science and Engineering A*, *Journal of Alloys and Compounds*, *Journal of Power Sources*) reach Kovrune only as PDFs the user adds (MS9).

**Fix:** in `pdf-layout.ts`, place each cell of a line under the header cell whose x-range it overlaps, and write an empty cell as "–". Then write the table as `documents/tables.ts` writes the Office and JATS ones, with "|" between cells. Test it on the audit's table and on real PDFs from the suite (MS10).

### MS6. Medium: solid-state formulas with the same metals pass

The formula check compares formulas only when they have the same elements in the same order, and metals only against metals. So:

| Quote | Wrong sentence | Marked |
| --- | --- | --- |
| CsPbI3 | CsPbBr3 (another halide) | backed |
| MoS2 | MoSe2 (another chalcogen) | backed |
| MAPbI3 | FAPbI3 (another organic cation) | backed |
| Ti3C2Tx | Ti2CTx (another MXene; "Tx" stops the formula from being read) | backed |
| NMC811 | NCA (another cathode) | backed |
| reduced graphene oxide | graphene oxide | backed |
| Ti-6Al-4V | Ti-4Al-6V (the counts swapped) | backed |

Caught: Fe3O4/Fe2O3, SiC/Si3N4, MoS2/WS2, LiFePO4/LiMnFePO4, NMC811/622, Ti-6Al-4V/Ti-6Al-7Nb.

**Fix:** when the quotes and a sentence each name a formula with the same metals, compare their non-metals too (I against Br, S against Se). Read a trailing "Tx" (an MXene's surface terminations) as part of the formula. Read an alloy designation ("Ti-6Al-4V", "Al-25%Ni", "0.4C-5Mn") as an ordered list of elements and amounts. Add MA, FA and PEA to chemistry.ts's groups, and "reduced" before "graphene oxide" as part of the name.

### MS7. Medium: search doesn't know the field's names

Each name was searched alone among 16 short materials passages, as the chemistry suite's name test does. A passage counts as found when it is among the first three results. 12 of 34 found theirs:

| Found (12) | Not found (22) |
| --- | --- |
| YSZ, HEA, Ti64, 316L, PVDF, alumina, SiC, rGO, LFP, GaN, EBSD, MOCVD | LLZO, LLZTO (Li7La3Zr2O12); NMC811, NCM811 (LiNi0.8Mn0.1Co0.1O2); MAPbI3, MAPI (methylammonium lead iodide); PEA (phenethylammonium); titania (TiO2); Ti3C2 (Ti3C2Tx); LiFePO4 (lithium iron phosphate); TBC (thermal barrier coating); Cantor, FCC (CoCrFeMnNi, face-centred cubic); L-PBF, LPBF, SLM (laser powder bed fusion); HIP (hot isostatically pressed); SS316L; CMC (carboxymethyl cellulose); SPS (spark plasma sintering); Li-S; HEMT |

The passages did not define these abbreviations. A paper that does ("laser powder bed fusion (L-PBF)") is bridged by the library's own abbreviations (`src/tools/abbreviations.ts`). But a formula and its acronym (LLZO and Li7La3Zr2O12, NMC811 and LiNi0.8Mn0.1Co0.1O2) are rarely written as a definition. Neither are a word and its formula (titania and TiO2), nor a process and its many acronyms (SLM, L-PBF, LPBF, DMLS).

**Fix:** add a materials section to `src/tools/chemical-names.ts`, with its two rules kept: an abbreviation is matched in its case, and an ordinary word adds only formulas and one-word names. Cover oxide names (titania, alumina, zirconia, ceria, silica, magnesia), battery materials (NMC/NCM with their ratios, NCA, LFP, LMFP, LCO, LMO, LTO, LLZO, LATP, LAGP, LiPF6, EC, DMC, DEC, FEC), perovskites (MAPbI3/MAPI, FAPbI3, CsPbI3, PEA, BA), 2D materials (MXene, Ti3C2Tx, MoS2, h-BN, GO, rGO), processes (L-PBF/LPBF/SLM/DMLS/PBF-LB, EBM, DED, WAAM, HIP, SPS/FAST, CVD, PVD, ALD, MBE, MOCVD, PLD), techniques (XRD, SEM, TEM, STEM, EBSD, EDS/EDX, XPS, DSC, TGA, DMA, BET, AFM), lattices (fcc, bcc, hcp spelled out), and common alloys (Ti-6Al-4V/Ti64/TC4, 316L, Inconel 718/IN718, CoCrFeMnNi/Cantor alloy). As with 0.98.0, measure the gap first, then check with `bench:retrieval` and `bench:replay` that no other suite moves. "TC4" and "DMA" (dynamic mechanical analysis, or dimethylacetamide) need care.

### MS8. Medium: crystallographic notation in quotes and search

Most of the field's notation is matched: subscripts ("Li₇La₃Zr₂O₁₂" against "Li7La3Zr2O12", "LiNi₀.₈…"), "P6₃/mmc" against "P63/mmc", "γ′" against "γ'", "℃" against "°C", "cm⁻¹" against "cm-1", and en dashes in "Ti–6Al–4V". Two things are not:

- **Overbars.** A source's "(1̄10)", with a combining overline, is not found by a quote of "(-110)", and "Fm3̄m" is not found by "Fm-3m". Journals print negative Miller indices and roto-inversion axes this way, and a model can't type them. (A quote of "(1-10)" is rightly not found: that is the plane (1 1̄ 0), another one.)
- **Space groups.** A CIF writes "F m -3 m". Searching "Fm-3m" or "Fm3m" finds nothing, and a quote of "space group name H-M: Fm-3m" is not found. The sentence check passes Pm-3m for Fm-3m.

**Fix:** in `normalizeForMatch` and the search tokenizer, read a digit with a combining overline or macron (U+0304, U+0305) as that digit with a minus before it. Write a Hermann–Mauguin symbol in one form, without spaces and with "-" for the bar ("F m -3 m", "Fm3̄m" and "Fm-3m" are "Fm-3m"). Then compare space groups as an exclusive set (MS2).

### MS9. Medium: where the literature is, and what the sources say about it

- **Europe PMC is the field's best full-text source, and the user guide says it is for biomedicine.** In 2023 it holds 7,419 open-access *Materials*, 3,045 *Nanomaterials* and 4,604 *Polymers* papers (all MDPI, all with full text), and 628 of 5,495 *ACS Applied Materials & Interfaces* papers. It holds none from *Acta Materialia*. The guide's "the biomedical and life-sciences literature" will keep materials scientists from ticking it. Say that it also holds MDPI's materials journals and the open-access papers of journals such as *Nature Communications* and *Science Advances*.
- **arXiv copies are few.** OpenAlex gives 98,356 open-access Materials Science articles for 2023, and 4,392 Materials Science articles with an arXiv copy, so arXiv covers about 4% of the open-access ones (the audit's network ran out of OpenAlex requests before it could count all articles). arXiv's `cond-mat.mtrl-sci` is strong for computational work, and weak for experimental metallurgy, ceramics and polymers.
- **ChemRxiv is read as abstracts only**, so its materials preprints (MOFs, batteries, polymers) give their abstract.
- **Materials databases are not sources.** The field asks questions like "what is the computed band gap of X?" or "which structures of composition Y exist?". OPTIMADE is an open standard API served by the Materials Project, OQMD, NOMAD, Alexandria, the COD and others. For crystals it is what PubChem is for molecules. Check, as the CS audit checked the ACL Anthology, which providers allow requests from web pages (CORS) and need no key. An OPTIMADE source would return a structure's formula, space group, cell and computed properties as text that quotes can be checked against, and its CIF would be read by the CIF reader already there. The Materials Project's own API needs a key, so the user would supply one, as for a local server.

### MS10. Medium: no materials suite

The chemistry suite has "no materials paper (a MOF, a battery electrolyte)" (`eval/chem/README.md`), and the engineering and physics suites are made-up documents. Every finding above was measured on cases written for the audit, not on how a model answers. As with `eval/chem` and `eval/socsci`, a suite would turn them into numbers:

- 8–10 CC BY papers from Europe PMC: a metallurgy paper with tensile and composition tables (the *Materials* papers PMC11433832 and PMC11642185 read well), a battery cathode with capacity and rate data, a perovskite solar cell with J–V parameters, a sintered ceramic with density, hardness and toughness, a polymer with GPC and DSC data, a thin-film or semiconductor paper with powers of ten (PMC11547944 has them), and a paper whose text and table disagree;
- a CIF, a JCAMP Raman spectrum, a CSV of tensile tests, and a PDF made for the suite with a property table with empty cells (MS5);
- questions about which property, which phase, which condition (as-built, annealed, HIP), which composition, values read from tables, powers of ten, aliases (LLZO for Li7La3Zr2O12), and questions the papers do not answer, with a held-out set.

### MS11. Low: other observations

- **Figures are captions only.** Stress–strain curves, XRD patterns, SEM and TEM images, Nyquist and cycling plots are where much of a materials paper's evidence is, and Kovrune reads only their captions. Say so plainly in the user guide, so a researcher reads "not found" as "not in the text", not "not in the paper".
- **Instrument files are not read**, apart from CSV and JCAMP-DX: XRD scans (`.xrdml`, `.xy`, `.raw`), nanoindentation and tensile-machine exports, and impedance data. A reader for `.xrdml` (XML, with its 2θ range, wavelength and sample name) would be cheap. The scan's points need not be written, as for JCAMP.
- **A CIF's derived values are not worked out.** A cell's volume and density are often in the file. When they are not, the CIF reader could compute them, and say so, as it computes a molfile's formula.

## Recommendations, in order

| # | Change | Finding | Kind | Needs a model to measure |
| --- | --- | --- | --- | --- |
| 1 | JATS: `<sup>` digits as superscripts, `<break/>` as a space | MS4 | defect fix | no (rescore) |
| 2 | Units with their exponents and later parts as one unit; no exponent read as a number; HV/HB/HRC, μΩ, dpa, emu, S, mV dec⁻¹; K = °C in rates | MS3 | defect fix | no (rescore) |
| 3 | Overbars and Hermann–Mauguin symbols in one form, in matching and search | MS8 | defect fix | no |
| 4 | Materials names in search (`chemical-names.ts`) | MS7 | small feature | no (`bench:retrieval`) |
| 5 | User guide: Europe PMC holds materials journals; figures are read as captions only | MS9, MS11 | docs | no |
| 6 | Build the materials suite | MS10 | evaluation | yes |
| 7 | A value tied to its property; phase, structure and materials opposites; non-metals compared in formulas | MS1, MS2, MS6 | check | yes, on the suite |
| 8 | PDF tables: cells placed under their header, empty cells kept | MS5 | defect fix | no, but test on real PDFs |
| 9 | Check OPTIMADE providers as an open source | MS9 | investigation | no |
| 10 | `.xrdml` reader; CIF derived values | MS11 | small feature | no |

Items 1–5 are small and testable without a model. With them done, Kovrune would be a credible private reading assistant for one's own materials PDFs, Europe PMC's open-access materials papers, and CIF and spectrum files. Items 6–8 decide whether its **Quotes found** label can be trusted on the field's key claims. Item 9 would add what no other local tool offers: answers about computed and measured structures, checked against a database's own record.

## Method

- **Sentence checks:** `sentenceSupport` called directly, with one verified quote and the title "Materials study", on the 72 right/wrong pairs of the [Appendix](#appendix-the-72-sentence-pairs), and on 29 more cases written to find out why a pair was caught or missed (variants of units, formulas and wording).
- **Search:** `DocumentIndex` over 16 short passages, one per topic (garnet electrolyte, YSZ coating, NMC811 cathode, CoCrFeMnNi alloy, Ti-6Al-4V lattices, 316L, PVDF binder, TiO₂ nanotubes, Al₂O₃ ceramics, MAPbI₃ perovskite, Ti₃C₂Tx MXene, SiC MOSFETs, rGO in Li–S, LiFePO₄ cells, GaN HEMTs, EBSD texture). Each of 34 names was searched alone, and counted as found when its passage was among the first three results. None of the passages defines an abbreviation.
- **Quote matching:** `locateQuote` on 13 notation pairs (subscripts, en dashes, ℃, overbars, space groups, primes, superscript exponents).
- **JATS:** `jatsToMarkdown` on the full-text XML of PMC11433832 (Al–Si–Cu–Mg alloys), PMC11547944 (medium-Mn steel), PMC11642185 (TC25 titanium creep) and PMC11435026 (Cu–Mo–W films), read for their tables and text. Ten more papers (PMC11679569, PMC11358307, PMC11547456, PMC11595848, PMC11377775, PMC11597621, PMC11313492, PMC11612428, PMC11597582, PMC11723404) were searched for `10<sup>n</sup>` and `<break/>`. Papers were chosen by Europe PMC searches of *Materials*, *Nanomaterials*, *Nature Communications* and *Science Advances*, 2024, open access, on tensile properties, hardness, cathodes, perovskites, conductivity, semiconductors, batteries, electrolytes, dislocations and thin films.
- **PDF:** two PDFs made with ReportLab (`invariant=1`): one with subscripted formulas, superscript exponents, a space group with a combining overline, a tensile table and a figure caption; one with a property table with an empty cell in three rows. Both were read with `extractPdfText` and pdf.js, as `eval/paging-model.ts` does. ReportLab sets subscripts in the same font. A publisher's PDF that sets them in another font may come out differently.
- **CIF:** `readCif` on a NaCl CIF, then search and quote matching on its text.
- **Coverage:** Europe PMC hit counts by journal for 2023, with and without `OPEN_ACCESS:y`. OpenAlex counts for Materials Science (field 25) articles of 2023 with `open_access.is_oa` and with an arXiv location. The total and `has_abstract` counts could not be fetched: the audit network's free OpenAlex budget ran out.
- **Not run:** any model, and the browser app. OPTIMADE providers' CORS was not checked.

## Appendix: the 72 sentence pairs

Each pair is a quote, a right sentence that restates it, and a wrong sentence that changes one thing. "Caught" means the wrong sentence was marked not backed; ✱ marks a catch made for another reason than the error (MS3, MS2). Every right sentence was backed except the three marked †, which write an equal unit another way, and "The matrix is a thermoplastic.", too short to judge.

| Topic | Wrong sentence changes | Caught |
| --- | --- | --- |
| Hardness | 320 HV → 320 HB; 52 HRC → 52 HV | no; no |
| Toughness | 4.5 MPa·m^1/2 toughness → 4.5 MPa strength | no |
| Tensile | yield 880 → 950 MPa (the UTS) | no |
| Nanoindentation | hardness 12 → 210 GPa (the modulus) | no |
| Conductivity | 1.2 mS cm⁻¹ → 1.2 S cm⁻¹ | yes ✱ (read as ms against s) |
| Conductivity, converted | right: 1.2 × 10⁻³ S cm⁻¹ † | — |
| Capacity | 185 mAh g⁻¹ → 185 mAh cm⁻² (areal) | yes ✱ (the exponent's 2) |
| C-rate | 0.1C → 1C | no (the 1 of "g⁻¹") |
| Cycling | 500 → 1000 cycles | yes |
| Efficiency | Coulombic efficiency → capacity retention | no |
| Cathode | NMC811 → NMC622; LiNi0.8Mn0.1Co0.1O2 → LiNi0.6Mn0.2Co0.2O2 | yes; yes |
| Perovskite | CsPbI3 → CsPbBr3; MAPbI3 → FAPbI3 | no; no |
| Garnet | Ta-doped → Al-doped LLZO | yes |
| Lattice | fcc → bcc; hcp → bcc | no; no |
| Polymorph | anatase → rutile | no |
| Steel phases | austenite into martensite → reversed; austenitic with no δ-ferrite → ferritic with no austenite | no; no |
| Crystal system | cubic → tetragonal (BaTiO₃) | no |
| Polytype | wurtzite → zinc blende | yes ✱ ("zinc" a metal) |
| Phase | α-phase → β-phase; γ′ → γ″ | yes; no |
| Fracture | ductile → brittle; intergranular → transgranular | no; no |
| Band gap | direct → indirect | no |
| Doping | n-type → p-type | yes |
| Grains | fine → coarse | no |
| Hardness comparison | harder → softer than the core | no |
| Hall–Petch | grain size decreased → increased | no |
| Alloy | Ti-6Al-4V → Ti-4Al-6V; → Ti-6Al-7Nb | no; yes |
| Steel grade | 316L → 304L | yes |
| Temper | 7075-T6 → 7075-T73 | yes |
| Composition | 2 at.% → 2 wt.% Nb | yes |
| Texture | (111) → (110) | yes |
| Slip planes | (111) → (100) (right: {111}) | yes |
| Surface | (1-10) → (110) | yes |
| Space group | Fm-3m → Pm-3m | no |
| Raman | G band → D band; 1580 cm⁻¹ → 1580 nm | no; yes |
| XRD | 2θ = 38.2° → 44.4° | yes |
| Lattice parameter | 3.905 Å → 3.905 nm | yes |
| Heating rate | 5 → 10 K min⁻¹ (right: 5 K min⁻¹ for 5 °C min⁻¹ †) | yes |
| Annealing | 450 °C → 450 K; in argon → in air | yes; no |
| Thermal expansion | 8.6 × 10⁻⁶ → 8.6 × 10⁻⁵ K⁻¹ (right: 8.6 ppm K⁻¹ †) | yes |
| Magnetization | 45 emu g⁻¹ → 45 emu cm⁻³; remanence 12 → 45 emu g⁻¹ | yes ✱ (cm); no |
| Polymer | Mw 85 → Mn 85 kg mol⁻¹; Tg 105 → 165 °C (the Tm) | yes; no |
| Polymer class | thermoplastic → thermoset | no |
| Density | 98% relative density → 98% porosity | no |
| Samples | single-crystal → polycrystalline | no |
| MOF | ZIF-8 → ZIF-67 | yes |
| Order | ordered → disordered L1₀ | no |
| Ferroelectric | ferroelectric → paraelectric | no |
| Corrosion | remained passive → pitted | no |
| Irradiation | 10 dpa → 10 Gy | no |
| Resistivity | 5.2 μΩ cm → 5.2 mΩ cm | no |
| Thermal conductivity | 1.8 → 1.8 mW m⁻¹ K⁻¹ | yes |
| Mobility | electron → hole mobility | no |
| Solar cell | PCE 25.1% → fill factor 25.1%; Voc 1.18 V → Jsc 1.18 V | no; no |
| Electrocatalysis | at 10 → 100 mA cm⁻²; 45 mV dec⁻¹ → 45 mV | yes; no |
| Grain growth | from 12 to 45 μm → from 45 to 12 μm | yes |
| Yield asymmetry | compression exceeded tension → reversed | no |
| Creep | 3 × 10⁻⁸ → 3 × 10⁻⁶ s⁻¹ | yes |
| Fatigue | 10⁷ → 10⁶ cycles | yes |
