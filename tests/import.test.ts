import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeImport, planImport, withExports, workFor } from "../src/app/research/import.ts";
import type { LibraryDocument } from "../src/app/research/library.ts";
import { parseBibtex } from "../src/documents/references.ts";

const file = (path: string, size = 100) => ({ name: path.split("/").pop()!, size, path });

const doc = (fileName: string, text: string, extra: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id: fileName.replace(/\W+/g, "-"),
  title: fileName,
  text,
  fileName,
  kind: "pdf",
  bytes: 100,
  ...extra,
});

const EXPORT = [
  {
    source: "library.bib",
    entries: parseBibtex(`@article{a, title = {Fatigue of Welded Joints under Variable Amplitude Loading}, author = {Sonsino, C. M.}, year = {2018},
      doi = {10.1016/j.ijfatigue.2017.11.004}, journal = {International Journal of Fatigue}, file = {:files/7/sonsino.pdf:application/pdf}}`),
  },
];

describe("adding a folder", () => {
  it("sorts documents, exports, files already here, unreadable and hidden files", () => {
    const plan = planImport(
      [
        file("Papers/sonsino.pdf"),
        file("Papers/notes.docx"),
        file("Papers/library.bib"),
        file("Papers/Export.ris"),
        file("Papers/old.doc"),
        file("Papers/.DS_Store"),
        file("Papers/.git/config"),
        file("__MACOSX/Papers/._sonsino.pdf"),
        file("Papers/report.pdf", 2048),
        file("Papers/copy/report.pdf", 2048),
      ],
      [{ fileName: "notes.docx", bytes: 100 }],
    );
    assert.deepEqual(plan.documents.map((f) => f.path), ["Papers/sonsino.pdf", "Papers/report.pdf"]);
    assert.deepEqual(plan.references.map((f) => f.name), ["library.bib", "Export.ris"]);
    // The same name and size: already in the library, or twice in the folder.
    assert.deepEqual(plan.duplicates.map((f) => f.path), ["Papers/notes.docx", "Papers/copy/report.pdf"]);
    assert.deepEqual(plan.unsupported.map((f) => f.name), ["old.doc"]);
    assert.equal(plan.hidden, 3);
  });

  it("gives a document the export's details, else the DOI it prints", () => {
    const fromExport = workFor(doc("sonsino.pdf", "Unrelated."), EXPORT);
    assert.equal(fromExport?.from, "export");
    assert.equal(fromExport?.title, "Fatigue of Welded Joints under Variable Amplitude Loading");
    const fromText = workFor(doc("other.pdf", "Journal 12 (2020)\ndoi:10.1000/xyz.42\nBody."), EXPORT);
    assert.deepEqual(fromText, { authors: [], doi: "10.1000/xyz.42", from: "text" });
    assert.equal(workFor(doc("plain.pdf", "No identifiers here."), EXPORT), undefined);
    // Details already found are kept when no export matches.
    const looked = { authors: ["X Y"], doi: "10.1000/xyz.42", from: "openalex" as const };
    assert.equal(workFor(doc("other.pdf", "doi:10.1000/xyz.42", { work: looked }), []), looked);
  });

  it("matches an export added later to the documents already here, copying only those it matches", () => {
    const matched = doc("download.pdf", "International Journal of Fatigue\nhttps://doi.org/10.1016/j.ijfatigue.2017.11.004");
    const other = doc("other.pdf", "Nothing to match.");
    const { docs, matched: count } = withExports([matched, other], EXPORT);
    assert.equal(count, 1);
    assert.notEqual(docs[0], matched);
    assert.equal(docs[0]!.work?.authors[0], "C. M. Sonsino");
    assert.equal(docs[1], other);
  });

  it("says what an import did", () => {
    assert.equal(
      describeImport({ added: 84, withDetails: 61, duplicates: 3, unsupported: ["a.doc", "b.ppt", "c.rtf", "d.xls"], failed: 1, exports: 1, matchedExisting: 0 }),
      "Added 84 documents, 61 with paper details. Skipped 3 already in your documents. Skipped 4 files Kovrune can't read (a.doc, b.ppt, c.rtf, …). 1 could not be read; see below.",
    );
    assert.equal(describeImport({ added: 0, withDetails: 0, duplicates: 0, unsupported: [], failed: 0, exports: 1, matchedExisting: 12 }), "Matched 12 documents already here to the reference export.");
    assert.equal(describeImport({ added: 0, withDetails: 0, duplicates: 0, unsupported: [], failed: 0, exports: 1, matchedExisting: 0 }), "No document here matched the reference export.");
  });
});
