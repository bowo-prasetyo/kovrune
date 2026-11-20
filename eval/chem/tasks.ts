// Questions over chemistry papers (harness 0.98.0): the kind of document a chemistry researcher brings, which no
// other suite holds. The field suite's documents are Wikipedia leads, a licence and the app's own documentation;
// the clinical suite's are trial reports; the CS suite's are machine learning papers; the lab suite's are bench
// biology papers; the engineering and physics suites' are made-up datasheets, reports and papers. None has a
// screening table of catalysts and solvents, a yield next to an enantiomeric ratio, a reduction potential against
// a reference electrode, a chemical shift next to its coupling constant, a stereodescriptor, or a reagent that is
// written as a formula in one paper and spelled out in another. Those are where reading a chemistry paper goes
// wrong, and what the chemistry checks of 0.93.0 guard (eval/field/README.md).
//
// The documents are eight open-access journal papers, CC BY 4.0, from Europe PMC's full-text XML, kept as
// published and built by source/build.py (README.md lists them with their licences). They are their own
// library, and overlap on purpose: two are nickel-catalysed couplings, three use photoredox or energy-transfer
// catalysis with different light and catalysts, three concern CO₂ (an electrocatalyst on carbon, a homogeneous
// iron porphyrin, a computational frustrated Lewis pair), and reduction potentials appear in four against three
// reference electrodes (SCE, RHE, Fc/Fc⁺).
//
// The questions ask what a chemist reading a method or a result asks, in kinds tagged on each task:
// - unit: a value whose unit matters: mol% against equiv, ppm against Hz, ns against µs, kcal/mol against eV,
//   K against °C, a potential and its reference electrode;
// - condition: the catalyst, ligand, solvent, base, additive or light of one entry of a screening table, next
//   to the other entries' values;
// - name: a result that belongs to one of two names a character or a word apart: NiCl₂ against NiBr₂, 2-iodo-
//   against 2-bromobenzofuran, Cu(311) against Cu(111), FeDiPP against FeTetraPP, Ir(ppy)₃ against Ru(bpy)₃;
// - stereo: an enantiomer, an enantiomeric ratio or excess, an E/Z ratio, a regiochemistry;
// - direction: which way a change went (a narrower pocket lowered the selectivity, an onset potential shifted
//   negative, the rate fell as the catalyst concentration rose), where the reversed answer shares every other word;
// - negative: a control or a comparison that showed nothing (no fluoride complex detected, no copper leached,
//   no hydrogen formed). Such a task has a fact group of the ways to say so;
// - alias: a question in a chemist's own spelling of a reagent or solvent where the paper uses another
//   ("Hünig's base" for "N,N-diisopropylethylamine", "tricyclohexylphosphine" for "PCy3", "acetonitrile" for
//   "MeCN"), which keyword search alone cannot bridge (src/tools/chemical-names.ts);
// - comparison: two papers' findings together;
// - and questions the papers do not answer, with a nearby value in another paper of the library.
//
// Two suites, as for the other papers: `chem` may be looked at task by task while a change is developed;
// `chemholdout` is read only as totals. The questions and their facts were written from the papers before any
// model was run on them, and are not changed to fit a run. Scoring is the research suite's: every fact group in
// the answer, every cited document, a verified quote. The scorer matches lower-cased substrings, so a value
// with a minus sign is given with each of the signs papers and models type (negative below).

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/chem/docs/, each the article of the PMCID in its title. */
export const chemDocuments: FieldDocument[] = [
  { id: "nickel-fluorobenzofuran-coupling", title: "Nickel-catalyzed cross-coupling of 2-fluorobenzofurans with arylboronic acids via aromatic C–F bond activation (Beilstein J. Org. Chem. 2025, PMC11744694)", file: "nickel-fluorobenzofuran-coupling.md" },
  { id: "nickel-photoredox-hydroxytrifluoroethylation", title: "Visible-light-induced nickel-catalyzed α-hydroxytrifluoroethylation of alkyl carboxylic acids (Beilstein J. Org. Chem. 2023, PMC10509543)", file: "nickel-photoredox-hydroxytrifluoroethylation.md" },
  { id: "propargylation-biisoquinoline-dioxide", title: "Enantioselective regiospecific addition of propargyltrichlorosilane to aldehydes catalyzed by biisoquinoline N,N'-dioxides (Beilstein J. Org. Chem. 2024, PMC11610484)", file: "propargylation-biisoquinoline-dioxide.md" },
  { id: "photoredox-isonitrile-arylation", title: "Photoredox-catalyzed arylation of isonitriles by diaryliodonium salts towards benzamides (Beilstein J. Org. Chem. 2025, PMC12302481)", file: "photoredox-isonitrile-arylation.md" },
  { id: "polyaza-helicene-photoredox", title: "Mechanistic investigations of polyaza[7]helicene in photoredox and energy transfer catalysis (Beilstein J. Org. Chem. 2024, PMC11181280)", file: "polyaza-helicene-photoredox.md" },
  { id: "copper-step-edges-co2-reduction", title: "Direct formation of copper nanoparticles from atoms at graphitic step edges lowers overpotential and improves selectivity of electrocatalytic CO2 reduction (Communications Chemistry 2024, PMC11190262)", file: "copper-step-edges-co2-reduction.md" },
  { id: "porphyrin-aggregation-co2-reduction", title: "Porphyrin aggregation under homogeneous conditions inhibits electrocatalysis: a case study on CO2 reduction (ACS Central Science 2024, PMC11212130)", file: "porphyrin-aggregation-co2-reduction.md" },
  { id: "frustrated-lewis-pairs-co2-capture", title: "Computational design for enantioselective CO2 capture: asymmetric frustrated Lewis pairs in epoxide transformations (Beilstein J. Org. Chem. 2024, PMC11514440)", file: "frustrated-lewis-pairs-co2-capture.md" },
];

