# Test fixtures

- `ada-lovelace-lead.txt`: the lead section of the English Wikipedia article
  [Ada Lovelace](https://en.wikipedia.org/wiki/Ada_Lovelace), as read on 25 October 2026,
  with reference markers removed. Text is available under the
  [Creative Commons Attribution-ShareAlike 4.0 License](https://creativecommons.org/licenses/by-sa/4.0/).
  It reproduces quotes a small model gave during the M1 class 1 live checks (`docs/m1-plan.md`).
- `office/`: one short report (`report.md`, written for these tests) in four formats, to check that
  each is read the same way (`tests/office.test.ts`). `report.docx` and `report.pptx` were made from
  it with pandoc 3; `report.odt` and `report.odp` were saved by LibreOffice from those.
