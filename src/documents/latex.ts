// A paper's LaTeX source as the text Kovrune reads (harness 0.81.0): what a PDF's text layer gives,
// without its losses. A PDF loses a table's rows (cells run together or split across lines), turns an
// equation into loose symbols ("u k t = w k t + 1 ."), and joins running headers, footnotes and
// columns into the text; the source has each exactly. arXiv serves most papers' source (arxiv.org/src).
//
// The text is written as the other documents' are, so the rest of Kovrune treats it the same way:
// - "## 3 Method" for a section, "### 3.1 Data" for a subsection, numbered as LaTeX numbers them;
// - a table as "**Table 2** Its caption." then one "| a | b |" line per row (chunk.ts splits a long one
//   between rows, and a part citing it gets a note where it is);
// - a figure as "*Figure 3: Its caption.*" (a part holding it gets a note where it is discussed);
// - a displayed equation as its LaTeX on a line of its own, then its number: "y = Wx + b (1)";
// - \cite as the PDF prints it, "(Liu et al., 2023)" or "[12]", from the .bbl file arXiv requires;
// - \ref as "Table 2", "Section 3" or "(1)", from the labels.
// - a quantity as the PDF prints it, "1.5 meV" for \SI{1.5}{\milli\electronvolt} (siunitx.ts);
// - a chemical formula as the PDF prints it, "CO₂" for \ce{CO2} and "Fe³⁺" for \ch{Fe^3+} (mhchem.ts).
// Inline math stays as written ($O(n^2)$). What can't be read this way is reported as not converted, and
// the PDF is read instead (sources/arxiv.ts).

import { readableFormula } from "./math.ts";
import { mhchemToText } from "./mhchem.ts";
import { siunitxSetup, siunitxToText } from "./siunitx.ts";

/** One LaTeX argument: the text of a {…} group starting at `at` (after spaces), and where it ends. */
function group(text: string, at: number): { body: string; end: number } | undefined {
  let i = at;
  while (text[i] === " " || text[i] === "\n" || text[i] === "\t") i++;
  if (text[i] !== "{") return undefined;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { body: text.slice(i + 1, j), end: j + 1 };
  }
  return undefined;
}

/** An optional […] argument at `at`, skipped. */
function optional(text: string, at: number): { body: string; end: number } | undefined {
  let i = at;
  while (text[i] === " ") i++;
  if (text[i] !== "[") return undefined;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") depth--;
    else if (text[j] === "]" && depth === 0) return { body: text.slice(i + 1, j), end: j + 1 };
  }
  return undefined;
}

/** Replaces each `\name{…}` (with optional […] before the group) by what `replace` makes of its argument. */
function replaceCommand(text: string, names: string, replace: (arg: string, opt: string | undefined) => string, args = 1): string {
  const pattern = new RegExp(String.raw`\\(?:${names})\*?(?![a-zA-Z])`, "g");
  let out = "";
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    let at = m.index + m[0].length;
    const opt = optional(text, at);
    if (opt) at = opt.end;
    const bodies: string[] = [];
    for (let k = 0; k < args; k++) {
      const g = group(text, at);
      if (!g) break;
      bodies.push(g.body);
      at = g.end;
    }
    if (bodies.length < args) continue;
    out += text.slice(last, m.index) + replace(bodies[args - 1]!, opt?.body);
    last = at;
    pattern.lastIndex = at;
  }
  return out + text.slice(last);
}

/** Text with LaTeX comments taken out: "%" to the end of the line, unless escaped. */
export function withoutComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") i++;
        else if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n")
    .replace(/\\begin\{comment\}[\s\S]*?\\end\{comment\}/g, "")
    .replace(/\\iffalse\b[\s\S]*?\\fi\b/g, "");
}

/** The main file of a source: the one with \documentclass and \begin{document}; of several, the largest. */
export function mainFile(files: Map<string, string>): string | undefined {
  const mains = [...files].filter(([name, text]) => /\.(tex|ltx)$/i.test(name) && /\\documentclass/.test(withoutComments(text)) && /\\begin\{document\}/.test(text));
  return mains.sort((a, b) => b[1].length - a[1].length)[0]?.[0];
}

