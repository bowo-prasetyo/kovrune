// Signs and checks a release's checksums with SSH signatures (docs/releases.md).
//
//   npm run release:sign -- path/to/SHA256SUMS --key ~/.ssh/kovrune-release
//   npm run release:verify -- path/to/SHA256SUMS [--signature FILE] [--signers FILE]
//
// Signing first checks that the app built here (dist/app) matches the checksums, so the
// owner only signs what their own rebuild of the tag reproduces. It needs ssh-keygen
// (OpenSSH 8.1 or newer), which comes with Windows 10 and later, macOS and Linux.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const NAMESPACE = "kovrune-release";
const SIGNERS = "release-signers";

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** The signers a signature claims, from the signers file. */
function principals(signature: string, signers: string): string[] {
  const found = spawnSync("ssh-keygen", ["-Y", "find-principals", "-s", signature, "-f", signers], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.split("\n").filter(Boolean) : [];
}

/** Checks a signature over a file; returns who signed it. */
export function verify(file: string, signature = `${file}.sig`, signers = SIGNERS): string {
  for (const path of [file, signature, signers]) if (!existsSync(path)) fail(`${path} not found.`);
  if (!readFileSync(signers, "utf8").split("\n").some((line) => line.trim() && !line.startsWith("#"))) {
    fail(`${signers} lists no keys yet, so no signature can be checked (docs/releases.md).`);
  }
  const names = principals(signature, signers);
  if (names.length === 0) fail(`${signature} was not made by any key in ${signers}.`);
  const result = spawnSync("ssh-keygen", ["-Y", "verify", "-f", signers, "-I", names[0]!, "-n", NAMESPACE, "-s", signature], {
    input: readFileSync(file),
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`The signature does not match ${file}: ${(result.stderr || result.stdout).trim()}`);
  return names[0]!;
}

const [command, file] = process.argv.slice(2);
if (command === "sign") {
  const key = option("--key");
  if (!file || !key) fail("Usage: npm run release:sign -- path/to/SHA256SUMS --key path/to/private-key");
  // Sign only what this computer's own build reproduces.
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/checksums.ts", "--check", file], { stdio: "inherit" });
  } catch {
    fail(`Not signed: the app built here (dist/app) doesn't match ${file}. Build the release's tag first (docs/releases.md).`);
  }
  // ssh-keygen asks for the key's passphrase here, and writes FILE.sig.
  execFileSync("ssh-keygen", ["-Y", "sign", "-f", key, "-n", NAMESPACE, file], { stdio: "inherit" });
  const signers = option("--signers") ?? SIGNERS;
  console.log(`Signed: ${file}.sig. Checked against ${signers}: signed by ${verify(file, undefined, signers)}.`);
} else if (command === "verify") {
  if (!file) fail("Usage: npm run release:verify -- path/to/SHA256SUMS [--signature FILE] [--signers FILE]");
  const signer = verify(file, option("--signature"), option("--signers"));
  console.log(`Good signature on ${file} by ${signer}.`);
} else {
  fail("Usage: npm run release:sign -- SHA256SUMS --key KEY, or npm run release:verify -- SHA256SUMS");
}
