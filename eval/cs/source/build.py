#!/usr/bin/env python3
"""Builds the CS suite's documents (eval/cs/docs/*.md) from Europe PMC's full-text XML.

The converter is the clinical suite's (eval/clinical/source/jats2md.py), with one difference: displayed
equations are kept, each as the text of its symbols on a line of its own, as a PDF's text layer gives
them. Each article must be CC BY 4.0, or it is refused. Run from the repository root:

    python3 eval/cs/source/build.py            # downloads the XML of each PMCID below
    python3 eval/cs/source/build.py --xml DIR  # uses DIR/<PMCID>.xml instead

arXiv, where most CS papers are read, could not be reached where the suite was written, so these are
journal papers with their full text in Europe PMC.
"""

import sys

sys.dont_write_bytecode = True
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "clinical" / "source"))
import jats2md  # noqa: E402

# PMCID -> document file name (without .md). Order is the order of eval/cs/tasks.ts.
ARTICLES = {
    "PMC13667620": "fedcode-compression",
    "PMC13667722": "stabfl-label-skew",
    "PMC13709045": "fl-plant-disease-stabilization",
    "PMC13611767": "vcfedadam-verifiable",
    "PMC13517349": "fl-iiot-poisoning",
    "PMC13039868": "imflkd-incentive",
    "PMC13726990": "kd-intrusion-detection",
    "PMC13526670": "arabic-rag-noise",
    "PMC13269389": "longtail-entity-rag",
    "PMC13638623": "llm-bias-rule-induction",
}

if __name__ == "__main__":
    jats2md.FORMULAS = True
    jats2md.main(ARTICLES, Path(__file__).resolve().parent.parent / "docs")