/** The main file with each \input and \include replaced by its file, to a depth of 10. */
function inlined(files: Map<string, string>, name: string, depth = 0): string {
  const text = withoutComments(files.get(name) ?? "");
  if (depth > 10) return text;
  const dir = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
  return text.replace(/\\(?:input|include|subfile)\s*\{([^}]+)\}|\\input\s+([^\s{}\\]+)/g, (_all, braced: string | undefined, bare: string | undefined) => {
    const ref = (braced ?? bare ?? "").trim();
    const found = [ref, `${ref}.tex`, dir + ref, `${dir + ref}.tex`].find((candidate) => files.has(candidate.replace(/^\.\//, "")));
    return found ? `\n${inlined(files, found.replace(/^\.\//, ""), depth + 1)}\n` : "";
  });
}

/** LaTeX's own commands, which the converter reads itself, whatever a style file redefines them as. */
const PROTECTED = new Set(
  "part chapter section subsection subsubsection paragraph subparagraph footnote footnotetext footnotemark thanks maketitle title author and caption captionof label ref eqref pageref autoref cref Cref cite citep citet citealp citeauthor citeyear item emph textbf textit texttt url href includegraphics appendix abstract tableofcontents bibliography bibliographystyle begin end input include newline par centering small footnotesize large Large textsc rule vspace hspace".split(" "),
);

interface Macro {
  args: number;
  /** The first argument's default, for \newcommand{\x}[2][default]{…}. */
  optional?: string;
  body: string;
}

/** The macros a source defines with \newcommand, \renewcommand, \providecommand, \DeclareRobustCommand or \def, taken out of the text. */
function takeMacros(text: string, macros: Map<string, Macro>): string {
  const start = /\\(?:re)?newcommand\*?|\\providecommand\*?|\\DeclareRobustCommand\*?|\\[gex]?def(?![a-zA-Z])/g;
  let out = "";
  let last = 0;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    let at = m.index + m[0].length;
    let name: string | undefined;
    const braced = /^\s*\{\s*\\([a-zA-Z@]+)\s*\}/.exec(text.slice(at));
    const bare = /^\s*\\([a-zA-Z@]+)/.exec(text.slice(at));
    if (braced) (name = braced[1]), (at += braced[0].length);
    else if (bare) (name = bare[1]), (at += bare[0].length);
    if (!name) continue;
    let args = 0;
    let fallback: string | undefined;
    if (m[0].endsWith("def")) {
      const params = /^((?:#\d)*)/.exec(text.slice(at))![1]!;
      args = params.length / 2;
      at += params.length;
    } else {
      const count = optional(text, at);
      if (count && /^\d$/.test(count.body.trim())) {
        args = Number(count.body.trim());
        at = count.end;
        const opt = optional(text, at);
        if (opt) (fallback = opt.body), (at = opt.end);
      }
    }
    const body = group(text, at);
    if (!body) continue;
    // A class or style file's redefinition of LaTeX's own commands (\section's spacing, \footnote's marks)
    // is layout, and internals (with "@") are not text: both are left to the converter's own reading.
    if (!PROTECTED.has(name) && !/@/.test(body.body)) macros.set(name, { args, ...(fallback !== undefined ? { optional: fallback } : {}), body: body.body });
    out += text.slice(last, m.index);
    last = body.end;
    start.lastIndex = body.end;
  }
  return out + text.slice(last);
}

/** The text with the source's own macros expanded, three times over for macros that use macros. */
function expandMacros(text: string, macros: Map<string, Macro>): string {
  if (!macros.size) return text;
  const names = [...macros.keys()].filter((n) => !/@/.test(n)).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const pattern = new RegExp(String.raw`\\(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-zA-Z@])`, "g");
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    let next = "";
    let last = 0;
    pattern.lastIndex = 0;
    for (let m = pattern.exec(out); m; m = pattern.exec(out)) {
      const macro = macros.get(m[1]!)!;
      let at = m.index + m[0].length;
      const args: string[] = [];
      let k = 0;
      if (macro.optional !== undefined) {
        const opt = optional(out, at);
        args.push(opt ? opt.body : macro.optional);
        if (opt) at = opt.end;
        k = 1;
      }
      for (; k < macro.args; k++) {
        const g = group(out, at);
        if (g) {
          args.push(g.body);
          at = g.end;
        } else {
          // An argument may be a single token: \foo x.
          const token = /^\s*(\\[a-zA-Z]+|\S)/.exec(out.slice(at));
          args.push(token ? token[1]! : "");
          at += token ? token[0].length : 0;
        }
      }
      const body = macro.body.replace(/#(\d)/g, (_x, d: string) => args[Number(d) - 1] ?? "");
      // A macro used as a word keeps the space after it ("\method is" → "LongMem is").
      next += out.slice(last, m.index) + body;
      last = at;
      pattern.lastIndex = at;
      changed = true;
    }
    out = next + out.slice(last);
    if (!changed) break;
  }
  return out;
}

/** What the reader is told a \cite points to. */
interface Reference {
  /** "[12]" or, from natbib's label, the authors and year for \citep and \citet. */
  number: number;
  authors?: string;
  year?: string;
  text: string;
}

/** One BibTeX entry: its type, key and fields, the fields' names in lower case. */
export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/**
 * The entries of a .bib file. A field's value is a {…} group, a "…" string or a bare number or
 * @string name; @string abbreviations are expanded, and @comment and @preamble are skipped.
 */
export function readBib(bib: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const strings: Record<string, string> = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };
  const value = (text: string, at: number): { value: string; end: number } | undefined => {
    let i = at;
    while (/\s/.test(text[i] ?? "")) i++;
    let out = "";
    for (;;) {
      if (text[i] === "{") {
        const g = group(text, i);
        if (!g) return undefined;
        (out += g.body), (i = g.end);
      } else if (text[i] === '"') {
        let j = i + 1;
        for (let depth = 0; j < text.length && !(text[j] === '"' && depth === 0); j++) depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0;
        (out += text.slice(i + 1, j)), (i = j + 1);
      } else {
        const bare = /^[\w.:-]+/.exec(text.slice(i));
        if (!bare) return undefined;
        (out += strings[bare[0].toLowerCase()] ?? bare[0]), (i += bare[0].length);
      }
      while (/\s/.test(text[i] ?? "")) i++;
      if (text[i] !== "#") return { value: out, end: i };
      i++;
      while (/\s/.test(text[i] ?? "")) i++;
    }
  };
  for (const m of bib.matchAll(/@\s*(\w+)\s*[{(]/g)) {
    const type = m[1]!.toLowerCase();
    let at = m.index + m[0].length;
    if (type === "comment" || type === "preamble") continue;
    if (type === "string") {
      const name = /^\s*([\w-]+)\s*=/.exec(bib.slice(at));
      const v = name && value(bib, at + name[0].length);
      if (name && v) strings[name[1]!.toLowerCase()] = v.value;
      continue;
    }
    const key = /^\s*([^,\s]+)\s*,/.exec(bib.slice(at));
    if (!key) continue;
    at += key[0].length;
    const fields: Record<string, string> = {};
    for (;;) {
      const name = /^\s*([\w-]+)\s*=/.exec(bib.slice(at));
      if (!name) break;
      const v = value(bib, at + name[0].length);
      if (!v) break;
      fields[name[1]!.toLowerCase()] = v.value.replace(/\s+/g, " ").trim();
      at = v.end;
      const comma = /^\s*,/.exec(bib.slice(at));
      if (!comma) break;
      at += comma[0].length;
    }
    entries.push({ type, key: key[1]!, fields });
  }
  return entries;
}

/** An author list's family names: "Liu, Nelson F. and Kevin Lin" → ["Liu", "Lin"]; "{OpenAI}" stays whole. */
function familyNames(authors: string): string[] {
  return authors
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter((name) => name && name !== "others")
    .map((name) => {
      if (name.includes(",")) return name.split(",")[0]!.trim();
      if (/^\{.*\}$/.test(name)) return name;
      // "Ludwig van Beethoven" → "van Beethoven": lower-case words before the last name are part of it.
      const words = name.split(/\s+/);
      let first = words.length - 1;
      while (first > 0 && /^[a-z]/.test(words[first - 1]!)) first--;
      return words.slice(first).join(" ");
    });
}

/**
 * References from .bib entries, for a source that has no .bbl: arXiv takes a paper without one, and then
 * the PDF's own citations are what BibTeX made of the .bib (2504.20101 cites "[samsi2023words]" otherwise).
 * Only the entries `cited` names are kept, numbered in citation order. Each is cited by its authors and
 * year, "(Samsi et al., 2023)", whatever the paper's style: the PDF's numbers depend on its style's sorting,
 * which only BibTeX can reproduce, and names and a year say more than a number.
 */
export function bibReferences(entries: BibEntry[], cited: string[], inline: (text: string) => string): Map<string, Reference> {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const refs = new Map<string, Reference>();
  for (const key of cited) {
    const entry = byKey.get(key);
    if (!entry || refs.has(key)) continue;
    const f = entry.fields;
    const families = familyNames(f.author ?? f.editor ?? "").map((n) => inline(n).trim());
    const authors = families.length > 2 ? `${families[0]} et al.` : families.join(" and ");
    const year = /\d{4}/.exec(f.year ?? f.date ?? "")?.[0];
    const venue = f.journal ?? f.booktitle ?? f.publisher ?? f.howpublished ?? f.school ?? f.institution;
    // "Samsi, Siddharth" is written "Siddharth Samsi", as a reference list prints it.
    const person = (n: string) => (n.includes(",") ? `${n.slice(n.indexOf(",") + 1).trim()} ${n.slice(0, n.indexOf(",")).trim()}` : n.trim());
    const names = (f.author ?? f.editor ?? "").split(/\s+and\s+/).map((n) => (n.trim() === "others" ? "et al." : inline(person(n)).trim())).filter(Boolean);
    const list = names.join(", ").replace(/, et al\.$/, " et al.");
    const text = [list ? (list.endsWith(".") ? list : `${list}.`) : "", year ? `${year}.` : "", f.title ? `${inline(f.title)}.` : "", venue ? `${inline(venue)}.` : ""]
      .filter(Boolean)
      .join(" ");
    refs.set(key, { number: refs.size + 1, ...(authors ? { authors } : {}), ...(year ? { year } : {}), text: text.replace(/\s+/g, " ").trim() });
  }
  return refs;
}

/** The citation keys a text cites, in order, each once: \cite{a,b}, \citep[p.~3]{c}, \citet*{d}. */
export function citedKeys(text: string): string[] {
  const keys: string[] = [];
  for (const m of text.matchAll(/\\(?:no)?cite[a-zA-Z]*\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)\}/g)) {
    for (const key of m[1]!.split(",").map((k) => k.trim())) if (key && key !== "*" && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** The references of a .bbl file, in order: BibTeX's \bibitem list, or biblatex's \entry list. */
export function readBbl(bbl: string, inline: (text: string) => string): Map<string, Reference> {
  const refs = new Map<string, Reference>();
  const text = withoutComments(bbl);
  if (/\\entry\{/.test(text)) {
    let n = 0;
    for (const m of text.matchAll(/\\entry\{([^}]+)\}\{[^}]*\}\{[^}]*\}([\s\S]*?)\\endentry/g)) {
      const body = m[2]!;
      const field = (name: string) => group(body, (body.indexOf(`\\field{${name}}`) + 1 || -1) + `\\field{${name}}`.length - 1)?.body;
      const families = [...body.matchAll(/family=\{([^}]*)\}/g)].map((f) => f[1]!);
      const title = field("title");
      const year = field("year") ?? field("labelyear");
      const authors = families.length > 2 ? `${families[0]} et al.` : families.join(" and ");
      refs.set(m[1]!, { number: ++n, ...(authors ? { authors } : {}), ...(year ? { year } : {}), text: inline([families.join(", "), year ? `(${year})` : "", title ? `${title}.` : ""].filter(Boolean).join(" ")) });
    }
    return refs;
  }
  const items = text.split(/\\bibitem/).slice(1);
  items.forEach((item, i) => {
    const opt = optional(item, 0);
    const key = group(item, opt ? opt.end : 0);
    if (!key) return;
    const body = item.slice(key.end).replace(/\\end\{thebibliography\}[\s\S]*$/, "").replace(/\\newblock/g, " ");
    // natbib's label: "{Liu et~al.(2023)Liu, Lin, Hewitt}" → "Liu et al." and "2023".
    const label = opt?.body.replace(/^\{|\}$/g, "");
    const natbib = label && /^(.*?)\((\d{4}[a-z]?|n\.d\.)\)/.exec(label);
    refs.set(key.body.trim(), {
      number: i + 1,
      ...(natbib ? { authors: inline(natbib[1]!).trim(), year: natbib[2] } : {}),
      text: inline(body).replace(/\s+/g, " ").trim(),
    });
  });
  return refs;
}

const SECTION_LEVELS: Record<string, number> = { part: 1, chapter: 1, section: 2, subsection: 3, subsubsection: 4 };
const FLOATS = "table\\*?|figure\\*?|wraptable|wrapfigure|algorithm\\*?|SCfigure|sidewaystable|sidewaysfigure";
const NUMBERED_MATH = "equation|align|gather|multline|eqnarray|flalign|alignat";
const MATH_ENVS = `(?:${NUMBERED_MATH}|split|aligned|gathered|cases|displaymath|math)\\*?`;

/** Commands whose argument is kept as text: formatting, and boxes. */
const UNWRAP = "textbf|textit|emph|texttt|textsc|textrm|textsf|textup|textmd|textnormal|underline|uline|mbox|hbox|fbox|text|textsuperscript|textsubscript|mathrm|mathbf|mathit|mathsf|mathtt|boldsymbol|bm|ensuremath|centerline|makebox|framebox|parbox|colorbox|highlight|hl|sout|xspace|ignorespaces|smash|phantom|tnote|scalebox|rotatebox|resizebox|adjustbox|raisebox";
/** Commands dropped with their arguments: layout, labels and things a reader doesn't see as text. */
const DROP = "label|vspace|hspace|vskip|hskip|includegraphics|bibliographystyle|bibliography|addbibresource|pagestyle|thispagestyle|setlength|addtolength|setcounter|addtocounter|newcounter|definecolor|usepackage|RequirePackage|documentclass|graphicspath|hypersetup|captionsetup|newtheorem|theoremstyle|renewenvironment|newenvironment|crefname|Crefname|pdfoutput|linenumbers|acknowledgments|DeclareMathOperator|newlength|lstset|tcbset|setstretch|color|textcolor|arrayrulecolor|rowcolor|cellcolor|columncolor|nocite|keywords|icmltitlerunning|icmlkeywords|icmlcorrespondingauthor|icmlaffiliation|icmlauthor|icmlsetsymbol|affil|address|email|thanks|footnotetext|orcid";

/** Definitions that take several arguments and print nothing: all their […] and {…} arguments go with them. */
const DEFINITIONS = "DeclareSIUnit|DeclareSIPrefix|DeclareSIQualifier|DeclareSIPower|sisetup|newtcolorbox|renewtcolorbox|DeclareTColorBox|newtcbox|tcbset|tcbuselibrary|newenvironment|renewenvironment|newtheorem|definecolor|colorlet|newfloat|floatname|lstdefinestyle|lstdefinelanguage|lstset|newcolumntype|sethlcolor|setlist|pgfplotsset|usetikzlibrary|tikzset|tikzstyle|newmdenv|mdfdefinestyle|captionsetup|hypersetup|newlist|setlength|newcounter|setcounter|crefname|Crefname|crefformat|DeclareMathOperator|newacronym|definecolorset";

/** Text with each definition command and all its arguments taken out. */
function withoutDefinitions(text: string): string {
  const pattern = new RegExp(String.raw`\\(?:${DEFINITIONS})\*?(?![a-zA-Z])`, "g");
  let out = "";
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    let at = m.index + m[0].length;
    for (;;) {
      // \DeclareMathOperator\argmax{arg max}: its first argument may be a bare command.
      const bare = at === m.index + m[0].length ? /^\s*\\[a-zA-Z@]+/.exec(text.slice(at)) : null;
      const next = optional(text, at) ?? group(text, at) ?? (bare ? { end: at + bare[0].length } : undefined);
      if (!next) break;
      at = next.end;
    }
    out += text.slice(last, m.index);
    last = at;
    pattern.lastIndex = at;
  }
  return out + text.slice(last);
}

export interface ConvertedLatex {
  title?: string;
  text: string;
}

/**
 * A paper's text from its source files, or undefined when there is no main file. Throws nothing: an
 * unknown command keeps its argument's text, or is left out.
 */
export function latexToText(files: Map<string, string>): ConvertedLatex | undefined {
  const main = mainFile(files);
  if (!main) return undefined;
  const macros = new Map<string, Macro>();
  // Macros a source defines in its own style files, then in the paper.
  const styles: string[] = [];
  for (const [name, text] of files) if (/\.(sty|def)$/i.test(name) && !/^(neurips|icml|iclr|acl|aaai|ieee|llncs|svjour|elsarticle|natbib|hyperref)/i.test(name.split("/").pop()!)) styles.push(takeMacros(withoutComments(text), macros));
  const defined = takeMacros(inlined(files, main), macros);
  // The units the paper declares for siunitx, and how it prints "per" (siunitx.ts).
  const units = siunitxSetup([...styles, defined]);
  let source = withoutDefinitions(defined);
  const begin = source.indexOf("\\begin{document}");
  const end = source.lastIndexOf("\\end{document}");
  const preamble = begin >= 0 ? mhchemToText(siunitxToText(expandMacros(source.slice(0, begin), macros), units)) : "";
  let body = begin >= 0 ? source.slice(begin + "\\begin{document}".length, end > begin ? end : undefined) : source;
  // Quantities and formulas are read after the paper's macros, which may write them (\newcommand{\Tc}{\SI{2.3}{\kelvin}}).
  body = mhchemToText(siunitxToText(expandMacros(body, macros), units));
  const titleArg = group(body, (/\\title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(body)?.index ?? -1) + (/\\title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(body)?.[0].length ?? 0)) ?? group(preamble, (/\\(?:icml)?title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(preamble)?.index ?? -1) + (/\\(?:icml)?title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(preamble)?.[0].length ?? 0));

  // REVTeX and AASTeX set the title after \begin{document}: it is the heading, not a line of prose too.
  if (titleArg && /\\title\s*(\[[^\]]*\])?\s*\{/.test(body)) body = replaceCommand(body, "title", () => "");

  // References, from the .bbl next to the main file (arXiv doesn't run BibTeX, so a source that cites has one).
  const bblName = [...files.keys()].find((n) => n.endsWith(".bbl") && n.replace(/\.bbl$/, "") === main.replace(/\.(tex|ltx)$/, "")) ?? [...files.keys()].find((n) => n.endsWith(".bbl"));
  const inlineText = (text: string) => inline(text, new Map(), new Map());
  // Failing both, the .bib files (bibReferences): arXiv takes a source without its .bbl.
  const bibs = [...files.entries()].filter(([n]) => n.endsWith(".bib")).map(([, text]) => text);
  const refs = bblName
    ? readBbl(expandMacros(files.get(bblName)!, macros), inlineText)
    : /\\begin\{thebibliography\}/.test(body)
      ? readBbl(body.slice(body.indexOf("\\begin{thebibliography}")), inlineText)
      : bibs.length
        ? bibReferences(bibs.flatMap((b) => readBib(b)), citedKeys(body), inlineText)
        : new Map<string, Reference>();
  // The references go where the paper prints them: before the appendix, as a rule.
  body = body.replace(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/, "\\printbibliography");
  body = body.replace(/\\bibliography\s*\{[^}]*\}|\\printbibliography\b(\[[^\]]*\])?/, "\n\n\\section*{References}\n\n").replace(/\\bibliography\s*\{[^}]*\}|\\printbibliography\b(\[[^\]]*\])?/g, "");

  // The appendix package's environments are \appendix: the sections after them are lettered (harness 0.94.0).
  body = body.replace(/\\begin\{(?:appendix|appendices|subappendices)\}/g, "\\appendix ").replace(/\\end\{(?:appendix|appendices|subappendices)\}/g, "");
  // Theorem-like statements, declared in the paper or its style files, numbered with the equations.
  const statements = numberStatements(body, statementSetup([...styles, defined], macros));
  body = statements.body;
  const labels = numberLabels(body, statements);
  let text = convertBody(body, labels, refs, statements);
  if (refs.size && !/^## References$/m.test(text)) text = text.replace(/\n*$/, "") + "\n\n## References";
  text = text.replace(/^## References$/m, () => `## References\n\n${[...refs.values()].map((r) => `[${r.number}] ${r.text}`).join("\n")}`);
  const title = titleArg ? inlineText(titleArg.body.replace(/\\\\/g, " ")).replace(/\s+/g, " ").trim() : undefined;
  text = tidy(`${title ? `# ${title}\n\n` : ""}${text}`);
  return { ...(title ? { title } : {}), text };
}

interface Label {
  kind: "section" | "table" | "figure" | "equation" | "algorithm" | "appendix" | "item" | "theorem";
  number: string;
  /** A theorem-like statement's printed name, "Lemma" or "Conjecture", which \cref and \autoref write. */
  name?: string;
}

const FLOAT_ENV = new RegExp(String.raw`\\begin\{(${FLOATS})\}([\s\S]*?)\\end\{\1\}`, "g");
const MATH_ENV = new RegExp(String.raw`\\begin\{(${NUMBERED_MATH})(\*?)\}([\s\S]*?)\\end\{\1\2\}`, "g");
const HAS_CAPTION = /\\caption(?:of)?(?![a-zA-Z])/;

/** A float's kind, by its environment's name. */
function floatKind(env: string): "table" | "figure" | "algorithm" {
  return /table/.test(env) ? "table" : /algorithm/.test(env) ? "algorithm" : "figure";
}

/**
 * A displayed equation environment's rows, each with its number or none: an align numbers each row not
 * marked \nonumber, and a row with \tag{…} has that tag for its number (harness 0.94.0), starred or not,
 * without stepping the counter.
 */
function mathRows(env: string, star: string, inner: string, next: () => string): Array<{ latex: string; number?: string; labels: string[] }> {
  const rows = /align|gather|eqnarray|flalign|alignat/.test(env) ? inner.split(/\\\\(?:\[[^\]]*\])?/) : [inner];
  return rows.flatMap((row) => {
    const labels = [...row.matchAll(/\\label\{([^}]*)\}/g)].map((l) => l[1]!.trim());
    let tag: string | undefined;
    // A tag is read as text, "∗" for \ast, so a reference to it keeps it.
    const untagged = replaceCommand(row, "tag", (arg) => {
      const written = arg.replace(/\$/g, "").trim();
      tag = readableFormula(written) ?? written;
      return "";
    });
    const latex = untagged.replace(/\\(?:label\{[^}]*\}|nonumber|notag)/g, "").replace(/\s+/g, " ").trim();
    if (!latex) return [];
    const numbered = !star && !/\\(?:nonumber|notag)\b/.test(row);
    const number = tag !== undefined ? tag : numbered ? next() : undefined;
    return [{ latex, ...(number !== undefined ? { number } : {}), labels }];
  });
}

