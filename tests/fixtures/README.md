# Test fixtures

- `ada-lovelace-lead.txt`: the lead section of the English Wikipedia article
  [Ada Lovelace](https://en.wikipedia.org/wiki/Ada_Lovelace), as read on 25 October 2026,
  with reference markers removed. Text is available under the
  [Creative Commons Attribution-ShareAlike 4.0 License](https://creativecommons.org/licenses/by-sa/4.0/).
  It reproduces quotes a small model gave during the M1 class 1 live checks (`docs/m1-plan.md`).
- `office/`: one short report (`report.md`, written for these tests) in four formats, to check that
  each is read the same way (`tests/office.test.ts`). `report.docx` and `report.pptx` were made from
  it with pandoc 3; `report.odt` and `report.odp` were saved by LibreOffice from those.
- `office/orders.fods`: a small two-sheet workbook written for these tests (made-up orders, a hidden
  contacts sheet), as flat OpenDocument XML; `orders.xlsx` and `orders.ods` were saved from it by
  LibreOffice 24.2 (`tests/sheets.test.ts`); `orders-libreoffice.csv` is its first sheet, saved as CSV by
  LibreOffice 24.2 with cells as shown (`tests/csv.test.ts`).
- `office/orders-sjis.csv` and `office/orders-utf8-bom.csv`: made-up Japanese orders, written for these
  tests as Japanese Excel saves "CSV (comma delimited)" (Windows-932 Shift_JIS, CRLF, the yen sign as
  byte 0x5C) and "CSV UTF-8" (with a byte-order mark).
