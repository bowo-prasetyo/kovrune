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
  } else if (!new RegExp(`^\\| ${change.headVersion.replace(/\./g, "\\.")} \\|`, "m").test(change.changelog)) {
    found.push(`docs/m0-benchmark.md has no changelog row for harness ${change.headVersion} ("| ${change.headVersion} | …").`);
  }
  const measured = measurementSection(change.body);
  const recorded = change.files.some((f) => f.startsWith("eval/results/"));
  if (!recorded && measured.length < 20) {
    found.push(
      'Say how the change was measured under a "## Measurement" heading of the pull request description (bench:replay, bench:retrieval or a model run, with the paired counts as eval/field/README.md asks), or add the recorded run under eval/results/.',
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
