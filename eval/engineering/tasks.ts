// Questions over engineering documents (harness 0.68.0): the kind an engineering researcher brings, which
// no other suite holds. An audit from an engineering researcher's point of view found that the field
// suite's documents (Wikipedia leads, a licence, the app's own documentation) and the clinical trial
// reports have no datasheet, no two-column paper, no SI prefixes, no negative temperatures and no
// abbreviations defined once and used after (eval/field/README.md, harness 0.67.0).
//
// The seven documents are made up, as the research suite's LumenDB documents and the office suite's
// files are: openly licensed datasheets and test reports could not be downloaded where the suite was
// written. They describe one product, a 3.3 kW power supply, from several sides, so they overlap on
// purpose: the paper's MOSFET is the datasheet's part, the test report checks the specification, and many
// numbers differ only by row, by condition or by sign. The two PDFs are set as real ones are, in two
// columns or with tables, with running headers and footers and symbols from a second font, by
// source/make_pdfs.py (README.md).
//
// The questions ask what an engineer reading these asks, in kinds noted on each task:
// - unit: a value whose unit or SI prefix matters (mΩ, µH, kHz, pF, kV, MPa);
// - sign: a negative value (a gate voltage, a temperature, a compressive stress);
// - table: a value given only in a table, in a row and column of its own, next to others easy to take;
// - limit: a maximum, a minimum or a requirement against a measurement;
// - change: a value before and after a change, which must not be turned round;
// - abbreviation: a question in words for what the document says only as an abbreviation (ZVS, EFT), or the reverse;
// - and questions the documents do not answer.
//
// Two suites, as for the clinical and office documents: `engineering` may be looked at task by task while a
// change is developed; `engineeringholdout` is read only as totals. The questions and their facts were
// written from the documents before any model ran on them, and are not changed to fit a run. Scoring is
// the research suite's: every fact group in the answer, every cited document, a verified quote.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/engineering/docs/. */
export const engineeringDocuments: FieldDocument[] = [
  { id: "sic-pfc-paper", title: "A 98.6%-Efficient 3.3-kW SiC Totem-Pole PFC Rectifier With Adaptive Dead-Time Control (IEEE Trans. Power Electron., 2026, made up)", file: "sic-pfc-paper.pdf" },
  { id: "kv1200m040-datasheet", title: "KV1200M040 1200 V SiC MOSFET datasheet, Rev. 2.1 (made up)", file: "kv1200m040-datasheet.pdf" },
  { id: "emc-test-report", title: "EMC test report EMC-3K3-02: PSU-3K3 power supply", file: "emc-test-report.md" },
  { id: "tensile-tests-6061", title: "tensile-tests-6061.csv", file: "tensile-tests-6061.csv" },
  { id: "bracket-fea-memo", title: "Technical memo TM-0412: motor mounting bracket, structural assessment", file: "bracket-fea-memo.md" },
  { id: "cooling-loop-spec", title: "Specification CS-210: liquid cooling loop for the PSU-3K3", file: "cooling-loop-spec.txt" },
  { id: "cooling-loop-test-report", title: "Test report TR-210-03: liquid cooling loop qualification", file: "cooling-loop-test-report.md" },
];

const PAPER = ["sic-pfc-paper"];
const SHEET = ["kv1200m040-datasheet"];
const EMC = ["emc-test-report"];
const TENSILE = ["tensile-tests-6061"];
const FEA = ["bracket-fea-memo"];
const SPEC = ["cooling-loop-spec"];
const TEST = ["cooling-loop-test-report"];

/** A negative number as sources and answers write it: "−8", "-8", "–8", with or without a space, or "minus 8". */
const negative = (n: string) => ["−", "-", "–"].flatMap((sign) => [`${sign}${n}`, `${sign} ${n}`]).concat(`minus ${n}`);
/** Milliohms as answers write them. */
const MILLIOHM = ["mω", "m ω", "mohm", "milliohm", "m-ohm"];
/** Microhenries and microjoules as answers write them (µ is matched in both its forms, and as "u"). */
const micro = (unit: string, word: string) => [`µ${unit}`, `μ${unit}`, `u${unit}`, `µ ${unit}`, `μ ${unit}`, `micro${word}`];

