// Questions over materials science papers and test data (harness 0.108.0): recommendation 6 of the materials science
// audit (docs/materials-science-audit.md, MS10), the documents a metallurgist, ceramicist, polymer scientist or battery
// and photovoltaics researcher brings, which no other suite holds. The chemistry suite has no materials paper, and the
// engineering and physics suites' documents are made up. None of them has a tensile table of several alloys in several
// tempers, a creep rate in powers of ten, a battery's capacity at four C-rates next to its Coulombic efficiency and
// retention, a solar cell's Voc, Jsc, FF and PCE side by side, a ceramic's hardness, modulus and toughness in one row,
// a CIF, or a property table with an empty cell. Those are where reading the field goes wrong: which property has the
// value, of which sample and condition, in which unit, and which phase or mechanism.
//
// The documents are eight open-access papers, CC BY 4.0, from Europe PMC's full-text XML, read with the app's own
// converter (source/build.ts), and three made-up documents (source/make_docs.py): a CIF of Al-doped cubic LLZO, a CSV
// tensile log of Ti-6Al-4V coupons built by selective laser melting, and a PDF test report whose property table leaves
// cells empty. They are their own library, and overlap on purpose: three alloys (a cast Al–Si–Cu–Mg with nickel, a
// titanium alloy in creep, a medium-manganese steel), two battery materials (a LiFePO4 cathode, a garnet LLZO electrolyte,
// with the LLZO also as the CIF), three hot-pressed or sintered ceramics (LLZO, boron carbide, zirconia-toughened
// alumina), a polymer, a perovskite solar cell, and Ti-6Al-4V next to the TC25 titanium alloy.
//
// The questions ask what a materials scientist reading a result asks, in kinds tagged on each task:
// - property: a value of one property where the document gives others in the same unit beside it (yield strength and
//   UTS, hardness and modulus, Voc and Jsc, Coulombic efficiency and capacity retention);
// - table: a value read from a table by its row and column, including a table with an empty cell;
// - unit: a value whose unit or prefix matters (mS cm−1, μs and ns, cm−1);
// - power: a value written in powers of ten (a creep rate, a dislocation density);
// - direction: which way a property changed with a processing variable;
// - phase: a phase, crystal structure, space group, fracture mode or mechanism, where the other one is the error;
// - negative: something that did not happen or could not be measured;
// - alias: asked in another of the field's names for a material or process ("lithium iron phosphate" for LiFePO4,
//   "laser powder bed fusion" for selective laser melting);
// - comparison: a question over two documents;
// - and questions the documents do not answer, with a nearby fact in the library.
//
// Two suites, as for the other papers: `materials` may be looked at task by task while a change is developed;
// `materialsholdout` is read only as totals. The questions and their facts were written from the documents before any
// model was run on them, and are not changed to fit a run. Scoring is the research suite's: every fact group in the
// answer, every cited document, a verified quote. The scorer matches lower-cased substrings, so a unit whose prefix is
// only a case apart is asked for in `casedFacts` ("mS", not "S").

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/materials/docs/: each paper is the article of the PMCID in its title. */
export const materialsDocuments: FieldDocument[] = [
  { id: "al-si-cu-mg-nickel-alloys", title: "Analysis of Ni-Cu Interaction in Aluminum-Based Alloys: Hardness, Tensile and Precipitation Behavior (Materials 2024, PMC11433832)", file: "al-si-cu-mg-nickel-alloys.md" },
  { id: "tc25-titanium-creep", title: "The Influence of Heat Treatment on the Tensile Creep Life of the TC25 Titanium Alloy (Materials 2024, PMC11642185)", file: "tc25-titanium-creep.md" },
  { id: "medium-manganese-steel-heating-rate", title: "The Effect of Heating Rate on the Microstructure Evolution and Hardness of Heterogeneous Manganese Steel (Materials 2024, PMC11547944)", file: "medium-manganese-steel-heating-rate.md" },
  { id: "lifepo4-combustion-synthesis", title: "Solution Combustion Synthesis of High-Performance Nano-LiFePO4/C Cathode Material from Cost-Effective Mixed Fuels (Materials 2023, PMC10672621)", file: "lifepo4-combustion-synthesis.md" },
  { id: "perovskite-pai-passivation", title: "Enhancing Perovskite Solar Cell Performance through Propylamine Hydroiodide Passivation (Nanomaterials 2024, PMC11397452)", file: "perovskite-pai-passivation.md" },
  { id: "llzo-hot-pressing-sps", title: "High-Temperature Sintering of Garnet Solid Electrolyte Li7La3Zr2O12: A Comparative Study of Induction Hot Pressing and Spark Plasma Sintering (Small 2025, PMC12530038)", file: "llzo-hot-pressing-sps.md" },
  { id: "boron-carbide-sic-tib2", title: "Improving the Fracture Toughness of Boron Carbide via Minor Additions of SiC and TiB2 Through Hot-Press Sintering (Materials 2024, PMC11678037)", file: "boron-carbide-sic-tib2.md" },
  { id: "pla-starch-hydrothermal-ageing", title: "Differentiation between Hydrolytic and Thermo-Oxidative Degradation of Poly(lactic acid) and Poly(lactic acid)/Starch Composites in Warm and Humid Environments (Materials 2024, PMC11313141)", file: "pla-starch-hydrothermal-ageing.md" },
  { id: "llzo-al-cubic", title: "llzo-al-cubic.cif", file: "llzo-al-cubic.cif" },
  { id: "ti64-slm-tensile-log", title: "Ti-6Al-4V coupons built by selective laser melting (SLM), tensile test log.csv", file: "ti64-slm-tensile-log.csv" },
  { id: "zta-test-report", title: "zta-test-report.pdf", file: "zta-test-report.pdf" },
];