/*
 * Theorem-like statements (harness 0.94.0), numbered as amsthm numbers them. A mathematics audit found that
 * the converter wrote a heading only for ten fixed environment names, while most papers declare their own
 * (\newtheorem{thm}{Theorem}[section], \newtheorem{conj}[thm]{Conjecture}): of 48 recent arXiv mathematics
 * papers, 37 did, and 507 statements lost their heading, among them 23 conjectures, which read as plain
 * statements. No statement was numbered, and a \ref to one gave the number of its section: "we prove
 * Theorem 1.2 … and Theorem 1.4" read "we prove Theorem 1 … and Theorem 1" (docs/math-audit.md, M1 and M2).
 */

/** A theorem-like environment: the name it prints, and the counter it steps (none for \newtheorem*). */
interface StatementEnv {
  name: string;
  counter?: string;
}

/** A counter: its value, and the sectioning level that resets it and prefixes its number (\newtheorem's [section], \numberwithin). */
interface Counter {
  value: number;
  within?: number;
}

export interface StatementSetup {
  envs: Map<string, StatementEnv>;
  counters: Map<string, Counter>;
  /** How a counter prints, where the paper says (\renewcommand{\thetheoremA}{A}, {\Alph{main}}): the macro's body, keyed by counter. */
  formats: Map<string, string>;
}

