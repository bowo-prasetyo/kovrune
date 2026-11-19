// arXiv papers read from their LaTeX source (harness 0.81.0): the archive, the conversion, and the
// arXiv source's choice between the source and the PDF (eval/cs/README.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { citedKeys, latexToText, mainFile, readableLatex, readBbl, readBib, withoutComments } from "../src/documents/latex.ts";
import { gunzip, readSourceFiles, TarError } from "../src/documents/tar.ts";
import { createArxiv } from "../src/sources/arxiv.ts";
import type { FetchLike } from "../src/sources/types.ts";

const encoder = new TextEncoder();

/** A tar archive of these files (ustar headers, as arXiv's archives have). */
function tar(files: Record<string, string | Uint8Array>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) {
    const body = typeof content === "string" ? encoder.encode(content) : content;
    const header = new Uint8Array(512);
    header.set(encoder.encode(name), 0);
    header.set(encoder.encode("0000644\0"), 100);
    header.set(encoder.encode(body.length.toString(8).padStart(11, "0") + "\0"), 124);
    header[156] = 48;
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("        "), 148);
    const sum = header.reduce((a, b) => a + b, 0);
    header.set(encoder.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
    blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) out.set(b, at), (at += b.length);
  return out;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

const MAIN = String.raw`\documentclass{article}
\usepackage{booktabs}
\newcommand{\method}{LongMem}
\newcommand{\score}[1]{\textbf{#1}}
\title{A Study of \method}
\begin{document}
\maketitle
\begin{abstract}
We study \method, a memory. % a comment the reader never sees
\end{abstract}
\section{Introduction}\label{sec:intro}
Retrieval helps \citep{lewis2020,liu2023}, as \citet{liu2023} show.\footnote{See the appendix.}
Results are in Table~\ref{tab:main}, \cref{fig:curve} and Eq.~\eqref{eq:loss}; see Section~\ref{sec:method}.
\input{method}
\begin{table}[t]
\centering
\caption{Accuracy (\%) on two tasks.}\label{tab:main}
\begin{tabular}{lcc}
\toprule
Model & \multicolumn{2}{c}{Accuracy} \\
 & QA & KV \\
\midrule
\method & \score{83.4} & 99.1 \\
Baseline\rule{0pt}{2ex} & 35.0 & 41.2 \\
\bottomrule
\end{tabular}
\end{table}
\begin{figure}\includegraphics{curve.pdf}\caption{A U-shaped curve.}\label{fig:curve}\end{figure}
\bibliography{refs}
\appendix
\section{More results}\label{app:more}
\subsection{Ablations}
Na\"ive caf\'e -- 3--5 items:
\begin{itemize}
\item first item
\item second item
\end{itemize}
\end{document}
`;
const METHOD = String.raw`\section{Method}\label{sec:method}
We minimise
\begin{equation}\label{eq:loss}
\mathcal{L} = -\sum_i \log p(y_i \mid x_i)
\end{equation}
and update
\begin{align}
\theta &\leftarrow \theta - \eta \nabla \mathcal{L} \nonumber \\
m &\leftarrow \beta m + (1-\beta) g \label{eq:momentum}
\end{align}
with $O(n^2)$ cost, as in \eqref{eq:momentum}.`;
const BBL = String.raw`\begin{thebibliography}{2}
\bibitem[{Lewis et~al.(2020)Lewis, Perez, Piktus}]{lewis2020}
Patrick Lewis, Ethan Perez, and Aleksandra Piktus. 2020.
\newblock Retrieval-augmented generation.
\bibitem[{Liu et~al.(2023)Liu, Lin, Hewitt}]{liu2023}
Nelson~F. Liu, Kevin Lin, and John Hewitt. 2023.
\newblock Lost in the middle.
\end{thebibliography}`;

const files = new Map([
  ["main.tex", MAIN],
  ["method.tex", METHOD],
  ["main.bbl", BBL],
]);

