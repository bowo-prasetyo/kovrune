// Questions that need a paper's citations followed, answered live by a model with OpenAlex and arXiv as its
// sources and no documents (harness 0.82.0, eval/cs/README.md):
//
//   NODE_USE_ENV_PROXY=1 npm run bench:citations -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --extra-body '{"chat_template_kwargs":{"enable_thinking":false},"cache_prompt":false}' --out citations.json
//
// Each question names a paper and asks about one it cites or one that cites it. An answer passes when it is
// found, verified, and gives every fact group (any one spelling of each, case and spacing ignored). OpenAlex
// changes daily (new citing works, new counts), so runs on different days are compared only with care, and
// no question asks for a count. An OpenAlex key, if the environment has one, is sent by the proxy.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { createArxiv } from "../src/sources/arxiv.ts";
import * as openalex from "../src/sources/openalex.ts";

export const citationQuestions: Array<{ id: string; question: string; facts: string[][] }> = [
  {
    id: "q1-selfrag-ppo",
    question: "Self-RAG (Asai et al., 2023, arXiv 2310.11511) cites a reinforcement learning algorithm paper. Which paper introduced PPO, and who is its first author?",
    facts: [["Proximal Policy Optimization"], ["Schulman"]],
  },
  {
    id: "q2-rag-medical-multilingual",
    question: "Which 2024 benchmark for medical question answering in several languages cites the retrieval-augmented generation paper by Lewis et al. (2020)? Give its name.",
    facts: [["MedExpQA"]],
  },
  {
    id: "q3-lost-middle-graph",
    question: "A paper citing 'Lost in the Middle: How Language Models Use Long Contexts' (Liu et al.) proposes a graph-based approach to retrieval-augmented generation. What kind of summarization does it address?",
    facts: [["query-focused", "query focused"]],
  },
  {
    id: "q4-selfrag-controllable",
    question: "Self-RAG (Asai et al., 2023) cites a 2019 conditional transformer language model for controllable generation. What is that model called?",
    facts: [["CTRL"]],
  },
  {
    id: "q5-acl-user-simulation",
    question: "Which paper citing the ACL 2023 paper with DOI 10.18653/v1/2023.acl-long.1 gives a formal characterization of user simulation objectives, and in which year was it published?",
    facts: [["formal characterization"], ["2024"]],
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
      model: { type: "string" },
      context: { type: "string", default: "4096" },
      "extra-body": { type: "string" },
      tasks: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.model) {
    console.error("Missing --model, e.g. --model qwen3.5-4b-q4km");
    process.exit(1);
  }
  const model = new LocalEndpointModel({
    baseUrl: values["base-url"],
    model: values.model,
    contextLength: Number(values.context),
    extraBody: values["extra-body"] ? JSON.parse(values["extra-body"]) : undefined,
  });
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ");
  const only = values.tasks?.split(",");
  const outcomes = [];
  for (const task of citationQuestions) {
    if (only && !only.some((id) => task.id.startsWith(id))) continue;
    const start = Date.now();
    const arxiv = createArxiv({ extractPdf: (bytes) => extractPdfText(bytes, pdfjs) });
    const sources = [openalex.createOpenAlex(fetch, undefined, {}, { arxiv }), arxiv];
    const result = await runResearch({ question: task.question, library: new ResearchLibrary([]), model, sources, constrained: true });
    const final = result.final;
    const facts = !!final && task.facts.every((group) => group.some((option) => norm(final.answer).includes(norm(option))));
    const actions = result.agent.calls.filter((c) => c.valid).map((c) => `${c.tool} ${JSON.stringify(c.args)}`);
    const outcome = {
      taskId: task.id,
      passed: !!final && final.found && facts && result.status === "verified",
      facts,
      status: result.status,
      // A search the source reads as following citations; before 0.82.0 there is no such reading.
      followed: result.agent.calls.some((c) => c.valid && c.tool === "search_openalex" && Boolean((openalex as { citationQuery?: (q: string) => unknown }).citationQuery?.((c.args as { query: string }).query))),
      ...(final ? { answer: final.answer } : {}),
      cited: [...new Set((final?.evidence ?? []).map((e) => e.docId.replace(/#\d+$/, "")))],
      actions,
      seconds: Math.round((Date.now() - start) / 1000),
    };
    outcomes.push(outcome);
    console.log(`${task.id}: ${outcome.passed ? "pass" : "fail"} (facts ${facts}, ${result.status}, followed citations ${outcome.followed}) ${outcome.seconds} s`);
  }
  console.log(`${outcomes.filter((o) => o.passed).length} of ${outcomes.length} passed; citations followed in ${outcomes.filter((o) => o.followed).length}.`);
  if (values.out) await writeFile(values.out, `${JSON.stringify({ model: values.model, date: new Date().toISOString(), outcomes }, null, 2)}\n`);
}