/** Statement environments a class or package may define without the paper declaring them: printed with their name, unnumbered. */
const STANDARD_STATEMENTS = "theorem lemma proposition corollary definition remark example assumption claim conjecture problem question hypothesis notation fact observation".split(" ");

const WITHIN_LEVELS: Record<string, number> = { chapter: 1, section: 2, subsection: 3, subsubsection: 4 };

/**
 * The theorem-like environments a source declares, in the order of `texts` (style files, then the paper):
 * \newtheorem{env}{Name}, \newtheorem{env}{Name}[section], \newtheorem{env}[shared]{Name},
 * \newtheorem*{env}{Name}, llncs's \spnewtheorem in the same forms, thmtools's
 * \declaretheorem[name=…, numberwithin=…, sibling=…, numbered=no]{env}, \numberwithin{counter}{section}
 * (also for equations), and aliascnt's \newaliascnt{lem}{thm}, with which papers that use cleveref share
 * a counter: \newaliascnt{lem}{thm} then \newtheorem{lem}[lem]{Lemma} numbers lemmas with theorems. A
 * counter's \the… macro, among `macros`, says how it prints when it is plain enough to read.
 */
export function statementSetup(texts: string[], macros: Map<string, Macro> = new Map()): StatementSetup {
  const envs = new Map<string, StatementEnv>();
  const counters = new Map<string, Counter>([["equation", { value: 0 }]]);
  const aliases = new Map<string, string>();
  const counterOf = (name: string) => (envs.has(name) ? envs.get(name)!.counter : (aliases.get(name) ?? name));
  const share = (name: string) => {
    const counter = counterOf(name) ?? name;
    if (!counters.has(counter)) counters.set(counter, { value: 0 });
    return counter;
  };
  const pattern = /\\(newtheorem|spnewtheorem|declaretheorem|numberwithin|counterwithin|newaliascnt)(\*?)(?![a-zA-Z])/g;
  for (const text of texts) {
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const at = m.index + m[0].length;
      if (m[1] === "newaliascnt") {
        const alias = group(text, at);
        const target = alias && group(text, alias.end);
        if (alias && target) aliases.set(alias.body.trim(), share(target.body.trim()));
        continue;
      }
      if (m[1] === "numberwithin" || m[1] === "counterwithin") {
        const counter = group(text, at);
        const level = counter && group(text, counter.end);
        if (!counter || !level || m[2]) continue;
        const name = counterOf(counter.body.trim());
        const within = WITHIN_LEVELS[level.body.trim()];
        if (name && within !== undefined) counters.set(name, { value: 0, ...counters.get(name), within });
        continue;
      }
      if (m[1] === "declaretheorem") {
        const before = optional(text, at);
        const env = group(text, before?.end ?? at);
        if (!env) continue;
        const after = optional(text, env.end);
        const keys = new Map<string, string>();
        for (const pair of `${before?.body ?? ""},${after?.body ?? ""}`.split(",")) {
          const [key, ...value] = pair.split("=");
          if (key?.trim()) keys.set(key.trim(), value.join("=").replace(/^\s*\{?|\}?\s*$/g, ""));
        }
        const id = env.body.trim();
        const name = keys.get("name") ?? keys.get("title") ?? keys.get("heading") ?? id[0]!.toUpperCase() + id.slice(1);
        const shared = keys.get("sibling") ?? keys.get("sharenumber") ?? keys.get("sharecounter");
        if (m[2] || /^(?:no|false)$/.test(keys.get("numbered") ?? "")) envs.set(id, { name });
        else if (shared) envs.set(id, { name, counter: share(shared.trim()) });
        else {
          const within = WITHIN_LEVELS[(keys.get("numberwithin") ?? keys.get("parent") ?? keys.get("within") ?? "").trim()];
          counters.set(id, { value: 0, ...(within !== undefined ? { within } : {}) });
          envs.set(id, { name, counter: id });
        }
        continue;
      }
      // \newtheorem and \spnewtheorem: {env}[shared]{Name}[within].
      const env = group(text, at);
      if (!env) continue;
      const shared = optional(text, env.end);
      const printed = group(text, shared?.end ?? env.end);
      if (!printed) continue;
      const id = env.body.trim();
      const name = inline(printed.body, new Map(), new Map()).replace(/\s+/g, " ").trim();
      if (m[2]) envs.set(id, { name });
      else if (shared) envs.set(id, { name, counter: share(shared.body.trim()) });
      else {
        const within = WITHIN_LEVELS[optional(text, printed.end)?.body.trim() ?? ""];
        counters.set(id, { value: 0, ...(within !== undefined ? { within } : {}) });
        envs.set(id, { name, counter: id });
      }
    }
  }
  const formats = new Map<string, string>();
  for (const [name, macro] of macros) if (name.startsWith("the") && macro.args === 0 && !/#/.test(macro.body)) formats.set(name.slice(3), macro.body);
  return { envs, counters, formats };
}

