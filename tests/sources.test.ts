import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { createOpenAlex, rebuildAbstract } from "../src/sources/openalex.ts";
import { SourceSession } from "../src/sources/session.ts";
import type { FetchLike } from "../src/sources/types.ts";
import { createWikipedia, isWikipediaLanguage } from "../src/sources/wikipedia.ts";
import { createResearchTools, RESEARCH_SYSTEM, researchSystem } from "../src/tools/research.ts";
import { corpus } from "../eval/tasks/corpus.ts";

/** A fetch that answers from fixed routes and records the URLs it was asked for. */
function fakeFetch(routes: Array<[RegExp, unknown, number?]>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new TypeError("Failed to fetch");
    const [, body, status = 200] = route;
    return { ok: status < 400, status, json: async () => body };
  }) as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const ARTICLE = [
  "Ada Lovelace was an English mathematician and writer, chiefly known for her work on Charles Babbage's proposed mechanical general-purpose computer, the Analytical Engine.",
  ...Array.from({ length: 12 }, (_, i) => `Section ${i + 1}. ${"Background material about Victorian science and society. ".repeat(6)}`),
  "Lovelace's notes on the engine include what is recognised as the first algorithm intended to be carried out by such a machine, a method for calculating Bernoulli numbers.",
].join("\n\n");

const wikipediaRoutes: Array<[RegExp, unknown]> = [
  [
    /list=search/,
    { query: { search: [{ title: "Ada Lovelace", snippet: '<span class="searchmatch">Ada</span> King, Countess of Lovelace &amp; mathematician' }] } },
  ],
  [/prop=extracts/, { query: { pages: [{ title: "Ada Lovelace", extract: ARTICLE, fullurl: "https://en.wikipedia.org/wiki/Ada_Lovelace" }] } }],
];

