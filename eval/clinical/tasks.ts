// Questions over clinical research papers (harness 0.60.0): the kind of document a health sciences
// researcher brings, which no other suite holds. The field suite's documents are Wikipedia leads, a
// licence and the app's own documentation; none has an effect size, a confidence interval, a dose or
// a negative result, which are where reading a trial goes wrong.
//
// The documents are ten open-access trial reports, CC BY 4.0, from Europe PMC's full-text XML, kept as
// published and built by source/jats2md.py (README.md lists them with their licences). They are read as
// Markdown, not PDF: Europe PMC's PDFs could not be downloaded where the suite was written. They are
// their own library, and overlap on purpose: three trials in Malawi, two in pregnant women with malaria
// or anaemia, C-reactive protein measured in three, and many numbers that differ only by arm or row.
//
// The questions ask what a researcher extracting data asks, in kinds tagged on each task:
// - effect: an effect size and its interval, next to others that are easy to take instead;
// - negative: a result that was not significant. Such a task has a fact group of the ways to say so
//   ("did not", "no significant", …), so an answer that turns "did not reduce" into "reduced" fails;
// - dose: a dose or a reading whose unit matters (mg, µg, mg/kg, mmHg, mmol/L);
// - table: a value given only in a table, in a row and column of its own;
// - design: who was studied, how many, for how long;
// - and questions the papers do not answer.
//
// Two suites, as for the office documents: `clinical` may be looked at task by task while a change is
// developed; `clinicalholdout` is read only as totals. The questions and their facts were written from
// the papers before any model was run on them, and are not changed to fit a run. Scoring is the research
// suite's: every fact group in the answer, every cited document, a verified quote.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/clinical/docs/, each the article of the PMCID in its title. */
export const clinicalDocuments: FieldDocument[] = [
  { id: "typhoid-vaccine-malawi", title: "Efficacy of typhoid conjugate vaccine: final analysis of a 4-year, phase 3, randomised controlled trial in Malawian children (Lancet 2024, PMC10850983)", file: "typhoid-vaccine-malawi.md" },
  { id: "iv-iron-pregnancy-malawi", title: "Ferric carboxymaltose versus standard-of-care oral iron to treat second-trimester anaemia in Malawian pregnant women (REVAMP, Lancet 2023, PMC10193370)", file: "iv-iron-pregnancy-malawi.md" },
  { id: "ipt-malaria-pregnancy", title: "Chemoprevention for malaria with monthly intermittent preventive treatment with dihydroartemisinin–piperaquine in pregnant women living with HIV (Lancet 2024, PMC10865779)", file: "ipt-malaria-pregnancy.md" },
  { id: "cruciferous-blood-pressure", title: "Cruciferous vegetables lower blood pressure in adults with mildly elevated blood pressure in a randomized, controlled, crossover trial: the VESSEL study (BMC Medicine 2024, PMC11367748)", file: "cruciferous-blood-pressure.md" },
  { id: "copcov-hydroxychloroquine", title: "Evaluation of hydroxychloroquine or chloroquine for the prevention of COVID-19 (COPCOV) (PLOS Medicine 2024, PMC11392261)", file: "copcov-hydroxychloroquine.md" },
  { id: "folic-acid-pregnancy", title: "Cognitive benefits of folic acid supplementation during pregnancy track with epigenetic changes at an imprint regulator (BMC Medicine 2024, PMC11650848)", file: "folic-acid-pregnancy.md" },
  { id: "azithromycin-severe-malaria", title: "Azithromycin in severe malaria bacterial co-infection in African children (TABS-PKPD) (BMC Medicine 2024, PMC11542398)", file: "azithromycin-severe-malaria.md" },
  { id: "carrageenan-insulin", title: "Carrageenan and insulin resistance in humans: a randomised double-blind cross-over trial (BMC Medicine 2024, PMC11590543)", file: "carrageenan-insulin.md" },
  { id: "betamethasone-50-years", title: "General health and social outcomes 50 years after exposure to antenatal betamethasone (BMC Medicine 2024, PMC11533403)", file: "betamethasone-50-years.md" },
  { id: "crp-community-health-workers", title: "Point-of-care C-reactive protein measurement by community health workers safely reduces antimicrobial use among children with respiratory illness in rural Uganda (PLOS Medicine 2024, PMC11407643)", file: "crp-community-health-workers.md" },
];

const TYPHOID = ["typhoid-vaccine-malawi"];
const IRON = ["iv-iron-pregnancy-malawi"];
const IPT = ["ipt-malaria-pregnancy"];
const VEG = ["cruciferous-blood-pressure"];
const COPCOV = ["copcov-hydroxychloroquine"];
const FOLIC = ["folic-acid-pregnancy"];
const AZI = ["azithromycin-severe-malaria"];
const CARRA = ["carrageenan-insulin"];
const BETA = ["betamethasone-50-years"];
const CRP = ["crp-community-health-workers"];

