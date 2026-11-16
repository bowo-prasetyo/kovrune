// Reads the text files of a gzipped tar archive, as arXiv serves a paper's LaTeX source (arxiv.org/src).
// A source of one file is served as that file gzipped, without a tar around it. Inflating uses the
// platform's DecompressionStream, as zip.ts does, and the archive is untrusted: its inflated size is
// counted as it streams, so a small download cannot expand into gigabytes.

/** Limits on what reading a source archive may cost. */
export const TAR_LIMITS = {
  /** The whole inflated archive; figures make most of a source's size, and text files are kept only. */
  maxInflatedBytes: 200 * 2 ** 20,
  /** One text file kept: a long paper's LaTeX is a few hundred kilobytes. */
  maxFileBytes: 4 * 2 ** 20,
};

/** The files read: LaTeX, its bibliography as BibTeX ran it (.bbl) or its BibTeX database (.bib), and style files that define macros. */
const TEXT_FILE = /\.(tex|bbl|bib|sty|cls|def|ltx)$/i;

export class TarError extends Error {}

/** gzip's magic number, which every arXiv source download starts with. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** The bytes of a gzip file, inflated, at most `max` of them. */
export async function gunzip(bytes: Uint8Array, max = TAR_LIMITS.maxInflatedBytes): Promise<Uint8Array> {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new TarError("The source archive expands too much to read.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof TarError) throw error;
    throw new TarError("The source archive could not be inflated.");
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) out.set(chunk, at), (at += chunk.length);
  return out;
}

const decoder = new TextDecoder("utf-8");
const latin1 = new TextDecoder("latin1");

/** A file's text: UTF-8, or Latin-1 for an older paper's file that is not valid UTF-8. */
function textOf(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

function field(header: Uint8Array, start: number, length: number): string {
  const end = header.subarray(start, start + length).indexOf(0);
  return decoder.decode(header.subarray(start, start + (end < 0 ? length : end)));
}

/** Whether inflated bytes are a tar archive: "ustar" at offset 257 of the first header. */
export function isTar(bytes: Uint8Array): boolean {
  return bytes.length >= 512 && field(bytes, 257, 5) === "ustar";
}

/**
 * The text files of an arXiv source, by path ("main.tex", "sections/intro.tex"): the files of a tar
 * archive, or, for a source of one file, that file as "main.tex". Other files (figures) are skipped.
 */
export async function readSourceFiles(download: Uint8Array): Promise<Map<string, string>> {
  const bytes = isGzip(download) ? await gunzip(download) : download;
  const files = new Map<string, string>();
  if (!isTar(bytes)) {
    files.set("main.tex", textOf(bytes));
    return files;
  }
  let longName: string | undefined;
  for (let at = 0; at + 512 <= bytes.length; ) {
    const header = bytes.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) throw new TarError("The source archive is damaged.");
    const type = String.fromCharCode(header[156] || 48);
    const prefix = field(header, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    const body = bytes.subarray(at + 512, at + 512 + size);
    longName = undefined;
    if (type === "L") longName = decoder.decode(body).replace(/\0.*$/s, "");
    else if ((type === "0" || type === "\0") && TEXT_FILE.test(name) && size <= TAR_LIMITS.maxFileBytes) files.set(name.replace(/^\.\//, ""), textOf(body));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
