// Computer science venues through OpenAlex (harness 0.79.0): a search limited to the ACL Anthology or
// NeurIPS, a conference paper's arXiv version found by its title, and the open PDF named when neither
// can be read (eval/cs/README.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSourcePrefs } from "../src/app/research/sources.ts";
import { findArxivByTitle, titleKey, type DataCiteRecord } from "../src/sources/arxiv.ts";
import { createOpenAlex, openAlexFilter, openPdf, OPENALEX_VENUES } from "../src/sources/openalex.ts";
import type { FetchLike, OpenSource } from "../src/sources/types.ts";

function fakeFetch(routes: Array<[RegExp, unknown]>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, json: async () => route[1], headers: { get: () => null } };
  }) as unknown as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const record = (id: string, title: string): DataCiteRecord => ({ id: `10.48550/arxiv.${id}`, attributes: { doi: `10.48550/arxiv.${id}`, url: `https://arxiv.org/abs/${id}`, titles: [{ title }] } });

describe("a search limited to a computer science venue", () => {
  it("asks OpenAlex for the ACL Anthology by its DOI prefix and NeurIPS by its source, on any location", async () => {
    assert.equal(openAlexFilter({ venue: "acl" }), "doi_starts_with:10.18653");
    assert.equal(openAlexFilter({ fromYear: 2023, venue: "neurips" }), "from_publication_date:2023-01-01,locations.source.id:S4363606243");
    assert.equal(openAlexFilter({ venue: "iclr" }), undefined, "a venue that is not offered is left out");
    const fetchImpl = fakeFetch([[/\/works\?/, { results: [] }]]);
    await createOpenAlex(fetchImpl, undefined, { venue: "acl", field: "fields/17" }).search("retrieval augmented generation");
    assert.equal(new URL(fetchImpl.urls[0]!).searchParams.get("filter"), "primary_topic.field.id:fields/17,doi_starts_with:10.18653");
  });

  it("keeps the venue the user chose, and only one that is offered", () => {
    assert.deepEqual(OPENALEX_VENUES.map(([id]) => id), ["acl", "neurips"]);
    assert.equal(parseSourcePrefs(JSON.stringify({ openalex: true, openalexVenue: "acl" })).openalexVenue, "acl");
    assert.equal(parseSourcePrefs(JSON.stringify({ openalex: true, openalexVenue: "openreview" })).openalexVenue, undefined);
  });
});

