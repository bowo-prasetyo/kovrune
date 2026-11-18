import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createPatents, patentQuery, readFullText, readPublications } from "../src/sources/patents.ts";
import type { FetchLike } from "../src/sources/types.ts";
import { answerToBibtex, type SavedAnswer } from "../src/app/research/answers.ts";

// What OPS returned on 18 November 2026 (tests/fixtures/README.md).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/ops/${name}`, import.meta.url), "utf8");
const EP_WO = fixture("search-wind-blade-ep-wo.xml");
const ALL = fixture("search-wind-blade-all.xml");
const CLAIMS = fixture("WO.2026130641.A1-claims.xml");
const DESCRIPTION = fixture("WO.2026130641.A1-description.xml");
const NOT_FOUND = `<fault xmlns="http://ops.epo.org"><code>SERVER.EntityNotFound</code><message>No results found</message></fault>`;

type Route = [RegExp, string | (() => string), number?];
interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeOps(routes: Route[], token = { access_token: "tok-1", expires_in: "1199" }): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, ...init });
    if (url.endsWith("/auth/accesstoken")) {
      return { ok: true, status: 200, json: async () => token, text: async () => JSON.stringify(token) };
    }
    const route = routes.find(([pattern]) => pattern.test(decodeURIComponent(url.replace(/\+/g, " "))));
    if (!route) throw new TypeError("Failed to fetch");
    const [, body, status = 200] = route;
    const text = typeof body === "function" ? body() : body;
    return { ok: status < 400, status, json: async () => JSON.parse(text), text: async () => text };
  }) as FetchLike & { calls: Call[] };
  impl.calls = calls;
  return impl;
}

const CREDENTIALS = { key: "my-key", secret: "my-secret" };