describe("an arXiv source archive", () => {
  it("gives its LaTeX and .bbl files by path, and skips figures", async () => {
    const archive = await gzip(tar({ "main.tex": MAIN, "sections/method.tex": METHOD, "main.bbl": BBL, "curve.pdf": new Uint8Array([37, 80, 68, 70, 0, 1, 2]) }));
    const read = await readSourceFiles(archive);
    assert.deepEqual([...read.keys()].sort(), ["main.bbl", "main.tex", "sections/method.tex"]);
    assert.equal(read.get("sections/method.tex"), METHOD);
  });

  it("reads a source of one file, which arXiv gzips without a tar", async () => {
    const read = await readSourceFiles(await gzip(encoder.encode(MAIN)));
    assert.deepEqual([...read.keys()], ["main.tex"]);
  });

  it("stops inflating an archive that expands past its limit", async () => {
    const big = await gzip(new Uint8Array(4096));
    await assert.rejects(gunzip(big, 1000), TarError);
  });
});

describe("a paper's LaTeX as text", () => {
  const converted = latexToText(files)!;
  const text = converted.text;

  it("finds the main file and leaves comments out", () => {
    assert.equal(mainFile(files), "main.tex");
    assert.equal(withoutComments("50\\% of runs % not this\nnext"), "50\\% of runs \nnext");
    assert.doesNotMatch(text, /never sees/);
  });

  it("writes the title, abstract and numbered headings, with the appendix lettered", () => {
    assert.equal(converted.title, "A Study of LongMem");
    assert.match(text, /^# A Study of LongMem\n\n## Abstract\n\nWe study LongMem, a memory\.\n\n## 1 Introduction\n/);
    assert.match(text, /\n## 2 Method\n/);
    assert.match(text, /\n## A More results\n\n### A\.1 Ablations\n/);
  });

  it("writes a table as its caption and one row per line, with a spanning cell's columns kept", () => {
    assert.match(text, /\*\*Table 1\*\* Accuracy \(%\) on two tasks\.\n\n\| Model \| Accuracy \| \|\n\| \| QA \| KV \|\n\| LongMem \| 83\.4 \| 99\.1 \|\n\| Baseline \| 35\.0 \| 41\.2 \|/);
    assert.match(text, /\n\*Figure 1: A U-shaped curve\.\*\n/);
  });

  it("keeps an equation's LaTeX with its number, and numbers an align's rows without \\nonumber", () => {
    assert.match(text, /\n\\mathcal\{L\} = -\\sum_i \\log p\(y_i \\mid x_i\) \(1\)\n/);
    assert.match(text, /\n\\theta &\\leftarrow \\theta - \\eta \\nabla \\mathcal\{L\}\nm &\\leftarrow \\beta m \+ \(1-\\beta\) g \(2\)\n/);
    assert.match(text, /with \$O\(n\^2\)\$ cost, as in \(2\)\./);
  });

  it("writes citations as the PDF prints them, and references from the .bbl where the paper puts them", () => {
    assert.match(text, /Retrieval helps \(Lewis et al\., 2020; Liu et al\., 2023\), as Liu et al\. \(2023\) show\. \(See the appendix\.\)/);
    assert.match(text, /Results are in Table 1, Figure 1 and Eq\. \(1\); see Section 2\./);
    assert.match(text, /\n## References\n\n\[1\] Patrick Lewis, Ethan Perez, and Aleksandra Piktus\. 2020\. Retrieval-augmented generation\.\n\[2\] Nelson F\. Liu/);
    assert.ok(text.indexOf("## References") < text.indexOf("## A More results"), "before the appendix, as printed");
  });

  it("writes accents, dashes and list items as text", () => {
    assert.match(text, /Naïve café – 3–5 items:\n\n- first item\n- second item/);
  });

  it("numbers citations when the .bbl has no authors and years", () => {
    const refs = readBbl("\\begin{thebibliography}{9}\\bibitem{a} A. One.\\bibitem{b} B. Two.\\end{thebibliography}", (t) => t);
    assert.deepEqual([...refs.values()].map((r) => r.number), [1, 2]);
    const numeric = latexToText(new Map([["p.tex", "\\documentclass{article}\\begin{document}See \\cite{b,a}.\\begin{thebibliography}{9}\\bibitem{a} A. One.\\bibitem{b} B. Two.\\end{thebibliography}\\end{document}"]]))!;
    assert.match(numeric.text, /See \[2, 1\]\./);
  });

  it("is read only when it is long enough and its references resolved", () => {
    assert.equal(readableLatex(converted), false, "this short paper is under 800 words");
    assert.equal(readableLatex({ text: "word ".repeat(900) }), true);
    assert.equal(readableLatex({ text: `${"word ".repeat(900)}${" ?? ".repeat(20)}` }), false);
    assert.equal(latexToText(new Map([["notes.tex", "Just notes, no document."]])), undefined);
  });
});

describe("the arXiv source reads the LaTeX source first", () => {
  const long = MAIN.replace("We study \\method, a memory.", `We study \\method, a memory. ${"It remembers long contexts well. ".repeat(160)}`);
  const pages = { text: "From the PDF.", pageStarts: [0] };

  function fakeFetch(source: Uint8Array | undefined): FetchLike & { urls: string[] } {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://arxiv.org/src/") && source) return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => source.buffer.slice(0), headers: { get: () => null } };
      if (url.startsWith("https://arxiv.org/src/")) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
      if (url.startsWith("https://arxiv.org/pdf/")) return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer, headers: { get: () => null } };
      throw new TypeError("Failed to fetch");
    }) as unknown as FetchLike & { urls: string[] };
    impl.urls = urls;
    return impl;
  }

  it("gives the converted source, without pages, when arXiv has it", async () => {
    const fetchImpl = fakeFetch(await gzip(tar({ "main.tex": long, "method.tex": METHOD, "main.bbl": BBL })));
    const doc = await createArxiv({ fetchImpl, extractPdf: async () => pages }).fetch("arxiv:2307.03172");
    assert.deepEqual(fetchImpl.urls, ["https://arxiv.org/src/2307.03172"]);
    assert.match(doc.text, /^# A Study of LongMem\n/);
    assert.match(doc.text, /\| LongMem \| 83\.4 \| 99\.1 \|/);
    assert.equal(doc.pageStarts, undefined);
    assert.equal(doc.url, "https://arxiv.org/abs/2307.03172");
  });

  it("reads the PDF when there is no source, the source is a PDF, it is too short, or reading it is off", async () => {
    for (const source of [undefined, new Uint8Array([37, 80, 68, 70, 45]), await gzip(tar({ "main.tex": MAIN }))]) {
      const fetchImpl = fakeFetch(source);
      const doc = await createArxiv({ fetchImpl, extractPdf: async () => pages }).fetch("arxiv:2307.03172");
      assert.equal(doc.text, "From the PDF.");
      assert.deepEqual(fetchImpl.urls, ["https://arxiv.org/src/2307.03172", "https://arxiv.org/pdf/2307.03172"]);
    }
    const off = fakeFetch(await gzip(tar({ "main.tex": long })));
    assert.equal((await createArxiv({ fetchImpl: off, extractPdf: async () => pages, readSource: false }).fetch("arxiv:2307.03172")).text, "From the PDF.");
    assert.deepEqual(off.urls, ["https://arxiv.org/pdf/2307.03172"]);
  });
});

describe("a source with a .bib and no .bbl (harness 0.85.0)", () => {
  const BIB = String.raw`@string{neurips = "Advances in Neural Information Processing Systems"}
@comment{ not an entry }
@inproceedings{samsi2023words,
  title     = {From Words to Watts: Benchmarking the Energy Costs of Large Language Model Inference},
  author    = {Samsi, Siddharth and Zhao, Dan and McDonald, Joseph},
  booktitle = neurips,
  year      = 2023,
}
@misc{ScaleLLM, title = "{ScaleLLM}: serving at scale", author = {Mei Li and Wei Chen}, year = {2024}}
@article{unused, title = {Never cited}, author = {Nobody, A.}, year = {2020}}
@misc{team, title = {Gemma}, author = {Jeanine Banks and others}, year = {2024}}`;
  const PAPER = String.raw`\documentclass{acmart}
\begin{document}
\section{Cost}
The energy cost is modest \cite{samsi2023words}, and consumer GPUs cost $20\times$ less \cite{ScaleLLM, team}. See also \citet{team}.
\bibliographystyle{ACM-Reference-Format}
\bibliography{reference}
\end{document}`;

  it("keeps .bib files when unpacking", async () => {
    const read = await readSourceFiles(await gzip(tar({ "main.tex": PAPER, "reference.bib": BIB })));
    assert.deepEqual([...read.keys()].sort(), ["main.tex", "reference.bib"]);
  });

  it("reads entries, strings and quoted values, and skips comments", () => {
    const entries = readBib(BIB);
    assert.deepEqual(entries.map((e) => e.key), ["samsi2023words", "ScaleLLM", "unused", "team"]);
    assert.equal(entries[0]!.fields.booktitle, "Advances in Neural Information Processing Systems");
    assert.equal(entries[0]!.fields.year, "2023");
    assert.equal(entries[1]!.fields.title, "{ScaleLLM}: serving at scale");
    assert.deepEqual(citedKeys(PAPER), ["samsi2023words", "ScaleLLM", "team"]);
  });

  it("cites by authors and year, and lists only the cited entries, in citation order", () => {
    const text = latexToText(new Map([["main.tex", PAPER], ["reference.bib", BIB]]))!.text;
    assert.match(text, /The energy cost is modest \(Samsi et al\., 2023\), and consumer GPUs cost \$20\\times\$ less \(Li and Chen, 2024; Banks, 2024\)\. See also Banks \(2024\)\./);
    assert.doesNotMatch(text, /samsi2023words|ScaleLLM\]/);
    assert.match(text, /## References\n\n\[1\] Siddharth Samsi, Dan Zhao, Joseph McDonald\. 2023\. From Words to Watts: Benchmarking the Energy Costs of Large Language Model Inference\. Advances in Neural Information Processing Systems\.\n\[2\] Mei Li, Wei Chen\. 2024\. ScaleLLM: serving at scale\.\n\[3\] Jeanine Banks et al\. 2024\. Gemma\.\n?$/);
    assert.doesNotMatch(text, /Never cited/);
  });

  it("prefers the .bbl when there is one", () => {
    const text = latexToText(new Map([["main.tex", PAPER], ["reference.bib", BIB], ["main.bbl", "\\begin{thebibliography}{1}\\bibitem{samsi2023words} S. Samsi. Watts.\\end{thebibliography}"]]))!.text;
    assert.match(text, /The energy cost is modest \[1\]/);
  });
});

describe("particle-physics macros and REVTeX titles (harness 0.91.0)", () => {
  const tex = String.raw`\documentclass[aps,prd]{revtex4-2}
\newcommand{\sqs}{\ensuremath{\sqrt{s}}}
\newcommand{\Zpsi}{\ensuremath{Z'_\psi}}
\newcommand{\pt}{\ensuremath{p_\mathrm{T}}}
\newcommand{\ifb}{\ensuremath{\text{fb}^{-1}}}
\begin{document}
\title{A search with 139\,\ifb{} at \sqs{} = 13 TeV}
\author{The HORIZON Collaboration}
\maketitle
\section{Selection}
Data at \sqs{} = 13 TeV, 139 \ifb{} in all. The \Zpsi{} is excluded. Electrons need $\pt > 30$ GeV and \pt{} above 30 GeV.
\end{document}`;
  const converted = latexToText(new Map([["main.tex", tex]]))!;

  it("reads a formula a macro puts in running text, and keeps one in math as math", () => {
    assert.match(converted.text, /Data at √s = 13 TeV, 139 fb⁻¹ in all\. The Z'_ψ is excluded\./);
    assert.match(converted.text, /Electrons need \$\{p_\\mathrm\{T\}\} > 30\$ GeV and p_T above 30 GeV\./);
  });

  it("prints a title set after \\begin{document} once, as the heading", () => {
    assert.equal(converted.title, "A search with 139 fb⁻¹ at √s = 13 TeV");
    assert.equal(converted.text.match(/A search with/g)?.length, 1);
  });
});

describe("quotes of LaTeX math written another way (harness 0.91.0)", () => {
  // Text as the converter keeps it: inline math as written, a display equation as written.
  const source = String.raw`The combined upper limit on $\sigma B$ falls to 0.020 fb at 6 TeV. While $T_\mathrm{c}$ rises from 2.3 K to 3.9 K at 2.0 GPa, the gap follows
\Delta(T) = \Delta_0 \tanh\!\left(1.74\sqrt{T_\mathrm{c}/T - 1}\right), (1)
with $\Delta_0 = 0.75(3)$ meV.`;
  const verified = (quote: string) => checkEvidence([{ docId: "d", quote }], () => source)[0]!.verified;

  it("finds math quoted read out, or with other commands for the same symbols", () => {
    assert.equal(verified("the combined upper limit on σB falls to 0.020 fb at 6 TeV"), true);
    assert.equal(verified("the combined upper limit on σ B falls to 0.020 fb"), true);
    assert.equal(verified(String.raw`While $T_\text{c}$ rises from 2.3 K to 3.9 K at 2.0 GPa`), true);
    assert.equal(verified(String.raw`\Delta(T) = \Delta_0 \tanh\!\bigg(1.74\sqrt{T_\mathrm{c}/T - 1}\bigg), (1)`), true);
  });

  it("reads a command whose backslash a JSON reply turned into a tab or a backspace", () => {
    // The model wrote "\text" and "\bigg" with one backslash in its JSON: a tab and "ext", a backspace and "igg".
    assert.equal(verified(JSON.parse(String.raw`"While $T_\text{c}$ rises from 2.3 K"`)), true);
    assert.equal(verified(JSON.parse(String.raw`"\\Delta_0 \\tanh\\!\\\bigg(1.74\\sqrt{T_\\mathrm{c}/T - 1}\\bigg)"`)), true);
  });

  it("still fails math with another number or symbol in it", () => {
    assert.equal(verified("the combined upper limit on σB falls to 0.20 fb at 6 TeV"), false);
    assert.equal(verified(String.raw`While $T_\text{N}$ rises from 2.3 K to 3.9 K`), false);
    assert.equal(verified("the combined upper limit on τB falls to 0.020 fb"), false);
  });
});

describe("quotes of LaTeX without its markup (harness 0.92.0)", () => {
  // From the INSPIRE run: Daya Bay's arXiv source keeps a display equation as written, LHCb's a symbol in math.
  const source = String.raw`fit it to the data. The best-fit value is

\sin^22\theta_{13}=0.092\pm 0.016({\rm stat})\pm0.005({\rm syst})

with a $\chi^2$/NDF of 4.26/4. The (blue) open squares represent the $P_c(4450)^+$ state, and the filled squares the $P_c(4380)^+$ state.`;
  const verified = (quote: string) => checkEvidence([{ docId: "d", quote }], () => source)[0]!.verified;

  it("finds math quoted without its dollar signs, or with a backslash the JSON reply made a line break", () => {
    assert.equal(verified("The (blue) open squares represent the P_c(4450)^+ state, and the filled squares the P_c(4380)^+ state."), true);
    // The model's JSON had "\\nsin": a line break written out, where "\sin" was meant.
    assert.equal(verified(String.raw`The best-fit value is \nsin^22\theta_{13}=0.092\pm 0.016({\rm stat})\pm0.005({\rm syst})`), true);
  });

  it("still fails another number or symbol", () => {
    assert.equal(verified("The (blue) open squares represent the P_c(4457)^+ state"), false);
    assert.equal(verified(String.raw`The best-fit value is \sin^22\theta_{13}=0.089\pm 0.016`), false);
    assert.equal(verified("The (blue) open squares represent the P_c(4450)^- state"), false);
  });
});
