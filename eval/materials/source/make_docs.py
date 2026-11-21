"""Writes the materials suite's made-up documents (eval/materials/README.md):

    python3 eval/materials/source/make_docs.py

- llzo-al-cubic.cif: a crystal structure as a CIF, with the space group written with spaces ("I a -3 d"), as
  CIF files write it, and concise uncertainties ("12.9682(5)");
- ti64-slm-tensile-log.csv: a tensile test log of Ti-6Al-4V coupons in three conditions and two build
  orientations, one test with no valid elongation;
- zta-test-report.pdf: a test report of zirconia-toughened alumina, whose property table leaves cells empty
  where a value was not measured, as real reports do. pdf.js drops an empty cell, so the values after it read
  in the wrong column (docs/materials-science-audit.md, MS5).

The values are made up for the suite, in the ranges such materials have. Needs reportlab and the DejaVu Sans
font; invariant=1 keeps the PDF the same from run to run, so it can be committed and rebuilt.
"""

import os
from reportlab import rl_config
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table

rl_config.invariant = 1
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
OUT = os.path.join(os.path.dirname(__file__), "..", "docs")

CIF = """data_LLZO_Al_cubic
_publ_section_title
;
Al-doped cubic garnet Li6.25Al0.25La3Zr2O12 from Rietveld refinement of laboratory X-ray powder data
(made up for the Kovrune materials suite)
;
_chemical_name_common                  'Al-doped LLZO'
_chemical_formula_sum                  'Al0.25 La3 Li6.25 O12 Zr2'
_chemical_formula_weight               839.6
_symmetry_cell_setting                 cubic
_symmetry_space_group_name_H-M         'I a -3 d'
_space_group_IT_number                 230
_cell_length_a                         12.9682(5)
_cell_length_b                         12.9682(5)
_cell_length_c                         12.9682(5)
_cell_angle_alpha                      90
_cell_angle_beta                       90
_cell_angle_gamma                      90
_cell_volume                           2180.97(14)
_cell_formula_units_Z                  8
_exptl_crystal_density_diffrn          5.114
_diffrn_ambient_temperature            298
_diffrn_radiation_type                 'Cu K\\a'
_diffrn_radiation_wavelength           1.5406
_pd_meas_2theta_range_min              10.00
_pd_meas_2theta_range_max              120.00
_refine_ls_R_factor_all                0.0412
_pd_proc_ls_prof_wR_factor             0.0587
_refine_ls_goodness_of_fit_all         1.38

loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_Wyckoff_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
_atom_site_U_iso_or_equiv
La1 La 24c 0.125 0 0.25 1 0.0085(3)
Zr1 Zr 16a 0 0 0 1 0.0071(4)
O1 O 96h 0.1006(4) 0.1951(4) 0.2816(4) 1 0.0112(9)
Li1 Li 24d 0.375 0 0.25 0.564(18) 0.021(5)
Li2 Li 96h 0.0981(23) 0.1835(22) 0.4264(21) 0.348(9) 0.025(6)
Al1 Al 24d 0.375 0 0.25 0.083 0.021(5)
"""

CSV_ROWS = [
    ["specimen", "build_orientation", "condition", "yield_strength_MPa", "UTS_MPa", "elongation_pct", "notes"],
    ["T01", "vertical", "as-built", "1105", "1220", "6.8", ""],
    ["T02", "horizontal", "as-built", "1140", "1265", "5.9", ""],
    ["T03", "vertical", "stress-relieved 650 C 3 h", "1010", "1105", "9.4", ""],
    ["T04", "horizontal", "stress-relieved 650 C 3 h", "1035", "1130", "8.7", ""],
    ["T05", "vertical", "HIP 920 C 100 MPa 2 h", "905", "995", "14.2", ""],
    ["T06", "horizontal", "HIP 920 C 100 MPa 2 h", "915", "1010", "13.6", ""],
    ["T07", "vertical", "HIP 920 C 100 MPa 2 h", "898", "989", "15.1", ""],
    ["T08", "horizontal", "HIP 920 C 100 MPa 2 h", "912", "1002", "", "fractured outside the gauge length; elongation not valid"],
]


def write_cif():
    with open(os.path.join(OUT, "llzo-al-cubic.cif"), "w", encoding="utf-8", newline="\n") as f:
        f.write(CIF)


def write_csv():
    with open(os.path.join(OUT, "ti64-slm-tensile-log.csv"), "w", encoding="utf-8", newline="\n") as f:
        for row in CSV_ROWS:
            f.write(",".join(f'"{c}"' if "," in c else c for c in row) + "\n")


def write_pdf():
    body = ParagraphStyle("body", fontName="DejaVu", fontSize=10, leading=13, spaceAfter=6)
    head = ParagraphStyle("head", parent=body, fontSize=14, leading=18, spaceAfter=10)
    doc = SimpleDocTemplate(os.path.join(OUT, "zta-test-report.pdf"), pagesize=A4, title="Test report TR-2025-114", author="Kovrune materials suite")
    story = [
        Paragraph("Test report TR-2025-114: zirconia-toughened alumina discs", head),
        Paragraph(
            "Made up for the Kovrune materials suite. Discs of alumina with 0 to 30 vol% of 3 mol% yttria-stabilized zirconia "
            "(3Y-TZP) were pressed, sintered in air at 1550 °C for 2 h, ground and polished. Density was measured by the Archimedes "
            "method, hardness by Vickers indentation at 98.1 N (HV10), fracture toughness K<sub>IC</sub> from the indentation crack "
            "lengths, and flexural strength in four-point bending on ten bars per composition.",
            body,
        ),
        Paragraph(
            "Adding zirconia raised the fracture toughness of the alumina and its strength, and lowered its hardness. "
            "Some values could not be measured: indents that chipped at their corners give no crack length, and some "
            "discs and bars were not tested before this report.",
            body,
        ),
        Paragraph("Table 1. Properties of the sintered discs. A blank cell was not measured.", body),
        Table(
            [
                ["Sample", "ZrO₂ (vol%)", "Relative density (%)", "Hardness HV10 (GPa)", "Kᴵᶜ (MPa·m½)", "Flexural strength (MPa)"],
                ["A0", "0", "99.2", "17.8", "3.6", "410"],
                ["ZTA-10", "10", "99.0", "17.1", "", "520"],
                ["ZTA-20", "20", "98.6", "", "5.9", "610"],
                ["ZTA-30", "30", "97.9", "15.2", "6.4", ""],
            ],
            style=[("FONT", (0, 0), (-1, -1), "DejaVu", 9)],
        ),
        Spacer(1, 10),
        Paragraph("Monoclinic zirconia was below the XRD detection limit in every sintered disc; the zirconia was retained as the tetragonal phase.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    write_cif()
    write_csv()
    write_pdf()