describe("a conference paper's arXiv version, by its title", () => {
  const title = "Lost in the Middle: How Language Models Use Long Contexts";

  it("is the one arXiv paper on DataCite with the same title, compared as letters and digits", async () => {
    const fetchImpl = fakeFetch([[/api\.datacite\.org\/dois\?/, { data: [record("2307.03172", "Lost in the middle: how language models use long contexts"), record("2401.00001", "Lost in the Middle, Revisited")] }]]);
    assert.equal(await findArxivByTitle(fetchImpl, title), "2307.03172");
    const url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.searchParams.get("query"), 'titles.title:"Lost in the Middle How Language Models Use Long Contexts"');
    assert.equal(url.searchParams.get("client-id"), "arxiv.content");
    assert.equal(titleKey("Self-RAG: Learning to Retrieve"), "selfraglearningtoretrieve");
  });

  it("is none when no title is the same, when two arXiv papers share it, or when the title is short", async () => {
    assert.equal(await findArxivByTitle(fakeFetch([[/datacite/, { data: [record("2401.00001", "Lost in the Middle, Revisited")] }]]), title), undefined);
    const two = fakeFetch([[/datacite/, { data: [record("2307.03172", title), record("2311.09999", title)] }]]);
    assert.equal(await findArxivByTitle(two, title), undefined, "two papers with one title: neither is taken");
    const short = fakeFetch([[/datacite/, { data: [record("1706.03762", "Attention Is All")] }]]);
    assert.equal(await findArxivByTitle(short, "Attention Is All"), undefined);
    assert.equal(short.urls.length, 0, "a title of three words is not looked up");
  });

  const aclWork = {
    id: "https://openalex.org/W4386566727",
    display_name: "Concept-based Persona Expansion for Improving Diversity of Persona-Grounded Dialogue",
    publication_year: 2023,
    doi: "https://doi.org/10.18653/v1/2023.eacl-main.252",
    authorships: [{ author: { display_name: "Donghyun Kim" } }],
    abstract_inverted_index: { Persona: [0], dialogue: [1] },
    primary_location: { source: { display_name: "Conference of the European Chapter of the Association for Computational Linguistics" } },
    locations: [{ landing_page_url: "https://doi.org/10.18653/v1/2023.eacl-main.252", pdf_url: "https://aclanthology.org/2023.eacl-main.252.pdf" }],
    ids: { pmid: null, pmcid: null },
  };
  const arxivReader = (): OpenSource & { asked: string[] } => {
    const asked: string[] = [];
    return {
      name: "arxiv",
      label: "arXiv",
      asked,
      search: async () => [],
      fetch: async (id: string) => {
        asked.push(id);
        return { id, title: "t", text: "Full paper text.", url: `https://arxiv.org/abs/${id.slice(6)}`, retrievedAt: "2026-11-15T00:00:00Z", work: { authors: [], doi: `10.48550/arXiv.${id.slice(6)}`, venue: "arXiv" } };
      },
    };
  };

  it("is read in full when OpenAlex's record has no arXiv link, cited as the arXiv version with OpenAlex's authors", async () => {
    const arxiv = arxivReader();
    const titles: string[] = [];
    const findArxiv = async (t: string) => (titles.push(t), "2301.00001");
    const doc = await createOpenAlex(fakeFetch([[/\/works\/W4386566727\?/, aclWork]]), undefined, {}, { arxiv, findArxiv }).fetch("openalex:W4386566727");
    assert.deepEqual(titles, [aclWork.display_name]);
    assert.deepEqual(arxiv.asked, ["arxiv:2301.00001"]);
    assert.match(doc.text, /Full text, read from arXiv:\n\nFull paper text\.$/);
    assert.deepEqual(doc.work, { authors: ["Donghyun Kim"], year: 2023, doi: "10.48550/arXiv.2301.00001", venue: "arXiv" });
  });

  it("is not looked up when the record links to arXiv, or the arXiv source is not ticked", async () => {
    const linked = { ...aclWork, locations: [...aclWork.locations, { landing_page_url: "https://arxiv.org/abs/2301.00002" }] };
    const arxiv = arxivReader();
    let looked = 0;
    await createOpenAlex(fakeFetch([[/\/works\//, linked]]), undefined, {}, { arxiv, findArxiv: async () => (looked++, "2301.00001") }).fetch("openalex:W4386566727");
    assert.deepEqual([looked, arxiv.asked], [0, ["arxiv:2301.00002"]]);
    await createOpenAlex(fakeFetch([[/\/works\//, aclWork]]), undefined, {}, { findArxiv: async () => (looked++, "2301.00001") }).fetch("openalex:W4386566727");
    assert.equal(looked, 0, "without the arXiv source, arXiv is not asked");
  });
});

describe("a paper no ticked source can read", () => {
  it("is read as its abstract, with its open PDF named for the user to add", async () => {
    const work = {
      id: "https://openalex.org/W4386566727",
      display_name: "Concept-based Persona Expansion for Improving Diversity of Persona-Grounded Dialogue",
      abstract_inverted_index: { Persona: [0], dialogue: [1] },
      locations: [{ landing_page_url: "https://doi.org/10.18653/v1/2023.eacl-main.252", pdf_url: "https://aclanthology.org/2023.eacl-main.252.pdf" }],
    };
    const doc = await createOpenAlex(fakeFetch([[/\/works\//, work]]), undefined, {}, { findArxiv: async () => undefined }).fetch("openalex:W4386566727");
    assert.match(doc.text, /Abstract: Persona dialogue\nFull text \(not read here; a web page cannot download it\): https:\/\/aclanthology\.org\/2023\.eacl-main\.252\.pdf\. The user can download it and add it to their documents\.$/);
    assert.equal(openPdf({ id: "W1", locations: [{ pdf_url: "https://arxiv.org/pdf/2301.00001" }, { pdf_url: "https://europepmc.org/articles/PMC1/pdf" }] }), undefined, "arXiv and PubMed Central copies have their own sources");
    assert.equal(openPdf({ id: "W1" }), undefined);
  });
});
