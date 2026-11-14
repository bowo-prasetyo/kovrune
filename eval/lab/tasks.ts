// Questions over laboratory biology papers (harness 0.72.0): the kind of document a biological and
// biomedical sciences researcher brings, which no other suite holds. The field suite's documents are
// Wikipedia leads, a licence and the app's own documentation; the clinical suite's are trial reports;
// the CS suite's are machine learning papers; the engineering suite's are made-up datasheets. None has
// a molar concentration, a knockout genotype, a gene or protein name that one Greek letter tells from
// another, a direction of regulation, or a control that did not respond, which are where reading a
// bench paper goes wrong.
//
// The documents are ten open-access journal papers, CC BY 4.0, from Europe PMC's full-text XML, kept as
// published and built by source/build.py (README.md lists them with their licences). They are their own
// library, and overlap on purpose: three use knockout or null mice, three measure a cytokine or an
// immune response, two are about p53 or a tumour, and many values differ only by genotype, sex, cell
// line, organelle or time point.
//
// The questions ask what a researcher reading a method or a result asks, in kinds tagged on each task:
// - concentration: a dose or concentration whose unit and prefix matter (μM against mM, μg against mg,
//   μg mL−1), which the 0.71.0 laboratory units check guards;
// - direction: which way a gene, a protein or a treatment went (upregulated, inhibited, more tolerant),
//   where the answer that reverses it shares every other word with the source;
// - name: a result that belongs to one of two names told apart by a Greek letter (Pparα against Pparγ),
//   a genotype (5a−/− against the double mutant), a point mutant (Y220C against R273H) or a species;
// - result: a value given in a figure legend, a table or one sentence of the results, next to other
//   genotypes', sexes' and cell lines' values;
// - negative: a control or a comparison that showed no effect or no difference. Such a task has a fact
//   group of the ways to say so, so an answer that turns "did not affect" into "reduced" fails;
// - alias: a question in a researcher's own spelling of a name, where the paper uses another ("IL-10" for
//   the paper's "IL10", "PPAR-alpha" for "PPARα", "RNAi" for "RNA-interference"), which keyword search
//   cannot bridge, as the CS suite's acronym questions cannot be bridged;
// - design: what was studied, in what, how many;
// - comparison: two papers' findings together;
// - and questions the papers do not answer, with a nearby value in another paper of the library.
//
// Two suites, as for the clinical, CS and engineering papers: `lab` may be looked at task by task while
// a change is developed; `labholdout` is read only as totals. The questions and their facts were
// written from the papers before any model was run on them, and are not changed to fit a run. Scoring
// is the research suite's: every fact group in the answer, every cited document, a verified quote.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/lab/docs/, each the article of the PMCID in its title. */
export const labDocuments: FieldDocument[] = [
  { id: "il10-tolerance-birds", title: "Interleukin 10 controls the balance between tolerance, pathogen elimination, and immunopathology in birds (eLife 2025, PMC12530801)", file: "il10-tolerance-birds.md" },
  { id: "ppara-brown-adipocytes", title: "Deletion of PPARα in mouse brown adipocytes increases their De Novo Lipogenesis (Molecular Metabolism 2025, PMC12221382)", file: "ppara-brown-adipocytes.md" },
  { id: "meca-daptomycin-tolerance", title: "Expression of mecA increases daptomycin tolerance in Staphylococcus aureus (mBio 2025, PMC12607837)", file: "meca-daptomycin-tolerance.md" },
  { id: "scml2-sperm-chromatin", title: "Polycomb protein SCML2 mediates paternal epigenetic inheritance through sperm chromatin (Nucleic Acids Research 2023, PMC10359620)", file: "scml2-sperm-chromatin.md" },
  { id: "alk-postn-neuroblastoma", title: "ALK upregulates POSTN and WNT signaling to drive neuroblastoma (Cell Reports 2024, PMC11101011)", file: "alk-postn-neuroblastoma.md" },
  { id: "fmrp-map1b-migration", title: "FMRP regulates postnatal neuronal migration via MAP1B (eLife 2024, PMC11101172)", file: "fmrp-map1b-migration.md" },
  { id: "zebrafish-seizure-zinc", title: "Modulation of NMDA receptor signaling and zinc chelation prevent seizure-like events in a zebrafish model of SLC13A5 deficiency (PLOS Biology 2025, PMC12047791)", file: "zebrafish-seizure-zinc.md" },
  { id: "adp-ribose-methanol-dehydrogenase", title: "ADP-ribose is a competitive inhibitor of methanol dehydrogenases from Bacillus methanolicus (Journal of Biological Chemistry 2025, PMC12926040)", file: "adp-ribose-methanol-dehydrogenase.md" },
  { id: "cabozantinib-p53-y220c", title: "Cabozantinib selectively induces proteasomal degradation of p53 somatic mutant Y220C and impedes tumor growth (Journal of Biological Chemistry 2025, PMC11847077)", file: "cabozantinib-p53-y220c.md" },
  { id: "aba-stomata-hydrogen-peroxide", title: "Abscisic acid increases hydrogen peroxide in mitochondria to facilitate stomatal closure (Plant Physiology 2023, PMC10152677)", file: "aba-stomata-hydrogen-peroxide.md" },
];

