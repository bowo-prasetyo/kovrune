# Physics suite

Questions over physics documents (harness 0.91.0). An audit of Kovrune from a physicist's point of view (harness 0.90.0, [physics checks](../field/README.md#physics-siunitx-quantities-physics-units-and-opposites-0900-defect-fix)) found that the LaTeX converter dropped every unit written with siunitx, and that the sentence check passed a wrong unit prefix, a lower limit for an upper one, and an allowed mass for an excluded one. No suite had physics text, so neither what that fix gained nor how often such errors happen could be measured. This suite can, and its first runs found three more defects ([below](#results)).

## Documents

Six made-up documents (`tasks.ts`). They are written for the suite, as the engineering suite's are, so that they can be committed and so that their facts are known. They are set as real ones are, because how a document is written decides what Kovrune reads:

| ID | File | Kind | What makes it hard |
| --- | --- | --- | --- |
| `kagome-pdw-letter` | `docs/kagome-pdw-letter.tex` | REVTeX letter, condensed matter | siunitx with concise uncertainties (`\SI{0.75(3)}{\milli\electronvolt}`), a table of three samples, a numbered equation, the title set after `\begin{document}` |
| `zprime-dilepton` | `docs/zprime-dilepton.tex` | REVTeX paper, particle physics | hepunits (`13\,\TeV`), the paper's own macros with `\ensuremath` (`\ifb`, `\sqs`, `\Zpsi`), an asymmetric uncertainty, a lower mass limit next to an upper cross-section limit |
| `hubble-cepheids` | `docs/hubble-cepheids.tex` | AASTeX paper, cosmology | siunitx with `per-mode=symbol` and declared units (`\DeclareSIUnit\parsec{pc}`), a table of hosts, a significance in standard deviations |
| `rb87-bec-paper` | `docs/rb87-bec-paper.pdf` | Two-column journal paper, atomic physics | raised exponents (`2.0 × 10<sup>5</sup>`), an isotope's raised mass number, symbols from a second font, a running header |
| `dilution-fridge-commissioning` | `docs/dilution-fridge-commissioning.md` | Commissioning report | μW against mW, mK against K, a specification against a measurement |
| `pressure-transport` | `docs/pressure-transport.csv` | Table of measurements | a value by row and column, cells that say "none" |

The `.tex` files are read as an arXiv paper's source is, by the app's converter (`src/documents/latex.ts`, `siunitx.ts`; `eval/harness/field.ts`). The PDF is written by `source/make_pdfs.py` (reportlab, `invariant=1`, so it rebuilds byte for byte), as the engineering suite's are.

## Tasks

`physics` (26 questions) may be looked at task by task while a change is developed; `physicsholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the documents before any model ran on them, and are not changed to fit a run. Each task notes its kinds: unit, uncertainty, table, limit, order, equation, and questions the documents do not answer.

Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right. The scorer compares facts in lower case, where "meV" and "MeV" are one, so since 0.91.0 a task may also give **`casedFacts`**, compared in their case: the gap task needs "meV" or "millielectronvolt" and fails "MeV".

Run it with `--suites physics,physicsholdout`:

```bash
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites physics,physicsholdout --out eval/results/physics-qwen3.5-4b-q4km.json
```

**Limits:** one author wrote the documents, the questions and the checks they test, and the documents are made up. Real papers have more macros and packages, more layouts and longer derivations than these. The suite has no question that needs a derivation across sections, which a 4,096-token context and 2,400-character parts would not hold.

## Results

Qwen3.5-4B (Q4_K_M) in constrained mode, llama.cpp `fae9ac5` built portably (`-DGGML_NATIVE=OFF`), 4,096-token context, thinking off, on a 4-core cloud CPU: the engineering suite's setup. One run each, so a task that passes or fails once may not do so again.

| Run | Code | `physics` | `physicsholdout` | Labelled "Quotes found", wrong |
| --- | --- | --- | --- | --- |
| Before | 0.90.0, the suite only | 20/26 | 10/10 | 0 of 20 |
| After | 0.91.0 converter and number check | 19/26 | 10/10 | 0 of 22 |
| After, re-scored | 0.91.0 with the quote check and name digits | **23/26** | 10/10 | 0 of 23 |

Reports: `eval/results/physics-0.91-base-qwen3.5-4b-q4km.json` (before) and `physics-0.91-qwen3.5-4b-q4km.json` (after). The re-scored row is `npm run bench:rescore` on the after report; the quote and sentence checks run after the model's final answer, so re-scoring gives their exact effect.

The runs found four defects, all fixed in 0.91.0 ([field README](../field/README.md#physics-suite-pdf-exponents-latex-macros-and-math-in-quotes-0910)):

1. **PDF exponents were read as digits.** "2.0 × 10⁵ atoms" was "2.0 × 105 atoms", and "⁸⁷Rb" was "87Rb". Raised digits and signs are now superscripts (`src/documents/pdf-layout.ts`).
2. **A paper's `\ensuremath` macros lost their commands.** `\sqs` was "s = 13 TeV" for "√s = 13 TeV", and `\Zpsi` was "Z'_" (`latex.ts`).
3. **A REVTeX title was read twice**, as REVTeX sets `\title` after `\begin{document}`.
4. **Right answers failed their quote when they wrote LaTeX math another way.** The converter keeps inline math as written, and the model quoted `$\sigma B$` as "σB", `\mathrm{c}` as `\text{c}`, or `\text` with one backslash in its JSON, which arrives as a tab. Right answers failed this way three times in the before run (ph08, ph09, ph15) and four times in the after run (also ph01). The quote check now compares a quote that fails again with the math read out on both sides (`src/agent/evidence.ts`).

Re-scoring the after run also found a wrong answer the label would have passed once its quote verified: "an uncertainty of 4 nm" for 13.5(4) nm was backed as 5 − 1, the digits of the title's "CsKa3Sb5" and of "sample S1". Digits written right after a letter are no longer added or subtracted (`support.ts`).

What the number check gained (recommendation 3): in the before run, ph12 and ph13 answered "3.1σ" and "1.4σ" from quotes of `$3.1\sigma$`. They passed, but the number check could not read the quotes, so they did not take the label; read now, they do.

Still failing after re-scoring:

- **ph03** (2Δ/k_BT_c with its uncertainty): the model said the documents do not give it. The value is written in math, `$2\Delta/k_B\Tc = \num{7.6 +- 0.3}$`, and the model read the passage that says the ratio "stays within its uncertainty" instead.
- **ph04** (the coherence length): the answer reads 13.5(4) nm as "13.5 nm with an uncertainty of 4 nm". It fails, and is not labelled.
- **ph24** (the field of the first quench): the model said the report does not give it, though a list item says "First ramp: quench at 10.4 T".

None of the 23 labelled answers is wrong. The held-out set passed in full in both runs, so it cannot show a change. On the open set, the gain from 19 to 23 of 26 is the re-scoring of one recorded run, so it is exact for that run; the step from 20 (before) to 19 (after) is two runs of the model and within their noise.

Search alone (`npm run bench:retrieval -- --suites physics,physicsholdout`) finds every cited document for the 33 answerable tasks, 95.6% of the passages that answer them, and everything for 31 of the 33. It misses ph05's table row, whose column header is LaTeX (`$H_\mathrm{c2}(0)$`) and so does not match "upper critical field", and one of ph08's two passages.