/**
 * The ways an answer says a result was not significant or did not differ. A negative task needs one
 * of them, so "it reduced X" fails where the paper says it did not; the scorer matches substrings of
 * the lower-cased answer.
 */
const NO_EFFECT = [
  "did not",
  "didn't",
  "no significant",
  "not significant",
  "not statistically",
  "no statistically",
  // Since 0.61.0: "there was no statistical difference" (task defect found on c20, eval/clinical/README.md).
  "no statistical",
  "no difference",
  "no differences",
  "no evidence",
  "not differ",
  "no reduction",
  "similar",
  "no clear",
  "no effect",
];

/** A number as The Lancet prints it ("78·3") and as a model may type it ("78.3"). */
const lancet = (n: string) => [n, n.replace("·", ".")];

export const clinicalTasks: ResearchTask[] = [
  // Typhoid conjugate vaccine, Malawi (The Lancet: "·" decimals, thousands with a space).
  {
    // effect: the final 4-year efficacy, not the 80·7% of the earlier 18–24-month analysis the paper also gives.
    id: "c01-typhoid-efficacy",
    kind: "lookup",
    question: "In the final analysis of the typhoid conjugate vaccine trial in Malawian children, what was the efficacy of Vi-TT against blood culture-confirmed typhoid fever in the intention-to-treat population, with its 95% confidence interval?",
    answerable: true,
    facts: [lancet("78·3"), lancet("66·3"), lancet("86·1")],
    citations: [TYPHOID],
  },
  {
    // table: Table 1 only; the MenA group's mean age (6·2) is in the next column.
    id: "c02-typhoid-mean-age",
    kind: "lookup",
    question: "In the Malawi typhoid conjugate vaccine trial, what was the mean age at enrolment of the children in the Vi-TT group?",
    answerable: true,
    facts: [lancet("6·1")],
    citations: [TYPHOID],
  },
  // Intravenous iron in pregnancy, Malawi (REVAMP).
  {
    // negative: the primary outcome did not differ; anaemia was numerically lower, and lower at 4 weeks.
    // Until 0.61.0 its facts also required the prevalence ratio (0·92), which the question does not ask
    // for, so right answers failed (task defect, eval/clinical/README.md).
    id: "c03-iron-anaemia-36-weeks",
    kind: "lookup",
    question: "In the REVAMP trial, did ferric carboxymaltose reduce the prevalence of anaemia at 36 weeks' gestation compared with standard of care?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [IRON],
  },
  {
    // dose: the standard of care's oral iron, not the 1000 mg of ferric carboxymaltose.
    id: "c04-iron-oral-dose",
    kind: "lookup",
    question: "What dose of oral iron did women in the standard-of-care group of the REVAMP trial receive, and how often?",
    answerable: true,
    facts: [["60 mg"], ["twice daily", "twice a day", "two times a day", "twice per day"]],
    citations: [IRON],
  },
  {
    // table: Table 1 only; the standard-of-care group's mean age (22·5) is in the next column.
    id: "c05-iron-mean-age",
    kind: "lookup",
    question: "In the REVAMP trial, what was the mean age of the women randomly assigned to ferric carboxymaltose?",
    answerable: true,
    facts: [lancet("22·2")],
    citations: [IRON],
  },
  // Dihydroartemisinin–piperaquine for pregnant women living with HIV.
  {
    // effect: the risk ratio, next to the incidence rate ratio (0·32) in the same paragraph.
    id: "c06-ipt-risk-ratio",
    kind: "lookup",
    question: "In the trial adding monthly dihydroartemisinin–piperaquine to daily co-trimoxazole in pregnant women living with HIV, what was the risk ratio for any malaria infection during pregnancy or delivery?",
    answerable: true,
    facts: [lancet("0·45")],
    citations: [IPT],
  },
  {
    // dose: each tablet has 40 mg dihydroartemisinin and 320 mg piperaquine; co-trimoxazole has 160 mg and 800 mg.
    id: "c07-ipt-piperaquine-dose",
    kind: "lookup",
    question: "How much piperaquine did each dihydroartemisinin–piperaquine tablet contain in the trial in pregnant women living with HIV in Kenya and Malawi?",
    answerable: true,
    facts: [["320 mg"]],
    citations: [IPT],
  },
  // Cruciferous vegetables and blood pressure (VESSEL).
  {
    // effect: size, unit and direction of the primary outcome.
    id: "c08-veg-systolic",
    kind: "lookup",
    question: "In the VESSEL crossover trial, how did 24-hour brachial systolic blood pressure change after the cruciferous vegetable diet compared with the root and squash vegetable diet?",
    answerable: true,
    facts: [["2.5"], ["mmhg", "mm hg"], ["reduc", "lower", "decrease", "fell", "fall", "−2.5", "-2.5", "− 2.5"]],
    citations: [VEG],
  },
  {
    // design: the number of participants.
    id: "c09-veg-participants",
    kind: "lookup",
    question: "How many participants were recruited to the VESSEL trial of cruciferous vegetables and blood pressure?",
    answerable: true,
    // A bare "18" would match "2018"; the answer has to state the number of participants.
    facts: [["eighteen", "18 participants", "18 adults", "18 people", "18 individuals", "n = 18", "n=18", "were 18", "was 18", "18 were"]],
    citations: [VEG],
  },
  // Hydroxychloroquine or chloroquine for COVID-19 prevention (COPCOV).
  {
    // effect: the trial's own primary result, not the meta-analysis's 0.80 or the respiratory infections' 0.61.
    id: "c10-copcov-primary",
    kind: "lookup",
    question: "In the COPCOV trial, what was the risk ratio for symptomatic COVID-19 with hydroxychloroquine or chloroquine compared with placebo, with its 95% confidence interval?",
    answerable: true,
    facts: [["0.85"], ["0.72"], ["1.00"]],
    citations: [COPCOV],
  },
  {
    // negative: asymptomatic infections did not differ (11.5% vs 12.0%, p = 0.6).
    id: "c11-copcov-asymptomatic",
    kind: "lookup",
    question: "Did hydroxychloroquine or chloroquine reduce asymptomatic SARS-CoV-2 infections in the COPCOV trial?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [COPCOV],
  },
  {
    // table: Table 3 only; placebo's 242 (10.4) is in the next column.
    id: "c12-copcov-adverse-events",
    kind: "lookup",
    question: "In the COPCOV trial, how many participants given chloroquine or hydroxychloroquine had at least one adverse event?",
    answerable: true,
    facts: [["218"]],
    citations: [COPCOV],
  },
  // Folic acid in pregnancy (FASSTT).
  {
    // dose: micrograms, which an answer in milligrams gets wrong by a thousand.
    id: "c13-folic-dose",
    kind: "lookup",
    question: "What daily dose of folic acid did women in the intervention group of the FASSTT trial receive?",
    answerable: true,
    facts: [["400 µg", "400 μg", "400µg", "400μg", "400 mcg", "400 ug", "400 micrograms", "0.4 mg"]],
    citations: [FOLIC],
  },
  // Azithromycin in severe malaria (TABS-PKPD).
  {
    // dose: three doses in mg/kg.
    id: "c14-azi-doses",
    kind: "lookup",
    question: "Which doses of azithromycin were compared in the TABS-PKPD trial in Ugandan children with severe malaria?",
    answerable: true,
    facts: [["10"], ["15"], ["20 mg/kg", "20mg/kg", "20 mg per kg"]],
    citations: [AZI],
  },
  {
    // effect: which arm had the smallest CRP reduction; the 10 and 20 mg/kg arms had larger ones.
    id: "c15-azi-smallest-crp",
    kind: "lookup",
    question: "In the TABS-PKPD trial, which azithromycin dose arm had the smallest mean reduction in C-reactive protein at 72 hours?",
    answerable: true,
    facts: [["15 mg/kg", "15mg/kg", "15 mg per kg"]],
    citations: [AZI],
  },
  // Carrageenan and insulin resistance.
  {
    // negative: no overall difference; lower insulin sensitivity only in overweight participants.
    id: "c16-carrageenan-insulin",
    kind: "lookup",
    question: "Did carrageenan change overall insulin sensitivity compared with placebo in the cross-over trial in healthy men?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [CARRA],
  },
  // Antenatal betamethasone, 50-year follow-up.
  {
    // effect: the one outcome that differed.
    id: "c17-beta-fracture",
    kind: "lookup",
    question: "In the 50-year follow-up of the antenatal betamethasone trial, what was the adjusted relative risk of osteoporotic site fracture in the betamethasone group compared with placebo?",
    answerable: true,
    facts: [["1.57"]],
    citations: [BETA],
  },
  {
    // dose: the first 717 mothers had 6 mg + 6 mg; the next 398 a double dose (12 mg + 12 mg).
    id: "c18-beta-first-dose",
    kind: "lookup",
    question: "In the antenatal betamethasone trial, what did each injection contain for the first 717 mothers?",
    answerable: true,
    facts: [["6 mg betamethasone sodium phosphate", "6 mg of betamethasone sodium phosphate", "6 mg sodium phosphate"], ["6 mg betamethasone acetate", "6 mg of betamethasone acetate", "6 mg acetate"]],
    citations: [BETA],
  },
  // C-reactive protein measured by community health workers, Uganda.
  {
    // effect: the odds ratio for antibiotic prescription.
    id: "c19-crp-odds-ratio",
    kind: "lookup",
    question: "In the stepped wedge trial of C-reactive protein testing by community health workers in Uganda, what was the odds ratio for antibiotic prescription in the intervention periods compared with the control periods?",
    answerable: true,
    facts: [["0.18"]],
    citations: [CRP],
  },
  {
    // negative: clinical failure did not differ (OR 0.41, 95% CI 0.09 to 1.83).
    id: "c20-crp-clinical-failure",
    kind: "lookup",
    question: "In the Ugandan trial of C-reactive protein testing by community health workers, did clinical failure differ between the intervention and control periods?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [CRP],
  },
  // Two papers.
  {
    id: "c21-malawi-largest",
    kind: "comparison",
    question: "Which enrolled more participants: the typhoid conjugate vaccine trial in Malawian children or the REVAMP trial of intravenous iron in Malawian pregnant women?",
    answerable: true,
    facts: [["typhoid", "vi-tt"], ["28 130", "28,130", "28130"]],
    citations: [TYPHOID],
  },
  // Not in the papers.
  {
    id: "c22-typhoid-adults",
    kind: "unanswerable",
    question: "What was the efficacy of the Vi-TT typhoid conjugate vaccine in adults aged 18 to 45 years in the Malawi trial?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "c23-veg-hba1c",
    kind: "unanswerable",
    question: "How did HbA1c change after the cruciferous vegetable diet in the VESSEL trial?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const clinicalHoldoutTasks: ResearchTask[] = [
  {
    id: "ch01-typhoid-under-2",
    kind: "lookup",
    question: "What was the efficacy of Vi-TT in children aged 9 months to 2 years in the final analysis of the Malawi typhoid vaccine trial?",
    answerable: true,
    facts: [lancet("70·6")],
    citations: [TYPHOID],
  },
  {
    id: "ch02-iron-birthweight",
    kind: "lookup",
    question: "Did birthweight differ between the ferric carboxymaltose and standard-of-care groups in the REVAMP trial?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [IRON],
  },
  {
    id: "ch03-ipt-nnt",
    kind: "lookup",
    question: "What was the number needed to treat with monthly dihydroartemisinin–piperaquine to avert one malaria infection per pregnancy in women living with HIV?",
    answerable: true,
    facts: [["was 7", "is 7", "of 7", ": 7", "7 (95%", "seven", "= 7"]],
    citations: [IPT],
  },
  {
    id: "ch04-veg-triglycerides",
    kind: "lookup",
    question: "How did serum triglycerides change after the cruciferous vegetable diet compared with the control diet in the VESSEL trial?",
    answerable: true,
    facts: [["0.2"], ["mmol/l", "mmol per litre", "mmol per liter"], ["lower", "reduc", "decrease", "−0.2", "-0.2", "− 0.2"]],
    citations: [VEG],
  },
  {
    id: "ch05-copcov-dose",
    kind: "lookup",
    question: "What daily dose of hydroxychloroquine or chloroquine was given in the COPCOV trial?",
    answerable: true,
    facts: [["155 mg"]],
    citations: [COPCOV],
  },
  {
    id: "ch06-carrageenan-dose",
    kind: "lookup",
    question: "How much carrageenan did participants take per dose in the carrageenan and insulin resistance trial?",
    answerable: true,
    facts: [["250 mg"]],
    citations: [CARRA],
  },
  {
    id: "ch07-beta-mental-health",
    kind: "lookup",
    question: "Did exposure to antenatal betamethasone affect mental health outcomes at 50 years of age?",
    answerable: true,
    facts: [NO_EFFECT],
    citations: [BETA],
  },
  {
    id: "ch08-beta-oral-health",
    kind: "lookup",
    question: "In the 50-year follow-up of antenatal betamethasone, what was the adjusted relative risk of self-reported fair or poor oral health?",
    answerable: true,
    facts: [["1.22"]],
    citations: [BETA],
  },
  {
    id: "ch09-folic-placebo-n",
    kind: "lookup",
    question: "How many women were randomised to placebo in the FASSTT trial of folic acid in the second and third trimesters?",
    answerable: true,
    facts: [["n = 94", "n=94", "94 women", "94 participants", "94 were", "were 94", "was 94", "94 to placebo", "94 randomised", "94 randomized"]],
    citations: [FOLIC],
  },
  {
    id: "ch10-azi-ferritin",
    kind: "unanswerable",
    question: "What was the median serum ferritin of the children in the TABS-PKPD azithromycin trial?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
