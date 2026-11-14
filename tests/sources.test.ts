import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { createOpenAlex, fullTextIds, openAlexFilter, rebuildAbstract, snippetOf } from "../src/sources/openalex.ts";
import { parseSourcePrefs } from "../src/app/research/sources.ts";
import type { OpenSource } from "../src/sources/types.ts";
import { SourceSession } from "../src/sources/session.ts";
import { getJson, longWait, retryWait, SourceError, type FetchLike } from "../src/sources/types.ts";
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
    await assert.rejects(createWikipedia("en", fakeFetch([[/./, {}, 429]])).search("x"), /Wikipedia is busy \(too many requests\)/);
    await assert.rejects(createWikipedia("en", fakeFetch([[/./, {}, 503]])).search("x"), /HTTP 503/);
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

  it("ends search snippets at a sentence end, not mid-word", () => {
    // From the live check: the 240-character cut left "…can sometimes match hum…".
    const abstract =
      "Analogical reasoning — the capacity to identify and map structural relationships between different domains — is fundamental to human cognition and learning. Recent studies have shown that large language models (LLMs) can sometimes match humans in analogical reasoning tasks, opening the possibility that analogical reasoning might emerge from domain-general processes. However, it is still debated.";
    assert.equal(
      snippetOf(abstract),
      "Analogical reasoning — the capacity to identify and map structural relationships between different domains — is fundamental to human cognition and learning. […]",
    );
    assert.equal(snippetOf("Short abstract."), "Short abstract.");
    assert.match(snippetOf("word ".repeat(100).trim()), /^(word )+word \[…\]$/);
  });

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
    assert.deepEqual(doc.work, { authors: ["Ashish Vaswani", "Noam Shazeer"], year: 2017, doi: "10.48550/arxiv.1706.03762", venue: "arXiv" });
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

  it("gives the part holding what the answer quoted, when the read-first rule sent the model to read it", async () => {
    const question = "What was the first algorithm, for Bernoulli numbers?";
    const babbage = "chiefly known for her work on Charles Babbage's proposed mechanical general-purpose computer";
    const session = new SourceSession([createWikipedia("en", fakeFetch(wikipediaRoutes))], question);
    assert.match(await session.read("wikipedia:Ada_Lovelace"), /Bernoulli numbers/, "without quotes, the part matching the question");
    const quoted = await session.read("wikipedia:Ada_Lovelace", undefined, [babbage]);
    assert.match(quoted, /\(part 1 of \d+\)/);
    assert.ok(quoted.includes(babbage));
    // A quote that leaves words out is found by its longest piece; one not word for word, by its words.
    assert.match(await session.read("wikipedia:Ada_Lovelace", undefined, [`English … ${babbage}`]), /\(part 1 of/);
    assert.match(await session.read("wikipedia:Ada_Lovelace", undefined, ["Lovelace, an English writer, worked on Babbage's mechanical general-purpose computer"]), /\(part 1 of/);
    // A part the model names is given whatever was quoted.
    assert.match(await session.read("wikipedia:Ada_Lovelace#3", undefined, [babbage]), /\(part 3 of/);
  });

  it("gives, for a short forced read, the passage around each quote and the part to read for more", async () => {
    const session = new SourceSession([createWikipedia("en", fakeFetch(wikipediaRoutes))], "What did she work on?");
    const bernoulli = "a method for calculating Bernoulli numbers";
    const short = (await session.passage("wikipedia:Ada_Lovelace", [bernoulli]))!;
    assert.match(short, /^\[wikipedia:Ada_Lovelace\] Ada Lovelace \(the passage your answer quoted\)\n/);
    assert.ok(short.includes(bernoulli));
    assert.ok(short.length < 900, `about 300 characters each side: ${short.length}`);
    assert.match(short, /To see more, read wikipedia:Ada_Lovelace#\d+\.$/);
    assert.equal(await session.passage("wikipedia:Ada_Lovelace", ["a method for weaving Jacquard silk"]), undefined, "a quote not in the document: no passage");
    assert.equal(await session.passage("wikipedia:Ada_Lovelace", []), undefined);
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
          evidence: [{ docId: "wikipedia:Ada_Lovelace", quote: "a method for calculating Bernoulli numbers" }],
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
    assert.equal(result.citations["wikipedia:Ada_Lovelace"]?.url, "https://en.wikipedia.org/wiki/Ada_Lovelace");
    assert.match(result.citations["wikipedia:Ada_Lovelace"]!.retrievedAt, /^\d{4}-\d\d-\d\dT/);
    assert.match(model.requests[0]!.messages[0]!.content, /Search Wikipedia/);
  });

  it("reads, for an answer quoted from a snippet, the part holding the quote", async () => {
    const babbage = "chiefly known for her work on Charles Babbage's proposed mechanical general-purpose computer";
    const answer = (quote: string) =>
      JSON.stringify({ tool: "final_answer", args: { found: true, answer: "She worked on Babbage's computer.", evidence: [{ docId: "wikipedia:Ada_Lovelace", quote }] } });
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      answer(babbage),
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      answer(babbage),
    ]);
    const result = await runResearch({
      question: "What was Ada Lovelace's first algorithm for Bernoulli numbers, and whose computer was it for?",
      library: new ResearchLibrary([]),
      model,
      sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))],
    });
    const read = result.agent.transcript.find((m) => m.content.includes("(part ") && m.content.startsWith("Tool result"))!.content;
    assert.match(read, /\(part 1 of \d+\)/, "the part the answer quoted, not the one about Bernoulli numbers");
    assert.ok(read.includes(babbage));
    assert.equal(result.status, "verified");
  });

  it("with forcedReadPassage, reads only the passage around what the answer quoted from a snippet", async () => {
    const babbage = "chiefly known for her work on Charles Babbage's proposed mechanical general-purpose computer";
    const answer = JSON.stringify({ tool: "final_answer", args: { found: true, answer: "She worked on Babbage's computer.", evidence: [{ docId: "wikipedia:Ada_Lovelace", quote: babbage }] } });
    const run = (forcedReadPassage: boolean) =>
      runResearch({
        question: "Whose computer did Ada Lovelace work on?",
        library: new ResearchLibrary([]),
        model: new ScriptedModel([`{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`, answer, `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`, answer]),
        sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))],
        forcedReadPassage,
      });
    const readOf = (result: Awaited<ReturnType<typeof run>>) => [...result.agent.transcript].reverse().find((m) => m.content.startsWith("Tool result") && m.content.includes("[wikipedia:Ada_Lovelace"))!.content;
    const whole = await run(false);
    const short = await run(true);
    assert.match(readOf(whole), /\(part 1 of \d+\)/);
    assert.match(readOf(short), /\(the passage your answer quoted\)/);
    assert.ok(readOf(short).includes(babbage));
    assert.ok(readOf(short).length < readOf(whole).length, `${readOf(short).length} < ${readOf(whole).length}`);
    assert.equal(short.status, "verified", "the quote is checked against the whole article");
  });

  it("only lets the model read and cite IDs it has seen, so the class 1 typos cannot happen", async () => {
    const replies = [
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      `{"tool":"search_openalex","args":{"query":"LLM"}}`,
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
    ];
    const model = new ScriptedModel(replies);
    const openalex = createOpenAlex(fakeFetch([[/\/works\?/, { results: [{ id: "https://openalex.org/W7150387116", display_name: "How LLMs Might Think" }] }]]));
    await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes)), openalex] });
    const readIds = (i: number) => {
      const schema = JSON.stringify(model.requests[i]!.responseSchema);
      return schema.match(/"const":"read"[\s\S]*?"enum":(\[[^\]]*\])/)?.[1];
    };
    // After both searches, read accepts exactly the two result IDs: not "wikiped:Ada_Lovelace", not a bare "W7150387116".
    assert.equal(readIds(2), JSON.stringify(["wikipedia:Ada_Lovelace", "openalex:W7150387116"]));
    // After reading the long article, its parts can be read and cited too.
    assert.match(readIds(3)!, /"wikipedia:Ada_Lovelace#2"/);
    assert.match(JSON.stringify(model.requests[3]!.responseSchema), /"const":"final_answer"[\s\S]*"enum":\["wikipedia:Ada_Lovelace"/);
  });

  it("makes the model read the user's documents before Wikipedia", async () => {
    // Class 1 live checks: with the Papyrus PDF added and Wikipedia ticked, the model first skipped
    // the PDF, then, with a search required, searched it and still went to Wikipedia without reading it.
    const library = new ResearchLibrary([{ id: "papyrus", title: "Papyrus tutorial", text: "Select the Papyrus perspective. Create a Papyrus project with an Activity Diagram." }]);
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"activity diagram"}}`,
      `{"tool":"read","args":{"docId":"papyrus"}}`,
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      JSON.stringify({
        tool: "final_answer",
        args: { found: true, answer: "Create a Papyrus project with an Activity Diagram.", evidence: [{ docId: "papyrus", quote: "Create a Papyrus project with an Activity Diagram." }] },
      }),
    ]);
    const result = await runResearch({ question: "How to create an activity diagram?", library, model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    const tools = (i: number) => [...JSON.stringify(model.requests[i]!.responseSchema).matchAll(/"const":"([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tools(0), ["search", "read"]);
    assert.deepEqual(tools(1), ["read"], "a search with results is not enough, and is followed by a read");
    assert.deepEqual(tools(2), ["search", "read", "search_wikipedia"], "Wikipedia must be searched before the answer");
    assert.deepEqual(tools(3), ["search", "read", "final_answer"]);
    assert.equal(result.agent.stopReason, "final");
    // The trace gets result counts: documents counted as documents, not passages.
    assert.deepEqual(result.agent.calls.map((c) => c.resultCount), [1, undefined, 1, undefined]);
    // Told why it cannot answer yet; Qwen3.5-2B, not told, read the PDF part after part instead.
    assert.match(result.agent.transcript[5]!.content, /Before you answer, also search Wikipedia \(search_wikipedia\)\.$/);
    assert.doesNotMatch(result.agent.transcript[7]!.content, /Before you answer/);
  });

  it("searches every ticked source before the answer, and tells the model to combine them", async () => {
    // Class 1 live check: the Papyrus PDF answered "How to create an activity diagram?" and the
    // model stopped there, although the owner had ticked Wikipedia expecting it to be checked too.
    const openalex = createOpenAlex(fakeFetch([[/\/works\?/, { results: [] }]]));
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      `{"tool":"search_openalex","args":{"query":"Ada Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
      // Wikipedia's result was not read, so "not found" is sent back once (read before not-found).
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
      // Then once more, to search topic by topic before concluding (search again before not-found).
      `{"tool":"search_openalex","args":{"query":"Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
    ]);
    const result = await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes)), openalex] });
    const tools = (i: number) => [...JSON.stringify(model.requests[i]!.responseSchema).matchAll(/"const":"([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tools(0), ["read", "search_wikipedia", "search_openalex"]);
    assert.deepEqual(tools(1), ["read", "search_openalex"], "OpenAlex is still to be searched");
    assert.deepEqual(tools(2), ["read", "search_openalex", "final_answer"], "Wikipedia found results, so it waits for a read");
    assert.equal(result.agent.stopReason, "final");
    assert.deepEqual(
      result.agent.calls.map((c) => [c.tool, Boolean(c.rejected)]),
      [["search_wikipedia", false], ["search_openalex", false], ["final_answer", true], ["read", false], ["final_answer", true], ["search_openalex", false], ["final_answer", false]],
    );
    assert.match(model.requests[0]!.messages[0]!.content, /Search each of Wikipedia and OpenAlex/);
    assert.match(researchSystem({ documents: true, sources: ["Wikipedia"] }), /Then search Wikipedia too, and combine what you find: prefer the user's documents/);
  });

  it("gives two more steps per ticked source", async () => {
    const searches = Array.from({ length: 20 }, (_, i) => `{"tool":"search","args":{"query":"qqqzz${"abcdefghijklmnopqrst"[i]}"}}`);
    const run = (sources: number) =>
      runResearch({
        question: "q",
        library: new ResearchLibrary(corpus),
        model: new ScriptedModel([...searches]),
        sources: [createWikipedia("en", fakeFetch(wikipediaRoutes)), createOpenAlex(fakeFetch([]))].slice(0, sources),
      });
    assert.equal((await run(0)).agent.calls.length, 8);
    assert.equal((await run(1)).agent.calls.length, 10);
    assert.equal((await run(2)).agent.calls.length, 12);
  });

  it("opens the other sources when the documents have nothing on the question", async () => {
    const library = new ResearchLibrary([{ id: "papyrus", title: "Papyrus tutorial", text: "Select the Papyrus perspective." }]);
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"Ada Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
    ]);
    await runResearch({ question: "Who was Ada Lovelace?", library, model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    assert.match(JSON.stringify(model.requests[1]!.responseSchema), /"search_wikipedia"/);
    assert.match(model.requests[0]!.messages[0]!.content, /quote only complete text/);
  });

  it("offers open sources at once when there are no documents", async () => {
    const model = new ScriptedModel([JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } })]);
    await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    assert.match(JSON.stringify(model.requests[0]!.responseSchema), /"search_wikipedia"/);
  });

  it("rejects a mistyped ID in unconstrained mode with an error the model can act on", async () => {
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      `{"tool":"read","args":{"docId":"wikiped:Ada_Lovelace"}}`,
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
      `{"tool":"search_wikipedia","args":{"query":"Lovelace"}}`,
      // The new search found results, so "not found" waits for a read of them.
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace#2"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
    ]);
    const result = await runResearch({ question: "q", library: new ResearchLibrary([]), model, constrained: false, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    assert.deepEqual(result.agent.calls.map((c) => c.valid), [true, false, true, true, true, true, true]);
    assert.equal(result.agent.stopReason, "final");
    assert.match(result.agent.transcript[5]!.content, /not a valid action/);
  });

  it("fetches a cited article it never read, so an invented quote still fails", async () => {
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"Ada Lovelace"}}`,
      JSON.stringify({
        tool: "final_answer",
        args: { found: true, answer: "x", evidence: [{ docId: "wikipedia:Ada_Lovelace", quote: "she invented the telephone in 1876" }] },
      }),
      // Asked to read what it quotes first (read before answering), the model answers again.
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

describe("search again before not found", () => {
  it("sends a not-found answer back once to search each topic on its own", async () => {
    // Preview, class 1 laptop: asked "What is the difference between blockchain and DAG?", Qwen3.5-4B
    // searched Wikipedia for "difference between blockchain and DAG", read "Version control" and
    // concluded that Wikipedia had nothing, though it has an article on each.
    const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } });
    const model = new ScriptedModel([
      `{"tool":"search_wikipedia","args":{"query":"difference between blockchain and DAG"}}`,
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace"}}`,
      notFound,
      `{"tool":"search_wikipedia","args":{"query":"Blockchain"}}`,
      `{"tool":"read","args":{"docId":"wikipedia:Ada_Lovelace#2"}}`,
      notFound,
    ]);
    const result = await runResearch({ question: "What is the difference between blockchain and DAG?", library: new ResearchLibrary([]), model, sources: [createWikipedia("en", fakeFetch(wikipediaRoutes))] });
    assert.deepEqual(
      result.agent.calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`),
      ["search_wikipedia", "read", "final_answer (rejected)", "search_wikipedia", "read", "final_answer"],
    );
    assert.equal(result.agent.calls[2]!.rejected, "About to conclude that the sources don't answer this; searching for each topic on its own first");
    assert.match(result.agent.transcript[7]!.content, /^Before concluding that the sources do not answer the question, search Wikipedia again with shorter terms: the name of each thing the question is about, on its own/);
    assert.equal(result.status, "not-found", "asked once: after searching again the model may still conclude");
    assert.match(model.requests[0]!.messages[0]!.content, /Search Wikipedia with short terms, such as the title an article would have, not the whole question\. For a question about two or more things, search for each of them on its own/);
  });

  it("does not ask when every search failed, or without open sources", async () => {
    const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } });
    const offline = new ScriptedModel([`{"tool":"search_wikipedia","args":{"query":"Blockchain"}}`, notFound]);
    const failed = await runResearch({ question: "q", library: new ResearchLibrary([]), model: offline, sources: [createWikipedia("en", fakeFetch([]))] });
    assert.equal(failed.agent.calls.at(-1)!.rejected, undefined);
    assert.equal(researchSystem({ documents: true, sources: [] }), RESEARCH_SYSTEM, "the benchmark's prompt is unchanged");
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
    assert.equal(result.agent.calls[0]!.failed, true);
  });

  it("explains a rate limit in plain words", async () => {
    // Class 1 preview check: after a day of testing, OpenAlex answered HTTP 429 and the warning only gave the code.
    const model = new ScriptedModel([
      `{"tool":"search_openalex","args":{"query":"activity diagram"}}`,
      JSON.stringify({ tool: "final_answer", args: { found: false, answer: "", evidence: [] } }),
    ]);
    const result = await runResearch({ question: "q", library: new ResearchLibrary([]), model, sources: [createOpenAlex(fakeFetch([[/\/works\?/, {}, 429]]))] });
    assert.deepEqual(result.sourceErrors, ["OpenAlex is busy (too many requests). Try again in a few minutes."]);
  });
});

describe("source requests", () => {
  const response = (status: number, body: unknown = {}, retryAfter?: string) => ({
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: (name: string) => (name === "retry-after" ? (retryAfter ?? null) : null) },
  });

  it("tries a rate-limited request once more after the wait the server asks for", async () => {
    const statuses = [429, 200];
    const fetchImpl: FetchLike = async () => response(statuses.shift()!, { ok: 1 }, "0");
    assert.deepEqual(await getJson(fetchImpl, "OpenAlex", "https://api.openalex.org/works"), { ok: 1 });
    assert.equal(statuses.length, 0);
  });

  it("does not wait for a long Retry-After, or retry twice", async () => {
    let calls = 0;
    const long: FetchLike = async () => (calls++, response(429, {}, "60"));
    await assert.rejects(getJson(long, "OpenAlex", "u"), /OpenAlex is busy/);
    assert.equal(calls, 1);
    // OpenAlex's daily budget without an API key: the wait is said as it is, with the hint.
    const daily: FetchLike = async () => response(429, {}, "80131");
    await assert.rejects(
      getJson(daily, "OpenAlex", "u", undefined, { limitHint: "Add a key." }),
      (error: Error) => error.message === "OpenAlex has no requests left for now; they come back in about 22 hours. Add a key.",
    );
    assert.equal(longWait("3599"), undefined);
    assert.equal(longWait("5400"), "about 2 hours");
    assert.equal(longWait(null), undefined);
    calls = 0;
    const always: FetchLike = async () => (calls++, response(429, {}, "0"));
    await assert.rejects(getJson(always, "OpenAlex", "u"), /OpenAlex is busy/);
    assert.equal(calls, 2);
  });

  it("reads Retry-After in seconds or as a date", () => {
    assert.equal(retryWait(null), 1000);
    assert.equal(retryWait("2"), 2000);
    assert.equal(retryWait("60"), undefined);
    assert.equal(retryWait(new Date(5_000).toUTCString(), 0), 5000);
    assert.equal(retryWait("soon"), 1000);
  });

  it("gives up on a request that takes too long, in plain words", async () => {
    const hanging: FetchLike = (_url, init) => new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
    await assert.rejects(getJson(hanging, "Wikipedia", "u", undefined, { timeoutMs: 20 }), (error: Error) => {
      assert.ok(error instanceof SourceError);
      assert.match(error.message, /Wikipedia did not answer within 0 seconds/);
      return true;
    });
    // A stop by the user is not turned into a source error.
    const stop = new AbortController();
    const pending = getJson(hanging, "Wikipedia", "u", stop.signal, { timeoutMs: 10_000 });
    stop.abort();
    await assert.rejects(pending, (error: Error) => !(error instanceof SourceError));
  });
});

describe("OpenAlex search limits and full texts (harness 0.70.0)", () => {
  const abstract = { Results: [0], here: [1] };
  const work = (n: number, withAbstract: boolean) => ({ id: `https://openalex.org/W${n}`, display_name: `Work ${n}`, ...(withAbstract ? { abstract_inverted_index: abstract } : {}) });

  it("limits a search to a year on, open access and a field, as OpenAlex's filter", async () => {
    assert.equal(openAlexFilter({}), undefined);
    assert.equal(openAlexFilter({ fromYear: 2020, openAccess: true, field: "fields/22" }), "from_publication_date:2020-01-01,is_oa:true,primary_topic.field.id:fields/22");
    assert.equal(openAlexFilter({ fromYear: 20, field: "fields/999" }), undefined, "a year or field that is not one is left out");
    const fetchImpl = fakeFetch([[/\/works\?/, { results: [] }]]);
    await createOpenAlex(fetchImpl, undefined, { fromYear: 2020, field: "fields/22" }).search("totem-pole rectifier");
    const url = new URL(fetchImpl.urls[0]!);
    assert.equal(url.searchParams.get("filter"), "from_publication_date:2020-01-01,primary_topic.field.id:fields/22");
    assert.equal(url.searchParams.get("per-page"), "25");
  });

  it("shows five works, those with an abstract first, in OpenAlex's order", async () => {
    const results = [work(1, false), work(2, true), work(3, false), work(4, true), work(5, true), work(6, false), work(7, true), work(8, true), work(9, true)];
    const hits = await createOpenAlex(fakeFetch([[/\/works\?/, { results }]])).search("q");
    assert.deepEqual(hits.map((h) => h.id), ["openalex:W2", "openalex:W4", "openalex:W5", "openalex:W7", "openalex:W8"]);
    const few = await createOpenAlex(fakeFetch([[/\/works\?/, { results: [work(1, false), work(2, true)] }]])).search("q");
    assert.deepEqual(few.map((h) => h.id), ["openalex:W2", "openalex:W1"], "a work without an abstract still shows when there are few");
  });

  const onArxiv = { ...work(10, true), display_name: "A Rectifier", publication_year: 2024, doi: "https://doi.org/10.1109/tpel.2024.1", locations: [{ landing_page_url: "https://arxiv.org/abs/2401.01234v2" }], ids: { pmid: null, pmcid: null } };
  const reader = (label: "arXiv" | "Europe PMC", text: string, fail = false): OpenSource & { asked: string[] } => {
    const asked: string[] = [];
    return {
      name: label === "arXiv" ? "arxiv" : "europepmc",
      label,
      asked,
      search: async () => [],
      fetch: async (id: string) => {
        asked.push(id);
        if (fail) throw new Error("not readable");
        return { id, title: "t", text, url: `https://example.org/${id}`, retrievedAt: "2026-11-14T00:00:00Z", work: { authors: ["A. Author"], venue: label }, pageStarts: [0, 10] };
      },
    };
  };

  it("reads a work in full from a source the user ticked, under its OpenAlex ID", async () => {
    const arxiv = reader("arXiv", "Full paper text. Page two.");
    const doc = await createOpenAlex(fakeFetch([[/\/works\/W10\?/, onArxiv]]), undefined, {}, { arxiv }).fetch("openalex:W10");
    assert.deepEqual(arxiv.asked, ["arxiv:2401.01234"]);
    assert.equal(doc.id, "openalex:W10");
    assert.match(doc.text, /^A Rectifier\n/);
    assert.match(doc.text, /Full text, read from arXiv:\n\nFull paper text\. Page two\.$/);
    assert.equal(doc.url, "https://example.org/arxiv:2401.01234");
    assert.deepEqual(doc.work, { authors: ["A. Author"], venue: "arXiv" }, "the version read is the one cited");
    const head = doc.text.indexOf("Full paper text");
    assert.deepEqual(doc.pageStarts, [head, head + 10], "page starts moved past OpenAlex's details");
  });

  it("reads the abstract when the work is in no ticked source, or reading it there fails", async () => {
    const route = fakeFetch([[/\/works\/W10\?/, onArxiv]]);
    assert.match((await createOpenAlex(route).fetch("openalex:W10")).text, /Abstract: Results here/);
    const failing = reader("arXiv", "", true);
    const doc = await createOpenAlex(route, undefined, {}, { arxiv: failing }).fetch("openalex:W10");
    assert.deepEqual(failing.asked, ["arxiv:2401.01234"]);
    assert.match(doc.text, /Abstract: Results here/);
  });

  it("finds a work on arXiv by its link or DOI, and in Europe PMC by its PubMed ID", () => {
    const [arxiv, europepmc] = [reader("arXiv", ""), reader("Europe PMC", "")];
    const ids = (w: object) => fullTextIds(w as never, { arxiv, europepmc }).map((r) => r.id);
    assert.deepEqual(ids({ id: "W1", doi: "https://doi.org/10.48550/arXiv.2005.11401" }), ["arxiv:2005.11401"]);
    assert.deepEqual(ids({ id: "W1", ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/38012345", pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10850983" } }), ["europepmc:MED/38012345"]);
    assert.deepEqual(ids({ id: "W1", ids: { pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10850983" } }), ["europepmc:PMC/PMC10850983"]);
    assert.deepEqual(ids({ id: "W1", ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/38012345" } }), [], "a PubMed record without a free full text");
    assert.deepEqual(fullTextIds({ id: "W1", doi: "10.48550/arXiv.2005.11401" } as never, {}), [], "no source ticked, nothing read elsewhere");
  });

  it("keeps the limits the user set, and only valid ones", () => {
    const prefs = parseSourcePrefs(JSON.stringify({ openalex: true, openalexFromYear: 2019, openalexOpenAccess: true, openalexField: "fields/22" }));
    assert.equal(prefs.openalexFromYear, 2019);
    assert.equal(prefs.openalexOpenAccess, true);
    assert.equal(prefs.openalexField, "fields/22");
    const bad = parseSourcePrefs(JSON.stringify({ openalex: true, openalexFromYear: 99, openalexOpenAccess: "yes", openalexField: "fields/999" }));
    assert.deepEqual([bad.openalexFromYear, bad.openalexOpenAccess, bad.openalexField], [undefined, undefined, undefined]);
  });
});
