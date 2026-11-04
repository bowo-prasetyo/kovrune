import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { quotePages, type SavedAnswer } from "../src/app/research/answers.ts";
import { makeBackup } from "../src/app/research/backup.ts";
import { ACCEPT } from "../src/app/research/library.ts";
import { documentSchema } from "../src/app/research/records.ts";
import { describePages } from "../src/app/research/trace.ts";
import { chunkDocument } from "../src/documents/chunk.ts";
import { detectKind, extractText, pageUnit, type PdfJsLike } from "../src/documents/extract.ts";
import { builtInFormat, formatGeneral, formatValue, serialToDate } from "../src/documents/number-format.ts";
import { extractOfficeText } from "../src/documents/office.ts";
import { MAX_SHEET_ROWS } from "../src/documents/sheets.ts";
import { makeZip } from "./zip-fixture.ts";

const noPdf = async (): Promise<PdfJsLike> => {
  throw new Error("not needed");
};
const file = (name: string, bytes: Uint8Array) => ({ name, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/office/${name}`, import.meta.url)));

describe("number formats", () => {
  it("shows dates and times as the cell's format does", () => {
    assert.equal(formatValue(45717, "yyyy/m/d"), "2025/3/1");
    assert.equal(formatValue(45717, 'yyyy"年"m"月"d"日"'), "2025年3月1日");
    assert.equal(formatValue(45717, "d-mmm-yy"), "1-Mar-25");
    assert.equal(formatValue(45717, "mmmm d, yyyy"), "March 1, 2025");
    assert.equal(formatValue(45717, "dddd"), "Saturday");
    assert.equal(formatValue(45717.5, "yyyy-mm-dd hh:mm"), "2025-03-01 12:00", "m after h is minutes");
    assert.equal(formatValue(0.75, "h:mm AM/PM"), "6:00 PM");
    assert.equal(formatValue(0.5208333, "hh:mm:ss"), "12:30:00", "rounded to the second, as Excel does");
    assert.equal(formatValue(1.5, "[h]:mm"), "36:00", "elapsed hours past a day");
    // The locale's short date (14) and the East Asian date formats are written as ISO dates.
    assert.equal(formatValue(45717, builtInFormat(14)), "2025-03-01");
    assert.equal(formatValue(45717, builtInFormat(57)), "2025-03-01");
  });

  it("counts days from 1900, with Excel's 29 February 1900, or from 1904", () => {
    assert.equal(serialToDate(1).toISOString().slice(0, 10), "1900-01-01");
    assert.equal(serialToDate(59).toISOString().slice(0, 10), "1900-02-28");
    assert.equal(serialToDate(61).toISOString().slice(0, 10), "1900-03-01");
    assert.equal(formatValue(45717, "yyyy-mm-dd"), "2025-03-01");
    assert.equal(formatValue(44255, "yyyy-mm-dd", true), "2025-03-01", "the 1904 system is 1,462 days behind");
  });

  it("shows numbers with grouping, decimals, percentages, currency and text around them", () => {
    assert.equal(formatValue(1234567.891, "#,##0.00"), "1,234,567.89");
    assert.equal(formatValue(1234567.891, "#,##0"), "1,234,568");
    assert.equal(formatValue(0.1234, "0.0%"), "12.3%");
    assert.equal(formatValue(1500, '"¥"#,##0'), "¥1,500");
    assert.equal(formatValue(1500, "[$¥-411]#,##0"), "¥1,500");
    assert.equal(formatValue(1500, '#,##0"円"'), "1,500円");
    assert.equal(formatValue(12.5, '0.00" kg"'), "12.50 kg");
    assert.equal(formatValue(1234567, '#,##0,"K"'), "1,235K", "a trailing comma divides by a thousand");
    assert.equal(formatValue(0.000123, "0.00E+00"), "1.23E-04");
    assert.equal(formatValue(3.14159, "0.##"), "3.14");
    assert.equal(formatValue(3.1, "0.0#"), "3.1");
    assert.equal(formatValue(7, "000"), "007");
  });

  it("uses a negative or zero section when the code has one", () => {
    assert.equal(formatValue(-1234.5, "#,##0.00_);(#,##0.00)"), "(1,234.50)");
    assert.equal(formatValue(-1234.5, "#,##0.00"), "-1,234.50");
    assert.equal(formatValue(0, '#,##0;-#,##0;"-"'), "-");
    assert.equal(formatValue(-0.001, "0.00"), "0.00", "no minus sign on a value shown as zero");
  });

  it("falls back to Excel's General format", () => {
    assert.equal(formatValue(42, "General"), "42");
    assert.equal(formatValue(42, "@"), "42");
    assert.equal(formatGeneral(1 / 3), "0.3333333333");
    assert.equal(formatGeneral(123456789012), "1.23457E+11");
    assert.equal(formatValue(0.1 + 0.2, undefined), "0.3", "floating-point noise is not shown");
  });
});

const X = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** An .xlsx from its sheets' XML (sheetData and after), with styles and shared strings. */
function xlsx(sheets: Array<{ name: string; xml: string; state?: string }>, options: { shared?: string[]; numFmts?: string; cellXfs?: string; date1904?: boolean; chart?: boolean } = {}) {
  const files: Record<string, string> = {
    "_rels/.rels": `<Relationships ${RELS}><Relationship Id="rId1" Type="${TYPE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<workbook ${X}>${options.date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>` +
      sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="s${i}"/>`).join("") +
      (options.chart ? '<sheet name="Chart" sheetId="99" r:id="c1"/>' : "") +
      `</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<Relationships ${RELS}>` +
      // Parts named in the opposite order to the sheets: the workbook's list decides.
      sheets.map((_, i) => `<Relationship Id="s${i}" Type="${TYPE}/worksheet" Target="worksheets/sheet${sheets.length - i}.xml"/>`).join("") +
      `<Relationship Id="ss" Type="${TYPE}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="st" Type="${TYPE}/styles" Target="styles.xml"/>` +
      (options.chart ? `<Relationship Id="c1" Type="${TYPE}/chartsheet" Target="chartsheets/sheet1.xml"/>` : "") +
      `</Relationships>`,
    "xl/sharedStrings.xml": `<sst ${X}>${(options.shared ?? []).map((s) => (s.startsWith("<") ? `<si>${s}</si>` : `<si><t>${s}</t></si>`)).join("")}</sst>`,
    "xl/styles.xml": `<styleSheet ${X}>${options.numFmts ?? ""}<cellStyleXfs><xf numFmtId="14"/></cellStyleXfs><cellXfs>${options.cellXfs ?? '<xf numFmtId="0"/>'}</cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${sheets.length - i}.xml`] = `<worksheet ${X}>${s.xml}</worksheet>`));
  return makeZip(files, { deflate: true });
}

