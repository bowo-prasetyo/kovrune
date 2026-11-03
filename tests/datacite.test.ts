import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerToBibtex, type SavedAnswer } from "../src/app/research/answers.ts";
import { DATACITE_ARXIV_CLIENT, type DataCiteRecord } from "../src/sources/arxiv.ts";
import { createDataCite, DATACITE_TEXT_TYPES, MAX_PDF_BYTES, type DataCiteWork } from "../src/sources/datacite.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

/** A DataCite record of a Zenodo work, in the shape DataCite's API returns (checked live, 2026-11-03). */
const RAG: DataCiteWork = {
  id: "10.5281/zenodo.15310522",
  attributes: {
    doi: "10.5281/zenodo.15310522",
    url: "https://zenodo.org/doi/10.5281/zenodo.15310522",
    titles: [{ title: "Application of AI in Solving Real-World Problems: A Retrieval-Augmented Approach" }],
    descriptions: [{ description: "This paper applies retrieval-augmented\ngeneration to real-world problems.", descriptionType: "Abstract" }],
    creators: [{ name: "Rao, Asha", givenName: "Asha", familyName: "Rao" }],
    publicationYear: 2025,
    publisher: "Zenodo",
  },
};
/** The same work's concept DOI: another record with the same title. */
const RAG_CONCEPT: DataCiteWork = { ...RAG, id: "10.5281/zenodo.15310521", attributes: { ...RAG.attributes, doi: "10.5281/zenodo.15310521" } };
const THESIS: DataCiteWork = {
  id: "10.17615/abc-123",
  attributes: {
    doi: "10.17615/ABC-123",
    url: "https://cdr.lib.unc.edu/concern/dissertations/abc",
    titles: [{ title: "Malaria vaccine trials in children" }],
    descriptions: [{ description: "A thesis on vaccine efficacy." }],
    creators: [{ name: "Mensah, Kofi" }],
    publicationYear: "2019",
    publisher: { name: "University of North Carolina at Chapel Hill" },
  },
};

const PDF = new Uint8Array([37, 80, 68, 70]);
const PAGES = { text: "Application of AI\n\nRetrieval grounds each answer in documents.", pageStarts: [0, 19] };

interface Routes {
  records?: DataCiteRecord[];
  zenodo?: Record<string, unknown> | number;
  pdfStatus?: number;
}

/** A fetch answering DataCite, Zenodo's API and Zenodo's files, recording the URLs asked for. */
function fakeFetch(routes: Routes): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const reply = (status: number, body: unknown, bytes?: Uint8Array) => ({
    ok: status < 400,
    status,
    json: async () => body,
    ...(bytes ? { arrayBuffer: async () => bytes.buffer.slice(0) } : {}),
    headers: { get: () => null },
  });
  const impl = (async (url: string) => {
    urls.push(url);
    if (url.startsWith("https://api.datacite.org/dois?")) return reply(200, { data: routes.records ?? [] });
    if (url.startsWith("https://api.datacite.org/dois/")) {
      const doi = decodeURIComponent(url.slice("https://api.datacite.org/dois/".length).split("?")[0]!);
      const record = (routes.records ?? []).find((r) => r.id.toLowerCase() === doi);
      return record ? reply(200, { data: record }) : reply(404, {});
    }
    if (url.startsWith("https://zenodo.org/api/records/") && url.endsWith("/content")) return reply(routes.pdfStatus ?? 200, {}, PDF);
    if (url.startsWith("https://zenodo.org/api/records/")) {
      return typeof routes.zenodo === "number" ? reply(routes.zenodo, {}) : reply(200, routes.zenodo ?? { files: [] });
    }
    throw new TypeError("Failed to fetch");
  }) as unknown as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const ZENODO_FILES = {
  files: [
    { key: "data.csv", size: 100, links: { self: "https://zenodo.org/api/records/15310522/files/data.csv/content" } },
    { key: "Paper.PDF", size: 276504, links: { self: "https://zenodo.org/api/records/15310522/files/Paper.PDF/content" } },
  ],
};

