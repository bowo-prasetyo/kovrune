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

(to come)