const AL = ["al-si-cu-mg-nickel-alloys"];
const TC25 = ["tc25-titanium-creep"];
const STEEL = ["medium-manganese-steel-heating-rate"];
const LFP = ["lifepo4-combustion-synthesis"];
const PSC = ["perovskite-pai-passivation"];
const LLZO = ["llzo-hot-pressing-sps"];
const B4C = ["boron-carbide-sic-tib2"];
const PLA = ["pla-starch-hydrothermal-ageing"];
const CIF = ["llzo-al-cubic"];
const TI64 = ["ti64-slm-tensile-log"];
const ZTA = ["zta-test-report"];

/** A power of ten written as the papers write it, or as a model may. */
const TEN = (n: number) => [`10${toSuperscript(n)}`, `10^${n}`, `10^{${n}}`, `10^(${n})`, `e${n}`, `e+${n}`];
const TEN_MINUS = (n: number) => [`10⁻${toSuperscript(n)}`, `10^-${n}`, `10^−${n}`, `10^{-${n}}`, `10^{−${n}}`, `10-${n}`, `10−${n}`, `e-${n}`, `e−${n}`];
function toSuperscript(n: number): string {
  return [...String(n)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("");
}

export const materialsTasks: ResearchTask[] = [
  // Nickel in a cast Al–Si–Cu–Mg alloy (Materials 2024): tempers, tensile tests at 240 °C, intermetallics by volume.
  {
    // property: two alloys' losses in yield strength, each the other's distractor.
    id: "m01-al-ni-ys-loss",
    kind: "lookup",
    question: "In the study of nickel in Al-Si-Cu-Mg cast alloys, how much yield strength did the T7-treated B4N and B2N alloys lose when tested at 240 °C?",
    answerable: true,
    facts: [["65"], ["140"]],
    citations: [AL],
  },
  {
    // table: one alloy and one condition of a table of three alloys in two conditions.
    id: "m02-al-b4n-intermetallics",
    kind: "lookup",
    question: "What volume fraction of undissolved intermetallic phases did alloy B4N have in the as-cast condition?",
    answerable: true,
    facts: [["15.3"]],
    citations: [AL],
  },
  {
    // phase: the new phase of the 4% Ni alloy, among Al3Ni, Al3CuNi and Al9FeNi.
    id: "m03-al-new-phase",
    kind: "lookup",
    question: "Which new phase was reported in the Al-Si-Cu-Mg alloy containing 4 wt% Ni?",
    answerable: true,
    facts: [["Al3Ni2Cu2"]],
    citations: [AL],
  },
  {
    // negative: some refining, too little to call nickel a grain refiner.
    id: "m04-al-ni-grain-refiner",
    kind: "lookup",
    question: "Did adding nickel act as a grain refiner in the Al-Si-Cu-Mg alloy, and how much grain refining was seen in the B2N alloy?",
    answerable: true,
    facts: [["15–20", "15-20", "15 to 20", "15 and 20"], ["not enough", "much less", "not a grain refiner", "not classif", "not be classified", "cannot be classified", "not sufficient", "limited", "only"]],
    citations: [AL],
  },
  // TC25 titanium alloy, tensile creep at 550 °C before and after heat treatment (Materials 2024).
  {
    // power: a steady-state creep rate, before and after heat treatment differing by the mantissa and the power.
    id: "m05-tc25-creep-rate",
    kind: "lookup",
    question: "What steady-state creep rate did the heat-treated TC25 titanium alloy (TC25-2) show at 550 °C under 550 MPa?",
    answerable: true,
    facts: [["7.2"], TEN_MINUS(8)],
    citations: [TC25],
  },
  {
    // phase: the creep mechanism, which changed with the heat treatment.
    id: "m06-tc25-creep-mechanism",
    kind: "lookup",
    question: "How did the creep mechanism of the TC25 alloy change after heat treatment?",
    answerable: true,
    facts: [["grain boundary sliding", "grain-boundary sliding"], ["dislocation climb"]],
    citations: [TC25],
  },
  {
    // property: two creep lives at one stress, of four at other stresses.
    id: "m07-tc25-creep-life-610",
    kind: "lookup",
    question: "What creep lives did TC25 have under 610 MPa at 550 °C before and after heat treatment?",
    answerable: true,
    facts: [["21 h", "21 hours", "21h"], ["58 h", "58 hours", "58h"]],
    citations: [TC25],
  },
  {
    // table: one element of a composition table.
    id: "m08-tc25-aluminium",
    kind: "lookup",
    question: "How much aluminium does the TC25 alloy used in the creep study contain, in wt.%?",
    answerable: true,
    facts: [["6.48"]],
    citations: [TC25],
  },
  // A 0.4C-5Mn medium-manganese steel heated at 0.3 to 200 °C/s (Materials 2024): powers of ten, retained austenite, hardness.
  {
    // power: Europe PMC writes 10<sup>12</sup>, read as "1012" before harness 0.107.0.
    id: "m09-steel-dislocation-density",
    kind: "lookup",
    question: "In the medium-manganese steel study, what was the lowest dislocation density calculated from XRD, and at which heating rate?",
    answerable: true,
    facts: [["1.2855"], TEN(12), ["1 °C/s", "1°C/s", "1 °c/s", "1 degree"]],
    citations: [STEEL],
  },
  {
    // direction: hardness rose with the heating rate, from one value to another.
    id: "m10-steel-hardness",
    kind: "lookup",
    question: "How did the hardness of the 0.4C-5Mn steel change as the heating rate increased?",
    answerable: true,
    facts: [["628.1"], ["663.3"]],
    citations: [STEEL],
  },
  {
    // table: one heating rate's retained austenite of a range.
    id: "m11-steel-ra-10",
    kind: "lookup",
    question: "What retained austenite content did the medium-manganese steel have after heating at 10 °C/s?",
    answerable: true,
    facts: [["20.28"]],
    citations: [STEEL],
  },
  {
    // property: Mn in two phases at one heating rate, two others' values at 200 °C/s nearby.
    id: "m12-steel-mn-partitioning",
    kind: "lookup",
    question: "At a heating rate of 50 °C/s, what Mn contents did EDS give for the retained austenite and for the lath martensite of the steel?",
    answerable: true,
    facts: [["7.14"], ["3.81"]],
    citations: [STEEL],
  },
  // Nano-LiFePO4/C by solution combustion with urea and sorbitol (Materials 2023): capacities at four C-rates.
  {
    // table: the 1 C column of a rate table, the 0.5 C value beside it.
    id: "m13-lfp-capacity-1c",
    kind: "lookup",
    question: "What discharge capacity did the LiFePO4/C sample U1.6S0.8 deliver at 1 C?",
    answerable: true,
    facts: [["142.9"]],
    citations: [LFP],
  },
  {
    // property: initial Coulombic efficiency, with the capacity retention (95.8%) in the same row.
    id: "m14-lfp-coulombic-efficiency",
    kind: "lookup",
    question: "What was the initial Coulombic efficiency of LiFePO4/C sample U1.6S0.8?",
    answerable: true,
    facts: [["98.8"]],
    citations: [LFP],
  },
  {
    // direction: more sorbitol, a higher combustion temperature.
    id: "m15-lfp-sorbitol-tm",
    kind: "lookup",
    question: "In the solution combustion synthesis of LiFePO4/C, how did the maximum combustion temperature change as more sorbitol was used, and what was it for sample U1.6S2.4?",
    answerable: true,
    facts: [["increase", "higher", "rose", "rise", "rising", "grew"], ["551"]],
    citations: [LFP],
  },
  {
    // alias: "lithium iron phosphate", which the paper writes once, for its LiFePO4.
    id: "m16-lfp-space-group",
    kind: "lookup",
    question: "What space group and lattice parameter a did Rietveld refinement give for the lithium iron phosphate made with urea and sorbitol fuels?",
    answerable: true,
    facts: [["Pnma"], ["10.331"]],
    citations: [LFP],
  },
  {
    // negative: urea alone, fuel-lean, did not burn.
    id: "m17-lfp-urea-only",
    kind: "lookup",
    question: "Did a combustion reaction occur in the LiFePO4 precursor made with urea as the only fuel (U1.6S0)?",
    answerable: true,
    facts: [["had not occurred", "did not occur", "didn't occur", "no combustion", "not occur", "no temperature peak", "no,", "no.", "did not", "didn't"]],
    citations: [LFP],
  },
  // Propylamine hydroiodide passivation of perovskite solar cells (Nanomaterials 2024): J-V parameters side by side.
  {
    // property: Jsc, with Voc, FF and PCE in the same row.
    id: "m18-psc-jsc",
    kind: "lookup",
    question: "What short-circuit current density did the perovskite solar cell treated with 1 mg/mL PAI reach?",
    answerable: true,
    facts: [["24.11"]],
    citations: [PSC],
  },
  {
    // table: the fill factor of the over-dosed device.
    id: "m19-psc-ff-15",
    kind: "lookup",
    question: "What fill factor did the perovskite device treated with 1.5 mg/mL PAI have?",
    answerable: true,
    facts: [["74.37"]],
    citations: [PSC],
  },
  {
    // direction: the inverted device was the better one.
    id: "m20-psc-nip-pin",
    kind: "lookup",
    question: "With PAI, which perovskite device structure reached the higher efficiency, n-i-p or p-i-n, and what efficiencies did the two reach?",
    answerable: true,
    facts: [["p-i-n", "inverted", "pin"], ["23"], ["21"]],
    citations: [PSC],
  },
  {
    // unit: the table gives ns, the text μs.
    id: "m21-psc-trpl",
    kind: "lookup",
    question: "How did the average photoluminescence decay lifetime of the perovskite film change after treatment with 1 mg/mL PAI?",
    answerable: true,
    facts: [["3.95", "3945"], ["8.10", "8.1 ", "8090"]],
    citations: [PSC],
  },
  {
    // negative: the band gap did not change.
    id: "m22-psc-bandgap",
    kind: "lookup",
    question: "Did PAI treatment change the optical band gap of the perovskite film?",
    answerable: true,
    facts: [["1.56"], ["unchanged", "did not change", "didn't change", "no significant", "remained", "not change", "no change", "same", "not significantly"]],
    citations: [PSC],
  },
  // Al-doped LLZO by induction hot pressing and SPS (Small 2025): density and conductivity tables, one with an empty cell.
  {
    // table: one method and one temperature, the other method's 98.2 beside it.
    id: "m23-llzo-hp-density-1050",
    kind: "lookup",
    question: "What relative density did induction hot pressing give the Al-doped LLZO at 1050 °C?",
    answerable: true,
    facts: [["94.6"]],
    citations: [LLZO],
  },
  {
    // table, unit: the SPS row has three values under four temperatures; mS cm−1, not S cm−1.
    id: "m24-llzo-sps-conductivity-1000",
    kind: "lookup",
    question: "What room-temperature ionic conductivity did the SPS-sintered Al-LLZO reach at 1000 °C?",
    answerable: true,
    facts: [["0.24"]],
    casedFacts: [["mS", "millisiemens"]],
    citations: [LLZO],
  },
  {
    // property: two optimal temperatures, 50 °C apart.
    id: "m25-llzo-optimal-temperatures",
    kind: "lookup",
    question: "What were the optimal sintering temperatures for hot pressing and for spark plasma sintering of Al-doped LLZO?",
    answerable: true,
    facts: [["1100"], ["1050"]],
    citations: [LLZO],
  },
  {
    // phase: cubic, not tetragonal.
    id: "m26-llzo-phase",
    kind: "lookup",
    question: "Which crystal structure did the Al-doped LLZO keep after sintering at 900 to 1150 °C?",
    answerable: true,
    facts: [["cubic"]],
    citations: [LLZO],
  },
  {
    // negative: the pulsed current does not change the mechanism, LLZO being an insulator.
    id: "m27-llzo-pulsed-current",
    kind: "lookup",
    question: "Did the pulsed current of spark plasma sintering change the sintering mechanism of LLZO?",
    answerable: true,
    facts: [["not fundamentally", "does not", "did not", "doesn't", "didn't", "insignificant", "unlikely", "no,", "no.", "not alter", "not change"]],
    citations: [LLZO],
  },
  {
    // alias: "lithium lanthanum zirconate" for LLZO and Li7La3Zr2O12.
    id: "m28-llzo-sps-grain-size",
    kind: "lookup",
    question: "In the comparison of hot pressing and spark plasma sintering of lithium lanthanum zirconate, what average grain size did SPS give at 1100 °C?",
    answerable: true,
    facts: [["4.6"]],
    casedFacts: [["µm", "μm", "micro"]],
    citations: [LLZO],
  },
  // Boron carbide with SiC and TiB2 by hot pressing (Materials 2024): a property table in GPa, MPa and MPa·m1/2.
  {
    // property: toughness, with strength 544 and hardness 35.0 in the same row.
    id: "m29-b4c-tib2-toughness",
    kind: "lookup",
    question: "What fracture toughness did boron carbide with 10 wt% TiB2 reach?",
    answerable: true,
    facts: [["3.92"]],
    citations: [B4C],
  },
  {
    // property: elastic modulus in GPa, with hardness in GPa beside it.
    id: "m30-b4c-modulus",
    kind: "lookup",
    question: "What elastic modulus did the pure hot-pressed B4C have?",
    answerable: true,
    facts: [["462"]],
    citations: [B4C],
  },
  {
    // direction: SiC lowered the hardness.
    id: "m31-b4c-sic-hardness",
    kind: "lookup",
    question: "How did adding SiC change the Vickers hardness of B4C, and what was it with 10 wt% SiC?",
    answerable: true,
    facts: [["decrease", "lower", "drop", "reduc", "fell", "declin"], ["29.9"]],
    citations: [B4C],
  },
  {
    // phase: the two fracture modes, each the other's error.
    id: "m32-b4c-fracture-modes",
    kind: "lookup",
    question: "Which fracture modes did TiB2 and SiC additions produce in the boron carbide composites?",
    answerable: true,
    facts: [["intergranular"], ["transgranular"]],
    citations: [B4C],
  },
  {
    // property: the abstract gives 551 MPa for SiC; 605 MPa is the 10 wt% composite's.
    id: "m33-b4c-sic-strength",
    kind: "lookup",
    question: "What flexural strength did boron carbide with 10 wt% SiC reach?",
    answerable: true,
    facts: [["605"]],
    citations: [B4C],
  },
  // Poly(lactic acid) and PLA/starch in warm and humid ageing (Materials 2024): tables with cells where nothing could be tested.
  {
    // table: one temperature and humidity of a composite table.
    id: "m34-pla-starch-modulus",
    kind: "lookup",
    question: "What Young's modulus did the PLA with 50 wt.% starch have after 168 h at 70 °C and 90% relative humidity?",
    answerable: true,
    facts: [["2913"]],
    citations: [PLA],
  },
  {
    // phase (mechanism): hydrolysis, thermo-oxidation only subordinate.
    id: "m35-pla-mechanism",
    kind: "lookup",
    question: "What was the main degradation mechanism of PLA in warm and humid environments?",
    answerable: true,
    facts: [["hydroly"]],
    citations: [PLA],
  },
  {
    // negative: the 90 °C specimens could not be tested.
    id: "m36-pla-90c",
    kind: "lookup",
    question: "Could the pure PLA specimens aged at 90 °C be tested mechanically?",
    answerable: true,
    facts: [["could not", "no mechanical testing", "not be tested", "couldn't", "not possible", "no,", "no.", "not be performed", "not tested", "too damaged", "severe damage", "excessive damage"]],
    citations: [PLA],
  },
  {
    // unit: two FTIR bands in cm−1, crystalline and amorphous.
    id: "m37-pla-ftir-crystallinity",
    kind: "lookup",
    question: "Which FTIR bands did the PLA study use for the crystalline and the amorphous parts of PLA?",
    answerable: true,
    facts: [["921"], ["955"]],
    citations: [PLA],
  },
  // The made-up CIF, CSV and PDF.
  {
    // phase: a space group a CIF writes "I a -3 d", asked as papers write it.
    id: "m38-cif-space-group",
    kind: "lookup",
    question: "What space group and lattice parameter does the CIF of Al-doped cubic LLZO give?",
    answerable: true,
    facts: [["Ia-3d", "I a -3 d", "Ia3d", "Ia3̄d", "230"], ["12.9682", "12.968"]],
    citations: [CIF],
  },
  {
    // table: an occupancy, of a site shared by Li and Al.
    id: "m39-cif-al-occupancy",
    kind: "lookup",
    question: "What is the occupancy of the Al site in the Al-doped LLZO crystal structure file?",
    answerable: true,
    facts: [["0.083"]],
    citations: [CIF],
  },
  {
    // property: UTS, with the yield strength 905 in the same row.
    id: "m40-ti64-t05-uts",
    kind: "lookup",
    question: "What ultimate tensile strength did specimen T05 reach in the SLM Ti-6Al-4V tensile log?",
    answerable: true,
    facts: [["995"]],
    citations: [TI64],
  },
  {
    // alias: "laser powder bed fusion" for the log's "selective laser melting (SLM)".
    id: "m41-ti64-highest-elongation",
    kind: "lookup",
    question: "In the tensile test log of Ti-6Al-4V made by laser powder bed fusion, which condition gave the highest elongation?",
    answerable: true,
    facts: [["HIP", "hot isostatic"]],
    citations: [TI64],
  },
  {
    // negative: an elongation the log marks not valid.
    id: "m42-ti64-t08-elongation",
    kind: "lookup",
    question: "What elongation was recorded for tensile specimen T08 of the Ti-6Al-4V log?",
    answerable: true,
    facts: [["not valid", "no valid", "invalid", "not recorded", "outside the gauge", "no elongation", "not given", "blank", "missing"]],
    citations: [TI64],
  },
  {
    // table: the last row, whose empty cell is its last.
    id: "m43-zta-30-toughness",
    kind: "lookup",
    question: "What fracture toughness did the ZTA-30 zirconia-toughened alumina discs have?",
    answerable: true,
    facts: [["6.4"]],
    citations: [ZTA],
  },
  {
    // A blank table cell: the PDF reader drops it, so the row reads "ZTA-20 20 98.6 5.9 610" and the toughness
    // 5.9 MPa·m½ stands under the hardness (docs/materials-science-audit.md, MS5). The report does not give it.
    id: "m44-zta-20-hardness",
    kind: "unanswerable",
    question: "What Vickers hardness did the ZTA-20 zirconia-toughened alumina discs have?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // comparison: two hot-pressing pressures in two papers.
    id: "m45-hot-pressing-pressures",
    kind: "comparison",
    question: "Which used the higher pressure: the hot-press sintering of boron carbide with SiC and TiB2, or the hot pressing and SPS of Al-doped LLZO? Give both pressures.",
    answerable: true,
    facts: [["40 MPa", "40mpa"], ["25 MPa", "25mpa"]],
    citations: [B4C, LLZO],
  },
  {
    // unanswerable: the conductivity table stops at 1100 °C; 1150 °C is in the density table.
    id: "m46-llzo-hp-conductivity-1150",
    kind: "unanswerable",
    question: "What room-temperature ionic conductivity did the hot-pressed Al-LLZO sintered at 1150 °C reach?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // unanswerable: every creep test was at 550 °C.
    id: "m47-tc25-600c",
    kind: "unanswerable",
    question: "What creep life did the TC25 titanium alloy have at 600 °C under 500 MPa?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const materialsHoldoutTasks: ResearchTask[] = [
  {
    id: "mh01-al-bs-strontium",
    kind: "lookup",
    question: "How much strontium does the BS alloy of the nickel study contain, in wt%?",
    answerable: true,
    facts: [["0.017"]],
    citations: [AL],
  },
  {
    id: "mh02-tc25-primary-alpha",
    kind: "lookup",
    question: "What fraction of primary α phase did TC25 have before and after heat treatment?",
    answerable: true,
    facts: [["51.8"], ["55.7"]],
    citations: [TC25],
  },
  {
    id: "mh03-tc25-stress-exponent",
    kind: "lookup",
    question: "What apparent stress exponents n did the creep tests give for TC25-1 and TC25-2?",
    answerable: true,
    facts: [["20.13"], ["7.25"]],
    citations: [TC25],
  },
  {
    id: "mh04-steel-austenite-temperatures",
    kind: "lookup",
    question: "What start and end temperatures of the austenite transformation did Thermo-Calc give for the 0.4C-5Mn steel?",
    answerable: true,
    facts: [["584"], ["703"]],
    citations: [STEEL],
  },
  {
    id: "mh05-lfp-surface-area",
    kind: "lookup",
    question: "What specific surface area and pore volume did LiFePO4/C sample U1.6S0.8 have?",
    answerable: true,
    facts: [["42.01"], ["0.146"]],
    citations: [LFP],
  },
  {
    id: "mh06-psc-contact-angle",
    kind: "lookup",
    question: "How did the water contact angle of the perovskite film change after PAI treatment?",
    answerable: true,
    facts: [["72.5"], ["93.7"]],
    citations: [PSC],
  },
  {
    id: "mh07-llzo-theoretical-density",
    kind: "lookup",
    question: "What theoretical density of Al-doped LLZO was used to calculate relative density?",
    answerable: true,
    facts: [["5.107"]],
    citations: [LLZO],
  },
  {
    id: "mh08-b4c-hot-pressing",
    kind: "lookup",
    question: "At what temperature and pressure were the boron carbide composites hot-pressed?",
    answerable: true,
    facts: [["2000"], ["40 MPa", "40mpa"]],
    citations: [B4C],
  },
  {
    id: "mh09-pla-tga-onset",
    kind: "lookup",
    question: "At about what temperature does the thermal degradation of pure PLA start in TGA?",
    answerable: true,
    facts: [["320"]],
    citations: [PLA],
  },
  {
    id: "mh10-ti64-t02-yield",
    kind: "lookup",
    question: "What yield strength did specimen T02 of the Ti-6Al-4V tensile log have?",
    answerable: true,
    facts: [["1140"]],
    citations: [TI64],
  },
  {
    id: "mh11-zta-20-strength",
    kind: "lookup",
    question: "What flexural strength did the ZTA-20 discs have?",
    answerable: true,
    facts: [["610"]],
    citations: [ZTA],
  },
  {
    id: "mh12-cif-cell-volume",
    kind: "lookup",
    question: "What cell volume does the Al-doped LLZO CIF give?",
    answerable: true,
    facts: [["2180.97", "2181"]],
    citations: [CIF],
  },
  {
    id: "mh13-lfp-500-cycles",
    kind: "unanswerable",
    question: "What capacity retention did LiFePO4/C sample U1.6S0.8 have after 500 cycles at 1 C?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
