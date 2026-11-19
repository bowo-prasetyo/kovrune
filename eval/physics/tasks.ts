// Questions over physics documents (harness 0.91.0): the kind a physicist brings, which no other suite holds.
// An audit from a physicist's point of view (harness 0.90.0, eval/field/README.md) found that the LaTeX
// converter dropped every unit written with siunitx, and that the sentence check passed a wrong unit prefix
// (meV for MeV, mK for K, kpc for Mpc), a lower limit for an upper one and an allowed mass for an excluded
// one. No suite had physics text, so neither the gain of that fix nor the size of the problem could be
// measured. This suite can.
//
// The six documents are made up, as the engineering suite's are: three papers written as LaTeX source, as
// arXiv serves them, and read with the app's own converter (src/documents/latex.ts, siunitx.ts); a
// two-column PDF laid out as real ones are (source/make_pdfs.py); a commissioning report in Markdown; and a
// table of measurements as CSV. The LaTeX papers use what physics papers use: REVTeX, siunitx (with
// concise uncertainties, "0.75(3)", and per-mode=symbol), hepunits and the paper's own macros, numbered
// equations, and asymmetric uncertainties. The documents overlap where real ones would: the letter's
// pressure data are in the CSV, and its sample S1 in both.
//
// The questions ask what a physicist reading these asks, in kinds noted on each task:
// - unit: a value whose unit or prefix matters, checked in its case (casedFacts), since the scorer
//   compares other facts in lower case, where "meV" and "MeV" are one;
// - uncertainty: a value with its uncertainty, symmetric, asymmetric or concise ("13.5(4)");
// - table: a value given only in a table, next to others easy to take;
// - limit: an upper or a lower limit, an exclusion, a significance;
// - order: an ordering or a direction (first-order, higher at pressure);
// - equation: what a numbered equation says;
// - and questions the documents do not answer.
//
// Two suites, as for the other fields: `physics` may be looked at task by task while a change is
// developed; `physicsholdout` is read only as totals. The questions and their facts were written from the
// documents before any model ran on them, and are not changed to fit a run. Scoring is the research
// suite's (eval/harness/scoring.ts), with casedFacts compared in their case.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/physics/docs/. The .tex files are read as an arXiv source is (eval/harness/field.ts). */
export const physicsDocuments: FieldDocument[] = [
  { id: "kagome-pdw-letter", title: "Pair-density-wave order coexisting with uniform superconductivity in the kagome metal CsKa3Sb5 (Phys. Rev. Lett., made up)", file: "kagome-pdw-letter.tex" },
  { id: "zprime-dilepton", title: "Search for high-mass resonances in dielectron and dimuon final states with 139 fb⁻¹ at 13 TeV (HORIZON Collaboration, made up)", file: "zprime-dilepton.tex" },
  { id: "hubble-cepheids", title: "A 1.4% Determination of the Hubble Constant from Cepheids and Type Ia Supernovae in the LUMEN Survey (made up)", file: "hubble-cepheids.tex" },
  { id: "rb87-bec-paper", title: "Fast All-Optical Bose–Einstein Condensation of 87Rb in a 1064-nm Crossed Dipole Trap (made up)", file: "rb87-bec-paper.pdf" },
  { id: "dilution-fridge-commissioning", title: "Commissioning report CR-DR2: dilution refrigerator with 12 T magnet (made up)", file: "dilution-fridge-commissioning.md" },
  { id: "pressure-transport", title: "pressure-transport.csv", file: "pressure-transport.csv" },
];

const KAGOME = ["kagome-pdw-letter"];
const ZPRIME = ["zprime-dilepton"];
const HUBBLE = ["hubble-cepheids"];
const BEC = ["rb87-bec-paper"];
const FRIDGE = ["dilution-fridge-commissioning"];
const PRESSURE = ["pressure-transport"];

/** A unit with a micro prefix, as answers write it: both µ characters, "u", and the word. */
const micro = (unit: string, word: string) => [`µ${unit}`, `μ${unit}`, `u${unit}`, `µ ${unit}`, `μ ${unit}`, `micro${word}`];
/** A power of ten as answers and the PDF write it: "10⁵", "10^5", "10^{5}", "10 5" (pdf.js, a raised exponent), "e5". */
const tenTo = (n: number) => [`10${String(n).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]!)}`, `10^${n}`, `10^{${n}}`, `10 ${n}`, `e${n}`, `e+${n}`, `e+0${n}`];

