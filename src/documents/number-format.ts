// Excel stores a cell's value and, separately, how to show it: 45717 with the format "yyyy/m/d" is
// shown as 2025/3/1. Quotes are checked against the text and models read it, so a spreadsheet's
// numbers are written as the user sees them (docs/office-formats.md#spreadsheets). This covers the
// formats in common use; anything else is written as Excel's General format would show it.

/** Built-in number formats, by ID: those a file does not spell out in its styles. */
const BUILT_IN: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  // 14 is the short date of the reader's locale (m/d/yyyy in the US, yyyy/m/d in Japan); written
  // here as an ISO date, which reads the same everywhere.
  14: "yyyy-mm-dd",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "yyyy-mm-dd h:mm",
  37: "#,##0_);(#,##0)",
  38: "#,##0_);[Red](#,##0)",
  39: "#,##0.00_);(#,##0.00)",
  40: "#,##0.00_);[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
  48: "##0.0E+0",
  49: "@",
};

// East Asian built-in formats (27–36, 50–58) are dates in the reader's locale, some with eras
// (令和7年3月1日); written as ISO dates.
for (const id of [27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]) BUILT_IN[id] = "yyyy-mm-dd";
for (const id of [32, 33, 55, 56]) BUILT_IN[id] = "h:mm:ss";

export function builtInFormat(id: number): string | undefined {
  return BUILT_IN[id];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MS_PER_DAY = 86_400_000;

/**
 * The date and time a serial number stands for, as UTC parts. In the 1900 system day 1 is
 * 1900-01-01 and Excel counts a 29 February 1900 that never was, so serials from 61 on are a day
 * ahead; in the 1904 system (old Mac files) day 0 is 1904-01-01.
 */
export function serialToDate(serial: number, date1904 = false): Date {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : serial < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  // Rounded to the millisecond, so 0.5 days is noon and not 11:59:59.999.
  return new Date(epoch + Math.round(serial * MS_PER_DAY));
}

/** Excel's General format: integers as they are, others to at most 11 characters' worth of digits. */
export function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e11) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e11 || (abs !== 0 && abs < 1e-9)) return value.toExponential(5).replace(/\.?0+e/, "e").toUpperCase();
  return String(Number(value.toPrecision(10)));
}

/** Splits a format code into its sections (positive;negative;zero;text), outside quotes and escapes. */
function sections(code: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === "\\" && i + 1 < code.length) {
      current += ch + code[++i];
      continue;
    }
    if (ch === ";" && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** The code with quoted text, escapes, colours, conditions and padding taken out: what tells its kind. */
function bare(code: string): string {
  return code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_./g, "")
    .replace(/\*./g, "")
    .replace(/\[(?!h\]|hh\]|m\]|mm\]|s\]|ss\])[^\]]*\]/gi, "");
}

function isDateCode(code: string): boolean {
  return /[ymdhs]/i.test(bare(code).replace(/E\+|E-/gi, ""));
}

/** A currency or locale bracket such as [$¥-411] or [$€-407]: its symbol, written; other brackets dropped. */
function literalText(code: string): string {
  return code.replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, (_, symbol: string) => (symbol ? `"${symbol}"` : ""));
}

