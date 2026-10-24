// Coding tasks scored by executing tests (see harness/sandbox.ts).
//
// The agent sees the visible tests and can run them; the hidden tests are only
// used for the final score. A task passes when every visible and hidden test passes.

export interface CodeTest {
  /** JavaScript expression evaluated after the submitted code. */
  expr: string;
  /** Expected value, compared with deep equality. Ignored when `throws` is set. */
  expected?: unknown;
  throws?: boolean;
}

export interface CodingTask {
  id: string;
  kind: "implement" | "fix";
  /** Name of the function the submission must define. */
  entry: string;
  prompt: string;
  /** Existing code to fix, for "fix" tasks. */
  starterCode?: string;
  visibleTests: CodeTest[];
  hiddenTests: CodeTest[];
}

export const codingTasks: CodingTask[] = [
  {
    id: "c01-slugify",
    kind: "implement",
    entry: "slugify",
    prompt:
      "Write a JavaScript function slugify(text) that lowercases the text, replaces every run of characters that are not a-z or 0-9 with a single hyphen, and removes leading and trailing hyphens.",
    visibleTests: [
      { expr: `slugify("Hello World")`, expected: "hello-world" },
      { expr: `slugify("  Kovrune: P2P Agents!  ")`, expected: "kovrune-p2p-agents" },
    ],
    hiddenTests: [
      { expr: `slugify("a--b__c")`, expected: "a-b-c" },
      { expr: `slugify("---")`, expected: "" },
      { expr: `slugify("Version 2.0 Release")`, expected: "version-2-0-release" },
      { expr: `slugify("")`, expected: "" },
    ],
  },
  {
    id: "c02-parse-duration",
    kind: "implement",
    entry: "parseDuration",
    prompt:
      'Write a JavaScript function parseDuration(text) that converts a duration such as "1h30m15s" into a number of seconds. Units are h, m and s; each unit is optional but at least one must be present, and units appear in the order h, m, s. Throw an Error for any invalid input.',
    visibleTests: [
      { expr: `parseDuration("1h30m15s")`, expected: 5415 },
      { expr: `parseDuration("45s")`, expected: 45 },
      { expr: `parseDuration("abc")`, throws: true },
    ],
    hiddenTests: [
      { expr: `parseDuration("2h")`, expected: 7200 },
      { expr: `parseDuration("10m5s")`, expected: 605 },
      { expr: `parseDuration("")`, throws: true },
      { expr: `parseDuration("5s1m")`, throws: true },
      { expr: `parseDuration("0h0m0s")`, expected: 0 },
    ],
  },
  {
    id: "c03-fix-chunk",
    kind: "fix",
    entry: "chunk",
    prompt:
      "The function chunk(items, size) should split an array into consecutive arrays of length size; the last array may be shorter. It currently loses the final partial chunk. Fix it.",
    starterCode: `function chunk(items, size) {
  const result = [];
  let current = [];
  for (const item of items) {
    current.push(item);
    if (current.length === size) {
      result.push(current);
      current = [];
    }
  }
  return result;
}`,
    visibleTests: [
      { expr: `chunk([1, 2, 3, 4, 5], 2)`, expected: [[1, 2], [3, 4], [5]] },
      { expr: `chunk([1, 2, 3, 4], 2)`, expected: [[1, 2], [3, 4]] },
    ],
    hiddenTests: [
      { expr: `chunk([], 3)`, expected: [] },
      { expr: `chunk([1], 3)`, expected: [[1]] },
      { expr: `chunk(["a", "b", "c"], 1)`, expected: [["a"], ["b"], ["c"]] },
    ],
  },
  {
    id: "c04-semver-compare",
    kind: "implement",
    entry: "compareVersions",
    prompt:
      'Write a JavaScript function compareVersions(a, b) for version strings of the form "MAJOR.MINOR.PATCH" (non-negative integers). Return -1 if a is lower than b, 1 if a is higher, and 0 if they are equal. Compare numerically, not as text.',
    visibleTests: [
      { expr: `compareVersions("1.2.3", "1.2.4")`, expected: -1 },
      { expr: `compareVersions("2.0.0", "2.0.0")`, expected: 0 },
    ],
    hiddenTests: [
      { expr: `compareVersions("1.10.0", "1.9.9")`, expected: 1 },
      { expr: `compareVersions("0.0.1", "0.1.0")`, expected: -1 },
      { expr: `compareVersions("10.0.0", "9.99.99")`, expected: 1 },
      { expr: `compareVersions("3.2.0", "3.2.0")`, expected: 0 },
    ],
  },
  {
    id: "c05-group-by",
    kind: "implement",
    entry: "groupBy",
    prompt:
      "Write a JavaScript function groupBy(items, keyFn) that returns a plain object mapping each key returned by keyFn to an array of the items with that key, keeping the original order of items.",
    visibleTests: [
      { expr: `groupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"))`, expected: { odd: [1, 3], even: [2, 4] } },
    ],
    hiddenTests: [
      { expr: `groupBy([], (x) => x)`, expected: {} },
      { expr: `groupBy(["apple", "avocado", "banana"], (s) => s[0])`, expected: { a: ["apple", "avocado"], b: ["banana"] } },
      { expr: `Object.keys(groupBy([3, 1, 2], (n) => String(n)))`, expected: ["1", "2", "3"] },
    ],
  },
  {
    id: "c06-fix-median",
    kind: "fix",
    entry: "median",
    prompt:
      "The function median(numbers) should return the median of a non-empty array of numbers without modifying the input array. It gives wrong results. Fix it.",
    starterCode: `function median(numbers) {
  const sorted = numbers.sort();
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle];
}`,
    visibleTests: [
      { expr: `median([3, 1, 2])`, expected: 2 },
      { expr: `median([10, 2, 33, 4])`, expected: 7 },
    ],
    hiddenTests: [
      { expr: `median([5])`, expected: 5 },
      { expr: `median([1, 100, 20])`, expected: 20 },
      { expr: `(() => { const input = [3, 1, 2]; median(input); return input; })()`, expected: [3, 1, 2] },
      { expr: `median([-5, -1, -3, -2])`, expected: -2.5 },
    ],
  },
  {
    id: "c07-dedupe-by",
    kind: "implement",
    entry: "dedupeBy",
    prompt:
      "Write a JavaScript function dedupeBy(items, keyFn) that returns a new array containing only the first item for each distinct key returned by keyFn, in the original order.",
    visibleTests: [
      { expr: `dedupeBy([{ id: 1, v: "a" }, { id: 1, v: "b" }, { id: 2, v: "c" }], (x) => x.id)`, expected: [{ id: 1, v: "a" }, { id: 2, v: "c" }] },
    ],
    hiddenTests: [
      { expr: `dedupeBy([], (x) => x)`, expected: [] },
      { expr: `dedupeBy(["a", "A", "b"], (s) => s.toLowerCase())`, expected: ["a", "b"] },
      { expr: `dedupeBy([1, "1", 1], (x) => x)`, expected: [1, "1"] },
    ],
  },
  {
    id: "c08-word-wrap",
    kind: "implement",
    entry: "wordWrap",
    prompt:
      "Write a JavaScript function wordWrap(text, width) that splits text on whitespace into words and returns an array of lines. Fill each line greedily with as many words as fit (words separated by single spaces, line length at most width). A word longer than width goes on its own line unchanged. Return [] for text with no words.",
    visibleTests: [
      { expr: `wordWrap("the quick brown fox", 10)`, expected: ["the quick", "brown fox"] },
      { expr: `wordWrap("", 5)`, expected: [] },
    ],
    hiddenTests: [
      { expr: `wordWrap("a b c d", 3)`, expected: ["a b", "c d"] },
      { expr: `wordWrap("extraordinary words", 5)`, expected: ["extraordinary", "words"] },
      { expr: `wordWrap("  spaced   out  ", 20)`, expected: ["spaced out"] },
    ],
  },
  {
    id: "c09-roman-to-int",
    kind: "implement",
    entry: "romanToInt",
    prompt:
      "Write a JavaScript function romanToInt(numeral) that converts a valid Roman numeral (I, V, X, L, C, D, M, using subtractive notation such as IV and CM) into an integer.",
    visibleTests: [
      { expr: `romanToInt("III")`, expected: 3 },
      { expr: `romanToInt("IV")`, expected: 4 },
    ],
    hiddenTests: [
      { expr: `romanToInt("MCMXCIV")`, expected: 1994 },
      { expr: `romanToInt("LVIII")`, expected: 58 },
      { expr: `romanToInt("XL")`, expected: 40 },
      { expr: `romanToInt("MMXXVI")`, expected: 2026 },
    ],
  },
  {
    id: "c10-fix-flatten",
    kind: "fix",
    entry: "flattenObject",
    prompt:
      'The function flattenObject(obj) should turn nested plain objects into a single-level object with dot-separated keys, e.g. {a: {b: 1}} becomes {"a.b": 1}. Arrays and non-object values are kept as values. Nested keys currently lose their parent prefix. Fix it.',
    starterCode: `function flattenObject(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, key));
    } else {
      result[key] = value;
    }
  }
  return result;
}`,
    visibleTests: [
      { expr: `flattenObject({ a: { b: 1 }, c: 2 })`, expected: { "a.b": 1, c: 2 } },
    ],
    hiddenTests: [
      { expr: `flattenObject({ a: { b: { c: 3 } } })`, expected: { "a.b.c": 3 } },
      { expr: `flattenObject({ list: [1, 2], n: null })`, expected: { list: [1, 2], n: null } },
      { expr: `flattenObject({})`, expected: {} },
      { expr: `flattenObject({ x: { y: 1, z: { w: 2 } }, v: "s" })`, expected: { "x.y": 1, "x.z.w": 2, v: "s" } },
    ],
  },
  {
    id: "c11-parse-csv-line",
    kind: "implement",
    entry: "parseCsvLine",
    prompt:
      'Write a JavaScript function parseCsvLine(line) that splits one CSV line into an array of field strings. Fields are separated by commas. A field may be wrapped in double quotes, in which case it can contain commas, and a doubled quote ("") inside it means one literal quote character.',
    visibleTests: [
      { expr: `parseCsvLine("a,b,c")`, expected: ["a", "b", "c"] },
      { expr: `parseCsvLine('"x, y",z')`, expected: ["x, y", "z"] },
    ],
    hiddenTests: [
      { expr: `parseCsvLine('"say ""hi""",2')`, expected: ['say "hi"', "2"] },
      { expr: `parseCsvLine("a,,c")`, expected: ["a", "", "c"] },
      { expr: `parseCsvLine("")`, expected: [""] },
      { expr: `parseCsvLine('one,"",three')`, expected: ["one", "", "three"] },
    ],
  },
  {
    id: "c12-topo-sort",
    kind: "implement",
    entry: "topoSort",
    prompt:
      'Write a JavaScript function topoSort(deps) where deps maps each node name to an array of node names it depends on, e.g. {app: ["lib"], lib: []}. Return an array of all node names in which every node appears after all of its dependencies. Throw an Error if there is a cycle.',
    visibleTests: [
      { expr: `topoSort({ app: ["lib"], lib: [] })`, expected: ["lib", "app"] },
      { expr: `topoSort({ a: ["b"], b: ["a"] })`, throws: true },
    ],
    hiddenTests: [
      {
        expr: `(() => { const o = topoSort({ a: ["b", "c"], b: ["c"], c: [] }); return o.length === 3 && o.indexOf("c") < o.indexOf("b") && o.indexOf("b") < o.indexOf("a"); })()`,
        expected: true,
      },
      { expr: `topoSort({})`, expected: [] },
      { expr: `topoSort({ x: ["x"] })`, throws: true },
      {
        expr: `(() => { const o = topoSort({ d: ["c"], c: ["b"], b: ["a"], a: [], e: [] }); return o.length === 5 && ["a", "b", "c", "d"].every((n, i, arr) => i === 0 || o.indexOf(arr[i - 1]) < o.indexOf(n)); })()`,
        expected: true,
      },
    ],
  },
];
