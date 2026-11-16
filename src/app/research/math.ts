// LaTeX math shown as text people read (harness 0.88.0): "$20\times$" as "20×", "$O(n^2 \cdot d)$" as
// "O(n²·d)". An arXiv paper read from its source keeps its math as written (documents/latex.ts), so a
// quote verifies against it, and answers and quotes showed "$20\times$" to the reader. Only what is shown
// changes: the answer and quotes are kept, checked and exported as written, and the shown math says, when
// pointed at, the LaTeX it came from. A formula with a command not known here is shown as written, rather
// than half read.

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
const BLACKBOARD: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", E: "𝔼", P: "ℙ", F: "𝔽", H: "ℍ", I: "𝕀", "1": "𝟙" };
const ACCENTS: Record<string, string> = { hat: "̂", widehat: "̂", bar: "̄", overline: "̅", tilde: "̃", widetilde: "̃", vec: "⃗", dot: "̇", ddot: "̈" };
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
  if (command) return { body: command[0], end: i + command[0].length };
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
      } else if (name === "mathbb" || name === "mathbbm") {
        const arg = argument(tex, i);
        const letter = BLACKBOARD[arg.body.trim()];
        if (!letter) throw new Unknown("mathbb");
        out += letter;
        i = arg.end;
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
      } else throw new Unknown(name);
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
