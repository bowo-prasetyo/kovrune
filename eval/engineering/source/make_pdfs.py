"""Writes eval/engineering/docs/*.pdf, the engineering suite's two PDFs (eval/engineering/README.md).

    python3 eval/engineering/source/make_pdfs.py

Made-up documents laid out as real ones are, because how a PDF is laid out decides what pdf.js gives:
- the paper is set in two columns, with a running header and page numbers on every page;
- symbols (Ω, −, θ) come from a second font, as many PDFs take them from a symbol font, so pdf.js
  gives them as separate pieces of text ("40 m Ω", "− 25");
- subscripts and superscripts are set smaller and raised or lowered ("f<sub>sw</sub>", "10<super>−6</super>").

Needs reportlab (pip install reportlab) and the DejaVu Sans font. invariant=1 keeps the files the same
from run to run, so they can be committed and rebuilt.
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
    """Ω, −, θ and µ-free symbols in the symbol font, as a PDF made by a typesetting system often has them."""
    for ch in "Ω−θ≤≥":
        text = text.replace(ch, f'<font name="Sym">{ch}</font>')
    return text


BODY = ParagraphStyle("body", fontName="Times-Roman", fontSize=9.5, leading=11.5, spaceAfter=5, alignment=4)
HEAD = ParagraphStyle("head", parent=BODY, fontName="Times-Bold", spaceBefore=4, alignment=0)
TITLE = ParagraphStyle("title", fontName="Times-Bold", fontSize=17, leading=20, alignment=1, spaceAfter=6)
AUTH = ParagraphStyle("auth", fontName="Times-Roman", fontSize=10, leading=12, alignment=1, spaceAfter=6)
CAP = ParagraphStyle("cap", parent=BODY, fontSize=8, leading=9.5, alignment=1)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=7.5, leading=9)


def P(text, style=BODY):
    return Paragraph(sym(text), style)


def table(rows, widths):
    return Table([[P(c, CELL) for c in row] for row in rows], colWidths=widths, style=[("LINEBELOW", (0, 0), (-1, 0), 0.5, "black"), ("VALIGN", (0, 0), (-1, -1), "TOP")])


# ---------------------------------------------------------------------------------------------------
# The paper: two columns, IEEE-style, three pages.

def paper():
    W, H = letter
    m, gap = 0.65 * inch, 0.25 * inch
    colw = (W - 2 * m - gap) / 2
    top = 1.55 * inch

    def furniture(c, doc):
        c.setFont("Times-Roman", 7.5)
        c.drawString(m, H - 0.42 * inch, "IEEE TRANSACTIONS ON POWER ELECTRONICS, VOL. 41, NO. 3, MARCH 2026")
        c.drawRightString(W - m, H - 0.42 * inch, str(doc.page))

    doc = BaseDocTemplate(os.path.join(OUT, "sic-pfc-paper.pdf"), pagesize=letter, title="SiC totem-pole PFC rectifier", author="Made-up authors")
    first = [Frame(m, H - m - top, W - 2 * m, top, id="t"), Frame(m, m, colw, H - 2 * m - top, id="l"), Frame(m + colw + gap, m, colw, H - 2 * m - top, id="r")]
    rest = [Frame(m, m, colw, H - 2 * m, id="l2"), Frame(m + colw + gap, m, colw, H - 2 * m, id="r2")]
    doc.addPageTemplates([PageTemplate("first", first, onPage=furniture), PageTemplate("rest", rest, onPage=furniture)])

    s = [
        P("A 98.6%-Efficient 3.3-kW SiC Totem-Pole PFC Rectifier With Adaptive Dead-Time Control", TITLE),
        P("Mira Okonkwo, Daniel Achterberg, and Sun-Hee Park", AUTH),
        P("<i>Abstract</i>—This paper presents a 3.3-kW bridgeless totem-pole rectifier built with 1200-V silicon carbide MOSFETs. An adaptive dead-time controller cuts the light-load losses. The prototype reaches a peak efficiency of 98.6% at 50% load and a power factor above 0.99 from 20% load upward, at 230-V input.", BODY),
        FrameBreak(), NextPageTemplate("rest"),
        P("I. INTRODUCTION", HEAD),
        P("Power factor correction (PFC) is required for power supplies above 75 W connected to the public grid. The boost rectifier with a diode bridge remains common, but the bridge conducts the full input current through two diodes, and its loss limits the efficiency to about 97% at this power level."),
        P("Bridgeless topologies remove the diode bridge. Among them, the totem-pole rectifier needs the fewest components, but its fast leg operates in continuous conduction mode only with switches whose body diode has a negligible reverse recovery charge. Silicon carbide (SiC) MOSFETs meet this condition, and soft switching through zero-voltage switching (ZVS) reduces their turn-on loss further."),
        P("Prior work reported peak efficiencies between 98.0% and 98.4% at comparable power levels [3], [7]. In those designs the dead time between the two switches of the fast leg is fixed, and it is set for the worst case. At light load, the switch node then rings for most of the dead time, and the body diode conducts. This paper adapts the dead time to the load current and measures the effect on efficiency and on total harmonic distortion (THD)."),
        P("II. CONVERTER DESIGN", HEAD),
        P("The fast leg uses two KV1200M040 SiC MOSFETs, whose on-state resistance is R<sub>DS(on)</sub> = 40 mΩ at T<sub>j</sub> = 25 °C, rising to 68 mΩ at T<sub>j</sub> = 175 °C. The junction-to-case thermal resistance is R<sub>θJC</sub> = 0.38 K/W. The slow leg uses two 600-V silicon superjunction MOSFETs switching at the line frequency."),
        P("The boost inductor was designed for a current ripple of 20% of the peak line current at full load, which gives L = 450 µH. The switching frequency is f<sub>sw</sub> = 65 kHz, chosen to keep the second harmonic of the switching frequency below the 150-kHz start of the conducted emission band."),
        P("The conduction loss of each fast-leg switch is P<sub>cond</sub> = I<sub>rms</sub><super>2</super> R<sub>DS(on)</sub>, evaluated at the junction temperature reached at each load. The gate is driven between −4 V and +18 V. The drain leakage current at 800 V stayed below 2.5 × 10<super>−6</super> A over the whole temperature range."),
        P("III. ADAPTIVE DEAD-TIME CONTROL", HEAD),
        P("The controller measures the inductor current at each switching period and selects the dead time from a table indexed by current. At high current the switch node transition is fast and a short dead time suffices; at low current the transition is slow, and too short a dead time loses ZVS. The table spans 40 ns to 120 ns, against a fixed dead time of 150 ns in the reference design."),
        P("The controller runs in the same microcontroller as the current loop and needs no extra sensing: the current is already sampled for the current loop. Its only cost is a table of 32 entries."),
        P("IV. EXPERIMENTAL RESULTS", HEAD),
        P("The prototype was tested at 230-V, 50-Hz input and 400-V output. The converter was tested over an ambient temperature range of −25 °C to 55 °C in a climatic chamber. Table I gives the measured performance at 25 °C ambient."),
        P("TABLE I<br/>MEASURED PERFORMANCE AT 230-V INPUT", CAP),
        table([["Load", "Efficiency", "Power factor", "THD"], ["20%", "97.1%", "0.991", "6.8%"], ["50%", "98.6%", "0.998", "3.1%"], ["100%", "98.2%", "0.999", "2.4%"]], [colw / 4] * 4),
        Spacer(1, 6),
        P("The adaptive dead time reduced the light-load losses by 18% compared with the fixed dead time of 150 ns. At 20% load, the efficiency improved from 96.4% to 97.1%. At full load the dead time made no measurable difference, since the transition is fast in both cases."),
        P("ZVS was achieved above 35% load with the adaptive dead time, and above 60% load with the fixed one. Below these loads the switches turn on with a partly discharged output capacitance."),
        P("The THD stayed below 10% from 10% load upward, and below 5% from 40% load upward, which meets the limits of IEC 61000-3-2 for class A equipment. The measured power factor exceeded 0.99 from 20% load upward."),
        P("At full load and 55 °C ambient, the heatsink temperature reached 71 °C and the junction temperature of the fast-leg switches was estimated at 112 °C from the measured case temperature and R<sub>θJC</sub>."),
        P("V. DISCUSSION", HEAD),
        P("The gain at light load matters most for server power supplies, which spend most of their life between 20% and 50% load. A further gain is possible by lowering f<sub>sw</sub> at light load, which this work did not attempt, because it moves the inductor ripple outside its design range."),
        P("The thermal margin at 55 °C allows operation at full power without forced derating, although the fan speed must then be at its maximum. The acoustic noise at that speed was not measured."),
        P("VI. CONCLUSION", HEAD),
        P("The proposed converter exceeds the 80 PLUS Titanium requirement of 96% efficiency at 50% load with a margin of 2.6 percentage points. The adaptive dead time costs no hardware and should apply to any totem-pole rectifier with wide-bandgap switches."),
        P("REFERENCES", HEAD),
    ]
    refs = [
        "[1] J. Doe and R. Roe, \"Bridgeless PFC rectifiers: a review,\" <i>IEEE Trans. Power Electron.</i>, vol. 35, no. 2, pp. 1100–1115, 2020.",
        "[2] A. Lee, \"Totem-pole PFC with GaN switches,\" in <i>Proc. APEC</i>, 2021, pp. 210–216.",
        "[3] K. Smith et al., \"A 98.4% efficient 3-kW totem-pole rectifier,\" <i>IEEE Trans. Ind. Electron.</i>, vol. 69, no. 5, pp. 4400–4410, 2022.",
        "[4] M. Garcia, \"Dead-time optimization in SiC half bridges,\" <i>IEEE J. Emerg. Sel. Topics Power Electron.</i>, vol. 10, no. 1, pp. 50–61, 2022.",
        "[5] P. Novak, \"Loss modelling of SiC MOSFETs,\" <i>IET Power Electron.</i>, vol. 15, pp. 900–912, 2022.",
        "[6] T. Ito and H. Sato, \"Zero-voltage switching at light load,\" in <i>Proc. ECCE</i>, 2023, pp. 1500–1507.",
        "[7] L. Wang et al., \"A 98.0% efficient 3.6-kW PFC stage,\" <i>IEEE Trans. Power Electron.</i>, vol. 38, no. 7, pp. 8000–8012, 2023.",
    ]
    s += [P(r, ParagraphStyle("ref", parent=BODY, fontSize=8, leading=9.5, alignment=0)) for r in refs]
    doc.build(s)


# ---------------------------------------------------------------------------------------------------
# The datasheet: one column, tables of ratings and characteristics, a header and footer on each page.

def datasheet():
    W, H = letter
    m = 0.7 * inch

    def furniture(c, doc):
        c.setFont("Helvetica-Bold", 8)
        c.drawString(m, H - 0.45 * inch, "KVR SEMICONDUCTOR")
        c.setFont("Helvetica", 8)
        c.drawRightString(W - m, H - 0.45 * inch, "KV1200M040 Datasheet, Rev. 2.1")
        c.drawString(m, 0.45 * inch, "Made-up part for the Kovrune engineering suite. Not a real product.")
        c.drawRightString(W - m, 0.45 * inch, f"Page {doc.page}")

    doc = BaseDocTemplate(os.path.join(OUT, "kv1200m040-datasheet.pdf"), pagesize=letter, title="KV1200M040 datasheet", author="KVR Semiconductor (made up)")
    doc.addPageTemplates([PageTemplate("all", [Frame(m, m, W - 2 * m, H - 2 * m)], onPage=furniture)])
    T = ParagraphStyle("dt", fontName="Helvetica-Bold", fontSize=15, leading=18, spaceAfter=4)
    S = ParagraphStyle("ds", fontName="Helvetica-Bold", fontSize=10.5, leading=13, spaceBefore=8, spaceAfter=4)
    B = ParagraphStyle("db", fontName="Helvetica", fontSize=9, leading=11.5, spaceAfter=4)
    w = (W - 2 * m)
    s = [
        P("KV1200M040", T),
        P("1200 V, 40 mΩ silicon carbide power MOSFET, N-channel enhancement mode, TO-247-4 package", B),
        P("Features", S),
        P("• Low on-state resistance: 40 mΩ typical at V<sub>GS</sub> = 18 V<br/>• Low capacitance and gate charge for fast switching<br/>• Kelvin source pin for clean gate drive<br/>• Fast intrinsic body diode with low reverse recovery charge", B),
        P("Applications", S),
        P("Totem-pole power factor correction, solar inverters, EV chargers, industrial motor drives.", B),
        P("Absolute maximum ratings", S),
        P("T<sub>C</sub> = 25 °C unless otherwise noted. Stresses beyond these ratings may damage the device.", B),
        table([
            ["Parameter", "Symbol", "Conditions", "Value", "Unit"],
            ["Drain-source voltage", "V<sub>DS</sub>", "V<sub>GS</sub> = 0 V", "1200", "V"],
            ["Gate-source voltage, maximum", "V<sub>GS,max</sub>", "static", "+22", "V"],
            ["Gate-source voltage, minimum", "V<sub>GS,min</sub>", "static", "−8", "V"],
            ["Continuous drain current", "I<sub>D</sub>", "T<sub>C</sub> = 25 °C", "58", "A"],
            ["Continuous drain current", "I<sub>D</sub>", "T<sub>C</sub> = 100 °C", "41", "A"],
            ["Pulsed drain current", "I<sub>D,pulse</sub>", "pulse width limited by T<sub>j,max</sub>", "150", "A"],
            ["Power dissipation", "P<sub>D</sub>", "T<sub>C</sub> = 25 °C", "288", "W"],
            ["Operating junction temperature", "T<sub>j</sub>", "", "−55 to 175", "°C"],
            ["Storage temperature", "T<sub>stg</sub>", "", "−55 to 150", "°C"],
        ], [w * 0.32, w * 0.14, w * 0.26, w * 0.16, w * 0.12]),
        P("Thermal characteristics", S),
        table([
            ["Parameter", "Symbol", "Typ.", "Max.", "Unit"],
            ["Thermal resistance, junction to case", "R<sub>θJC</sub>", "0.38", "0.52", "K/W"],
            ["Thermal resistance, junction to ambient", "R<sub>θJA</sub>", "", "40", "K/W"],
        ], [w * 0.4, w * 0.15, w * 0.15, w * 0.15, w * 0.15]),
        P("Electrical characteristics", S),
        P("T<sub>j</sub> = 25 °C unless otherwise noted.", B),
        table([
            ["Parameter", "Symbol", "Conditions", "Min.", "Typ.", "Max.", "Unit"],
            ["Gate threshold voltage", "V<sub>GS(th)</sub>", "V<sub>DS</sub> = V<sub>GS</sub>, I<sub>D</sub> = 10 mA", "1.8", "2.6", "3.6", "V"],
            ["Zero gate voltage drain current", "I<sub>DSS</sub>", "V<sub>DS</sub> = 1200 V, V<sub>GS</sub> = 0 V", "", "1", "50", "µA"],
            ["Gate-source leakage current", "I<sub>GSS</sub>", "V<sub>GS</sub> = 22 V", "", "", "100", "nA"],
            ["Drain-source on-state resistance", "R<sub>DS(on)</sub>", "V<sub>GS</sub> = 18 V, I<sub>D</sub> = 30 A", "", "40", "52", "mΩ"],
            ["Drain-source on-state resistance", "R<sub>DS(on)</sub>", "V<sub>GS</sub> = 18 V, I<sub>D</sub> = 30 A, T<sub>j</sub> = 175 °C", "", "68", "", "mΩ"],
            ["Input capacitance", "C<sub>iss</sub>", "V<sub>DS</sub> = 800 V, f = 1 MHz", "", "1950", "", "pF"],
            ["Output capacitance", "C<sub>oss</sub>", "V<sub>DS</sub> = 800 V, f = 1 MHz", "", "105", "", "pF"],
            ["Reverse transfer capacitance", "C<sub>rss</sub>", "V<sub>DS</sub> = 800 V, f = 1 MHz", "", "9", "", "pF"],
            ["Total gate charge", "Q<sub>g</sub>", "V<sub>DS</sub> = 800 V, I<sub>D</sub> = 30 A", "", "106", "", "nC"],
        ], [w * 0.24, w * 0.11, w * 0.32, w * 0.07, w * 0.08, w * 0.08, w * 0.1]),
        P("Switching characteristics", S),
        P("V<sub>DD</sub> = 800 V, I<sub>D</sub> = 30 A, V<sub>GS</sub> = −4 V / +18 V, R<sub>G(ext)</sub> = 2.5 Ω, inductive load, T<sub>j</sub> = 25 °C.", B),
        table([
            ["Parameter", "Symbol", "Typ.", "Unit"],
            ["Turn-on delay time", "t<sub>d(on)</sub>", "14", "ns"],
            ["Rise time", "t<sub>r</sub>", "22", "ns"],
            ["Turn-off delay time", "t<sub>d(off)</sub>", "31", "ns"],
            ["Fall time", "t<sub>f</sub>", "11", "ns"],
            ["Turn-on switching energy", "E<sub>on</sub>", "410", "µJ"],
            ["Turn-off switching energy", "E<sub>off</sub>", "95", "µJ"],
        ], [w * 0.4, w * 0.2, w * 0.2, w * 0.2]),
        P("Body diode characteristics", S),
        table([
            ["Parameter", "Symbol", "Conditions", "Typ.", "Unit"],
            ["Diode forward voltage", "V<sub>SD</sub>", "V<sub>GS</sub> = −4 V, I<sub>SD</sub> = 15 A", "4.1", "V"],
            ["Reverse recovery time", "t<sub>rr</sub>", "di/dt = 2000 A/µs", "18", "ns"],
            ["Reverse recovery charge", "Q<sub>rr</sub>", "di/dt = 2000 A/µs", "160", "nC"],
        ], [w * 0.3, w * 0.15, w * 0.3, w * 0.12, w * 0.13]),
        P("Notes", S),
        P("1. The recommended gate drive is −4 V for turn-off and +18 V for turn-on. A negative turn-off voltage below −4 V increases the threshold drift over the device lifetime.<br/>2. R<sub>DS(on)</sub> rises with junction temperature by about 70% from 25 °C to 175 °C.<br/>3. All values are typical of production devices and are not tested in production unless a minimum or maximum is given.", B),
        P("Ordering information", S),
        P("KV1200M040-T4: TO-247-4, tube of 30. KV1200M040-T3: TO-247-3, tube of 30, without the Kelvin source pin; its switching energies are higher.", B),
    ]
    doc.build(s)


if __name__ == "__main__":
    paper()
    datasheet()
