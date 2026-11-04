# Builds the office suite's documents (eval/field/office.ts) from made-up data, deterministically:
#
#   python3 eval/field/office/source/make.py
#
# It writes the sources here and the documents one folder up. report-card-2025.docx and
# orders-2025.xlsx are converted by LibreOffice (soffice must be on PATH), as a user's files would be
# saved by an office suite; inventory-sjis.csv is written as Japanese Excel saves "CSV (comma
# delimited)": Windows-932 Shift_JIS, CRLF, the yen sign as byte 0x5C. The committed documents were
# built with LibreOffice 24.2; another version may write the .docx and .xlsx slightly differently,
# so rebuild only to change the suite, and record it (eval/field/README.md).

import os, random, shutil, subprocess, tempfile
from datetime import date, timedelta
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
rng = random.Random(2025)

# ---------------------------------------------------------------------------------------------
# A report card in the layout of a preview user's (November 2026): a page header with the name and
# term, a heading before each subject's table, the mark as ◯ under one of three columns.

SUBJECTS = ["Japanese Language", "Social Studies", "Mathematics", "Science", "Music", "Art and Crafts", "Home Economics", "Physical Education", "Foreign Language Activities"]
PERSPECTIVES = ["Knowledge & Skills", "Thinking, Judgment & Expression", "Attitude Toward Independent Learning"]
MARKS = ["Excellent", "Good", "Needs Improvement"]
DESCRIPTIONS = {
    "Japanese Language": ["Understands how words and sentences relate and reads and writes with care.", "Thinks logically and expresses ideas clearly in speaking and writing.", "Reads widely and tries to use language more effectively."],
    "Social Studies": ["Understands Japan's political system and history using maps and timelines.", "Considers the roles of historical events and explains them.", "Takes an interest in social issues and in the history of the region."],
    "Mathematics": ["Calculates accurately with fractions, ratios and areas.", "Explains reasoning about shapes, changes and data step by step.", "Looks for better solutions and checks results."],
    "Science": ["Records observations and experiments accurately.", "Forms hypotheses about patterns and changes and tests them.", "Works with others and applies findings to daily life."],
    "Music": ["Sings and plays instruments with correct rhythm and pitch.", "Listens closely and expresses intentions in performance.", "Enjoys music and practises with classmates."],
    "Art and Crafts": ["Uses materials and tools to make and present works.", "Develops ideas from shapes and colours.", "Enjoys creating and looks at artworks with interest."],
    "Home Economics": ["Understands food, clothing, housing and money at home.", "Finds problems in daily life and plans how to improve them.", "Helps with household tasks as a member of the family."],
    "Physical Education": ["Understands health and safety and has basic movement skills.", "Plans how to improve in games and exercises.", "Takes part actively and plays fairly with others."],
    "Foreign Language Activities": ["Understands simple English expressions used in class.", "Talks about familiar topics in simple English.", "Tries to communicate clearly with the listener in mind."],
}
# Marks by term, subject and perspective. The questions ask for some that differ between terms.
FIRST = {s: [rng.choice(MARKS[:2]) for _ in PERSPECTIVES] for s in SUBJECTS}
THIRD = {s: [rng.choice(MARKS[:2]) for _ in PERSPECTIVES] for s in SUBJECTS}
FIRST["Mathematics"][1] = "Needs Improvement"
THIRD["Mathematics"][1] = "Excellent"
FIRST["Home Economics"][0] = "Needs Improvement"
THIRD["Home Economics"][0] = "Good"
FIRST["Science"][2] = "Good"
THIRD["Science"][2] = "Excellent"
THIRD["Physical Education"] = ["Excellent"] * 3
THIRD["Foreign Language Activities"] = ["Excellent"] * 3
for s in SUBJECTS:
    if s not in ("Physical Education", "Foreign Language Activities") and THIRD[s] == ["Excellent"] * 3:
        THIRD[s][2] = "Good"
BEHAVIOUR = [
    ("Basic Life Habits", "Greets others and keeps a regular daily routine.", "Good"),
    ("Health & Physical Fitness", "Works to improve fitness and is full of energy.", "Excellent"),
    ("Independence & Self-discipline", "Sets goals and keeps working at them.", "Good"),
    ("Sense of Responsibility", "Carries out duties and can be trusted with them.", "Excellent"),
    ("Creativity & Initiative", "Tries new ideas to make class life better.", "Good"),
    ("Kindness & Cooperation", "Is kind to others and cooperates in groups.", "Excellent"),
    ("Respect for Life & Nature", "Cares for living things and the environment.", "Good"),
    ("Fairness & Justice", "Treats everyone fairly, without prejudice.", "Excellent"),
]

