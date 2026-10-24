// Known-good solutions, used to prove every coding task is solvable and its tests are correct.

export const referenceSolutions: Record<string, string> = {
  "c01-slugify": `function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}`,
  "c02-parse-duration": `function parseDuration(text) {
  const match = /^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/.exec(text);
  if (!text || !match) throw new Error("invalid duration");
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}`,
  "c03-fix-chunk": `function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}`,
  "c04-semver-compare": `function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}`,
  "c05-group-by": `function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) (groups[keyFn(item)] ??= []).push(item);
  return groups;
}`,
  "c06-fix-median": `function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}`,
  "c07-dedupe-by": `function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}`,
  "c08-word-wrap": `function wordWrap(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}`,
  "c09-roman-to-int": `function romanToInt(numeral) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < numeral.length; i++) {
    const value = values[numeral[i]];
    total += value < (values[numeral[i + 1]] ?? 0) ? -value : value;
  }
  return total;
}`,
  "c10-fix-flatten": `function flattenObject(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}`,
  "c11-parse-csv-line": `function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { fields.push(field); field = ""; }
    else field += ch;
  }
  fields.push(field);
  return fields;
}`,
  "c12-topo-sort": `function topoSort(deps) {
  const order = [];
  const state = {};
  const visit = (node) => {
    if (state[node] === "done") return;
    if (state[node] === "visiting") throw new Error("cycle at " + node);
    state[node] = "visiting";
    for (const dep of deps[node] ?? []) visit(dep);
    state[node] = "done";
    order.push(node);
  };
  for (const node of Object.keys(deps)) visit(node);
  return order;
}`,
};
