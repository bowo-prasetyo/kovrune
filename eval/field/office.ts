// Questions over Office documents, spreadsheets and CSV files (harness 0.58.0): the kinds of file a
// preview user researches (November 2026), which the field suite's documents do not include.
//
// The documents are made up, built by office/source/make.py, and read through the app's own
// extraction (harness/field.ts), so the Word, Excel and Shift_JIS CSV readers are what is measured:
// - report-card-2025.docx: a report card in the layout of the user's, with the student's name and
//   the term only at the top of each page, a heading before each subject's table, and marks that
//   differ between the First and the Third Term. Most of its parts do not say whose record or which
//   term they belong to, which fix B (docs/office-formats.md) would add.
// - orders-2025.xlsx: orders with dates and yen amounts, customers on a second sheet, returns on a
//   hidden one. Some questions need two sheets.
// - inventory-sjis.csv: a parts inventory in Japanese, saved as Japanese Excel saves CSV.
// The field suite's seven documents are in the library too, as other documents a user has.
//
// Two suites, as for the multi-passage questions (multi.ts): `office` may be looked at task by task
// while a change is developed; `officeholdout` is read only as totals. The questions and their facts
// were written before any model was run on them, and are not changed to fit a run. Scoring is the
// research suite's: every fact group in the answer, every cited document, a verified quote.

import type { FieldDocument } from "./tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/field/office/. */
export const officeDocuments: FieldDocument[] = [
  { id: "report-card-2025", title: "report-card-2025.docx", file: "report-card-2025.docx" },
  { id: "orders-2025", title: "orders-2025.xlsx", file: "orders-2025.xlsx" },
  { id: "inventory-sjis", title: "inventory-sjis.csv", file: "inventory-sjis.csv" },
];

const CARD = ["report-card-2025"];
const ORDERS = ["orders-2025"];
const STOCK = ["inventory-sjis"];

export const officeTasks: ResearchTask[] = [
  // The report card. The marks asked for differ between the two terms, so the term matters.
  {
    id: "o01-math-thinking-third",
    kind: "lookup",
    question: "In Hana Takeda's report card, what mark did she get for Thinking, Judgment & Expression in Mathematics in the Third Term?",
    answerable: true,
    facts: [["Excellent"]],
    citations: [CARD],
  },
  {
    id: "o02-home-knowledge-first",
    kind: "lookup",
    question: "In the First Term, what mark did Hana Takeda get for Knowledge & Skills in Home Economics?",
    answerable: true,
    facts: [["Needs Improvement"]],
    citations: [CARD],
  },
  {
    id: "o03-all-excellent-third",
    kind: "multi-hop",
    question: "In which subjects did Hana Takeda get Excellent for all three perspectives in the Third Term?",
    answerable: true,
    facts: [["Physical Education"], ["Foreign Language"]],
    citations: [CARD],
  },
  {
    id: "o04-behaviour-creativity",
    kind: "lookup",
    question: "In Hana Takeda's Record of Behavior, what mark did she get for Creativity & Initiative?",
    answerable: true,
    facts: [["Good"]],
    citations: [CARD],
  },
  {
    id: "o05-dream",
    kind: "lookup",
    question: 'What dream did Hana Takeda develop in the "Reflecting on Myself at Age 12" unit?',
    answerable: true,
    facts: [["veterinarian", "vet"]],
    citations: [CARD],
  },
  {
    id: "o06-homeroom-teacher",
    kind: "lookup",
    question: "Who is Hana Takeda's homeroom teacher?",
    answerable: true,
    facts: [["Kenji Mori"]],
    citations: [CARD],
  },
  {
    id: "o07-calligraphy",
    kind: "unanswerable",
    question: "What mark did Hana Takeda get in Calligraphy in the Third Term?",
    answerable: false,
    facts: [],
    citations: [],
  },
  // The order workbook.
  {
    id: "o08-order-1047",
    kind: "lookup",
    question: "In the 2025 orders workbook, what was the total of order 1047, and what is its status?",
    answerable: true,
    facts: [["¥88,000", "88,000", "88000"], ["Delayed"]],
    citations: [ORDERS],
  },
  {
    id: "o09-hayashi-phone",
    kind: "lookup",
    question: "What is the phone number of the customer Hayashi Kogyo?",
    answerable: true,
    facts: [["06-6341-2287"]],
    citations: [ORDERS],
  },
  {
    id: "o10-order-1023-city",
    kind: "multi-hop",
    question: "In which city is the customer who placed order 1023?",
    answerable: true,
    facts: [["Osaka"]],
    citations: [ORDERS],
  },
  {
    id: "o11-return-1031",
    kind: "lookup",
    question: "Why was order 1031 returned?",
    answerable: true,
    facts: [["Wrong colour", "wrong color"]],
    citations: [ORDERS],
  },
  {
    id: "o12-sakura-email",
    kind: "unanswerable",
    question: "What is the email address of the customer Sakura Foods?",
    answerable: false,
    facts: [],
    citations: [],
  },
  // The inventory, in Japanese, asked in Japanese.
  {
    id: "o13-stock-b1042",
    kind: "lookup",
    question: "品番 B-1042 の在庫数はいくつですか？",
    answerable: true,
    facts: [["1332", "1,332"]],
    citations: [STOCK],
  },
  {
    id: "o14-stainless-m12-warehouse",
    kind: "lookup",
    question: "ステンレスボルト M12 はどの倉庫に保管されていますか？",
    answerable: true,
    facts: [["大阪第一倉庫"]],
    citations: [STOCK],
  },
  {
    id: "o15-price-b1008",
    kind: "lookup",
    question: "品番 B-1008 の単価はいくらですか？",
    answerable: true,
    facts: [["¥20", "20円"]],
    citations: [STOCK],
  },
];

export const officeHoldoutTasks: ResearchTask[] = [
  {
    id: "oh01-music-knowledge-third",
    kind: "lookup",
    question: "What mark did Hana Takeda get for Knowledge & Skills in Music in the Third Term?",
    answerable: true,
    facts: [["Good"]],
    citations: [CARD],
  },
  {
    id: "oh02-science-attitude-first",
    kind: "lookup",
    question: "In the First Term, what mark did Hana Takeda get for Attitude Toward Independent Learning in Science?",
    answerable: true,
    facts: [["Good"]],
    citations: [CARD],
  },
  {
    id: "oh03-committee",
    kind: "lookup",
    question: "Which committee was Hana Takeda a member of?",
    answerable: true,
    facts: [["Library Committee"]],
    citations: [CARD],
  },
  {
    id: "oh04-ikoma-phone",
    kind: "lookup",
    question: "What is the phone number of Ikoma Garden?",
    answerable: true,
    facts: [["0743-74-1189"]],
    citations: [ORDERS],
  },
  {
    id: "oh05-order-1035-contact",
    kind: "multi-hop",
    question: "Who is the contact person at the customer that placed order 1035?",
    answerable: true,
    facts: [["Ryo Mori"]],
    citations: [ORDERS],
  },
  {
    id: "oh06-received-b1027",
    kind: "lookup",
    question: "品番 B-1027 の最終入荷日はいつですか？",
    answerable: true,
    facts: [["2025/3/8", "2025年3月8日"]],
    citations: [STOCK],
  },
  {
    id: "oh07-kamo-fax",
    kind: "unanswerable",
    question: "What is the fax number of Kamo Brewery?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
