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

RESULTS