const IL10 = ["il10-tolerance-birds"];
const PPARA = ["ppara-brown-adipocytes"];
const MECA = ["meca-daptomycin-tolerance"];
const SCML2 = ["scml2-sperm-chromatin"];
const ALK = ["alk-postn-neuroblastoma"];
const FMRP = ["fmrp-map1b-migration"];
const ZEBRAFISH = ["zebrafish-seizure-zinc"];
const MDH = ["adp-ribose-methanol-dehydrogenase"];
const P53 = ["cabozantinib-p53-y220c"];
const ABA = ["aba-stomata-hydrogen-peroxide"];

/**
 * The ways an answer says a treatment, a genotype or a control showed no effect or no difference. A
 * negative task needs one of them, so an answer that gives the effect anyway fails; the scorer matches
 * substrings of the lower-cased answer.
 */
const NO_EFFECT = [
  "did not",
  "didn't",
  "does not",
  "doesn't",
  "was not",
  "were not",
  "no effect",
  "no difference",
  "no differences",
  "no significant",
  "not significant",
  "not statistically",
  "no statistically",
  "unaffected",
  "unchanged",
  "similar",
  "no,",
  "no.",
  "not affect",
  "not observed",
  "not additive",
];

/**
 * A concentration in micromolar, as the papers write it and as a model may: "μ" is also typed "u", the unit
 * is also spelled out, and a value measured with an error is printed with it ("2.4 ± 0.7 μM"), which an
 * answer may give either way. `error` is the error the paper prints, where it prints one.
 */
const micromolar = (value: string, error?: string): string[] => {
  const forms = (v: string) => [`${v} μM`, `${v} µM`, `${v}μM`, `${v}µM`, `${v} uM`, `${v} micromolar`];
  return error ? [...forms(`${value} ± ${error}`), ...forms(value)] : forms(value);
};

/** A concentration in micrograms per millilitre, as the papers write it ("0.5 µg mL−1") and as a model may ("0.5 µg/mL"). */
const microgramsPerMl = (value: string): string[] => [
  `${value} μg mL`,
  `${value} µg mL`,
  `${value} μg/mL`,
  `${value} µg/mL`,
  `${value} μg/ml`,
  `${value} µg/ml`,
  `${value} ug/mL`,
  `${value} micrograms`,
];