def p(text, bold=False):
    return f"<p>{'<b>' if bold else ''}{escape(text)}{'</b>' if bold else ''}</p>"

def marks_table(rows, first="Perspective"):
    head = "".join(f"<td>{escape(h)}</td>" for h in [first, "Description", *MARKS])
    body = "".join("<tr>" + f"<td>{escape(a)}</td><td>{escape(d)}</td>" + "".join(f"<td>{'◯' if m == mark else ''}</td>" for m in MARKS) + "</tr>" for a, d, mark in rows)
    return f'<table border="1"><tr>{head}</tr>{body}</table>'

def page(n, term, title, content, break_before=True):
    style = ' style="page-break-before: always"' if break_before else ""
    return f"<p{style}>【Page {n}】</p><p>Student Name: HANA TAKEDA<br/>Grade: 6<br/>{escape(title)} – {escape(term)}</p>{content}"

def learning(marks):
    return "".join(p(s, bold=True) + marks_table([(pp, DESCRIPTIONS[s][i], marks[s][i]) for i, pp in enumerate(PERSPECTIVES)]) for s in SUBJECTS)

staff = [("Principal", "Yuko Hirano"), ("Vice Principal", "Daisuke Ono"), ("Homeroom Teacher", "Kenji Mori"), ("Music", "Ayaka Sato"), ("Foreign Language", "Thomas Green")]
page3 = (
    p("Behavioral Evaluation", bold=True) + marks_table([(a, d, m) for a, d, m in BEHAVIOUR], first="Item")
    + p("Period for Integrated Studies", bold=True)
    + p("In “Our Town's River,” the student measured water quality with classmates and presented ways to keep the river clean.")
    + p("In “Reflecting on Myself at Age 12,” the student interviewed a guest speaker about her work and developed a dream of becoming a veterinarian.")
    + p("Special Activities / Committees", bold=True) + p("Library Committee") + p("Basketball Club")
    + p("School Life and Teacher's Comments", bold=True)
    + p("The student listens carefully to classmates and has become more confident in sharing her own ideas. She led her group well during the river project.")
    + p("School Staff", bold=True)
    + '<table border="1">' + "".join(f"<tr><td>{escape(r)}</td><td>{escape(n)}</td></tr>" for r, n in staff) + "</table>"
)
html = (
    '<html><head><meta charset="utf-8"/><title>Report card</title></head><body>'
    + page(1, "First Term", "Learning Record", learning(FIRST), break_before=False)
    + page(2, "Third Term", "Learning Record", learning(THIRD))
    + page(3, "Third Term", "Record of Behavior", page3)
    + "</body></html>"
)
with open(os.path.join(HERE, "report-card-2025.html"), "w", encoding="utf-8") as f:
    f.write(html)

# ---------------------------------------------------------------------------------------------
# An order workbook: a title row, orders with dates and yen amounts, customers on a second sheet,
# and a hidden sheet of returns.

CUSTOMERS = [
    ("Hayashi Kogyo", "Mai Hayashi", "06-6341-2287", "Osaka"),
    ("Mori Seika", "Ryo Mori", "075-221-4410", "Kyoto"),
    ("Sakura Foods", "Emi Kato", "078-391-5520", "Kobe"),
    ("Acme Trading", "John Miller", "06-6203-7715", "Osaka"),
    ("Nishida Textiles", "Koji Nishida", "0742-22-3108", "Nara"),
    ("Umeda Printing", "Saki Ueda", "06-6372-9054", "Osaka"),
    ("Kamo Brewery", "Hiroshi Kamo", "075-611-2236", "Kyoto"),
    ("Suma Marine", "Naoki Fujii", "078-731-6642", "Kobe"),
    ("Ikoma Garden", "Yui Tanaka", "0743-74-1189", "Ikoma"),
    ("Otsu Ceramics", "Ken Ishida", "077-524-8871", "Otsu"),
]
orders = []
day = date(2025, 4, 1)
for n in range(1001, 1061):
    day += timedelta(days=rng.randint(1, 4))
    customer = rng.choice(CUSTOMERS)[0]
    total = rng.randint(12, 480) * 1000
    status = "Delivered" if day < date(2025, 8, 20) else rng.choice(["Delivered", "Shipped"])
    orders.append([n, customer, day, total, status])
orders[46][4] = "Delayed"  # order 1047, the only delayed one
returns = [[1012, "Damaged in transit"], [1031, "Wrong colour"], [1050, "Duplicate order"]]

