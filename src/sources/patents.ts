// Patents through the EPO's Open Patent Services (OPS), with the user's own key (eval/patents/README.md).
//
// OPS answers requests from web pages, but only with an access token, which it gives for an app's consumer
// key and secret (OAuth client credentials): the user registers an app in the EPO developer portal and
// enters both once. They are kept in this browser and sent only to ops.epo.org.
//
// What a real key showed (18 November 2026): a search on titles and abstracts finds current patents
// from every office, each with an English title and abstract, but newest first, not by relevance, and
// mostly Chinese; claims and descriptions come for European (EP) and international (WO) publications
// only. So a search looks among EP and WO publications first, which can be read in full, and fills the
// rest from all offices; a read gives the claims and description where OPS has them, else the abstract.

import { parseXml, type XmlElement, type XmlNode } from "./jats.ts";
import { snippetOf } from "./openalex.ts";
import { getText, SourceError, type FetchedDocument, type FetchLike, type OpenSource, type RequestOptions, type SourceHit, type WorkInfo } from "./types.ts";

const PREFIX = "patents:";
export const OPS_BASE = "https://ops.epo.org/3.2";
const SEARCH_URL = `${OPS_BASE}/rest-services/published-data/search/biblio`;
const PUBLICATION_URL = `${OPS_BASE}/rest-services/published-data/publication/docdb`;
const TOKEN_URL = `${OPS_BASE}/auth/accesstoken`;
/** Results a search shows. */
export const PATENT_HITS = 5;
/** Search words kept: OPS refuses long queries, and every word must match. */
const MAX_TERMS = 6;
/** Offices whose publications OPS gives claims and descriptions for. */
export const FULL_TEXT_OFFICES = ["EP", "WO"];
/** Seconds before a token's expiry when a new one is asked for. */
const TOKEN_MARGIN_S = 60;

/** A publication number as the model writes it, e.g. "EP4560905A1": office, number, kind. */
const NUMBER = /^([A-Z]{2})(\d+)([A-Z]\d?)$/;

export interface PatentCredentials {
  /** The app's consumer key, from the EPO developer portal (My Apps). */
  key: string;
  /** The app's consumer secret. */
  secret: string;
}

// --- XML ----------------------------------------------------------------------------------------------

const local = (tag: string) => tag.slice(tag.indexOf(":") + 1);

function* elements(el: XmlElement): Generator<XmlElement> {
  for (const child of el.children) {
    if (typeof child === "string") continue;
    yield child;
    yield* elements(child);
  }
}

const find = (el: XmlElement | undefined, name: string, where: (e: XmlElement) => boolean = () => true) =>
  el ? [...elements(el)].filter((e) => local(e.tag) === name && where(e)) : [];

const first = (el: XmlElement | undefined, name: string, where?: (e: XmlElement) => boolean) => find(el, name, where)[0];

function textOf(node: XmlNode | undefined): string {
  if (node === undefined) return "";
  if (typeof node === "string") return node;
  return node.children.map(textOf).join("");
}

const clean = (text: string) => text.replace(/[ \t\r\f\v]+/g, " ").replace(/ *\n */g, "\n").trim();

// --- Bibliographic data -------------------------------------------------------------------------------

/** One publication as a search or a biblio request gives it. */
export interface Publication {
  /** "EP4560905A1" */
  number: string;
  /** "EP.4560905.A1", for OPS's docdb requests. */
  docdb: string;
  country: string;
  familyId?: string;
  title?: string;
  applicants: string[];
  inventors: string[];
  /** "2026-06-25" */
  date?: string;
  abstract?: string;
  /** IPC classes, e.g. "H02M 1/42". */
  classes: string[];
}

