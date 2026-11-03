import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerToBibtex, type SavedAnswer } from "../src/app/research/answers.ts";
import { ARXIV_OPENALEX_SOURCE, arxivId, createArxiv, type ArxivWork } from "../src/sources/arxiv.ts";
import { OPENALEX_KEY_HINT } from "../src/sources/openalex.ts";
import { SourceSession } from "../src/sources/session.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

/** A fetch answering OpenAlex with `works` and arxiv.org/pdf with `pdf`, recording the URLs asked for. */
function fakeFetch(works: ArxivWork[], pdf = new Uint8Array([37, 80, 68, 70]), status = 200): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    if (url.startsWith("https://api.openalex.org/")) {
      return { ok: status < 400, status, json: async () => ({ results: works }), headers: { get: (name: string) => (name === "retry-after" ? "80131" : null) } };
    }
    if (url.startsWith("https://arxiv.org/pdf/")) {
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => pdf.buffer.slice(0), headers: { get: () => null } };
    }
    throw new TypeError("Failed to fetch");
  }) as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const RAG: ArxivWork = {
  id: "https://openalex.org/W3027879771",
  display_name: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
  publication_year: 2020,
  doi: "https://doi.org/10.48550/arxiv.2005.11401",
  authorships: [{ author: { display_name: "Patrick Lewis" } }, { author: { display_name: "Ethan Perez" } }],
  abstract_inverted_index: { Large: [0], "pre-trained": [1], language: [2], models: [3] },
  primary_location: { source: { display_name: "arXiv (Cornell University)" } },
  locations: [{ landing_page_url: "http://arxiv.org/abs/2005.11401v4", pdf_url: "http://arxiv.org/pdf/2005.11401" }],
};

const PAGES = { text: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks\nPatrick Lewis\n\nRAG combines a retriever with a generator.", pageStarts: [0, 79] };

describe("arXiv source", () => {
  it("finds a work's arXiv identifier in its links or its arXiv DOI, without the version", () => {
    assert.equal(arxivId(RAG), "2005.11401");
    assert.equal(arxivId({ id: "W1", doi: "https://doi.org/10.48550/arXiv.2401.00001" }), "2401.00001");
    assert.equal(arxivId({ id: "W2", locations: [null, { landing_page_url: "https://arxiv.org/abs/hep-th/9901001v2" }] }), "hep-th/9901001");
    assert.equal(arxivId({ id: "W3", primary_location: { source: { display_name: "Nature" } }, doi: "https://doi.org/10.1038/x" }), undefined);
  });

  it("searches OpenAlex for works on arXiv, and gives each its arXiv ID", async () => {
    const fetchImpl = fakeFetch([RAG, { id: "https://openalex.org/W9", display_name: "No arXiv link" }]);
    const arxiv = createArxiv({ fetchImpl, extractPdf: async () => PAGES });
    const hits = await arxiv.search("retrieval augmented generation");
    assert.deepEqual(hits, [{ id: "arxiv:2005.11401", title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)", snippet: "Large pre-trained language models" }]);
    const url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.origin + url.pathname, "https://api.openalex.org/works");
    assert.equal(url.searchParams.get("filter"), `locations.source.id:${ARXIV_OPENALEX_SOURCE}`);
    assert.equal(url.searchParams.get("search"), "retrieval augmented generation");
    assert.match(url.searchParams.get("select")!, /locations/);
    assert.equal(url.searchParams.get("api_key"), null, "no key, none sent");
  });

  it("sends the user's OpenAlex key when there is one, and says how to get one when the budget is out", async () => {
    const keyed = fakeFetch([RAG]);
    await createArxiv({ fetchImpl: keyed, apiKey: " k123 ", extractPdf: async () => PAGES }).search("rag");
    assert.equal(new URL(keyed.urls[0]!).searchParams.get("api_key"), "k123");
    const spent = createArxiv({ fetchImpl: fakeFetch([], undefined, 429), extractPdf: async () => PAGES });
    await assert.rejects(spent.search("rag"), (error: Error) => error instanceof SourceError && error.message.includes("about 22 hours") && error.message.includes(OPENALEX_KEY_HINT));
  });

  it("reads a paper whole from its PDF on arXiv, with its pages and its reference", async () => {
    const fetchImpl = fakeFetch([RAG]);
    let extracted: Uint8Array | undefined;
    const arxiv = createArxiv({ fetchImpl, extractPdf: async (bytes) => ((extracted = bytes), PAGES) });
    await arxiv.search("rag");
    const doc = await arxiv.fetch("arxiv:2005.11401");
    assert.equal(fetchImpl.urls.at(-1), "https://arxiv.org/pdf/2005.11401");
    assert.deepEqual([...extracted!], [37, 80, 68, 70], "the PDF's bytes go to pdf.js");
    assert.equal(doc.title, RAG.display_name);
    assert.equal(doc.text, PAGES.text);
    assert.deepEqual(doc.pageStarts, PAGES.pageStarts);
    assert.equal(doc.url, "https://arxiv.org/abs/2005.11401");
    assert.deepEqual(doc.work, { authors: ["Patrick Lewis", "Ethan Perez"], year: 2020, doi: "10.48550/arXiv.2005.11401", venue: "arXiv" });
    // A paper not found by a search keeps the PDF's first line as its title.
    const unsearched = await createArxiv({ fetchImpl, extractPdf: async () => PAGES }).fetch("arxiv:2005.11401v2");
    assert.equal(unsearched.title, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks");
    assert.equal(unsearched.work?.doi, "10.48550/arXiv.2005.11401");
  });

  it("says plainly when a paper can't be read", async () => {
    const fetchImpl = fakeFetch([]);
    await assert.rejects(createArxiv({ fetchImpl, extractPdf: async () => PAGES }).fetch("arxiv:../etc"), /not an arXiv paper ID/);
    await assert.rejects(createArxiv({ fetchImpl, extractPdf: async () => ({ text: " " }) }).fetch("arxiv:2005.11401"), /no text that can be read/);
    await assert.rejects(
      createArxiv({ fetchImpl, extractPdf: async () => Promise.reject(new Error("bad XRef")) }).fetch("arxiv:2005.11401"),
      /could not be read/,
    );
    assert.equal(fetchImpl.urls.filter((u) => u.includes("..")).length, 0, "an unsafe ID is never requested");
  });

  it("gives the model the part that best matches the question, and the quote check the pages", async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. ${"Background on language models. ".repeat(12)}`).join("\n\n");
    const text = `${long}\n\nRAG marginalizes over retrieved passages with a top-K approximation.`;
    const arxiv = createArxiv({ fetchImpl: fakeFetch([RAG]), extractPdf: async () => ({ text, pageStarts: [0, 4000, 8000] }) });
    const session = new SourceSession([arxiv], "How does RAG marginalize over retrieved passages?");
    const read = await session.read("arxiv:2005.11401");
    assert.match(read, /\(part \d+ of \d+\)\nRAG marginalizes|marginalizes over retrieved passages/);
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
