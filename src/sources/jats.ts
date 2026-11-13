// A JATS article (the XML that PubMed Central and Europe PMC publish full texts in) as Markdown: its
// title, authors, journal, licence, abstract, sections, tables (one Markdown row per table row), figure
// captions and references. Nothing is reworded. This is eval/clinical/source/jats2md.py in TypeScript,
// and it gives the clinical suite's documents (eval/clinical/docs) from the same XML, byte for byte
// (tests/europepmc.test.ts), so what the models were measured on is what Europe PMC gives the app.
//
// The XML is parsed here, not with DOMParser, so the same code runs in the browser and in Node's tests.
// JATS needs little of XML: elements, attributes, text, CDATA and character references.

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref] ?? whole;
  });
}

/** Parses an XML document into its root element. Throws on markup that does not close. */
export function parseXml(source: string): XmlElement {
  // Line ends are normalized, as an XML parser does.
  const xml = source.replace(/\r\n?/g, "\n");
  const root: XmlElement = { tag: "#document", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let at = 0;
  const fail = (why: string) => {
    throw new Error(`Not well-formed XML: ${why} at character ${at}.`);
  };
  while (at < xml.length) {
    const open = xml.indexOf("<", at);
    if (open < 0) {
      stack.at(-1)!.children.push(decode(xml.slice(at)));
      break;
    }
    if (open > at) stack.at(-1)!.children.push(decode(xml.slice(at, open)));
    at = open;
    if (xml.startsWith("<!--", at)) {
      const end = xml.indexOf("-->", at);
      if (end < 0) fail("an unclosed comment");
      at = end + 3;
    } else if (xml.startsWith("<![CDATA[", at)) {
      const end = xml.indexOf("]]>", at);
      if (end < 0) fail("an unclosed CDATA section");
      stack.at(-1)!.children.push(xml.slice(at + 9, end));
      at = end + 3;
    } else if (xml.startsWith("<?", at)) {
      const end = xml.indexOf("?>", at);
      if (end < 0) fail("an unclosed processing instruction");
      at = end + 2;
    } else if (xml.startsWith("<!", at)) {
      // A DOCTYPE, which may hold an internal subset in brackets.
      let depth = 0;
      let i = at + 2;
      for (; i < xml.length; i++) {
        if (xml[i] === "[") depth++;
        else if (xml[i] === "]") depth--;
        else if (xml[i] === ">" && depth <= 0) break;
      }
      at = i + 1;
    } else if (xml[at + 1] === "/") {
      const end = xml.indexOf(">", at);
      if (end < 0) fail("an unclosed end tag");
      const tag = xml.slice(at + 2, end).trim();
      const element = stack.pop();
      if (!element || element === root || element.tag !== tag) fail(`</${tag}> without its start tag`);
      at = end + 1;
    } else {
      const match = /^<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(xml.slice(at, at + 4096));
      if (!match) fail("a malformed start tag");
      const attrs: Record<string, string> = {};
      for (const [, name, double, single] of match![2]!.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[name!] = decode(double ?? single ?? "");
      const element: XmlElement = { tag: match![1]!, attrs, children: [] };
      stack.at(-1)!.children.push(element);
      if (!match![3]) stack.push(element);
      at += match![0].length;
    }
  }
  if (stack.length > 1) throw new Error(`Not well-formed XML: <${stack.at(-1)!.tag}> is not closed.`);
  const element = root.children.find((c): c is XmlElement => typeof c !== "string");
  if (!element) throw new Error("Not well-formed XML: no root element.");
  return element;
}

const elements = (el: XmlElement) => el.children.filter((c): c is XmlElement => typeof c !== "string");

/** The first direct child with this tag. */
const child = (el: XmlElement | undefined, tag: string) => (el ? elements(el).find((c) => c.tag === tag) : undefined);

/** The element and all its descendants, in document order (ElementTree's iter). */
function* all(el: XmlElement): Generator<XmlElement> {
  yield el;
  for (const c of elements(el)) yield* all(c);
}

/** The first descendant (not the element itself) that matches. */
function descendant(el: XmlElement | undefined, match: (e: XmlElement) => boolean): XmlElement | undefined {
  if (!el) return undefined;
  for (const e of all(el)) if (e !== el && match(e)) return e;
  return undefined;
}

/** The text of an element, inline markup flattened; a citation is written in brackets. */
function text(el: XmlElement | undefined): string {
  if (!el) return "";
  const parts: string[] = [];
  for (const c of el.children) {
    if (typeof c === "string") parts.push(c);
    else if (c.tag === "xref" && c.attrs["ref-type"] === "bibr") {
      // A citation in brackets in the source ("[1–3]") keeps them; one without (The Lancet's
      // superscripts) gets its own, so its number does not join the sentence's last word.
      const before = parts.join("");
      const inside = count(before, "[") > count(before, "]");
      parts.push(inside ? text(c) : `[${text(c)}]`);
    } else if (!["table-wrap", "fig", "list", "disp-formula"].includes(c.tag)) parts.push(text(c));
  }
  return parts.join("");
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

// Python's \s and strip(), which the clinical documents were made with: JavaScript's \s and trim() also
// count U+FEFF, and not U+001C to U+001F, which could change a document's text.
const SPACE = "[\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const SPACES = new RegExp(`${SPACE}+`, "g");
const ENDS = new RegExp(`^${SPACE}+|${SPACE}+$`, "g");
const clean = (s: string) => s.replace(SPACES, " ").replace(ENDS, "");

function table(wrap: XmlElement): string[] {
  const lines = [`**${clean(text(child(wrap, "label")))}** ${clean(text(child(wrap, "caption")))}`.trim(), ""];
  for (const row of all(wrap)) {
    if (row.tag !== "tr") continue;
    const cells = elements(row)
      .filter((c) => c.tag === "td" || c.tag === "th")
      .map((c) => clean(text(c)));
    if (cells.some(Boolean)) lines.push(`| ${cells.join(" | ")} |`);
  }
  const foot = child(wrap, "table-wrap-foot");
  if (foot) lines.push("", clean(text(foot)));
  return [...lines, ""];
}

const listLines = (el: XmlElement) => [...[...all(el)].filter((e) => e.tag === "list-item").map((item) => `- ${clean(text(item))}`), ""];

function blocks(el: XmlElement, depth: number): string[] {
  const out: string[] = [];
  for (const c of elements(el)) {
    if (c.tag === "title") out.push(`${"#".repeat(Math.min(depth, 6))} ${clean(text(c))}`, "");
    else if (c.tag === "sec") out.push(...blocks(c, depth + 1));
    else if (c.tag === "p") {
      const para = clean(text(c));
      if (para) out.push(para, "");
      for (const nested of elements(c)) {
        if (nested.tag === "table-wrap") out.push(...table(nested));
        else if (nested.tag === "list") out.push(...listLines(nested));
      }
    } else if (c.tag === "list") out.push(...listLines(c));
    else if (c.tag === "table-wrap") out.push(...table(c));
    else if (c.tag === "fig") out.push(`*${clean(text(child(c, "label")))}: ${clean(text(child(c, "caption")))}*`, "");
    else if (c.tag === "boxed-text" || c.tag === "abstract") out.push(...blocks(c, depth));
  }
  return out;
}

/** What a reference needs, from the article's own metadata. */
export interface JatsInfo {
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi: string;
  pmcid: string;
}

export function jatsInfo(root: XmlElement): JatsInfo {
  const meta = descendant(root, (e) => e.tag === "article-meta");
  const authors: string[] = [];
  for (const group of meta ? elements(meta).filter((e) => e.tag === "contrib-group") : []) {
    for (const contrib of elements(group).filter((e) => e.tag === "contrib")) {
      if ((contrib.attrs["contrib-type"] ?? "author") !== "author") continue;
      const name = child(contrib, "name");
      if (name) authors.push(clean(`${text(child(name, "given-names"))} ${text(child(name, "surname"))}`));
      else {
        // Its members are listed on their own; only the collaboration's own name is kept.
        const collab = child(contrib, "collab");
        if (collab) authors.push(clean(typeof collab.children[0] === "string" ? collab.children[0] : ""));
      }
    }
  }
  const pubDate = descendant(meta, (e) => e.tag === "pub-date" && Boolean(child(e, "year")));
  const articleId = (type: string) => clean(text(descendant(meta, (e) => e.tag === "article-id" && e.attrs["pub-id-type"] === type)));
  return {
    title: clean(text(descendant(meta, (e) => e.tag === "article-title"))),
    authors,
    journal: clean(text(descendant(root, (e) => e.tag === "journal-title"))),
    year: clean(text(child(pubDate, "year"))),
    doi: articleId("doi"),
    pmcid: articleId("pmcid"),
  };
}

/** A JATS article as Markdown, as the clinical suite's documents are; `otherId` names an article without a PMCID, such as a preprint. */
export function jatsToMarkdown(root: XmlElement, otherId?: string): string {
  const info = jatsInfo(root);
  const meta = descendant(root, (e) => e.tag === "article-meta");
  const permissions = descendant(meta, (e) => e.tag === "permissions");
  const licence = permissions
    ? [...all(permissions)]
        .filter((e) => e.tag === "copyright-statement" || e.tag === "license-p")
        .map((e) => clean(text(e)))
        .join(" ")
    : "";
  const id = info.pmcid || otherId;
  const lines = [`# ${info.title}`, "", `${info.authors.join(", ")}.`, "", `${info.journal} (${info.year}). DOI: ${info.doi}.${id ? ` ${id}.` : ""}`, "", licence, ""];
  for (const abstract of meta ? elements(meta).filter((e) => e.tag === "abstract") : []) {
    if (["graphical", "teaser", "toc"].includes(abstract.attrs["abstract-type"] ?? "")) continue;
    lines.push(`## ${clean(text(child(abstract, "title"))) || "Abstract"}`, "");
    lines.push(...blocks({ tag: "x", attrs: {}, children: elements(abstract).filter((e) => e.tag !== "title") }, 2));
  }
  const body = child(root, "body");
  if (body) lines.push(...blocks(body, 1));
  const back = child(root, "back");
  for (const part of back ? elements(back) : []) {
    if (part.tag === "ref-list") {
      lines.push("## References", "");
      let n = 0;
      for (const ref of all(part)) {
        if (ref.tag !== "ref") continue;
        n++;
        const label = clean(text(child(ref, "label"))) || String(n);
        lines.push(`${label}. ${clean(text(child(ref, "mixed-citation") ?? child(ref, "element-citation")))}`);
      }
      lines.push("");
    } else if (["ack", "sec", "notes", "fn-group"].includes(part.tag)) lines.push(...blocks(part, 1));
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
