"""Writes eval/math/docs/ishikawa-note.pdf, the mathematics suite's PDF (eval/math/README.md).

    python3 eval/math/source/make_pdfs.py

A made-up note set as a journal sets a short mathematics paper, as the physics suite's PDF is
(eval/physics/source/make_pdfs.py), because how a PDF is set decides what pdf.js gives:
- one column, with a running header and page numbers;
- each statement's heading in bold and its text in italics, "Theorem 2. For every k ≥ 5, …", as amsthm sets them;
- relation symbols (≤, ≥, −, ⋯) from a second font, so pdf.js gives them as separate pieces of text;
- exponents and subscripts set smaller and raised or lowered: "k<super>2</super>", "x<sub>1</sub>";
- a table of computed values, one of them not known.

Needs reportlab (pip install reportlab) and the DejaVu Sans font. invariant=1 keeps the file the same
from run to run, so it can be committed and rebuilt.
"""

import os
from reportlab import rl_config
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table

rl_config.invariant = 1
pdfmetrics.registerFont(TTFont("Sym", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
OUT = os.path.join(os.path.dirname(__file__), "..", "docs")


def sym(text):
    """Symbols in the symbol font, as a PDF made by a typesetting system often has them."""
    for ch in "−≤≥⋯∈≠∎":
        text = text.replace(ch, f'<font name="Sym">{ch}</font>')
    return text


BODY = ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, leading=13, spaceAfter=6, alignment=4)
HEAD = ParagraphStyle("head", parent=BODY, fontName="Times-Bold", spaceBefore=6, alignment=0)
TITLE = ParagraphStyle("title", fontName="Times-Bold", fontSize=15, leading=18, alignment=1, spaceAfter=6)
AUTH = ParagraphStyle("auth", fontName="Times-Roman", fontSize=10.5, leading=13, alignment=1, spaceAfter=10)
ABS = ParagraphStyle("abs", parent=BODY, fontSize=9.5, leading=11.5, leftIndent=0.5 * inch, rightIndent=0.5 * inch)
CAP = ParagraphStyle("cap", parent=BODY, fontSize=9, leading=11, alignment=1)
CELL = ParagraphStyle("cell", fontName="Times-Roman", fontSize=9.5, leading=11, alignment=1)


def P(text, style=BODY):
    return Paragraph(sym(text), style)


def statement(head, text):
    """A statement as amsthm sets it: the heading in bold, the text in italics."""
    return P(f"<b>{head}</b> <i>{text}</i>")


def note():
    W, H = letter
    m = 1.1 * inch

    def furniture(c, doc):
        c.setFont("Times-Roman", 8)
        c.drawString(m, H - 0.6 * inch, "J. COMBIN. NOTES 7 (2026), 113–117 — MADE UP")
        c.drawRightString(W - m, H - 0.6 * inch, str(doc.page))

    doc = SimpleDocTemplate(os.path.join(OUT, "ishikawa-note.pdf"), pagesize=letter, leftMargin=m, rightMargin=m, topMargin=m, bottomMargin=m, title="A note on Ishikawa numbers", author="Made-up authors")
    s = [
        P("A NOTE ON ISHIKAWA NUMBERS", TITLE),
        P("SORA ISHIKAWA AND PETRA LUND", AUTH),
        P("<b>Abstract.</b> For k ≥ 3, the Ishikawa number I(k) is the least N such that every colouring of {1, …, N} with two colours contains a monochromatic solution of x<sub>1</sub> + ⋯ + x<sub>k−1</sub> = 2x<sub>k</sub>. We compute I(k) for k ≤ 7, prove that I(k) ≤ k<super>2</super> − 2 for every k ≥ 5 and that I(k) ≥ k<super>2</super> − 2k for every k ≥ 3, and conjecture that the upper bound is sharp.", ABS),
        Spacer(1, 6),
        P("1. INTRODUCTION", HEAD),
        P("Rado's theorem tells which linear equations have a monochromatic solution in every finite colouring of the positive integers. For a partition regular equation one then asks for the least N that forces a monochromatic solution in {1, …, N} with a given number of colours. These numbers are known for few equations. In this note we study the family"),
        P("x<sub>1</sub> + x<sub>2</sub> + ⋯ + x<sub>k−1</sub> = 2x<sub>k</sub>,          (1)", CAP),
        P("for k ≥ 3, with two colours. The variables need not be distinct."),
        statement("Definition 1.", "For k ≥ 3, the Ishikawa number I(k) is the least N such that every colouring of {1, …, N} with two colours contains a monochromatic solution of (1)."),
        P("2. RESULTS", HEAD),
        P("We computed the first values with a SAT solver in 2025. They are given in Table 1."),
        P("TABLE 1. Ishikawa numbers for small k", CAP),
        Table(
            [[P(c, CELL) for c in row] for row in [["k", "3", "4", "5", "6", "7", "8"], ["I(k)", "9", "14", "23", "34", "47", "not known (≥ 60)"]]],
            colWidths=[0.6 * inch] * 6 + [1.4 * inch],
            style=[("LINEBELOW", (0, 0), (-1, 0), 0.5, "black"), ("LINEAFTER", (0, 0), (0, -1), 0.5, "black")],
        ),
        Spacer(1, 8),
        P("For 5 ≤ k ≤ 7 the values are k<super>2</super> − 2, which the following theorem shows is an upper bound in general."),
        statement("Theorem 2.", "For every k ≥ 5, we have I(k) ≤ k<super>2</super> − 2."),
        statement("Proposition 3.", "For every k ≥ 3, we have I(k) ≥ k<super>2</super> − 2k."),
        P("Proposition 3 comes from colouring {1, …, k<super>2</super> − 2k − 1} by blocks: the integers below k − 1 red, the next k<super>2</super> − 3k blue, and the rest red. The bounds of Theorem 2 and Proposition 3 differ by 2k − 2."),
        statement("Conjecture 4.", "For every k ≥ 5, we have I(k) = k<super>2</super> − 2."),
        statement("Remark 5.", "The hypothesis k ≥ 5 in Theorem 2 cannot be dropped: Theorem 2 fails for k = 3, since I(3) = 9 > 3<super>2</super> − 2 = 7. For k = 8 our search ruled out every N < 60 but did not finish, so I(8) is not known."),
        P("3. PROOF OF THEOREM 2", HEAD),
        statement("Lemma 6.", "Let k ≥ 5 and let a colouring of {1, …, k<super>2</super> − 2} with two colours have no monochromatic solution of (1). Then 1 and k − 1 have different colours."),
        P("<i>Proof of Theorem 2.</i> Suppose a colouring of {1, …, k<super>2</super> − 2} has no monochromatic solution of (1), and let 1 be red. By Lemma 6, k − 1 is blue. Then x<sub>1</sub> = ⋯ = x<sub>k−1</sub> = k − 1 and x<sub>k</sub> = (k − 1)<super>2</super>/2 force (k − 1)<super>2</super>/2 to be red when k is odd, and a similar choice works when k is even. Following the colours of 2, k + 1 and 2k − 2 in the same way leads to a contradiction for k ≥ 5. ∎"),
        P("REFERENCES", HEAD),
        P("[1] R. Rado, Studien zur Kombinatorik, <i>Math. Z.</i> 36 (1933), 424–470.", ParagraphStyle("ref", parent=BODY, fontSize=9, leading=11, alignment=0)),
    ]
    doc.build(s, onFirstPage=furniture, onLaterPages=furniture)


if __name__ == "__main__":
    note()
