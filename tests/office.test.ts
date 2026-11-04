import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { describePages } from "../src/app/research/trace.ts";
import { quotePages, type SavedAnswer } from "../src/app/research/answers.ts";
import { documentSchema } from "../src/app/research/records.ts";
import { makeBackup, parseBackup } from "../src/app/research/backup.ts";
import { ACCEPT } from "../src/app/research/library.ts";
import { detectKind, extractText, pageUnit, type PdfJsLike } from "../src/documents/extract.ts";
import { extractOfficeText } from "../src/documents/office.ts";
import { walkXml } from "../src/documents/xml.ts";
import { openZip, ZipError } from "../src/documents/zip.ts";

const noPdf = async (): Promise<PdfJsLike> => {
  throw new Error("not needed");
};

/** A file as the browser's File gives it, from bytes. */
const file = (name: string, bytes: Uint8Array) => ({ name, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/office/${name}`, import.meta.url)));

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A ZIP archive of the given text files, stored or deflated. CRCs are left at zero: the reader
 * does not check them (DecompressionStream checks the deflate stream itself).
 */
async function makeZip(files: Record<string, string | Uint8Array>, options: { deflate?: boolean; claimedSize?: number } = {}): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const stored = options.deflate ? await deflateRaw(data) : data;
    const nameBytes = encoder.encode(name);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(8, options.deflate ? 8 : 0, true);
    header.setUint32(18, stored.length, true);
    header.setUint32(22, options.claimedSize ?? data.length, true);
    header.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(header.buffer), nameBytes, stored);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, options.deflate ? 8 : 0, true);
    entry.setUint32(20, stored.length, true);
    entry.setUint32(24, options.claimedSize ?? data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + stored.length;
  }
  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const ODF = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
].join(" ");

const docx = (body: string, extra: Record<string, string> = {}) =>
  makeZip(
    {
      "[Content_Types].xml": "<Types/>",
      "_rels/.rels": `<Relationships ${RELS}><Relationship Id="rId1" Type="${TYPE}/officeDocument" Target="word/document.xml"/></Relationships>`,
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
      ...extra,
    },
    { deflate: true },
  );

const para = (...runs: string[]) => `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;

describe("ZIP archives", () => {
  it("reads stored and deflated entries", async () => {
    for (const deflate of [false, true]) {
      const zip = openZip(await makeZip({ "a.xml": "<a>héllo</a>", "b/c.txt": "x".repeat(5000) }, { deflate }));
      assert.deepEqual(zip.names, ["a.xml", "b/c.txt"]);
      assert.equal(await zip.text("a.xml"), "<a>héllo</a>");
      assert.equal((await zip.text("b/c.txt"))?.length, 5000);
      assert.equal(await zip.text("missing"), undefined);
    }
  });

  it("stops an entry that inflates past the limit, whatever size the directory claims", async () => {
    // 2 MB of zeros deflates to a few kilobytes; the directory claims 10 bytes.
    const bytes = await makeZip({ "bomb.xml": new Uint8Array(2 * 2 ** 20) }, { deflate: true, claimedSize: 10 });
    assert.ok(bytes.length < 10_000);
    const zip = openZip(bytes, { maxEntries: 10, maxEntryBytes: 2 ** 20, maxTotalBytes: 4 * 2 ** 20 });
    await assert.rejects(zip.text("bomb.xml"), (error: unknown) => error instanceof ZipError && /expands too much/.test(error.message));
  });

  it("counts the inflated size of all entries read from one archive", async () => {
    const zip = openZip(await makeZip({ a: "x".repeat(600), b: "y".repeat(600) }, { deflate: true }), { maxEntries: 10, maxEntryBytes: 1000, maxTotalBytes: 1000 });
    assert.equal((await zip.text("a"))?.length, 600);
    await assert.rejects(zip.text("b"), /expands too much/);
  });

  it("rejects damaged archives and too many entries", async () => {
    assert.throws(() => openZip(new TextEncoder().encode("PK\u0003\u0004 not really")), ZipError);
    const many = await makeZip(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}`, ""])));
    assert.throws(() => openZip(many, { maxEntries: 4, maxEntryBytes: 100, maxTotalBytes: 100 }), /too many parts/);
    const cut = await makeZip({ "a.xml": "<a/>".repeat(100) }, { deflate: true });
    assert.throws(() => openZip(cut.slice(0, cut.length - 30)), ZipError);
  });
});

describe("XML reading", () => {
  it("names elements by namespace, whatever prefix the file uses", () => {
    const names: string[] = [];
    walkXml(`<x:document xmlns:x="http://purl.oclc.org/ooxml/wordprocessingml/main"><x:t>a</x:t><y:t xmlns:y="urn:other">b</y:t></x:document>`, {
      open: (name) => void names.push(name),
    });
    assert.deepEqual(names, ["w:document", "w:t", "y:t"], "Strict OOXML's URI and a custom prefix both read as w:");
  });

  it("decodes entities and CDATA, keeps '>' inside attribute values, and expands no declared entities", () => {
    let text = "";
    const attrs: string[] = [];
    walkXml(`<!DOCTYPE r [<!ENTITY big "boom">]><r a="1 > 0" b='x'>&lt;a&gt; &amp; &#233;&#x4E2D; &big;<![CDATA[<raw>]]></r>`, {
      open: (_, attr) => void attrs.push(attr("a") ?? "", attr("b") ?? ""),
      text: (t) => void (text += t),
    });
    assert.deepEqual(attrs, ["1 > 0", "x"]);
    assert.equal(text, "<a> & é中 &big;<raw>");
  });
});

