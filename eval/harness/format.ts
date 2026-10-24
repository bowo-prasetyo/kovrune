import type { CallRecord } from "./agent.ts";
import type { Report } from "./benchmark.ts";

/** Markdown summary of one report, used by the CLI, the browser page and results tables. */
export function formatReport(report: Report): string {
  const env = report.environment;
  const done = report.results.length;
  const scope = report.config.taskIds ? "selected tasks" : `${report.config.preset ?? "full"} preset`;
  const lines = [
    `### ${env.modelId} (${env.runtime}, hardware class ${env.hardwareClass})`,
    "",
    `Run: ${scope}, ${done} task runs${report.complete ? "" : " — **stopped early, partial results**"}.`,
    ...(report.selfCheck
      ? [`Self-check: ${report.selfCheck.passed ? "passed" : "failed"}, ${report.selfCheck.decodeTokensPerSecond} tokens/s.`]
      : []),
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

/** One progress line per model call, e.g. `  call 2: search {"query":"..."} (14.2 s, 3.1 tok/s)`. */
export function formatCall(call: CallRecord, index: number): string {
  const decodeMs = Math.max(call.totalMs - call.ttftMs, 1);
  const timing = `${(call.totalMs / 1000).toFixed(1)} s, ${((call.completionTokens / decodeMs) * 1000).toFixed(1)} tok/s`;
  const action = call.valid
    ? `${call.tool} ${JSON.stringify(call.args)}`.slice(0, 120)
    : `INVALID: ${call.error}. Output: ${JSON.stringify(call.output ?? "")}`;
  return `  call ${index}: ${action} (${timing})`;
}