/** What numberStatements finds: the body with each statement's heading written, the equations' numbers in order, and the statements' labels. */
interface Statements {
  body: string;
  equations: string[];
  labels: Map<string, Label>;
}

/** A number in Roman numerals, for \Roman and \roman. */
function roman(n: number): string {
  const numerals: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [size, numeral] of numerals) for (; n >= size; n -= size) out += numeral;
  return out;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Numbers the theorem-like statements and the displayed equations in the order the paper has them, with the
 * sections around them, as LaTeX does: a counter declared [section] restarts at each section and prints
 * "2.3", a shared counter ([thm], or [equation]) runs on across the environments that share it, and an
 * equation counter put \numberwithin a section prints "(2.1)". Each statement's \begin becomes its printed
 * heading, "Theorem 2.3 (Hardy–Littlewood).", or "Proof of Theorem 2.3." for a proof given a title. Floats
 * are left out, as numberLabels and convertBody leave them out.
 */
function numberStatements(body: string, setup: StatementSetup): Statements {
  const counters = new Map([...setup.counters].map(([name, counter]) => [name, { ...counter }]));
  const envs = new Map(setup.envs);
  for (const name of STANDARD_STATEMENTS) {
    for (const id of [name, `${name}*`]) if (!envs.has(id)) envs.set(id, { name: name[0]!.toUpperCase() + name.slice(1) });
  }
  const names = [...envs.keys(), "proof"].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  // Floats blanked, so positions stay those of the body.
  const outside = body.replace(FLOAT_ENV, (all) => " ".repeat(all.length));
  type Event = { at: number; kind: "section" | "appendix" | "statement" | "math"; match: RegExpMatchArray };
  const events: Event[] = [];
  for (const m of outside.matchAll(/\\(part|chapter|section|subsection|subsubsection)(\*?)(?![a-zA-Z])|\\appendix\b/g)) events.push({ at: m.index, kind: m[1] ? "section" : "appendix", match: m });
  for (const m of outside.matchAll(new RegExp(String.raw`\\begin\{(${names})\}`, "g"))) events.push({ at: m.index, kind: "statement", match: m });
  for (const m of outside.matchAll(MATH_ENV)) events.push({ at: m.index, kind: "math", match: m });
  events.sort((a, b) => a.at - b.at);

  const sections = [0, 0, 0, 0, 0];
  let appendix = false;
  // A book's sections print with their chapter, "4.2", and its appendix letters chapters, not sections.
  const book = events.some((e) => e.kind === "section" && e.match[1] === "chapter");
  const letter = (n: number) => String.fromCharCode(64 + n);
  const SECTIONING: Record<string, number> = { chapter: 1, section: 2, subsection: 3, subsubsection: 4 };
  const value = (name: string) => (SECTIONING[name] !== undefined ? sections[SECTIONING[name]!]! : (counters.get(name)?.value ?? 0));
  const STYLES: Record<string, (n: number) => string> = {
    arabic: String,
    Alph: letter,
    alph: (n) => letter(n).toLowerCase(),
    Roman: (n) => roman(n),
    roman: (n) => roman(n).toLowerCase(),
  };
  /** A counter as the paper's \the… macro prints it, or undefined when that macro is more than counters and text. */
  const formatted = (name: string, depth = 0): string | undefined => {
    const format = setup.formats.get(name);
    if (format === undefined || depth > 4) return undefined;
    let ok = true;
    const out = format
      .replace(/\\(arabic|Alph|alph|Roman|roman)\s*\{([^}]*)\}/g, (_all, style: string, counter: string) => STYLES[style]!(value(counter.trim())))
      .replace(/\\the([a-zA-Z]+)/g, (_all, counter: string) => shown(counter, depth + 1) ?? ((ok = false), ""));
    return ok && !/[\\{}]/.test(out) ? out.trim() : undefined;
  };
  /** A sectioning level as printed: "2", "B", "4.2" in a book. */
  const level = (l: number): string => {
    if (l === 1) return appendix && book ? letter(sections[1]!) : String(sections[1]);
    const top = appendix && !book ? letter(sections[2]!) : String(sections[2]);
    return [...(book ? [level(1)] : []), top, ...sections.slice(3, l + 1)].join(".");
  };
  /** Any counter as printed: by the paper's \the… macro when it has a readable one, else as LaTeX prints it by default. */
  function shown(name: string, depth = 0): string {
    const own = formatted(name, depth);
    if (own !== undefined) return own;
    if (SECTIONING[name] !== undefined) return level(SECTIONING[name]!);
    const counter = counters.get(name);
    const within = counter?.within;
    const prefix = within === undefined ? "" : `${formatted(Object.keys(SECTIONING).find((k) => SECTIONING[k] === within)!, depth) ?? level(within)}.`;
    return prefix + (counter?.value ?? 0);
  }
  const step = (name: string) => {
    const counter = counters.get(name) ?? { value: 0 };
    counters.set(name, counter);
    counter.value++;
    return shown(name);
  };
  const equations: string[] = [];
  const labels = new Map<string, Label>();
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const { at, kind, match } of events) {
    if (kind === "appendix") {
      appendix = true;
      sections[book ? 1 : 2] = 0;
    } else if (kind === "section") {
      if (match[2] || match[1] === "part") continue;
      const level = SECTION_LEVELS[match[1]!]!;
      sections[level]!++;
      for (let l = level + 1; l < sections.length; l++) sections[l] = 0;
      // A counter numbered within this level or a deeper one restarts.
      for (const counter of counters.values()) if (counter.within !== undefined && counter.within >= level) counter.value = 0;
    } else if (kind === "math") {
      mathRows(match[1]!, match[2]!, match[3]!, () => {
        const number = step("equation");
        equations.push(number);
        return number;
      });
    } else {
      const id = match[1]!;
      let end = at + match[0].length;
      const title = optional(body, end);
      if (title) end = title.end;
      const titleText = title?.body.trim();
      if (id === "proof") {
        edits.push({ start: at, end, text: `\n\n${titleText ? titleText.replace(/\.$/, "") : "Proof"}. ` });
        continue;
      }
      const env = envs.get(id)!;
      const number = env.counter ? step(env.counter) : "";
      edits.push({ start: at, end, text: `\n\n${env.name}${number ? ` ${number}` : ""}${titleText ? ` (${titleText})` : ""}. ` });
      // The statement's own label: the first outside its equations and lists, which have their own numbers.
      const close = body.indexOf(`\\end{${id}}`, end);
      const inside = body.slice(end, close < 0 ? undefined : close).replace(MATH_ENV, "").replace(/\\begin\{(itemize|enumerate|description)\}[\s\S]*?\\end\{\1\}/g, "");
      const label = /\\label\{([^}]*)\}/.exec(inside)?.[1]?.trim();
      if (label) labels.set(label, { kind: "theorem", number, name: env.name });
    }
  }
  let out = "";
  let last = 0;
  for (const edit of edits) {
    out += body.slice(last, edit.start) + edit.text;
    last = edit.end;
  }
  out += body.slice(last);
  out = out.replace(new RegExp(String.raw`\\end\{(?:${names})\}`, "g"), "\n\n");
  return { body: out, equations, labels };
}

