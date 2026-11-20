// LaTeX math shown as text people read (harness 0.88.0): "$20\times$" as "20×", "$O(n^2 \cdot d)$" as
// "O(n²·d)". An arXiv paper read from its source keeps its math as written (documents/latex.ts), so a
// quote verifies against it, and answers and quotes showed "$20\times$" to the reader. Only what is shown
// changes: the answer and quotes are kept, checked and exported as written, and the shown math says, when
// pointed at, the LaTeX it came from. A formula with a command not known here is shown as written, rather
// than half read.
//
// Since harness 0.91.0 the sentence check reads numbers through it too (agent/support.ts), so a quote of
// "$1.2\times10^{-3}$" gives the number an answer writes as "1.2 × 10⁻³", and the LaTeX converter writes
// a formula a paper's macro puts in running text (\ensuremath) as text (documents/latex.ts).

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ",
  varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", cdotp: "·", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "•",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", sim: "∼", simeq: "≃", cong: "≅", equiv: "≡", propto: "∝",
  ll: "≪", gg: "≫", infty: "∞", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", oint: "∮",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬", lnot: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨",
  oplus: "⊕", otimes: "⊗", odot: "⊙", top: "⊤", bot: "⊥", perp: "⊥", parallel: "∥", mid: "∣", vert: "|", lvert: "|", rvert: "|",
  Vert: "‖", lVert: "‖", rVert: "‖", langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  to: "→", rightarrow: "→", leftarrow: "←", gets: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔",
  implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
  ell: "ℓ", hbar: "ℏ", prime: "′", degree: "°", dagger: "†", checkmark: "✓", triangleq: "≜", coloneqq: "≔", colon: ":",
  succ: "≻", prec: "≺", succeq: "⪰", preceq: "⪯", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁", bigotimes: "⨂", Re: "ℜ", Im: "ℑ", aleph: "ℵ",
  hdots: "…", backslash: "\\", textless: "<", textgreater: ">", lbrace: "{", rbrace: "}",
  varGamma: "Γ", varDelta: "Δ", varTheta: "Θ", varLambda: "Λ", varXi: "Ξ", varPi: "Π", varSigma: "Σ", varUpsilon: "Υ", varPhi: "Φ", varPsi: "Ψ", varOmega: "Ω",
  "%": "%", "#": "#", "&": "&", _: "_", "{": "{", "}": "}", $: "$",
};
/** Functions written upright: \log x is "log x". */
const FUNCTIONS = new Set("log ln lg exp sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh max min argmax argmin arg lim sup inf det dim ker deg gcd Pr".split(" "));
/** Commands that only change the type: their argument is kept. */
const KEEP = new Set("mathrm mathbf mathit mathsf mathtt mathcal mathscr mathnormal text textrm textbf textit textsf texttt textsc textup textnormal emph operatorname boldsymbol bm mbox hbox".split(" "));
/** Commands that print nothing: spacing and sizing. */
const NOTHING = new Set(
  "left right big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr middle limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle tiny scriptsize footnotesize small normalsize large Large rm sf tt bf it sl sc em mathstrut strut".split(" "),
);
const SPACES: Record<string, string> = { ",": " ", ";": " ", ":": " ", " ": " ", "!": "", quad: " ", qquad: "  ", enspace: " ", thinspace: " " };
/*
 * More of a paper's math read (harness 0.98.0), from the mathematician's audit (M8): on 48 arXiv mathematics papers,
 * 9.3% of inline formulas were shown as written, mostly for \mathbb with a letter beyond R, N, Z, Q, C, \mathfrak,
 * the operators papers declare (\Irr, \GL, \End, \Hom, \Gal), relations such as \leqslant and \hookrightarrow,
 * and \pmod, \binom and \hspace.
 */
