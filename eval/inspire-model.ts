// High-energy physics questions answered live by a model with no documents, once with OpenAlex and arXiv as its
// sources and once with INSPIRE-HEP and arXiv (harness 0.92.0, eval/field/README.md):
//
//   NODE_USE_ENV_PROXY=1 npm run bench:inspire -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --out inspire.json
//
// Each question is about a real paper: a value from its abstract, its journal reference, or a paper in its
// reference list. An answer passes when it is found, verified, and gives every fact group (any one spelling of
// each; case, spaces and LaTeX's thin spaces ignored). Both setups are told they can follow citations. The
// databases change daily (new records, new counts), so runs on different days are compared only with care, and
// no question asks for a count.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { createArxiv } from "../src/sources/arxiv.ts";
import { createInspire } from "../src/sources/inspire.ts";
import { createOpenAlex } from "../src/sources/openalex.ts";
import type { OpenSource } from "../src/sources/types.ts";

export const inspireQuestions: Array<{ id: string; kind: "value" | "journal" | "reference"; question: string; facts: string[][] }> = [
  {
    id: "i1-higgs-journal",
    kind: "journal",
    question: "In which journal, and in which volume, was the ATLAS paper reporting the observation of a new particle in the search for the Standard Model Higgs boson (2012) published?",
    facts: [["Phys.Lett.B", "Phys. Lett. B", "Physics Letters B"], ["716"]],
  },
  {
    id: "i2-cdf-w-mass",
    kind: "value",
    question: "What W boson mass did the CDF II high-precision measurement published in 2022 obtain?",
    facts: [["80,433", "80433"]],
  },
  {
    id: "i3-muon-g2",
    kind: "value",
    question: "What value of the muon anomalous magnetic moment a_mu did the Fermilab Muon g-2 measurement to 0.20 ppm report?",
    facts: [["116592055"]],
  },
  {
    id: "i4-pentaquark-masses",
    kind: "value",
    question: "LHCb observed J/psi p resonances consistent with pentaquark states in Lambda_b decays in 2015. What masses did it report for the two states?",
    facts: [["4380"], ["4449.8", "4450"]],
  },
  {
    id: "i5-daya-bay",
    kind: "value",
    question: "What value of sin^2(2 theta_13) did the Daya Bay experiment report in its 2012 observation of electron-antineutrino disappearance?",
    facts: [["0.092"]],
  },
  {
    id: "i6-cms-significance",
    kind: "value",
    question: "With what local significance, in standard deviations, did the CMS experiment observe a new boson at a mass of 125 GeV in 2012?",
    facts: [["5.0"]],
  },
  {
    id: "i7-higgs-1964",
    kind: "reference",
    question: "The ATLAS Higgs boson discovery paper (arXiv:1207.7214) cites papers by Peter Higgs from 1964. Give the title of one of them.",
    facts: [["Broken Symmetries and the Masses of Gauge Bosons", "Broken symmetries, massless particles and gauge fields"]],
  },
  {
    id: "i8-gell-mann",
    kind: "reference",
    question: "The 2015 LHCb pentaquark paper (arXiv:1507.03414) cites Murray Gell-Mann's 1964 paper that proposed quarks. What is that paper's title?",
    facts: [["A Schematic Model of Baryons and Mesons"]],
  },
];

/** Case, spaces and LaTeX's thin spaces ("116\,592\,055") do not count. */
export const factText = (text: string) => text.toLowerCase().replace(/\\,|[\s{}]/g, "");

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
      model: { type: "string" },
      context: { type: "string", default: "4096" },
      "extra-body": { type: "string" },
      tasks: { type: "string" },
      /** "openalex", "inspire" or both (the default), in that order. */
      setups: { type: "string", default: "openalex,inspire" },
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
  const only = values.tasks?.split(",");
  const outcomes = [];
  for (const setup of values.setups!.split(",")) {
    for (const task of inspireQuestions) {
      if (only && !only.some((id) => task.id.startsWith(id))) continue;
      const start = Date.now();
      const arxiv = createArxiv({ extractPdf: (bytes) => extractPdfText(bytes, pdfjs) });
      const first: OpenSource = setup === "inspire" ? createInspire(fetch, { arxiv }, { followCitations: true }) : createOpenAlex(fetch, undefined, {}, { arxiv }, { followCitations: true });
      const result = await runResearch({ question: task.question, library: new ResearchLibrary([]), model, sources: [first, arxiv], constrained: true });
      const final = result.final;
      const facts = !!final && task.facts.every((group) => group.some((option) => factText(final.answer).includes(factText(option))));
      const outcome = {
        setup,
        taskId: task.id,
        kind: task.kind,
        passed: !!final && final.found && facts && result.status === "verified",
        facts,
        status: result.status,
        ...(final ? { answer: final.answer } : {}),
        cited: [...new Set((final?.evidence ?? []).map((e) => e.docId.replace(/#\d+$/, "")))],
        // Each quote as checked, and why one was not found, to tell a wrong answer from a quote written another way.
        evidence: result.evidence.map((e) => ({ docId: e.docId, quote: e.quote, verified: e.verified, ...(e.reason ? { reason: e.reason } : {}) })),
        actions: result.agent.calls.filter((c) => c.valid).map((c) => `${c.tool} ${JSON.stringify(c.args)}`),
        errors: result.sourceErrors,
        seconds: Math.round((Date.now() - start) / 1000),
      };
      outcomes.push(outcome);
      console.log(`${setup} ${task.id}: ${outcome.passed ? "pass" : "fail"} (facts ${facts}, ${result.status}) ${outcome.seconds} s${final ? ` — ${final.answer.slice(0, 160)}` : ""}`);
    }
  }
  for (const setup of values.setups!.split(",")) {
    const mine = outcomes.filter((o) => o.setup === setup);
    console.log(`${setup}: ${mine.filter((o) => o.passed).length} of ${mine.length} passed.`);
  }
  if (values.out) await writeFile(values.out, `${JSON.stringify({ model: values.model, date: new Date().toISOString(), outcomes }, null, 2)}\n`);
}
