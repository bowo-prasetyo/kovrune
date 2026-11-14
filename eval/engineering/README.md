# Engineering suite

Questions over engineering documents (harness 0.68.0). The other suites' documents are Wikipedia leads, a software licence, Kovrune's own documentation, made-up Office files and clinical trial reports. None has a datasheet, a two-column paper, an SI prefix that changes a value a thousandfold, a negative temperature, or an abbreviation defined once and used after. An audit of Kovrune from an engineering researcher's point of view found that the sentence check passed errors of exactly these kinds ([engineering units, signs, powers of ten and changes, 0.67.0](../field/README.md#engineering-units-signs-powers-of-ten-and-changes-0670-defect-fix)), and that no suite could show how often. This suite can.

## Documents

Seven made-up documents about one product, a 3.3 kW power supply (`tasks.ts`). Openly licensed datasheets and test reports could not be downloaded where the suite was written, so the documents are written for it, as the research suite's LumenDB documents and the office suite's files are. They overlap on purpose: the paper's MOSFET is the datasheet's part, the test report checks the specification, and many numbers differ only by row, condition or sign.

| ID | File | Kind |
| --- | --- | --- |
| `sic-pfc-paper` | `docs/sic-pfc-paper.pdf` | Two-column journal paper, 2 pages |
| `kv1200m040-datasheet` | `docs/kv1200m040-datasheet.pdf` | Component datasheet, tables, 2 pages |
| `emc-test-report` | `docs/emc-test-report.md` | EMC test report |
| `tensile-tests-6061` | `docs/tensile-tests-6061.csv` | Tensile test data |
| `bracket-fea-memo` | `docs/bracket-fea-memo.md` | Structural analysis memo |
| `cooling-loop-spec` | `docs/cooling-loop-spec.txt` | Specification |
| `cooling-loop-test-report` | `docs/cooling-loop-test-report.md` | Qualification test report |

The two PDFs are written by `source/make_pdfs.py` (reportlab, `invariant=1`, so they rebuild byte for byte) and laid out as real ones are, since layout decides what pdf.js gives:
- the paper is set in two columns, with a running header and page number on every page; the datasheet has a header and footer on every page;
- the symbols Ω, −, θ come from a second font, as many PDFs take them from a symbol font, so pdf.js gives them as separate pieces: "40 m Ω", "− 8 V";
- subscripts and superscripts are smaller and shifted: "R DS(on)", "f sw", "10 − 6".

## Tasks

`engineering` (25 questions) may be looked at task by task while a change is developed; `engineeringholdout` (10) is read only as totals, like the other held-out suites. The questions and their facts were written from the documents before any model ran on them, and are not changed to fit a run. Each task notes its kinds: unit, sign, table, limit, change, abbreviation, and questions the documents do not answer. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right.

Run it with `--suites engineering,engineeringholdout`:

```bash
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites engineering,engineeringholdout --out eval/results/engineering-qwen3.5-4b-q4km.json
```

**Limits:** one author wrote the documents, the questions and the checks they test, and the documents are made up. Real datasheets and papers have more layouts than two, and more ways to set a formula.