export const labTasks: ResearchTask[] = [
  // IL10 knockout chickens: mucosal immunity, pathogen challenge, microbiome.
  {
    // direction: the abstract and Figure 2B; the knockout removes IL10's autocrine inhibition, so nitric oxide goes up, not down.
    id: "l01-il10-nitric-oxide",
    kind: "lookup",
    question: "In the IL10-deficient chicken study, how did the absence of IL10 affect nitric oxide production by macrophages?",
    answerable: true,
    facts: [["increase", "increased", "elevated", "higher", "greater", "prevention of autocrine inhibition", "prevented autocrine inhibition"]],
    citations: [IL10],
  },
  {
    // negative: unlike IL10-deficient mice and humans, the chickens did not get spontaneous colitis.
    id: "l02-il10-spontaneous-colitis",
    kind: "lookup",
    question: "Did IL10-deficient chickens develop spontaneous colitis, as IL10-deficient mice and humans do?",
    answerable: true,
    facts: [[...NO_EFFECT, "did not exhibit", "no colitis", "absence of colitis"]],
    citations: [IL10],
  },
  {
    // name, negative: the heterozygous knockout and the homozygous enhancer mutation had no major effect, unlike the homozygous knockout.
    id: "l03-il10-heterozygote-effect",
    kind: "lookup",
    question: "In the IL10 chicken study, what effect did the heterozygous IL10 knockout have on pathogen clearance and inflammation?",
    answerable: true,
    facts: [[...NO_EFFECT, "no major effect", "major effect"]],
    citations: [IL10],
  },
  // PPARα deleted in brown adipose tissue: high-fat diet, both sexes, a β3-adrenergic agonist.
  {
    // name: Pparα mRNA falls up to 97% in females and 83% in males, while Pparγ and Pparδ are not affected.
    id: "l04-ppara-knockdown-efficiency",
    kind: "lookup",
    question: "In the PPARαBATKO mice, by how much were Pparα mRNA levels in brown adipose tissue reduced in female and in male mice?",
    answerable: true,
    facts: [["97"], ["83"]],
    citations: [PPARA],
  },
  {
    // name, negative: Pparγ and Pparδ levels were not affected, though the question's words fit the Pparα result too.
    id: "l05-ppara-other-isoforms",
    kind: "lookup",
    question: "In the brown adipose tissue of PPARαBATKO mice, were Pparγ and Pparδ mRNA levels affected?",
    answerable: true,
    facts: [[...NO_EFFECT, "not affected"]],
    citations: [PPARA],
  },
  {
    // concentration: the mice got tamoxifen at 60 mg/kg and the β3-adrenergic agonist CL316,243 at 1 mg/kg.
    id: "l06-ppara-cl316243-dose",
    kind: "lookup",
    question: "At what dose was the β3-adrenergic agonist CL316,243 injected daily into the mice in the PPARα brown adipose tissue study?",
    answerable: true,
    facts: [["1 mg/kg", "1mg/kg", "1 mg·kg", "1 milligram per kilogram"]],
    citations: [PPARA],
  },
  {
    // negative: body weight and glucose tolerance were similar in both sexes and genotypes, although BAT morphology was altered.
    id: "l07-ppara-body-weight",
    kind: "lookup",
    question: "In the PPARα brown adipose tissue study, did PPARαBATKO mice differ from control mice in body weight during the 20 weeks of high-fat diet?",
    answerable: true,
    facts: [[...NO_EFFECT, "similar body weight"]],
    citations: [PPARA],
  },
  // mecA and daptomycin tolerance in Staphylococcus aureus.
  {
    // concentration: the MIC of 95.7% of strains was 0.5 µg mL−1; the exposure concentration was 10 µg mL−1.
    id: "l08-meca-daptomycin-mic",
    kind: "lookup",
    question: "In the S. aureus daptomycin study, what daptomycin MIC did the vast majority of the clinical bacteremia isolates have?",
    answerable: true,
    facts: [microgramsPerMl("0.5")],
    citations: [MECA],
  },
  {
    // direction: MRSA strains were MORE tolerant than MSSA; an answer that reverses it shares every other word.
    id: "l09-meca-mrsa-tolerance",
    kind: "lookup",
    question: "In the S. aureus bacteremia isolate panel, were MRSA strains more or less tolerant of daptomycin than MSSA strains?",
    answerable: true,
    facts: [["more tolerant", "more daptomycin tolerant", "greater tolerance", "higher tolerance", "increased tolerance"]],
    citations: [MECA],
  },
  {
    // result, direction: the mecA::Tn mutant was about 100-fold LESS tolerant than the WT strain.
    id: "l10-meca-transposon-mutant",
    kind: "lookup",
    question: "How did the daptomycin tolerance of the S. aureus JE2 mecA::Tn mutant compare with that of the wild-type strain?",
    answerable: true,
    facts: [["100-fold", "100 fold", "100×", "100x", "approximately 100"], ["less tolerant", "lower tolerance", "reduced tolerance", "decreased tolerance"]],
    citations: [MECA],
  },
  {
    // negative: differences in MIC did not explain the tolerance difference, and there was no MIC difference between the clonal complexes.
    id: "l11-meca-mic-explains",
    kind: "lookup",
    question: "In the S. aureus daptomycin study, did differences in MIC explain the difference in daptomycin tolerance between MRSA and MSSA isolates?",
    answerable: true,
    facts: [[...NO_EFFECT, "did not explain", "not explain"]],
    citations: [MECA],
  },
  // SCML2, H3K27me3 and paternal epigenetic inheritance in mice.
  {
    // name, design: the F1 males of X-linked Scml2-knockout fathers have a WILD-TYPE genotype, which is the paper's point.
    id: "l12-scml2-f1-genotype",
    kind: "lookup",
    question: "In the SCML2 paternal inheritance study, what genotype did the F1 males of the X-linked Scml2-knockout mice have?",
    answerable: true,
    facts: [["wild-type", "wild type", "wildtype", "WT"]],
    citations: [SCML2],
  },
  {
    // name: the histone marks are told apart by their modification: SCML2 establishes H3K27me3 on bivalent promoters that carry H3K4me2/3.
    id: "l13-scml2-histone-marks",
    kind: "lookup",
    question: "Which repressive histone modification does SCML2 establish on bivalent promoters in the male germline, and which active marks are those promoters marked with?",
    answerable: true,
    facts: [["H3K27me3"], ["H3K4me2/3", "H3K4me2", "H3K4me3"]],
    citations: [SCML2],
  },
  // ALK, POSTN and WNT signaling in neuroblastoma.
  {
    // name, negative: knockdown of POSTN, but NOT FN1, delayed adhesion and suppressed proliferation.
    id: "l14-alk-fn1-knockdown",
    kind: "lookup",
    question: "In the ALK/MYCN neuroblastoma tumors, what effect did knockdown of FN1 have on cell adhesion?",
    answerable: true,
    facts: [[...NO_EFFECT, "but not fn1", "not fn1", "no reduction"]],
    citations: [ALK],
  },
  {
    // direction: ALK UPregulates POSTN and WNT signaling, and loss of POSTN REDUCED WNT activation.
    id: "l15-alk-postn-wnt",
    kind: "lookup",
    question: "In the neuroblastoma study, how did loss of POSTN affect ALK-dependent activation of WNT signaling?",
    answerable: true,
    facts: [["reduced", "reduce", "reduction", "decreased", "decrease", "suppressed", "lowered"]],
    citations: [ALK],
  },
  // FMRP, MAP1B and neuronal migration in Fmr1-null mice.
  {
    // result: three western blots gave MAP1B increased on average by 1.6× in the RMS of Fmr1-null mice.
    id: "l16-fmrp-map1b-level",
    kind: "lookup",
    question: "In the rostral migratory stream of Fmr1-null mice, by how much was MAP1B expression increased compared with controls?",
    answerable: true,
    facts: [["1.6", "1,6"]],
    citations: [FMRP],
  },
  {
    // direction: MAP1B is high in the Fmr1-null mice, so KNOCKING IT DOWN rescues the migration defects.
    id: "l17-fmrp-map1b-rescue",
    kind: "lookup",
    question: "In the FMRP neuronal migration study, what manipulation of MAP1B rescued the migratory defects of Fmr1-null neurons?",
    answerable: true,
    facts: [["knockdown", "knocking down", "knock-down", "kd", "downregulation", "reducing", "reduction"]],
    citations: [FMRP],
  },
  // SLC13A5 (citrate transporter) loss of function in zebrafish.
  {
    // name, design: the two paralogs are slc13a5a and slc13a5b, and three mutants were characterized, including the double mutant.
    id: "l18-zebrafish-paralogs",
    kind: "lookup",
    question: "Which two zebrafish paralogs of human SLC13A5 were mutated with CRISPR/Cas9 in the seizure study?",
    answerable: true,
    facts: [["slc13a5a"], ["slc13a5b"]],
    citations: [ZEBRAFISH],
  },
  {
    // direction: the mutants had FEWER neurons and MORE apoptosis in the optic tectum; both directions matter.
    id: "l19-zebrafish-neurons-apoptosis",
    kind: "lookup",
    question: "In the slc13a5 mutant zebrafish larvae, how did the number of neurons and the amount of apoptosis in the optic tectum compare with wild type?",
    answerable: true,
    facts: [["fewer", "fewer neurons", "reduced", "reduction", "decreased", "decrease", "lower"], ["increase", "increased", "increase in apoptosis", "more apoptosis", "elevated", "higher"]],
    citations: [ZEBRAFISH],
  },
  // ADP-ribose inhibition of methanol dehydrogenases.
  {
    // concentration: IC50 values of 4.8 ± 1.0 μM (BmMDH1) and 2.4 ± 0.7 μM (BmMDH2), in the low micromolar range.
    id: "l20-mdh-ic50",
    kind: "lookup",
    question: "What IC50 values did ADP-ribose show for BmMDH1 and BmMDH2?",
    answerable: true,
    facts: [["4.8"], micromolar("2.4", "0.7")],
    citations: [MDH],
  },
  {
    // direction: the paper's point is that ACT DISINHIBITS MDH by removing ADPR, rather than activating it directly.
    id: "l21-mdh-act-mechanism",
    kind: "lookup",
    question: "According to the ADP-ribose study, does the activator protein ACT increase methanol dehydrogenase activity by directly enhancing catalysis?",
    answerable: true,
    facts: [[...NO_EFFECT, "rather than directly", "not directly", "disinhibit", "disinhibits", "removal of adp-ribose", "hydrolytic removal", "clearance"]],
    citations: [MDH],
  },
  {
    // concentration, name: ADPR raised BmMDH2's KM from 6.7 ± 1.7 μM to 80 ± 20 μM, with a weaker effect on kcat: a competitive inhibitor.
    id: "l22-mdh-km-shift",
    kind: "lookup",
    question: "In the reverse reaction of BmMDH2, what did ADP-ribose change the KM from and to?",
    answerable: true,
    facts: [["6.7"], micromolar("80", "20")],
    citations: [MDH],
  },
  // Cabozantinib and the p53-Y220C mutant.
  {
    // name: the drug degrades p53Y220C selectively; p53WT and the R273H, R280K and S241F mutants are barely affected.
    id: "l23-p53-r273h-effect",
    kind: "lookup",
    question: "What effect did cabozantinib have on the levels of the p53 R273H mutant protein?",
    answerable: true,
    facts: [[...NO_EFFECT, "barely", "no effect", "little effect", "not affected"]],
    citations: [P53],
  },
  {
    // concentration: cells were treated with 10 μM cabozantinib for 48 h throughout; MG132 was also 10 μM and 3-MA 2 mM.
    id: "l24-p53-cabozantinib-concentration",
    kind: "lookup",
    question: "At what concentration and for how long were COV362 cells treated with cabozantinib in the p53Y220C degradation experiments?",
    answerable: true,
    facts: [micromolar("10"), ["48 h", "48h", "48 hours"]],
    citations: [P53],
  },
  {
    // name: the deubiquitylating enzyme is USP7, and the ubiquitin ligase is CHIP.
    id: "l25-p53-usp7-chip",
    kind: "lookup",
    question: "Which deubiquitylating enzyme does cabozantinib dissociate from p53Y220C, and which ligase then mediates its ubiquitination?",
    answerable: true,
    facts: [["USP7"], ["CHIP"]],
    citations: [P53],
  },
  // Abscisic acid, H2O2 and stomatal closure in Arabidopsis guard cells.
  {
    // concentration: guard cells were treated with 20 µM ABA for 45 min; 100 µM ABA and 250 µM H2O2 are nearby.
    id: "l26-aba-concentration",
    kind: "lookup",
    question: "At what concentration and for how long was abscisic acid applied to Arabidopsis guard cells in the ROS imaging experiments?",
    answerable: true,
    facts: [[...micromolar("20"), "20 um"], ["45 min", "45min", "45 minutes"]],
    citations: [ABA],
  },
  {
    // name, negative: the ABA response was LOST in the quintuple ABA receptor mutant pyl-11458.
    id: "l27-aba-receptor-mutant",
    kind: "lookup",
    question: "What happened to the ABA-induced ROS increase in guard cells of the quintuple ABA receptor mutant?",
    answerable: true,
    facts: [["lost", "abolished", "absent", "eliminated", ...NO_EFFECT]],
    citations: [ABA],
  },
  // Asked in a researcher's own spelling, where the paper uses another: the names below never appear in
  // the papers in the question's form ("IL-10", "PPAR-alpha"), so keyword search must bridge them.
  {
    // alias: the paper writes "IL10" throughout, never "IL-10".
    id: "l31-il10-pathogens-challenged",
    kind: "lookup",
    question: "Which bacterial and parasitic pathogens were the IL-10-deficient chickens experimentally challenged with?",
    answerable: true,
    facts: [["Salmonella"], ["Campylobacter"], ["Eimeria"]],
    citations: [IL10],
  },
  {
    // alias, direction: the paper writes "PPARα" and "Pparα", never "PPAR-alpha" or "PPAR alpha".
    id: "l32-ppar-alpha-lipogenesis",
    kind: "lookup",
    question: "In the brown adipose tissue study, what did the absence of PPAR-alpha do to de novo lipogenesis in both sexes?",
    answerable: true,
    facts: [["increased", "increase", "increases", "higher", "elevated", "greater"]],
    citations: [PPARA],
  },
  // Two papers together, and a question the papers do not answer.
  {
    // comparison: both studies used a knockout whose effect depends on sex (PPARα: 97% female, 83% male) or on
    // which paralog is lost (zebrafish single against double mutants). Needs both papers.
    id: "l28-knockout-sex-and-paralog",
    kind: "comparison",
    question:
      "In the PPARα brown adipose tissue study, how much was Pparα mRNA reduced in female mice, and in the zebrafish SLC13A5 study, which two paralogs were knocked out?",
    answerable: true,
    facts: [["97"], ["slc13a5a"], ["slc13a5b"]],
    citations: [PPARA, ZEBRAFISH],
  },
  {
    // not in the papers: no study here measures rapamycin or mTOR inhibition, though several measure a kinase
    // inhibitor (cabozantinib) and one measures an enzyme inhibitor (ADP-ribose).
    id: "l29-rapamycin-not-studied",
    kind: "unanswerable",
    question: "What concentration of rapamycin did the PPARα brown adipose tissue study use to inhibit mTOR in brown adipocytes?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // not in the papers: the mecA study measures daptomycin tolerance and MICs, not vancomycin MICs.
    id: "l30-vancomycin-not-measured",
    kind: "unanswerable",
    question: "What vancomycin MIC did the MRSA strains in the mecA daptomycin tolerance study have?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const labHoldoutTasks: ResearchTask[] = [
  {
    // concentration: macrophages were stimulated with LPS; the knockout's nitric oxide rise is the result.
    id: "lh01-il10-caecal-microbiome",
    kind: "lookup",
    question: "In the IL10-deficient chicken study, what did IL10 deficiency do to the composition of the caecal microbiome?",
    answerable: true,
    facts: [["altered", "alter", "significantly altered", "changed", "change"]],
    citations: [IL10],
  },
  {
    // direction, result: in Eimeria tenella challenge, clearance was accelerated but lesions were MORE severe and weight gain compromised.
    id: "lh02-il10-eimeria-lesions",
    kind: "lookup",
    question: "In IL10-deficient chickens challenged with Eimeria tenella, what happened to pathogen clearance and to the severity of caecal lesions?",
    answerable: true,
    facts: [["accelerated", "faster", "enhanced", "increased clearance"], ["more severe", "severe", "greater", "worse", "increased"]],
    citations: [IL10],
  },
  {
    // concentration: tamoxifen was injected at 60 mg/kg, next to the agonist's 1 mg/kg.
    id: "lh03-ppara-tamoxifen-dose",
    kind: "lookup",
    question: "At what dose was tamoxifen injected to induce the PPARα deletion in brown adipose tissue?",
    answerable: true,
    facts: [["60 mg/kg", "60mg/kg", "60 mg·kg"]],
    citations: [PPARA],
  },
  {
    // result, name: the mitochondrial DNA content fell by 40% in female mice after agonist treatment.
    id: "lh04-ppara-mtdna-female",
    kind: "lookup",
    question: "In the PPARα study, by how much was mitochondrial DNA content decreased in brown adipose tissue of female PPARαBATKO mice after β3-adrenergic agonist treatment?",
    answerable: true,
    facts: [["40"]],
    citations: [PPARA],
  },
  {
    // negative: the surface charge difference was NOT dependent on PBP2a: the mecA::Tn mutant had the same charge as WT.
    id: "lh05-meca-surface-charge",
    kind: "lookup",
    question: "In the S. aureus daptomycin study, was the difference in surface charge between MRSA and MSSA strains dependent on PBP2a?",
    answerable: true,
    facts: [[...NO_EFFECT, "not dependent", "same surface charge"]],
    citations: [MECA],
  },
  {
    // name, direction: the mecA mutant had HIGHER Agr activity and released more phenol-soluble modulins.
    id: "lh06-meca-agr-activity",
    kind: "lookup",
    question: "In the S. aureus study, how did the lack of mecA affect the activity of the Agr quorum sensing system?",
    answerable: true,
    facts: [["higher", "increased", "elevated", "greater", "increase"]],
    citations: [MECA],
  },
  {
    // concentration: ADPR bound BmMDH2 with a KD of 303 nM by ITC: nanomolar, not micromolar.
    id: "lh07-mdh-itc-kd",
    kind: "lookup",
    question: "What binding constant did isothermal titration calorimetry give for ADP-ribose binding to BmMDH2?",
    answerable: true,
    facts: [["303 nM", "303nM", "303 nm", "0.303 μM", "0.303 µM"]],
    citations: [MDH],
  },
  {
    // name: p53Y220C is degraded; the question names the cell line, whose p53 status the paper gives.
    id: "lh08-p53-h1299-status",
    kind: "lookup",
    question: "Which p53 status do the H1299 cells used for the cabozantinib transfection experiments have?",
    answerable: true,
    facts: [["null", "p53null", "p53-null"]],
    citations: [P53],
  },
  {
    // name, result: ABA-increased ROS colocalized with Mitotracker Red, and the H2O2-selective probe is Peroxy Orange 1.
    id: "lh09-aba-h2o2-probe",
    kind: "lookup",
    question: "Which H2O2-selective probe did the abscisic acid guard cell study use alongside the generic ROS sensor dichlorofluorescein?",
    answerable: true,
    facts: [["Peroxy Orange 1", "PO1", "peroxy orange"]],
    citations: [ABA],
  },
  {
    // alias: the paper writes "RNA-interference", never "RNAi" or "siRNA".
    id: "lh11-fmrp-rnai-cell-autonomous",
    kind: "lookup",
    question: "In the FMRP neuronal migration study, what did RNAi-induced knockdown of Fmr1 show about the migratory defects?",
    answerable: true,
    facts: [["cell-autonomous", "cell autonomous"]],
    citations: [FMRP],
  },
  {
    // not in the papers: the ABA study is in Arabidopsis guard cells; it measures no stomatal aperture in maize.
    id: "lh10-maize-not-studied",
    kind: "unanswerable",
    question: "In the abscisic acid stomatal closure study, what stomatal aperture was measured in maize leaves after ABA treatment?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
