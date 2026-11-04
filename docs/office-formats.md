# Office and OpenDocument files

Kovrune reads Word (.docx), PowerPoint (.pptx), OpenDocument text (.odt) and OpenDocument presentation (.odp) files, besides PDF, text, Markdown and HTML (decision D3a in [`m1-plan.md`](m1-plan.md)). This page says how, and what is left out.

## Phases

| Phase | Formats | Status |
| --- | --- | --- |
| 1 | .docx, .pptx, .odt, .odp | Done |
| 2 | .xlsx, .ods | Not started. Needs number and date formats read from the file's styles, or numbers would not match what the user sees (a date is stored as a number such as 45717). Spreadsheets also suit passage search less well, so the first step is to ask testers whether they want it. |
| — | .doc, .ppt, .xls, .rtf | Not planned. These are binary formats, each needing its own parser for files that are now rare. The app explains how to save them as .docx, .pptx or PDF. |

## How the files are read

All four formats are ZIP archives of XML. Reading them needs no library:

- **ZIP** (`src/documents/zip.ts`): reads the archive's central directory and inflates entries with the platform's `DecompressionStream("deflate-raw")`, which browsers and Node 22 both have.
- **XML** (`src/documents/xml.ts`): a small reader that walks elements and text without building a tree. It names elements by namespace, not by the prefix the file uses, so files that declare unusual prefixes, and Strict OOXML, read the same as everything else. It runs the same in browsers and Node, so the tests check the code the app runs.
- **Formats** (`src/documents/office.ts`): which elements hold text, for each format.

Libraries were considered and not used. mammoth (.docx) brings four other packages, SheetJS's npm package is no longer kept up to date, and several readers that cover all four formats bring many more. Each would add to what the app has to trust ([`design.md`](design.md) §7.3: minimal, pinned dependencies). Writing our own also controls exactly what text comes out, which matters because quotes are checked against it word for word. The new code adds about 5 KB (gzipped) to the app.

## What text comes out

Quotes are checked word for word against the text, so it should be what the reader sees, in reading order:

- **Paragraphs** are separated by a blank line, as in Markdown, so long documents are split into parts at paragraphs.
- **Tables:** a tab between cells and a line break between rows. Paragraphs inside a cell are joined by spaces.
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

## Untrusted files

Documents are untrusted ([`design.md`](design.md) §7.1). Reading them:

- **Zip bombs:** each entry's size is counted while it inflates, not taken from the archive's directory, which could be wrong on purpose. One entry may inflate to at most 64 MB, all entries from one file together to 256 MB, and a file may list at most 20,000 entries.
- **XML entities:** the XML reader never reads a DTD and expands only the five predefined entities and numeric character references, so a file cannot make it fetch a URL (XXE) or expand into a huge string ("billion laughs").
- **Macros** and embedded objects are never run or opened: only the XML parts that hold text are read.
- **Password-protected files** cannot be read. Office files are then not ZIP archives but OLE2 compound files, which are recognised by their first eight bytes. OpenDocument files say so in their manifest. Either way the user is told to remove the password.
- **A file that isn't what its extension says,** such as a spreadsheet named .odt, gets a message saying what it holds.
- The text then goes through the same steps as every other document, including being marked as untrusted in the model's prompt.

Speed: a Word or Writer file of about 2.4 million characters (well over 1,000 pages) is read in about 0.1 seconds.

## Saved documents and backups

Saved documents and backups keep the document's kind (`records.ts`). Old backups still restore.

Version 0.1.0 rejects a whole backup if one of its documents has a kind it doesn't know, and calls the backup damaged. So a backup with an Office document in it is written as backup version 2, and older versions say instead that it was made by a newer version and the app should be updated. Backups without Office documents are still written as version 1, so every version can restore them.

In the browser's own storage, an older version reading an Office document (for example after going back from the preview to a release in the same browser) sets that document aside as damaged and keeps the rest.

Quotes are cited as slides in a presentation, and as pages elsewhere. Which applies is worked out from the cited document's file name, so the right word is used in answers saved before presentations could be read, and in exports.
