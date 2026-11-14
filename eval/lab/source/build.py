#!/usr/bin/env python3
"""Builds the lab suite's documents (eval/lab/docs/*.md) from Europe PMC's full-text XML.

The converter is the clinical suite's (eval/clinical/source/jats2md.py), with displayed equations kept as
the CS suite keeps them (an enzyme's rate law, a dose calculation), each as the text of its symbols on a
line of its own, as a PDF's text layer gives them. Each article must be CC BY 4.0, or it is refused. Run
from the repository root:

    python3 eval/lab/source/build.py            # downloads the XML of each PMCID below
    python3 eval/lab/source/build.py --xml DIR  # uses DIR/<PMCID>.xml instead
"""

import sys

sys.dont_write_bytecode = True
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "clinical" / "source"))
import jats2md  # noqa: E402

# PMCID -> document file name (without .md). Order is the order of eval/lab/tasks.ts.
ARTICLES = {
    "PMC12530801": "il10-tolerance-birds",
    "PMC12221382": "ppara-brown-adipocytes",
    "PMC12607837": "meca-daptomycin-tolerance",
    "PMC10359620": "scml2-sperm-chromatin",
    "PMC11101011": "alk-postn-neuroblastoma",
    "PMC11101172": "fmrp-map1b-migration",
    "PMC12047791": "zebrafish-seizure-zinc",
    "PMC12926040": "adp-ribose-methanol-dehydrogenase",
    "PMC11847077": "cabozantinib-p53-y220c",
    "PMC10152677": "aba-stomata-hydrogen-peroxide",
}

if __name__ == "__main__":
    jats2md.FORMULAS = True
    jats2md.main(ARTICLES, Path(__file__).resolve().parent.parent / "docs")
