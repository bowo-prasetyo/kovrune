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
// Inline math stays as written ($O(n^2)$). What can't be read this way is reported as not converted, and
// the PDF is read instead (sources/arxiv.ts).

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
const DEFINITIONS = "newtcolorbox|renewtcolorbox|DeclareTColorBox|newtcbox|tcbset|tcbuselibrary|newenvironment|renewenvironment|newtheorem|definecolor|colorlet|newfloat|floatname|lstdefinestyle|lstdefinelanguage|lstset|newcolumntype|sethlcolor|setlist|pgfplotsset|usetikzlibrary|tikzset|tikzstyle|newmdenv|mdfdefinestyle|captionsetup|hypersetup|newlist|setlength|newcounter|setcounter|crefname|Crefname|crefformat|DeclareMathOperator|newacronym|definecolorset";

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
  for (const [name, text] of files) if (/\.(sty|def)$/i.test(name) && !/^(neurips|icml|iclr|acl|aaai|ieee|llncs|svjour|elsarticle|natbib|hyperref)/i.test(name.split("/").pop()!)) takeMacros(withoutComments(text), macros);
  let source = withoutDefinitions(takeMacros(inlined(files, main), macros));
  const begin = source.indexOf("\\begin{document}");
  const end = source.lastIndexOf("\\end{document}");
  const preamble = begin >= 0 ? expandMacros(source.slice(0, begin), macros) : "";
  let body = begin >= 0 ? source.slice(begin + "\\begin{document}".length, end > begin ? end : undefined) : source;
  body = expandMacros(body, macros);
  const titleArg = group(body, (/\\title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(body)?.index ?? -1) + (/\\title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(body)?.[0].length ?? 0)) ?? group(preamble, (/\\(?:icml)?title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(preamble)?.index ?? -1) + (/\\(?:icml)?title\s*(\[[^\]]*\])?\s*(?=\{)/.exec(preamble)?.[0].length ?? 0));

  // References, from the .bbl next to the main file (arXiv doesn't run BibTeX, so a source that cites has one).
  const bblName = [...files.keys()].find((n) => n.endsWith(".bbl") && n.replace(/\.bbl$/, "") === main.replace(/\.(tex|ltx)$/, "")) ?? [...files.keys()].find((n) => n.endsWith(".bbl"));
  const inlineText = (text: string) => inline(text, new Map(), new Map());
  const refs = bblName ? readBbl(expandMacros(files.get(bblName)!, macros), inlineText) : /\\begin\{thebibliography\}/.test(body) ? readBbl(body.slice(body.indexOf("\\begin{thebibliography}")), inlineText) : new Map<string, Reference>();
  // The references go where the paper prints them: before the appendix, as a rule.
  body = body.replace(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/, "\\printbibliography");
  body = body.replace(/\\bibliography\s*\{[^}]*\}|\\printbibliography\b(\[[^\]]*\])?/, "\n\n\\section*{References}\n\n").replace(/\\bibliography\s*\{[^}]*\}|\\printbibliography\b(\[[^\]]*\])?/g, "");

  const labels = numberLabels(body);
  let text = convertBody(body, labels, refs);
  if (refs.size && !/^## References$/m.test(text)) text = text.replace(/\n*$/, "") + "\n\n## References";
  text = text.replace(/^## References$/m, () => `## References\n\n${[...refs.values()].map((r) => `[${r.number}] ${r.text}`).join("\n")}`);
  const title = titleArg ? inlineText(titleArg.body.replace(/\\\\/g, " ")).replace(/\s+/g, " ").trim() : undefined;
  text = tidy(`${title ? `# ${title}\n\n` : ""}${text}`);
  return { ...(title ? { title } : {}), text };
}

interface Label {
  kind: "section" | "table" | "figure" | "equation" | "algorithm" | "appendix" | "item";
  number: string;
}

const FLOAT_ENV = new RegExp(String.raw`\\begin\{(${FLOATS})\}([\s\S]*?)\\end\{\1\}`, "g");
const MATH_ENV = new RegExp(String.raw`\\begin\{(${NUMBERED_MATH})(\*?)\}([\s\S]*?)\\end\{\1\2\}`, "g");
const HAS_CAPTION = /\\caption(?:of)?(?![a-zA-Z])/;

/** A float's kind, by its environment's name. */
function floatKind(env: string): "table" | "figure" | "algorithm" {
  return /table/.test(env) ? "table" : /algorithm/.test(env) ? "algorithm" : "figure";
}

/** A displayed equation environment's rows, each with its number or none: an align numbers each row not marked \nonumber. */
function mathRows(env: string, star: string, inner: string, next: () => number): Array<{ latex: string; number?: number; labels: string[] }> {
  const rows = /align|gather|eqnarray|flalign|alignat/.test(env) ? inner.split(/\\\\(?:\[[^\]]*\])?/) : [inner];
  return rows.flatMap((row) => {
    const labels = [...row.matchAll(/\\label\{([^}]*)\}/g)].map((l) => l[1]!.trim());
    const latex = row.replace(/\\(?:label\{[^}]*\}|nonumber|notag)/g, "").replace(/\s+/g, " ").trim();
    if (!latex) return [];
    const numbered = !star && !/\\(?:nonumber|notag)\b/.test(row);
    return [{ latex, ...(numbered ? { number: next() } : {}), labels }];
  });
}

