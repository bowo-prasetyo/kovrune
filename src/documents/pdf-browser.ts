// pdf.js for the browser, with its worker bundled by Vite. Loaded on demand,
// since it is large and only needed when the user adds a PDF.

import type { PdfJsLike } from "./extract.ts";

let loading: Promise<PdfJsLike> | undefined;

export function loadBrowserPdfJs(): Promise<PdfJsLike> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfJsLike;
  })();
  return loading;
}
