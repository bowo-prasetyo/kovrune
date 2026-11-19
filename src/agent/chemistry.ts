// Chemistry the sentence check reads (harness 0.93.0): formulas, elements, oxidation states, stereo- and
// regiochemical descriptors, solvents and substituents. An audit from a chemistry researcher's point of
// view ran the sentence check (support.ts) on 51 wrong sentences from chemistry papers, each with a real
// quote, and 38 were marked backed: "(S)-ibuprofen" for "(R)-ibuprofen", "the exo adduct" for "the endo
// adduct", "Pt/C" for "Pd/C", "reduces CO" for "reduces CO₂", "Ni(II)" for "Ni(0)", "in DMSO" for "in
// water", "the ethyl ester" for "the methyl ester". Each shares every other word with its quote, and a name
// or a descriptor one character or one word apart is what the share of shared words cannot see.
//
// Each check here follows the rule the opposites and names of support.ts follow: a sentence may say what the
// quotes say, or what they say nothing of. It is marked only when it says one thing and the quotes, titles
// or question say another of the same kind and not this one.

/** Elements by symbol, with the names a text spells them with. */
const ELEMENTS: Record<string, string[]> = {
  H: ["hydrogen"], He: ["helium"], Li: ["lithium"], Be: ["beryllium"], B: ["boron"], C: ["carbon"], N: ["nitrogen"], O: ["oxygen"],
  F: ["fluorine"], Ne: ["neon"], Na: ["sodium"], Mg: ["magnesium"], Al: ["aluminium", "aluminum"], Si: ["silicon"], P: ["phosphorus"],
  S: ["sulfur", "sulphur"], Cl: ["chlorine"], Ar: ["argon"], K: ["potassium"], Ca: ["calcium"], Sc: ["scandium"], Ti: ["titanium"],
  V: ["vanadium"], Cr: ["chromium"], Mn: ["manganese"], Fe: ["iron", "ferric", "ferrous"], Co: ["cobalt"], Ni: ["nickel"],
  Cu: ["copper", "cupric", "cuprous"], Zn: ["zinc"], Ga: ["gallium"], Ge: ["germanium"], As: ["arsenic"], Se: ["selenium"],
  Br: ["bromine"], Kr: ["krypton"], Rb: ["rubidium"], Sr: ["strontium"], Y: ["yttrium"], Zr: ["zirconium"], Nb: ["niobium"],
  Mo: ["molybdenum"], Tc: ["technetium"], Ru: ["ruthenium"], Rh: ["rhodium"], Pd: ["palladium"], Ag: ["silver"], Cd: ["cadmium"],
  In: ["indium"], Sn: ["tin", "stannous", "stannic"], Sb: ["antimony"], Te: ["tellurium"], I: ["iodine"], Xe: ["xenon"], Cs: ["caesium", "cesium"],
  Ba: ["barium"], La: ["lanthanum"], Ce: ["cerium"], Pr: ["praseodymium"], Nd: ["neodymium"], Pm: ["promethium"], Sm: ["samarium"],
  Eu: ["europium"], Gd: ["gadolinium"], Tb: ["terbium"], Dy: ["dysprosium"], Ho: ["holmium"], Er: ["erbium"], Tm: ["thulium"],
  Yb: ["ytterbium"], Lu: ["lutetium"], Hf: ["hafnium"], Ta: ["tantalum"], W: ["tungsten"], Re: ["rhenium"], Os: ["osmium"],
  Ir: ["iridium"], Pt: ["platinum"], Au: ["gold"], Hg: ["mercury"], Tl: ["thallium"], Pb: ["lead"], Bi: ["bismuth"], Po: ["polonium"],
  At: ["astatine"], Rn: ["radon"], Fr: ["francium"], Ra: ["radium"], Ac: ["actinium"], Th: ["thorium"], Pa: ["protactinium"],
  U: ["uranium"], Np: ["neptunium"], Pu: ["plutonium"], Am: ["americium"], Cm: ["curium"],
};

/** Non-metals and metalloids: every other element is a metal. */
const NON_METALS = new Set(["H", "He", "B", "C", "N", "O", "F", "Ne", "Si", "P", "S", "Cl", "Ar", "Ge", "As", "Se", "Br", "Kr", "Sb", "Te", "I", "Xe", "At", "Rn"]);