const row = (n: number, cells: string) => `<row r="${n}">${cells}</row>`;
const str = (ref: string, index: number) => `<c r="${ref}" t="s"><v>${index}</v></c>`;
const num = (ref: string, value: number, style?: number) => `<c r="${ref}"${style === undefined ? "" : ` s="${style}"`}><v>${value}</v></c>`;

describe("Excel workbooks", () => {
  it("writes each row labelled with the header, values as Excel shows them, one sheet per page", async () => {
    const shared = ["Name", "Joined", "Score", "Active", "Note", "Ada", "Grace", "Contacts", "Phone", "Bureau"];
    const people =
      `<sheetData>${row(1, str("A1", 0) + str("B1", 1) + str("C1", 2) + str("D1", 3) + str("E1", 4))}` +
      row(2, str("A2", 5) + num("B2", 45717, 1) + num("C2", 0.875, 2) + '<c r="D2" t="b"><v>1</v></c>' + '<c r="E2" t="inlineStr"><is><t>Leads the team</t></is></c>') +
      // Cells without references follow on; a formula shows the value Excel saved.
      `<row r="3"><c t="s"><v>6</v></c><c s="1"><f>B2+30</f><v>45747</v></c><c t="e"><v>#N/A</v></c><c t="b"><v>0</v></c><c t="str"><f>A3&amp;"!"</f><v>Grace!</v></c></row>` +
      `</sheetData>`;
    const contacts = `<sheetData>${row(1, str("A1", 0) + str("B1", 8))}${row(2, str("A2", 9) + '<c r="B2" t="inlineStr"><is><t>06-1234-5678</t></is></c>')}</sheetData>`;
    const bytes = await xlsx(
      [
        { name: "People", xml: people },
        { name: "Contacts", xml: contacts, state: "hidden" },
      ],
      { shared, numFmts: '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy/m/d"/></numFmts>', cellXfs: '<xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="10"/>', chart: true },
    );
    const result = await extractText(file("people.xlsx", bytes), noPdf);
    assert.equal(result.kind, "xlsx");
    assert.equal(
      result.text,
      "Sheet: People\nName | Joined | Score | Active | Note\n" +
        "Name: Ada | Joined: 2025/3/1 | Score: 87.50% | Active: TRUE | Note: Leads the team\n" +
        "Name: Grace | Joined: 2025/3/31 | Score: #N/A | Active: FALSE | Note: Grace!\n\n" +
        "Sheet: Contacts (hidden)\nName | Phone\nName: Bureau | Phone: 06-1234-5678",
    );
    assert.equal(result.pages, 2, "the chart sheet has no cells and is left out");
    assert.equal(result.text.slice(result.pageStarts![1]).split("\n")[0], "Sheet: Contacts (hidden)");
  });

  it("leaves out Japanese reading guides, keeps title rows, and repeats merged cells down", async () => {
    // "東京" with its furigana "トウキョウ" (rPh), which Excel stores but does not show in the cell.
    const shared = ["2025年度 売上", "支店", "担当", "売上", "<r><t>東</t></r><r><t>京</t></r><rPh sb=\"0\" eb=\"2\"><t>トウキョウ</t></rPh><phoneticPr fontId=\"1\"/>", "佐藤", "鈴木"];
    const sheet =
      `<sheetData>${row(1, str("A1", 0))}${row(3, str("A3", 1) + str("B3", 2) + str("C3", 3))}` +
      row(4, str("A4", 4) + str("B4", 5) + num("C4", 1200000, 1)) +
      row(5, '<c r="A5"/>' + str("B5", 6) + num("C5", 980000, 1)) +
      `</sheetData><mergeCells count="1"><mergeCell ref="A4:A5"/></mergeCells>`;
    const bytes = await xlsx([{ name: "売上", xml: sheet }], { shared, cellXfs: '<xf numFmtId="0"/><xf numFmtId="3"/>' });
    const { text } = await extractOfficeText(bytes, "xlsx");
    assert.equal(text, "Sheet: 売上\n2025年度 売上\n支店 | 担当 | 売上\n支店: 東京 | 担当: 佐藤 | 売上: 1,200,000\n支店: 東京 | 担当: 鈴木 | 売上: 980,000");
  });

  it("writes rows without a header of names as tab-separated cells", async () => {
    const sheet = `<sheetData>${row(1, num("A1", 2023) + num("B1", 2024))}${row(2, num("A2", 10) + num("C2", 30))}</sheetData>`;
    const { text } = await extractOfficeText(await xlsx([{ name: "Years", xml: sheet }]), "xlsx");
    assert.equal(text, "Sheet: Years\n2023\t2024\n10\t\t30");
  });

  it("reads the 1904 date system of old Mac workbooks", async () => {
    const sheet = `<sheetData>${row(1, str("A1", 0) + str("B1", 1))}${row(2, str("A2", 2) + num("B2", 44255, 1))}</sheetData>`;
    const bytes = await xlsx([{ name: "S", xml: sheet }], { shared: ["Event", "Date", "Launch"], cellXfs: '<xf numFmtId="0"/><xf numFmtId="14"/>', date1904: true });
    assert.match((await extractOfficeText(bytes, "xlsx")).text, /Date: 2025-03-01/);
  });

  it("stops at the row limit, says so, and splits a long sheet between rows, each part naming its sheet", async () => {
    const rows = Array.from({ length: MAX_SHEET_ROWS + 50 }, (_, i) => row(i + 2, num(`A${i + 2}`, i + 1) + `<c r="B${i + 2}" t="inlineStr"><is><t>Customer ${i + 1}</t></is></c>`)).join("");
    const bytes = await xlsx([{ name: "Log", xml: `<sheetData>${row(1, str("A1", 0) + str("B1", 1))}${rows}</sheetData>` }], { shared: ["ID", "Customer"] });
    const result = await extractText(file("log.xlsx", bytes), noPdf);
    assert.match(result.warning ?? "", /only the first 20,000 rows were read/);
    assert.ok(result.text.includes(`ID: ${MAX_SHEET_ROWS - 1} | Customer: Customer ${MAX_SHEET_ROWS - 1}`));
    assert.ok(!result.text.includes(`Customer ${MAX_SHEET_ROWS}\n`) && !result.text.endsWith(`Customer ${MAX_SHEET_ROWS}`));
    const parts = chunkDocument({ id: "log", title: "log.xlsx", text: result.text });
    assert.ok(parts.length > 100);
    for (const part of parts) {
      assert.ok(part.text.startsWith("Sheet: Log\n"), `part starts without its sheet: ${part.text.slice(0, 30)}`);
      assert.match(part.text.split("\n").at(-1)!, /^ID: \d+ \| Customer: Customer \d+$/, "parts end at the end of a row");
    }
  });

  it("says when a workbook has nothing in its cells", async () => {
    const result = await extractText(file("empty.xlsx", await xlsx([{ name: "Sheet1", xml: "<sheetData/>" }])), noPdf);
    assert.equal(result.text, "Sheet: Sheet1");
    assert.match(result.warning ?? "", /nothing in its cells/);
  });
});

