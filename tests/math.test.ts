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
    assert.equal(readableMath("with $\\mathfrak{g}$ here"), "with $\\mathfrak{g}$ here");
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
