# Writes scanned-pages.pdf: a five-page paper whose page 2 is a scan (the text is pixels in an image,
# with only a printed page number), page 3 a figure with a caption, page 4 blank, and pages 1 and 5 text.
# Run with reportlab 4+ and Pillow: python3 make_scanned_pages.py
import io
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

W, H = A4
pdf = canvas.Canvas("scanned-pages.pdf", pagesize=A4, invariant=1)

def paragraph(lines, y=H - 90):
    pdf.setFont("Helvetica", 11)
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 16

paragraph([
    "1. Introduction",
    "A totem-pole PFC rectifier with silicon carbide switches reaches 98.9% efficiency at 3.3 kW.",
    "This page is ordinary text, as a publisher's PDF gives it.",
])
pdf.showPage()

# Page 2: a scanned page. The words are drawn into a bitmap, so the PDF holds no text for them.
scan = Image.new("L", (1240, 1754), 255)
draw = ImageDraw.Draw(scan)
for i in range(30):
    draw.text((120, 140 + i * 40), "Scanned appendix: measured losses at 230 V input, 50 Hz, 25 C ambient.", fill=0)
buffer = io.BytesIO()
scan.save(buffer, format="PNG")
pdf.drawImage(ImageReader(io.BytesIO(buffer.getvalue())), 0, 0, W, H)
pdf.setFont("Helvetica", 9)
pdf.drawString(W / 2, 30, "2")
pdf.showPage()

# Page 3: a figure (lines, no text) with a caption, which is text.
pdf.setLineWidth(2)
pdf.line(100, 300, 500, 300)
pdf.line(100, 300, 100, 650)
pdf.bezier(100, 320, 200, 600, 350, 640, 500, 630)
pdf.setFont("Helvetica", 10)
pdf.drawString(100, 270, "Fig. 3. Efficiency versus output power at 230 V input.")
pdf.showPage()

# Page 4: blank.
pdf.showPage()

paragraph([
    "5. Conclusion",
    "The rectifier meets the 80 PLUS Titanium requirement across the load range.",
])
pdf.showPage()
pdf.save()
