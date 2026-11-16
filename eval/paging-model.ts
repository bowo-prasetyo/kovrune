// Questions where a preview user's reports read a long paper part after part, asked again live with OpenAlex
// and arXiv as the sources and no documents (harness 0.88.0, eval/cs/README.md):
//
//   NODE_USE_ENV_PROXY=1 npm run bench:paging -- --model qwen3.5-4b-q4km \
//     --extra-body '{"chat_template_kwargs":{"enable_thinking":false},"cache_prompt":false}' --out paging.json
//
// The questions have no fixed answer, so nothing is scored right or wrong: each run records its label, the
// reads in order, the reads that paged (part n after n-2 and n-1 of one document) and those the guard
// redirected, and the documents the answer cites. Run on the code before and after, the same day.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { createArxiv } from "../src/sources/arxiv.ts";
import { createOpenAlex } from "../src/sources/openalex.ts";

export const pagingQuestions = [
  { id: "p1-decentralized-architectures", question: "What are the primary technical architectures and consensus mechanisms used to build decentralized Large Language Models?" },
  { id: "p2-gp-llm-hybrids", question: "What specific architectural modifications or hybrid models are proposed to combine the search capabilities of Genetic Programming with the generative reasoning of LLMs?" },
  { id: "p3-decentralized-inference", question: "What are the current research findings regarding the scalability, energy efficiency, and security vulnerabilities of decentralized LLM inference?" },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" }, model: { type: "string" }, context: { type: "string", default: "4096" }, "extra-body": { type: "string" }, out: { type: "string" } } });
  if (!values.model) throw new Error("Missing --model");
  const model = new LocalEndpointModel({ baseUrl: values["base-url"], model: values.model, contextLength: Number(values.context), extraBody: values["extra-body"] ? JSON.parse(values["extra-body"]) : undefined });
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  const outcomes = [];
  for (const task of pagingQuestions) {
    const start = Date.now();
    const arxiv = createArxiv({ extractPdf: (bytes) => extractPdfText(bytes, pdfjs) });
    const result = await runResearch({ question: task.question, library: new ResearchLibrary([]), model, sources: [createOpenAlex(fetch, undefined, {}, { arxiv }), arxiv], constrained: true });
    const reads = result.agent.calls.filter((c) => c.valid && c.tool === "read").map((c) => ({ asked: String((c.args as { docId: string }).docId), shown: c.shown }));
    const paged = reads.filter((r, i) => {
      const m = /^(.*)#(\d+)$/.exec(r.asked);
      return !!m && i >= 2 && reads[i - 1]!.asked === `${m[1]}#${Number(m[2]) - 1}` && reads[i - 2]!.asked === `${m[1]}#${Number(m[2]) - 2}`;
    }).length;
    const outcome = {
      taskId: task.id,
      status: result.status,
      found: result.final?.found ?? false,
      backed: result.support ? `${result.support.backed} of ${result.support.judged}` : undefined,
      reads: reads.length,
      paged,
      redirected: reads.filter((r) => r.shown?.includes("the best match")).length,
      documents: new Set(reads.map((r) => r.asked.replace(/#\d+$/, ""))).size,
      cited: [...new Set((result.final?.evidence ?? []).map((e) => e.docId.replace(/#\d+$/, "")))],
      ...(result.final ? { answer: result.final.answer } : {}),
      actions: result.agent.calls.filter((c) => c.valid).map((c) => `${c.tool} ${JSON.stringify(c.args)}${c.shown ? ` (${c.shown})` : ""}`),
      seconds: Math.round((Date.now() - start) / 1000),
    };
    outcomes.push(outcome);
    console.log(`${task.id}: ${outcome.status}, found ${outcome.found}, ${outcome.reads} reads (${outcome.paged} paged, ${outcome.redirected} redirected), ${outcome.documents} documents, ${outcome.seconds} s`);
  }
  if (values.out) await writeFile(values.out, `${JSON.stringify({ model: values.model, date: new Date().toISOString(), outcomes }, null, 2)}\n`);
}