/** A party's names: the form the office published ("original") where given, else the EPO's, without its country tag. */
function names(parent: XmlElement | undefined, party: "applicant" | "inventor"): string[] {
  const all = find(parent, party);
  const original = all.filter((e) => e.attrs["data-format"] === "original");
  const chosen = original.length ? original : all.filter((e) => e.attrs["data-format"] === "epodoc");
  return [...new Set(chosen.map((e) => clean(textOf(first(e, "name"))).replace(/\s*\[[A-Z]{2}\]$/, "").replace(/,$/, "")).filter(Boolean))];
}

export function readPublication(doc: XmlElement): Publication {
  const country = doc.attrs.country ?? "";
  const number = `${country}${doc.attrs["doc-number"] ?? ""}${doc.attrs.kind ?? ""}`;
  const titles = find(doc, "invention-title");
  const title = titles.find((t) => t.attrs.lang === "en") ?? titles[0];
  const abstracts = find(doc, "abstract");
  const abstract = abstracts.find((a) => a.attrs.lang === "en") ?? abstracts[0];
  const published = first(doc, "publication-reference");
  const date = textOf(first(first(published, "document-id", (e) => e.attrs["document-id-type"] === "docdb"), "date"));
  return {
    number,
    docdb: `${country}.${doc.attrs["doc-number"] ?? ""}.${doc.attrs.kind ?? ""}`,
    country,
    ...(doc.attrs["family-id"] ? { familyId: doc.attrs["family-id"] } : {}),
    ...(title ? { title: clean(textOf(title)) } : {}),
    applicants: names(first(doc, "applicants"), "applicant"),
    inventors: names(first(doc, "inventors"), "inventor"),
    ...(/^\d{8}$/.test(date) ? { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` } : {}),
    ...(abstract ? { abstract: find(abstract, "p").map((p) => clean(textOf(p))).join("\n\n") || clean(textOf(abstract)) } : {}),
    classes: find(doc, "classification-ipcr").map((c) => clean(textOf(first(c, "text"))).replace(/\s+/g, " ").replace(/^(\w{4}) (\d+)\/ ?(\d+).*$/, "$1 $2/$3")),
  };
}

/** The publications in a search or biblio answer. */
export function readPublications(xml: string): Publication[] {
  return find(parseXml(xml), "exchange-document").map(readPublication);
}

/** A full-text answer's claims, one per paragraph, or its description's paragraphs. */
export function readFullText(xml: string, part: "claims" | "description"): string {
  const root = parseXml(xml);
  if (part === "claims") {
    return find(first(root, "claims"), "claim")
      .map((claim) => find(claim, "claim-text").map((t) => clean(textOf(t))).join("\n"))
      .filter(Boolean)
      .join("\n\n");
  }
  return find(first(root, "description"), "p")
    .map((p) => clean(textOf(p)))
    .filter(Boolean)
    .join("\n\n");
}

// --- Searching --------------------------------------------------------------------------------------

const STOPWORDS = new Set("a an and are as at by for from how in is of on or the to what which with without that this these those does do".split(" "));

/**
 * The CQL for a search in titles and abstracts: every word must appear (`ta=word and ta=…`), a quoted or
 * hyphenated phrase as a phrase. Undefined when the query has no word to search for.
 */
export function patentQuery(query: string, offices?: string[]): string | undefined {
  const terms: string[] = [];
  const rest = query.replace(/"([^"]+)"/g, (_, phrase: string) => {
    terms.push(phrase);
    return " ";
  });
  for (const word of rest.split(/\s+/)) {
    const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!bare || STOPWORDS.has(bare.toLowerCase())) continue;
    terms.push(bare.includes("-") ? bare.replace(/-/g, " ") : bare);
  }
  const kept = terms
    .map((t) => t.replace(/["=()<>\\/]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  if (!kept.length) return undefined;
  const words = kept.map((t) => (t.includes(" ") ? `ta="${t}"` : `ta=${t}`)).join(" and ");
  return offices?.length ? `${words} and (${offices.map((o) => `pn=${o}`).join(" or ")})` : words;
}

/** The ID the model sees for a publication, e.g. "patents:EP4560905A1". */
export const patentDocId = (number: string) => PREFIX + number;

export const espacenetUrl = (number: string) => `https://worldwide.espacenet.com/patent/search?q=pn%3D${number}`;

function hitTitle(p: Publication): string {
  const about = [p.number, p.applicants[0], p.date?.slice(0, 4)].filter(Boolean).join(", ");
  return `${p.title ?? "Untitled"} (${about})`;
}

/** The text of a read: the publication's details, its abstract, and its claims and description where OPS has them. */
export function patentText(p: Publication, claims?: string, description?: string): string {
  const inventors = p.inventors.length ? `Inventors: ${p.inventors.slice(0, 5).join("; ")}${p.inventors.length > 5 ? "; et al." : ""}.` : "";
  const lines = [
    p.title ?? "Untitled",
    [`${p.number}`, p.applicants.length ? `Applicant: ${p.applicants.join("; ")}.` : "", inventors, p.date ? `Published ${p.date}.` : "", p.classes.length ? `IPC: ${p.classes.slice(0, 4).join(", ")}.` : ""]
      .filter(Boolean)
      .join(" "),
    p.abstract ? `Abstract: ${p.abstract}` : "OPS has no abstract for this publication.",
  ];
  if (claims) lines.push(`Claims:\n${claims}`);
  if (description) lines.push(`Description:\n${description}`);
  if (!claims && !description) {
    lines.push(
      FULL_TEXT_OFFICES.includes(p.country)
        ? "(OPS has no claims or description for this publication yet, so only its abstract was read.)"
        : "(OPS gives claims and descriptions for European and international publications only, so only this one's abstract was read.)",
    );
  }
  return lines.join("\n\n");
}

function workOf(p: Publication): WorkInfo {
  const year = Number(p.date?.slice(0, 4));
  return {
    authors: p.inventors,
    ...(year ? { year } : {}),
    patent: { number: p.number, ...(p.applicants[0] ? { applicant: p.applicants[0] } : {}) },
  };
}

// --- The source -------------------------------------------------------------------------------------

const toBase64 = (text: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(text)));

/**
 * Patents as an open source, with the user's OPS key. A search looks among EP and WO publications
 * first (read in full), then all offices for the rest, keeping one publication per patent family.
 */
export function createPatents(credentials: PatentCredentials, fetchImpl: FetchLike = fetch, now: () => number = Date.now): OpenSource {
  let token: { value: string; expires: number } | undefined;
  const found = new Map<string, Publication>();

  async function accessToken(signal?: AbortSignal, fresh = false): Promise<string> {
    if (!fresh && token && token.expires > now()) return token.value;
    let answer: string;
    try {
      answer = await getText(fetchImpl, "EPO OPS", TOKEN_URL, signal, {
        method: "POST",
        headers: { Authorization: `Basic ${toBase64(`${credentials.key}:${credentials.secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
    } catch (error) {
      if (error instanceof SourceError && (error.status === 400 || error.status === 401 || error.status === 403)) {
        throw new SourceError(
          `EPO OPS did not accept the consumer key and secret (HTTP ${error.status}). Check them in the EPO developer portal, under My Apps, and enter them again.`,
          error.status,
        );
      }
      throw error;
    }
    let data: { access_token?: string; expires_in?: string | number };
    try {
      data = JSON.parse(answer);
    } catch {
      throw new SourceError("EPO OPS gave an access token that could not be read.");
    }
    if (!data.access_token) throw new SourceError("EPO OPS gave no access token.");
    const seconds = Number(data.expires_in) || 1200;
    token = { value: data.access_token, expires: now() + Math.max(0, seconds - TOKEN_MARGIN_S) * 1000 };
    return token.value;
  }

  /** A request to OPS with the token, asking once for a new token when OPS says the old one is no longer valid. */
  async function ops(url: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const value = await accessToken(signal, attempt > 0);
      try {
        return await getText(fetchImpl, "EPO OPS", url, signal, { ...options, headers: { Authorization: `Bearer ${value}`, Accept: "application/xml" } });
      } catch (error) {
        if (attempt === 0 && error instanceof SourceError && (error.status === 400 || error.status === 401)) continue;
        if (error instanceof SourceError && error.status === 403) {
          throw new SourceError("EPO OPS refused the request (HTTP 403): its fair-use limit for your key may be used up for now. Try again later.", 403);
        }
        throw error;
      }
    }
  }

  /** The publications a CQL search finds, or none when OPS has no results (it answers those with HTTP 404). */
  async function searchOps(cql: string, signal?: AbortSignal): Promise<Publication[]> {
    try {
      const params = new URLSearchParams({ q: cql, Range: `1-${PATENT_HITS * 2}` });
      return readPublications(await ops(`${SEARCH_URL}?${params}`, signal));
    } catch (error) {
      if (error instanceof SourceError && error.status === 404) return [];
      throw error;
    }
  }

  async function publication(number: string, docdb: string, signal?: AbortSignal): Promise<Publication> {
    const known = found.get(number);
    if (known) return known;
    let xml: string;
    try {
      xml = await ops(`${PUBLICATION_URL}/${docdb}/biblio`, signal);
    } catch (error) {
      if (error instanceof SourceError && error.status === 404) throw new SourceError(`EPO OPS has no publication ${number}.`, 404);
      throw error;
    }
    const p = readPublications(xml).find((x) => x.number === number) ?? readPublications(xml)[0];
    if (!p) throw new SourceError(`EPO OPS has no publication ${number}.`);
    found.set(number, p);
    return p;
  }

  /** Claims or description, or undefined where OPS has none. */
  async function fullText(docdb: string, part: "claims" | "description", signal?: AbortSignal): Promise<string | undefined> {
    try {
      return readFullText(await ops(`${PUBLICATION_URL}/${docdb}/${part}`, signal), part) || undefined;
    } catch (error) {
      if (error instanceof SourceError && error.status === 404) return undefined;
      throw error;
    }
  }

  return {
    name: "patents",
    label: "EPO patents",
    async search(query, signal): Promise<SourceHit[]> {
      const readable = patentQuery(query, FULL_TEXT_OFFICES);
      if (!readable) return [];
      const results = await searchOps(readable, signal);
      if (results.length < PATENT_HITS) results.push(...(await searchOps(patentQuery(query)!, signal)));
      const families = new Set<string>();
      const hits: SourceHit[] = [];
      for (const p of results) {
        const family = p.familyId ?? p.number;
        if (families.has(family) || !NUMBER.test(p.number)) continue;
        families.add(family);
        found.set(p.number, p);
        const readableNote = FULL_TEXT_OFFICES.includes(p.country) ? "" : " [abstract only]";
        hits.push({ id: patentDocId(p.number), title: hitTitle(p) + readableNote, snippet: p.abstract ? snippetOf(p.abstract) : "No abstract." });
        if (hits.length === PATENT_HITS) break;
      }
      return hits;
    },
    async fetch(id, signal): Promise<FetchedDocument> {
      const number = id.slice(PREFIX.length).toUpperCase();
      const parts = NUMBER.exec(number);
      if (!parts) throw new SourceError(`"${id}" is not a patent publication number such as patents:EP4560905A1.`);
      const docdb = `${parts[1]}.${parts[2]}.${parts[3]}`;
      const p = await publication(number, docdb, signal);
      const [claims, description] = FULL_TEXT_OFFICES.includes(p.country)
        ? await Promise.all([fullText(docdb, "claims", signal), fullText(docdb, "description", signal)])
        : [undefined, undefined];
      return {
        id: patentDocId(number),
        title: `${p.title ?? "Untitled"} (${number})`,
        text: patentText(p, claims, description),
        url: espacenetUrl(number),
        retrievedAt: new Date(now()).toISOString(),
        work: workOf(p),
      };
    },
  };
}
