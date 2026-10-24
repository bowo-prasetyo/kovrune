import type { Report } from "./benchmark.ts";

/** Markdown summary of one report, used by the CLI, the browser page and results tables. */
export function formatReport(report: Report): string {
  const env = report.environment;
  const lines = [
    `### ${env.modelId} (${env.runtime}, hardware class ${env.hardwareClass})`,
    "",
    "| Suite | Mode | Passed | Success | Valid actions | Decode tok/s | Prefill tok/s | Median task s |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.summary.map(
      (s) =>
        `| ${s.suite} | ${s.mode} | ${s.passed}/${s.tasks} | ${(s.successRate * 100).toFixed(0)}% | ${(s.validActionRate * 100).toFixed(0)}% | ${s.decodeTokensPerSecond} | ${s.prefillTokensPerSecond} | ${s.medianTaskSeconds} |`,
    ),
    "",
    `**Gate: ${report.gate.passed ? "PASS" : "FAIL"}**`,
    "",
    ...report.gate.criteria.map((c) => `- ${c.passed ? "✅" : "❌"} ${c.name}: ${c.actual} (needs ${c.threshold})`),
  ];
  return lines.join("\n");
}