function formatDate(serial: number, code: string, date1904: boolean): string {
  // Excel rounds to the second unless the code shows fractions of one (ss.0).
  if (!/s+\.0/i.test(code)) serial = Math.round(serial * 86400) / 86400;
  const date = serialToDate(serial, date1904);
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const mi = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(code);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Elapsed time ([h]:mm) counts hours past 24.
  const elapsedHours = Math.floor(serial * 24 + 1e-9);

  const tokens = literalText(code).match(/"[^"]*"|\\.|_.|\*.|\[[^\]]*\]|AM\/PM|A\/P|y+|m+|d+|h+|s+|0+|./gi) ?? [];
  // "m" is minutes right after an hour or right before seconds, months otherwise.
  const kinds = tokens.map((t) => (t.startsWith("[") ? t.slice(1, 2) : t[0]!).toLowerCase());
  let out = "";
  tokens.forEach((token, i) => {
    const lower = token.toLowerCase();
    if (token.startsWith('"')) return void (out += token.slice(1, -1));
    if (token.startsWith("\\")) return void (out += token.slice(1));
    if (token.startsWith("_")) return void (out += " ");
    if (token.startsWith("*")) return;
    if (token.startsWith("[")) {
      const inner = lower.slice(1, -1);
      if (inner === "h" || inner === "hh") out += inner === "hh" ? pad(elapsedHours) : String(elapsedHours);
      else if (inner === "m" || inner === "mm") out += String(Math.floor(serial * 1440 + 1e-9)).padStart(inner.length, "0");
      else if (inner === "s" || inner === "ss") out += String(Math.floor(serial * 86400 + 1e-9)).padStart(inner.length, "0");
      return;
    }
    if (lower === "am/pm") return void (out += h < 12 ? "AM" : "PM");
    if (lower === "a/p") return void (out += h < 12 ? "A" : "P");
    switch (lower[0]) {
      case "y":
        out += lower.length <= 2 ? pad(y % 100) : String(y);
        return;
      case "d":
        out += lower.length === 1 ? String(d) : lower.length === 2 ? pad(d) : lower.length === 3 ? DAYS[date.getUTCDay()]!.slice(0, 3) : DAYS[date.getUTCDay()]!;
        return;
      case "h": {
        const hour = ampm ? h % 12 || 12 : h;
        out += lower.length >= 2 ? pad(hour) : String(hour);
        return;
      }
      case "s":
        out += lower.length >= 2 ? pad(s) : String(s);
        return;
      case "m": {
        const previous = kinds.slice(0, i).reverse().find((k) => /[ymdhs]/.test(k));
        const next = kinds.slice(i + 1).find((k) => /[ymdhs]/.test(k));
        const minutes = lower.length <= 2 && (previous === "h" || next === "s");
        if (minutes) out += lower.length === 2 ? pad(mi) : String(mi);
        else out += lower.length === 1 ? String(mo + 1) : lower.length === 2 ? pad(mo + 1) : lower.length === 3 ? MONTHS[mo]!.slice(0, 3) : lower.length === 5 ? MONTHS[mo]![0]! : MONTHS[mo]!;
        return;
      }
      case "0": {
        // Fractions of a second after "ss.".
        const fraction = serial * 86400 - Math.floor(serial * 86400 + 1e-9);
        out += String(Math.round(fraction * 10 ** lower.length)).padStart(lower.length, "0").slice(0, lower.length);
        return;
      }
    }
    out += token;
  });
  return out;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(value: number, code: string): string {
  const raw = literalText(code);
  const plain = bare(raw);
  if (!/[0#?]/.test(plain)) {
    // Text only, such as "-" for zero: write the text.
    return raw.replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1").replace(/_./g, " ").replace(/\*./g, "").replace(/\[[^\]]*\]/g, "").replace(/@/g, "");
  }
  const percent = (plain.match(/%/g) ?? []).length;
  let scaled = value * 100 ** percent;
  // Each comma right after the last digit placeholder divides by a thousand ("#,##0," shows thousands).
  const trailingCommas = /[0#?](,+)(?![0#?])/.exec(plain)?.[1]?.length ?? 0;
  scaled /= 1000 ** trailingCommas;

  const scientific = /E[+-]/i.exec(plain);
  const integerPart = (scientific ? plain.slice(0, scientific.index) : plain).split(".")[0]!;
  const decimals = ((scientific ? plain.slice(0, scientific.index) : plain).split(".")[1]?.match(/[0#?]/g) ?? []).length;
  const thousands = /[0#?],[0#?]/.test(integerPart);

  let number: string;
  if (scientific) {
    const [mantissa, exponent] = Math.abs(scaled).toExponential(decimals).split("e");
    const exp = Number(exponent);
    const expDigits = (plain.slice(scientific.index + 2).match(/0/g) ?? []).length || 1;
    number = `${mantissa}E${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(expDigits, "0")}`;
  } else {
    const fixed = Math.abs(scaled).toFixed(decimals);
    let [whole, fraction] = fixed.split(".");
    const minWhole = (integerPart.match(/0/g) ?? []).length;
    if (whole === "0" && minWhole === 0) whole = "";
    whole = whole!.padStart(minWhole, "0");
    if (thousands) whole = groupThousands(whole);
    // Optional decimals ("#") are dropped when zero.
    const decimalPart = (plain.split(".")[1] ?? "").replace(/[^0#?]/g, "");
    if (fraction) {
      let cut = fraction.length;
      while (cut > 0 && fraction[cut - 1] === "0" && decimalPart[cut - 1] === "#") cut--;
      fraction = fraction.slice(0, cut);
    }
    number = fraction ? `${whole}.${fraction}` : whole!;
  }

  // The literal text around the digits: the part before the first placeholder, and after the last.
  const first = raw.search(/[0#?]/);
  let last = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (/[0#?%]/.test(raw[i]!) && !insideQuotes(raw, i)) {
      last = i;
      break;
    }
  }
  const literal = (part: string) =>
    part
      .replace(/"([^"]*)"/g, "$1")
      .replace(/\\(.)/g, "$1")
      .replace(/_./g, "")
      .replace(/\*./g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/[0#?,.%]|E[+-]/gi, "");
  const prefix = literal(raw.slice(0, first));
  const suffix = literal(raw.slice(last + 1)) + "%".repeat(percent);
  return `${prefix}${number}${suffix}`;
}

function insideQuotes(text: string, index: number): boolean {
  let quoted = false;
  for (let i = 0; i < index; i++) if (text[i] === '"') quoted = !quoted;
  return quoted;
}

/**
 * A number as a cell with this format code shows it. Negative numbers use the code's second
 * section when it has one (without a minus sign, as Excel does: the section writes its own), and
 * zero its third.
 */
export function formatValue(value: number, code: string | undefined, date1904 = false): string {
  if (!code || /^general$/i.test(code.trim())) return formatGeneral(value);
  const parts = sections(code);
  let section = parts[0]!;
  let sign = value < 0 ? "-" : "";
  if (value < 0 && parts.length >= 2 && parts[1]!.trim() !== "") {
    section = parts[1]!;
    sign = "";
  } else if (value === 0 && parts.length >= 3 && parts[2]!.trim() !== "") {
    section = parts[2]!;
  }
  // A condition ([<1000]) picks sections by value; such codes are rare, so the first section is used.
  if (/^general$/i.test(bare(section).trim())) return formatGeneral(value);
  if (bare(section).trim() === "@") return formatGeneral(value);
  try {
    if (isDateCode(section)) {
      if (value < 0) return formatGeneral(value);
      return formatDate(value, section, date1904);
    }
    const text = formatNumber(Math.abs(value), section);
    // A value that rounds to zero is shown without a minus sign.
    return sign && /[1-9]/.test(text) ? `${sign}${text}` : text;
  } catch {
    return formatGeneral(value);
  }
}