describe("Word files", () => {
  it("reads paragraphs, tables, tabs, breaks and footnotes in a real file", async () => {
    const result = await extractText(file("report.docx", fixture("report.docx")), noPdf);
    assert.equal(result.kind, "docx");
    assert.equal(result.pageStarts, undefined, "Word files have no fixed pages");
    assert.equal(
      result.text,
      "Annual Report 2025\n\nThe project is licensed under the “Mozilla Public License 2.0”. Revenue grew by 12.5 % in Q3.\n\n" +
        "Region\tUsers\nEurope\t1,204\nAsia\t980\n\nA footnote follows.\n\nFootnotes\n\n1. Data from the internal survey, March 2025.",
    );
  });

  it("leaves out deleted text, field codes, fallback copies and formatting, and keeps inserted text", async () => {
    const body =
      para("The budget is ") +
      `<w:p><w:r><w:t>Income was EUR </w:t></w:r><w:del w:id="1"><w:r><w:delText>400,000</w:delText></w:r></w:del>` +
      `<w:ins w:id="2"><w:r><w:t>450,000</w:t></w:r></w:ins><w:moveFrom><w:r><w:t>moved away</w:t></w:r></w:moveFrom>` +
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>, see page 3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
      `<w:r><w:t>.</w:t><w:tab/><w:t>Next</w:t><w:br/><w:t>line</w:t><w:noBreakHyphen/><w:t>x fi­nance</w:t></w:r></w:p>` +
      `<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="wps"><w:drawing><w:txbxContent><w:p><w:r><w:t>Text box</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Text box</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="12240"/></w:sectPr>`;
    const { text } = await extractOfficeText(await docx(body), "docx");
    assert.equal(text, "The budget is\n\nIncome was EUR 450,000, see page 3.\tNext\nline-x finance\n\nText box");
  });

  it("joins a table cell's paragraphs with spaces, and keeps empty paragraphs from piling up", async () => {
    const cell = (...ps: string[]) => `<w:tc><w:tcPr/>${ps.map((p) => para(p)).join("")}</w:tc>`;
    const body = `${para("Before")}<w:p/><w:p/><w:tbl><w:tblPr/><w:tr>${cell("Name", "(full)")}${cell("Age")}</w:tr><w:tr>${cell("Ada")}${cell("36")}</w:tr></w:tbl>${para("After")}`;
    const { text } = await extractOfficeText(await docx(body), "docx");
    assert.equal(text, "Before\n\nName (full)\tAge\nAda\t36\n\nAfter");
  });

  it("finds the document through the package's relationships, and its endnotes", async () => {
    const bytes = await makeZip({
      "_rels/.rels": `<Relationships ${RELS}><Relationship Id="r" Type="${TYPE}/officeDocument" Target="/word/main.xml"/></Relationships>`,
      "word/main.xml": `<w:document ${W}><w:body>${para("Main text.")}</w:body></w:document>`,
      "word/_rels/main.xml.rels": `<Relationships ${RELS}><Relationship Id="e" Type="${TYPE}/endnotes" Target="notes/end.xml"/><Relationship Id="x" Type="${TYPE}/hyperlink" Target="https://example.org" TargetMode="External"/></Relationships>`,
      "word/notes/end.xml": `<w:endnotes ${W}><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:id="1">${para("An endnote.")}</w:endnote></w:endnotes>`,
    });
    assert.equal((await extractOfficeText(bytes, "docx")).text, "Main text.\n\nEndnotes\n\n1. An endnote.");
  });

  it("verifies a quote that spans runs and formatting", async () => {
    const result = await extractText(file("report.docx", await docx(para("The project is ", "licensed under ", "the Mozilla Public License."))), noPdf);
    const [checked] = checkEvidence([{ docId: "report", quote: "The project is licensed under the Mozilla Public License" }], () => result.text);
    assert.equal(checked!.verified, true);
  });
});