describe("EPO patents (OPS)", () => {
  it("reads a search's publications: number, title, applicant, inventors, date, classes, abstract", () => {
    const [blade] = readPublications(EP_WO);
    assert.equal(blade!.number, "WO2026130641A1");
    assert.equal(blade!.docdb, "WO.2026130641.A1");
    assert.equal(blade!.title, "A WIND TURBINE BLADE");
    assert.deepEqual(blade!.applicants, ["VESTAS WIND SYSTEMS A/S"]);
    assert.equal(blade!.inventors[0], "ARNAUD, Joao Andre Guerreiro");
    assert.equal(blade!.date, "2026-06-25");
    assert.deepEqual(blade!.classes.slice(0, 2), ["F03D 1/06", "F03D 80/00"]);
    assert.match(blade!.abstract!, /^A wind turbine blade having an outer surface and a lightning protection system/);
  });

  it("reads claims one per paragraph, and the description's paragraphs", () => {
    const claims = readFullText(CLAIMS, "claims");
    assert.match(claims, /1\. A wind turbine blade having an outer surface/);
    const description = readFullText(DESCRIPTION, "description");
    assert.equal(description.split("\n\n").length, 57);
    assert.match(description, /^A Wind Turbine Blade\n\nThe present invention relates to a wind turbine blade\./);
  });

  it("searches titles and abstracts for every word, phrases kept whole", () => {
    assert.equal(patentQuery("totem-pole PFC rectifier", ["EP", "WO"]), `ta="totem pole" and ta=PFC and ta=rectifier and (pn=EP or pn=WO)`);
    assert.equal(patentQuery(`"wind turbine blade" lightning`), `ta="wind turbine blade" and ta=lightning`);
    assert.equal(patentQuery("What is the fatigue of welded joints?"), "ta=fatigue and ta=welded and ta=joints");
    // CQL's own characters can't change the query.
    assert.equal(patentQuery("rectifier) or (ta=x"), `ta=rectifier and ta="ta x"`);
    assert.equal(patentQuery("the of a"), undefined);
  });

  it("gets a token with the consumer key and secret, and searches EP and WO first", async () => {
    const fetchImpl = fakeOps([[/search\/biblio\?q=.*pn=EP or pn=WO/, EP_WO]]);
    const patents = createPatents(CREDENTIALS, fetchImpl);
    const hits = await patents.search(`"wind turbine blade" lightning`);
    const [tokenCall, searchCall] = fetchImpl.calls;
    assert.equal(tokenCall!.method, "POST");
    assert.equal(tokenCall!.headers!.Authorization, `Basic ${btoa("my-key:my-secret")}`);
    assert.equal(tokenCall!.body, "grant_type=client_credentials");
    assert.equal(searchCall!.headers!.Authorization, "Bearer tok-1");
    assert.match(decodeURIComponent(searchCall!.url.replace(/\+/g, " ")), /q=ta="wind turbine blade" and ta=lightning and \(pn=EP or pn=WO\)&Range=1-10/);
    // Five EP and WO results: no second search.
    assert.equal(fetchImpl.calls.length, 2);
    assert.deepEqual(hits.map((h) => h.id), ["patents:WO2026130641A1", "patents:WO2026130643A1", "patents:EP4756217A1", "patents:WO2026012560A1", "patents:EP4585800A1"]);
    assert.equal(hits[0]!.title, "A WIND TURBINE BLADE (WO2026130641A1, VESTAS WIND SYSTEMS A/S, 2026)");
  });

  it("fills a search from all offices, marking what can be read only as an abstract", async () => {
    const fetchImpl = fakeOps([
      [/pn=EP or pn=WO/, NOT_FOUND, 404],
      [/search\/biblio/, ALL],
    ]);
    const hits = await createPatents(CREDENTIALS, fetchImpl).search(`"wind turbine blade" lightning`);
    assert.equal(hits.length, 5);
    assert.equal(hits[0]!.id, "patents:CN122709874A");
    assert.match(hits[0]!.title, /\[abstract only\]$/);
    assert.doesNotMatch(hits.find((h) => h.id === "patents:WO2026130641A1")!.title, /abstract only/);
  });

  it("reads a WO publication's claims and description, and another office's abstract only", async () => {
    const fetchImpl = fakeOps([
      [/pn=EP or pn=WO/, EP_WO],
      [/WO\.2026130641\.A1\/claims/, CLAIMS],
      [/WO\.2026130641\.A1\/description/, DESCRIPTION],
      [/search\/biblio/, ALL],
    ]);
    const patents = createPatents(CREDENTIALS, fetchImpl);
    await patents.search("wind turbine blade lightning");
    const wo = await patents.fetch("patents:WO2026130641A1");
    assert.equal(wo.title, "A WIND TURBINE BLADE (WO2026130641A1)");
    assert.equal(wo.url, "https://worldwide.espacenet.com/patent/search?q=pn%3DWO2026130641A1");
    assert.match(wo.text, /^A WIND TURBINE BLADE\n\nWO2026130641A1 Applicant: VESTAS WIND SYSTEMS A\/S\. Inventors: ARNAUD, Joao Andre Guerreiro;/);
    assert.match(wo.text, /\n\nClaims:\n.*1\. A wind turbine blade/s);
    assert.match(wo.text, /\n\nDescription:\nA Wind Turbine Blade/);
    assert.deepEqual(wo.work, { authors: readPublications(EP_WO)[0]!.inventors, year: 2026, patent: { number: "WO2026130641A1", applicant: "VESTAS WIND SYSTEMS A/S" } });

    const all = createPatents(CREDENTIALS, fakeOps([[/pn=EP or pn=WO/, NOT_FOUND, 404], [/search\/biblio/, ALL]]));
    await all.search("wind turbine blade lightning");
    const cn = await all.fetch("patents:CN122709874A");
    assert.match(cn.text, /Abstract: /);
    assert.match(cn.text, /OPS gives claims and descriptions for European and international publications only, so only this one's abstract was read\.\)$/);
  });

  it("asks for a new token when one expires or OPS no longer accepts it", async () => {
    let time = 0;
    let tokens = 0;
    let first = true;
    const routes: Route[] = [[/search\/biblio/, () => EP_WO]];
    const base = fakeOps(routes);
    const fetchImpl = (async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
      if (url.endsWith("/auth/accesstoken")) tokens++;
      // The first search with the second token is refused once, as OPS does for an invalidated token.
      if (!url.endsWith("/auth/accesstoken") && tokens === 2 && first) {
        first = false;
        return { ok: false, status: 400, json: async () => ({}), text: async () => "<fault/>" };
      }
      return base(url, init);
    }) as FetchLike;
    const patents = createPatents(CREDENTIALS, fetchImpl, () => time);
    await patents.search("wind turbine blade");
    await patents.search("wind turbine blade");
    assert.equal(tokens, 1, "a token is kept until it expires");
    time = 20 * 60 * 1000;
    await patents.search("wind turbine blade");
    assert.equal(tokens, 3, "an expired token is replaced, and a refused one replaced once more");
  });

  it("says what to do when the key is refused, or the fair-use limit is reached", async () => {
    const refused = (async (url: string) =>
      url.endsWith("/auth/accesstoken")
        ? { ok: false, status: 403, json: async () => ({}), text: async () => "<error><message>Developer account is blocked</message></error>" }
        : { ok: true, status: 200, json: async () => ({}), text: async () => EP_WO }) as FetchLike;
    await assert.rejects(createPatents(CREDENTIALS, refused).search("rectifier"), /did not accept the consumer key and secret \(HTTP 403\)\. Check them in the EPO developer portal/);
    const limited = fakeOps([[/search\/biblio/, "<fault/>", 403]]);
    await assert.rejects(createPatents(CREDENTIALS, limited).search("rectifier"), /fair-use limit for your key may be used up/);
    await assert.rejects(createPatents(CREDENTIALS, limited).fetch("patents:not-a-number"), /not a patent publication number/);
  });

  it("exports a cited patent as BibTeX with its number", () => {
    const answer = {
      id: "a",
      question: "q",
      askedAt: "2026-11-18T00:00:00Z",
      model: "m",
      status: "verified",
      evidence: [{ docId: "patents:WO2026130641A1#2", quote: "x", verified: true }],
      citations: {
        "patents:WO2026130641A1#2": {
          title: "A WIND TURBINE BLADE (WO2026130641A1)",
          url: "https://worldwide.espacenet.com/patent/search?q=pn%3DWO2026130641A1",
          source: "EPO patents",
          retrievedAt: "2026-11-18T10:00:00Z",
          work: { authors: ["ARNAUD, Joao Andre Guerreiro"], year: 2026, patent: { number: "WO2026130641A1", applicant: "VESTAS WIND SYSTEMS A/S" } },
        },
      },
      titles: {},
      sourceErrors: [],
      steps: [],
    } as unknown as SavedAnswer;
    assert.equal(
      answerToBibtex(answer),
      [
        "@misc{patent_WO2026130641A1,",
        "  title = {A WIND TURBINE BLADE},",
        "  author = {ARNAUD, Joao Andre Guerreiro},",
        "  year = {2026},",
        "  howpublished = {Patent WO2026130641A1, VESTAS WIND SYSTEMS A/S},",
        "  url = {https://worldwide.espacenet.com/patent/search?q=pn%3DWO2026130641A1},",
        "  note = {Retrieved from EPO patents on 2026-11-18}",
        "}",
        "",
      ].join("\n"),
    );
  });
});