describe("OpenDocument spreadsheets", () => {
  const ODS = [
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  ].join(" ");
  const ods = (styles: string, body: string) =>
    makeZip({
      mimetype: "application/vnd.oasis.opendocument.spreadsheet",
      "content.xml": `<office:document-content ${ODS}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:spreadsheet>${body}</office:spreadsheet></office:body></office:document-content>`,
    });
  const td = (text: string, attrs = "") => (text ? `<table:table-cell${attrs}><text:p>${text}</text:p></table:table-cell>` : `<table:table-cell${attrs}/>`);

  it("writes cells as shown, skips padding rows and columns, and repeats filled ones", async () => {
    const body =
      `<table:table table:name="Stock" table:style-name="ta1">` +
      `<table:table-row>${td("Item")}${td("Count")}${td("", ' table:number-columns-repeated="1022"')}</table:table-row>` +
      `<table:table-row table:number-rows-repeated="2">${td("Bolt")}${td("1,200")}</table:table-row>` +
      `<table:table-row>${td("Nut <text:s text:c=\"2\"/>M6")}${td("80")}<table:table-cell><text:p>note</text:p><office:annotation><text:p>Check</text:p></office:annotation></table:table-cell></table:table-row>` +
      `<table:table-row table:number-rows-repeated="1048570">${td("", ' table:number-columns-repeated="1024"')}</table:table-row>` +
      `</table:table>` +
      `<table:table table:name="Old" table:style-name="ta2"><table:table-row>${td("x")}</table:table-row></table:table>`;
    const styles =
      `<style:style style:name="ta1" style:family="table"><style:table-properties table:display="true"/></style:style>` +
      `<style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>`;
    const result = await extractText(file("stock.ods", await ods(styles, body)), noPdf);
    assert.equal(result.text, "Sheet: Stock\nItem | Count\nItem: Bolt | Count: 1,200\nItem: Bolt | Count: 1,200\nItem: Nut M6 | Count: 80 | note\n\nSheet: Old (hidden)\nx");
    assert.equal(result.pages, 2);
    assert.equal(result.warning, undefined);
  });

  it("keeps a list in one column, which has no header to find", async () => {
    const body = `<table:table table:name="Guests">${["Sato", "Suzuki", "Tanaka"].map((n) => `<table:table-row>${td(n)}</table:table-row>`).join("")}</table:table>`;
    assert.equal((await extractOfficeText(await ods("", body), "ods")).text, "Sheet: Guests\nSato\nSuzuki\nTanaka");
  });

  it("places spanned and covered cells as Excel's merges are placed", async () => {
    const body =
      `<table:table table:name="T"><table:table-row>${td("Branch")}${td("Staff")}${td("Sales")}</table:table-row>` +
      `<table:table-row>${td("Osaka", ' table:number-rows-spanned="2"')}${td("Sato")}${td("10")}</table:table-row>` +
      `<table:table-row><table:covered-table-cell/>${td("Suzuki")}${td("20")}</table:table-row>` +
      `<table:table-row>${td("Kobe")}${td("Closed", ' table:number-columns-spanned="2"')}<table:covered-table-cell/></table:table-row></table:table>`;
    const { text } = await extractOfficeText(await ods("", body), "ods");
    assert.equal(text, "Sheet: T\nBranch | Staff | Sales\nBranch: Osaka | Staff: Sato | Sales: 10\nBranch: Osaka | Staff: Suzuki | Sales: 20\nBranch: Kobe | Staff: Closed");
  });
});