describe("PowerPoint files", () => {
  const slide = (...paragraphs: string[]) =>
    `<p:sld ${A} ${P}><p:cSld><p:spTree><p:sp><p:txBody>${paragraphs.map((t) => `<a:p><a:r><a:rPr lang="en"/><a:t>${t}</a:t></a:r></a:p>`).join("")}` +
    `<a:p><a:fld id="{1}" type="slidenum"><a:t>‹#›</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

  it("reads slides in the order shown, with speaker notes, one page per slide", async () => {
    // The second slide shown is slide1.xml: moving slides reorders the list, not the parts.
    const bytes = await makeZip(
      {
        "_rels/.rels": `<Relationships ${RELS}><Relationship Id="rId1" Type="${TYPE}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
        "ppt/presentation.xml": `<p:presentation ${P} ${R}><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
        "ppt/_rels/presentation.xml.rels": `<Relationships ${RELS}><Relationship Id="rId2" Type="${TYPE}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${TYPE}/slide" Target="slides/slide2.xml"/><Relationship Id="rId4" Type="${TYPE}/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`,
        "ppt/slides/slide1.xml": slide("Results", "Revenue grew by 12 percent."),
        "ppt/slides/slide2.xml": slide("Introduction"),
        "ppt/slides/_rels/slide1.xml.rels": `<Relationships ${RELS}><Relationship Id="n" Type="${TYPE}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
        "ppt/notesSlides/notesSlide1.xml": slide("Mention the Q3 dip."),
      },
      { deflate: true },
    );
    const result = await extractText(file("deck.pptx", bytes), noPdf);
    assert.equal(result.text, "Introduction\n\nResults\n\nRevenue grew by 12 percent.\n\nSpeaker notes:\n\nMention the Q3 dip.");
    assert.equal(result.pages, 2);
    assert.equal(result.text.slice(result.pageStarts![1]).split("\n")[0], "Results");
    const [checked] = checkEvidence([{ docId: "deck", quote: "Revenue grew by 12 percent" }], () => result.text, () => result.pageStarts);
    assert.deepEqual(checked!.context?.pages, { first: 2, last: 2 });
  });

  it("reads a real file's text and tables", async () => {
    const result = await extractText(file("report.pptx", fixture("report.pptx")), noPdf);
    assert.equal(result.pages, 3);
    assert.match(result.text, /^Annual Report 2025\n\nThe project is licensed under the “Mozilla Public License 2\.0”\./);
    assert.match(result.text, /Region\tUsers\nEurope\t1,204\nAsia\t980/);
  });

  it("warns when the slides hold no text", async () => {
    const bytes = await makeZip({
      "ppt/presentation.xml": `<p:presentation ${P} ${R}><p:sldIdLst><p:sldId r:id="a"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships ${RELS}><Relationship Id="a" Type="${TYPE}/slide" Target="slides/slide1.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": `<p:sld ${P}><p:cSld/></p:sld>`,
    });
    const result = await extractText(file("photos.pptx", bytes), noPdf);
    assert.equal(result.text, "");
    assert.match(result.warning ?? "", /pictures/);
  });
});

