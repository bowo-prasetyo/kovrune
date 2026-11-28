// The way of working every pull request follows (CONTRIBUTING.md), checked in CI.
//
//   node --experimental-strip-types scripts/way-of-working.ts <base ref>
//
// The pull request's description is read from the PR_BODY environment variable. A change to what the
// model is shown, or to how answers are scored or labelled, must:
// 1. bump HARNESS_VERSION (eval/harness/benchmark.ts), so results before and after it can't be mixed;
// 2. add that version's row to the changelog in docs/m0-benchmark.md;
// 3. say how it was measured, under a "## Measurement" heading of the description, or add a recorded run
//    under eval/results/. Measured by the rule in eval/field/README.md: bench:replay or bench:retrieval
//    where they settle it, a model run on both models otherwise.
// A measurement that is still to come is not one: a Measurement section or changelog row that says it
// is pending fails. A change to the rules that decide an answer's label (LABEL_RULES) must also give
// false reassurance (CONTRIBUTING.md), which bench:rescore works out without a model.
// Anything else (the app's screens, docs, tests, CI) needs none of this.

import { execFileSync } from "node:child_process";

/**
 * Paths whose changes can alter what the model is shown, which answers pass, or how they are labelled.
 * The app's screens (src/app/) and the tests cannot.
 */
const MODEL_FACING = [
  /^src\/(agent|tools|documents|sources|models)\//,
  /^eval\/harness\//,
  /^eval\/[^/]+\/tasks\.ts$/,
  /^eval\/field\/(holdout|multi|office|reports|tasks)\.ts$/,
];

export function isModelFacing(path: string): boolean {
  return /\.(ts|tsx|js|mjs)$/.test(path) && MODEL_FACING.some((pattern) => pattern.test(path));
}

/** The modules whose rules decide whether an answer is labelled Quotes found ("Backed by quotes"). */
const LABEL_RULES = /^src\/agent\/(support|evidence|review|crosscheck|completeness|chemistry|phases|properties|mathematics|socialscience|trustworthiness)\.ts$/;

export function isLabelRule(path: string): boolean {
  return LABEL_RULES.test(path);
}

/**
 * Wording that says the measurement has not been made yet. #219 merged a label change whose description
 * said "Not yet measured" under its Measurement heading, and the check, which looked only for text there,
 * passed it.
 */
const PENDING = [
  // "Not yet measured", "have not been run"; a bare "Not measured: …" names what a change leaves out of scope.
  /\bnot\s+yet\s+(?:been\s+)?(?:measured|run|recorded|re-?scored)\b/i,
  /\b(?:has|have|hasn't|haven't)\s+(?:not\s+)?(?:yet\s+)?been\s+(?:measured|run|recorded|re-?scored)\b/i,
  /\bmeasurements?\s+(?:is\s+|are\s+)?(?:still\s+)?pending\b/i,
  /\bpending\s+(?:measurement|model\s+runs?|runs?|rescore)\b/i,
  /\b(?:runs?|rescore|re-?scoring|model\s+runs?)\s+(?:is\s+|are\s+)?(?:still\s+)?pending\b/i,
  /\b(?:to|will)\s+be\s+measured\b/i,
  /\bTBD\b/,
];

/** The first phrase in the text that says a measurement is still to come, if any. */
export function pendingPhrase(text: string): string | undefined {
  for (const pattern of PENDING) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return undefined;
}

/** The changelog row for a harness version, without its leading "| version |". */
export function changelogRow(changelog: string, version: string): string | undefined {
  return new RegExp(`^\\| ${version.replace(/\./g, "\\.")} \\|(.*)$`, "m").exec(changelog)?.[1];
}

const VERSION = /export const HARNESS_VERSION = "(\d+\.\d+\.\d+)"/;

export function harnessVersion(source: string): string | undefined {
  return VERSION.exec(source)?.[1];
}

/** The text under the description's "## Measurement" heading, without template comments; empty when there is none. */
export function measurementSection(body: string): string {
  const match = /^##\s+Measurement\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(body);
  if (!match) return "";
  return match[1]!.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export interface Change {
  files: string[];
  baseVersion?: string;
  headVersion?: string;
  changelog: string;
  body: string;
}

/** What the change still needs, as messages for the author; empty when it follows the way of working. */
export function problems(change: Change): string[] {
  const facing = change.files.filter(isModelFacing);
  if (!facing.length) return [];
  const found: string[] = [];
  const shown = facing.slice(0, 5).join(", ") + (facing.length > 5 ? ` and ${facing.length - 5} more` : "");
  if (!change.headVersion || change.headVersion === change.baseVersion) {
    found.push(`This change touches model-facing code (${shown}), so it must bump HARNESS_VERSION in eval/harness/benchmark.ts (still ${change.baseVersion ?? "unknown"}).`);
  } else {
    const row = changelogRow(change.changelog, change.headVersion);
    if (row === undefined) {
      found.push(`docs/m0-benchmark.md has no changelog row for harness ${change.headVersion} ("| ${change.headVersion} | …").`);
    } else if (pendingPhrase(row)) {
      found.push(`The changelog row for harness ${change.headVersion} says the measurement is still to come ("${pendingPhrase(row)}"). Measure the change before it is merged, and write what it did to the results.`);
    }
  }
  const measured = measurementSection(change.body);
  const recorded = change.files.some((f) => f.startsWith("eval/results/"));
  if (!recorded && measured.length < 20) {
    found.push(
      'Say how the change was measured under a "## Measurement" heading of the pull request description (bench:replay, bench:retrieval or a model run, with the paired counts as eval/field/README.md asks), or add the recorded run under eval/results/.',
    );
  } else if (pendingPhrase(measured)) {
    found.push(
      `The Measurement section says the measurement is still to come ("${pendingPhrase(measured)}"). A change is measured before it is merged: run it, or split off the part that can't be measured yet.`,
    );
  }
  const rules = change.files.filter(isLabelRule);
  if (rules.length && !/false[\s-]+reassurance/i.test(measured)) {
    found.push(
      `This change touches the rules that decide an answer's label (${rules.join(", ")}), so its Measurement section must give false reassurance before and after (CONTRIBUTING.md). bench:rescore -- <recorded runs> gives it without a model.`,
    );
  }
  return found;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function show(ref: string, path: string): string {
  try {
    return git("show", `${ref}:${path}`);
  } catch {
    return "";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2];
  if (!base) {
    console.error("Usage: scripts/way-of-working.ts <base ref>");
    process.exit(2);
  }
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const files = git("diff", "--name-only", mergeBase, "HEAD").split("\n").filter(Boolean);
  const found = problems({
    files,
    baseVersion: harnessVersion(show(mergeBase, "eval/harness/benchmark.ts")),
    headVersion: harnessVersion(show("HEAD", "eval/harness/benchmark.ts")),
    changelog: show("HEAD", "docs/m0-benchmark.md"),
    body: process.env.PR_BODY ?? "",
  });
  const facing = files.filter(isModelFacing);
  if (!found.length) {
    console.log(facing.length ? `Model-facing change (${facing.length} files): harness bumped, changelog row and measurement present.` : "No model-facing change: nothing more to check.");
  } else {
    for (const message of found) console.log(`::error::${message}`);
    console.log("\nSee CONTRIBUTING.md, \"Changes to what the model is shown\".");
    process.exit(1);
  }
}
