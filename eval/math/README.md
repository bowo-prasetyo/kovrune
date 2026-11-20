# Mathematics suite

Questions over mathematics documents (harness 0.94.0). An audit of Kovrune from a mathematician's point of view ([`docs/math-audit.md`](../../docs/math-audit.md)) found that the LaTeX converter dropped the heading of every theorem-like statement a paper declares under its own name, so a conjecture read as a plain statement, and numbered no statement, so a reference to Lemma 3.2 read "Lemma 3". The 0.94.0 converter fixes both ([field README](../field/README.md#mathematics-theorem-like-statements-numbered-as-amsthm-numbers-them-0940-defect-fix)). No suite had mathematics, so neither what that fix gains on answers nor how often a model gets such questions wrong could be measured. This suite can.

## Documents

Four made-up documents (`tasks.ts`), written for the suite as the physics suite's are, so that they can be committed and their facts are known. Their objects (Teller sets, the Odum flow, Ishikawa numbers) and results are invented, so a model cannot answer from memory. They are set as real ones are, because how a document is written decides what Kovrune reads:

| ID | File | Kind | What makes it hard |
| --- | --- | --- | --- |
| `teller-sets` | `docs/teller-sets.tex` | amsart paper, combinatorics | statements under the paper's own names (`thm`, `lem`, `conj`), counters shared through aliascnt, cleveref references, a conjecture next to the theorems, an open question with a counter of its own, equations numbered within sections, an appendix set with the appendix package |
| `odum-flow` | `docs/odum-flow.tex` | article, analysis of PDEs | thmtools environments sharing one counter, main theorems lettered A and B by `\renewcommand{\themain}{\Alph{main}}`, hypotheses tagged (H1) and (H2), exponents as fractions in math (`(1 + t)^{-\frac{d-2s}{4s}}`) |
| `additive-combinatorics-lecture-7` | `docs/additive-combinatorics-lecture-7.md` | Lecture notes | older than the paper: they call a bound the paper improves "the best known" |
| `ishikawa-note` | `docs/ishikawa-note.pdf` | Typeset note | bold statement headings with italic text, relation symbols from a second font, raised exponents (k²), a table with a value not known |

The `.tex` files are read as an arXiv paper's source is, by the app's converter (`src/documents/latex.ts`; `eval/harness/field.ts`). The PDF is written by `source/make_pdfs.py` (reportlab, `invariant=1`, so it rebuilds byte for byte).

## Tasks