/**
 * Symbols not read as an element when they stand alone, since they are also words, names or other symbols:
 * "In", "As", "He", "Be", "No" and "At" begin sentences; "Li", "Lu" and "Ho" are surnames ("Li et al."); "Pa" is
 * a pascal; "Ac", "Pr", "Np", "Ts" and "Ar" are acetyl, propyl, naphthyl, tosyl and aryl; "La", "Re", "Po",
 * "Er" and "Am" are words in other languages or common abbreviations. Inside a formula they are read ("LiCl").
 */
const AMBIGUOUS_ALONE = new Set(["In", "As", "At", "Be", "He", "No", "Am", "Pa", "Ac", "Pr", "Np", "Ts", "Ar", "Li", "Lu", "Ho", "La", "Re", "Po", "Er", "Nb", "Ra", "Fr", "Tc", "Cm", "Pm", "Tb", "Th"]);

/** Groups organic chemists write in formulas as if they were elements: "Et3N", "Pd(PPh3)4", "Pd2(dba)3". */
const GROUPS = new Set([
  "Me", "Et", "Pr", "iPr", "nPr", "Bu", "nBu", "tBu", "sBu", "iBu", "Ph", "Bn", "Bz", "Ac", "Ts", "Tf", "Ms", "Cy", "Cp", "Mes", "Ar", "Boc", "Cbz", "Tol",
  "py", "bpy", "bipy", "phen", "dba", "cod", "acac", "tmeda", "dppf", "dppe", "dppp", "en", "OAc", "OTf", "OMe", "OEt", "dtbpy", "terpy", "salen", "Cp*",
]);

/** Element symbols and groups, longest first, so "Mes" is read before "Me" and "Cl" before "C". */
const SYMBOLS = [...new Set([...Object.keys(ELEMENTS), ...GROUPS])].sort((a, b) => b.length - a.length);

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

/** A formula read from a word: its symbols in order, with counts, an oxidation state or a charge. */
interface Formula {
  /** The formula in one form: "CO2", "Fe3+" for "Fe(III)", "Fe³⁺" and "Fe3+", "Ni0" for "Ni(0)". */
  key: string;
  /** Its symbols in order without counts or charges: "C,O" for CO and CO₂, "Fe" for Fe²⁺ and Fe³⁺. */
  skeleton: string;
  /** Its elements, without the groups. */
  elements: string[];
  /** Whether it is written only in capital letters, as an acronym is ("CO", "HF", "PBS"): such a word is compared only with formulas. */
  capitals: boolean;
  /** Whether it is one element alone, with nothing to compare but the element ("Pd", "Ni"). */
  bare: boolean;
}

/** The symbols and counts of a formula's body ("Pd(OAc)2", "[Ru(bpy)3]"), or undefined when it is not one. */
function parseBody(body: string, inside = false): Array<[string, number]> | undefined {
  const parts: Array<[string, number]> = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i]!;
    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]";
      let depth = 0;
      let j = i;
      for (; j < body.length; j++) {
        if (body[j] === c) depth++;
        else if (body[j] === close && --depth === 0) break;
      }
      if (j >= body.length) return undefined;
      const inner = parseBody(body.slice(i + 1, j), true);
      if (!inner) return undefined;
      const count = /^\d+/.exec(body.slice(j + 1))?.[0] ?? "";
      for (const [symbol, n] of inner) parts.push([symbol, n * (count ? Number(count) : 1)]);
      i = j + 1 + count.length;
      continue;
    }
    if (c === "·" || c === "*" || c === "." || c === "•") {
      i++;
      // A hydrate's count: "CuSO4·5H2O".
      const count = /^\d+/.exec(body.slice(i))?.[0] ?? "";
      const rest = parseBody(body.slice(i + count.length), inside);
      if (!rest) return undefined;
      for (const [symbol, n] of rest) parts.push([symbol, n * (count ? Number(count) : 1)]);
      return parts;
    }
    // Ligands written in lower case ("bpy", "dba", "en") only inside brackets, so "Ben" is not boron and "en".
    const symbol = SYMBOLS.find((s) => body.startsWith(s, i) && (inside || /^[A-Z]/.test(s)));
    if (!symbol) return undefined;
    i += symbol.length;
    const count = /^\d+/.exec(body.slice(i))?.[0] ?? "";
    i += count.length;
    parts.push([symbol, count ? Number(count) : 1]);
  }
  return parts.length ? parts : undefined;
}

