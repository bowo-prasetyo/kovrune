// Compares two benchmark reports of the same tasks, a baseline and a change, task by task
// (eval/harness/compare.ts):
//
//   npm run bench:compare -- eval/results/<baseline>.json eval/results/<change>.json

import { readFile } from "node:fs/promises";
import { compareReports, formatComparison } from "./harness/compare.ts";
import type { Report } from "./harness/benchmark.ts";

const files = process.argv.slice(2);
if (files.length !== 2) {
  console.error("Give two reports: the baseline, then the change.");
  process.exit(1);
}
const [before, after] = (await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8"))))) as [Report, Report];
console.log(formatComparison(compareReports(before, after)));
