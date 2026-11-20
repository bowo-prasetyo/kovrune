// Questions over mathematics documents (harness 0.94.0): the kind a mathematician brings, which no other
// suite holds. An audit from a mathematician's point of view (docs/math-audit.md) found that the LaTeX
// converter dropped the heading of every theorem-like statement a paper declares under its own name
// (\newtheorem{conj}{Conjecture}), so a conjecture read as a plain statement, and numbered no statement,
// so a reference to Lemma 3.2 read "Lemma 3", the number of its section. No suite had mathematics, so
// neither the gain of the fix nor how often a model gets such questions wrong could be measured. This
// suite can.
//
// The four documents are made up, as the physics suite's are: two papers written as LaTeX source, as arXiv
// serves them, and read with the app's own converter (src/documents/latex.ts); lecture notes in Markdown;
// and a short note as a typeset PDF (source/make_pdfs.py). The LaTeX papers declare their statements as
// mathematics papers do: amsthm with the paper's own names and a counter shared through aliascnt, cleveref,
// thmtools with lettered main theorems, an open question with a counter of its own, hypotheses tagged
// (H1) and (H2), equations numbered within sections, and an appendix set with the appendix package. The
// documents overlap where real ones would: the lecture notes predate the Teller-set paper and give an
// older bound as the best known.
//
// The questions ask what a mathematician reading these asks, in kinds noted on each task:
// - status: whether a statement is proved, conjectured or open;
// - numbering: what a numbered statement says, or which ones a proof uses;
// - hypothesis: the conditions a result needs;
// - formula: a bound, an exponent or a constant, with its exact form;
// - and questions the documents do not answer.
//
// Two suites, as for the other fields: `math` may be looked at task by task while a change is developed;
// `mathholdout` is read only as totals. The questions and their facts were written from the documents
// before any model ran on them, and are not changed to fit a run. Scoring is the research suite's
// (eval/harness/scoring.ts).

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/math/docs/. The .tex files are read as an arXiv source is (eval/harness/field.ts). */
export const mathDocuments: FieldDocument[] = [
  { id: "teller-sets", title: "Teller sets in finite abelian groups (Marlow and Odum, made up)", file: "teller-sets.tex" },
  { id: "odum-flow", title: "Decay and blow-up for the fractional Odum flow (Ferreira-Hahn, made up)", file: "odum-flow.tex" },
  { id: "additive-combinatorics-lecture-7", title: "Additive Combinatorics, Lecture 7: Teller sets (lecture notes, 2023, made up)", file: "additive-combinatorics-lecture-7.md" },
  { id: "ishikawa-note", title: "A note on Ishikawa numbers (J. Combin. Notes, made up)", file: "ishikawa-note.pdf" },
  // Harness 0.100.0: two long proofs, each over several parts, both with a "Step 3", for the proof notes of chunk.ts.
  { id: "vasquez-colourings", title: "Vasquez colourings of hypergraphs (Vasquez, made up)", file: "vasquez-colourings.tex" },
];

const TELLER = ["teller-sets"];
const ODUM = ["odum-flow"];
const NOTES = ["additive-combinatorics-lecture-7"];
const ISHIKAWA = ["ishikawa-note"];
const VASQUEZ = ["vasquez-colourings"];

/** "At least k" as answers write it: "≥ 7", "\geq 7", ">= 7", "at least 7", "7 or more". */
const atLeast = (k: number) => [`≥ ${k}`, `≥${k}`, `\\geq ${k}`, `\\ge ${k}`, `>= ${k}`, `least ${k}`, `than or equal to ${k}`, `${k} or more`, `${k} or larger`, `${k} or greater`, `${k} and above`, `${k} and larger`];
/** Wording that a statement is not proved: it is conjectured, open or unknown. */
const NOT_PROVED = ["conjecture", "not proved", "not proven", "unproven", "open", "not known", "unknown", "do not know", "does not know"];