const NIF = ["nickel-fluorobenzofuran-coupling"];
const NIP = ["nickel-photoredox-hydroxytrifluoroethylation"];
const PROP = ["propargylation-biisoquinoline-dioxide"];
const ISO = ["photoredox-isonitrile-arylation"];
const HEL = ["polyaza-helicene-photoredox"];
const CU = ["copper-step-edges-co2-reduction"];
const POR = ["porphyrin-aggregation-co2-reduction"];
const FLP = ["frustrated-lewis-pairs-co2-capture"];

/**
 * The ways an answer says a control or a comparison showed nothing: no effect, no difference, not detected. A
 * negative task needs one of them, so an answer that reports the effect anyway fails; the scorer matches
 * substrings of the lower-cased answer.
 */
export const NO_EFFECT = [
  "did not",
  "didn't",
  "does not",
  "doesn't",
  "was not",
  "were not",
  "no effect",
  "no difference",
  "no significant",
  "not significant",
  "no evidence",
  "not detected",
  "no detectable",
  "not observed",
  "negligible",
  "unaffected",
  "unchanged",
  "no,",
  "no.",
];

/** A negative value with each sign papers and models type: a minus sign, an en dash, a hyphen. */
const negative = (value: string): string[] => [`−${value}`, `–${value}`, `-${value}`];

/** A time in microseconds, with the micro sign and the Greek letter, as papers and models write it. */
const microseconds = (value: string): string[] => [`${value} µs`, `${value} μs`, `${value}µs`, `${value}μs`, `${value} us`, `${value} microseconds`];