/** A letter in an alphabet of Unicode's mathematical letters: the capitals from `capital`, the small letters from `small`, with the exceptions Unicode keeps elsewhere. */
function alphabet(capital: number, small: number | undefined, exceptions: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    const upper = String.fromCharCode(65 + i);
    const lower = String.fromCharCode(97 + i);
    out[upper] = exceptions[upper] ?? String.fromCodePoint(capital + i);
    if (small !== undefined) out[lower] = exceptions[lower] ?? String.fromCodePoint(small + i);
  }
  return out;
}
const BLACKBOARD: Record<string, string> = {
  ...alphabet(0x1d538, 0x1d552, { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" }),
  ...Object.fromEntries([..."0123456789"].map((d, i) => [d, String.fromCodePoint(0x1d7d8 + i)])),
};
const FRAKTUR: Record<string, string> = alphabet(0x1d504, 0x1d51e, { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" });
/** Relations, arrows and symbols beyond SYMBOLS that mathematics papers use. */
const MORE_SYMBOLS: Record<string, string> = {
  leqslant: "≤", geqslant: "≥", leqq: "≦", geqq: "≧", lesssim: "≲", gtrsim: "≳", nleq: "≰", ngeq: "≱", asymp: "≍", nmid: "∤", divides: "∣",
  hookrightarrow: "↪", hookleftarrow: "↩", twoheadrightarrow: "↠", twoheadleftarrow: "↞", longrightarrow: "⟶", longleftarrow: "⟵", longmapsto: "⟼",
  Longrightarrow: "⟹", Longleftarrow: "⟸", Longleftrightarrow: "⟺", longleftrightarrow: "⟷", rightleftharpoons: "⇌", leftrightarrows: "⇆", rightrightarrows: "⇉",
  nearrow: "↗", searrow: "↘", nwarrow: "↖", swarrow: "↙", dashrightarrow: "⇢", rightsquigarrow: "⇝", curvearrowright: "↷",
  rtimes: "⋊", ltimes: "⋉", bowtie: "⋈", wr: "≀", amalg: "⨿", coprod: "∐", sqcup: "⊔", sqcap: "⊓", bigsqcup: "⨆", uplus: "⊎", biguplus: "⨄", ominus: "⊖",
  subsetneq: "⊊", supsetneq: "⊋", nsubseteq: "⊈", nsupseteq: "⊉", sqsubseteq: "⊑", sqsupseteq: "⊒", Subset: "⋐", Supset: "⋑",
  lhd: "⊲", rhd: "⊳", unlhd: "⊴", unrhd: "⊵", triangleleft: "◁", triangleright: "▷", vartriangleleft: "⊲", trianglelefteq: "⊴", trianglerighteq: "⊵", ntriangleleft: "⋪",
  models: "⊨", vdash: "⊢", dashv: "⊣", nexists: "∄", square: "□", Box: "□", blacksquare: "■", diamond: "⋄", lozenge: "◊", angle: "∠", measuredangle: "∡",
  sharp: "♯", flat: "♭", natural: "♮", Bbbk: "𝕜", wp: "℘", mho: "℧", imath: "ı", jmath: "ȷ", varkappa: "ϰ", digamma: "ϝ", eth: "ð", beth: "ℶ", gimel: "ℷ",
  dotsc: "…", dotsb: "⋯", dotsm: "⋯", dotso: "…", dotsi: "⋯", prec: "≺", succ: "≻", preccurlyeq: "≼", succcurlyeq: "≽", lll: "⋘", ggg: "⋙", circeq: "≗", doteq: "≐",
  bigodot: "⨀", bigvee: "⋁", bigwedge: "⋀", iint: "∬", iiint: "∭", complement: "∁", varnothing: "∅", lbrack: "[", rbrack: "]", vert: "|", mid: "∣",
};
/** Shorthands papers define for number systems, read where the paper's own definition was not: \Q, \Z, \R, \C, \N. */
const NUMBER_SETS: Record<string, string> = { Q: "ℚ", Z: "ℤ", R: "ℝ", C: "ℂ", N: "ℕ" };
/**
 * Operators a paper declares with \DeclareMathOperator, which the converter does not read, written upright as
 * their names: a command of two to seven letters starting with a capital ("Irr", "GL", "End", "Hom", "Gal",
 * "Spec") or one of these lowercase ones. Shown only; a command the paper defines otherwise reads as its name.
 */
const LOWER_OPERATORS = new Set("tr ord rank rk im coker codim id sgn lcm supp diam vol dist Res res span ad".split(" "));
const OPERATOR_NAME = /^[A-Z][A-Za-z]{1,6}$/;
/** Commands whose argument is layout, not text: \hspace{1em}, \phantom{x}. */
const DROPPED_WITH_ARGUMENT = new Set(["hspace", "vspace", "phantom", "hphantom", "vphantom", "label", "rule"]);
const ACCENTS: Record<string, string> = { hat: "̂", widehat: "̂", bar: "̄", overline: "̅", tilde: "̃", widetilde: "̃", vec: "⃗", dot: "̇", ddot: "̈", breve: "̆", check: "̌", acute: "́", grave: "̀", underline: "̲", mathring: "̊" };
// Every lower-case letter has a superscript but q; few have a subscript.
const SUPER: Record<string, string> = Object.fromEntries(
  [..."0123456789+-=()abcdefghijklmnoprstuvwxyzT*'"].map((c, i) => [c, [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᵀ*′"][i]!]),
);
const SUB: Record<string, string> = Object.fromEntries([..."0123456789+-=()aehijklmnoprstuvx"].map((c, i) => [c, "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"[i]!]));

class Unknown extends Error {}

/** A {…} group at `at`, or a single token (a character, or a command) when there is no group. */
function argument(tex: string, at: number): { body: string; end: number } {
  let i = at;
  while (tex[i] === " ") i++;
  if (tex[i] === "{") {
    let depth = 0;
    for (let j = i; j < tex.length; j++) {
      if (tex[j] === "\\") j++;
      else if (tex[j] === "{") depth++;
      else if (tex[j] === "}" && --depth === 0) return { body: tex.slice(i + 1, j), end: j + 1 };
    }
    throw new Unknown("unclosed group");
  }
  const command = /^\\([a-zA-Z]+|.)/.exec(tex.slice(i));
  if (command) {
    // A script that is a command with an argument takes the argument too: "p_\mathrm{T}" is p_T (harness 0.91.0).
    const name = command[1]!;
    if (KEEP.has(name) || name in ACCENTS || name === "mathbb" || name === "mathbbm" || name === "mathfrak" || name === "mathds") {
      const arg = argument(tex, i + command[0].length);
      return { body: tex.slice(i, arg.end), end: arg.end };
    }
    return { body: command[0], end: i + command[0].length };
  }
  if (i >= tex.length) throw new Unknown("missing argument");
  return { body: tex[i]!, end: i + 1 };
}

/** A script in superscript or subscript characters when each has one, else "^(…)" or "_(…)". */
function script(text: string, map: Record<string, string>, mark: string): string {
  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length && chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
  return chars.length === 1 ? `${mark}${text}` : `${mark}(${text})`;
}

/** One side of a fraction, in parentheses when it is more than one term: "(a+b)/c". */
const operand = (text: string) => (/^[\p{L}\p{N}.′⁰¹²³⁴⁵⁶⁷⁸⁹ⁿᵀ₀₁₂₃₄₅₆₇₈₉ₖᵢⱼₜ√]+$|^\(.*\)$/u.test(text) ? text : `(${text})`);

/** LaTeX math as text; throws Unknown at a command or construct not read here. */
function readMath(tex: string): string {
  let out = "";
  for (let i = 0; i < tex.length; ) {
    const c = tex[i]!;
    if (c === "\\") {
      const name = /^\\([a-zA-Z]+|.)/.exec(tex.slice(i))![1]!;
      i += name.length + 1;
      if (name in SYMBOLS) out += SYMBOLS[name];
      else if (name in MORE_SYMBOLS) out += MORE_SYMBOLS[name];
      else if (name in SPACES) out += SPACES[name];
      else if (NOTHING.has(name)) continue;
      else if (FUNCTIONS.has(name)) out += name === "argmax" || name === "argmin" ? `arg ${name.slice(3)} ` : `${name} `;
      else if (KEEP.has(name)) {
        const arg = argument(tex, i);
        out += readMath(arg.body);
        i = arg.end;
      } else if (name === "not") {
        // \not\in, \not= : the next symbol struck through.
        const next = argument(tex, i);
        out += `${readMath(next.body)}\u0338`;
        i = next.end;
      } else if (name === "mathbb" || name === "mathbbm" || name === "mathds" || name === "mathfrak") {
        // Each letter of the argument in its alphabet: \mathbb{A} is "𝔸", \mathfrak{gl} is "𝔤𝔩".
        const arg = argument(tex, i);
        const map = name === "mathfrak" ? FRAKTUR : BLACKBOARD;
        const letters = [...arg.body.replace(/\s+/g, "")];
        if (!letters.length || !letters.every((l) => map[l])) throw new Unknown(name);
        out += letters.map((l) => map[l]).join("");
        i = arg.end;
      } else if (DROPPED_WITH_ARGUMENT.has(name)) {
        const arg = argument(tex, i);
        i = name === "rule" ? argument(tex, arg.end).end : arg.end;
        if (name === "hspace" || name.endsWith("phantom")) out += " ";
      } else if (name === "pmod") {
        const arg = argument(tex, i);
        out += ` (mod ${readMath(arg.body).trim()})`;
        i = arg.end;
      } else if (name === "bmod" || name === "mod") {
        out += " mod ";
      } else if (name === "binom" || name === "dbinom" || name === "tbinom") {
        const top = argument(tex, i);
        const bottom = argument(tex, top.end);
        out += `C(${readMath(top.body).trim()}, ${readMath(bottom.body).trim()})`;
        i = bottom.end;
      } else if (name in ACCENTS) {
        const arg = argument(tex, i);
        const inner = readMath(arg.body);
        out += [...inner].length === 1 ? `${inner}${ACCENTS[name]}` : `${inner}${ACCENTS[name]}`;
        i = arg.end;
      } else if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "sfrac" || name === "nicefrac") {
        const top = argument(tex, i);
        const bottom = argument(tex, top.end);
        out += `${operand(readMath(top.body).trim())}/${operand(readMath(bottom.body).trim())}`;
        i = bottom.end;
      } else if (name === "sqrt") {
        if (tex[i] === "[") throw new Unknown("nth root");
        const arg = argument(tex, i);
        out += `√${operand(readMath(arg.body).trim())}`;
        i = arg.end;
      } else if (name in NUMBER_SETS) out += NUMBER_SETS[name];
      else if (OPERATOR_NAME.test(name) || LOWER_OPERATORS.has(name)) out += `${name} `;
      else throw new Unknown(name);
    } else if (c === "^" || c === "_") {
      const arg = argument(tex, i + 1);
      const inner = readMath(arg.body);
      out += script(inner, c === "^" ? SUPER : SUB, c);
      i = arg.end;
    } else if (c === "{" || c === "}") i++;
    else if (c === "~") (out += " "), i++;
    else if (c === "&") i++; // an alignment point
    else (out += c), i++;
  }
  return out;
}

/** A formula as text, or undefined when it holds something not read here. */
export function readableFormula(tex: string): string | undefined {
  try {
    return readMath(tex).replace(/\s+/g, " ").replace(/ ([,.;)])/g, "$1").replace(/\( /g, "(").trim();
  } catch (error) {
    if (error instanceof Unknown) return undefined;
    throw error;
  }
}

export interface MathSegment {
  /** What is shown. */
  text: string;
  /** For math shown as text: the LaTeX it came from, delimiters included. */
  latex?: string;
}

/**
 * Inline math: "$…$", "\(…\)" and "\[…\]". A "$" span is math only when it has a TeX mark (\, ^, _ or {)
 * or reads as a short formula, so prices ("$5 and $10") are left alone.
 */
const INLINE = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
const looksLikeMath = (body: string) => /[\\^_{]/.test(body) || (!/\b[a-z]{3,}\s+[a-z]{3,}\b/i.test(body) && body.length <= 24 && !/^\s|\s$/.test(body));

/**
 * A displayed equation as the LaTeX converter writes it: a line of LaTeX, often ending with its number,
 * "\mathcal{L} = -\sum_i \log p(y_i \mid x_i) (1)". A line counts when it has a command and no run of
 * plain words outside commands, so prose that names a command stays prose.
 */
function displayed(line: string): boolean {
  if (!/\\[a-zA-Z]+/.test(line) || /\$/.test(line)) return false;
  const outside = line.replace(/\\[a-zA-Z]+(\{[^{}]*\})?/g, " ").replace(/\{[^{}]*\}/g, " ");
  return !/\b[a-zA-Z]{3,}\s+[a-zA-Z]{3,}\s+[a-zA-Z]{3,}\b/.test(outside);
}

/** Text in segments, the math among them shown as text where it can be read. */
export function mathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const plain = (s: string) => {
    if (!s) return;
    // Displayed equations, a line each.
    const lines = s.split(/(\n)/);
    for (const line of lines) {
      const number = /^(.*?)(\s*\(\d+\))?$/.exec(line)!;
      const readable = line !== "\n" && displayed(line) ? readableFormula(number[1]!) : undefined;
      if (readable !== undefined) segments.push({ text: `${readable}${number[2] ?? ""}`, latex: line });
      else if (line) segments.push({ text: line });
    }
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const body = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    if (m[2] !== undefined && !looksLikeMath(body)) continue;
    const readable = readableFormula(body);
    if (readable === undefined) continue;
    plain(text.slice(last, m.index));
    segments.push({ text: readable, latex: m[0] });
    last = m.index! + m[0].length;
  }
  plain(text.slice(last));
  // Neighbouring plain segments are joined, so the text renders as it was.
  return segments.reduce<MathSegment[]>((out, s) => {
    const prev = out.at(-1);
    if (prev && !prev.latex && !s.latex) prev.text += s.text;
    else out.push({ ...s });
    return out;
  }, []);
}

/** Text with its math shown as text: for a tooltip or another place that takes a string. */
export function readableMath(text: string): string {
  return mathSegments(text)
    .map((s) => s.text)
    .join("");
}

/*
 * Math compared as math (harness 0.95.0). A model quoting a paper's LaTeX writes the same formula in another
 * form, and seldom inside dollar signs: "p >= 7" or "p ≥ 7" for "$p \geq 7$", "|A ∩ (A + r)|" for
 * "$|A \cap (A + r)|$", "|A|^2/(2p)" for "$|A|^2/(2p)$", "1/8" for "$\frac{1}{8}$". The mathematics suite's
 * first runs failed six right answers this way (eval/math/README.md). mathMatchKey writes a text so that
 * these forms are one: each is read the same way on both sides, the quote and the source, whatever their
 * dollar signs. It is for comparing only, never shown, and loses what a comparison of quotes can spare.
 */

/** Wrappers whose argument is the text: "\mathrm{Gal}" is "Gal", "\mathbb{Z}" is "Z". */
const KEY_WRAPPERS = new Set([...KEEP, "mathbb", "mathfrak", "mathds", "mathbbm", "ensuremath", "hat", "widehat", "bar", "overline", "tilde", "widetilde", "vec", "dot", "ddot", "underline"]);

/** One spelling for relations and operators written in ASCII, other Unicode forms or other letters. */
const KEY_SYMBOLS: Array<[RegExp, string]> = [
  [/>=|⩾|≧/g, "≥"],
  [/<=|⩽|≦/g, "≤"],
  [/!=|=\/=/g, "≠"],
  [/<->|↔/g, "⟷"],
  [/->|⟶/g, "→"],
  [/<-|⟵/g, "←"],
  [/=>|⟹/g, "⇒"],
  [/[∣∥‖]/g, "|"],
  [/[⋅∙]/g, "·"],
  [/∗/g, "*"],
  [/[−–]/g, "-"],
  [/ϕ/g, "φ"],
  [/ϵ/g, "ε"],
  [/ϑ/g, "θ"],
  [/ϱ/g, "ρ"],
  [/…|\.\.\./g, "⋯"],
  // "V in L^p" is how a model writes "$V \in L^p$" in words.
  [/∈/g, " in "],
];

/** Characters around which spacing means nothing in a formula: relations, operators and brackets. */
const KEY_TIGHT = /\s*([≤≥≠=<>+\-·×÷±∓/*∩∪∉∋⊂⊆⊃⊇∖→←⇒⇔⟷↦|()[\]⟨⟩,.:;?!^_√∑∏∫∞∀∃¬∧∨⊕⊗∘])\s*/g;

/**
 * A text written so that math in any of its common forms reads the same: LaTeX commands read as their
 * symbols wherever they are (in or out of "$"), a wrapper as its argument, "\frac{a}{b}" as "a/b" and
 * "\sqrt{x}" as "√x"; "$", braces, "^" and "_" dropped (NFKC, which normalizeForMatch applies, then makes
 * "²" "2" and "ℤ" "Z"); ASCII relations as their symbols (">=" is "≥"); and no spaces around relations,
 * operators and brackets. An unknown command keeps its name without its backslash.
 */
export function mathMatchKey(text: string): string {
  let out = text;
  // \frac and \sqrt first, inside out, while their braces still group.
  for (let pass = 0; pass < 4; pass++) {
    out = out.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)").replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  }
  out = out.replace(/\\([a-zA-Z]+)\*?/g, (all, name: string) => {
    if (SYMBOLS[name] !== undefined) return ` ${SYMBOLS[name]} `;
    // A wrapper is its argument, joined as it was: "p\mathbb{Z}" is "pZ".
    if (NOTHING.has(name) || KEY_WRAPPERS.has(name) || ACCENTS[name] !== undefined) return "";
    if (SPACES[name] !== undefined) return " ";
    if (FUNCTIONS.has(name)) return ` ${name} `;
    // A line break or tab a model's JSON wrote out ("\\nQuestion 1"), not a command.
    if (/^[nrt](?:[A-Z]|$)/.test(name)) return ` ${name.slice(1)}`;
    return name;
  });
  out = out.replace(/\\[,;:! ]/g, " ").replace(/\\[nrt](?![a-zA-Z])/g, " ").replace(/[$]/g, "").replace(/[{}]/g, "").replace(/[\^_]/g, "");
  // The real and imaginary parts as models write them, and as \operatorname{Re} reads, before NFKC makes "ℜ" an "R".
  out = out.replace(/ℜ/g, "Re").replace(/ℑ/g, "Im").normalize("NFKC");
  for (const [pattern, symbol] of KEY_SYMBOLS) out = out.replace(pattern, symbol);
  // A fraction's parentheses are its own, so "(1)/(8)" is "1/8", and "(4s)/(d+2)" stays as written.
  out = out.replace(/\((\w+)\)\/\((\w+)\)/g, "$1/$2").replace(/\((\w+)\)\//g, "$1/").replace(/\/\((\w+)\)/g, "/$1");
  return out.replace(KEY_TIGHT, "$1").replace(/\s+/g, " ").trim();
}
