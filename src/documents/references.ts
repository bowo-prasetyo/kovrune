// A paper's reference details for the user's own documents: from a reference manager's export (BibTeX
// or RIS, as Zotero, Mendeley, EndNote and JabRef write them) or from a DOI printed in the document.
//
// A researcher's licensed PDFs (from IEEE Xplore, ScienceDirect, a library) are added as documents, and
// without their details an answer cites them by file name only. An export added with them (or later)
// gives each file its title, authors, year, venue and DOI, matched by the file the export links to, by
// the DOI the document prints, or by the title on its first page (eval/coverage/README.md: about 60% of
// what engineering reviews cite needs a library).

/** A document's reference details, and where they came from. */
export interface DocumentWork {
  title?: string;
  authors: string[];
  year?: number;
  /** Without the "https://doi.org/" prefix. */
  doi?: string;
  /** The journal, conference or publisher. */
  venue?: string;
  /** "export": a reference manager's export; "text": a DOI the document prints; "openalex": looked up by that DOI. */
  from: "export" | "text" | "openalex";
  /** The export's file name, for details from an export. */
  source?: string;
}

/** One entry of a reference export. */
export interface ReferenceEntry {
  title?: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  /** Names of the files the entry links to, lowercased, without folders. */
  files: string[];
}

/** File names that are reference exports, read for their entries rather than added as documents. */
export const REFERENCE_EXTENSIONS = [".bib", ".ris"];

export function isReferenceFile(name: string): boolean {
  const lower = name.toLowerCase();
  return REFERENCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The entries of a BibTeX or RIS export, by its file name. */
export function parseReferences(fileName: string, text: string): ReferenceEntry[] {
  return fileName.toLowerCase().endsWith(".ris") ? parseRis(text) : parseBibtex(text);
}

/** A DOI as cited: lowercase prefix, no "https://doi.org/" or "doi:", no trailing punctuation. */
export function cleanDoi(value: string): string | undefined {
  const match = value.trim().match(/10\.\d{4,9}\/\S+/);
  if (!match) return undefined;
  const doi = match[0].replace(/[.,;:)\]}>"']+$/, "");
  // A DOI is matched without regard to case (DOIs are case-insensitive).
  return doi.length > 8 ? doi : undefined;
}