export const chemTasks: ResearchTask[] = [
  // Nickel-catalysed coupling of 2-fluorobenzofurans (Beilstein J. Org. Chem. 2025).
  {
    // unit, condition: Table 1, entry 9: 5 mol% Ni(cod)2 with 1.2 equiv K2CO3, not entry 1's 10 mol% or 2.0 equiv.
    id: "c01-nif-best-conditions",
    kind: "lookup",
    question: "In the nickel-catalyzed coupling of 2-fluoronaphtho[2,1-b]furan with m-tolylboronic acid, what Ni(cod)2 loading and how much K2CO3 gave the highest yield of 3bb (98%)?",
    answerable: true,
    facts: [["5 mol"], ["1.2 equiv"]],
    citations: [NIF],
  },
  {
    // direction: reducing the temperature from 80 °C improved the yield, to quantitative at room temperature.
    id: "c02-nif-temperature",
    kind: "lookup",
    question: "In the coupling of 2-fluoronaphtho[2,1-b]furan with m-tolylboronic acid, how did lowering the reaction temperature from 80 °C affect the yield of 3bb?",
    answerable: true,
    facts: [["improved", "increased", "higher", "quantitative", "rose"]],
    citations: [NIF],
  },
  {
    // name: Table 2: 2-iodobenzofuran gave 32%, next to 2-bromobenzofuran's 1% and 2-chlorobenzofuran's trace.
    id: "c03-nif-iodo-yield",
    kind: "lookup",
    question: "Under the conditions optimized for 2-fluorobenzofuran, what yield of 3ab did 2-iodobenzofuran give?",
    answerable: true,
    facts: [["32"]],
    citations: [NIF],
  },
  {
    // negative: no peaks of the benzofuranylnickel(II) fluoride Fb were detected; the nickelacyclopropane Eb formed.
    id: "c04-nif-fluoride-not-detected",
    kind: "lookup",
    question: "In the stoichiometric reaction of 1b with Ni(cod)2, PCy3 and cod, was the benzofuranylnickel(II) fluoride Fb that oxidative addition would give detected?",
    answerable: true,
    facts: [[...NO_EFFECT, "no peaks", "not detect"]],
    citations: [NIF],
  },
  {
    // unit: the 19F NMR signal of Eb is at 55.0 ppm, with JFP of 53 and 42 Hz; a shift given in Hz is wrong.
    id: "c05-nif-eb-fluorine-nmr",
    kind: "lookup",
    question: "What 19F NMR chemical shift and F–P coupling constants were attributed to the nickelacyclopropane Eb?",
    answerable: true,
    facts: [["55.0 ppm", "55.0ppm", "δ 55.0", "55 ppm"], ["53"], ["42"]],
    citations: [NIF],
  },
  {
    // name, condition: under palladium catalysis only the C–Br bond of 1e reacted, giving 1f in 95%.
    id: "c06-nif-orthogonal-palladium",
    kind: "lookup",
    question: "In the orthogonal synthesis of 2,5-diarylbenzofuran 3fa, which bond of 5-bromo-2-fluorobenzofuran reacted under palladium catalysis, and in what yield was 1f formed?",
    answerable: true,
    facts: [["c–br", "c-br", "carbon–bromine", "carbon-bromine", "bromide", "bromine"], ["95"]],
    citations: [NIF],
  },
  {
    // alias, unit: the paper writes "PCy3 (20 mol %)", never "tricyclohexylphosphine".
    id: "c07-nif-phosphine-alias",
    kind: "lookup",
    question: "How much tricyclohexylphosphine was used with 10 mol% bis(cyclooctadiene)nickel in the first screening entry for the coupling of 2-fluoronaphthofuran?",
    answerable: true,
    facts: [["20 mol"]],
    citations: [NIF],
  },

  // Visible-light nickel-catalysed α-hydroxytrifluoroethylation (Beilstein J. Org. Chem. 2023).
  {
    // unit, condition: Table 1, entry 6: 3.0 equiv H2O raised 3a to 74%; entry 7's 10.0 equiv gave 68%.
    id: "c08-nip-water",
    kind: "lookup",
    question: "In the visible-light nickel-catalyzed α-hydroxytrifluoroethylation of 4-phenylbutyric acid, how much water raised the yield of 3a to 74%?",
    answerable: true,
    facts: [["3.0 equiv", "3 equiv", "3.0 equivalents", "3 equivalents"]],
    citations: [NIP],
  },
  {
    // name: Table 1, entry 8: NiCl2(dtbbpy) gave 37%, against NiBr2(dtbbpy)'s 74%.
    id: "c09-nip-nickel-chloride",
    kind: "lookup",
    question: "In the α-hydroxytrifluoroethylation optimization, what yield of 3a did NiCl2(dtbbpy) give?",
    answerable: true,
    facts: [["37"]],
    citations: [NIP],
  },
  {
    // condition: Table 1, entry 14: DMF gave a trace, NMP 53%, DMAc 74%.
    id: "c10-nip-trace-solvent",
    kind: "lookup",
    question: "Which solvent gave only a trace of 3a in the optimization of the nickel-catalyzed α-hydroxytrifluoroethylation?",
    answerable: true,
    facts: [["dmf", "dimethylformamide"]],
    citations: [NIP],
  },
  {
    // negative: the protocol needs neither a photocatalyst nor a metal reductant.
    id: "c11-nip-no-photocatalyst",
    kind: "lookup",
    question: "Does the visible-light nickel-catalyzed α-hydroxytrifluoroethylation of alkyl carboxylic acids require a photocatalyst?",
    answerable: true,
    facts: [[...NO_EFFECT, "not require", "without", "no photocatalyst", "bypasses", "no exogenous"]],
    citations: [NIP],
  },
  {
    // unit: the Ni(I)/Ni(0) couple is at −1.17 V vs SCE; photoexcited Hantzsch ester is at −2.28 V.
    id: "c12-nip-nickel-potential",
    kind: "lookup",
    question: "What reduction potential is given for the Ni(I)/Ni(0) couple in the proposed mechanism of the α-hydroxytrifluoroethylation?",
    answerable: true,
    facts: [negative("1.17"), ["sce"]],
    citations: [NIP],
  },

  // Enantioselective propargylation with propargyltrichlorosilane (Beilstein J. Org. Chem. 2024).
  {
    // stereo: with catalyst 3, both Hünig's base and 4 Å molecular sieves gave 99% yield and a 78:22 er.
    id: "c13-prop-catalyst-3",
    kind: "lookup",
    question: "With catalyst 3, what yield and enantiomeric ratio did the allenylation of benzaldehyde with propargyltrichlorosilane give?",
    answerable: true,
    facts: [["99"], ["78:22"]],
    citations: [PROP],
  },
  {
    // direction: narrowing the chiral pocket from 3 to 4, 5 and 6 lowered the enantioselectivity, the reverse of allylation.
    id: "c14-prop-narrow-pocket",
    kind: "lookup",
    question: "As the chiral pocket of the biisoquinoline N,N'-dioxide catalysts was narrowed (from 3 to 4, 5 and 6), how did the enantioselectivity of the allenylation change?",
    answerable: true,
    facts: [["decrease", "lower", "dropped", "reduced", "worse", "fell"]],
    citations: [PROP],
  },
  {
    // alias, unit: the paper writes "N,N-diisopropylethylamine", never "Hünig's base" or "DIPEA"; 43.8 kcal/mol without it.
    id: "c15-prop-isomerization-alias",
    kind: "lookup",
    question: "What free-energy barrier did DFT give for the isomerization of propargyltrichlorosilane to allenyltrichlorosilane without Hünig's base?",
    answerable: true,
    facts: [["43.8"]],
    citations: [PROP],
  },
  {
    // unit, direction: with the amine, the proton abstraction has a 14.2 kcal/mol barrier, and the overall change is 1.7 kcal/mol exergonic.
    id: "c16-prop-amine-barrier",
    kind: "lookup",
    question: "In the presence of N,N-diisopropylethylamine, what barrier does the proton abstraction from propargyltrichlorosilane have, and is the overall isomerization to allenyltrichlorosilane exergonic or endergonic?",
    answerable: true,
    facts: [["14.2"], ["exergonic"]],
    citations: [PROP],
  },
  {
    // negative: no homopropargylic alcohols were observed with any aldehyde.
    id: "c17-prop-no-homopropargylic",
    kind: "lookup",
    question: "Were homopropargylic alcohols observed in the allenylation of aldehydes with propargyltrichlorosilane catalyzed by (S)-8?",
    answerable: true,
    facts: [[...NO_EFFECT, "not observe", "no homopropargylic"]],
    citations: [PROP],
  },
  {
    // alias, name: run in CH2Cl2 ("methylene chloride"), never "dichloromethane"; the unsubstituted catalyst 8 was the most enantioselective.
    id: "c18-prop-best-catalyst-alias",
    kind: "lookup",
    question: "In the allenylation of benzaldehyde with propargyltrichlorosilane in dichloromethane, which biisoquinoline N,N'-dioxide catalyst was the most enantioselective?",
    answerable: true,
    facts: [["catalyst 8", "(s)-8", "8 was", "unsubstituted"]],
    citations: [PROP],
  },

  // Photoredox arylation of isonitriles by diaryliodonium salts (Beilstein J. Org. Chem. 2025).
  {
    // name, condition: Table 1: fac-Ir(ppy)3 gave 26%, [Ru(bpy)3](PF6)2 36%, despite iridium's higher reductive potential.
    id: "c19-iso-iridium-ruthenium",
    kind: "lookup",
    question: "In the photoredox arylation of 1-isocyano-4-methylbenzene with diphenyliodonium triflate, what yields of benzamide 2aa did fac-Ir(ppy)3 and [Ru(bpy)3](PF6)2 give?",
    answerable: true,
    facts: [["26"], ["36"]],
    citations: [ISO],
  },
  {
    // direction, condition: under air only 9% of 2aa formed: oxygen inhibited the reaction.
    id: "c20-iso-under-air",
    kind: "lookup",
    question: "What yield of benzamide 2aa did the isonitrile arylation give under an air atmosphere?",
    answerable: true,
    facts: [["9%", "9 %", "9 percent"]],
    citations: [ISO],
  },
  {
    // direction: electron-poor (EWG-substituted) diaryliodonium salts gave the higher yields.
    id: "c21-iso-electron-poor",
    kind: "lookup",
    question: "Did diaryliodonium salts with electron-withdrawing or with electron-donating aryl groups give higher yields of benzamides in the photoredox arylation of isonitriles?",
    answerable: true,
    facts: [["electron-withdrawing", "electron withdrawing", "electron-deficient", "electron-poor", "electron poor", "ewg"]],
    citations: [ISO],
  },
  {
    // alias, condition: the paper writes "Na2CO3"; Cs2CO3 gave 30% and KOH 11%.
    id: "c22-iso-base-alias",
    kind: "lookup",
    question: "Which base was chosen for the photoredox arylation of isonitriles with diaryliodonium salts: sodium carbonate, caesium carbonate or potassium hydroxide?",
    answerable: true,
    facts: [["na2co3", "sodium carbonate"]],
    citations: [ISO],
  },

  // Polyaza[7]helicene photocatalyst (Beilstein J. Org. Chem. 2024).
  {
    // unit, name: singlet-excited Aza-H is at −1.87 V vs SCE; the triplet at −1.20 V, 4-cyanopyridine at −1.81 V.
    id: "c23-hel-singlet-potential",
    kind: "lookup",
    question: "What is the excited-state reduction potential of singlet-excited Aza-H, the polyaza[7]helicene photocatalyst?",
    answerable: true,
    facts: [negative("1.87")],
    citations: [HEL],
  },
  {
    // unit: the singlet lives 9.6 ns, the triplet about 28 µs; a lifetime in the other unit is wrong by a thousandfold.
    id: "c24-hel-lifetimes",
    kind: "lookup",
    question: "What are the singlet and triplet excited-state lifetimes of the polyazahelicene photocatalyst Aza-H?",
    answerable: true,
    facts: [["9.6 ns", "9.6ns", "9.6 nanoseconds"], microseconds("28")],
    citations: [HEL],
  },
  {
    // stereo: triplet sensitization by Aza-H reaches a Z/E ratio of 91:9.
    id: "c25-hel-stilbene-ratio",
    kind: "lookup",
    question: "What Z/E ratio of stilbene was reached at equilibrium when stilbene was irradiated with Aza-H as triplet sensitizer?",
    answerable: true,
    facts: [["91:9"]],
    citations: [HEL],
  },
  {
    // alias: the paper writes "48% (in MeCN)", never "acetonitrile" for this; 0.48 elsewhere.
    id: "c26-hel-fluorescence-alias",
    kind: "lookup",
    question: "What fluorescence quantum yield does the polyazahelicene Aza-H have in acetonitrile?",
    answerable: true,
    facts: [["48", "0.48"]],
    citations: [HEL],
  },

  // Copper nanoparticles on graphitic step edges for CO2 reduction (Communications Chemistry 2024).
  {
    // name, unit: 0.84 wt% Cu gives 94% FE for formate at −0.38 V vs RHE; 3.38 wt% gives 18%.
    id: "c27-cu-loading-selectivity",
    kind: "lookup",
    question: "What faradaic efficiency for formate did Cu/GNF with 0.84 wt% copper reach at −0.38 V vs RHE, and what did the catalyst with 3.38 wt% copper give?",
    answerable: true,
    facts: [["94"], ["18"]],
    citations: [CU],
  },
  {
    // direction: after 24 h of CO2 reduction, the onset potential shifted more negative, and formate fell.
    id: "c28-cu-onset-after-24h",
    kind: "lookup",
    question: "How did the onset potential for CO2 reduction on Cu/GNF change after 24 h of electrolysis?",
    answerable: true,
    facts: [["more negative", "negative shift", "negatively", "shifted negative", "shift to negative", "cathodic"]],
    citations: [CU],
  },
  {
    // negative: ICP-OES found no detectable leaching of copper.
    id: "c29-cu-no-leaching",
    kind: "lookup",
    question: "Did copper leach from the Cu/GNF electrocatalyst during CO2 reduction?",
    answerable: true,
    facts: [[...NO_EFFECT, "no leaching", "not leach"]],
    citations: [CU],
  },
  {
    // unit, name: DFT gives a 0.256 eV H2O–CO2 binding energy difference on Cu(311), 0.147 eV on Cu(111).
    id: "c30-cu-facet-binding",
    kind: "lookup",
    question: "What difference between the binding energies of H2O and CO2 did DFT give on the Cu(311) surface?",
    answerable: true,
    facts: [["0.256"]],
    citations: [CU],
  },

  // Iron porphyrin aggregation and CO2 reduction (ACS Central Science 2024).
  {
    // direction: kobs depends inversely on the catalyst concentration, for all three porphyrins.
    id: "c31-por-inverse-dependence",
    kind: "lookup",
    question: "How did the observed rate constant for CO2 reduction depend on the concentration of the iron porphyrin catalyst?",
    answerable: true,
    facts: [["inverse", "decrease", "lower", "fell", "dropped"]],
    citations: [POR],
  },
  {
    // negative: phenol (0–500 mM) caused no significant UV–vis changes, unlike pyrene, which disaggregated.
    id: "c32-por-phenol-no-effect",
    kind: "lookup",
    question: "Did phenol act as a disaggregating additive for the iron porphyrins, as pyrene did?",
    answerable: true,
    facts: [[...NO_EFFECT, "no significant", "did not"]],
    citations: [POR],
  },
  {
    // stereo-like descriptor: red-shifted Soret bands assign J-type (staircase), not H-type (face-to-face) aggregates.
    id: "c33-por-j-aggregates",
    kind: "lookup",
    question: "Do the iron meso-phenylporphyrins form J-type or H-type aggregates in DMF electrolyte?",
    answerable: true,
    facts: [["j-type", "j-aggregate", "j type", "j aggregate", "staircase"]],
    citations: [POR],
  },
  {
    // name: zinc tetraphenylporphyrin showed no aggregation; nickel and copper the most, then cobalt.
    id: "c34-por-zinc",
    kind: "lookup",
    question: "Which of the divalent metal tetraphenylporphyrins surveyed (cobalt, nickel, copper, zinc) showed no evidence of aggregation?",
    answerable: true,
    facts: [["zinc", "zn"]],
    citations: [POR],
  },

  // Asymmetric frustrated Lewis pairs for CO2 capture (Beilstein J. Org. Chem. 2024).
  {
    // stereo: the designed catalyst favours the (R) product, 96% ee with the effective rate constant (95% before).
    id: "c35-flp-enantiomer",
    kind: "lookup",
    question: "Which enantiomer of the product does the designed asymmetric FLP catalyst favour in the coupling of propylene oxide with CO2, and with what enantiomeric excess once both transition states to it are counted?",
    answerable: true,
    facts: [["(r)", "r enantiomer", "r-enantiomer", "r product", "r-product"], ["96"]],
    citations: [FLP],
  },
  {
    // unit, direction: CO2 capture has a +10.0 kcal/mol barrier, epoxide capture +30.0: a kinetically controlled choice.
    id: "c36-flp-co2-first",
    kind: "lookup",
    question: "In the frustrated Lewis pair study, what activation barrier does the capture of CO2 by the FLP have, compared with the capture of the epoxide?",
    answerable: true,
    facts: [["10.0"], ["30.0"]],
    citations: [FLP],
  },
  {
    // unit: the simulations were run at 273.0 K, not 273 °C.
    id: "c37-flp-temperature",
    kind: "lookup",
    question: "At what temperature were the FLP-catalyzed reaction simulations of CO2 and propylene oxide run?",
    answerable: true,
    facts: [["273.0 k", "273 k", "273.0k", "273k", "273.0 kelvin", "273 kelvin", "0 °c"]],
    citations: [FLP],
  },

  // Two papers, and questions the papers do not answer.
  {
    // comparison, unit: −0.38 V vs RHE on copper, about −2.2 V vs Fc/Fc+ for the porphyrin electrolyses: two references.
    id: "c38-co2-potentials-compared",
    kind: "comparison",
    question: "At what potential, and against which reference electrode, was CO2 reduced in the Cu/GNF formate study and in the iron porphyrin bulk electrolyses?",
    answerable: true,
    facts: [["0.38"], ["rhe"], ["2.2"], ["fc"]],
    citations: [CU, POR],
  },
  {
    // not in the papers: the 2-arylbenzofurans are achiral and no enantiomeric excess is given; the FLP study gives 96% ee.
    id: "c39-nif-no-ee",
    kind: "unanswerable",
    question: "What enantiomeric excess did the nickel-catalyzed coupling of 2-fluorobenzofurans with arylboronic acids give for 3bb?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // not in the papers: the iron porphyrins make CO; formate is the copper paper's product (94% FE).
    id: "c40-por-no-formate",
    kind: "unanswerable",
    question: "What faradaic efficiency for formate did the iron meso-phenylporphyrin catalysts reach in DMF?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const chemHoldoutTasks: ResearchTask[] = [
  {
    // name: 2-fluorobenzothiophene gave 48% of 5 with 20 mol% Ni(cod)2.
    id: "ch01-nif-benzothiophene",
    kind: "lookup",
    question: "What yield of 2-phenylbenzothiophene did the nickel-catalyzed defluorinative coupling of 2-fluorobenzothiophene give?",
    answerable: true,
    facts: [["48"]],
    citations: [NIF],
  },
  {
    // unit: photoexcited Hantzsch ester at −2.28 V vs SCE.
    id: "ch02-nip-hantzsch-potential",
    kind: "lookup",
    question: "What reduction potential is given for photoexcited Hantzsch ester in the α-hydroxytrifluoroethylation mechanism?",
    answerable: true,
    facts: [negative("2.28")],
    citations: [NIP],
  },
  {
    // negative: aromatic and tertiary carboxylic acids were not compatible.
    id: "ch03-nip-tertiary-acids",
    kind: "lookup",
    question: "Were tertiary carboxylic acids compatible with the visible-light nickel-catalyzed α-hydroxytrifluoroethylation?",
    answerable: true,
    facts: [[...NO_EFFECT, "not compatible", "incompatible", "unfortunately not"]],
    citations: [NIP],
  },
  {
    // unit, condition: propargyl bromide and CuF2 gave isomerically pure propargyltrichlorosilane on a 50 mmol scale in 43% yield.
    id: "ch04-prop-preparation",
    kind: "lookup",
    question: "On what scale and in what yield was propargyltrichlorosilane free of allenyltrichlorosilane prepared from propargyl bromide and CuF2?",
    answerable: true,
    facts: [["50 mmol"], ["43"]],
    citations: [PROP],
  },
  {
    // name: the tosylate 1a-TsO gave 37%, the tetrafluoroborate 1a-BF4 28%.
    id: "ch05-iso-tosylate",
    kind: "lookup",
    question: "What yield of benzamide 2aa did diphenyliodonium tosylate give in the photoredox arylation of isonitriles?",
    answerable: true,
    facts: [["37"]],
    citations: [ISO],
  },
  {
    // unit: the Aza-H triplet energy is 2.32 eV by experiment (2.17 eV computed).
    id: "ch06-hel-triplet-energy",
    kind: "lookup",
    question: "What triplet energy was measured for Aza-H from its 77 K phosphorescence?",
    answerable: true,
    facts: [["2.32"]],
    citations: [HEL],
  },
  {
    // unit: Tafel slope 362 mV per decade.
    id: "ch07-cu-tafel",
    kind: "lookup",
    question: "What Tafel slope was obtained for CO2 reduction on Cu/GNF?",
    answerable: true,
    facts: [["362"]],
    citations: [CU],
  },
  {
    // direction: Cu(0) and Cu(I) rose from 33.7% to 60.4%: the copper was more reduced after electrolysis.
    id: "ch08-cu-oxidation-state",
    kind: "lookup",
    question: "According to XPS, were the copper species of Cu/GNF more oxidized or more reduced after 24 h of CO2 electrolysis?",
    answerable: true,
    facts: [["more reduced", "reduced"]],
    citations: [CU],
  },
  {
    // name, unit: FeDiPP has the weakest aggregate binding energy, −0.838 eV per molecule.
    id: "ch09-por-weakest-aggregate",
    kind: "lookup",
    question: "Which iron porphyrin forms the least stable aggregates in the periodic calculations, and with what binding energy per molecule?",
    answerable: true,
    facts: [["fedipp"], ["0.838"]],
    citations: [POR],
  },
  {
    // name: in group 2 (mechanisms 2 and 3), phosphorus Lewis bases were more active, the reverse of group 1.
    id: "ch10-flp-group2-base",
    kind: "lookup",
    question: "For the FLP catalysts whose reactions follow mechanisms 2 or 3, which Lewis base atom gave the more active catalysts?",
    answerable: true,
    facts: [["phosphorus"]],
    citations: [FLP],
  },
  {
    // stereo (regiochemistry): breaking the O–CH(CH3) bond has a transition state 7.6 kcal/mol lower than breaking O–CH2.
    id: "ch11-flp-regioselectivity",
    kind: "lookup",
    question: "Which C–O bond of propylene oxide is broken preferentially when activated CO2 opens it, and by how much is its transition state lower?",
    answerable: true,
    facts: [["ch(ch3)", "ch(ch₃)", "substituted carbon", "more substituted", "methyl-bearing", "secondary carbon", "internal"], ["7.6"]],
    citations: [FLP],
  },
  {
    // not in the papers: no turnover number is given for Ru(bpy)3 in the isonitrile arylation; the Aza-H paper gives 4440.
    id: "ch12-iso-no-turnover",
    kind: "unanswerable",
    question: "What turnover number did [Ru(bpy)3](PF6)2 reach in the photoredox arylation of isonitriles with diaryliodonium salts?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
