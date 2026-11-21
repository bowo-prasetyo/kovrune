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
