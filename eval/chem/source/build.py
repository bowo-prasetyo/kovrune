#!/usr/bin/env python3
"""Builds the chemistry suite's documents (eval/chem/docs/*.md) from Europe PMC's full-text XML.

The converter is the clinical suite's (eval/clinical/source/jats2md.py), with displayed equations kept as
the CS and lab suites keep them, each as the text of its symbols on a line of its own. Each article must be
CC BY 4.0, or it is refused. Run from the repository root:

    python3 eval/chem/source/build.py            # downloads the XML of each PMCID below
    python3 eval/chem/source/build.py --xml DIR  # uses DIR/<PMCID>.xml instead
"""

import sys

sys.dont_write_bytecode = True
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "clinical" / "source"))
import jats2md  # noqa: E402

# PMCID -> document file name (without .md). Order is the order of eval/chem/tasks.ts.
ARTICLES = {
    "PMC11744694": "nickel-fluorobenzofuran-coupling",
    "PMC10509543": "nickel-photoredox-hydroxytrifluoroethylation",
    "PMC11610484": "propargylation-biisoquinoline-dioxide",
    "PMC12302481": "photoredox-isonitrile-arylation",
    "PMC11181280": "polyaza-helicene-photoredox",
    "PMC11190262": "copper-step-edges-co2-reduction",
    "PMC11212130": "porphyrin-aggregation-co2-reduction",
    "PMC11514440": "frustrated-lewis-pairs-co2-capture",
}

if __name__ == "__main__":
    jats2md.FORMULAS = True
    jats2md.main(ARTICLES, Path(__file__).resolve().parent.parent / "docs")