/** Each equation number in turn, as numberStatements gave them. */
function equationNumbers(statements: Statements): () => string {
  let i = 0;
  return () => statements.equations[i++] ?? String(i);
}

/** The number each \label gets, as LaTeX numbers it: sections, tables, figures, algorithms, equations, and statements (numberStatements). */
function numberLabels(body: string, statements: Statements): Map<string, Label> {
  const labels = new Map<string, Label>(statements.labels);
  const nextEquation = equationNumbers(statements);
  const counts = { table: 0, figure: 0, algorithm: 0 };
  for (const [, env, inner] of body.matchAll(FLOAT_ENV)) {
    const kind = floatKind(env!);
    if (!HAS_CAPTION.test(inner!)) continue;
    const number = String(++counts[kind]);
    for (const l of inner!.matchAll(/\\label\{([^}]*)\}/g)) labels.set(l[1]!.trim(), { kind, number });
  }
  const outside = body.replace(FLOAT_ENV, "");
  for (const [, env, star, inner] of outside.matchAll(MATH_ENV)) {
    for (const row of mathRows(env!, star!, inner!, nextEquation)) for (const l of row.labels) labels.set(l, { kind: "equation", number: row.number ?? "" });
  }
  const sections = [0, 0, 0, 0, 0];
  let appendix = false;
  let current: Label = { kind: "section", number: "" };
  const events = /\\(part|chapter|section|subsection|subsubsection)(\*?)(?![a-zA-Z])|\\appendix\b|\\label\{([^}]*)\}/g;
  for (const [all, sec, star, label] of outside.replace(MATH_ENV, "").matchAll(events)) {
    if (sec) {
      if (star) continue;
      const level = SECTION_LEVELS[sec]!;
      if (level < 2) continue;
      sections[level]!++;
      for (let l = level + 1; l < sections.length; l++) sections[l] = 0;
      const top = appendix ? String.fromCharCode(64 + sections[2]!) : String(sections[2]);
      current = { kind: appendix && level === 2 ? "appendix" : "section", number: [top, ...sections.slice(3, level + 1)].join(".") };
    } else if (all === "\\appendix") {
      appendix = true;
      sections[2] = 0;
    } else if (label && !labels.has(label.trim())) labels.set(label.trim(), { ...current });
  }
  return labels;
}

/** "Table 2", "Section 3", "Appendix B", "Figure 1", "Equation (4)", as \autoref and \cref write them. */
function refName(label: Label | undefined, capital = true): string {
  if (!label) return "??";
  const word = label.kind === "theorem" ? (label.name ?? "") : { section: "Section", table: "Table", figure: "Figure", equation: "Equation", algorithm: "Algorithm", appendix: "Appendix", item: "" }[label.kind];
  const shown = label.kind === "equation" ? `(${label.number})` : label.number;
  return `${capital ? word : word.toLowerCase()} ${shown}`.trim();
}

/** A citation as the PDF prints it: "(Liu et al., 2023; Lewis et al., 2020)", "Liu et al. (2023)" or "[3, 7]". */
function citation(keys: string[], refs: Map<string, Reference>, kind: string, note?: string): string {
  const found = keys.map((k) => refs.get(k.trim()));
  if (found.every((r) => r?.authors && r.year)) {
    if (kind === "citet" || kind === "Citet" || kind === "textcite" || kind === "citealt") return found.map((r) => `${r!.authors} (${r!.year}${note ? `, ${note}` : ""})`).join("; ");
    if (kind === "citeauthor" || kind === "Citeauthor") return found.map((r) => r!.authors).join("; ");
    if (kind === "citeyear") return found.map((r) => r!.year).join("; ");
    const inside = found.map((r) => `${r!.authors}, ${r!.year}`).join("; ") + (note ? `, ${note}` : "");
    return kind === "citealp" ? inside : `(${inside})`;
  }
  return `[${keys.map((k, i) => found[i]?.number ?? k.trim()).join(", ")}${note ? `, ${note}` : ""}]`;
}

/** Each \cite, \citep, \citet and the like as the PDF prints it, with natbib's [pre][post] notes: the post note is kept. */
function citations(text: string, refs: Map<string, Reference>): string {
  const pattern = /\\(cite|citep|citet|Citet|Citep|citealp|citealt|citeauthor|Citeauthor|citeyear|citeyearpar|parencite|textcite|autocite|citenum|nocite)\*?(?![a-zA-Z])/g;
  let out = "";
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    let at = m.index + m[0].length;
    const first = optional(text, at);
    if (first) at = first.end;
    const second = first && optional(text, at);
    if (second) at = second.end;
    const keys = group(text, at);
    if (!keys) continue;
    const note = (second ?? first)?.body.trim();
    out += text.slice(last, m.index) + (m[1] === "nocite" ? "" : citation(keys.body.split(","), refs, m[1]!, note || undefined));
    last = keys.end;
    pattern.lastIndex = keys.end;
  }
  return out + text.slice(last);
}

/** Characters and accents LaTeX writes as commands. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/\\%/g, "%"], [/\\&/g, "&"], [/\\\$/g, "\u0007"], [/\\#/g, "#"], [/\\_/g, "_"], [/\\\{/g, "{"], [/\\\}/g, "}"],
  [/\\(?:textasciitilde|textasciicircum)\b\s*(\{\})?/g, "~"], [/\\textbackslash\b\s*(\{\})?/g, "\\"],
  [/\\(?:ldots|dots|textellipsis)\b\s*(\{\})?/g, "…"], [/\\(?:textendash)\b\s*(\{\})?/g, "–"], [/\\(?:textemdash)\b\s*(\{\})?/g, "—"],
  [/\\(?:textquoteright)\b\s*(\{\})?/g, "’"], [/\\(?:textquoteleft)\b\s*(\{\})?/g, "‘"],
  [/\\(?:texttimes)\b\s*(\{\})?/g, "×"], [/\\(?:textdegree)\b\s*(\{\})?/g, "°"], [/\\(?:textpm)\b\s*(\{\})?/g, "±"],
  [/\\(?:S)(?![a-zA-Z])\s*/g, "§"], [/\\(?:P)(?![a-zA-Z])\s*/g, "¶"], [/\\(?:copyright)\b/g, "©"], [/\\(?:dag|textdagger)\b\s*(\{\})?/g, "†"], [/\\(?:ddag|textdaggerdbl)\b\s*(\{\})?/g, "‡"],
  [/\\(?:LaTeX)\b\s*(\{\})?/g, "LaTeX"], [/\\(?:TeX)\b\s*(\{\})?/g, "TeX"], [/\\(?:ie)\b\s*(\{\})?/g, "i.e."], [/\\(?:eg)\b\s*(\{\})?/g, "e.g."], [/\\(?:etal)\b\s*(\{\})?/g, "et al."],
  [/\\(?:checkmark|cmark)\b\s*(\{\})?/g, "✓"], [/\\(?:xmark)\b\s*(\{\})?/g, "✗"], [/\\ding\{5[12]\}/g, "✓"], [/\\ding\{5[56]\}/g, "✗"],
  [/---/g, "—"], [/--/g, "–"], [/``/g, "“"], [/''/g, "”"], [/(?<![\\\w])`/g, "‘"],
];

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", C: "Ć", S: "Ś", Z: "Ź" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È" },
  '"': { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ", A: "Ä", E: "Ë", O: "Ö", U: "Ü" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", O: "Ô" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
  c: { c: "ç", C: "Ç", s: "ş", S: "Ş" },
  v: { c: "č", s: "š", z: "ž", r: "ř", e: "ě", n: "ň", C: "Č", S: "Š", Z: "Ž", R: "Ř" },
  u: { a: "ă", g: "ğ", A: "Ă", G: "Ğ" },
  H: { o: "ő", u: "ű", O: "Ő", U: "Ű" },
  "=": { a: "ā", e: "ē", i: "ī", o: "ō", u: "ū" },
  ".": { z: "ż", Z: "Ż", I: "İ" },
};

function accents(text: string): string {
  return text
    // A letter accent is a command of its own, "\\c{c}" or "\\v s", never the start of a longer name (harness 0.93.0):
    // "\\ce{CO2}" was read as a cedilla on "e" ("eCO2"), "\\vec v" as "ěc v" and "\\verb" as "ěrb".
    .replace(/\\(?:([cvuH])(?![a-zA-Z])|(['`"^~=.]))\s*\{?\\?([a-zA-Z])\}?/g, (_all, letterAccent: string | undefined, symbolAccent: string | undefined, letter: string) => ACCENTS[(letterAccent ?? symbolAccent)!]?.[letter] ?? letter)
    .replace(/\{\\(?:ss)\}|\\ss\b/g, "ß").replace(/\{\\o\}|\\o\b(?![a-z])/g, "ø").replace(/\{\\O\}/g, "Ø").replace(/\{\\aa\}|\\aa\b/g, "å").replace(/\{\\AA\}/g, "Å").replace(/\{\\ae\}|\\ae\b/g, "æ").replace(/\{\\l\}|\\l\b(?![a-z])/g, "ł").replace(/\{\\L\}/g, "Ł").replace(/\\i\b(?![a-z])/g, "i");
}

