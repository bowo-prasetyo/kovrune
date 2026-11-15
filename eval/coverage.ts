// How much of the literature engineering reviews cite can Kovrune read in full, and how much only as an
// abstract? A sample of reviews from each engineering subfield in OpenAlex, and every work they cite that
// OpenAlex has matched, sorted by how a researcher could get its text (eval/coverage/README.md):
//
//   kovrune   Kovrune reads the full text today: an arXiv version (the arXiv source, or OpenAlex's reader
//             through it, src/sources/openalex.ts fullTextIds), a PMCID (Europe PMC, which serves the text
//             of its open-access subset, so an upper bound), or a Zenodo DOI (the DataCite source).
//   free      Free to read elsewhere (OpenAlex open_access.is_oa), but not through any source Kovrune
//             has: downloaded by hand and added as a local document.
//   abstract  Not free; OpenAlex has its abstract, which is what Kovrune's OpenAlex source shows.
//   none      Not free, and no abstract: only the title and details.
//
//   npm run bench:coverage -- --per-subfield 5 --seed 1 --out eval/results/coverage-engineering.json
//
// Needs api.openalex.org; with no key, OpenAlex shares a small daily budget across the network's IP
// address. Node's fetch uses HTTPS_PROXY only with NODE_USE_ENV_PROXY=1 (set by the npm script).

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { arxivIdIn } from "../src/sources/arxiv.ts";
import { pmcidOf } from "../src/sources/openalex.ts";

const API = "https://api.openalex.org";

/**
 * The engineering subfields sampled: every subfield of OpenAlex's Engineering field except Architecture,
 * Media Technology and General Engineering, and Energy Engineering and Power Technology from the Energy
 * field, where much of power electronics is classified.
 */
export const SUBFIELDS: Record<string, string> = {
  "2208": "Electrical and Electronic Engineering",
  "2210": "Mechanical Engineering",
  "2205": "Civil and Structural Engineering",
  "2207": "Control and Systems Engineering",
  "2202": "Aerospace Engineering",
  "2204": "Biomedical Engineering",
  "2206": "Computational Mechanics",
  "2211": "Mechanics of Materials",
  "2215": "Building and Construction",
  "2209": "Industrial and Manufacturing Engineering",
  "2213": "Safety, Risk, Reliability and Quality",
  "2203": "Automotive Engineering",
  "2212": "Ocean Engineering",
  "2102": "Energy Engineering and Power Technology",
};

export type Access = "kovrune" | "free" | "abstract" | "none";
export const ACCESS: Access[] = ["kovrune", "free", "abstract", "none"];

export interface CitedWork {
  id: string;
  doi?: string | null;
  type?: string | null;
  publication_year?: number | null;
  ids?: { pmcid?: string | null } | null;
  open_access?: { is_oa?: boolean | null; oa_status?: string | null } | null;
  locations?: Array<{ landing_page_url?: string | null; pdf_url?: string | null; license?: string | null; source?: { display_name?: string | null } | null } | null> | null;
  primary_location?: { source?: { display_name?: string | null; host_organization_name?: string | null } | null } | null;
}

/** Which route to a work's text Kovrune has, if any: the arXiv, Europe PMC and Zenodo readers. */
export function kovruneRoute(work: CitedWork): "arxiv" | "europepmc" | "zenodo" | undefined {
  const urls = [work.doi ?? "", ...(work.locations ?? []).flatMap((l) => [l?.landing_page_url ?? "", l?.pdf_url ?? ""])];
  if (urls.map(arxivIdIn).find(Boolean)) return "arxiv";
  if (pmcidOf(work.ids?.pmcid)) return "europepmc";
  if (/10\.5281\/zenodo\.\d+/i.test(work.doi ?? "")) return "zenodo";
  return undefined;
}

export function accessOf(work: CitedWork, hasAbstract: boolean): Access {
  if (kovruneRoute(work)) return "kovrune";
  if (work.open_access?.is_oa) return "free";
  return hasAbstract ? "abstract" : "none";
}

/**
 * Whether a work in PubMed Central is likely in Europe PMC's open-access subset, whose full text Europe PMC
 * serves (src/sources/europepmc.ts reads only isOpenAccess "Y"): its PubMed Central copy carries a Creative
 * Commons licence in OpenAlex. An estimate: Europe PMC's own flag is not asked for.
 */
