// Builds the materials suite's papers (eval/materials/docs/*.md) from Europe PMC's full-text XML, with the app's own
// converter (src/sources/jats.ts), so each paper reads as Kovrune reads it from Europe PMC: merged table cells
// spread over their columns and rows, tables from <floats-group> placed after the paragraph that cites them, and
// since harness 0.107.0 powers of ten kept as superscripts ("1.2855 × 10¹²") and line breaks in a table cell read as
// spaces. Each article must be CC BY 4.0, or it is refused. The suite's other documents (a CIF, a CSV and a PDF) are
// made up and written by make_docs.py. Run from the repository root:
//
//   node --experimental-strip-types eval/materials/source/build.ts            # downloads the XML of each PMCID
//   node --experimental-strip-types eval/materials/source/build.ts --xml DIR  # uses DIR/<PMCID>.xml instead

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { jatsToMarkdown, parseXml } from "../../../src/sources/jats.ts";

/** PMCID -> document file name (without .md). Order is the order of eval/materials/tasks.ts. */
export const ARTICLES: Record<string, string> = {
  PMC11433832: "al-si-cu-mg-nickel-alloys",
  PMC11642185: "tc25-titanium-creep",
  PMC11547944: "medium-manganese-steel-heating-rate",
  PMC10672621: "lifepo4-combustion-synthesis",
  PMC11397452: "perovskite-pai-passivation",
  PMC12530038: "llzo-hot-pressing-sps",
  PMC11678037: "boron-carbide-sic-tib2",
  PMC11313141: "pla-starch-hydrothermal-ageing",
};

const API = "https://www.ebi.ac.uk/europepmc/webservices/rest";

const { values } = parseArgs({ options: { xml: { type: "string" } } });
const out = new URL("../docs/", import.meta.url);
await mkdir(out, { recursive: true });
for (const [pmcid, name] of Object.entries(ARTICLES)) {
  const xml = values.xml ? await readFile(`${values.xml}/${pmcid}.xml`, "utf8") : await (await fetch(`${API}/${pmcid}/fullTextXML`)).text();
  if (!/creativecommons\.org\/licenses\/by\/4\.0/.test(xml)) throw new Error(`${pmcid} is not CC BY 4.0; refused.`);
  await writeFile(new URL(`${name}.md`, out), jatsToMarkdown(parseXml(xml)));
  console.log(`${pmcid} -> eval/materials/docs/${name}.md`);
}