/** Text with math kept as written and everything else read as text: the converter for a run of prose. */
function inline(text: string, labels: Map<string, Label>, refs: Map<string, Reference>): string {
  // Math is kept as written; it is set aside so the text conversions don't touch it.
  const math: string[] = [];
  const keep = (m: string) => `\u000e${math.push(m) - 1}\u000f`;
  let out = text.replace(/\\\$/g, "\u0007");
  out = out.replace(/\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\[\s\S])+\$|\\\((?:[\s\S]*?)\\\)/g, (m) => keep(m.replace(/\\ensuremath(?![a-zA-Z])\s*/g, "").replace(/\s+/g, " ")));
  // A formula a paper's macro puts in running text with \ensuremath (harness 0.91.0), as particle-physics
  // papers do with \newcommand{\sqs}{\ensuremath{\sqrt{s}}}: read as text where math.ts reads it ("√s",
  // "Z′_ψ", "p_T"), else kept as math. Read as plain text, its commands were dropped: "√s = 13 TeV" was
  // "s = 13 TeV", and "Z'_\psi" was "Z'_".
  out = replaceCommand(out, "ensuremath", (arg) => {
    const read = readableFormula(arg);
    return read !== undefined ? read : keep(`$${arg.replace(/\s+/g, " ").trim()}$`);
  });
  // \texorpdfstring{TeX}{bookmark} (hyperref), common in headings: the TeX, not both (harness 0.94.0).
  // "\section{Proof of \texorpdfstring{\cref{thm:main}}{Theorem 1.1}}" read "Proof of Theorem 1.1Theorem 1.1".
  for (let at = out.search(/\\texorpdfstring(?![a-zA-Z])/); at >= 0; at = out.search(/\\texorpdfstring(?![a-zA-Z])/)) {
    const tex = group(out, at + "\\texorpdfstring".length);
    const bookmark = tex && group(out, tex.end);
    out = out.slice(0, at) + (tex?.body ?? "") + out.slice(bookmark?.end ?? tex?.end ?? at + "\\texorpdfstring".length);
  }
  out = citations(out, refs);
  out = out.replace(/\\(autoref|cref|Cref|Autoref|vref|nameref)\*?\s*\{([^}]*)\}/g, (_all, kind: string, keys: string) => keys.split(",").map((k, i) => refName(labels.get(k.trim()), kind !== "cref" || i === 0)).join(" and "));
  out = out.replace(/\\eqref\s*\{([^}]*)\}/g, (_all, key: string) => `(${labels.get(key.trim())?.number ?? "??"})`);
  out = out.replace(/\\(?:ref|pageref|subref)\*?\s*\{([^}]*)\}/g, (_all, key: string) => labels.get(key.trim())?.number ?? "??");
  out = replaceCommand(out, "footnote", (arg) => ` (${arg.trim()})`);
  out = replaceCommand(out, "href", (arg) => arg, 2);
  out = replaceCommand(out, "url|nolinkurl|path", (arg) => arg);
  out = replaceCommand(out, "multicolumn", (arg) => arg, 3);
  out = replaceCommand(out, "multirow", (arg) => arg, 2);
  out = replaceCommand(out, "makecell|shortstack|thead|specialcell", (arg) => arg.replace(/\\\\/g, " "));
  out = out.replace(/\\rule\s*(\[[^\]]*\])?\s*\{[^}]*\}\s*\{[^}]*\}/g, "");
  out = replaceCommand(out, DROP, () => "");
  for (let pass = 0; pass < 4; pass++) out = replaceCommand(out, UNWRAP, (arg) => arg);
  // Old-style font switches inside a group: {\bf x}, {\em x}.
  out = out.replace(/\\(?:bf|it|em|tt|sc|sl|rm|sf|bfseries|itshape|ttfamily|scshape|normalfont|small|footnotesize|scriptsize|tiny|large|Large|LARGE|huge|Huge|normalsize|centering|raggedright|raggedleft|noindent|par|indent|newline|linebreak|smallskip|medskip|bigskip|maketitle|clearpage|newpage|cleardoublepage|pagebreak|hfill|vfill|hline|toprule|midrule|bottomrule|protect|relax|null|leavevmode|xspace|sloppy|onecolumn|twocolumn|tableofcontents|printbibliography|frontmatter|mainmatter|backmatter|selectfont|strut|quad|qquad)\b\*?/g, " ");
  out = accents(out);
  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);
  out = out.replace(/\\\\(\[[^\]]*\])?/g, " ").replace(/\\[,;:! ]/g, " ").replace(/~/g, " ");
  // Any other command: its argument's text, or nothing.
  for (let pass = 0; pass < 3; pass++) out = out.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\s*\{([^{}]*)\})?/g, (_all, _opt, _g, arg: string | undefined) => arg ?? "");
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\u000e(\d+)\u000f/g, (_all, i: string) => math[Number(i)]!).replace(/\u0007/g, "$");
  return out;
}

/** A tabular's rows as Markdown rows: "| a | b |". */
function tableRows(tabular: string, labels: Map<string, Label>, refs: Map<string, Reference>): string[] {
  const rows: string[] = [];
  const cells: string[][] = [];
  let depth = 0;
  let row = "";
  let cell: string[] = [];
  const pushCell = () => {
    cell.push(row);
    row = "";
  };
  const pushRow = () => {
    pushCell();
    cells.push(cell);
    cell = [];
  };
  for (let i = 0; i < tabular.length; i++) {
    const c = tabular[i]!;
    if (c === "\\" && tabular[i + 1] === "\\" && depth === 0) {
      pushRow();
      i++;
      const opt = optional(tabular, i + 1);
      if (opt) i = opt.end - 1;
      continue;
    }
    if (c === "\\" && tabular[i + 1]) {
      row += c + tabular[i + 1];
      i++;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (c === "&" && depth === 0) {
      pushCell();
      continue;
    }
    row += c;
  }
  pushRow();
  for (const raw of cells) {
    const expanded: string[] = [];
    for (const piece of raw) {
      const span = /\\multicolumn\s*\{(\d+)\}/.exec(piece);
      const text = inline(piece.replace(/\\(?:hline|toprule|midrule|bottomrule|cline|cmidrule|specialrule|addlinespace|hdashline|cdashline|morecmidrules|midrule\[[^\]]*\])(\([^)]*\))?(\{[^}]*\})*(\[[^\]]*\])?/g, " "), labels, refs).replace(/\s+/g, " ").trim();
      expanded.push(text.replace(/\|/g, "\\|"));
      for (let k = 1; span && k < Number(span[1]); k++) expanded.push("");
    }
    if (expanded.some((t) => t)) rows.push(`| ${expanded.join(" | ")} |`);
  }
  return rows;
}

