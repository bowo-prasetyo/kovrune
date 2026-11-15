// arXiv papers read from their LaTeX source (harness 0.81.0): the archive, the conversion, and the
// arXiv source's choice between the source and the PDF (eval/cs/README.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { latexToText, mainFile, readableLatex, readBbl, withoutComments } from "../src/documents/latex.ts";
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
