import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerToBibtex, type SavedAnswer } from "../src/app/research/answers.ts";
import { arxivId, createArxiv, DATACITE_ARXIV_CLIENT, dataCiteQuery, type DataCiteRecord } from "../src/sources/arxiv.ts";
import { SourceSession } from "../src/sources/session.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

/** A fetch answering DataCite with `records` and arxiv.org/pdf with `pdf`, recording the URLs asked for. */
function fakeFetch(records: DataCiteRecord[], pdf = new Uint8Array([37, 80, 68, 70]), status = 200): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    if (url.startsWith("https://api.datacite.org/")) {
      return { ok: status < 400, status, json: async () => ({ data: records }), headers: { get: () => null } };
    }
    if (url.startsWith("https://arxiv.org/pdf/")) {
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => pdf.buffer.slice(0), headers: { get: () => null } };
    }
    throw new TypeError("Failed to fetch");
  }) as unknown as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

/** A DataCite record in the shape its API returns for arXiv papers (checked live, 2026-11-03). */
const RAG: DataCiteRecord = {
  id: "10.48550/arxiv.2005.11401",
  attributes: {
    doi: "10.48550/arxiv.2005.11401",
    url: "https://arxiv.org/abs/2005.11401",
    titles: [{ title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" }],
    descriptions: [{ description: "Large pre-trained language models have been shown to store factual knowledge\nin their parameters.", descriptionType: "Abstract" }],
    creators: [
      { name: "Lewis, Patrick", givenName: "Patrick", familyName: "Lewis" },
      { name: "Perez, Ethan", givenName: "Ethan", familyName: "Perez" },
    ],
    publicationYear: 2020,
  },
};

const PAGES = { text: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks\nPatrick Lewis\n\nRAG combines a retriever with a generator.", pageStarts: [0, 79] };

describe("arXiv source", () => {
  it("finds a record's arXiv identifier in its link or its DOI, without the version", () => {
    assert.equal(arxivId(RAG), "2005.11401");
    assert.equal(arxivId({ id: "10.48550/arxiv.2401.00001", attributes: {} }), "2401.00001");
    assert.equal(arxivId({ id: "x", attributes: { url: "https://arxiv.org/abs/hep-th/9901001v2" } }), "hep-th/9901001");
    assert.equal(arxivId({ id: "10.5281/zenodo.1", attributes: { url: "https://zenodo.org/records/1" } }), undefined);
  });

  it("joins the search words with OR, without the query syntax's own characters", () => {
    // DataCite requires every word of a plain query, so the model's longer searches found nothing.
    assert.equal(dataCiteQuery("RAG marginalization top-K"), "RAG OR marginalization OR top OR K");
    assert.equal(dataCiteQuery('title:"x" AND (y OR z)*'), "title OR x OR y OR z");
    assert.equal(dataCiteQuery("  "), "");
  });

  it("searches arXiv's records on DataCite by relevance, and gives each its arXiv ID", async () => {
    const fetchImpl = fakeFetch([RAG, { id: "10.48550/x", attributes: { titles: [{ title: "No arXiv link" }] } }]);
    const arxiv = createArxiv({ fetchImpl, extractPdf: async () => PAGES });
    const hits = await arxiv.search("retrieval augmented generation");
    assert.deepEqual(hits, [
      {
        id: "arxiv:2005.11401",
        title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)",
        snippet: "Large pre-trained language models have been shown to store factual knowledge in their parameters.",
      },
    ]);
    const url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.origin + url.pathname, "https://api.datacite.org/dois");
    assert.equal(url.searchParams.get("query"), "retrieval OR augmented OR generation");
    assert.equal(url.searchParams.get("client-id"), DATACITE_ARXIV_CLIENT);
    assert.equal(url.searchParams.get("sort"), "relevance", "DataCite's default order is not by relevance");
    assert.match(url.searchParams.get("fields[dois]")!, /descriptions/);
    assert.deepEqual(await arxiv.search("()"), [], "nothing to search, no request");
    assert.equal(fetchImpl.urls.length, 1);
  });

  it("reads a paper whole from its PDF on arXiv, with its pages and its reference", async () => {
    const fetchImpl = fakeFetch([RAG]);
    let extracted: Uint8Array | undefined;
    const arxiv = createArxiv({ fetchImpl, extractPdf: async (bytes) => ((extracted = bytes), PAGES) });
    await arxiv.search("rag");
    const doc = await arxiv.fetch("arxiv:2005.11401");
    assert.equal(fetchImpl.urls.at(-1), "https://arxiv.org/pdf/2005.11401");
    assert.deepEqual([...extracted!], [37, 80, 68, 70], "the PDF's bytes go to pdf.js");
    assert.equal(doc.title, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks");
    assert.equal(doc.text, PAGES.text);
    assert.deepEqual(doc.pageStarts, PAGES.pageStarts);
    assert.equal(doc.url, "https://arxiv.org/abs/2005.11401");
    assert.deepEqual(doc.work, { authors: ["Patrick Lewis", "Ethan Perez"], year: 2020, doi: "10.48550/arXiv.2005.11401", venue: "arXiv" });
    // A paper not found by a search keeps the PDF's first line as its title.
    const unsearched = await createArxiv({ fetchImpl, extractPdf: async () => PAGES }).fetch("arxiv:2005.11401v2");
    assert.equal(unsearched.title, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks");
    assert.equal(unsearched.work?.doi, "10.48550/arXiv.2005.11401");
  });

  it("says plainly when a paper can't be read or DataCite fails", async () => {
    const fetchImpl = fakeFetch([]);
    await assert.rejects(createArxiv({ fetchImpl, extractPdf: async () => PAGES }).fetch("arxiv:../etc"), /not an arXiv paper ID/);
    await assert.rejects(createArxiv({ fetchImpl, extractPdf: async () => ({ text: " " }) }).fetch("arxiv:2005.11401"), /no text that can be read/);
    await assert.rejects(
      createArxiv({ fetchImpl, extractPdf: async () => Promise.reject(new Error("bad XRef")) }).fetch("arxiv:2005.11401"),
      /could not be read/,
    );
    assert.equal(fetchImpl.urls.filter((u) => u.includes("..")).length, 0, "an unsafe ID is never requested");
    const down = createArxiv({ fetchImpl: fakeFetch([], undefined, 503), extractPdf: async () => PAGES });
    await assert.rejects(down.search("rag"), (error: Error) => error instanceof SourceError && /DataCite \(searching arXiv\) returned an error \(HTTP 503\)/.test(error.message));
  });

  it("gives the model the part that best matches the question, and the quote check the pages", async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. ${"Background on language models. ".repeat(12)}`).join("\n\n");
    const text = `${long}\n\nRAG marginalizes over retrieved passages with a top-K approximation.`;
    const arxiv = createArxiv({ fetchImpl: fakeFetch([RAG]), extractPdf: async () => ({ text, pageStarts: [0, 4000, 8000] }) });
    const session = new SourceSession([arxiv], "How does RAG marginalize over retrieved passages?");
    const read = await session.read("arxiv:2005.11401");
    assert.match(read, /marginalizes over retrieved passages/);
    assert.match(read, /\(part \d+ of \d+\)/);
    assert.deepEqual(session.pageStartsFor("arxiv:2005.11401#2"), [0, 4000, 8000]);
    assert.equal(session.citation("arxiv:2005.11401")?.source, "arXiv");
  });

  it("is exported to BibTeX as arXiv's own entries are", () => {
    const answer = {
      evidence: [{ docId: "arxiv:2005.11401#3", quote: "q", verified: true }],
      citations: {
        "arxiv:2005.11401#3": {
          title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
          url: "https://arxiv.org/abs/2005.11401",
          retrievedAt: "2026-11-03T00:00:00Z",
          source: "arXiv",
          work: { authors: ["Patrick Lewis", "Ethan Perez"], year: 2020, doi: "10.48550/arXiv.2005.11401", venue: "arXiv" },
        },
      },
    } as unknown as SavedAnswer;
    const bib = answerToBibtex(answer)!;
    assert.match(bib, /^@misc\{arxiv_2005_11401,\n/);
    assert.match(bib, /  eprint = \{2005\.11401\},\n  archivePrefix = \{arXiv\},/);
    assert.doesNotMatch(bib, /journal/);
  });
});
