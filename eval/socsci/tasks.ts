// Questions over social-science papers and interview transcripts (harness 0.104.0): recommendation 6 of the
// social-sciences audit (docs/social-sciences-audit.md, S8), the documents a sociologist, political scientist,
// economist or qualitative researcher brings, which no other suite holds. None of the other suites has a survey's
// adjusted odds ratios for one group against another, a panel regression with its standard errors in a row
// under its estimates, a field experiment's response rates by treatment, interviewees quoted by code, or a
// transcript where an interviewer's question and the participant's answer differ. Those are where reading the
// field goes wrong: which group was more likely, in which direction, significant or not, said by whom.
//
// The documents are eight open-access journal papers, CC BY 4.0, from Europe PMC's full-text XML, read with the
// app's own converter (source/build.ts), and two made-up interview transcripts, one a WebVTT caption file as video
// calls export them, read by the app's caption reader (src/documents/transcripts.ts). They are their own library,
// and overlap on purpose: two surveys of trust, two studies of who wins and loses in politics, three studies of
// interviews (academics who care for older relatives, psycho-oncologists, adults with long-term conditions) and
// the two transcripts, whose interviewees are both shift workers, one feeling excluded by neighbours, one not.
//
// The questions ask what a social scientist reading a result asks, in kinds tagged on each task:
// - group: a difference between two groups (Black and White participants, women and men, aligned and unaligned
//   voters), where the reversed answer shares every other word;
// - direction: which way an association went (negative, less, higher losses);
// - significance: whether an estimate was statistically significant, in one model of several;
// - table: a value read from a table, a standard error under its estimate or one model's column of several;
// - subgroup: a finding that holds only for some participants (older or retired, caring alongside childcare);
// - negative: a comparison that found nothing (no discrimination, no institutional support);
// - who: which interviewee said something, or whether the participant, not the interviewer, said it;
// - turn: a fact in a part that starts inside a speaker's long turn, which only its note says is the
//   participant's (src/documents/chunk.ts speakersContinued);
// - and questions the documents do not answer, with a nearby fact in the library.
//
// Two suites, as for the other papers: `socsci` may be looked at task by task while a change is developed;
// `socsciholdout` is read only as totals. The questions and their facts were written from the documents before
// any model was run on them, and are not changed to fit a run. Scoring is the research suite's: every fact group
// in the answer, every cited document, a verified quote. The scorer matches lower-cased substrings, so it cannot
// tell "Black participants were less likely than White" from the reverse; a group task asks for what only the
// right reading gives (the odds ratio, the group not named in the question), and the reports are read for the rest.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/socsci/docs/: each paper is the article of the PMCID in its title. */
export const socsciDocuments: FieldDocument[] = [
  { id: "pharmacist-trust-vaccination-survey", title: "From Trust to Choice: A Cross-Sectional Survey of How Patient Trust in Pharmacists Shapes Shared Clinical Decision-Making for Vaccination (Int J Environ Res Public Health 2025, PMC12562420)", file: "pharmacist-trust-vaccination-survey.md" },
  { id: "income-inequality-life-expectancy-canada", title: "Income inequality and life expectancy in Canada: New evidence from province-level panel regression analysis (Can J Public Health 2025, PMC12753609)", file: "income-inequality-life-expectancy-canada.md" },
  { id: "politician-email-field-experiment", title: "Politicians' email communication with voters: A field experiment for the 2021 Bundestag elections (PLoS One 2025, PMC12282911)", file: "politician-email-field-experiment.md" },
  { id: "party-realignment-single-issue-voters", title: "Party realignment and single-issue voters (PLoS One 2025, PMC11913262)", file: "party-realignment-single-issue-voters.md" },
  { id: "older-people-care-academia-gender-gap", title: "Older people care increases the gender gap in academia (Sci Rep 2025, PMC12480459)", file: "older-people-care-academia-gender-gap.md" },
  { id: "cash-transfer-food-security-nigeria", title: "Impact of conditional cash transfer on households food security in Akwa Ibom State, Nigeria (PLoS One 2025, PMC12176151)", file: "cash-transfer-food-security-nigeria.md" },
  { id: "psycho-oncologists-patient-deaths", title: "A qualitative interview study on psycho-oncologists' experiences with patient deaths in Germany (Sci Rep 2025, PMC12216660)", file: "psycho-oncologists-patient-deaths.md" },
  { id: "social-relationships-long-term-conditions", title: "Experiences of Social Relationships for Adults Living With Multiple Long-Term Conditions: A Qualitative Interview Study (Health Expect 2025, PMC12422356)", file: "social-relationships-long-term-conditions.md" },
  { id: "interview-t01-rosa", title: "Shift Work and Neighbourhood Life, interview T01 (P07, Rosa)", file: "interview-t01-rosa.md" },
  { id: "interview-t02-daniel", title: "Shift Work and Neighbourhood Life, interview T02 (P12, Daniel), video call captions", file: "interview-t02-daniel.vtt" },
];

