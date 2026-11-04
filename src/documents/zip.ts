// Reads files out of a ZIP archive, which is what Office (.docx, .pptx) and OpenDocument (.odt,
// .odp) files are. Only what those need: stored and deflated entries, read through the archive's
// central directory. Inflating uses the platform's DecompressionStream, in browsers and Node alike,
// so no library is needed (docs/office-formats.md).
//
// The archives come from the user's files, so they are untrusted: sizes are checked as entries
// inflate, not taken from the directory, so a small file cannot expand into gigabytes (a zip bomb).

/** Limits on what reading an archive may cost. */
export const ZIP_LIMITS = {
  /** Entries in the central directory. Real Office files have tens to a few thousand. */
  maxEntries: 20_000,
  /** One inflated entry: a 1,000-page Word document's main XML is about 20 MB. */
  maxEntryBytes: 64 * 2 ** 20,
  /** All entries read from one archive together. */
  maxTotalBytes: 256 * 2 ** 20,
};

export class ZipError extends Error {}

interface Entry {
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const SIG_END = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipArchive {
  /** Entry names, in directory order. */
  readonly names: string[];
  has(name: string): boolean;
  /** An entry decoded as UTF-8 text, or undefined when there is no such entry. */
  text(name: string): Promise<string | undefined>;
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function openZip(bytes: Uint8Array, limits = ZIP_LIMITS): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new ZipError("The file is too large to read (ZIP64 archives are not supported).");
  if (count > limits.maxEntries) throw new ZipError(`The file holds too many parts to read (${count}).`);
  if (at + directorySize > bytes.length) throw new ZipError("The file is damaged: its ZIP directory is cut off.");

  const entries = new Map<string, Entry>();
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== SIG_CENTRAL) throw new ZipError("The file is damaged: its ZIP directory is unreadable.");
    const nameLength = view.getUint16(at + 28, true);
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }

  let total = 0;
  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    async text(name) {
      const entry = entries.get(name);
      if (!entry) return undefined;
      const data = await inflate(view, bytes, entry, name, Math.min(limits.maxEntryBytes, limits.maxTotalBytes - total));
      total += data.length;
      return utf8.decode(data);
    },
  };
}

/** The end-of-central-directory record: the last 22 bytes, unless an archive comment follows it. */
function findEndOfDirectory(view: DataView): number {
  const last = view.byteLength - 22;
  for (let at = last; at >= 0 && at >= last - 0xffff; at--) {
    if (view.getUint32(at, true) === SIG_END) return at;
  }
  throw new ZipError("The file is damaged or not a ZIP archive.");
}

async function inflate(view: DataView, bytes: Uint8Array, entry: Entry, name: string, room: number): Promise<Uint8Array> {
  if (entry.flags & 1) throw new ZipError("The file is password-protected.");
  if (entry.size > room) throw new ZipError(`The file expands too much to read (${name}).`);
  const at = entry.localOffset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== SIG_LOCAL) throw new ZipError(`The file is damaged (${name}).`);
  // The local header's name and extra field can differ in length from the directory's.
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (raw.length < entry.compressedSize) throw new ZipError(`The file is damaged: ${name} is cut off.`);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new ZipError(`The file uses a compression method Kovrune cannot read (${entry.method}).`);

  // The directory's size may be wrong or forged, so the inflated size is counted as it streams.
  const reader = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > room) throw new ZipError(`The file expands too much to read (${name}).`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ZipError) throw error;
    throw new ZipError(`The file is damaged: ${name} could not be decompressed.`);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
