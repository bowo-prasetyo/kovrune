// Runs the M0 benchmark against an OpenAI-compatible local model server.
//
//   npm run bench:endpoint -- --base-url http://localhost:11434/v1 --model qwen3:4b \
//     --context 8192 --hardware-class 2 --out eval/results/qwen3-4b-ollama.json
//
// Press Ctrl+C to stop early; the completed tasks are still reported and written.
// Browser runtimes (WebLLM, wllama) are benchmarked with the page in eval/browser/.

import { cpus, totalmem, platform, arch } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { runBenchmark, type Mode, type Preset } from "./harness/benchmark.ts";
import { formatCall, formatReport } from "./harness/format.ts";
import { NodeCodeRunner } from "./harness/sandbox.ts";
import { describeSelfCheck, runSelfCheck } from "./harness/self-check.ts";
import type { SuiteName } from "./harness/suites.ts";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://localhost:11434/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "api-key": { type: "string" },
    "extra-body": { type: "string" },
    suites: { type: "string", default: "research,coding" },
    modes: { type: "string", default: "constrained,unconstrained" },
    preset: { type: "string", default: "full" },
    tasks: { type: "string" },
    "ignore-self-check": { type: "boolean", default: false },
    "hardware-class": { type: "string", default: "other" },
    notes: { type: "string" },
    out: { type: "string" },
  },
});

if (values.preset !== "full" && values.preset !== "quick") {
  console.error(`Unknown --preset "${values.preset}". Use "full" or "quick".`);
  process.exit(1);
}
if (!values.model) {
  console.error("Missing --model. Example: --model qwen3:4b");
  process.exit(1);
}

const contextLength = Number(values.context);
const model = new LocalEndpointModel({
  baseUrl: values["base-url"],
  model: values.model,
  contextLength,
  apiKey: values["api-key"],
  extraBody: values["extra-body"] ? JSON.parse(values["extra-body"]) : undefined,
});

const controller = new AbortController();
process.once("SIGINT", () => {
  console.log("\nStopping after discarding the current task. Press Ctrl+C again to quit immediately.");
  controller.abort();
  process.once("SIGINT", () => process.exit(130));
});

console.log("Running the self-check…");
const selfCheck = await runSelfCheck(model, controller.signal);
if (controller.signal.aborted) process.exit(130);
for (const line of describeSelfCheck(selfCheck)) console.log(line);
if (!selfCheck.passed && !values["ignore-self-check"]) {
  console.error("Self-check failed, so the benchmark did not start. Check that the server supports json_schema response_format, or pass --ignore-self-check.");
  process.exit(1);
}

const report = await runBenchmark({
  model,
  runner: new NodeCodeRunner(),
  selfCheck,
  signal: controller.signal,
  environment: {
    runtime: "local-endpoint",
    modelId: values.model,
    contextLength,
    hardwareClass: values["hardware-class"],
    hardware: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      cpuCores: cpus().length,
      memoryGb: Math.round(totalmem() / 2 ** 30),
      endpoint: values["base-url"],
    },
    notes: values.notes,
  },
  config: {
    suites: values.suites.split(",") as SuiteName[],
    modes: values.modes.split(",") as Mode[],
    preset: values.preset as Preset,
    taskIds: values.tasks?.split(","),
  },
  onCall: (call, index) => console.log(formatCall(call, index)),
  onResult: (result, done, total) => {
    console.log(`[${done}/${total}] ${result.mode} ${result.taskId}: ${result.passed ? "PASS" : "FAIL"} (${(result.wallMs / 1000).toFixed(1)} s)`);
  },
});

console.log(`\n${formatReport(report)}`);
if (values.out) {
  await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report written to ${values.out}`);
}
