// Builds the social-science suite's documents (eval/socsci/docs/*.md) from Europe PMC's full-text XML, with
// the app's own converter (src/sources/jats.ts), so each paper reads as Kovrune reads it from Europe PMC:
// its merged table cells spread over their columns and rows, its bold cells kept, and its tables in
// <floats-group> placed after the paragraph that cites them (harness 0.101.0). The other suites' papers were
// built by eval/clinical/source/jats2md.py, which predates those fixes. Each article must be CC BY 4.0, or it
// is refused. Run from the repository root:
//
//   node --experimental-strip-types eval/socsci/source/build.ts            # downloads the XML of each PMCID
//   node --experimental-strip-types eval/socsci/source/build.ts --xml DIR  # uses DIR/<PMCID>.xml instead

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { jatsToMarkdown, parseXml } from "../../../src/sources/jats.ts";

/** PMCID -> document file name (without .md). Order is the order of eval/socsci/tasks.ts. */
export const ARTICLES: Record<string, string> = {
  PMC12562420: "pharmacist-trust-vaccination-survey",
  PMC12753609: "income-inequality-life-expectancy-canada",
  PMC12282911: "politician-email-field-experiment",
  PMC11913262: "party-realignment-single-issue-voters",
  PMC12480459: "older-people-care-academia-gender-gap",
  PMC12176151: "cash-transfer-food-security-nigeria",
  PMC12216660: "psycho-oncologists-patient-deaths",
  PMC12422356: "social-relationships-long-term-conditions",
};

const API = "https://www.ebi.ac.uk/europepmc/webservices/rest";

const { values } = parseArgs({ options: { xml: { type: "string" } } });
const out = new URL("../docs/", import.meta.url);
await mkdir(out, { recursive: true });
for (const [pmcid, name] of Object.entries(ARTICLES)) {
  const xml = values.xml ? await readFile(`${values.xml}/${pmcid}.xml`, "utf8") : await (await fetch(`${API}/${pmcid}/fullTextXML`)).text();
  if (!/creativecommons\.org\/licenses\/by\/4\.0/.test(xml)) throw new Error(`${pmcid} is not CC BY 4.0; refused.`);
  await writeFile(new URL(`${name}.md`, out), jatsToMarkdown(parseXml(xml)));
  console.log(`${pmcid} -> eval/socsci/docs/${name}.md`);
}
