// Runs the M0 benchmark against an OpenAI-compatible local model server.
//
//   npm run bench:endpoint -- --base-url http://localhost:11434/v1 --model qwen3:4b \
//     --context 8192 --hardware-class 2 --out eval/results/qwen3-4b-ollama.json
//
// Browser runtimes (WebLLM, wllama) are benchmarked with the page in eval/browser/.

import { cpus, totalmem, platform, arch } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { runBenchmark, type Mode } from "./harness/benchmark.ts";
import { formatReport } from "./harness/format.ts";
import { NodeCodeRunner } from "./harness/sandbox.ts";
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
    tasks: { type: "string" },
    "hardware-class": { type: "string", default: "other" },
    notes: { type: "string" },
    out: { type: "string" },
  },
});

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

const report = await runBenchmark({
  model,
  runner: new NodeCodeRunner(),
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
    taskIds: values.tasks?.split(","),
  },
  onResult: (result, done, total) => {
    console.log(`[${done}/${total}] ${result.mode} ${result.taskId}: ${result.passed ? "PASS" : "FAIL"} (${(result.wallMs / 1000).toFixed(1)} s)`);
  },
});

console.log(`\n${formatReport(report)}`);
if (values.out) {
  await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report written to ${values.out}`);
}