describe("Wikipedia source", () => {
  it("searches and reads articles through the Action API with origin=*", async () => {
    const fetchImpl = fakeFetch(wikipediaRoutes);
    const wikipedia = createWikipedia("en", fetchImpl);
    const [hit] = await wikipedia.search("Ada Lovelace");
    assert.deepEqual(hit, { id: "wikipedia:Ada_Lovelace", title: "Ada Lovelace", snippet: "Ada King, Countess of Lovelace & mathematician" });
    const doc = await wikipedia.fetch("wikipedia:Ada_Lovelace");
    assert.equal(doc.url, "https://en.wikipedia.org/wiki/Ada_Lovelace");
    assert.ok(fetchImpl.urls.every((u) => u.startsWith("https://en.wikipedia.org/w/api.php?") && u.includes("origin=*")));
    assert.match(fetchImpl.urls[1]!, /titles=Ada\+Lovelace/);
  });

  it("uses the chosen language edition and rejects odd language codes", async () => {
    const fetchImpl = fakeFetch(wikipediaRoutes);
    await createWikipedia("ja", fetchImpl).search("x");
    assert.match(fetchImpl.urls[0]!, /^https:\/\/ja\.wikipedia\.org\//);
    assert.equal(isWikipediaLanguage("evil.example.com/"), false);
    assert.throws(() => createWikipedia("x.example.com"));
  });

  it("reports missing articles and network failures in plain words", async () => {
    const missing = createWikipedia("en", fakeFetch([[/prop=extracts/, { query: { pages: [{ title: "Nope", missing: true }] } }]]));
    await assert.rejects(missing.fetch("wikipedia:Nope"), /no article "Nope"/);
    await assert.rejects(createWikipedia("en", fakeFetch([])).search("x"), /could not be reached/);
    await assert.rejects(createWikipedia("en", fakeFetch([[/./, {}, 429]])).search("x"), /HTTP 429/);
  });
});

describe("OpenAlex source", () => {
  const work = {
    id: "https://openalex.org/W2741809807",
    display_name: "Attention Is All You Need",
    publication_year: 2017,
    doi: "https://doi.org/10.48550/arxiv.1706.03762",
    authorships: [{ author: { display_name: "Ashish Vaswani" } }, { author: { display_name: "Noam Shazeer" } }],
    abstract_inverted_index: { The: [0], dominant: [1], sequence: [2], models: [3, 6], are: [4], complex: [5] },
    primary_location: { source: { display_name: "arXiv" } },
  };

  it("rebuilds abstracts from the inverted index", () => {
    assert.equal(rebuildAbstract(work.abstract_inverted_index), "The dominant sequence models are complex models");
    assert.equal(rebuildAbstract(null), "");
  });

  it("searches works and reads one as citable text", async () => {
    const fetchImpl = fakeFetch([
      [/\/works\?/, { results: [work] }],
      [/\/works\/W2741809807\?/, work],
    ]);
    const openalex = createOpenAlex(fetchImpl);
    const [hit] = await openalex.search("attention transformer");
    assert.equal(hit!.id, "openalex:W2741809807");
    assert.equal(hit!.title, "Attention Is All You Need (2017)");
    const doc = await openalex.fetch("openalex:W2741809807");
    assert.match(doc.text, /Ashish Vaswani, Noam Shazeer\. 2017\. arXiv/);
    assert.match(doc.text, /Abstract: The dominant sequence models/);
    assert.equal(doc.url, "https://doi.org/10.48550/arxiv.1706.03762");
    assert.ok(fetchImpl.urls.every((u) => u.startsWith("https://api.openalex.org/works")));
    await assert.rejects(openalex.fetch("openalex:../../etc"), /not an OpenAlex work ID/);
  });
});

describe("source session", () => {
  it("gives the part of a long article that best matches the question, and any part on request", async () => {
    const session = new SourceSession([createWikipedia("en", fakeFetch(wikipediaRoutes))], "What was the first algorithm, for Bernoulli numbers?");
    const best = await session.read("wikipedia:Ada_Lovelace");
    assert.match(best, /Bernoulli numbers/);
    assert.match(best, /Other parts: wikipedia:Ada_Lovelace#1 to wikipedia:Ada_Lovelace#\d+/);
    assert.match(await session.read("wikipedia:Ada_Lovelace#1"), /part 1 of/);
    assert.equal(session.textFor("wikipedia:Ada_Lovelace#3"), ARTICLE);
    assert.equal(session.citation("wikipedia:Ada_Lovelace#2")?.url, "https://en.wikipedia.org/wiki/Ada_Lovelace");
  });

  it("turns source failures into tool results the agent can act on", async () => {
    const session = new SourceSession([createWikipedia("en", fakeFetch([]))], "q");
    assert.match(await session.read("wikipedia:Anything"), /could not be reached/);
    assert.deepEqual([...session.errors], ["Wikipedia could not be reached. Check your internet connection."]);
  });
});

describe("research tools with open sources", () => {
  const library = new ResearchLibrary(corpus);

  it("are exactly the benchmark's tools and prompt when no open source is chosen", () => {
    assert.deepEqual(createResearchTools(library.index).map((t) => t.name), ["search", "read", "final_answer"]);
    assert.equal(researchSystem({ documents: true, sources: [] }), RESEARCH_SYSTEM);
  });

  it("add one search tool per source, and drop document search when there are no documents", () => {
    const session = new SourceSession([createWikipedia("en", fakeFetch([])), createOpenAlex(fakeFetch([]))], "q");
    assert.deepEqual(createResearchTools(library.index, session).map((t) => t.name), ["search", "read", "search_wikipedia", "search_openalex", "final_answer"]);
    assert.deepEqual(createResearchTools(new ResearchLibrary([]).index, session).map((t) => t.name), ["read", "search_wikipedia", "search_openalex", "final_answer"]);
    assert.match(researchSystem({ documents: true, sources: ["Wikipedia"] }), /user's documents first/);
  });
});

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }
  async dispose() {}
}

describe("research with Wikipedia", () => {
  it("verifies quotes against the fetched article and records where it came from", async () => {
    const fetchImpl = fakeFetch(wikipediaRoutes);
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace algorithm"}}`,
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      JSON.stringify({
        tool: "final_answer",
        args: {
          found: true,
          answer: "A method for calculating Bernoulli numbers.",
          evidence: [{ docId: "wikipedia:Ada_Lovelace#14", quote: "a method for calculating Bernoulli numbers" }],
        },
      }),
    ]);
    const result = await runResearch({
      question: "What did Ada Lovelace's first algorithm calculate?",
      library: new ResearchLibrary([]),
      model,
      sources: [createWikipedia("en", fetchImpl)],
    });
    assert.equal(result.status, "verified");
    assert.equal(result.citations["wikipedia:Ada_Lovelace#14"]?.url, "https://en.wikipedia.org/wiki/Ada_Lovelace");
    assert.match(result.citations["wikipedia:Ada_Lovelace#14"]!.retrievedAt, /^\d{4}-\d\d-\d\dT/);
    assert.match(model.requests[0]!.messages[0]!.content, /Search Wikipedia/);
  });

  it("fetches a cited article it never read, so an invented quote still fails", async () => {
    const model = new ScriptedModel([
      JSON.stringify({
        tool: "final_answer",
        args: { found: true, answer: "x", evidence: [{ docId: "wikipedia:Ada_Lovelace", quote: "she invented the telephone in 1876" }] },
      }),
    ]);
    const result = await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    assert.equal(result.status, "unverified");
    assert.equal(result.evidence[0]!.reason, "quote not found in the document");
  });
});

describe("research with an unreachable source", () => {
  it("reports the failure alongside the answer", async () => {
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "Wikipedia was unavailable.", evidence: [] } }),
    ]);
    const result = await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch([]))] });
    assert.equal(result.status, "not-found");
    assert.deepEqual(result.sourceErrors, ["Wikipedia could not be reached. Check your internet connection."]);
  });
});
