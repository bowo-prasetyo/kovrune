// Can a web page search patents? For each candidate patent API, whether it answers without a key and
// whether a browser may read its answers (CORS), from a made-up page origin (eval/patents/README.md).
//
//   npm run bench:patents
//
// Kovrune runs in the browser, so a source must send Access-Control-Allow-Origin for the page's origin
// (or "*"), on errors and preflights too. Node's fetch uses HTTPS_PROXY only with NODE_USE_ENV_PROXY=1
// (set by the npm script).

const ORIGIN = "https://kovrune.example";

interface Probe {
  name: string;
  /** The request a search would make, without a key. */
  url: string;
  /** Headers a keyed request would send, checked with a preflight. */
  keyHeaders?: string[];
  method?: "GET" | "POST";
}

export const PROBES: Probe[] = [
  { name: "Europe PMC patents (SRC:PAT)", url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=SRC:PAT%20AND%20%22heat%20exchanger%22&format=json&pageSize=1" },
  { name: "EPO Open Patent Services (OPS)", url: "https://ops.epo.org/3.2/rest-services/published-data/search?q=ti%3Drectifier", keyHeaders: ["authorization"] },
  { name: "EPO OPS token", url: "https://ops.epo.org/3.2/auth/accesstoken", keyHeaders: ["authorization", "content-type"], method: "POST" },
  { name: "USPTO Open Data Portal", url: "https://api.uspto.gov/api/v1/patent/applications/search?q=rectifier", keyHeaders: ["x-api-key"] },
  { name: "The Lens", url: "https://api.lens.org/patent/search", keyHeaders: ["authorization", "content-type"], method: "POST" },
  { name: "PatentsView", url: "https://search.patentsview.org/api/v1/patent/?q=%7B%22patent_title%22:%22rectifier%22%7D", keyHeaders: ["x-api-key"] },
];

export interface ProbeResult {
  name: string;
  /** HTTP status of the request without a key, or the network error. */
  status: number | string;
  /** Access-Control-Allow-Origin on that answer. */
  allowOrigin?: string;
  /** For a keyed API: whether its preflight allows the key's headers from the page's origin. */
  preflight?: "allowed" | "refused" | string;
}

/** Whether a browser page may read an answer with this Access-Control-Allow-Origin. */
export const readableFromPage = (allowOrigin: string | undefined) => allowOrigin === "*" || allowOrigin === ORIGIN;

async function probe(p: Probe): Promise<ProbeResult> {
  const result: ProbeResult = { name: p.name, status: "" };
  try {
    const response = await fetch(p.url, { method: p.method ?? "GET", headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(20_000) });
    result.status = response.status;
    result.allowOrigin = response.headers.get("access-control-allow-origin") ?? undefined;
  } catch (error) {
    result.status = (error as { cause?: { code?: string } }).cause?.code ?? String(error);
  }
  if (p.keyHeaders) {
    try {
      const pre = await fetch(p.url, {
        method: "OPTIONS",
        headers: { Origin: ORIGIN, "Access-Control-Request-Method": p.method ?? "GET", "Access-Control-Request-Headers": p.keyHeaders.join(",") },
        signal: AbortSignal.timeout(20_000),
      });
      const allowed = (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase();
      const origin = pre.headers.get("access-control-allow-origin") ?? undefined;
      result.preflight =
        pre.ok && readableFromPage(origin) && p.keyHeaders.every((h) => allowed.includes(h) || allowed.includes("*")) ? "allowed" : `refused (HTTP ${pre.status})`;
    } catch (error) {
      result.preflight = (error as { cause?: { code?: string } }).cause?.code ?? String(error);
    }
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("| API | Without a key | Readable by a page | Keyed request from a page |");
  console.log("| --- | --- | --- | --- |");
  for (const p of PROBES) {
    const r = await probe(p);
    const status = typeof r.status === "number" && r.status > 0 ? r.status : "unreachable";
    console.log(`| ${r.name} | ${status} | ${readableFromPage(r.allowOrigin) ? "yes" : "no"} | ${r.preflight === undefined ? "no key needed" : /^(allowed|refused)/.test(r.preflight) ? r.preflight : "unreachable"} |`);
  }
}