describe("spreadsheets saved by LibreOffice", () => {
  // tests/fixtures/office/orders.fods, saved as .xlsx and .ods by LibreOffice (tests/fixtures/README.md).
  const EXPECTED =
    "Sheet: Orders\nOrders 2025 (Kansai office)\nOrder | Customer | Date | Total | Discount | Status\n" +
    "Order: 1001 | Customer: Acme Trading | Date: 2025-03-01 | Total: ¥125,000 | Discount: 5.0% | Status: Delivered\n" +
    "Order: 1002 | Customer: Sakura Foods | Date: 2025-03-14 | Total: ¥250,000 | Status: Delayed\n" +
    "Order: 1003 | Customer: Cancelled by phone | Status: Cancelled\n\n" +
    "Sheet: Contacts (hidden)\nCustomer | Phone\nCustomer: Acme Trading | Phone: 06-1234-5678";

  it("reads the same workbook the same way as .xlsx and .ods", async () => {
    for (const name of ["orders.xlsx", "orders.ods"]) {
      const result = await extractText(file(name, fixture(name)), noPdf);
      assert.equal(result.text, EXPECTED, name);
      assert.deepEqual(result.pageStarts, [0, EXPECTED.indexOf("Sheet: Contacts")], name);
    }
  });

  it("verifies a quoted row and cites its sheet", async () => {
    const result = await extractText(file("orders.xlsx", fixture("orders.xlsx")), noPdf);
    const [row] = checkEvidence([{ docId: "orders", quote: "Customer: Sakura Foods | Date: 2025-03-14 | Total: ¥250,000 | Status: Delayed" }], () => result.text, () => result.pageStarts);
    assert.equal(row!.verified, true);
    assert.deepEqual(row!.context?.pages, { first: 1, last: 1 });
    const [phone] = checkEvidence([{ docId: "orders", quote: "Acme Trading Phone: 06-1234-5678" }], () => result.text, () => result.pageStarts);
    assert.deepEqual(phone!.context?.pages, { first: 2, last: 2 });
    const answer = { citations: {}, titles: { orders: "orders.xlsx" }, evidence: [] } as unknown as SavedAnswer;
    assert.equal(quotePages(answer, phone!), "sheet 2");
  });
});