/** The number each \label gets, as LaTeX numbers it: sections, tables, figures, algorithms, equations. */
function numberLabels(body: string): Map<string, Label> {
  const labels = new Map<string, Label>();
  const counts = { table: 0, figure: 0, algorithm: 0 };
  for (const [, env, inner] of body.matchAll(FLOAT_ENV)) {
    const kind = floatKind(env!);
    if (!HAS_CAPTION.test(inner!)) continue;
    const number = String(++counts[kind]);
    for (const l of inner!.matchAll(/\\label\{([^}]*)\}/g)) labels.set(l[1]!.trim(), { kind, number });
  }
  const outside = body.replace(FLOAT_ENV, "");
  let equation = 0;
  for (const [, env, star, inner] of outside.matchAll(MATH_ENV)) {
    for (const row of mathRows(env!, star!, inner!, () => ++equation)) for (const l of row.labels) labels.set(l, { kind: "equation", number: row.number ? String(row.number) : "" });
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
  const word = { section: "Section", table: "Table", figure: "Figure", equation: "Equation", algorithm: "Algorithm", appendix: "Appendix", item: "" }[label.kind];
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
    .replace(/\\([cvuH'`"^~=.])\s*\{?\\?([a-zA-Z])\}?/g, (all, accent: string, letter: string) => ACCENTS[accent]?.[letter] ?? letter)
    .replace(/\{\\(?:ss)\}|\\ss\b/g, "ß").replace(/\{\\o\}|\\o\b(?![a-z])/g, "ø").replace(/\{\\O\}/g, "Ø").replace(/\{\\aa\}|\\aa\b/g, "å").replace(/\{\\AA\}/g, "Å").replace(/\{\\ae\}|\\ae\b/g, "æ").replace(/\{\\l\}|\\l\b(?![a-z])/g, "ł").replace(/\{\\L\}/g, "Ł").replace(/\\i\b(?![a-z])/g, "i");
}

/** Text with math kept as written and everything else read as text: the converter for a run of prose. */
function inline(text: string, labels: Map<string, Label>, refs: Map<string, Reference>): string {
  // Math is kept as written; it is set aside so the text conversions don't touch it.
  const math: string[] = [];
  const keep = (m: string) => `\u000e${math.push(m) - 1}\u000f`;
  let out = text.replace(/\\\$/g, "\u0007");
  out = out.replace(/\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\[\s\S])+\$|\\\((?:[\s\S]*?)\\\)/g, (m) => keep(m.replace(/\s+/g, " ")));
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
function convertBody(body: string, labels: Map<string, Label>, refs: Map<string, Reference>): string {
  const counts = { table: 0, figure: 0, algorithm: 0, equation: 0 };
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
    block(mathRows(env, star, inner, () => ++counts.equation).map((row) => (row.number ? `${row.latex} (${row.number})` : row.latex)).join("\n")),
  );
  out = out.replace(/\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\begin\{(displaymath|math)\}([\s\S]*?)\\end\{\3\}/g, (_all, a: string | undefined, b: string | undefined, _c, d: string | undefined) => block((a ?? b ?? d ?? "").replace(/\\label\{[^}]*\}/g, "").replace(/\s+/g, " ").trim()));
  // The abstract, and other titled environments.
  out = out.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_all, inner: string) => `\n\n\u0013## Abstract\u0014\n\n${inner}\n\n`);
  out = out.replace(/\\begin\{(theorem|lemma|proposition|corollary|definition|remark|example|proof|assumption|claim)\*?\}(\[[^\]]*\])?/g, (_all, env: string, name: string | undefined) => `\n\n${env[0]!.toUpperCase()}${env.slice(1)}${name ? ` (${name.slice(1, -1)})` : ""}. `);
  out = out.replace(/\\end\{(theorem|lemma|proposition|corollary|definition|remark|example|proof|assumption|claim)\*?\}/g, "\n\n");
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