def cell(value, style=None):
    s = f' table:style-name="{style}"' if style else ""
    if isinstance(value, date):
        return f'<table:table-cell{s} office:value-type="date" office:date-value="{value.isoformat()}"><text:p>{value.year}/{value.month}/{value.day}</text:p></table:table-cell>'
    if isinstance(value, int) and style == "cyen":
        return f'<table:table-cell{s} office:value-type="currency" office:currency="JPY" office:value="{value}"><text:p>¥{value:,}</text:p></table:table-cell>'
    if isinstance(value, int):
        return f'<table:table-cell office:value-type="float" office:value="{value}"><text:p>{value}</text:p></table:table-cell>'
    return f'<table:table-cell office:value-type="string"><text:p>{escape(str(value))}</text:p></table:table-cell>'

def row(cells):
    return "<table:table-row>" + "".join(cells) + "</table:table-row>"

order_rows = "".join(row([cell(o[0]), cell(o[1]), cell(o[2], "cdate"), cell(o[3], "cyen"), cell(o[4])]) for o in orders)
fods = f'''<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:automatic-styles>
 <number:date-style style:name="Ndate"><number:year number:style="long"/><number:text>/</number:text><number:month/><number:text>/</number:text><number:day/></number:date-style>
 <number:currency-style style:name="Nyen"><number:currency-symbol>¥</number:currency-symbol><number:number number:decimal-places="0" number:min-integer-digits="1" number:grouping="true"/></number:currency-style>
 <style:style style:name="cdate" style:family="table-cell" style:data-style-name="Ndate"/>
 <style:style style:name="cyen" style:family="table-cell" style:data-style-name="Nyen"/>
 <style:style style:name="tshow" style:family="table"><style:table-properties table:display="true"/></style:style>
 <style:style style:name="thide" style:family="table"><style:table-properties table:display="false"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>
<table:table table:name="Orders" table:style-name="tshow">{row([cell("Orders 2025 – Kansai office")])}{row([])}{row([cell(h) for h in ["Order", "Customer", "Date", "Total", "Status"]])}{order_rows}</table:table>
<table:table table:name="Customers" table:style-name="tshow">{row([cell(h) for h in ["Customer", "Contact", "Phone", "City"]])}{"".join(row([cell(v) for v in c]) for c in CUSTOMERS)}</table:table>
<table:table table:name="Returns" table:style-name="thide">{row([cell("Order"), cell("Reason")])}{"".join(row([cell(r[0]), cell(r[1])]) for r in returns)}</table:table>
</office:spreadsheet></office:body></office:document>
'''
with open(os.path.join(HERE, "orders-2025.fods"), "w", encoding="utf-8") as f:
    f.write(fods)

# ---------------------------------------------------------------------------------------------
# A parts inventory in Japanese, as Japanese Excel saves CSV.

NAMES = ["六角ボルト", "ナット", "平ワッシャー", "スプリングワッシャー", "木ねじ", "タッピングねじ", "アンカーボルト", "蝶ボルト", "リベット", "ステンレスボルト", "六角ナット", "袋ナット"]
SIZES = ["M4", "M5", "M6", "M8", "M10", "M12"]
WAREHOUSES = ["大阪第一倉庫", "神戸倉庫", "京都倉庫"]
items, seen = [], set()
# 60 distinct items out of the 72 name and size pairs.
while len(items) < 60:
    name = f"{rng.choice(NAMES)} {rng.choice(SIZES)}"
    if name in seen:
        continue
    seen.add(name)
    received = date(2025, 1, 6) + timedelta(days=rng.randint(0, 290))
    items.append([f"B-{1001 + len(items)}", name, rng.choice(WAREHOUSES), rng.randint(0, 2400), rng.randint(8, 1800), received])
lines = ["品番,品名,倉庫,在庫数,単価,最終入荷日"] + [f"{i[0]},{i[1]},{i[2]},{i[3]},\"¥{i[4]:,}\",{i[5].year}/{i[5].month}/{i[5].day}" for i in items]
text = "\r\n".join(lines) + "\r\n"
with open(os.path.join(HERE, "inventory.csv"), "w", encoding="utf-8", newline="") as f:
    f.write(text)
with open(os.path.join(OUT, "inventory-sjis.csv"), "wb") as f:
    f.write(text.replace("¥", "\\").encode("cp932"))

# ---------------------------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as tmp:
    for source, target, fmt in [("report-card-2025.html", "report-card-2025.docx", "docx:MS Word 2007 XML"), ("orders-2025.fods", "orders-2025.xlsx", "xlsx")]:
        subprocess.run(["soffice", "--headless", "--convert-to", fmt, "--outdir", tmp, os.path.join(HERE, source)], check=True, capture_output=True)
        shutil.move(os.path.join(tmp, target), os.path.join(OUT, target))
print("wrote", ", ".join(sorted(f for f in os.listdir(OUT) if not os.path.isdir(os.path.join(OUT, f)))))
