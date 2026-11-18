"""Writes eval/physics/docs/rb87-bec-paper.pdf, the physics suite's PDF (eval/physics/README.md).

    python3 eval/physics/source/make_pdfs.py

A made-up paper laid out as real ones are, as the engineering suite's are (eval/engineering/source/make_pdfs.py),
because how a PDF is laid out decides what pdf.js gives:
- two columns, with a running header and page numbers on every page;
- symbols (−, μ, ≈, π, ω, ×) come from a second font, so pdf.js gives them as separate pieces of text;
- superscripts and subscripts are set smaller and raised or lowered: "10<super>5</super>" reads "10 5",
  "<super>87</super>Rb" reads "87 Rb", "a<sub>0</sub>" reads "a 0".

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
from reportlab.platypus import BaseDocTemplate, Frame, FrameBreak, NextPageTemplate, PageTemplate, Paragraph, Spacer, Table

rl_config.invariant = 1
pdfmetrics.registerFont(TTFont("Sym", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
OUT = os.path.join(os.path.dirname(__file__), "..", "docs")


def sym(text):
    """Symbols in the symbol font, as a PDF made by a typesetting system often has them."""
    for ch in "−μ≈π×ω≤≥":
        text = text.replace(ch, f'<font name="Sym">{ch}</font>')
    return text


BODY = ParagraphStyle("body", fontName="Times-Roman", fontSize=9.5, leading=11.5, spaceAfter=5, alignment=4)
HEAD = ParagraphStyle("head", parent=BODY, fontName="Times-Bold", spaceBefore=4, alignment=0)
TITLE = ParagraphStyle("title", fontName="Times-Bold", fontSize=16, leading=19, alignment=1, spaceAfter=6)
AUTH = ParagraphStyle("auth", fontName="Times-Roman", fontSize=10, leading=12, alignment=1, spaceAfter=6)
CAP = ParagraphStyle("cap", parent=BODY, fontSize=8, leading=9.5, alignment=1)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=7.5, leading=9)


def P(text, style=BODY):
    return Paragraph(sym(text), style)


def table(rows, widths):
    return Table([[P(c, CELL) for c in row] for row in rows], colWidths=widths, style=[("LINEBELOW", (0, 0), (-1, 0), 0.5, "black"), ("VALIGN", (0, 0), (-1, -1), "TOP")])


def paper():
    W, H = letter
    m, gap = 0.65 * inch, 0.25 * inch
    colw = (W - 2 * m - gap) / 2
    top = 1.75 * inch

    def furniture(c, doc):
        c.setFont("Times-Roman", 7.5)
        c.drawString(m, H - 0.42 * inch, "JOURNAL OF ATOMIC AND COLD MATTER PHYSICS 12, 044301 (2026) — MADE UP")
        c.drawRightString(W - m, H - 0.42 * inch, str(doc.page))

    doc = BaseDocTemplate(os.path.join(OUT, "rb87-bec-paper.pdf"), pagesize=letter, title="All-optical BEC of 87Rb", author="Made-up authors")
    first = [Frame(m, H - m - top, W - 2 * m, top, id="t"), Frame(m, m, colw, H - 2 * m - top, id="l"), Frame(m + colw + gap, m, colw, H - 2 * m - top, id="r")]
    rest = [Frame(m, m, colw, H - 2 * m, id="l2"), Frame(m + colw + gap, m, colw, H - 2 * m, id="r2")]
    doc.addPageTemplates([PageTemplate("first", first, onPage=furniture), PageTemplate("rest", rest, onPage=furniture)])

    s = [
        P("Fast All-Optical Bose–Einstein Condensation of <super>87</super>Rb in a 1064-nm Crossed Dipole Trap", TITLE),
        P("Hanna Lindqvist, Mateo Ferreira, and Yusuf Demir", AUTH),
        P("<i>Abstract</i>—We produce Bose–Einstein condensates of <super>87</super>Rb in a crossed optical dipole trap at 1064 nm, without a magnetic trap, with a cycle time of 9 s. Condensation sets in at 180 nK with 4 × 10<super>5</super> atoms. After evaporation the trap holds a nearly pure condensate of 2.0 × 10<super>5</super> atoms at a temperature below 50 nK, with a 1/<i>e</i> lifetime of 12 s.", BODY),
        FrameBreak(), NextPageTemplate("rest"),
        P("I. INTRODUCTION", HEAD),
        P("All-optical production of Bose–Einstein condensates (BECs) avoids the slow transfer of atoms into a magnetic trap and leaves the magnetic field free to tune interactions. Its drawback has been the long evaporation needed in shallow optical traps, which limits the repetition rate of experiments that need many runs, such as precision interferometry or quantum simulation with averaging over disorder."),
        P("Here we combine a dark compressed magneto-optical trap (MOT), loading into a crossed dipole trap at high power, and an evaporation ramp that tilts the trap with a magnetic gradient as the laser power falls. The total cycle time from MOT loading to imaging is 9 s."),
        P("II. APPARATUS", HEAD),
        P("A two-dimensional MOT loads a three-dimensional MOT in 3 s with 2 × 10<super>9</super> atoms at 120 μK. After a 40-ms compression stage, the atoms are loaded into a crossed dipole trap formed by two beams at 1064 nm, each of 12 W, crossing at 90° with beam waists of 40 μm. About 3 × 10<super>7</super> atoms are captured, at a temperature of 25 μK."),
        P("The trap depth at full power is <i>U</i><sub>0</sub>/<i>k</i><sub>B</sub> ≈ 250 μK. The atoms are imaged by resonant absorption on the <i>D</i><sub>2</sub> line at 780 nm after a time of flight of 20 ms."),
        P("III. EVAPORATION", HEAD),
        P("The power of both beams is lowered exponentially over 4.5 s. During the last 2 s, a magnetic field gradient of 12 G/cm along the vertical tilts the trap and lets the hottest atoms escape, which keeps the trap frequencies, and hence the collision rate, higher than lowering the power alone would."),
        P("Condensation sets in at a temperature of 180 nK, with 4 × 10<super>5</super> atoms. At the end of the ramp, no thermal fraction can be detected in the time-of-flight images, which sets an upper bound on the temperature of 50 nK. The final condensate holds 2.0 × 10<super>5</super> atoms."),
        P("TABLE I<br/>THE EVAPORATION SEQUENCE", CAP),
        table([["Stage", "Duration", "Atoms", "Temperature"], ["Dipole trap loaded", "—", "3 × 10<super>7</super>", "25 μK"], ["End of power ramp", "2.5 s", "2 × 10<super>6</super>", "1.2 μK"], ["BEC onset", "3.9 s", "4 × 10<super>5</super>", "180 nK"], ["Final condensate", "4.5 s", "2.0 × 10<super>5</super>", "< 50 nK"]], [colw * 0.34, colw * 0.2, colw * 0.23, colw * 0.23]),
        Spacer(1, 6),
        P("IV. THE CONDENSATE", HEAD),
        P("The final trap frequencies, measured by exciting dipole oscillations, are ω = 2π × (85, 85, 120) Hz. With the s-wave scattering length <i>a</i> = 100 <i>a</i><sub>0</sub>, the Thomas–Fermi model gives a chemical potential of μ = <i>h</i> × 1.2 kHz, or μ/<i>k</i><sub>B</sub> = 58 nK, and a peak density of 2.5 × 10<super>14</super> cm<super>−3</super>."),
        P("The condensate decays with a 1/<i>e</i> lifetime of 12 s, limited by three-body recombination at early times and by collisions with the background gas, at a pressure of 3 × 10<super>−11</super> mbar, at late times. The heating rate in the final trap, measured on a thermal cloud, is 3 nK/s, which we attribute to intensity noise of the trapping laser."),
        P("V. DISCUSSION", HEAD),
        P("The cycle time of 9 s is shorter than that of comparable hybrid magnetic-optical traps, which typically need 20 s or more. The number of condensed atoms is lower than in the best magnetic traps, but sufficient for interferometry with a signal-to-noise ratio limited by atom shot noise. Raising the laser power to 20 W per beam should increase the captured number without lengthening the cycle."),
        P("VI. CONCLUSION", HEAD),
        P("A crossed dipole trap at 1064 nm with a tilted evaporation produces condensates of 2.0 × 10<super>5</super> <super>87</super>Rb atoms every 9 s. The condensates live for 12 s, long enough for interferometry sequences of several seconds."),
        P("REFERENCES", HEAD),
    ]
    refs = [
        "[1] M. D. Barrett, J. A. Sauer, and M. S. Chapman, \"All-optical formation of an atomic Bose–Einstein condensate,\" <i>Phys. Rev. Lett.</i>, vol. 87, 010404, 2001.",
        "[2] C.-L. Hung et al., \"Accelerating evaporative cooling of atoms into Bose–Einstein condensation in optical traps,\" <i>Phys. Rev. A</i>, vol. 78, 011604, 2008.",
        "[3] F. Dalfovo et al., \"Theory of Bose–Einstein condensation in trapped gases,\" <i>Rev. Mod. Phys.</i>, vol. 71, pp. 463–512, 1999.",
    ]
    s += [P(r, ParagraphStyle("ref", parent=BODY, fontSize=8, leading=9.5, alignment=0)) for r in refs]
    doc.build(s)


if __name__ == "__main__":
    paper()
