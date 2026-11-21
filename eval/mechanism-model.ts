// Broad "how does X work" questions, asked live against the open sources, to measure two things no suite
// measures (harness 0.104.0):
//
//   NODE_USE_ENV_PROXY=1 npm run bench:mechanism -- --model qwen3.5-4b-q4km \
//     --extra-body '{"chat_template_kwargs":{"enable_thinking":false},"cache_prompt":false}' --out mechanism.json
//
// 1. Whether the answer is responsive, not merely grounded. A preview user asked "How does blood
//    circulate?" and got four sentences from one Wikipedia lead saying what the circulatory system is,
//    has and carries, every quote word for word and every sentence backed: "✓ Quotes found". The suites
//    ask for facts ("which concentration", "which version"), which an answer either gives or does not,
//    so a definition offered in place of a mechanism is a kind of wrong answer they cannot show. Each
//    question here lists the steps a mechanism answer has to name, in the spellings a small model uses;
//    `steps` counts the groups the answer gives. It is a weak score on purpose: a step missing from the
//    paper the model happened to find is not the model's fault, so the counts say how responsive the
//    answers were on one day, not whether a change is better (eval/field/README.md, the rule).
//
// 2. How much of what was searched was read. The same question searched four sources, got five results
//    from each, and opened one document: everything rested on one part of one article. Each run records
//    the documents and the sources opened, the parts given twice (`repeatedParts`, which the repeat-part
//    note is for), and the sources the answer cites.
//
// The sources are Europe PMC and DataCite. Wikipedia, which the user's own question read, is not
// reachable from the harness container, and OpenAlex had no requests left in the shared daily budget on
// the day these ran; the questions are biomedical, so Europe PMC is the source that answers them, and
// DataCite is there to make "how many of the sources searched were opened" a question with an answer.
// No question has a fixed answer, so nothing here is a pass or a fail.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { createDataCite } from "../src/sources/datacite.ts";
import { createEuropePmc } from "../src/sources/europepmc.ts";

export interface MechanismQuestion {
  id: string;
  question: string;
  /** The steps a mechanism answer has to name; each group lists accepted spellings. */
  steps: string[][];
}

export const mechanismQuestions: MechanismQuestion[] = [
  {
    // The preview user's own question, which "✓ Quotes found" was given to a definition.
    id: "m1-blood-circulation",
    question: "How does blood circulate?",
    steps: [
      ["pump", "pumps", "pumping", "contract", "contracts", "contraction", "beat", "heartbeat", "systole"],
      ["pressure", "gradient"],
      ["arter", "capillar", "vein", "venous", "vessel"],
    ],
  },
  {
    id: "m2-neuron-signal",
    question: "How does a neuron pass a signal to the next neuron?",
    steps: [
      ["action potential", "depolaris", "depolariz", "spike"],
      ["neurotransmitter", "transmitter", "glutamate", "vesicle"],
      ["synap", "cleft", "receptor"],
    ],
  },
  {
    id: "m3-insulin-glucose",
    question: "How does insulin lower blood glucose?",
    steps: [
      ["receptor", "signalling", "signaling", "cascade"],
      ["GLUT4", "GLUT-4", "transporter", "uptake", "takes up"],
      ["muscle", "adipose", "fat", "liver", "hepatic"],
    ],
  },
  {
    id: "m4-antibiotic-resistance",
    question: "How do bacteria become resistant to antibiotics?",
    steps: [
      ["mutation", "mutations", "mutate"],
      ["horizontal", "plasmid", "transfer", "conjugation"],
      ["efflux", "beta-lactamase", "β-lactamase", "enzyme", "degrade", "inactivat", "target"],
    ],
  },
  {
    id: "m5-mrna-vaccine",
    question: "How does an mRNA vaccine produce immunity?",
    steps: [
      ["lipid nanoparticle", "nanoparticle", "LNP"],
      ["translat", "ribosome", "spike protein", "antigen"],
      ["antibod", "T cell", "T-cell", "immune response", "immunity"],
    ],
  },
];

/** How many step groups the answer gives, compared as the suites compare facts: case-insensitive substrings. */
export function stepsGiven(answer: string, steps: string[][]): number {
  const text = answer.toLowerCase();
  return steps.filter((group) => group.some((spelling) => text.includes(spelling.toLowerCase()))).length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
      model: { type: "string" },
      context: { type: "string", default: "4096" },
      "extra-body": { type: "string" },
      out: { type: "string" },
      only: { type: "string" },
    },
  });
  if (!values.model) throw new Error("Missing --model");
  const model = new LocalEndpointModel({
    baseUrl: values["base-url"],
    model: values.model,
    contextLength: Number(values.context),
    extraBody: values["extra-body"] ? JSON.parse(values["extra-body"]) : undefined,
  });
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  const only = values.only ? new Set(values.only.split(",")) : undefined;
  const outcomes = [];
  for (const task of mechanismQuestions.filter((t) => !only || only.has(t.id))) {
    const start = Date.now();
    const result = await runResearch({
      question: task.question,
      library: new ResearchLibrary([]),
      model,
      sources: [createEuropePmc(fetch), createDataCite({ extractPdf: (bytes) => extractPdfText(bytes, pdfjs) })],
      constrained: true,
    });
    const reads = result.agent.calls
      .filter((c) => c.valid && c.tool === "read")
      .map((c) => ({ asked: String((c.args as { docId: string }).docId), shown: c.shown }));
    // Parts given a second time: the same document and the same "part n of m", however it was asked for.
    const seen = new Set<string>();
    let repeatedParts = 0;
    for (const read of reads) {
      const key = `${read.asked.replace(/#\d+$/, "")} ${read.shown ?? ""}`;
      if (read.shown?.startsWith("part ") && seen.has(key)) repeatedParts++;
      seen.add(key);
    }
    const documents = [...new Set(reads.map((r) => r.asked.replace(/#\d+$/, "")))];
    const answer = result.final?.answer ?? "";
    const outcome = {
      taskId: task.id,
      status: result.status,
      found: result.final?.found ?? false,
      backed: result.support ? `${result.support.backed} of ${result.support.judged}` : undefined,
      steps: `${stepsGiven(answer, task.steps)} of ${task.steps.length}`,
      reads: reads.length,
      repeatedParts,
      noted: reads.filter((r) => r.shown?.includes("part")).length,
      documents: documents.length,
      sources: new Set(documents.map((id) => id.split(":")[0])).size,
      cited: [...new Set((result.final?.evidence ?? []).map((e) => e.docId.replace(/#\d+$/, "")))],
      ...(result.final ? { answer } : {}),
      actions: result.agent.calls.filter((c) => c.valid).map((c) => `${c.tool} ${JSON.stringify(c.args)}${c.shown ? ` (${c.shown})` : ""}`),
      seconds: Math.round((Date.now() - start) / 1000),
    };
    outcomes.push(outcome);
    console.log(
      `${task.id}: ${outcome.status}, found ${outcome.found}, ${outcome.backed ?? "-"} backed, steps ${outcome.steps}, ` +
        `${outcome.reads} reads (${outcome.repeatedParts} the same part again), ${outcome.documents} documents from ${outcome.sources} sources, ${outcome.seconds} s`,
    );
  }
  if (values.out) await writeFile(values.out, `${JSON.stringify({ model: values.model, date: new Date().toISOString(), outcomes }, null, 2)}\n`);
}
