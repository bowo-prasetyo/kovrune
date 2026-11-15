// Following a paper's citations through OpenAlex (harness 0.82.0): "references of W123: words" and
// "citing W123: words" as OpenAlex searches, and the note after a work's first read (eval/cs/README.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CITATION_NOTE_LINE, citationCounts, citationNote, citationQuery, createOpenAlex, workText } from "../src/sources/openalex.ts";
import { SourceSession } from "../src/sources/session.ts";
import type { FetchedDocument, FetchLike, OpenSource } from "../src/sources/types.ts";

function fakeFetch(routes: Array<[RegExp, unknown, number?]>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new TypeError("Failed to fetch");
    const status = route[2] ?? 200;
    return { ok: status < 400, status, json: async () => route[1], headers: { get: () => null } };
  }) as unknown as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const work = (n: number, cited: number) => ({ id: `https://openalex.org/W${n}`, display_name: `Work ${n}`, publication_year: 2024, cited_by_count: cited, abstract_inverted_index: { Results: [0] } });

describe("a search that follows citations", () => {
  it("reads the work and the words from the query, in the forms the note gives and OpenAlex's own", () => {
    assert.deepEqual(citationQuery("references of W4387800173: critic model"), { direction: "references", work: "W4387800173", terms: "critic model" });
    assert.deepEqual(citationQuery("citing openalex:W4387800173"), { direction: "citing", work: "W4387800173", terms: "" });
    assert.deepEqual(citationQuery("citing doi:10.18653/v1/2023.acl-long.1: medical"), { direction: "citing", work: "doi:10.18653/v1/2023.acl-long.1", terms: "medical" });
    assert.deepEqual(citationQuery("references of arxiv:2005.11401v2."), { direction: "references", work: "arxiv:2005.11401", terms: "" });
    assert.deepEqual(citationQuery('cites:W12 "long context"'), { direction: "citing", work: "W12", terms: "long context" });
    assert.deepEqual(citationQuery("cited_by:W12"), { direction: "references", work: "W12", terms: "" });
    assert.equal(citationQuery("retrieval augmented generation"), undefined);
    assert.equal(citationQuery("citing RAG"), undefined, "a work must be named by an ID");
  });

  it("asks OpenAlex for the works a work cites, or that cite it, best matching the words, within the user's limits", async () => {
    const fetchImpl = fakeFetch([[/\/works\?/, { results: [work(1, 50), work(2, 3)] }]]);
    const openalex = createOpenAlex(fetchImpl, undefined, { fromYear: 2023 });
    const hits = await openalex.search("references of W9: critic model");
    let url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.searchParams.get("filter"), "cited_by:W9,from_publication_date:2023-01-01");
    assert.equal(url.searchParams.get("search"), "critic model");
    assert.deepEqual(hits.map((h) => h.title), ["Work 1 (2024, cited by 50)", "Work 2 (2024, cited by 3)"]);
    await openalex.search("citing W9");
    url = new URL(fetchImpl.urls[1]!);
    assert.equal(url.searchParams.get("filter"), "cites:W9,from_publication_date:2023-01-01");
    assert.equal(url.searchParams.get("search"), null);
    assert.equal(url.searchParams.get("sort"), "cited_by_count:desc", "without words, the most cited first");
  });

  it("looks a paper up by its DOI or arXiv ID, and says so when OpenAlex has no such work", async () => {
    const fetchImpl = fakeFetch([
      [/\/works\/doi:10\.48550%2FarXiv\.2310\.11511\?/, { id: "https://openalex.org/W4387800173" }],
      [/\/works\/doi:10\.9999/, { error: "not found" }, 404],
      [/\/works\?/, { results: [] }],
    ]);
    const openalex = createOpenAlex(fetchImpl);
    await openalex.search("citing arxiv:2310.11511: medical");
    assert.equal(new URL(fetchImpl.urls[1]!).searchParams.get("filter"), "cites:W4387800173");
    await assert.rejects(openalex.search("citing doi:10.9999/none"), /OpenAlex has no work with DOI 10\.9999\/none\./);
  });

  it("gives a plain search as before", async () => {
    const fetchImpl = fakeFetch([[/\/works\?/, { results: [work(1, 50)] }]]);
    const hits = await createOpenAlex(fetchImpl).search("retrieval augmented generation");
    assert.equal(new URL(fetchImpl.urls[0]!).searchParams.get("filter"), null);
    assert.equal(hits[0]!.title, "Work 1 (2024)");
  });

  it("shows a read work's citation counts", () => {
    assert.equal(citationCounts({ id: "W1", cited_by_count: 1088, referenced_works_count: 32 }), "Cited by 1,088 works in OpenAlex; its references there: 32.");
    assert.equal(citationCounts({ id: "W1" }), "");
    assert.match(workText({ id: "W1", display_name: "Self-RAG", cited_by_count: 0 }), /^Self-RAG\nCited by 0 works in OpenAlex\./);
  });
});

describe("the note after a work's first read", () => {
  const source = (name: OpenSource["name"], doc: Partial<FetchedDocument>): OpenSource => ({
    name,
    label: name,
    search: async () => [],
    fetch: async (id) => ({ id, title: "T", text: "Text of the work.", url: "https://example.org", retrievedAt: "2026-11-15T00:00:00Z", ...doc }),
  });
  const openalex = source("openalex", {});

  it("names an OpenAlex work by its ID, an arXiv paper by its arXiv ID and another paper by its DOI, once each", async () => {
    const session = new SourceSession([openalex, source("arxiv", { work: { authors: [], doi: "10.48550/arXiv.2310.11511" } }), source("europepmc", { work: { authors: [], doi: "10.1016/S0140-6736(23)01234-5" } }), source("wikipedia", {})], "q");
    assert.ok((await session.read("openalex:W42")).endsWith(citationNote("W42")));
    assert.ok((await session.read("arxiv:2310.11511")).endsWith(citationNote("arxiv:2310.11511")));
    assert.ok((await session.read("europepmc:MED/1")).endsWith(citationNote("doi:10.1016/S0140-6736(23)01234-5")));
    assert.doesNotMatch(await session.read("wikipedia:Ada_Lovelace"), /To follow its citations/, "an article has no citations to follow");
    assert.doesNotMatch(await new SourceSession([openalex], "q").read("openalex:W42").then(() => session.read("openalex:W42")), /To follow/, "shown once");
  });

  it("is not given when OpenAlex is not searched, and an old read loses it when shortened", async () => {
    const session = new SourceSession([source("arxiv", { work: { authors: [], doi: "10.48550/arXiv.2310.11511" } })], "q");
    assert.doesNotMatch(await session.read("arxiv:2310.11511"), /To follow its citations/);
    assert.equal(`[openalex:W42] T\nText of the work.${citationNote("W42")}`.replace(CITATION_NOTE_LINE, ""), "[openalex:W42] T\nText of the work.");
  });
});