describe("OpenDocument files", () => {
  const odf = (mime: string, body: string, manifest = "<manifest:manifest/>") =>
    makeZip(
      {
        mimetype: mime,
        "META-INF/manifest.xml": manifest,
        "content.xml": `<?xml version="1.0"?><office:document-content ${ODF}><office:automatic-styles><text:p>style, not text</text:p></office:automatic-styles><office:body>${body}</office:body></office:document-content>`,
      },
      { deflate: true },
    );

  it("reads a real Writer file like the Word file it was saved from", async () => {
    const odt = await extractText(file("report.odt", fixture("report.odt")), noPdf);
    const word = await extractText(file("report.docx", fixture("report.docx")), noPdf);
    assert.equal(odt.kind, "odt");
    assert.equal(odt.text, word.text);
  });

  it("collapses whitespace as ODF does, writes spaces, tabs and breaks, and leaves out changes and comments", async () => {
    const body =
      `<office:text><text:tracked-changes><text:changed-region><text:deletion><text:p>deleted words</text:p></text:deletion></text:changed-region></text:tracked-changes>` +
      `<text:h text:outline-level="1">Budget\n   2025</text:h>` +
      `<text:p>Income<text:s text:c="3"/>was<text:tab/>EUR <text:span>450,000</text:span><text:line-break/>in total.<office:annotation><text:p>Check this</text:p></office:annotation>` +
      `<text:note text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>Audited.</text:p></text:note-body></text:note></text:p>` +
      `<draw:frame><svg:desc>A chart</svg:desc><draw:text-box><text:p>Caption</text:p></draw:text-box></draw:frame></office:text>`;
    const { text } = await extractOfficeText(await odf("application/vnd.oasis.opendocument.text", body), "odt");
    assert.equal(text, "Budget 2025\n\nIncome   was\tEUR 450,000\nin total.\n\nCaption\n\nEndnotes\n\n1. Audited.");
  });

  it("reads Impress slides as pages, with speaker notes", async () => {
    const page = (title: string, notes = "") =>
      `<draw:page draw:name="${title}"><draw:frame><draw:text-box><text:p>${title}</text:p></draw:text-box></draw:frame>` +
      `<presentation:notes><draw:page-thumbnail/><draw:frame><draw:text-box>${notes ? `<text:p>${notes}</text:p>` : ""}</draw:text-box></draw:frame></presentation:notes></draw:page>`;
    const bytes = await odf("application/vnd.oasis.opendocument.presentation", `<office:presentation>${page("One", "Say hello.")}${page("Two")}</office:presentation>`);
    const result = await extractText(file("talk.odp", bytes), noPdf);
    assert.equal(result.text, "One\n\nSpeaker notes:\n\nSay hello.\n\nTwo");
    assert.deepEqual(result.pageStarts, [0, result.text.indexOf("Two")]);
    assert.equal(result.pages, 2);
  });

  it("reads a real Impress file", async () => {
    const result = await extractText(file("report.odp", fixture("report.odp")), noPdf);
    assert.equal(result.pages, 3);
    assert.match(result.text, /Region\tUsers\nEurope\t1,204\nAsia\t980/);
  });

  it("says when a file is password-protected or not what its name says", async () => {
    const encrypted = await odf("application/vnd.oasis.opendocument.text", "", "<manifest:manifest><manifest:encryption-data/></manifest:manifest>");
    await assert.rejects(extractOfficeText(encrypted, "odt"), /password-protected/);
    const sheet = await odf("application/vnd.oasis.opendocument.spreadsheet", "");
    await assert.rejects(extractOfficeText(sheet, "odt"), /not an OpenDocument text file: it holds application\/vnd\.oasis\.opendocument\.spreadsheet/);
  });
});

