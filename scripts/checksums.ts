// SHA-256 checksums of the built app, to compare a rebuild with a release (docs/releases.md).
//
//   npm run checksums                       writes dist/SHA256SUMS for dist/app
//   npm run checksums -- --check FILE       compares dist/app with a SHA256SUMS file
//
// The format is that of `sha256sum`, so `cd dist/app && sha256sum -c ../SHA256SUMS` works too.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = "dist/app";
const OUTPUT = "dist/SHA256SUMS";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** "hash  path" lines, sorted by path, with forward slashes on every platform. */
export function checksums(root: string): string {
  return (
    files(root)
      .map((file) => relative(root, file).split(sep).join("/"))
      .sort()
      .map((path) => `${createHash("sha256").update(readFileSync(join(root, path))).digest("hex")}  ${path}`)
      .join("\n") + "\n"
  );
}

function parse(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (match) entries.set(match[2]!.replace(/^\.\//, ""), match[1]!);
  }
  return entries;
}

const checkIndex = process.argv.indexOf("--check");
const actual = checksums(APP);
if (checkIndex === -1) {
  writeFileSync(OUTPUT, actual);
  console.log(`Wrote ${OUTPUT} (${actual.trim().split("\n").length} files)`);
} else {
  const expectedFile = process.argv[checkIndex + 1];
  if (!expectedFile) throw new Error("Usage: npm run checksums -- --check SHA256SUMS");
  const expected = parse(readFileSync(expectedFile, "utf8"));
  const built = parse(actual);
  const problems: string[] = [];
  for (const [path, hash] of expected) {
    if (!built.has(path)) problems.push(`missing:   ${path}`);
    else if (built.get(path) !== hash) problems.push(`different: ${path}`);
  }
  for (const path of built.keys()) if (!expected.has(path)) problems.push(`extra:     ${path}`);
  if (problems.length) {
    console.error(`The build in ${APP} does not match ${expectedFile}:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`All ${expected.size} files in ${APP} match ${expectedFile}.`);
}
