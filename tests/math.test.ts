// LaTeX math shown as text people read (harness 0.88.0): only what is shown changes; a formula with a
// command not read here is shown as written.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathSegments, readableFormula, readableMath } from "../src/app/research/math.ts";

describe("math in an answer or a quote", () => {
  it("is shown with symbols, scripts and fractions", () => {
    assert.equal(readableMath("PlanetServe demonstrates $20\\times$ lower cost."), "PlanetServe demonstrates 20× lower cost.");
    assert.equal(readableMath("costs $O(n^2 \\cdot d)$ per layer"), "costs O(n² · d) per layer");
    assert.equal(readableMath("the state $h_{t-1}$"), "the state hₜ₋₁");
    assert.equal(readableMath("set $\\alpha = 10^{-4}$ and $\\beta_1 = 0.9$"), "set α = 10⁻⁴ and β₁ = 0.9");
    assert.equal(readableMath("$\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}(\\frac{QK^T}{\\sqrt{d_k}})V$"), "Attention(Q, K, V) = softmax(QKᵀ/√dₖ)V");
    assert.equal(readableMath("$\\frac{a+b}{2}$ and $x \\in \\mathbb{R}^d$"), "(a+b)/2 and x ∈ ℝᵈ");
    assert.equal(readableMath("\\(p \\leq 0.05\\)"), "p ≤ 0.05");
  });

  it("keeps a script that has no Unicode letter as ^ or _, and an unknown command as written", () => {
    assert.equal(readableFormula("x^{q+1}"), "x^(q+1)", "q has no superscript");
    assert.equal(readableFormula("W_Q"), "W_Q");
    assert.equal(readableMath("with $\\overbrace{x}$ here"), "with $\\overbrace{x}$ here");
    assert.equal(readableMath("an $\\sqrt[3]{x}$ root"), "an $\\sqrt[3]{x}$ root");
  });

  it("leaves prices and plain text alone", () => {
    assert.equal(readableMath("It costs $5 and $10 a month."), "It costs $5 and $10 a month.");
    assert.equal(readableMath("No math here, 50% of runs."), "No math here, 50% of runs.");
  });

  it("reads a displayed equation line, with its number, and leaves prose that names a command", () => {
    assert.equal(readableMath("We minimise\n\\mathcal{L} = -\\sum_i \\log p(y_i \\mid x_i) (1)\nover the data."), "We minimise\nL = -∑ᵢ log p(yᵢ ∣ xᵢ) (1)\nover the data.");
    assert.equal(readableMath("The macro \\newcommand defines a short name for a long command."), "The macro \\newcommand defines a short name for a long command.");
  });

  it("keeps the LaTeX each shown formula came from, for the reader to point at", () => {
    assert.deepEqual(mathSegments("costs $20\\times$ less"), [{ text: "costs " }, { text: "20×", latex: "$20\\times$" }, { text: " less" }]);
    assert.deepEqual(mathSegments("plain"), [{ text: "plain" }]);
  });
});

describe("a script that is a command with an argument (harness 0.91.0)", () => {
  it("reads p_\\mathrm{T} and E_\\text{kin} whole", () => {
    assert.equal(readableFormula("p_\\mathrm{T} > 30"), "p_T > 30");
    assert.equal(readableFormula("E_\\text{kin}"), "Eₖᵢₙ");
    assert.equal(readableFormula("x^{\\mathrm{2}}"), "x²");
  });
});

describe("math compared as math (harness 0.95.0)", () => {
  it("writes LaTeX, ASCII and Unicode forms of a formula alike", async () => {
    const { mathMatchKey } = await import("../src/documents/math.ts");
    const same = (a: string, b: string) => assert.equal(mathMatchKey(a).normalize("NFKC"), mathMatchKey(b).normalize("NFKC"), `${a} | ${b}`);
    same("$p \\geq 7$", "p >= 7");
    same("$p \\geq 7$", "p ≥ 7");
    same("$|A \\cap (A + r)| \\geq |A|^2/(2p)$", "|A ∩ (A + r)| ≥ |A|²/(2p)");
    same("$\\frac{1}{8}$", "1/8");
    same("$\\frac{4s}{d+2}$", "4s/(d+2)");
    same("$\\mathbb{Z}/p\\mathbb{Z}$", "Z/pZ");
    same("$\\Re(s) > 1$", "Re(s) > 1");
    same("$V \\in L^p$", "V in L^p");
    assert.notEqual(mathMatchKey("p \\geq 7"), mathMatchKey("p > 7"));
    assert.notEqual(mathMatchKey("\\frac{1}{8}"), mathMatchKey("1/4"));
    assert.notEqual(mathMatchKey("A \\cap B"), mathMatchKey("A ∪ B"));
  });
});

describe("more of a paper's math read (harness 0.98.0)", () => {
  it("reads every blackboard and Fraktur letter, and the relations and arrows papers use", () => {
    assert.equal(readableMath("$\\mathbb{A}^n$ over $\\mathbb{F}_q$"), "𝔸ⁿ over 𝔽_q");
    assert.equal(readableMath("$\\mathfrak{g} = \\mathfrak{gl}_n$"), "𝔤 = 𝔤𝔩ₙ");
    assert.equal(readableFormula("H \\hookrightarrow G \\twoheadrightarrow Q"), "H ↪ G ↠ Q");
    assert.equal(readableFormula("N \\rtimes H"), "N ⋊ H");
    assert.equal(readableFormula("x \\leqslant y \\nmid z"), "x ≤ y ∤ z");
  });

  it("writes operators a paper declares upright, and reads \\pmod, \\binom and spacing", () => {
    assert.equal(readableFormula("\\Irr(G)"), "Irr (G)");
    assert.equal(readableFormula("\\Hom(V, W)"), "Hom (V, W)");
    assert.equal(readableFormula("\\tr(A)"), "tr (A)");
    assert.equal(readableFormula("a \\equiv b \\pmod{p}"), "a ≡ b (mod p)");
    assert.equal(readableFormula("\\binom{n}{k}"), "C(n, k)");
    assert.equal(readableFormula("x\\hspace{1em}y"), "x y");
    assert.equal(readableFormula("\\Q(\\sqrt{2})"), "ℚ(√2)");
  });

  it("still shows a lowercase macro it does not know as written", () => {
    assert.equal(readableMath("an $\\wt{x}$ here"), "an $\\wt{x}$ here");
  });
});