describe("Office files the app cannot read", () => {
  it("explains password-protected and older binary files", async () => {
    const compound = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await assert.rejects(extractText(file("secret.docx", compound), noPdf), /password-protected, or is an older format/);
    await assert.rejects(extractText(file("old.doc", compound), noPdf), /cannot read Word 97–2003 \(\.doc\) files\. Open old\.doc in Word or LibreOffice, save it as \.docx or PDF/);
    await assert.rejects(extractText(file("old.ppt", compound), noPdf), /save it as \.pptx or PDF/);
    await assert.rejects(extractText(file("notes.docx", new TextEncoder().encode("plain text")), noPdf), /not a Word file, or it is damaged/);
    await assert.rejects(extractText(file("data.xlsx", compound), noPdf), /Unsupported file type: data\.xlsx\. Use PDF, Word/);
  });
});

describe("Office documents in the app", () => {
  it("accepts the new kinds in the file picker, saved records and backups", () => {
    for (const ext of [".docx", ".pptx", ".odt", ".odp"]) assert.ok(ACCEPT.split(",").includes(ext), ext);
    assert.equal(detectKind("Deck.PPTX"), "pptx");
    assert.equal(detectKind("upload", "application/vnd.oasis.opendocument.text"), "odt");
    const record = { id: "deck", title: "deck.pptx", text: "Hi", fileName: "deck.pptx", kind: "pptx", bytes: 10, pages: 1, pageStarts: [0] };
    assert.equal(documentSchema.safeParse(record).success, true);
    assert.equal(documentSchema.safeParse({ ...record, kind: "xlsx" }).success, false);
  });

  it("writes backups with Office documents as version 2, so older versions say to update instead of calling them damaged", () => {
    const deck = { id: "deck", title: "deck.pptx", text: "Hi", fileName: "deck.pptx", kind: "pptx" as const, bytes: 10, pages: 1, pageStarts: [0] };
    const notes = { id: "notes", title: "notes.txt", text: "Hi", fileName: "notes.txt", kind: "text" as const, bytes: 2 };
    assert.equal(makeBackup([notes], []).version, 1, "readable by every version");
    const backup = makeBackup([notes, deck], []);
    assert.equal(backup.version, 2);
    assert.deepEqual(parseBackup(JSON.stringify(backup)).documents.map((d) => d.kind), ["text", "pptx"]);
  });

  it("cites slides in presentations and pages elsewhere, also in answers saved before", () => {
    assert.equal(pageUnit("pptx"), "slide");
    assert.equal(pageUnit("odp"), "slide");
    assert.equal(pageUnit("pdf"), "page");
    assert.equal(describePages({ first: 4, last: 4 }, "slide"), "slide 4");
    assert.equal(describePages({ first: 3, last: 5 }, "slide"), "slides 3–5");
    assert.equal(describePages({ first: 3, last: 5 }), "pp. 3–5");
    const answer = (title: string): SavedAnswer =>
      ({ citations: {}, titles: { d: title }, evidence: [] }) as unknown as SavedAnswer;
    const item = { docId: "d", quote: "q", verified: true, context: { before: "", passage: "q", after: "", more: { before: false, after: false }, pages: { first: 2, last: 2 } } };
    assert.equal(quotePages(answer("Q3 review.pptx (part 2 of 4)"), item), "slide 2");
    assert.equal(quotePages(answer("paper.pdf"), item), "p. 2");
    assert.equal(quotePages(answer("paper.pdf"), { ...item, context: { ...item.context, pages: undefined } }), undefined);
  });
});