export function likelyOpenSubset(work: CitedWork): boolean {
  return (work.locations ?? []).some((l) => /pubmed central|europe pmc/i.test(l?.source?.display_name ?? "") && /^cc/i.test(l?.license ?? ""));
}

const short = (id: string) => id.replace("https://openalex.org/", "");

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`);
    if (response.ok) return (await response.json()) as T;
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`OpenAlex ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

interface Review {
  id: string;
  display_name: string;
  publication_year: number;
  doi?: string | null;
  referenced_works: string[];
}

const counts = () => Object.fromEntries(ACCESS.map((a) => [a, 0])) as Record<Access, number>;

async function main() {
  const { values } = parseArgs({
    options: {
      "per-subfield": { type: "string", default: "5" },
      seed: { type: "string", default: "1" },
      years: { type: "string", default: "2020-2023" },
      "min-references": { type: "string", default: "30" },
      out: { type: "string" },
    },
  });
  const perSubfield = Number(values["per-subfield"]);
  const minRefs = Number(values["min-references"]);

  const reviews: Array<Review & { subfield: string }> = [];
  for (const [id, name] of Object.entries(SUBFIELDS)) {
    const filter = `type:review,primary_topic.subfield.id:${id},publication_year:${values.years},referenced_works_count:>${minRefs - 1}`;
    const page = await get<{ results: Review[] }>(
      `/works?filter=${filter}&sample=${perSubfield}&seed=${values.seed}&per_page=${perSubfield}&select=id,display_name,publication_year,doi,referenced_works`,
    );
    for (const r of page.results) reviews.push({ ...r, subfield: name });
    console.log(`${name}: ${page.results.length} reviews, ${page.results.reduce((s, r) => s + r.referenced_works.length, 0)} cited works`);
  }

  const cited = [...new Set(reviews.flatMap((r) => r.referenced_works.map(short)))];
  console.log(`\n${cited.length} distinct cited works; fetching their details…`);
  const works = new Map<string, CitedWork>();
  const withAbstract = new Set<string>();
  const select = "id,doi,type,publication_year,ids,open_access,locations,primary_location";
  for (let i = 0; i < cited.length; i += 50) {
    const batch = cited.slice(i, i + 50).join("|");
    const [details, abstracts] = await Promise.all([
      get<{ results: CitedWork[] }>(`/works?filter=openalex_id:${batch}&per_page=50&select=${select}`),
      get<{ results: Array<{ id: string }> }>(`/works?filter=openalex_id:${batch},has_abstract:true&per_page=50&select=id`),
    ]);
    for (const w of details.results) works.set(short(w.id), w);
    for (const w of abstracts.results) withAbstract.add(short(w.id));
    if ((i / 50) % 20 === 0) console.log(`  ${Math.min(i + 50, cited.length)} of ${cited.length}`);
  }

  const classify = (id: string): Access | undefined => {
    const w = works.get(id);
    return w ? accessOf(w, withAbstract.has(id)) : undefined;
  };

  // Each review counts its own citations, so a work cited by two reviews counts for both: the question is
  // what share of a review's reading list a researcher could get, review by review.
  const bySubfield = Object.fromEntries(Object.values(SUBFIELDS).map((s) => [s, { reviews: 0, cited: 0, access: counts() }]));
  const byType: Record<string, Record<Access, number>> = {};
  const byDecade: Record<string, Record<Access, number>> = {};
  const byRoute = { arxiv: 0, europepmc: 0, zenodo: 0, europepmcLikelyOpenSubset: 0 };
  const closedSources: Record<string, number> = {};
  const titleOnlySources: Record<string, number> = {};
  const freeByStatus: Record<string, number> = {};
  const total = counts();
  const perReview: Array<{ id: string; subfield: string; title: string; year: number; cited: number; access: Record<Access, number> }> = [];
  for (const r of reviews) {
    const access = counts();
    for (const ref of r.referenced_works.map(short)) {
      const a = classify(ref);
      if (!a) continue;
      const w = works.get(ref)!;
      access[a]++;
      total[a]++;
      const type = w.type ?? "unknown";
      (byType[type] ??= counts())[a]++;
      const decade = w.publication_year ? `${Math.floor(w.publication_year / 10) * 10}s` : "unknown";
      (byDecade[decade] ??= counts())[a]++;
      if (a === "kovrune") {
        const route = kovruneRoute(w)!;
        byRoute[route]++;
        if (route === "europepmc" && likelyOpenSubset(w)) byRoute.europepmcLikelyOpenSubset++;
      }
      if (a === "free") freeByStatus[w.open_access?.oa_status ?? "unknown"] = (freeByStatus[w.open_access?.oa_status ?? "unknown"] ?? 0) + 1;
      if (a === "abstract" || a === "none") {
        const host = w.primary_location?.source?.host_organization_name ?? w.primary_location?.source?.display_name ?? "unknown";
        closedSources[host] = (closedSources[host] ?? 0) + 1;
        if (a === "none") titleOnlySources[host] = (titleOnlySources[host] ?? 0) + 1;
      }
    }
    const n = ACCESS.reduce((s, a) => s + access[a], 0);
    const s = bySubfield[r.subfield]!;
    s.reviews++;
    s.cited += n;
    for (const a of ACCESS) s.access[a] += access[a];
    perReview.push({ id: short(r.id), subfield: r.subfield, title: r.display_name, year: r.publication_year, cited: n, access });
  }

  const n = ACCESS.reduce((s, a) => s + total[a], 0);
  const pct = (x: number, of: number) => (of ? `${Math.round((100 * x) / of)}%` : "–");
  const row = (label: string, c: Record<Access, number>) => {
    const m = ACCESS.reduce((s, a) => s + c[a], 0);
    return `| ${label} | ${m} | ${ACCESS.map((a) => pct(c[a], m)).join(" | ")} |`;
  };
  const header = ["| | Citations | Kovrune reads in full | Free elsewhere | Abstract only | Title only |", "| --- | --- | --- | --- | --- | --- |"];
  const lines = [
    `${reviews.length} reviews (${values.years}, at least ${minRefs} matched references, ${perSubfield} sampled per subfield, seed ${values.seed}), ${n} citations of ${works.size} distinct works.`,
    "",
    ...header,
    row("All", total),
    ...Object.entries(bySubfield).map(([s, v]) => row(`${s} (${v.reviews})`, v.access)),
    "",
    ...header,
    ...Object.entries(byType).sort((a, b) => sumOf(b[1]) - sumOf(a[1])).map(([t, c]) => row(t, c)),
    "",
    ...header,
    ...Object.entries(byDecade).sort().map(([d, c]) => row(d, c)),
    "",
    `Kovrune's routes: arXiv ${byRoute.arxiv}, Europe PMC (PMCID) ${byRoute.europepmc} (${byRoute.europepmcLikelyOpenSubset} with a Creative Commons licence on the PubMed Central copy), Zenodo ${byRoute.zenodo}.`,
    `Free elsewhere, by OpenAlex's oa_status: ${Object.entries(freeByStatus).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${pct(c, total.free)}`).join(", ")}.`,
    `Publishers of the title-only citations: ${Object.entries(titleOnlySources).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h, c]) => `${h} ${pct(c, total.none)}`).join(", ")}.`,
    `Publishers of the citations that are not free: ${Object.entries(closedSources).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, c]) => `${h} ${pct(c, total.abstract + total.none)}`).join(", ")}.`,
  ];
  console.log(`\n${lines.join("\n")}`);

  if (values.out) {
    const report = {
      createdAt: new Date().toISOString(),
      config: { subfields: SUBFIELDS, perSubfield, seed: Number(values.seed), years: values.years, minReferences: minRefs },
      citations: n,
      distinctWorks: works.size,
      unmatched: cited.length - works.size,
      total,
      bySubfield,
      byType,
      byDecade,
      byRoute,
      closedSources: Object.fromEntries(Object.entries(closedSources).sort((a, b) => b[1] - a[1])),
      titleOnlySources: Object.fromEntries(Object.entries(titleOnlySources).sort((a, b) => b[1] - a[1])),
      freeByStatus,
      reviews: perReview,
    };
    await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport written to ${values.out}`);
  }
}

const sumOf = (c: Record<Access, number>) => ACCESS.reduce((s, a) => s + c[a], 0);

if (import.meta.url === `file://${process.argv[1]}`) await main();