describe("DataCite source", () => {
  it("searches repositories' texts without arXiv's, and keeps one record of each work", async () => {
    const fetchImpl = fakeFetch({ records: [RAG, RAG_CONCEPT, THESIS] });
    const datacite = createDataCite({ fetchImpl, extractPdf: async () => PAGES });
    const hits = await datacite.search("retrieval augmented generation");
    assert.deepEqual(hits, [
      {
        id: "datacite:10.5281/zenodo.15310522",
        title: "Application of AI in Solving Real-World Problems: A Retrieval-Augmented Approach (2025, Zenodo)",
        snippet: "This paper applies retrieval-augmented generation to real-world problems.",
      },
      {
        id: "datacite:10.17615/abc-123",
        title: "Malaria vaccine trials in children (2019, University of North Carolina at Chapel Hill)",
        snippet: "A thesis on vaccine efficacy.",
      },
    ]);
    const url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.searchParams.get("query"), `(retrieval OR augmented OR generation) AND NOT client_id:${DATACITE_ARXIV_CLIENT}`);
    assert.equal(url.searchParams.get("resource-type-id"), DATACITE_TEXT_TYPES);
    assert.equal(url.searchParams.get("sort"), "relevance");
    assert.deepEqual(await datacite.search('"()"'), [], "nothing to search, no request");
  });

  it("reads a Zenodo work whole from its PDF, with its pages and its reference", async () => {
    const fetchImpl = fakeFetch({ records: [RAG], zenodo: ZENODO_FILES });
    let extracted: Uint8Array | undefined;
    const datacite = createDataCite({ fetchImpl, extractPdf: async (bytes) => ((extracted = bytes), PAGES) });
    await datacite.search("rag");
    const doc = await datacite.fetch("datacite:10.5281/zenodo.15310522");
    assert.deepEqual(fetchImpl.urls.slice(1), [
      "https://zenodo.org/api/records/15310522",
      "https://zenodo.org/api/records/15310522/files/Paper.PDF/content",
    ]);
    assert.deepEqual([...extracted!], [...PDF]);
    assert.equal(doc.text, PAGES.text);
    assert.deepEqual(doc.pageStarts, PAGES.pageStarts);
    assert.equal(doc.url, "https://zenodo.org/doi/10.5281/zenodo.15310522");
    assert.deepEqual(doc.work, { authors: ["Asha Rao"], year: 2025, doi: "10.5281/zenodo.15310522", venue: "Zenodo" });
  });

  it("reads a work as its abstract when there is no open PDF, and says why", async () => {
    const cases: Array<[Routes, RegExp]> = [
      [{ records: [RAG], zenodo: { files: [{ key: "data.csv", size: 1, links: { self: "x" } }] } }, /no PDF on Zenodo/],
      [{ records: [RAG], zenodo: 410 }, /Zenodo did not give this work's files/],
      [{ records: [RAG], zenodo: { files: [{ key: "big.pdf", size: MAX_PDF_BYTES + 1, links: { self: "x" } }] } }, /too large/],
      [{ records: [RAG], zenodo: ZENODO_FILES, pdfStatus: 403 }, /could not be downloaded/],
    ];
    for (const [routes, why] of cases) {
      const doc = await createDataCite({ fetchImpl: fakeFetch(routes), extractPdf: async () => PAGES }).fetch("datacite:10.5281/zenodo.15310522");
      assert.match(doc.text, /^Application of AI in Solving Real-World Problems/);
      assert.match(doc.text, /Asha Rao\. 2025\. Zenodo/);
      assert.match(doc.text, /Abstract: This paper applies retrieval-augmented generation/);
      assert.match(doc.text, why);
      assert.equal(doc.pageStarts, undefined);
    }
    const scanned = await createDataCite({ fetchImpl: fakeFetch({ records: [RAG], zenodo: ZENODO_FILES }), extractPdf: async () => ({ text: " " }) }).fetch(
      "datacite:10.5281/zenodo.15310522",
    );
    assert.match(scanned.text, /no text that can be read/);
  });

  it("reads another repository's work as its record, looked up when no search found it", async () => {
    const fetchImpl = fakeFetch({ records: [THESIS] });
    const doc = await createDataCite({ fetchImpl, extractPdf: async () => PAGES }).fetch("datacite:10.17615/ABC-123");
    assert.equal(fetchImpl.urls.length, 1, "no request to Zenodo");
    assert.match(fetchImpl.urls[0]!, /^https:\/\/api\.datacite\.org\/dois\/10\.17615%2Fabc-123\?/);
    assert.equal(doc.id, "datacite:10.17615/abc-123");
    assert.match(doc.text, /on the repository's own site/);
    assert.equal(doc.work?.venue, "University of North Carolina at Chapel Hill");
  });

  it("refuses what is not a DOI, and says plainly when DataCite has no such work", async () => {
    const fetchImpl = fakeFetch({ records: [] });
    const datacite = createDataCite({ fetchImpl, extractPdf: async () => PAGES });
    await assert.rejects(datacite.fetch("datacite:../etc"), /not a DataCite DOI/);
    await assert.rejects(datacite.fetch("datacite:10.5281/zenodo.1#2x y"), /not a DataCite DOI/);
    assert.equal(fetchImpl.urls.length, 0, "an unsafe ID is never requested");
    await assert.rejects(datacite.fetch("datacite:10.1234/missing"), (error: Error) => error instanceof SourceError);
  });

  it("is exported to BibTeX as a @misc published by its repository", () => {
    const answer = {
      evidence: [{ docId: "datacite:10.5281/zenodo.15310522#2", quote: "q", verified: true }],
      citations: {
        "datacite:10.5281/zenodo.15310522#2": {
          title: "Application of AI",
          url: "https://zenodo.org/doi/10.5281/zenodo.15310522",
          retrievedAt: "2026-11-03T00:00:00Z",
          source: "DataCite",
          work: { authors: ["Asha Rao"], year: 2025, doi: "10.5281/zenodo.15310522", venue: "Zenodo" },
        },
      },
    } as unknown as SavedAnswer;
    const bib = answerToBibtex(answer)!;
    assert.match(bib, /^@misc\{datacite_10_5281_zenodo_15310522,\n/);
    assert.match(bib, /  howpublished = \{Zenodo\},/);
    assert.doesNotMatch(bib, /journal/);
  });
});