export const mathTasks: ResearchTask[] = [
  // The Teller-set paper (LaTeX, amsthm with its own names, aliascnt, cleveref, an appendix).
  {
    // status: Conjecture 1.4, not a theorem; the paper proves only |A| ≤ p/4 + 3.
    id: "ma01-fifth-conjecture",
    kind: "lookup",
    question: "Does the Teller-set paper prove that the largest Teller set in Z/pZ has (1/5 + o(1))p elements?",
    answerable: true,
    facts: [["conjecture"]],
    citations: [TELLER],
  },
  {
    // hypothesis: Theorem 1.1 needs p ≥ 7.
    id: "ma02-main-hypothesis",
    kind: "lookup",
    question: "For which primes p does the Teller-set paper prove that every Teller set in Z/pZ has at most p/4 + 3 elements?",
    answerable: true,
    facts: [atLeast(7)],
    citations: [TELLER],
  },
  {
    // numbering: the proof of Theorem 1.1 uses Lemmas 3.1 and 3.2, not Proposition 3.3. Before 0.94.0 all three read "3".
    id: "ma03-proof-lemmas",
    kind: "lookup",
    question: "Which two lemmas does the proof of Theorem 1.1 in the Teller-set paper use?",
    answerable: true,
    facts: [["Lemma 3.1", "Lemmas 3.1"], ["3.2"]],
    citations: [TELLER],
  },
  {
    // numbering: Lemma A.1, in the appendix, is M_n ≤ 4.6812^n / 3.
    id: "ma04-lemma-a1",
    kind: "lookup",
    question: "What does Lemma A.1 of the Teller-set paper state?",
    answerable: true,
    facts: [["4.6812"], ["/ 3", "/3", "over 3", "divided by 3", "third"]],
    citations: [TELLER],
  },
  {
    // formula, hypothesis: Theorem 1.2, 4.6812^n for every n ≥ 3.
    id: "ma05-f5-bound",
    kind: "lookup",
    question: "What upper bound does the Teller-set paper prove for Teller sets in F_5^n, and for which n does it hold?",
    answerable: true,
    facts: [["4.6812"], [...atLeast(3), "n > 2"]],
    citations: [TELLER],
  },
  {
    // status, hypothesis: Remark 3.4, "We do not know whether Theorem 1.1 holds for p = 5."
    id: "ma06-p5",
    kind: "lookup",
    question: "Does the main theorem of the Teller-set paper hold for p = 5?",
    answerable: true,
    facts: [["not know", "unknown", "not known", "open", "unclear", "undecided", "not settled"]],
    citations: [TELLER],
  },
  {
    // status: Question 1, which the authors expect to have a positive answer but cannot prove.
    id: "ma07-question-monotone",
    kind: "lookup",
    question: "Is it known whether the sequence τ(F_5^n)^{1/n} is increasing in n?",
    answerable: true,
    facts: [["question 1", "no proof", ...NOT_PROVED]],
    citations: [TELLER],
  },
  {
    // numbering: equation (2.1), numbered within its section; before 0.94.0 it read (2).
    id: "ma08-count-equation",
    kind: "lookup",
    question: "Which numbered equation of the Teller-set paper gives the number of solutions of a + b + c = 3d in a set A?",
    answerable: true,
    facts: [["2.1"]],
    citations: [TELLER],
  },
  // The Odum-flow paper (LaTeX, thmtools, lettered main theorems, tagged hypotheses).
  {
    // formula: (1 + t)^{-(d-2s)/(4s)}, equation (1.3) in Theorem A.
    id: "ma09-decay-rate",
    kind: "lookup",
    question: "At what rate does the L² norm of a small solution of the fractional Odum flow decay, according to Theorem A?",
    answerable: true,
    facts: [["d-2s", "d - 2s", "d−2s", "d − 2s"], ["4s"]],
    citations: [ODUM],
  },
  {
    // formula: q_* = 1 + 4s/(d+2), equation (1.2).
    id: "ma10-critical-exponent",
    kind: "lookup",
    question: "What is the critical exponent q_* of the fractional Odum flow?",
    answerable: true,
    facts: [["4s/(d+2)", "4s/(d + 2)", "4s / (d+2)", "4s / (d + 2)", "\\frac{4s}{d+2}", "4s/(2+d)"]],
    citations: [ODUM],
  },
  {
    // status: Conjecture 5.3; the abstract says the critical case remains open.
    id: "ma11-critical-case",
    kind: "lookup",
    question: "Does the Odum-flow paper prove that solutions blow up at the critical exponent q = q_*?",
    answerable: true,
    facts: [NOT_PROVED],
    citations: [ODUM],
  },
  {
    // hypothesis: 1/2 < s < 1 in both main theorems.
    id: "ma12-s-range",
    kind: "lookup",
    question: "For which values of s do Theorems A and B of the Odum-flow paper hold?",
    answerable: true,
    facts: [["1/2", "\\frac{1}{2}", "½", "0.5"]],
    citations: [ODUM],
  },
  {
    // numbering: Lemma 3.3, the Nash-type inequality; before 0.94.0 it read "Lemma 3".
    id: "ma13-nash-lemma",
    kind: "lookup",
    question: "Which lemma of the Odum-flow paper fails for s ≤ 1/2?",
    answerable: true,
    facts: [["Lemma 3.3"]],
    citations: [ODUM],
  },
  {
    // hypothesis: (H2), the L^{d/(2s)} norm of V below 1/8.
    id: "ma14-h2",
    kind: "lookup",
    question: "What smallness condition does assumption (H2) of the Odum-flow paper put on the potential V?",
    answerable: true,
    facts: [["1/8", "\\frac{1}{8}", "0.125", "one eighth", "one-eighth"]],
    citations: [ODUM],
  },
  {
    // hypothesis: Theorem B needs only (H1).
    id: "ma15-theorem-b-assumptions",
    kind: "lookup",
    question: "Which assumptions on the potential does Theorem B of the Odum-flow paper need?",
    answerable: true,
    facts: [["H1"]],
    citations: [ODUM],
  },
  // The lecture notes (Markdown), older than the Teller-set paper.
  {
    // formula: Proposition 7.3, τ(F_5^n) ≥ 2^n from {0, 1}^n.
    id: "ma16-notes-lower-bound",
    kind: "lookup",
    question: "What lower bound for τ(F_5^n) do the lecture notes prove, and with which set?",
    answerable: true,
    facts: [["2^n", "2ⁿ"], ["{0, 1}", "{0,1}", "0 or 1", "0 and 1"]],
    citations: [NOTES],
  },
  {
    // the notes call Kessler's 4.8100^n the best known bound; the later paper improves it to 4.6812^n.
    id: "ma17-best-upper-bound",
    kind: "contradiction",
    question: "What is the best known upper bound for the size of a Teller set in F_5^n?",
    answerable: true,
    facts: [["4.6812"]],
    citations: [TELLER],
  },
  {
    // Example 7.2: τ(Z/7Z) = 3.
    id: "ma18-tau-z7",
    kind: "lookup",
    question: "How many elements does the largest Teller set in Z/7Z have?",
    answerable: true,
    facts: [["= 3", "is 3", "three", "3 elements", "size 3", "of 3"]],
    citations: [NOTES],
  },
  // The Ishikawa note (PDF).
  {
    // table: I(6) = 34, next to 23 and 47.
    id: "ma19-i6",
    kind: "lookup",
    question: "What is the Ishikawa number I(6)?",
    answerable: true,
    facts: [["34"]],
    citations: [ISHIKAWA],
  },
  {
    // status, table: not known; a search ruled out every N < 60.
    id: "ma20-i8",
    kind: "lookup",
    question: "What is known about the Ishikawa number I(8)?",
    answerable: true,
    facts: [["60"]],
    citations: [ISHIKAWA],
  },
  {
    // status: Conjecture 4; Theorem 2 proves only the upper bound.
    id: "ma21-ishikawa-conjecture",
    kind: "lookup",
    question: "Is it proved that I(k) = k² − 2 for every k ≥ 5?",
    answerable: true,
    facts: [NOT_PROVED],
    citations: [ISHIKAWA],
  },
  {
    // hypothesis: Remark 5, I(3) = 9 > 7, so the bound fails for k = 3.
    id: "ma22-k3",
    kind: "lookup",
    question: "Does the bound I(k) ≤ k² − 2 of the Ishikawa note hold for k = 3?",
    answerable: true,
    facts: [["9"], ["7"]],
    citations: [ISHIKAWA],
  },
  // The Vasquez paper (LaTeX, harness 0.100.0): two proofs that each run over several parts, both with a "Step 3".
  // A part that starts inside a proof says whose only through chunk.ts's note, so these measure it.
  {
    // proof across parts: Step 3 of Theorem 4.1's proof needs the constant 12; Step 3 of Theorem 3.1's needs 37.
    id: "ma25-step3-constant",
    kind: "lookup",
    question: "Which constant does Step 3 of the proof of Theorem 4.1 in the Vasquez paper say is needed?",
    answerable: true,
    facts: [["12"]],
    citations: [VASQUEZ],
  },
  {
    // proof across parts: Step 3 of Theorem 3.1's proof applies Lemma 2.3; Theorem 4.1's applies Lemma 2.2.
    id: "ma26-step3-lemma",
    kind: "lookup",
    question: "Which lemma does Step 3 of the proof of Theorem 3.1 in the Vasquez paper apply?",
    answerable: true,
    facts: [["Lemma 2.3"]],
    citations: [VASQUEZ],
  },
  {
    // unanswerable: no document gives τ(Z/13Z).
    id: "ma23-tau-z13",
    kind: "unanswerable",
    question: "What is τ(Z/13Z), the largest size of a Teller set in Z/13Z?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    // unanswerable: the paper covers only 1/2 < s < 1 and gives no blow-up time.
    id: "ma24-blowup-time",
    kind: "unanswerable",
    question: "How long does a solution of the fractional Odum flow with s = 1/4 take to blow up?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

export const mathHoldoutTasks: ResearchTask[] = [
  {
    id: "mah01-product-bound",
    kind: "lookup",
    question: "What bound does the Teller-set paper give for Teller sets in Z/pZ × F_5^n?",
    answerable: true,
    facts: [["4.6812"], ["p/4", "p / 4"]],
    citations: [TELLER],
  },
  {
    id: "mah02-fourier",
    kind: "lookup",
    question: "How large a nontrivial Fourier coefficient must a Teller set of density α in Z/pZ have, according to the Teller-set paper?",
    answerable: true,
    facts: [["α", "alpha"], ["/ 2", "/2", "half"]],
    citations: [TELLER],
  },
  {
    id: "mah03-local-time",
    kind: "lookup",
    question: "How long is the existence time in Theorem 4.1 of the Odum-flow paper at least?",
    answerable: true,
    facts: [["1-q", "1 - q", "1−q", "1 − q"]],
    citations: [ODUM],
  },
  {
    id: "mah04-energy-proposition",
    kind: "lookup",
    question: "Which proposition of the Odum-flow paper uses the smallness assumption (H2)?",
    answerable: true,
    facts: [["Proposition 4.2"]],
    citations: [ODUM],
  },
  {
    id: "mah05-exercise",
    kind: "lookup",
    question: "Which exercise of Lecture 7 asks for a Teller set of size 5 in F_5^2?",
    answerable: true,
    facts: [["7.7"]],
    citations: [NOTES],
  },
  {
    id: "mah06-ishikawa-lower",
    kind: "lookup",
    question: "What lower bound for I(k) does the Ishikawa note prove, and for which k?",
    answerable: true,
    facts: [["2k"], atLeast(3)],
    citations: [ISHIKAWA],
  },
  {
    id: "mah07-ishikawa-gap",
    kind: "lookup",
    question: "By how much do the upper and lower bounds for I(k) in the Ishikawa note differ?",
    answerable: true,
    facts: [["2k − 2", "2k - 2", "2k−2", "2(k − 1)", "2(k-1)", "2(k - 1)"]],
    citations: [ISHIKAWA],
  },
  {
    id: "mah08-kessler",
    kind: "lookup",
    question: "Whose earlier bound for Teller sets in F_5^n does the Teller-set paper improve, and what was that bound?",
    answerable: true,
    facts: [["Kessler"], ["4.81"]],
    citations: [TELLER],
  },
  {
    id: "mah09-computer-range",
    kind: "lookup",
    question: "For which n was the estimate of Lemma A.1 in the Teller-set paper checked by computer?",
    answerable: true,
    facts: [["40"]],
    citations: [TELLER],
  },
  {
    id: "mah11-step2-lemma",
    kind: "lookup",
    question: "Which lemma does Step 2 of the proof of Theorem 4.1 in the Vasquez paper apply?",
    answerable: true,
    facts: [["Lemma 2.2"]],
    citations: [VASQUEZ],
  },
  {
    id: "mah10-numerics-year",
    kind: "unanswerable",
    question: "In which year was the fractional Odum flow first solved numerically?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