describe("spreadsheets in the app", () => {
  it("are accepted, labelled, cited by sheet and saved", () => {
    for (const ext of [".xlsx", ".ods"]) assert.ok(ACCEPT.split(",").includes(ext), ext);
    assert.equal(detectKind("Budget.XLSX"), "xlsx");
    assert.equal(detectKind("upload", "application/vnd.oasis.opendocument.spreadsheet"), "ods");
    assert.equal(pageUnit("xlsx"), "sheet");
    assert.equal(describePages({ first: 2, last: 2 }, "sheet"), "sheet 2");
    assert.equal(describePages({ first: 1, last: 3 }, "sheet"), "sheets 1–3");
    const record = { id: "b", title: "b.xlsx", text: "Sheet: S", fileName: "b.xlsx", kind: "xlsx", bytes: 1, pages: 1, pageStarts: [0], reader: 2 };
    assert.equal(documentSchema.safeParse(record).success, true);
  });

  it("write backups with spreadsheets as version 3, so older versions say to update", () => {
    const doc = (kind: "text" | "docx" | "xlsx") => ({ id: kind, title: kind, text: "x", fileName: `a.${kind}`, kind, bytes: 1 });
    assert.equal(makeBackup([doc("text")], []).version, 1);
    assert.equal(makeBackup([doc("text"), doc("docx")], []).version, 2);
    assert.equal(makeBackup([doc("docx"), doc("xlsx")], []).version, 3);
  });
});
