# Office and OpenDocument files

Kovrune reads Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument text (.odt), presentation (.odp) and spreadsheet (.ods), and CSV and TSV files, besides PDF, text, Markdown and HTML (decision D3a in [`m1-plan.md`](m1-plan.md)). This page says how, and what is left out.

## Phases

| Phase | Formats | Status |
| --- | --- | --- |
| 1 | .docx, .pptx, .odt, .odp | Done |
| 2 | .xlsx, .ods | Done, for looking up rows ([Spreadsheets](#spreadsheets)). Totals, averages and counts over many rows need a calculation tool, which is not planned yet. |
| 2b | .csv, .tsv | Done ([CSV and TSV](#csv-and-tsv)): read as one sheet, in UTF-8, UTF-16 or Shift_JIS. |
| — | .doc, .ppt, .xls, .rtf | Not planned. These are binary formats, each needing its own parser for files that are now rare. The app explains how to save them as .docx, .pptx, .xlsx or PDF. |

## How the files are read

The six Office and OpenDocument formats are ZIP archives of XML. Reading them needs no library:

- **ZIP** (`src/documents/zip.ts`): reads the archive's central directory and inflates entries with the platform's `DecompressionStream("deflate-raw")`, which browsers and Node 22 both have.
- **XML** (`src/documents/xml.ts`): a small reader that walks elements and text without building a tree. It names elements by namespace, not by the prefix the file uses, so files that declare unusual prefixes, and Strict OOXML, read the same as everything else. It runs the same in browsers and Node, so the tests check the code the app runs.
- **Formats** (`src/documents/office.ts`): which elements hold text, for each format.

Libraries were considered and not used. mammoth (.docx) brings four other packages, SheetJS's npm package is no longer kept up to date, and several readers that cover all four formats bring many more. Each would add to what the app has to trust ([`design.md`](design.md) §7.3: minimal, pinned dependencies). Writing our own also controls exactly what text comes out, which matters because quotes are checked against it word for word. The new code adds about 5 KB (gzipped) to the app.

## What text comes out

Quotes are checked word for word against the text, so it should be what the reader sees, in reading order:

- **Paragraphs** are separated by a blank line, as in Markdown, so long documents are split into parts at paragraphs.
- **Tables:** one line per row. Each value is labelled with its column's header when the table has a header row; otherwise cells are separated by tabs, empty cells included. See [Tables](#tables).
- **Left out:**
  - text deleted with tracked changes (in Word, also text moved elsewhere)
  - comments
  - field codes (Word keeps the field's result, such as "see page 3")
  - the second copy of a drawing that Word keeps for older readers (`mc:Fallback`), which would show text boxes twice
  - formatting, and descriptions of images (`svg:desc`)
  - headers and footers, which repeat on every page
  - slide number and date fields
- **Footnotes and endnotes** follow the text under a "Footnotes" or "Endnotes" heading, numbered in order. They are not left in the middle of the sentence that refers to them.
- **Slides** are pages: each is followed by its speaker notes ("Speaker notes:"), and quotes are cited as "slide 4". PowerPoint slides are read in the order the presentation shows them, which can differ from the order of the slides' file names once slides have been moved.
- **Word and Writer files have no page numbers.** Their pages depend on the layout. Word sometimes saves where pages ended when the file was last laid out, but LibreOffice, Google Docs and pandoc don't, and that position is often also marked by an explicit page break, so pages could be counted twice. A wrong page number would mislead more than none, so quotes from these files show no page, as with text files.
- **Not read yet:** charts, SmartArt, pictures (there is no OCR), and text in slide masters and layouts.

The same report saved as .docx by pandoc and as .odt by LibreOffice gives the same text, and the tests check this (`tests/office.test.ts`).

## Tables

A table's meaning is often in which column a value is in. A report card marks "◯" under **Excellent**, **Good** or **Needs Improvement**, and the mark means nothing without its column. Phase 1 lost this: empty cells left no trace, so every "◯" came straight after the description. A preview user's question about a report card ended as "answer not confirmed", because the grade was not in the text the model read.

So, since reader version 2 (`src/documents/tables.ts`):

- **With a header row,** each value is written with its column's header, and the bars between cells mark where each one starts:

  ```
  Perspective | Description | Excellent | Good | Needs Improvement
  Perspective: Knowledge & Skills | Description: Understands the use of words. | Good: ◯
  ```

  Even with every column kept, a 4B model counting tabs back to the header row gets the column wrong, while a label next to the value is hard to miss. Empty cells are left out: the labels say where each value is.
- **Without a header row,** cells are separated by tabs, and empty cells keep their tab, so a value stays in its column: `Ada		36`.
- **Which rows are headers.** A row the file marks as a header always counts: Word's repeated header row (`w:tblHeader`), PowerPoint's first-row style (`firstRow`), ODF's `table:table-header-rows` and Impress's `table:use-first-row-styles`. Otherwise, the first row counts as a header only if the table has at least two rows and three columns, and every cell of the first row is filled, at most 60 characters long, not a number and not a sentence (it doesn't end with ".", "!", "?" or "。"). Two-column tables are left alone unless marked: they are usually labels and values ("Principal | Tomoko Yamafuji"), and labelling their values with the first row's data would be wrong. A header of two rows names each column with both ("Grade Term 1").
- **Merged cells.** A cell spanning columns is placed in the first of them; a header cell spanning columns names each of them. A cell merged down over several rows is repeated in each row it covers, so every row reads whole (Word's `vMerge`, PowerPoint's `vMerge`, and ODF's covered cells that no span to their left accounts for).
- **One line per row.** A cell's paragraphs, line breaks and tabs become spaces, and a table inside a cell is written into the cell on its line.
- **Quotes.** The labels are in the text quotes are checked against, so **Show text** shows them, though the document doesn't spell them out. A quote copied from the document still verifies as long as it stays within one cell. Quote checking ignores a "|" standing alone, like a list bullet, so a model that quotes a row without the bars is still found.

Only the text of a document is saved, not the file, so a document read before version 2 can't be read again without it. The library points such documents out, with a note to remove them and add the file again. Each Office document is saved with the version of the reader that read it (`OFFICE_READER_VERSION` in `office.ts`); one without a version was read by version 1.

The labels were not measured on a model before they were adopted (building llama.cpp was not available where they were written). They changed no benchmark suite then, since none had Office documents. Since harness 0.58.0, the [office suite](../eval/field/README.md#office-documents-0580) asks questions over a report card's tables, a workbook and a CSV file; it has not yet been run on Qwen3.5-2B and 4B.

## Spreadsheets

Excel (.xlsx) and OpenDocument (.ods) workbooks are read for **looking up rows**: "Which orders are delayed?", "What is Acme Trading's phone number?". Search finds the rows and quotes are checked word for word, as in any document. Questions over many rows (totals, averages, counts) are not answered well: the model reads a few parts of a document, never a whole sheet, and a 4B model adds up unreliably; the quote check would show that the rows it used are real, not that its sum is right. That needs a calculation tool that runs over the whole sheet, related to M2.5's sandbox.

**Text** (`src/documents/sheets.ts`):

```
Sheet: Orders
Orders 2025 (Kansai office)
Order | Customer | Date | Total | Discount | Status
Order: 1001 | Customer: Acme Trading | Date: 2025-03-01 | Total: ¥125,000 | Discount: 5.0% | Status: Delivered
```

- **One sheet per page,** so quotes are cited as "sheet 2". The sheet's line says "(hidden)" for hidden sheets, which are read too. Chart sheets, charts and pictures are not read.
- **The header** is the first row with two or more filled cells, if each of them names a column (has a letter in it and is at most 60 characters long). Rows above it are written as they are: titles, dates. Every row below is labelled with the header's names, as [tables](#tables) in documents are; without a header, cells are separated by tabs, empty ones included. A sheet with no row of two cells, such as a list in one column, is written row by row. A header of dates or numbers (columns headed "2025/1", "2025/2") is not taken for one; its rows are written with tabs.
- **Merged cells** are placed as merged table cells are: a cell merged across columns in the first of them, a cell merged down repeated in each row.
- **Long sheets are split between rows.** Rows are written in blocks of at most about 1,400 characters, each starting with the sheet's line, and a document is split into parts at those blocks (`chunk.ts`). So a part never cuts a row in half, and a part read on its own still says which sheet it is from and, through its labels, which column each value is in. The sheet's line in every block is not in the file; neither are the labels, and **Show text** shows both.
- **Limits:** 20,000 rows per workbook and 100 columns per sheet. Beyond that, the document says what was left out and suggests splitting the file. A 20,000-row sheet of 6 columns is read in about a second, as 2.1 million characters and about 1,500 parts; building the search index over it takes about 0.2 seconds and a search a few milliseconds.

**Values as the cell shows them.** Excel stores a value and, separately, how to show it: the date 2025-03-01 is stored as 45717 with a format such as `yyyy/m/d` (`src/documents/number-format.ts`).

- **Dates and times:** days are counted from 1900 (with Excel's 29 February 1900) or, in workbooks with the 1904 date system, from 1904. Formats such as `yyyy/m/d`, `yyyy"年"m"月"d"日"`, `d-mmm-yy`, `h:mm AM/PM` and `[h]:mm` are followed; "m" is minutes after an hour or before seconds, months otherwise; times are rounded to the second, as Excel does. The built-in short date (format 14) and the East Asian built-in dates, whose look depends on the reader's language settings (2025/3/1, 3/1/2025, 令和7年3月1日), are written as ISO dates (2025-03-01).
- **Numbers:** thousands separators, decimals (fixed `0.00` and optional `0.##`), percentages, scientific notation, thousands scaling (`#,##0,"K"`), currency symbols (`"¥"#,##0`, `[$€-407]`), text around the number (`#,##0"円"`), and separate sections for negative numbers and zero. Anything else is written as Excel's General format shows it.
- **Other cells:** text from shared and inline strings, without Japanese reading guides (furigana, which Excel stores but does not show); TRUE and FALSE; error codes (#N/A, #DIV/0!); and for formulas, the value Excel saved with the file (the formula itself is not run).
- **OpenDocument** keeps each cell's text as LibreOffice shows it, so .ods cells are written as they are, with no formats to apply. A workbook saved as both .xlsx and .ods by LibreOffice gives the same text (`tests/sheets.test.ts`).

## CSV and TSV

A CSV file is text, but read as plain text it would be neither readable nor searchable in two common cases, so it is read as a sheet (`src/documents/delimited.ts`, then `readRows` in `sheets.ts`):

- **Encoding.** Japanese Excel's "CSV (comma delimited)" saves in Shift_JIS, which read as UTF-8 turns every Japanese word into replacement characters ("東京" becomes "����"). So a file is decoded by its byte-order mark if it has one (Excel's "CSV UTF-8" writes one; its "Unicode text" is UTF-16), else as UTF-8 if it is valid UTF-8, else as Shift_JIS, in the browser's Windows-932 variant (㈱, ①, NEC and IBM kanji). Shift_JIS has no ¥ of its own: byte 0x5C, shown as ¥ in Japanese Windows, decodes as a backslash, so Excel's "¥125,000" would read "\125,000". A backslash right before an amount is therefore written as ¥; other backslashes stay. Other legacy encodings (Windows-1252, GBK, Big5) are not told apart and come out with replacement characters; saving as "CSV UTF-8" avoids that.
- **Columns.** Read as text, a row is "1002,Sakura Foods,2025-03-14,250000,Delayed", and the header is only at the top of the file, which most parts of a long file never see. Parsed, its rows are labelled and split into blocks like any sheet's: `Sheet: orders` (the file name without its extension, as Excel names the sheet on opening it), then `Order: 1002 | Customer: Sakura Foods | …`.
- **Parsing** follows RFC 4180, as Excel and LibreOffice write it: a quoted cell may hold the delimiter, line breaks and doubled quotes; lines may end with CRLF, LF or CR. A cell's line breaks become spaces, as in any table. `.tsv` and `.tab` files use tabs; for `.csv` the delimiter is the one of comma, semicolon and tab that occurs most in the first line outside quotes (Excel writes semicolons where the decimal mark is a comma).
- **Values** are as the file has them: Excel writes cells into CSV as it shows them, so there are no formats to apply.
- **One sheet, no sheet numbers:** quotes from a CSV file show no page. The [limits](#spreadsheets) are a spreadsheet's: 20,000 rows and 100 columns.
- **Telling it apart:** a file's extension decides its kind before its media type, since browsers report a .csv as text/plain, or as Excel's type on Windows.

## Untrusted files

Documents are untrusted ([`design.md`](design.md) §7.1). Reading them:

- **Zip bombs:** each entry's size is counted while it inflates, not taken from the archive's directory, which could be wrong on purpose. One entry may inflate to at most 64 MB, all entries from one file together to 256 MB, and a file may list at most 20,000 entries.
- **XML entities:** the XML reader never reads a DTD and expands only the five predefined entities and numeric character references, so a file cannot make it fetch a URL (XXE) or expand into a huge string ("billion laughs").
- **Macros** and embedded objects are never run or opened: only the XML parts that hold text are read.
- **Password-protected files** cannot be read. Office files are then not ZIP archives but OLE2 compound files, which are recognised by their first eight bytes. OpenDocument files say so in their manifest. Either way the user is told to remove the password.
- **A file that isn't what its extension says,** such as a spreadsheet named .odt, gets a message saying what it holds.
- **Spreadsheets padded out to their full size:** LibreOffice writes the empty rows and columns after the data as repeats, up to a million rows and 1,024 columns. Empty repeats are skipped and filled ones capped at the row and column limits, so they cost nothing.
- The text then goes through the same steps as every other document, including being marked as untrusted in the model's prompt.

Speed: a Word or Writer file of about 2.4 million characters (well over 1,000 pages) is read in about 0.1 seconds.

## Saved documents and backups

Saved documents and backups keep the document's kind (`records.ts`). Old backups still restore.

Version 0.1.0 rejects a whole backup if one of its documents has a kind it doesn't know, and calls the backup damaged. So a backup is written with the lowest version that knows all its documents' kinds: version 1 for text, Markdown, HTML and PDF only, 2 with Word, PowerPoint or OpenDocument text and presentation files, 3 with spreadsheets, 4 with CSV or TSV files. A version older than a backup says instead that it was made by a newer version and the app should be updated.

In the browser's own storage, an older version reading an Office document (for example after going back from the preview to a release in the same browser) sets that document aside as damaged and keeps the rest.

Quotes are cited as slides in a presentation, sheets in a spreadsheet, and pages elsewhere. Which applies is worked out from the cited document's file name, so the right word is used in answers saved before presentations could be read, and in exports.