/**
 * A word as a formula: "CO2", "K2CO3", "Pd(OAc)2", "[Ru(bpy)3]2+", "Fe3+", "Fe(III)", "Ni(0)", "13C". Words that
 * are not formulas, or are too like other words to read as one, give undefined: "DNA", "CD45", "IL10" (no
 * element "D" or "L"), "H3K27me3", a lone "In" or "Li" (AMBIGUOUS_ALONE).
 */
function readFormula(word: string): Formula | undefined {
  // A roman numeral alone ("II", "IV") is a phase or a type, not iodine and vanadium.
  if (/^[IVX]+$/.test(word)) return undefined;
  const m = /^(\d+)?([A-Z(\[][A-Za-z0-9()[\]·*•]*?)(?:\((0|[IVX]+|[+-]?\d)\))?(\d*[+-])?$/.exec(word);
  if (!m) return undefined;
  const [, isotope, body, state, charge] = m;
  const parts = parseBody(body!);
  if (!parts) return undefined;
  // A symbol that is also a group ("Ac", "Pr", "Ar", "Ts") is the group inside a formula: "Pd(OAc)2" has no actinium.
  const elements = [...new Set(parts.map(([s]) => s).filter((s) => s in ELEMENTS && !GROUPS.has(s)))];
  if (!elements.length) return undefined;
  const capitals = /^[A-Z]+$/.test(word);
  const bare = parts.length === 1 && parts[0]![1] === 1 && !state && !charge && !isotope;
  if (bare && /[a-z]/.test(word) && AMBIGUOUS_ALONE.has(word)) return undefined;
  // One capital letter alone ("C", "K", "V") is a label, a unit or a variable as often as an element.
  if (bare && word.length === 1) return undefined;
  let ionCharge = "";
  if (state !== undefined) {
    const n = state in ROMAN ? ROMAN[state]! : Number(state.replace("+", ""));
    ionCharge = n === 0 ? "0" : `${Math.abs(n)}${n < 0 ? "-" : "+"}`;
  } else if (charge) {
    ionCharge = `${charge.slice(0, -1) || "1"}${charge.slice(-1)}`;
  }
  const key = `${isotope ?? ""}${parts.map(([s, n]) => `${s}${n === 1 ? "" : n}`).join("")}${ionCharge}`;
  return { key, skeleton: parts.map(([s]) => s).join(","), elements, capitals, bare };
}

/** A text's words as formulas might be written in it: subscripts and superscripts as plain characters ("CO₂" is "CO2"). */
function formulaWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .replace(/[−–]/g, "-")
    .split(/[\s,;:/"“”‘’=≈<>~]+/u)
    .flatMap((raw) => {
      // A formula before a hyphen and a word: "Pd-catalyzed", "Ni(0)-mediated", "CO2-derived".
      let word = raw.replace(/-(?=\p{Ll}{2,})[\p{L}-]*$/u, "").replace(/[.!?]+$/, "");
      // A bracket the word does not close, or open, belongs to the sentence: "(Pd/C)", "(CO2)".
      const balance = (w: string) => [...w].reduce((n, c) => n + (c === "(" ? 1 : c === ")" ? -1 : 0), 0);
      if (word.startsWith("(") && balance(word) > 0) word = word.slice(1);
      if (word.endsWith(")") && balance(word) < 0) word = word.slice(0, -1);
      return word ? [word] : [];
    });
}

/**
 * Element names that are ordinary words as often as metals, and are not read as names: "lead" (a document's "lead
 * section" named lead, Pb, in a quote's title, and the field suite's right answer "puddled iron" lost its label as
 * naming another metal), "tin", "gold" ("gold standard") and "mercury". Their symbols are read ("Pb", "Au").
 */
const ORDINARY_WORDS = new Set(["lead", "tin", "gold", "mercury"]);

/** Element names a text uses, as symbols: "palladium" is Pd, "iron(III)" is Fe, with the formula Fe3+. */
function namedElements(text: string): { elements: Set<string>; formulas: Formula[] } {
  const elements = new Set<string>();
  const formulas: Formula[] = [];
  const lower = text.normalize("NFKC").toLowerCase();
  for (const [symbol, names] of Object.entries(ELEMENTS)) {
    for (const name of names) {
      if (ORDINARY_WORDS.has(name)) continue;
      const pattern = new RegExp(`(?<!\\p{L})${name}(?:\\s?\\((0|[ivx]+)\\))?(?!\\p{L})`, "gu");
      for (const m of lower.matchAll(pattern)) {
        elements.add(symbol);
        if (m[1]) {
          const roman = m[1].toUpperCase();
          const n = roman in ROMAN ? ROMAN[roman]! : 0;
          formulas.push({ key: `${symbol}${n === 0 ? "0" : `${n}+`}`, skeleton: symbol, elements: [symbol], capitals: false, bare: false });
        }
      }
    }
  }
  return { elements, formulas };
}

/**
 * Descriptors that come in exclusive sets, of which a sentence that says one is not backed by quotes that
 * say only another: "(R)" and "(S)", "cis" and "trans", "ortho", "meta" and "para". Each is "set:value".
 */
const DESCRIPTORS: Array<[set: string, pattern: RegExp, value: (m: RegExpMatchArray) => string]> = [
  // Stereodescriptors in brackets before a name: "(R)-ibuprofen", "(1R,2S)-", "(E)-alkene", "(S,S)". "R" and "S"
  // are one set, "E" and "Z" another. Only before a hyphen or a word for an isomer, so a figure's panel "(E)" is not one.
  [
    "",
    /(?<![\p{L}\p{Nd}])\(((?:\d+[a-z]?)?[RSEZ]\*?(?:\s*,\s*(?:\d+[a-z]?)?[RSEZ]\*?)*)\)(?=-|\s+(?:isomers?|enantiomers?|stereoisomers?|diastereomers?|configuration|alkenes?|olefins?|forms?|products?)\b)/gu,
    (m) => {
      const value = m[1]!.replace(/\s+/g, "");
      const letters = value.replace(/[^RSEZ]/g, "");
      return `${/^[RS]+$/.test(letters) ? "cip" : /^[EZ]+$/.test(letters) ? "ez" : "stereo"}:${value}`;
    },
  ],
  // A configuration named after its letter: "the R enantiomer", "S-configured".
  ["cip", /(?<![\p{L}\p{Nd}(])([RS])[- ](?=enantiomer|isomer|configur)/gu, (m) => m[1]!],
  // Optical rotation: "(+)-camphor", "(−)-menthol", "(±)-".
  ["rotation", /\(([+±-])\)(?=-?\p{L})/gu, (m) => m[1]!],
  ["dl", /(?<![\p{L}\p{Nd}-])([DL])-(?=\p{Ll}{3,})(?!shaped|type)/gu, (m) => m[1]!],
  ["cistrans", /(?<![\p{L}])(cis|trans)(?=-|\s|$|[,.;)])/giu, (m) => m[1]!.toLowerCase()],
  ["synanti", /(?<![\p{L}-])(syn|anti)(?![\p{L}-])/giu, (m) => m[1]!.toLowerCase()],
  ["endoexo", /(?<![\p{L}])(endo|exo)(?=-|\s|$|[,.;)])/giu, (m) => m[1]!.toLowerCase()],
  ["position", /(?<![\p{L}])(ortho|meta|para)(?=-\p{L}|\s|$|[,.;)])(?!-analys)/giu, (m) => m[1]!.toLowerCase()],
  ["position", /(?<![\p{L}\p{Nd}-])([omp])-(?=\p{Ll}{3,})(?!values?\b|types?\b)/gu, (m) => ({ o: "ortho", m: "meta", p: "para" })[m[1]!]!],
  // Oxidation and reduction, in the words that say a redox reaction, not a fall: "reduced to the alcohol",
  // "reductive amination", "reduction potential", but not "reduced to 5%" or "reduced mortality".
  ["redox", /(?<!\p{L})(?:oxidi[sz](?:e|ed|es|ing)|oxidations?|oxidative(?:ly)?|electrooxidation)(?!\p{L})/giu, () => "oxidation"],
  [
    "redox",
    /(?<!\p{L})(?:reductive(?:ly)?|electroreduc\p{L}*|reduc(?:e|es|ed|ing)\s+to\s+(?:the\s+|an?\s+)?(?![\d−-]|half|zero|baseline|near|almost|about|approximately|below|less|levels?|background)\p{L}|reduction\s+(?:potentials?|peaks?|waves?|of\s+(?:the\s+)?\p{L}+\s+to)|reducing\s+agents?|reduced\s+forms?)/giu,
    () => "reduction",
  ],
  ["acidbase", /(?<!\p{L})(?:acidic|acidified|acid[- ](?:catalys|catalyz|promoted|mediated)\p{L}*)/giu, () => "acid"],
  ["acidbase", /(?<!\p{L})(?:alkaline|basic\s+(?:conditions?|media|medium|solutions?|ph|aqueous|environments?|hydrolysis)|base[- ](?:catalys|catalyz|promoted|mediated)\p{L}*)/giu, () => "base"],
  ["control", /(?<!\p{L})kinetic(?:ally)?(?=\s+(?:products?|control|controlled|isomers?|enolates?|favou?red|stable|trapped))|(?<!\p{L})kinetically(?!\p{L})/giu, () => "kinetic"],
  ["control", /(?<!\p{L})thermodynamic(?:ally)?(?=\s+(?:products?|control|controlled|isomers?|enolates?|favou?red|stable|sinks?))|(?<!\p{L})thermodynamically(?!\p{L})/giu, () => "thermodynamic"],
];

/**
 * Solvents, by the names and formulas papers give them: "THF" and "tetrahydrofuran" are one. A sentence that
 * names a solvent the quotes do not, where they name another, is not backed: "pKa 9.95 in DMSO" for "in water".
 */
const SOLVENTS: Array<[string, RegExp]> = [
  ["thf", /(?<![\p{L}\p{Nd}])(?:THF|tetrahydrofuran)(?![\p{L}\p{Nd}])/giu],
  ["2-methf", /(?<![\p{L}\p{Nd}])(?:2-MeTHF|2-methyltetrahydrofuran)(?![\p{L}\p{Nd}])/giu],
  ["dmf", /(?<![\p{L}\p{Nd}])(?:DMF|(?:N,N-)?dimethylformamide)(?![\p{L}\p{Nd}])/giu],
  ["dmso", /(?<![\p{L}\p{Nd}])(?:DMSO|dimethyl\s?sulph?oxide)(?!-?d6)(?![\p{L}\p{Nd}])/giu],
  ["dmso-d6", /(?<![\p{L}\p{Nd}])(?:DMSO-d6|\(CD3\)2SO)(?![\p{L}\p{Nd}])/giu],
  ["dcm", /(?<![\p{L}\p{Nd}])(?:DCM|dichloromethane|methylene\s+chloride|CH2Cl2)(?![\p{L}\p{Nd}])/giu],
  ["chloroform", /(?<![\p{L}\p{Nd}])(?:chloroform|CHCl3)(?![\p{L}\p{Nd}-])/giu],
  ["cdcl3", /(?<![\p{L}\p{Nd}])(?:CDCl3|chloroform-d)(?![\p{L}\p{Nd}])/giu],
  ["mecn", /(?<![\p{L}\p{Nd}])(?:MeCN|acetonitrile|CH3CN)(?![\p{L}\p{Nd}])/giu],
  ["meoh", /(?<![\p{L}\p{Nd}])(?:MeOH|methanol|CH3OH)(?![\p{L}\p{Nd}])/giu],
  ["etoh", /(?<![\p{L}\p{Nd}])(?:EtOH|ethanol)(?![\p{L}\p{Nd}])/giu],
  ["ipa", /(?<![\p{L}\p{Nd}])(?:iPrOH|isopropanol|2-propanol|isopropyl\s+alcohol)(?![\p{L}\p{Nd}])/giu],
  ["water", /(?<![\p{L}\p{Nd}])(?:water|H2O)(?![\p{L}\p{Nd}])/giu],
  ["d2o", /(?<![\p{L}\p{Nd}])D2O(?![\p{L}\p{Nd}])/gu],
  ["toluene", /(?<![\p{L}\p{Nd}])toluene(?![\p{L}\p{Nd}])/giu],
  ["benzene", /(?<![\p{L}\p{Nd}])benzene(?![\p{L}\p{Nd}])/giu],
  ["hexane", /(?<![\p{L}\p{Nd}])(?:n-)?hexanes?(?![\p{L}\p{Nd}])/giu],
  ["heptane", /(?<![\p{L}\p{Nd}])(?:n-)?heptanes?(?![\p{L}\p{Nd}])/giu],
  ["pentane", /(?<![\p{L}\p{Nd}])(?:n-)?pentanes?(?![\p{L}\p{Nd}])/giu],
  ["ether", /(?<![\p{L}\p{Nd}])(?:Et2O|diethyl\s+ether)(?![\p{L}\p{Nd}])/giu],
  ["dioxane", /(?<![\p{L}\p{Nd}])(?:1,4-)?dioxane(?![\p{L}\p{Nd}])/giu],
  ["acetone", /(?<![\p{L}\p{Nd}])acetone(?![\p{L}\p{Nd}-])/giu],
  ["etoac", /(?<![\p{L}\p{Nd}])(?:EtOAc|ethyl\s+acetate)(?![\p{L}\p{Nd}])/giu],
  ["dme", /(?<![\p{L}\p{Nd}])(?:DME|1,2-dimethoxyethane|dimethoxyethane)(?![\p{L}\p{Nd}])/giu],
  ["nmp", /(?<![\p{L}\p{Nd}])(?:NMP|N-methyl-2-pyrrolidone|N-methylpyrrolidone)(?![\p{L}\p{Nd}])/giu],
  ["dmac", /(?<![\p{L}\p{Nd}])(?:DMAc|dimethylacetamide)(?![\p{L}\p{Nd}])/giu],
  ["hfip", /(?<![\p{L}\p{Nd}])(?:HFIP|hexafluoroisopropanol|hexafluoro-2-propanol)(?![\p{L}\p{Nd}])/giu],
  ["tfe", /(?<![\p{L}\p{Nd}])(?:TFE|2,2,2-trifluoroethanol|trifluoroethanol)(?![\p{L}\p{Nd}])/giu],
];

/** Substituents as words, with their prefixes: "methyl", "tert-butyl", "isopropyl", "phenyl". */
const SUBSTITUENT = /(?<![\p{L}])((?:tert|sec|iso|neo|n|t|i|s)-)?(methyl|ethyl|propyl|isopropyl|butyl|isobutyl|pentyl|hexyl|octyl|phenyl|benzyl|cyclohexyl|tolyl|mesityl|vinyl|allyl)(?![\p{L}])/giu;

/** What a text says of chemistry, to compare a sentence with the quotes. */
export interface ChemistryNames {
  /** Formulas by their one form, and by skeleton the forms given ("C,O" → CO, CO2). */
  formulas: Set<string>;
  skeletons: Map<string, Set<string>>;
  /** Metals named, by symbol or name. */
  metals: Set<string>;
  /** Descriptors as "set:value" ("cistrans:cis"), solvents as "solvent:thf", substituents as "substituent:methyl". */
  said: Set<string>;
}

/** The chemistry a text names: its formulas, metals, descriptors, solvents and substituents. */
export function chemistryNames(text: string): ChemistryNames {
  const formulas = new Set<string>();
  const skeletons = new Map<string, Set<string>>();
  const metals = new Set<string>();
  const said = new Set<string>();
  const add = (f: Formula) => {
    formulas.add(f.key);
    skeletons.set(f.skeleton, (skeletons.get(f.skeleton) ?? new Set()).add(f.key));
    // A word in capitals alone ("UK", "CO") names no metal: it is too often an acronym.
    if (!f.capitals) for (const e of f.elements) if (!NON_METALS.has(e)) metals.add(e);
  };
  const words = formulaWords(text);
  words.forEach((word, i) => {
    // A surname before "et al.": "Ni et al." is an author, not nickel.
    if (/^et$/i.test(words[i + 1] ?? "") && /^al\.?$/i.test(words[i + 2] ?? "")) return;
    const f = readFormula(word);
    if (f) add(f);
  });
  const named = namedElements(text);
  for (const e of named.elements) if (!NON_METALS.has(e)) metals.add(e);
  for (const f of named.formulas) add(f);
  const flat = text.normalize("NFKC").replace(/[−–]/g, "-");
  for (const [set, pattern, value] of DESCRIPTORS) for (const m of flat.matchAll(pattern)) said.add(set ? `${set}:${value(m)}` : value(m));
  for (const [name, pattern] of SOLVENTS) if (pattern.test(flat)) said.add(`solvent:${name}`);
  for (const m of flat.matchAll(SUBSTITUENT)) {
    const prefix = (m[1] ?? "").toLowerCase().replace("-", "");
    said.add(`substituent:${({ t: "tert", i: "iso", s: "sec", n: "" } as Record<string, string>)[prefix] ?? prefix}${m[2]!.toLowerCase()}`);
  }
  return { formulas, skeletons, metals, said };
}

/** Sets whose values a sentence may name several of, each of which must then be backed: solvents, substituents. */
const ENTITY_SETS = new Set(["solvent", "substituent"]);

/** What the quotes, titles and question say of chemistry, made once for every sentence. */
export interface ChemistryBacking {
  names: ChemistryNames;
}

/**
 * The chemistry of the quotes, titles and question (`context`). Descriptors come from the quotes and titles only
 * (`backing`), as support.ts's directions do: a question asking "is the (R) or the (S) enantiomer active?" backs neither.
 */
export function chemistryBacking(context: string, backing: string = context): ChemistryBacking {
  const names = chemistryNames(context);
  const descriptors = chemistryNames(backing).said;
  const said = new Set([...names.said].filter((s) => ENTITY_SETS.has(s.slice(0, s.indexOf(":")))));
  for (const s of descriptors) if (!ENTITY_SETS.has(s.slice(0, s.indexOf(":")))) said.add(s);
  return { names: { ...names, said } };
}

/**
 * Whether the chemistry a sentence names is what the quotes name, or of a kind they name nothing of:
 * - a formula, when the quotes give one with the same elements in the same order: "CO" is not backed by
 *   "CO₂", "Fe²⁺" by "Fe³⁺", nor "Ni(II)" by "Ni(0)"; "Fe(III)" is backed by "Fe³⁺" and by "iron(III)";
 * - a metal, when the quotes name a metal: "Pt/C" is not backed by "Pd/C", nor "Cs₂CO₃" by "K₂CO₃";
 *   "Pd" is backed by "palladium";
 * - a descriptor of a set the quotes speak of, unless the sentence states two of the set, as the opposites of
 *   support.ts: "(S)" is not backed by "(R)", "exo" by "endo", "para" by "ortho", "reduced to" by "oxidized to";
 * - each solvent and substituent, when the quotes name one: "in DMSO" is not backed by "in water", nor "the
 *   ethyl ester" by "the methyl ester".
 */
export function chemistryBacked(text: string, backing: ChemistryBacking): boolean {
  const own = chemistryNames(text);
  for (const key of own.formulas) {
    if (backing.names.formulas.has(key)) continue;
    const skeleton = [...own.skeletons].find(([, keys]) => keys.has(key))![0];
    const others = backing.names.skeletons.get(skeleton);
    // A bare element ("Ni") claims no state or count, so any form of it in the quotes backs it.
    if (others?.size && !/^[A-Z][a-z]?$/.test(key)) return false;
  }
  const metals = backing.names.metals;
  if (metals.size && [...own.metals].some((m) => !metals.has(m))) return false;
  const sets = new Map<string, string[]>();
  for (const item of own.said) {
    const [set, value] = [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)];
    sets.set(set, [...(sets.get(set) ?? []), value]);
  }
  for (const [set, values] of sets) {
    const quoted = [...backing.names.said].filter((s) => s.startsWith(`${set}:`));
    if (!quoted.length) continue;
    // A sentence stating two descriptors of one set says which is which in its word order, which a word check cannot read.
    if (!ENTITY_SETS.has(set) && values.length > 1) continue;
    if (values.some((v) => !backing.names.said.has(`${set}:${v}`))) return false;
  }
  return true;
}
