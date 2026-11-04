// A small XML reader for the parts of Office and OpenDocument files: it walks elements and
// character data without building a tree, and gives each name a fixed prefix by its namespace,
// so "w:t" means WordprocessingML's text element whatever prefix the file declared.
//
// It runs the same in browsers and Node (Node has no DOMParser, and the tests run in Node). It
// never reads a DTD and expands only the predefined and numeric entities, so a file cannot make
// it fetch anything or expand into a huge string (XXE, "billion laughs").

/** Namespaces this app reads, by URI, and the prefix their names get. Strict OOXML has its own URIs. */
const NAMESPACES: Record<string, string> = {
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
  "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
  "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
  "http://purl.oclc.org/ooxml/drawingml/main": "a",
  "http://schemas.openxmlformats.org/presentationml/2006/main": "p",
  "http://purl.oclc.org/ooxml/presentationml/main": "p",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
  "http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
  "http://schemas.openxmlformats.org/package/2006/relationships": "rel",
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main": "x",
  "http://purl.oclc.org/ooxml/spreadsheetml/main": "x",
  "urn:oasis:names:tc:opendocument:xmlns:office:1.0": "office",
  "urn:oasis:names:tc:opendocument:xmlns:text:1.0": "text",
  "urn:oasis:names:tc:opendocument:xmlns:table:1.0": "table",
  "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0": "draw",
  "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0": "presentation",
  "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0": "svg",
  "urn:oasis:names:tc:opendocument:xmlns:style:1.0": "style",
  "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0": "manifest",
};

export interface XmlHandler {
  /**
   * An element starts. Returning "skip" passes over everything inside it; its close is not reported.
   * `attr` looks up an attribute by its fixed-prefix name, e.g. attr("r:id").
   */
  open?(name: string, attr: (name: string) => string | undefined, selfClosing: boolean): "skip" | void;
  close?(name: string): void;
  /** Character data, with entities decoded. */
  text?(text: string): void;
}

// A tag, with attribute values that may hold ">"; or a comment, CDATA, processing instruction,
// document type declaration (with any internal subset, which is passed over unread) or other
// declaration; or character data.
const TOKEN =
  /<(\/?)([A-Za-z_][^\s/>]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>|<![^>]*>|([^<]+)/g;
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return PREDEFINED[entity] ?? match;
    const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** Walks an XML document, calling the handler for each element and run of character data. */
export function walkXml(xml: string, handler: XmlHandler): void {
  // Namespace declarations in scope: one map per open element that declared any.
  const scopes: Array<Map<string, string> | undefined> = [];
  const lookup = (prefix: string): string | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const uri = scopes[i]?.get(prefix);
      if (uri !== undefined) return uri;
    }
    return undefined;
  };
  const resolve = (qualified: string, isAttribute: boolean): string => {
    const colon = qualified.indexOf(":");
    // Unprefixed attributes have no namespace; unprefixed elements take the default one.
    if (colon < 0 && isAttribute) return qualified;
    const prefix = colon < 0 ? "" : qualified.slice(0, colon);
    const local = colon < 0 ? qualified : qualified.slice(colon + 1);
    const uri = lookup(prefix);
    const fixed = uri === undefined ? undefined : NAMESPACES[uri];
    return fixed ? `${fixed}:${local}` : qualified;
  };

  let skipping = 0;
  TOKEN.lastIndex = 0;
  for (let match; (match = TOKEN.exec(xml)); ) {
    const [, slash, rawName, rawAttributes, selfClose, cdata, chars] = match;
    if (rawName === undefined) {
      if (skipping) continue;
      if (chars !== undefined) handler.text?.(decodeEntities(chars));
      else if (cdata !== undefined) handler.text?.(cdata);
      continue;
    }
    if (slash) {
      const name = resolve(rawName, false);
      scopes.pop();
      if (skipping) skipping--;
      else handler.close?.(name);
      continue;
    }
    if (skipping) {
      if (!selfClose) {
        skipping++;
        scopes.push(undefined);
      }
      continue;
    }
    let declared: Map<string, string> | undefined;
    const attributes: Array<[string, string]> = [];
    if (rawAttributes) {
      for (const [, key, double, single] of rawAttributes.matchAll(ATTRIBUTE)) {
        const value = decodeEntities(double ?? single ?? "");
        if (key === "xmlns") (declared ??= new Map()).set("", value);
        else if (key!.startsWith("xmlns:")) (declared ??= new Map()).set(key!.slice(6), value);
        else attributes.push([key!, value]);
      }
    }
    scopes.push(declared);
    const name = resolve(rawName, false);
    const attr = (wanted: string) => attributes.find(([key]) => resolve(key, true) === wanted)?.[1];
    const result = handler.open?.(name, attr, !!selfClose);
    if (selfClose) scopes.pop();
    else if (result === "skip") skipping = 1;
  }
}
