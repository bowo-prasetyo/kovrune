// CSV and TSV files: decoded from the encoding they were saved in, and split into rows and cells,
// so they are written as spreadsheets are (sheets.ts, docs/office-formats.md#csv-and-tsv).

/**
 * The text of a file whose encoding is not stated. A byte-order mark says it (Excel's "CSV UTF-8"
 * writes one, its "Unicode text" is UTF-16). Otherwise it is UTF-8 if it is valid UTF-8, and
 * Shift_JIS if not: Japanese Excel saves "CSV (comma delimited)" in Shift_JIS (Windows code page
 * 932), and Shift_JIS text is almost never valid UTF-8. Other legacy encodings (Windows-1252,
 * GBK, Big5) are not told apart; their files come out with replacement characters.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" | "shift_jis" } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // TextDecoder's "shift_jis" is the WHATWG one, which decodes Windows-932's extensions too (①, ㈱, NEC and IBM kanji).
    // Byte 0x5C is the yen sign in Japanese Shift_JIS, and Japanese Windows shows it as ¥, but it decodes as a
    // backslash: Excel saves ¥125,000 as \125,000. Before an amount it is written as the ¥ the user saw.
    const text = new TextDecoder("shift_jis").decode(bytes).replace(/\\(?=-?\d)/g, "¥");
    return { text, encoding: "shift_jis" };
  }
}

/**
 * The delimiter of a CSV file, from its first line: the one of comma, semicolon and tab that
 * occurs most outside quotes. Excel writes semicolons where the decimal mark is a comma (much of
 * Europe); a comma wins ties.
 */
export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++;
  }
  return (Object.keys(counts) as Array<keyof typeof counts>).reduce((a, b) => (counts[b] > counts[a] ? b : a), ",");
}

/**
 * Rows and cells of a delimited file (RFC 4180, as Excel and LibreOffice write it): a cell in
 * double quotes may hold the delimiter, line breaks, and quotes written twice (""). Lines may end
 * with CRLF, LF or CR. Reading stops after `maxRows` rows; `cut` says whether rows were left.
 */
export function parseDelimited(text: string, delimiter: string, maxRows = Infinity): { rows: string[][]; cut: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(cell);
    cell = "";
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (rows.length >= maxRows) return { rows, cut: text.slice(i + 1).trim() !== "" };
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length) endRow();
  return { rows, cut: false };
}
