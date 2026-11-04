// Builds ZIP archives in tests: Office and OpenDocument files from their XML parts.

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A ZIP archive of the given text files, stored or deflated. CRCs are left at zero: the reader
 * does not check them (DecompressionStream checks the deflate stream itself).
 */
export async function makeZip(files: Record<string, string | Uint8Array>, options: { deflate?: boolean; claimedSize?: number } = {}): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const stored = options.deflate ? await deflateRaw(data) : data;
    const nameBytes = encoder.encode(name);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(8, options.deflate ? 8 : 0, true);
    header.setUint32(18, stored.length, true);
    header.setUint32(22, options.claimedSize ?? data.length, true);
    header.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(header.buffer), nameBytes, stored);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, options.deflate ? 8 : 0, true);
    entry.setUint32(20, stored.length, true);
    entry.setUint32(24, options.claimedSize ?? data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + stored.length;
  }
  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