export const engineeringTasks: ResearchTask[] = [
  // The datasheet (PDF, tables).
  {
    // unit, table: the typical value at 25 °C, not the 52 mΩ maximum next to it or the 68 mΩ at 175 °C.
    id: "e01-rdson-typical",
    kind: "lookup",
    question: "What is the typical drain-source on-state resistance of the KV1200M040 at a junction temperature of 25 °C?",
    answerable: true,
    facts: [["40"], MILLIOHM],
    citations: [SHEET],
  },
  {
    // table: the row at 175 °C. The paper gives the value too, so either may be cited.
    id: "e02-rdson-hot",
    kind: "lookup",
    question: "What is the typical on-state resistance of the KV1200M040 at a junction temperature of 175 °C?",
    answerable: true,
    facts: [["68"]],
    citations: [[...SHEET, ...PAPER]],
  },
  {
    // sign: the minimum gate-source voltage is −8 V; the maximum is +22 V and the recommended turn-off −4 V.
    id: "e03-vgs-min",
    kind: "lookup",
    question: "What is the minimum gate-source voltage rating of the KV1200M040 in its absolute maximum ratings?",
    answerable: true,
    facts: [negative("8")],
    citations: [SHEET],
  },
  {
    // sign, limit: the operating junction range, not the storage range (−55 to 150 °C).
    id: "e04-junction-range",
    kind: "lookup",
    question: "Over what junction temperature range may the KV1200M040 be operated?",
    answerable: true,
    facts: [negative("55"), ["175"]],
    citations: [SHEET],
  },
  {
    // table: the current at a case temperature of 100 °C, not the 58 A at 25 °C.
    id: "e05-drain-current-100c",
    kind: "lookup",
    question: "What continuous drain current is the KV1200M040 rated for at a case temperature of 100 °C?",
    answerable: true,
    facts: [["41"]],
    citations: [SHEET],
  },
  {
    // unit, table: the output capacitance, between the input (1950 pF) and reverse transfer (9 pF) ones.
    id: "e06-coss",
    kind: "lookup",
    question: "What is the typical output capacitance of the KV1200M040 at 800 V?",
    answerable: true,
    facts: [["105"], ["pf", "picofarad"]],
    citations: [SHEET],
  },
  // The paper (two-column PDF).
  {
    // unit: kHz, set as f<sub>sw</sub> in the PDF.
    id: "e07-switching-frequency",
    kind: "lookup",
    question: "What switching frequency does the SiC totem-pole PFC rectifier paper use?",
    answerable: true,
    facts: [["65"], ["khz", "kilohertz"]],
    citations: [PAPER],
  },
  {
    // unit: microhenries.
    id: "e08-boost-inductance",
    kind: "lookup",
    question: "What is the inductance of the boost inductor in the SiC totem-pole PFC rectifier paper?",
    answerable: true,
    facts: [["450"], micro("h", "henr")],
    citations: [PAPER],
  },
  {
    // table: the 20% row of Table I, two columns.
    id: "e09-light-load-table",
    kind: "lookup",
    question: "In the totem-pole PFC paper's measured performance table, what were the efficiency and the THD at 20% load?",
    answerable: true,
    facts: [["97.1"], ["6.8"]],
    citations: [PAPER],
  },
  {
    // abbreviation: the question says "zero-voltage switching"; the sentence that answers says only "ZVS".
    id: "e10-zvs-load",
    kind: "lookup",
    question: "Above what load did the rectifier with adaptive dead time achieve zero-voltage switching?",
    answerable: true,
    facts: [["35%", "35 %", "35 percent"]],
    citations: [PAPER],
  },
  {
    // change: from 96.4% to 97.1%, which must not be turned round.
    id: "e11-dead-time-efficiency",
    kind: "lookup",
    question: "How did the efficiency at 20% load change when the adaptive dead time replaced the fixed dead time in the PFC paper?",
    answerable: true,
    facts: [["96.4"], ["97.1"]],
    citations: [PAPER],
  },
  {
    // sign: the ambient range starts at −25 °C (set as "− 25" by pdf.js).
    id: "e12-ambient-range",
    kind: "lookup",
    question: "Over what ambient temperature range was the PFC rectifier prototype tested?",
    answerable: true,
    facts: [negative("25"), ["55"]],
    citations: [PAPER],
  },
  // The EMC test report.
  {
    // abbreviation, unit: the table gives "ESD, contact discharge" with "±8 kV"; the question spells it out.
    id: "e13-esd-contact",
    kind: "lookup",
    question: "At what voltage was the electrostatic discharge contact test of the PSU-3K3 performed, and did it pass?",
    answerable: true,
    facts: [["8 kv", "8kv", "8 kilovolt"], ["pass"]],
    citations: [EMC],
  },
  {
    // limit: the first line-to-earth surge test failed; a varistor change fixed it.
    id: "e14-surge-fix",
    kind: "multi-hop",
    question: "Which surge test did the PSU-3K3 fail at first, and what change made it pass?",
    answerable: true,
    facts: [["line to earth", "line-to-earth"], ["varistor"]],
    citations: [EMC],
  },
  // The tensile test data (CSV).
  {
    // sign, table: the row at −40 °C.
    id: "e15-yield-cold",
    kind: "lookup",
    question: "What yield strength did the 6061 tensile tests measure at −40 °C?",
    answerable: true,
    facts: [["290"]],
    citations: [TENSILE],
  },
  {
    // table: the UTS column at 150 °C, not the yield strength (214 MPa).
    id: "e16-uts-150",
    kind: "lookup",
    question: "What ultimate tensile strength did the 6061 tensile tests measure at 150 °C?",
    answerable: true,
    facts: [["234"]],
    citations: [TENSILE],
  },
  // The FEA memo.
  {
    // unit, abbreviation: revision A's stress and safety factor; the memo defines FEA once.
    id: "e17-bracket-stress",
    kind: "lookup",
    question: "What peak von Mises stress did the finite element analysis of the bracket's first revision predict under the transport shock case, and what safety factor did that give?",
    answerable: true,
    facts: [["212"], ["1.30", "1.3"]],
    citations: [FEA],
  },
  {
    // limit: the natural frequency against its minimum, which the memo and the specification both give.
    id: "e18-natural-frequency",
    kind: "lookup",
    question: "What was the first natural frequency of the motor mounting bracket in revision A, and what minimum does the specification require?",
    answerable: true,
    facts: [["142"], ["120"]],
    citations: [[...FEA, ...SPEC]],
  },
  {
    // change: the fillet from 2 mm to 5 mm, the stress from 212 to 168 MPa.
    id: "e19-fillet-change",
    kind: "lookup",
    question: "In revision B of the bracket, what fillet radius was used, and what peak stress did the analysis then predict?",
    answerable: true,
    facts: [["5 mm", "5mm", "5 millimet"], ["168"]],
    citations: [FEA],
  },
  // The specification and its test report.
  {
    // limit: the inlet maximum, not the 60 °C outlet maximum.
    id: "e20-inlet-max",
    kind: "lookup",
    question: "What is the maximum coolant temperature at the cold plate inlet allowed by specification CS-210?",
    answerable: true,
    facts: [["45"]],
    citations: [SPEC],
  },
  {
    // sign, limit: the storage range, not the operating range (−20 °C to 50 °C).
    id: "e21-storage-range",
    kind: "lookup",
    question: "What storage temperature range must the cooling loop withstand according to CS-210?",
    answerable: true,
    facts: [negative("40"), ["85"]],
    citations: [SPEC],
  },
  {
    // limit: the measured outlet temperature against the specification's maximum, which the test report repeats.
    id: "e22-outlet-margin",
    kind: "comparison",
    question: "What cold plate outlet temperature was measured in the cooling loop qualification test, and what maximum does the specification allow?",
    answerable: true,
    facts: [["52.7"], ["60"]],
    citations: [[...TEST, ...SPEC]],
  },
  {
    // two documents: the same thermal resistance in the datasheet and the paper.
    id: "e23-thermal-resistance",
    kind: "comparison",
    question: "What junction-to-case thermal resistance does the KV1200M040 datasheet give as typical, and what value does the PFC paper use?",
    answerable: true,
    facts: [["0.38"]],
    citations: [SHEET, PAPER],
  },
  {
    // unanswerable: the datasheet gives no avalanche rating.
    id: "e24-avalanche",
    kind: "unanswerable",
    question: "What single-pulse avalanche energy is the KV1200M040 rated for?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // unanswerable: no burst pressure is given, only a 3 bar leak test.
    id: "e25-burst-pressure",
    kind: "unanswerable",
    question: "What burst pressure must the cooling loop withstand according to CS-210?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

/** Read only as totals (eval/engineering/README.md). */
export const engineeringHoldoutTasks: ResearchTask[] = [
  {
    id: "eh01-eon",
    kind: "lookup",
    question: "What is the typical turn-on switching energy of the KV1200M040?",
    answerable: true,
    facts: [["410"], micro("j", "joule")],
    citations: [SHEET],
  },
  {
    id: "eh02-threshold",
    kind: "lookup",
    question: "What is the typical gate threshold voltage of the KV1200M040?",
    answerable: true,
    facts: [["2.6"]],
    citations: [SHEET],
  },
  {
    id: "eh03-thd-full-load",
    kind: "lookup",
    question: "What THD did the totem-pole PFC prototype reach at full load?",
    answerable: true,
    facts: [["2.4"]],
    citations: [PAPER],
  },
  {
    id: "eh04-titanium-margin",
    kind: "lookup",
    question: "By how much does the PFC rectifier exceed the 80 PLUS Titanium efficiency requirement at 50% load?",
    answerable: true,
    facts: [["2.6"]],
    citations: [PAPER],
  },
  {
    id: "eh05-fast-transient",
    kind: "lookup",
    question: "At what level was the PSU-3K3 tested for electrical fast transients, and with what result?",
    answerable: true,
    facts: [["2 kv", "2kv", "2 kilovolt"], ["pass"]],
    citations: [EMC],
  },
  {
    id: "eh06-elongation-200",
    kind: "lookup",
    question: "What elongation did the 6061 tensile test at 200 °C give?",
    answerable: true,
    facts: [["28"]],
    citations: [TENSILE],
  },
  {
    id: "eh07-deflection",
    kind: "lookup",
    question: "What maximum deflection of the pump flange did the bracket analysis predict for revision A, and what is allowed?",
    answerable: true,
    facts: [["0.84"], ["1.0 mm", "1 mm", "1.0mm", "1mm"]],
    citations: [FEA],
  },
  {
    id: "eh08-flow-rate",
    kind: "lookup",
    question: "What minimum coolant flow rate does specification CS-210 require?",
    answerable: true,
    facts: [["4.0", "4 l"]],
    citations: [SPEC],
  },
  {
    id: "eh09-effectiveness",
    kind: "lookup",
    question: "How did the heat exchanger effectiveness change with the turbulator insert in the cooling loop test?",
    answerable: true,
    facts: [["0.74"], ["0.82"]],
    citations: [TEST],
  },
  {
    id: "eh10-pump-power",
    kind: "unanswerable",
    question: "How much electrical power did the cooling pump draw during the qualification test?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