`math` (24 questions) may be looked at task by task while a change is developed; `mathholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the documents before any model ran on them, and are not changed to fit a run. Each task notes its kinds:

- **status:** whether a statement is proved, conjectured or open ("Does the paper prove …?", where it only conjectures it);
- **numbering:** what a numbered statement says, or which ones a proof uses;
- **hypothesis:** the conditions a result needs (p ≥ 7, 1/2 < s < 1, (H2));
- **formula:** a bound, an exponent or a constant in its exact form;
- and questions the documents do not answer.

Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right. A status question's facts are words for "not proved" ("conjecture", "open", "not known"), so an answer that says the paper proves a conjecture fails.

Run it with `--suites math,mathholdout`:

```bash
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites math,mathholdout --out eval/results/math-qwen3.5-4b-q4km.json
```

**Limits:** one author wrote the documents, the questions and the converter they test, and the documents are made up and short. Real papers are longer, have more macros, and prove their results across many parts; this suite has no question that needs a proof followed across sections, which a 4,096-token context and 2,400-character parts would not hold (audit M7). A status question's facts can't tell "it is not a conjecture" from "it is a conjecture"; the reports are read for such answers.

## Results

Qwen3.5-4B (Q4_K_M) in constrained mode, llama.cpp `fae9ac5` built portably (`-DGGML_NATIVE=OFF`), 4,096-token context, thinking off, on a 4-core cloud CPU (Intel Xeon @ 2.10GHz): the physics suite's setup. One run each, so a task that passes or fails once may not do so again.

| Run | Code | `math` | `mathholdout` | Labelled "Quotes found", wrong |
| --- | --- | --- | --- | --- |
| Before | 0.93.0 converter, the suite only | 9/24 | 4/10 | 0 of 7 |
| After | 0.94.0 converter | 11/24 | 5/10 | 0 of 8 |
| Quotes of math | 0.95.0 quote check | **16/24** | **6/10** | 2 of 14 (see below) |

Reports: `eval/results/math-0.94-base-qwen3.5-4b-q4km.json` (before) and `math-0.94-qwen3.5-4b-q4km.json` (after). The 0.95.0 run: `math-0.95-qwen3.5-4b-q4km.json`.

**What the fix changed.** Four open tasks differ in a way the converter explains:
- **ma08** (which equation counts the solutions): before, "Equation (2)", the old global number; after, "(2.1)", which passes.
- **ma13** (which lemma fails for s ≤ 1/2): before, "Lemma (6)", the paper's equation number taken for the lemma's; after, "Lemma 3.3", which passes.
- **ma04** (what Lemma A.1 states) and **ma07** (whether Question 1 is settled): before, the model said the documents do not contain Lemma A.1, or the question, as neither had a heading; after, it found and quoted both and answered right, and both fail only on the quote check (below).

ma10 and ma17 passed after and failed before, and ma02 and ma15 the other way, with the same passages: these are two runs of the model and within their noise. So the two gains that need the fix are the fix's, and the two other tasks it reached are held back by the quote check. None of the labelled answers is wrong in either run.

**What still fails, after.** Of the 13 open failures, 9 answers are right in substance:
- **The quote check fails six right answers** (ma02, ma03, ma04, ma05, ma07, ma15). The model quotes the paper's math in another form outside `$…$`: ">=" or "≥" for `\geq`, "∩" for `\cap`, "|A|^2" without the dollars, a quote across two paragraphs. This is the audit's M4, and more than it described: reading a quote as math when it has a symbol like "≥" recovers none of them (a check on the recorded quotes), because the quote mixes LaTeX, ASCII and Unicode. ma15 also names (H1) only by its content, "V ≥ 0 and V ∈ L^{d/(2s)}", so it fails its fact too.
- **A right "No" is reported as not found** (ma01, ma11, ma20): to "Does the paper prove …?" the model answers "No, the paper only conjectures it" and sets `found` to false. ma20's answer, "I(8) is not known; I(8) ≥ 60", is right and marked not found the same way.
- **Four are wrong:** ma06 says the documents do not say whether p = 5 is covered, having read only the part before Remark 3.4; ma18 works out a bound from Theorem 1.1 instead of reading the lecture notes' τ(Z/7Z) = 3; ma22 says the bound holds for k = 3, against Remark 5; and ma23, unanswerable, answers "10". None is labelled.

**The sentence check rarely backs a right mathematical answer.** Of the 11 passes, 4 take **Quotes found**; most others verify their quote but have 0 of 1 sentence backed, because the sentence writes in Unicode the math its quote has in LaTeX ("1 + 4s/(d+2)" against `\frac{4s}{d+2}`), and the word check does not read math. That is safe, with no wrong labels, but hides right answers; reading math on both sides of the sentence check is the same change as the quote check's.

What the runs say to do next, in order: compare quotes and sentences with math normalised on both sides (LaTeX commands, ASCII and Unicode relations, scripts outside `$`), which six right answers wait for; and tell the model that a "No" or "not known" it can quote is an answer it found.

Search alone (`npm run bench:retrieval`) finds every cited document and every answering passage for the 31 answerable tasks. ma06's failure is the model's: it read one part and stopped, though search finds Remark 3.4's part.

### Quotes of math in any common form (0.95.0)

The 0.95.0 quote check compares quotes and sources with math written alike, however the model writes it ([field README](../field/README.md#quotes-of-math-in-any-common-form-0950-defect-fix)). On the same machine and build, the model gave the same answers as in the 0.94.0 run on all 24 open tasks; only how they were checked changed.

- **Five open tasks pass that failed:** ma02, ma03, ma04, ma05 and ma07, five of the six right answers held back by the quote check. Four take **Quotes found**. The sixth, ma15, verifies its quote but still fails its fact: it gives (H1)'s content without naming it.
- **The held-out set** passes 6 of 10, from 5.
- **Two answers the scorer counts wrong take Quotes found:**
  - **ma15** (open): "Theorem B … assumes that the potential V satisfies V ≥ 0 and V ∈ L^{d/(2s)}(R^d)". That is assumption (H1), which the task's fact asks for by name; right in substance.
  - **mah01** (held out): asked for the bound in Z/pZ × F₅ⁿ, the answer gives Theorem 1.2's bound in F₅ⁿ, quoted word for word. The quote is real and the sentence true, but it answers another question. The model's own check said "yes" and its cross-check agreed, so nothing after the quote check caught it. Before 0.95.0 its quote failed ("n >= 3" for `$n \geq 3$`), which kept the label off by accident.

**Against the rule for label changes** (no right answer loses its label, and false reassurance does not rise): no right answer loses its label anywhere, but held-out false reassurance on this suite goes from 0 of 4 to 1 of 5. The new label is wrong because the answer is off the question, which a quote check cannot see; the same answer with a quote typed in LaTeX would have taken the label before. Whether to adopt the change with this, or first make the label ask whether the answer gives what the question asks for (the completeness check, which runs for Qwen3.5-2B only), is the project owner's decision. The run is recorded either way.

Still failing on the open set, all as before: three right "No" answers reported as not found (ma01, ma11, ma20), ma06, ma18, ma22 and ma23 wrong, and ma15's fact.

### The question's formula, quoted "no" answers, and formulas, quantifiers and status (0.96.0)

Three changes ([field README](../field/README.md#the-questions-formula-quoted-no-answers-and-formulas-quantifiers-and-status-0960)): an answer is labelled only if it or its quotes have the formula the question asks about; a "not found" answer that comes with quotes is asked once whether they answer the question; and the sentence check reads formulas, quantifiers and status. Report: `eval/results/math-0.96-qwen3.5-4b-q4km.json`, re-scored with the final code.

| Code | `math` | `mathholdout` | Labelled "Quotes found", wrong |
| --- | --- | --- | --- |
| 0.95.0 | 16/24 | 6/10 | 1 of 9 open, 1 of 5 held out |
| **0.96.0** | **19/24** | **6/10** | 1 of 10 open, **0 of 4 held out** |

- **ma01, ma11 and ma20 pass.** In each, the model answered "no", "not proved" or "not known" with the quote that says so and set `found` to false; asked once, it set it to true.
- **mah01 is no longer labelled**: its question asks about Z/pZ × F₅ⁿ, and neither the answer nor its quote has it. Held-out false reassurance on this suite is back to 0.
- The labelled wrong answer left, **ma15**, is right in substance: it gives assumption (H1)'s content without naming it.

Still failing on the open set: ma06 (says the documents do not say whether p = 5 is covered), ma15's fact, ma18 (works out a bound instead of reading the notes), ma22 (says the bound holds for k = 3) and ma23 (answers the unanswerable τ(Z/13Z)). None is labelled.