const PHARM = ["pharmacist-trust-vaccination-survey"];
const INEQ = ["income-inequality-life-expectancy-canada"];
const EMAIL = ["politician-email-field-experiment"];
const BREXIT = ["party-realignment-single-issue-voters"];
const CARE = ["older-people-care-academia-gender-gap"];
const CASH = ["cash-transfer-food-security-nigeria"];
const ONCO = ["psycho-oncologists-patient-deaths"];
const MLTC = ["social-relationships-long-term-conditions"];
const ROSA = ["interview-t01-rosa"];
const DANIEL = ["interview-t02-daniel"];

/** The ways an answer says a comparison or a test found nothing; the scorer matches substrings of the lower-cased answer. */
const NO_EFFECT = ["did not", "didn't", "does not", "doesn't", "was not", "were not", "no evidence", "no significant", "not significant", "no discrimination", "not discriminat", "no difference", "no,", "no."];
/** The ways an answer says an estimate was not statistically significant. */
const NOT_SIGNIFICANT = ["not statistically significant", "not significant", "non-significant", "nonsignificant", "insignificant", "was not significant", "no significant"];

export const socsciTasks: ResearchTask[] = [
  // Trust in community pharmacists and shared clinical decision-making (IJERPH 2025), its tables placed from <floats-group>.
  {
    // group: Black participants were about 50% less likely than White participants (AOR 0.499).
    id: "s01-pharm-race",
    kind: "lookup",
    question: "In the survey on trust in community pharmacists, how did Black participants' willingness to engage in shared clinical decision-making compare with White participants', and what was the adjusted odds ratio?",
    answerable: true,
    facts: [["less likely", "less willing", "lower odds", "50% less", "lower willingness", "lower likelihood", "half as likely"], ["0.499"]],
    citations: [PHARM],
  },
  {
    // group: Democrats were about twice as likely as Republicans (AOR 2.133).
    id: "s02-pharm-party",
    kind: "lookup",
    question: "In the pharmacist trust survey, compared with Republicans, which party's affiliates were about twice as likely to be willing to engage in shared clinical decision-making with pharmacists?",
    answerable: true,
    facts: [["democrat"]],
    citations: [PHARM],
  },
  {
    // table, significance: Table 3, retired vs employed: 1.634 (p 0.008) unadjusted, 1.365 (p 0.274) in the multivariable model.
    id: "s03-pharm-retired-adjusted",
    kind: "lookup",
    question: "In the pharmacist trust survey's multivariable logistic regression (Table 3), what adjusted odds ratio and p-value are reported for retired versus employed participants?",
    answerable: true,
    facts: [["1.365"], ["0.274"]],
    citations: [PHARM],
  },
  {
    // negative, significance: frequency of provider visits, technical competence and employment status were not significant.
    id: "s04-pharm-technical-competence",
    kind: "lookup",
    question: "In the pharmacist trust survey's multivariable model, was trust in pharmacists' technical competence a statistically significant predictor of willingness to engage in shared decision-making?",
    answerable: true,
    facts: [NOT_SIGNIFICANT.concat(["was not", "were not"])],
    citations: [PHARM],
  },
  // Income inequality and life expectancy in Canadian provinces, 1996–2019 (Can J Public Health 2025).
  {
    // direction: higher after-tax income inequality, lower life expectancy.
    id: "s05-ineq-direction",
    kind: "lookup",
    question: "In the Canadian province-level panel study (1996–2019), how was after-tax income inequality, measured by the top 5% income share, associated with average life expectancy?",
    answerable: true,
    facts: [["negative", "lower life expectancy", "lower average life expectancy", "inverse", "decrease"]],
    citations: [INEQ],
  },
  {
    // significance: the top 1% share coefficient (model E) was negative but not statistically significant.
    id: "s06-ineq-top1",
    kind: "lookup",
    question: "In the Canadian income inequality study's robustness checks, was the coefficient on the top 1% income share statistically significant?",
    answerable: true,
    facts: [NOT_SIGNIFICANT],
    citations: [INEQ],
  },
  {
    // table: Appendix model D, top 10% income share, female (regression #10): −0.0104*** (0.0024). Read with merged cells spread (0.101.0).
    id: "s07-ineq-model-d-se",
    kind: "lookup",
    question: "In the Canadian income inequality study's Appendix model D, what coefficient and standard error are reported for the top 10% income share in the female life expectancy regression?",
    answerable: true,
    facts: [["0.0104"], ["0.0024"]],
    citations: [INEQ],
  },
  // Politicians' email responsiveness before the 2021 Bundestag election (PLoS One 2025).
  {
    // group: aligned voters 75.05%, unaligned 61.39%.
    id: "s08-email-alignment",
    kind: "lookup",
    question: "In the Bundestag email field experiment, how often did voters aligned with the candidate's party receive an answer, compared with voters who were not aligned?",
    answerable: true,
    facts: [["75.05"], ["61.39"]],
    citations: [EMAIL],
  },
  {
    // group, direction: opponents of dual citizenship got answers from AfD candidates more often, 61.32% vs 41.67%.
    id: "s09-email-afd",
    kind: "lookup",
    question: "In the Bundestag email experiment, which inquirers received a response from AfD candidates more often, supporters or opponents of dual citizenship, and at what rates?",
    answerable: true,
    facts: [["oppon", "oppos", "against"], ["61.32"], ["41.67"]],
    citations: [EMAIL],
  },
  {
    // negative: no discrimination against voters with Turkish migration backgrounds in response rates.
    id: "s10-email-migration",
    kind: "lookup",
    question: "In the Bundestag email experiment, did candidates reply less often to inquirers whose names signalled a Turkish migration background?",
    answerable: true,
    facts: [NO_EFFECT.concat(["irrelevant", "no evidence"])],
    citations: [EMAIL],
  },
  {
    // group: candidates signalled support for dual citizenship to supporters 62.31% of the time, to opponents 42.31%.
    id: "s11-email-opportunism",
    kind: "lookup",
    question: "In the Bundestag email experiment, how often did candidates signal that they favour dual citizenship when the inquirer supported it, and when the inquirer opposed it?",
    answerable: true,
    facts: [["62.31"], ["42.31"]],
    citations: [EMAIL],
  },
  // Party realignment after the Brexit referendum (PLoS One 2025).
  {
    // table: Table 1, column 2: lagged Conservative vote share 0.4444 (0.2057).
    id: "s12-brexit-col2",
    kind: "lookup",
    question: "In the Brexit party realignment paper's baseline regression of MP switching (Table 1), what coefficient and standard error does column 2, which adds the Leave vote share, report for the lagged Conservative vote share?",
    answerable: true,
    facts: [["0.4444"], ["0.2057"]],
    citations: [BREXIT],
  },
  {
    // significance: the lagged Conservative share is insignificant in column 1, significant once the Leave share is added.
    id: "s13-brexit-col1-significance",
    kind: "lookup",
    question: "In the Brexit realignment paper's baseline regression, is the lagged Conservative vote share significant in column 1, with only year dummies?",
    answerable: true,
    facts: [NOT_SIGNIFICANT],
    citations: [BREXIT],
  },
  {
    // direction: MPs who resisted switching to pro-Leave faced significantly higher electoral losses.
    id: "s14-brexit-losses",
    kind: "lookup",
    question: "According to the Brexit realignment paper, did Conservative MPs who resisted switching to a pro-Leave position face higher or lower electoral losses?",
    answerable: true,
    facts: [["higher", "greater", "more"]],
    citations: [BREXIT],
  },
  {
    // number: 108 of the original 185 remained in office by 2022; 82 of the 100 explicit switchers held a cabinet position.
    id: "s15-brexit-survivors",
    kind: "lookup",
    question: "Of the 185 initially pro-Remain Conservative MPs, how many were still in office by 2022, and how many of the explicit switchers among them had held a cabinet position?",
    answerable: true,
    facts: [["108"], ["82"]],
    citations: [BREXIT],
  },
  // Caring for older relatives and the gender gap in Spanish academia (Sci Rep 2025).
  {
    // group: physical health problems: women 63% (15), men 16,7% (2).
    id: "s16-care-physical",
    kind: "lookup",
    question: "In the study of Spanish academics caring for older relatives, what proportion of women and of men reported physical health problems from caregiving?",
    answerable: true,
    facts: [["63"], ["16,7", "16.7", "17%"]],
    citations: [CARE],
  },
  {
    // group: mental health problems: 23 of 24 women, 5 of 12 men.
    id: "s17-care-mental",
    kind: "lookup",
    question: "In the study of Spanish academics caring for older relatives, how many of the women and how many of the men reported mental health problems?",
    answerable: true,
    facts: [["23 out of 24", "23 of 24", "23/24", "23 of the 24", "23 women"], ["5 out of 12", "5 of 12", "5/12", "5 of the 12", "5 men", "five"]],
    citations: [CARE],
  },
  {
    // negative: all 36 interviewees were unaware of any support from their institutions.
    id: "s18-care-institutions",
    kind: "lookup",
    question: "Did the academics caring for older relatives report receiving support from their universities for their caregiving?",
    answerable: true,
    facts: [["unaware", "invisible", "no support", "not aware", "did not", "didn't", "none", "not getting", "no institutional"]],
    citations: [CARE],
  },
  {
    // who: "Half of my salary goes on caring for my mother" (W17).
    id: "s19-care-salary-who",
    kind: "lookup",
    question: "In the study of academics caring for older relatives, which interviewee said that half of their salary goes on caring for their mother?",
    answerable: true,
    facts: [["w17"]],
    citations: [CARE],
  },
  {
    // subgroup: when caregiving did not overlap with childcare, interviewees did not report fewer publications.
    id: "s20-care-publications-subgroup",
    kind: "lookup",
    question: "In the study of academics caring for older relatives, did caregiving reduce scientific publications when it did not overlap with childcare?",
    answerable: true,
    facts: [["did not", "didn't", "no decrease", "not report", "no reduction", "not reduce", "no,", "no."]],
    citations: [CARE],
  },
  // A conditional cash transfer and household food security in Akwa Ibom, Nigeria (PLoS One 2025).
  {
    // direction, sign: ATET −0.2610: benefiting households spend 26.10% less on food.
    id: "s21-cash-atet",
    kind: "lookup",
    question: "In the Akwa Ibom conditional cash transfer study, what was the average treatment effect on the treated for food consumption, and did benefiting households spend more or less on food?",
    answerable: true,
    facts: [["0.2610", "0.261", "26.10", "26.1"], ["less"]],
    citations: [CASH],
  },
  {
    // table: Table 4: training and empowerment ranked first, weighted mean 3.02.
    id: "s22-cash-top-benefit",
    kind: "lookup",
    question: "Which benefit of the Household Upliftment Programme did beneficiaries rank first, and with what weighted mean?",
    answerable: true,
    facts: [["training"], ["3.02"]],
    citations: [CASH],
  },
  {
    // group: monthly food spending N31,917.78 (benefiting) and N34,898.67 (non-benefiting).
    id: "s23-cash-spending",
    kind: "lookup",
    question: "In the Akwa Ibom cash transfer study, how much did benefiting and non-benefiting households spend on food per month on average?",
    answerable: true,
    facts: [["31,917", "31917"], ["34,898", "34898"]],
    citations: [CASH],
  },
  // Psycho-oncologists and patient deaths in Germany (Sci Rep 2025).
  {
    // number: an average of two patient deaths per month (the abstract), 2.2 (the results). Task defect fixed after the
    // first run: the fact had only the abstract's "two", and the model's right "2.2" failed (eval/socsci/README.md).
    id: "s24-onco-deaths",
    kind: "lookup",
    question: "On average, how many patient deaths per month did the psycho-oncologists in the German interview study experience?",
    answerable: true,
    facts: [["two", "2.2", "2 patient deaths", "2 deaths", "2 per month", "2 a month"]],
    citations: [ONCO],
  },
  {
    // who: "the only place you could go to be sad or indignant was the bathroom" (Interview 16).
    id: "s25-onco-bathroom-who",
    kind: "lookup",
    question: "In the psycho-oncologist interview study, which interview said that the only place you could go to be sad or indignant was the bathroom?",
    answerable: true,
    facts: [["16"]],
    citations: [ONCO],
  },
  // Social relationships of adults with multiple long-term conditions (Health Expect 2025).
  {
    // subgroup: older, retired participants or those with limited social ties relied more on acquaintances and groups.
    id: "s26-mltc-acquaintances",
    kind: "lookup",
    question: "In the interview study of adults with multiple long-term conditions, which participants appeared to rely more on acquaintances and social groups to reduce loneliness?",
    answerable: true,
    facts: [["older"], ["retired", "limited social ties", "limited ties", "fewer social ties"]],
    citations: [MLTC],
  },
  // The two interview transcripts (made up).
  {
    // who: the interviewer asked whether she felt excluded; Rosa said no, it was the rota.
    id: "s27-rosa-excluded",
    kind: "lookup",
    question: "In interview T01, did Rosa (P07) say she felt excluded by her neighbours in the residents' association?",
    answerable: true,
    facts: [["not excluded", "did not", "didn't", "no,", "no.", "not feel excluded", "was not"], ["rota", "shift"]],
    citations: [ROSA],
  },
  {
    // turn: in the second part of Rosa's long answer (a part that starts inside her turn): her view on the parking scheme was read out in February.
    id: "s28-rosa-noticeboard-turn",
    kind: "lookup",
    question: "According to Rosa in interview T01, what came of the online noticeboard for the residents' association that she suggested?",
    answerable: true,
    facts: [["parking"], ["february"]],
    citations: [ROSA],
  },
  {
    // who, contrast: Daniel did feel excluded by his neighbours, through the residents' group chat.
    id: "s29-daniel-excluded",
    kind: "lookup",
    question: "In interview T02, did Daniel (P12) feel excluded by his neighbours, and through what?",
    answerable: true,
    facts: [["chat"]],
    citations: [DANIEL],
  },
  {
    // turn: in a part that starts inside Daniel's long turn: at work he has a darts team.
    id: "s30-daniel-work-social-turn",
    kind: "lookup",
    question: "What does Daniel say in interview T02 about his social life at work?",
    answerable: true,
    facts: [["darts"]],
    citations: [DANIEL],
  },
  {
    // who: the interviewer suggested tiredness; Daniel said it is timing and getting there, not tiredness.
    id: "s31-daniel-tiredness",
    kind: "lookup",
    question: "In interview T02, does Daniel say that tiredness after night shifts is what keeps him from neighbourhood activities?",
    answerable: true,
    facts: [["timing", "getting there", "transport"]],
    citations: [DANIEL],
  },
  {
    // comparison: Rosa says the rota kept her away, not the people; Daniel felt shut out by the residents' group chat.
    id: "s33-transcripts-compared",
    kind: "comparison",
    question: "The two shift workers interviewed in T01 and T02 both talk about their residents' groups. What does each say kept them out: the people, or something else?",
    answerable: true,
    facts: [["rota", "shift"], ["chat"]],
    citations: [ROSA, DANIEL],
  },
  {
    // Task defect fixed after the first run: written as unanswerable (the study measured food security and investment,
    // not enrolment), but the paper reports, among the benefits beneficiaries named, that some who could not send their
    // children to school can now do so; the model found it. Now answerable, from that passage (eval/socsci/README.md).
    id: "s32-cash-no-enrolment",
    kind: "lookup",
    question: "What effect did the Household Upliftment Programme's conditional cash transfer in Akwa Ibom have on children's school enrolment?",
    answerable: true,
    facts: [["send their children to school", "school accessories", "exercise books"]],
    citations: [CASH],
  },
  {
    // not in the documents: Daniel never says how long he has lived on his street; Rosa has lived on her estate for eleven
    // years, and Daniel has been on nights for about five. Added after the first run, with s32's defect fix, and run on its own.
    id: "s34-daniel-no-years-on-street",
    kind: "unanswerable",
    question: "In interview T02, how many years has Daniel lived on his street?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

/** Read only as totals: never inspect these task by task. */
export const socsciHoldoutTasks: ResearchTask[] = [
  {
    id: "sh01-pharm-associate",
    kind: "lookup",
    question: "In the pharmacist trust survey, what adjusted odds ratio was reported for participants with an associate's degree or vocational certificate, compared with those who did not complete high school?",
    answerable: true,
    facts: [["3.472"]],
    citations: [PHARM],
  },
  {
    id: "sh02-pharm-benevolence",
    kind: "lookup",
    question: "In the pharmacist trust survey, by how much did the odds of willingness to engage in shared decision-making rise for each one-unit increase in trust in pharmacists' benevolence?",
    answerable: true,
    facts: [["78"]],
    citations: [PHARM],
  },
  {
    id: "sh03-ineq-gini",
    kind: "lookup",
    question: "In the Canadian income inequality study, what did the robustness check using the Gini coefficient find?",
    answerable: true,
    facts: [["not significant", "non-significant", "nonsignificant", "mixed", "not statistically significant"]],
    citations: [INEQ],
  },
  {
    id: "sh04-email-reply-rate",
    kind: "lookup",
    question: "What was the overall reply rate in the Bundestag email field experiment's summary statistics?",
    answerable: true,
    facts: [["0.676", "67.6"]],
    citations: [EMAIL],
  },
  {
    id: "sh05-brexit-binary-safety",
    kind: "lookup",
    question: "In the Brexit realignment paper's robustness checks, what coefficient and standard error does the binary seat safety measure have?",
    answerable: true,
    facts: [["0.1521"], ["0.0706"]],
    citations: [BREXIT],
  },
  {
    id: "sh06-brexit-2019-split",
    kind: "lookup",
    question: "In the 2019 election, how were Conservative MPs split between Remain and Leave?",
    answerable: true,
    facts: [["129"], ["225"]],
    citations: [BREXIT],
  },
  {
    id: "sh07-care-professional",
    kind: "lookup",
    question: "In the study of academics caring for older relatives, what share of women and of men said their profession was affected?",
    answerable: true,
    facts: [["83"], ["58"]],
    citations: [CARE],
  },
  {
    id: "sh08-care-abroad-who",
    kind: "lookup",
    question: "In the study of academics caring for older relatives, which interviewee said they no longer consider being a researcher abroad?",
    answerable: true,
    facts: [["w36"]],
    citations: [CARE],
  },
  {
    id: "sh09-onco-female",
    kind: "lookup",
    question: "What share of the psycho-oncologists interviewed in the German study were female?",
    answerable: true,
    facts: [["80"]],
    citations: [ONCO],
  },
  {
    id: "sh10-daniel-union",
    kind: "lookup",
    question: "In interview T02, what did Daniel's union get the night premium raised to?",
    answerable: true,
    facts: [["two pounds", "£2", "2 pounds", "£2.00"]],
    citations: [DANIEL],
  },
  {
    id: "sh11-rosa-rota-notice",
    kind: "lookup",
    question: "In interview T01, how far ahead does the hospital now give Rosa her rota?",
    answerable: true,
    facts: [["six weeks", "6 weeks"]],
    citations: [ROSA],
  },
  {
    id: "sh12-onco-no-mean-age",
    kind: "unanswerable",
    question: "What was the mean age of the psycho-oncologists interviewed in the German study?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
