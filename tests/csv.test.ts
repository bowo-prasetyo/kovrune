import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { makeBackup } from "../src/app/research/backup.ts";
import { ACCEPT } from "../src/app/research/library.ts";
import { documentSchema } from "../src/app/research/records.ts";
import { chunkDocument } from "../src/documents/chunk.ts";
import { decodeText, parseDelimited, sniffDelimiter } from "../src/documents/delimited.ts";
import { detectKind, extractText, type PdfJsLike } from "../src/documents/extract.ts";
import { MAX_SHEET_ROWS } from "../src/documents/sheets.ts";

const noPdf = async (): Promise<PdfJsLike> => {
  throw new Error("not needed");
};
const file = (name: string, bytes: Uint8Array, type = "") => ({ name, type, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const utf8 = (text: string) => new TextEncoder().encode(text);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/office/${name}`, import.meta.url)));

describe("CSV encodings", () => {
  it("reads UTF-8, with or without a byte-order mark, and UTF-16 with one", () => {
    assert.deepEqual(decodeText(utf8("a,é")), { text: "a,é", encoding: "utf-8" });
    assert.deepEqual(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("a,é")])), { text: "a,é", encoding: "utf-8" });
    assert.deepEqual(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0, 0x09, 0, 0x42, 0x30])), { text: "a\tあ", encoding: "utf-16le" });
    assert.deepEqual(decodeText(new Uint8Array([0xfe, 0xff, 0, 0x61, 0x30, 0x42])), { text: "aあ", encoding: "utf-16be" });
  });

  it("falls back to Shift_JIS, as Japanese Excel saves CSV, with its ¥ written as the user saw it", () => {
    // "東京,\125" and "C:\temp" in Shift_JIS: 0x5C is ¥ in Japanese Windows, a backslash once decoded.
    const tokyo = new Uint8Array([0x93, 0x8c, 0x8b, 0x9e, 0x2c, 0x5c, 0x31, 0x32, 0x35]);
    assert.deepEqual(decodeText(tokyo), { text: "東京,¥125", encoding: "shift_jis" });
    const path = new Uint8Array([0x93, 0x8c, 0x2c, ...utf8("C:\\temp")]);
    assert.equal(decodeText(path).text, "東,C:\\temp", "a backslash not before an amount stays");
    // ㈱ exists only in Windows-932, Excel's Shift_JIS.
    assert.equal(decodeText(new Uint8Array([0x87, 0x8a, 0x93, 0x8c])).text, "㈱東");
  });
});

describe("CSV parsing", () => {
  it("finds the delimiter in the first line, outside quotes", () => {
    assert.equal(sniffDelimiter("a,b,c\n1;2;3;4;5"), ",");
    assert.equal(sniffDelimiter("Name;Price\nTea;1,50"), ";", "Excel where the decimal mark is a comma");
    assert.equal(sniffDelimiter("a\tb\tc"), "\t");
    assert.equal(sniffDelimiter('"a,b,c";d;e'), ";", "commas in quotes do not count");
    assert.equal(sniffDelimiter("one cell"), ",");
  });

  it("reads quoted cells with delimiters, doubled quotes and line breaks, and any line ending", () => {
    const text = 'id,name,note\r\n1,"Osaka, Kita","He said ""hi"""\r\n2,"two\r\nlines",\n3,x,5\'10"\r4,,';
    assert.deepEqual(parseDelimited(text, ",").rows, [
      ["id", "name", "note"],
      ["1", "Osaka, Kita", 'He said "hi"'],
      ["2", "two\r\nlines", ""],
      ["3", "x", "5'10\""],
      ["4", "", ""],
    ]);
    assert.deepEqual(parseDelimited("a,b\n", ",").rows, [["a", "b"]], "a final line break makes no empty row");
    assert.deepEqual(parseDelimited("", ",").rows, []);
  });

  it("stops at the row limit and says whether rows were left", () => {
    assert.deepEqual(parseDelimited("a\nb\nc\n", ",", 2), { rows: [["a"], ["b"]], cut: true });
    assert.deepEqual(parseDelimited("a\nb\n", ",", 2), { rows: [["a"], ["b"]], cut: false });
  });
});

describe("CSV files", () => {
  const ROWS =
    "注文番号 | 顧客 | 住所 | 日付 | 金額 | 状況\n" +
    "注文番号: 1001 | 顧客: ㈱アクメ商事 | 住所: 大阪市北区, 梅田1-1 | 日付: 2025/3/1 | 金額: ¥125,000 | 状況: 納品済み\n" +
    "注文番号: 1002 | 顧客: さくら食品 | 住所: 神戸市中央区 三宮町2-2 | 日付: 2025/3/14 | 金額: ¥250,000 | 状況: 遅延\n" +
    '注文番号: 1003 | 顧客: スズキ "特急" 便 | 住所: 京都市下京区 | 日付: 2025/3/20 | 金額: ¥0 | 状況: キャンセル';

  it("reads Japanese Excel's Shift_JIS CSV and its UTF-8 CSV the same, labelled like a sheet", async () => {
    // tests/fixtures/office/orders-sjis.csv and orders-utf8-bom.csv: the same rows, as Excel's
    // "CSV (comma delimited)" and "CSV UTF-8" save them (tests/fixtures/README.md).
    const sjis = await extractText(file("orders-sjis.csv", fixture("orders-sjis.csv")), noPdf);
    assert.equal(sjis.kind, "csv");
    assert.equal(sjis.text, `Sheet: orders-sjis\n${ROWS}`);
    assert.equal(sjis.pageStarts, undefined, "one sheet: no sheet numbers");
    assert.equal(sjis.warning, undefined);
    const bom = await extractText(file("orders-utf8-bom.csv", fixture("orders-utf8-bom.csv")), noPdf);
    assert.equal(bom.text, `Sheet: orders-utf8-bom\n${ROWS}`);
  });

  it("reads a CSV saved by LibreOffice like the sheet it was saved from", async () => {
    const csv = await extractText(file("orders-libreoffice.csv", fixture("orders-libreoffice.csv")), noPdf);
    const xlsx = await extractText(file("orders.xlsx", fixture("orders.xlsx")), noPdf);
    const firstSheet = xlsx.text.slice(0, xlsx.pageStarts![1]).trim();
    assert.equal(csv.text.replace("Sheet: orders-libreoffice", "Sheet: Orders"), firstSheet);
  });

  it("verifies a quoted row", async () => {
    const { text } = await extractText(file("orders-sjis.csv", fixture("orders-sjis.csv")), noPdf);
    const [row] = checkEvidence([{ docId: "o", quote: "顧客: さくら食品 | 住所: 神戸市中央区 三宮町2-2 | 日付: 2025/3/14 | 金額: ¥250,000 | 状況: 遅延" }], () => text);
    assert.equal(row!.verified, true);
  });

  it("reads TSV with tabs, and semicolon CSV with decimal commas", async () => {
    const tsv = await extractText(file("stock.tsv", utf8("Item\tCount\tNote\nBolt, M6\t1200\t\nNut\t80\tcheck")), noPdf);
    assert.equal(tsv.kind, "tsv");
    assert.equal(tsv.text, "Sheet: stock\nItem | Count | Note\nItem: Bolt, M6 | Count: 1200\nItem: Nut | Count: 80 | Note: check");
    const semicolons = await extractText(file("prix.csv", utf8("Produit;Prix\nThé;1,50\nCafé;2,10\n")), noPdf);
    assert.equal(semicolons.text, "Sheet: prix\nProduit | Prix\nProduit: Thé | Prix: 1,50\nProduit: Café | Prix: 2,10");
  });

  it("stops at the row limit, splits between rows, and says when a file is empty", async () => {
    const lines = ["ID,Customer", ...Array.from({ length: MAX_SHEET_ROWS + 10 }, (_, i) => `${i + 1},Customer ${i + 1}`)];
    const big = await extractText(file("log.csv", utf8(lines.join("\n"))), noPdf);
    assert.match(big.warning ?? "", /^This file is large: only the first 20,000 rows were read/);
    for (const part of chunkDocument({ id: "log", title: "log.csv", text: big.text })) {
      assert.ok(part.text.startsWith("Sheet: log\n"));
      assert.match(part.text.split("\n").at(-1)!, /^ID: \d+ \| Customer: Customer \d+$/);
    }
    const empty = await extractText(file("empty.csv", utf8("\n\n")), noPdf);
    assert.match(empty.warning ?? "", /nothing in its cells/);
  });

  it("are told apart by extension first, as a .csv often comes as text/plain", () => {
    assert.equal(detectKind("orders.csv", "text/plain"), "csv");
    assert.equal(detectKind("orders.CSV", "application/vnd.ms-excel"), "csv");
    assert.equal(detectKind("stock.tsv"), "tsv");
    assert.equal(detectKind("stock.tab"), "tsv");
    assert.equal(detectKind("upload", "text/csv; charset=utf-8"), "csv");
    assert.equal(detectKind("notes", "text/plain"), "text");
    for (const ext of [".csv", ".tsv", ".tab"]) assert.ok(ACCEPT.split(",").includes(ext), ext);
  });

  it("are saved, and written into backups as version 4", () => {
    const doc = (kind: "text" | "xlsx" | "csv") => ({ id: kind, title: kind, text: "x", fileName: `a.${kind}`, kind, bytes: 1 });
    assert.equal(documentSchema.safeParse(doc("csv")).success, true);
    assert.equal(makeBackup([doc("text"), doc("xlsx")], []).version, 3);
    assert.equal(makeBackup([doc("xlsx"), doc("csv")], []).version, 4);
  });
});
