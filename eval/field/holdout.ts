// The held-out suite (audit item 3): questions over the field suite's documents that no change
// has been tuned on. Each guard and prompt change since harness 0.15.0 was written for a field task
// that failed, then judged on the same suite, so the field suite now flatters them. These tasks
// confirm a change instead: run them with --suites field,holdout, read their totals, and do not
// develop a change against their individual results (eval/field/README.md, "Rule for prompt and
// guard changes"). Reports and bench:compare name them only as counts.
//
// The same documents as the field suite (tasks.ts), in the same mix: the user guide, the design
// PDF, the licence, the Ada Lovelace lead, the leads in Japanese, Chinese and French, a
// two-document question and questions the documents do not answer. Scoring is the research suite's.

import type { ResearchTask } from "../tasks/research.ts";

const GUIDE = ["kovrune-user-guide"];
const DESIGN = ["kovrune-design-r3"];
const MPL = ["mpl-2.0"];
const ADA = ["ada-lovelace-lead"];
const FUJI = ["mount-fuji-ja-lead"];
const WALL = ["great-wall-zh-lead"];
const EIFFEL = ["eiffel-tower-fr-lead"];

export const holdoutTasks: ResearchTask[] = [
  {
    id: "h01-server-address",
    kind: "lookup",
    question: "Which address does the user guide say to keep when connecting the app to a local model server?",
    answerable: true,
    facts: [["127.0.0.1:8080/v1"]],
    citations: [GUIDE],
  },
  {
    id: "h02-hf-error",
    kind: "lookup",
    question: "What error does llama-server's -hf download option give when llama.cpp was built without SSL?",
    answerable: true,
    facts: [["HTTPS is not supported"]],
    citations: [GUIDE],
  },
  {
    id: "h03-4b-test-speed",
    kind: "lookup",
    question: "On a laptop with 8 GB of memory and integrated Intel graphics, how fast is the model test with Qwen3.5-4B?",
    answerable: true,
    facts: [["5.5 tokens/s", "5.5 tokens per second"]],
    citations: [GUIDE],
  },
  {
    id: "h04-class-3",
    kind: "lookup",
    question: "What hardware is reference hardware class 3?",
    answerable: true,
    facts: [["desktop"], ["12 GB"]],
    citations: [DESIGN],
  },
  {
    id: "h05-first-result-target",
    kind: "lookup",
    question: "What is the design's target for the time from first visit to first useful result?",
    answerable: true,
    facts: [["15 minutes"]],
    citations: [DESIGN],
  },
  {
    id: "h06-after-evaluating",
    kind: "lookup",
    question: "In the design's task states, which state follows evaluating?",
    answerable: true,
    facts: [["completed"]],
    citations: [DESIGN],
  },
  {
    id: "h07-license-steward",
    kind: "lookup",
    question: "Who is the license steward of the MPL-2.0?",
    answerable: true,
    facts: [["Mozilla Foundation"]],
    citations: [MPL],
  },
  {
    id: "h08-exhibit-b",
    kind: "lookup",
    question: "Which exhibit of the MPL-2.0 holds the \"Incompatible With Secondary Licenses\" notice?",
    answerable: true,
    facts: [["Exhibit B"]],
    citations: [MPL],
  },
  {
    id: "h09-met-babbage",
    kind: "lookup",
    question: "On what date did Ada Lovelace first meet Charles Babbage?",
    answerable: true,
    facts: [["5 June 1833", "June 5, 1833"]],
    citations: [ADA],
  },
  {
    id: "h10-menabrea",
    kind: "lookup",
    question: "Whose article about the analytical engine did Ada Lovelace translate?",
    answerable: true,
    facts: [["Menabrea"]],
    citations: [ADA],
  },
  {
    id: "h11-fuji-national-park",
    kind: "lookup",
    question: "富士山が国立公園に指定されたのは何年ですか？",
    answerable: true,
    facts: [["1936"]],
    citations: [FUJI],
  },
  {
    id: "h12-wall-segments",
    kind: "lookup",
    question: "国家文物局认定的长城墙体共有多少段？",
    answerable: true,
    facts: [["10,051", "10051"]],
    citations: [WALL],
  },
  {
    id: "h13-eiffel-original-height",
    kind: "lookup",
    question: "Quelle était la hauteur de la tour Eiffel à l'origine ?",
    answerable: true,
    facts: [["312"]],
    citations: [EIFFEL],
  },
  {
    id: "h14-license-and-steward",
    kind: "multi-hop",
    question: "Under which license is Kovrune's software released, and who is that license's steward?",
    answerable: true,
    facts: [["MPL-2.0", "MPL 2.0", "Mozilla Public License"], ["Mozilla Foundation"]],
    citations: [DESIGN, MPL],
  },
  {
    id: "h15-ada-children",
    kind: "unanswerable",
    question: "How many children did Ada Lovelace have?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "h16-subscription-price",
    kind: "unanswerable",
    question: "How much does a Kovrune subscription cost per month?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