/** The tabulars in a float, each with its column specification taken off. */
function tabulars(env: string): string[] {
  const out: string[] = [];
  const pattern = /\\begin\{(tabular\*?|tabularx|tabulary|longtable|tblr|NiceTabular|array)\}/g;
  for (let m = pattern.exec(env); m; m = pattern.exec(env)) {
    let at = m.index + m[0].length;
    const opt = optional(env, at);
    if (opt) at = opt.end;
    // tabular* and tabularx take a width, then the columns.
    for (let k = /\*|x|y/.test(m[1]!.slice(-1)) && m[1] !== "tblr" ? 2 : 1; k > 0; k--) {
      const g = group(env, at);
      if (g) at = g.end;
    }
    const close = env.indexOf(`\\end{${m[1]}}`, at);
    if (close < 0) break;
    out.push(env.slice(at, close));
    pattern.lastIndex = close;
  }
  return out;
}

/** Each float, list, environment, equation and heading as a block of text, then the prose between them. */
function convertBody(body: string, labels: Map<string, Label>, refs: Map<string, Reference>, statements: Statements): string {
  const counts = { table: 0, figure: 0, algorithm: 0 };
  const nextEquation = equationNumbers(statements);
  const sections = [0, 0, 0, 0, 0];
  let appendix = false;
  const blocks: string[] = [];
  const block = (text: string) => `\n\n\u0011${blocks.push(text) - 1}\u0012\n\n`;
  const run = (text: string) => inline(text, labels, refs);

  let out = body;
  // Floats: tables, figures and algorithms, numbered as numberLabels numbers them.
  out = out.replace(FLOAT_ENV, (_all, env: string, inner: string) => {
    const kind = floatKind(env);
    const captions: string[] = [];
    let rest = replaceCommand(inner, "caption", (arg) => (captions.push(arg), ""));
    rest = replaceCommand(rest, "captionof", (arg) => (captions.push(arg), ""), 2);
    const caption = captions.map((c) => run(c).replace(/\s+/g, " ").trim()).join(" ");
    const number = captions.length ? String(++counts[kind]) : "";
    if (kind === "table") {
      const rows = tabulars(rest).flatMap((t) => tableRows(t, labels, refs));
      const notes = /\\begin\{tablenotes\}([\s\S]*?)\\end\{tablenotes\}/.exec(rest)?.[1];
      const head = number ? `**Table ${number}** ${caption}`.trim() : caption;
      return block([head, rows.join("\n"), notes ? run(notes.replace(/\\item(\[[^\]]*\])?/g, (_x, l: string | undefined) => ` ${l ? l.slice(1, -1) : ""}`)).replace(/\s+/g, " ").trim() : ""].filter(Boolean).join("\n\n"));
    }
    if (kind === "algorithm") {
      const lines = rest
        .replace(/\\(State|Statex|STATE|Require|Ensure|REQUIRE|ENSURE|Return|RETURN|If|ElsIf|Else|EndIf|For|ForAll|EndFor|While|EndWhile|Repeat|Until|Procedure|EndProcedure|Function|EndFunction|Comment|IF|ELSE|ENDIF|FOR|ENDFOR|WHILE|ENDWHILE|Input|Output|KwIn|KwOut|KwData|KwResult)\b/g, (_x, word: string) => `\n${{ State: "", Statex: "", STATE: "" }[word] ?? `${word.replace(/^End/, "end ").replace(/^Kw/, "").toLowerCase()} `}`)
        .split("\n")
        .map((line) => run(line).replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return block([number ? `**Algorithm ${number}** ${caption}`.trim() : caption, lines.join("\n")].filter(Boolean).join("\n\n"));
    }
    return number || caption ? block(`*Figure${number ? ` ${number}` : ""}: ${caption}*`) : "\n\n";
  });
  // Displayed equations: their LaTeX on a line of their own, then their number.
  out = out.replace(MATH_ENV, (_all, env: string, star: string, inner: string) =>
    block(mathRows(env, star, inner, nextEquation).map((row) => (row.number ? `${row.latex} (${row.number})` : row.latex)).join("\n")),
  );
  out = out.replace(/\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\begin\{(displaymath|math)\}([\s\S]*?)\\end\{\3\}/g, (_all, a: string | undefined, b: string | undefined, _c, d: string | undefined) => block((a ?? b ?? d ?? "").replace(/\\label\{[^}]*\}/g, "").replace(/\s+/g, " ").trim()));
  // The abstract (theorem-like statements have their headings from numberStatements).
  out = out.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_all, inner: string) => `\n\n\u0013## Abstract\u0014\n\n${inner}\n\n`);
  // Lists: each item on a line of its own.
  out = out.replace(/\s*\\item\s*(\[[^\]]*\])?/g, (_all, label: string | undefined) => `\n\u0015${label ? `${label.slice(1, -1)} ` : ""}`);
  out = out.replace(/\\(?:begin|end)\{(?:itemize|enumerate|description|compactitem|compactenum|inparaenum|outline)\}(\[[^\]]*\])?/g, "\n\n");
  // Headings, numbered as LaTeX numbers them.
  out = out.replace(/\\appendix\b/g, "\u0016appendix\u0017{}");
  out = out.replace(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)(?![a-zA-Z])\s*(\[[^\]]*\])?/g, "\u0016$1$2\u0017");
  let result = "";
  let last = 0;
  const heading = /\u0016([a-z]+)(\*?)\u0017/g;
  // \appendix is a marker among the headings, so only the sections after it are lettered.
  for (let m = heading.exec(out); m; m = heading.exec(out)) {
    const g = group(out, m.index + m[0].length);
    if (!g) continue;
    result += out.slice(last, m.index);
    const title = run(g.body).replace(/\s+/g, " ").trim();
    if (m[1] === "appendix") {
      appendix = true;
      sections[2] = 0;
    } else if (m[1] === "paragraph" || m[1] === "subparagraph") result += `\n\n**${title.replace(/\.$/, "")}.** `;
    else {
      const level = SECTION_LEVELS[m[1]!]!;
      let number = "";
      if (!m[2]) {
        sections[level]!++;
        for (let l = level + 1; l < sections.length; l++) sections[l] = 0;
        const top = appendix ? String.fromCharCode(64 + sections[2]!) : String(sections[2]);
        number = [top, ...sections.slice(3, level + 1)].join(".") + " ";
      }
      result += `\n\n\u0013${"#".repeat(level)} ${level === 1 ? "" : number}${title}\u0014\n\n`;
    }
    last = g.end;
    heading.lastIndex = g.end;
  }
  out = result + out.slice(last);
  out = out.replace(/\\(?:begin|end)\{[a-zA-Z*]+\}(\[[^\]]*\])?(\{[^}]*\})?/g, "\n\n");
  // The prose: paragraphs split at blank lines, each read as one line.
  const paragraphs = out
    .split(/\n\s*\n/)
    .map((p) => {
      const held = p.replace(/\u0011(\d+)\u0012/g, (_x, i: string) => `\u0018${i}\u0019`);
      if (/^\s*\u0018\d+\u0019\s*$/.test(held)) return blocks[Number(/\d+/.exec(held)![0])]!;
      if (/^\s*\u0013[\s\S]*\u0014\s*$/.test(p)) return p.replace(/[\u0013\u0014]/g, "").trim();
      const items = p.split("\u0015");
      return items
        .map((item) => run(item).replace(/\s+/g, " ").trim())
        .map((item, i) => (i > 0 && item ? `- ${item}` : item))
        .filter(Boolean)
        .join("\n");
    })
    .filter((p) => p.trim());
  return paragraphs.join("\n\n").replace(/\u0011(\d+)\u0012|\u0018(\d+)\u0019/g, (_x, a: string | undefined, b: string | undefined) => blocks[Number(a ?? b)]!);
}

/** Spaces and blank lines as the other documents have them. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

/** Whether converted text is worth reading instead of the PDF: some prose, and no sign the conversion failed. */
export function readableLatex(converted: ConvertedLatex | undefined): converted is ConvertedLatex {
  if (!converted) return false;
  const words = converted.text.split(/\s+/).length;
  const unresolved = (converted.text.match(/\?\?/g) ?? []).length;
  return words >= 800 && unresolved <= Math.max(5, words / 500);
}
