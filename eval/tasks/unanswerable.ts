// Unanswerable questions over the base corpus (docs/m1-plan.md, slice 2).
//
// Each question is plausible and close to something the corpus does say, but
// the corpus does not answer it. A task passes only if the agent reports
// found=false. With 3 such tasks in M0, one task was 33 percentage points; these
// 8 make the refusal rate measurable.

import type { ResearchTask } from "./research.ts";

const unanswerable = (id: string, question: string): ResearchTask => ({
  id,
  kind: "unanswerable",
  question,
  answerable: false,
  facts: [],
  citations: [],
});

export const unanswerableTasks: ResearchTask[] = [
  // Harrow Labs' head count is given; the foundation's is not.
  unanswerable("u01-tessel-employees", "How many employees does the Tessel Foundation have?"),
  // Cobble Cloud is announced without a price.
  unanswerable("u02-cobble-cloud-price", "How much does Cobble Cloud cost per month?"),
  // No acquisition is mentioned anywhere.
  unanswerable("u03-harrow-acquirer", "Which company acquired Harrow Labs?"),
  // Only Brisk 1.4's release date is given.
  unanswerable("u04-brisk-1-3-date", "When was Brisk 1.3 released?"),
  // Mira Okafor appears only as LumenDB's creator in 2019.
  unanswerable("u05-okafor-role", "What is Mira Okafor's current job title?"),
  // No repository statistics appear.
  unanswerable("u06-lumen-stars", "How many GitHub stars does LumenDB have?"),
  // The advisory gives a CVSS score but no CVE identifier.
  unanswerable("u07-advisory-cve", "Which CVE identifier was assigned to LumenDB advisory LSA-2024-07?"),
  // LumenDB is written in Rust, but no minimum compiler version is given.
  unanswerable("u08-lumen-rust-version", "What is the minimum Rust compiler version needed to build LumenDB?"),
];