export const physicsTasks: ResearchTask[] = [
  // The kagome letter (LaTeX, siunitx).
  {
    // unit, uncertainty: Δ is 0.75(3) meV; 2Δ is 1.5 meV, and MeV would be a factor of 10⁹.
    id: "ph01-gap",
    kind: "lookup",
    question: "What superconducting gap did STM measure for sample S1 of CsKa3Sb5?",
    answerable: true,
    facts: [["0.75"]],
    casedFacts: [["meV", "millielectronvolt"]],
    citations: [KAGOME],
  },
  {
    // unit: 300 mK, not 300 K; the crystals were cleaved at 20 K.
    id: "ph02-stm-temperature",
    kind: "lookup",
    question: "At what temperature were the tunneling spectra of CsKa3Sb5 measured?",
    answerable: true,
    facts: [["300"]],
    casedFacts: [["mK", "millikelvin"]],
    citations: [KAGOME],
  },
  {
    // uncertainty: written \num{7.6 +- 0.3}.
    id: "ph03-coupling-ratio",
    kind: "lookup",
    question: "What value of 2Δ/kBTc is reported for CsKa3Sb5, with its uncertainty?",
    answerable: true,
    facts: [["7.6"], ["0.3"]],
    citations: [KAGOME],
  },
  {
    // uncertainty: concise, \SI{13.5(4)}{\nano\metre}, which is 13.5 ± 0.4 nm.
    id: "ph04-coherence-length",
    kind: "lookup",
    question: "What Ginzburg–Landau coherence length was obtained for CsKa3Sb5, and with what uncertainty?",
    answerable: true,
    facts: [["13.5"], ["0.4", "13.5(4)"]],
    casedFacts: [["nm", "nanomet"]],
    citations: [KAGOME],
  },
  {
    // table: S3's row, next to S1's 1.80 and S2's 1.62.
    id: "ph05-hc2-s3",
    kind: "lookup",
    question: "What zero-temperature upper critical field does sample S3 have?",
    answerable: true,
    facts: [["1.21"]],
    citations: [KAGOME],
  },
  {
    // table: the residual resistivity ratio of each sample.
    id: "ph06-cleanest-sample",
    kind: "comparison",
    question: "Which of the three CsKa3Sb5 samples has the highest residual resistivity ratio, and what is it?",
    answerable: true,
    facts: [["S1"], ["42"]],
    citations: [KAGOME],
  },
  {
    // order: first-order, from the hysteresis of 20 mT.
    id: "ph07-vortex-transition",
    kind: "lookup",
    question: "Is the transition of the vortex lattice from hexagonal to square in CsKa3Sb5 first-order or second-order?",
    answerable: true,
    facts: [["first-order", "first order"]],
    citations: [KAGOME],
  },
  {
    // equation: Eq. (1), Δ(T) = Δ0 tanh(1.74 √(Tc/T − 1)).
    id: "ph08-gap-equation",
    kind: "lookup",
    question: "What expression was fitted to the temperature dependence of the superconducting gap of CsKa3Sb5?",
    answerable: true,
    facts: [["tanh"], ["1.74"]],
    citations: [KAGOME],
  },
  {
    // order, change: Tc rises from 2.3 K to 3.9 K at 2.0 GPa; the letter and the CSV both give it.
    id: "ph09-tc-pressure",
    kind: "lookup",
    question: "How does the superconducting transition temperature of sample S1 change at 2.0 GPa compared with ambient pressure?",
    answerable: true,
    facts: [["2.3"], ["3.9"]],
    citations: [[...KAGOME, ...PRESSURE]],
  },
  {
    // table: the CSV's T_CDW column at 1.0 GPa.
    id: "ph10-cdw-1gpa",
    kind: "lookup",
    question: "What is the CDW transition temperature of sample S1 at 1.0 GPa in the pressure transport data?",
    answerable: true,
    facts: [["63"]],
    citations: [PRESSURE],
  },
  // The Z′ search (LaTeX, hepunits, the paper's own macros).
  {
    // limit, unit: a lower limit on the mass, 5.1 TeV combined; 4.8 and 4.6 TeV per channel.
    id: "ph11-zssm-limit",
    kind: "lookup",
    question: "Below what mass is the sequential Standard Model Z′ excluded when the dielectron and dimuon channels are combined?",
    answerable: true,
    facts: [["5.1"]],
    casedFacts: [["TeV", "teraelectronvolt"]],
    citations: [ZPRIME],
  },
  {
    // limit: the global significance, not the local 3.1σ.
    id: "ph12-global-significance",
    kind: "lookup",
    question: "What is the global significance of the largest excess in the Z′ dilepton search?",
    answerable: true,
    facts: [["1.4"]],
    citations: [ZPRIME],
  },
  {
    // limit, unit: 774 GeV, local 3.1σ.
    id: "ph13-excess-mass",
    kind: "lookup",
    question: "At what dielectron mass was the largest excess seen in the Z′ search, and with what local significance?",
    answerable: true,
    facts: [["774"], ["3.1"]],
    casedFacts: [["GeV", "gigaelectronvolt"]],
    citations: [ZPRIME],
  },
  {
    // uncertainty: asymmetric, 1.05^{+0.09}_{-0.08}.
    id: "ph14-drell-yan-normalization",
    kind: "lookup",
    question: "What is the fitted normalization of the Drell–Yan background relative to the simulation, with its uncertainties?",
    answerable: true,
    facts: [["1.05"], ["0.09"], ["0.08"]],
    citations: [ZPRIME],
  },
  {
    // limit: an upper limit on σB, 0.020 fb at 6 TeV; 4.5 fb at 500 GeV.
    id: "ph15-cross-section-limit",
    kind: "lookup",
    question: "What upper limit does the Z′ search set on the cross section times branching ratio at a mass of 6 TeV?",
    answerable: true,
    facts: [["0.02"]],
    casedFacts: [["fb", "femtobarn"]],
    citations: [ZPRIME],
  },
  {
    // table: the muon momentum scale at 3 TeV, next to the PDF's 8% and the trigger's 1.0%.
    id: "ph16-muon-scale",
    kind: "lookup",
    question: "What systematic uncertainty does the muon momentum scale contribute to the Z′ signal yield at 3 TeV?",
    answerable: true,
    facts: [["2.0%", "2.0 %", "2%", "2 %", "2 percent", "2.0 percent"]],
    citations: [ZPRIME],
  },
  // The Hubble constant paper (LaTeX, siunitx with per-mode=symbol, declared units).
  {
    // uncertainty: 73.0 ± 1.0 km/s/Mpc.
    id: "ph17-h0",
    kind: "lookup",
    question: "What value of the Hubble constant does the LUMEN Cepheid analysis find, with its uncertainty?",
    answerable: true,
    facts: [["73.0"], ["1.0"]],
    citations: [HUBBLE],
  },
  {
    // limit: 5.0σ, from 73.0 against 67.4.
    id: "ph18-tension",
    kind: "lookup",
    question: "By how many standard deviations does the LUMEN value of the Hubble constant differ from the CMB prediction?",
    answerable: true,
    facts: [["5.0"]],
    citations: [HUBBLE],
  },
  {
    // unit, uncertainty: 7.58 ± 0.08 Mpc; the LMC is 49.59 kpc away.
    id: "ph19-ngc4258",
    kind: "lookup",
    question: "What distance to NGC 4258 does the LUMEN analysis use as an anchor?",
    answerable: true,
    facts: [["7.58"]],
    casedFacts: [["Mpc", "megaparsec"]],
    citations: [HUBBLE],
  },
  {
    // table: M101's row, 6.9 Mpc and 259 Cepheids.
    id: "ph20-m101-cepheids",
    kind: "lookup",
    question: "How many Cepheids were used in M101?",
    answerable: true,
    facts: [["259"]],
    citations: [HUBBLE],
  },
  // The cold-atom paper (two-column PDF, raised exponents, symbols from a second font).
  {
    // unit: 180 nK, not μK; the MOT is at 120 μK.
    id: "ph21-bec-onset",
    kind: "lookup",
    question: "At what temperature does Bose–Einstein condensation set in in the all-optical 87Rb experiment?",
    answerable: true,
    facts: [["180"]],
    casedFacts: [["nK", "nanokelvin"]],
    citations: [BEC],
  },
  {
    // unit, power of ten: 2.0 × 10⁵ atoms, which pdf.js gives as "2.0 × 10 5".
    id: "ph22-condensate-atoms",
    kind: "lookup",
    question: "How many atoms does the final condensate of the all-optical 87Rb experiment hold?",
    answerable: true,
    facts: [["2.0 × 10", "2.0×10", "2 × 10", "2×10", "2.0 x 10", "2 x 10", "200,000", "200000", "200 000", "2e5", "2.0e5"], [...tenTo(5), "200,000", "200000", "200 000"]],
    citations: [BEC],
  },
  // The commissioning report (Markdown).
  {
    // unit: 450 μW, not mW; 1.1 mW is at 200 mK.
    id: "ph23-cooling-power",
    kind: "lookup",
    question: "What cooling power does the dilution refrigerator DR2 provide at 100 mK?",
    answerable: true,
    facts: [["450"]],
    casedFacts: [micro("W", "watt")],
    citations: [FRIDGE],
  },
  {
    // limit: the first quench, 10.4 T, below the rated 12 T.
    id: "ph24-first-quench",
    kind: "lookup",
    question: "At what field did the 12 T magnet of DR2 quench on its first training ramp?",
    answerable: true,
    facts: [["10.4"]],
    citations: [FRIDGE],
  },
  // Not answered: the pressure data stop at 2.5 GPa, and the search at 6 TeV.
  {
    id: "ph25-tc-5gpa",
    kind: "unanswerable",
    question: "What is the superconducting transition temperature of CsKa3Sb5 at 5 GPa?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "ph26-limit-8tev",
    kind: "unanswerable",
    question: "What upper limit on the cross section times branching ratio does the Z′ search set at a mass of 8 TeV?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const physicsHoldoutTasks: ResearchTask[] = [
  {
    id: "phh01-lattice-constant",
    kind: "lookup",
    question: "What in-plane lattice constant does CsKa3Sb5 have, from the STM topography?",
    answerable: true,
    facts: [["5.50", "5.5 "]],
    casedFacts: [["Å", "Angstrom", "angstrom", "ångström", "Ångström", "0.55 nm"]],
    citations: [KAGOME],
  },
  {
    id: "phh02-hc2-s1",
    kind: "lookup",
    question: "What zero-temperature upper critical field does sample S1 of CsKa3Sb5 have, with its uncertainty?",
    answerable: true,
    facts: [["1.8"], ["0.05", "1.80(5)"]],
    citations: [KAGOME],
  },
  {
    id: "phh03-dielectron-efficiency",
    kind: "lookup",
    question: "What is the signal efficiency in the dielectron channel for a 2 TeV sequential Standard Model Z′?",
    answerable: true,
    facts: [["71"]],
    citations: [ZPRIME],
  },
  {
    id: "phh04-dimuon-resolution",
    kind: "lookup",
    question: "What dimuon mass resolution does the Z′ search reach at 3 TeV?",
    answerable: true,
    facts: [["8%", "8 %", "8 percent"]],
    citations: [ZPRIME],
  },
  {
    id: "phh05-redshift-range",
    kind: "lookup",
    question: "What redshift range does the Hubble-flow supernova sample of the LUMEN analysis cover?",
    answerable: true,
    facts: [["0.023"], ["0.15"]],
    citations: [HUBBLE],
  },
  {
    id: "phh06-chemical-potential",
    kind: "lookup",
    question: "What is the chemical potential of the 87Rb condensate, expressed as a temperature?",
    answerable: true,
    facts: [["58"]],
    casedFacts: [["nK", "nanokelvin"]],
    citations: [BEC],
  },
  {
    id: "phh07-lifetime",
    kind: "lookup",
    question: "What is the 1/e lifetime of the 87Rb condensate?",
    answerable: true,
    facts: [["12 s", "12s", "12 second", "12-s"]],
    citations: [BEC],
  },
  {
    id: "phh08-base-temperature",
    kind: "lookup",
    question: "What base temperature did the mixing chamber of DR2 reach during commissioning?",
    answerable: true,
    facts: [["8.2"]],
    casedFacts: [["mK", "millikelvin"]],
    citations: [FRIDGE],
  },
  {
    id: "phh09-hc2-pressure",
    kind: "lookup",
    question: "What upper critical field does sample S1 have at 1.6 GPa in the pressure transport data?",
    answerable: true,
    facts: [["2.9"]],
    citations: [PRESSURE],
  },
  {
    id: "phh10-dark-energy",
    kind: "unanswerable",
    question: "What value of the dark energy equation-of-state parameter w does the LUMEN analysis report?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