const DOI_IN_TEXT = /\b(?:doi\s*[:.]?\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s"<>]+)/gi;

/**
 * The document's own DOI, from its first pages: the first DOI printed there, where a paper's header or
 * footer gives its own. Later pages are not searched, since their DOIs are mostly the papers it cites.
 */
export function doiInText(text: string, pageStarts?: number[]): string | undefined {
  const end = pageStarts && pageStarts.length > 2 ? pageStarts[2] : 8000;
  for (const match of text.slice(0, end).matchAll(DOI_IN_TEXT)) {
    const doi = cleanDoi(match[1]!);
    if (doi) return doi;
  }
  return undefined;
}

// --- BibTeX -----------------------------------------------------------------------------------------

/** LaTeX accents and escapes as they appear in exports, turned into the characters they stand for. */
const ACCENTS: Record<string, string> = { '"': "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", "=": "̄", ".": "̇", c: "̧", v: "̌", u: "̆", H: "̋", k: "̨" };

export function latexToText(value: string): string {
  return value
    .replace(/\\([`'^"~=.])\s*\{?\\?([A-Za-z])\}?/g, (_, accent: string, letter: string) => (letter + ACCENTS[accent]).normalize("NFC"))
    .replace(/\\([cvuHk])\s*\{\\?([A-Za-z])\}/g, (_, accent: string, letter: string) => (letter + ACCENTS[accent]).normalize("NFC"))
    .replace(/\\ss\b\s?/g, "ß")
    .replace(/\\(?:o|O|l|L|ae|AE|oe|OE|aa|AA)\b\s?/g, (m) => ({ o: "ø", O: "Ø", l: "ł", L: "Ł", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å" })[m.trim().slice(1)] ?? m)
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\textendash\b\s?|--/g, "–")
    .replace(/\\[a-zA-Z]+\s*/g, "")
    .replace(/[{}]/g, "")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads one braced or quoted value, or a bare word, from `text` at `i`; returns it and where it ends. */
function readValue(text: string, i: number): [string, number] {
  while (/\s/.test(text[i] ?? "")) i++;
  const open = text[i];
  if (open === "{" || open === '"') {
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === "\\") {
        j++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (open === "{" && depth === 0) break;
      if (open === '"' && c === '"' && j > i && depth === 0) break;
    }
    return [text.slice(i + 1, j), j + 1];
  }
  const m = /^[^,}\s#]+/.exec(text.slice(i));
  return [m?.[0] ?? "", i + (m?.[0].length ?? 0)];
}

/** The fields of each entry, lowercased field names to raw values (with "#" concatenation). */
export function bibtexFields(text: string): Array<Record<string, string>> {
  const entries: Array<Record<string, string>> = [];
  const start = /@(\w+)\s*([{(])/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(text))) {
    const type = match[1]!.toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") continue;
    let i = match.index + match[0].length;
    // The citation key, up to the first comma.
    const comma = text.indexOf(",", i);
    if (comma < 0) break;
    i = comma + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      while (/[\s,]/.test(text[i] ?? "")) i++;
      if (i >= text.length || text[i] === "}" || text[i] === ")") break;
      const name = /^[\w:.-]+/.exec(text.slice(i))?.[0];
      if (!name) break;
      i += name.length;
      while (/\s/.test(text[i] ?? "")) i++;
      if (text[i] !== "=") break;
      i++;
      let value = "";
      for (;;) {
        const [part, next] = readValue(text, i);
        value += part;
        i = next;
        while (/\s/.test(text[i] ?? "")) i++;
        if (text[i] !== "#") break;
        i++;
      }
      fields[name.toLowerCase()] = value;
    }
    entries.push(fields);
    start.lastIndex = i;
  }
  return entries;
}

/** Names of document files in a BibTeX `file` field or a RIS link, as Zotero, Mendeley and JabRef write them. */
export function linkedFiles(value: string): string[] {
  const names = new Set<string>();
  // Zotero: "Title.pdf:files/12/Title.pdf:application/pdf"; Mendeley: ":C\:/Users/…/x.pdf:pdf"; JabRef: ":x.pdf:PDF".
  for (const part of value.replace(/\\:/g, "\u0000").split(/[;:]/)) {
    const path = part.replace(/\u0000/g, ":").trim();
    if (!/\.(pdf|docx|odt|pptx|odp|xlsx|ods|csv|tsv|txt|md|html?)$/i.test(path)) continue;
    const name = path.split(/[\\/]/).pop()!;
    try {
      names.add(decodeURIComponent(name).toLowerCase());
    } catch {
      names.add(name.toLowerCase());
    }
  }
  return [...names];
}

/** "Smith, John and Doe, Jane" or "John Smith and Jane Doe" as display names, family name last. */
export function bibtexAuthors(value: string): string[] {
  return latexToText(value)
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== "others")
    .map((name) => {
      const [family, given] = name.split(/\s*,\s*/, 2);
      return given ? `${given} ${family}` : name;
    });
}

export function parseBibtex(text: string): ReferenceEntry[] {
  return bibtexFields(text).map((f) => {
    const year = Number((f.year ?? f.date ?? "").match(/\d{4}/)?.[0]);
    const venue = f.journal ?? f.journaltitle ?? f.booktitle ?? f.publisher ?? f.institution ?? f.school;
    const doi = f.doi ? cleanDoi(f.doi) : f.url ? cleanDoi(f.url) : undefined;
    return {
      ...(f.title ? { title: latexToText(f.title) } : {}),
      authors: f.author ? bibtexAuthors(f.author) : f.editor ? bibtexAuthors(f.editor) : [],
      ...(year ? { year } : {}),
      ...(doi ? { doi } : {}),
      ...(venue ? { venue: latexToText(venue) } : {}),
      files: linkedFiles([f.file, f.pdf, f.localfile].filter(Boolean).join(";")),
    };
  });
}

// --- RIS --------------------------------------------------------------------------------------------

export function parseRis(text: string): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  let current: Record<string, string[]> | undefined;
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/.exec(line);
    if (!m) continue;
    const [, tag, value] = m as unknown as [string, string, string];
    if (tag === "TY") current = {};
    if (!current) continue;
    if (tag === "ER") {
      entries.push(risEntry(current));
      current = undefined;
      continue;
    }
    (current[tag] ??= []).push(value.trim());
  }
  if (current) entries.push(risEntry(current));
  return entries;
}

function risEntry(tags: Record<string, string[]>): ReferenceEntry {
  const first = (...names: string[]) => names.map((n) => tags[n]?.[0]).find(Boolean);
  const year = Number(first("PY", "Y1", "DA")?.match(/\d{4}/)?.[0]);
  const doi = first("DO") ? cleanDoi(first("DO")!) : undefined;
  const title = first("TI", "T1");
  const venue = first("T2", "JO", "JF", "JA", "BT", "PB");
  const authors = [...(tags.AU ?? []), ...(tags.A1 ?? [])].map((name) => {
    const [family, given] = name.split(/\s*,\s*/, 2);
    return given ? `${given} ${family}` : name;
  });
  return {
    ...(title ? { title } : {}),
    authors,
    ...(year ? { year } : {}),
    ...(doi ? { doi } : {}),
    ...(venue ? { venue } : {}),
    files: linkedFiles([...(tags.L1 ?? []), ...(tags.L4 ?? []), ...(tags.UR ?? [])].join(";")),
  };
}

// --- Matching ---------------------------------------------------------------------------------------

const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Titles shorter than this are not matched by their words alone: "Introduction" would match many papers. */
const MIN_TITLE_CHARS = 25;

/** How an entry was matched to a document. */
export type MatchedBy = "file" | "doi" | "title";

/**
 * The export entry for a document: the entry that links to its file, else the one with the DOI the
 * document prints, else the one whose title (25 characters or more) is on its first pages.
 */
export function matchReference(
  doc: { fileName: string; text: string; pageStarts?: number[] },
  entries: ReferenceEntry[],
): { entry: ReferenceEntry; by: MatchedBy } | undefined {
  const name = doc.fileName.split(/[\\/]/).pop()!.toLowerCase();
  const byFile = entries.find((e) => e.files.includes(name));
  if (byFile) return { entry: byFile, by: "file" };
  const doi = doiInText(doc.text, doc.pageStarts)?.toLowerCase();
  const byDoi = doi && entries.find((e) => e.doi?.toLowerCase() === doi);
  if (byDoi) return { entry: byDoi, by: "doi" };
  const head = words(doc.text.slice(0, doc.pageStarts && doc.pageStarts.length > 1 ? doc.pageStarts[1] : 6000));
  const byTitle = entries.find((e) => e.title && e.title.length >= MIN_TITLE_CHARS && head.includes(words(e.title)));
  return byTitle ? { entry: byTitle, by: "title" } : undefined;
}

/** A document's details from an export entry. */
export function workFromEntry(entry: ReferenceEntry, source: string): DocumentWork {
  return {
    ...(entry.title ? { title: entry.title } : {}),
    authors: entry.authors,
    ...(entry.year ? { year: entry.year } : {}),
    ...(entry.doi ? { doi: entry.doi } : {}),
    ...(entry.venue ? { venue: entry.venue } : {}),
    from: "export",
    source,
  };
}

/** "Smith, Doe and Lee (2020)", "Smith et al. (2020)": the short form shown beside a document. */
export function describeWork(work: DocumentWork): string {
  const family = (name: string) => name.split(/\s+/).pop()!;
  const names = work.authors.map(family);
  const who = names.length > 3 ? `${names[0]} et al.` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
  return [who, work.year ? `(${work.year})` : ""].filter(Boolean).join(" ");
}

/** A document's reference as a line of text: authors (year). Title. Venue. https://doi.org/… */
export function referenceLine(work: DocumentWork, fallbackTitle: string): string {
  const head = describeWork(work);
  return [head ? `${head}.` : "", `${work.title ?? fallbackTitle}.`, work.venue ? `${work.venue}.` : "", work.doi ? `https://doi.org/${work.doi}` : ""].filter(Boolean).join(" ");
}
