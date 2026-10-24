// Research tasks over the fixed corpus in corpus.ts.
//
// Scoring is objective (see harness/scoring.ts):
// - `facts`: each group lists accepted spellings; the answer must contain at least one per group.
// - `citations`: each group lists acceptable document IDs; at least one per group must be cited.
// - Unanswerable tasks pass only if the agent reports found=false.

export type ResearchKind = "lookup" | "multi-hop" | "comparison" | "contradiction" | "unanswerable";

export interface ResearchTask {
  id: string;
  kind: ResearchKind;
  question: string;
  answerable: boolean;
  facts: string[][];
  citations: string[][];
}

const KIB4 = ["4 KiB", "4KiB", "4 KB", "4KB", "4096"];
const KIB8 = ["8 KiB", "8KiB", "8 KB", "8KB", "8192"];

export const researchTasks: ResearchTask[] = [
  {
    id: "r01-lumen-maintainer",
    kind: "lookup",
    question: "Which organization maintains LumenDB?",
    answerable: true,
    facts: [["Tessel"]],
    citations: [["lumen-overview", "tessel-governance"]],
  },
  {
    id: "r02-lumen-license",
    kind: "lookup",
    question: "Under which license has LumenDB been released since version 3.0?",
    answerable: true,
    facts: [["MPL-2.0", "MPL 2.0", "Mozilla Public License"]],
    citations: [["lumen-overview"]],
  },
  {
    id: "r03-advisory-affected",
    kind: "lookup",
    question: "Which LumenDB versions are affected by advisory LSA-2024-07?",
    answerable: true,
    facts: [["3.0.0", "3.0"], ["3.1.4"]],
    citations: [["lumen-advisory-2024-07"]],
  },
  {
    id: "r04-advisory-fixed",
    kind: "lookup",
    question: "Which LumenDB versions contain the fix for LSA-2024-07?",
    answerable: true,
    facts: [["3.1.5"], ["3.2.0", "3.2"]],
    citations: [["lumen-advisory-2024-07", "lumen-3-2-release"]],
  },
  {
    id: "r05-max-key-size",
    kind: "lookup",
    question: "What is the maximum key size in LumenDB 3.2?",
    answerable: true,
    facts: [KIB4],
    citations: [["lumen-3-2-release"]],
  },
  {
    id: "r06-quillstate-rename",
    kind: "lookup",
    question: "In Quillstate 2.0, what was createStore() renamed to?",
    answerable: true,
    facts: [["defineStore"]],
    citations: [["quillstate-migration"]],
  },
  {
    id: "r07-cobble-2-5",
    kind: "lookup",
    question: "What security feature did Cobble 2.5 add?",
    answerable: true,
    facts: [["encryption at rest", "encrypts data at rest", "AES-256"]],
    citations: [["cobble-overview"]],
  },
  {
    id: "r08-lumen-4-date",
    kind: "lookup",
    question: "When is LumenDB 4.0 planned to be released?",
    answerable: true,
    facts: [["Q2 2025", "second quarter of 2025", "Q2, 2025", "2025 Q2"]],
    citations: [["lumen-4-roadmap"]],
  },
  {
    id: "r09-rfc-period",
    kind: "lookup",
    question: "Under Tessel Foundation governance, how long must an RFC for a breaking API change stay open for comment?",
    answerable: true,
    facts: [["two weeks", "2 weeks", "14 days"]],
    citations: [["tessel-governance"]],
  },
  {
    id: "r10-reporter-library",
    kind: "multi-hop",
    question: "The person who reported LumenDB advisory LSA-2024-07 created a compression library. What is that library called?",
    answerable: true,
    facts: [["Brisk"]],
    citations: [["lumen-advisory-2024-07"], ["brisk-overview", "brisk-1-4-release"]],
  },
  {
    id: "r11-lumen-chair",
    kind: "multi-hop",
    question: "Who chairs, in 2024, the steering committee of the organization that maintains LumenDB?",
    answerable: true,
    facts: [["Ana Lindqvist", "Lindqvist"]],
    citations: [["tessel-governance"]],
  },
  {
    id: "r12-chair-library-node",
    kind: "multi-hop",
    question: "The 2024 chair of the Tessel Foundation steering committee created a library. What is the minimum Node.js version that library supports since its 2.0 release?",
    answerable: true,
    facts: [["18"]],
    citations: [["tessel-governance"], ["quillstate-overview", "quillstate-migration"]],
  },
  {
    id: "r13-cobble-license-conversion",
    kind: "multi-hop",
    question: "Cobble is source-available. Which license does each Cobble release convert to, and after how many years?",
    answerable: true,
    facts: [["Apache-2.0", "Apache 2.0", "Apache License"], ["four years", "4 years"]],
    citations: [["cobble-overview"]],
  },
  {
    id: "r14-talk-city",
    kind: "multi-hop",
    question: "In which city did the author of the May 2024 embedded store benchmark give a talk in 2024?",
    answerable: true,
    facts: [["Lisbon"]],
    citations: [["priya-talk"]],
  },
  {
    id: "r15-write-throughput",
    kind: "comparison",
    question: "In Priya Raman's benchmark, which store had higher random-write throughput, LumenDB or Cobble, and by how much?",
    answerable: true,
    facts: [["Cobble"], ["180,000", "180000", "180k", "30,000", "30000", "30k"]],
    citations: [["bench-blog-2024", "bench-correction"]],
  },
  {
    id: "r16-page-size-comparison",
    kind: "comparison",
    question: "Compare the default page or block size of LumenDB 3.x and Cobble.",
    answerable: true,
    facts: [KIB8, KIB4],
    citations: [["lumen-overview"], ["cobble-overview"]],
  },
  {
    id: "r17-corrected-read",
    kind: "contradiction",
    question: "What was LumenDB 3.1's random-read throughput in Priya Raman's benchmark? Account for any later corrections.",
    answerable: true,
    facts: [["330,000", "330000", "330k", "330 000"]],
    citations: [["bench-correction"]],
  },
  {
    id: "r18-brisk-levels",
    kind: "contradiction",
    question: "How many compression levels does the latest release of Brisk support?",
    answerable: true,
    facts: [["13"]],
    citations: [["brisk-1-4-release"]],
  },
  {
    id: "r19-faster-reads-after-correction",
    kind: "contradiction",
    question: "After the benchmark correction, which store had the higher random-read throughput, LumenDB or Cobble?",
    answerable: true,
    facts: [["LumenDB"], ["330,000", "330000", "330k", "330 000"]],
    citations: [["bench-correction"]],
  },
  {
    id: "r20-lumen-4-1-date",
    kind: "unanswerable",
    question: "When will LumenDB 4.1 be released?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "r21-brisk-downloads",
    kind: "unanswerable",
    question: "How many times has the Brisk compression library been downloaded?",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "r22-harrow-ceo",
    kind: "unanswerable",
    question: "Who is the CEO of Harrow Labs?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
