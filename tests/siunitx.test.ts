// Quantities written with siunitx and hepunits, read as the PDF prints them (harness 0.90.0): before, the
// converter read "\SI{1.5}{\milli\electronvolt}" as "1.5", losing every unit (src/documents/siunitx.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { latexToText } from "../src/documents/latex.ts";
import { formatNumber, formatUnit, looksLikeNumber, siunitxSetup, siunitxToText } from "../src/documents/siunitx.ts";

const plain = siunitxSetup([]);

describe("siunitx numbers", () => {
  it("writes a number as siunitx prints it", () => {
    const cases: Array<[string, string]> = [
      ["1.2e-3", "1.2 × 10⁻³"],
      ["6.022e23", "6.022 × 10²³"],
      ["1e1", "1 × 10¹"],
      ["e5", "10⁵"],
      ["-5", "−5"],
      [".5", "0.5"],
      ["1,5", "1.5"],
      ["3.2(4)", "3.2(4)"],
      ["0.52 +- 0.01", "0.52 ± 0.01"],
      ["0.52 \\pm 0.01", "0.52 ± 0.01"],
      ["1.2+-0.1e-3", "(1.2 ± 0.1) × 10⁻³"],
      ["<1e-3", "< 1 × 10⁻³"],
      ["\\approx 3", "≈ 3"],
      ["12345", "12345"],
    ];
    for (const [input, written] of cases) assert.equal(formatNumber(input), written, input);
  });

  it("tells a number from other arguments", () => {
    assert.ok(looksLikeNumber("1.2e-3"));
    assert.ok(looksLikeNumber("0.52 +- 0.01"));
    assert.ok(!looksLikeNumber("\\frac{a}{b}"));
    assert.ok(!looksLikeNumber("x"));
  });
});

describe("siunitx units", () => {
  it("joins prefixes to units and writes powers as superscripts", () => {
    const cases: Array<[string, string]> = [
      ["\\milli\\electronvolt", "meV"],
      ["\\kilo\\metre\\per\\second\\per\\mega\\parsec", "km s⁻¹ Mpc⁻¹"],
      ["\\per\\square\\centi\\metre\\per\\second", "cm⁻² s⁻¹"],
      ["\\metre\\squared", "m²"],
      ["\\femto\\barn\\tothe{-1}", "fb⁻¹"],
      ["\\joule\\per\\mole\\per\\kelvin", "J mol⁻¹ K⁻¹"],
      ["\\electronvolt\\per\\clight\\squared", "eV c⁻²"],
      ["\\micro\\kelvin", "μK"],
      ["\\angstrom", "Å"],
      ["\\GeV", "GeV"],
      ["\\pm", "pm"],
      ["GeV/c^2", "GeV/c²"],
      ["kg.m/s^2", "kg m/s²"],
      ["\\mu m", "μm"],
      ["\\mathrm{GeV}", "GeV"],
      ["\\furlong", "furlong"],
    ];
    for (const [input, written] of cases) assert.equal(formatUnit(input, plain), written, input);
  });

  it("writes \\per as a slash when the paper sets per-mode to symbol", () => {
    const symbol = siunitxSetup(["\\sisetup{per-mode = symbol, separate-uncertainty}"]);
    assert.equal(formatUnit("\\metre\\per\\second", symbol), "m/s");
    assert.equal(formatUnit("\\joule\\per\\mole\\per\\kelvin", symbol), "J/(mol K)");
    assert.equal(siunitxToText("\\SI[per-mode=symbol]{3}{\\metre\\per\\second}", plain), "3 m/s");
  });

  it("reads the units a paper declares", () => {
    const declared = siunitxSetup(["\\DeclareSIUnit\\parsec{pc}\\DeclareSIUnit{\\kms}{\\kilo\\metre\\per\\second}\\DeclareSIUnit\\Msun{M_\\odot}"]);
    assert.equal(formatUnit("\\kms\\per\\mega\\parsec", declared), "km s⁻¹ Mpc⁻¹");
    assert.equal(siunitxToText("\\SI{4e6}{\\Msun}", declared), "4 × 10⁶ M☉");
  });
});

describe("siunitx and hepunits commands in text", () => {
  it("writes quantities, ranges, lists, products and angles", () => {
    const cases: Array<[string, string]> = [
      ["a gap of \\SI{1.5}{\\milli\\electronvolt}", "a gap of 1.5 meV"],
      ["a lifetime of \\qty{12.5}{\\pico\\second}", "a lifetime of 12.5 ps"],
      ["\\qty{0.52 +- 0.01}{\\volt}", "(0.52 ± 0.01) V"],
      ["\\num{1.2e-3}~\\si{\\per\\second}", "1.2 × 10⁻³~s⁻¹"],
      ["\\SIrange{10}{20}{\\kelvin}", "10 K to 20 K"],
      ["\\numrange{1}{2}", "1 to 2"],
      ["\\numlist{1;2;3}", "1, 2 and 3"],
      ["\\qtylist{1;2}{\\metre}", "1 m and 2 m"],
      ["\\SIproduct{2x3}{\\metre}", "2 m × 3 m"],
      ["\\ang{12.5}", "12.5°"],
      ["\\ang{1;2;3}", "1°2′3″"],
      ["\\SI{45}{\\degree}", "45°"],
      ["\\qty{10}{\\percent}", "10%"],
      ["\\SI{10}[\\$]{}", "\\$10"],
      ["\\unit[1.5]{meV}", "1.5 meV"],
      ["at 13\\,\\TeV with 139\\,\\invfb", "at 13\\, TeV with 139\\, fb⁻¹"],
    ];
    for (const [input, written] of cases) assert.equal(siunitxToText(input, plain), written, input);
  });

  it("leaves the physics package's \\qty to the converter", () => {
    assert.equal(siunitxToText("\\qty{\\frac{a}{b}}", plain), "\\qty{\\frac{a}{b}}");
  });

  it("keeps every unit of a REVTeX paper, in prose, math and tables", () => {
    const tex = String.raw`\documentclass[aps,prl]{revtex4-2}
\usepackage{siunitx}
\DeclareSIUnit\gauss{G}
\newcommand{\Tc}{T_\mathrm{c}}
\newcommand{\Hc}{\SI{50}{\gauss}}
\begin{document}
\title{A pair-density wave}
\begin{abstract}
We report a gap of \SI{1.5}{\milli\electronvolt} below $\Tc = \SI{2.3}{\kelvin}$, measured at \SI{300}{\milli\kelvin} in a field of \SI{9}{\tesla}.
\end{abstract}
\section{Results}
The lower critical field is \Hc{} and the decay rate is \num{1.2e-3}~\si{\per\second}.
\begin{table}
\caption{Fits.}
\begin{tabular}{lc}
Sample & $\Delta$ (\si{\milli\electronvolt})\\
S1 & \num{1.50(5)}\\
\end{tabular}
\end{table}
\end{document}`;
    const text = latexToText(new Map([["main.tex", tex]]))!.text;
    assert.match(text, /We report a gap of 1\.5 meV below \$T_\\mathrm\{c\} = 2\.3 K\$, measured at 300 mK in a field of 9 T\./);
    assert.match(text, /The lower critical field is 50 G and the decay rate is 1\.2 × 10⁻³ s⁻¹\./);
    assert.match(text, /\| Sample \| \$\\Delta\$ \(meV\) \|\n\| S1 \| 1\.50\(5\) \|/);
    assert.doesNotMatch(text, /DeclareSIUnit|gauss\}/);
  });
});
