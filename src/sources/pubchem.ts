// PubChem (harness 0.99.0): the US National Library of Medicine's database of chemical compounds,
// recommendation 5 of the chemistry researcher's audit. A paper names a compound; PubChem gives what a
// chemist looks up about it: its formula and weight, IUPAC name, identifiers (CAS numbers among its
// synonyms, InChIKey, SMILES), a short description, and measured properties (boiling and melting points,
// density, solubility, vapour pressure, pKa…), each with the source PubChem took it from.
//
// It is read through PUG REST and PUG View, which need no key. A search is a compound's name, synonym,
// CAS number, InChIKey or CID; a question in words ("the boiling point of THF") is read for its name.
// A compound is read as one document: PubChem's computed properties, then its descriptions and its
// experimental properties, each value with its source.

import { getJson, SourceError, type FetchLike, type FetchedDocument, type OpenSource, type SourceHit } from "./types.ts";

export const PUBCHEM_REST = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
export const PUBCHEM_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view";
export const PUBCHEM_AUTOCOMPLETE = "https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound";
const PREFIX = "pubchem:";
const HITS = 5;

/** The computed properties a search shows and a read gives. "SMILES" is the full SMILES, as PubChem names it since 2025. */
export const SEARCH_PROPERTIES = "Title,MolecularFormula,MolecularWeight,IUPACName";
export const READ_PROPERTIES = "Title,MolecularFormula,MolecularWeight,ExactMass,IUPACName,InChI,InChIKey,SMILES,XLogP,Charge";

/** Values given per experimental property: PubChem lists every source's, and a common solvent has dozens. */
const VALUES_PER_PROPERTY = 6;
const SYNONYMS = 15;

export interface PubChemProperties {
  CID: number;
  Title?: string;
  MolecularFormula?: string;
  MolecularWeight?: string | number;
  ExactMass?: string | number;
  IUPACName?: string;
  InChI?: string;
  InChIKey?: string;
  SMILES?: string;
  /** The names PubChem gave SMILES before 2025, read when a response still has them. */
  IsomericSMILES?: string;
  CanonicalSMILES?: string;
  XLogP?: number;
  Charge?: number;
}

/** PUG View's section tree, as far as a compound's properties need it. */
export interface PugViewSection {
  TOCHeading?: string;
  Section?: PugViewSection[];
  Information?: Array<{
    ReferenceNumber?: number;
    Name?: string;
    Value?: { StringWithMarkup?: Array<{ String?: string }>; Number?: number[]; Unit?: string };
  }>;
}

export interface PugViewRecord {
  Record?: { RecordNumber?: number; RecordTitle?: string; Section?: PugViewSection[]; Reference?: Array<{ ReferenceNumber?: number; SourceName?: string }> };
}

/** The ID the model sees for a compound, "pubchem:8028". */
export function pubchemDocId(cid: number): string {
  return `${PREFIX}${cid}`;
}

/** A CAS Registry Number with a right check digit: "109-99-9". PubChem lists them among a compound's synonyms. */
export function isCasNumber(text: string): boolean {
  const match = /^(\d{2,7})-(\d{2})-(\d)$/.exec(text.trim());
  if (!match) return false;
  const digits = (match[1]! + match[2]!).split("").reverse();
  const sum = digits.reduce((total, d, i) => total + Number(d) * (i + 1), 0);
  return sum % 10 === Number(match[3]);
}

/** Words that ask about a compound rather than name it, left out when a question is read for its name. */
const ASKING = new Set(
  (
    "what which is are was the a an of for in at to and or its it's does do how much many give find show list tell me about please " +
    "boiling melting freezing flash point points temperature density solubility soluble vapor vapour pressure refractive index pka pkb logp " +
    "cas number registry molecular weight mass formula iupac name names synonym synonyms smiles inchi inchikey structure properties property " +
    "physical chemical toxicity toxic hazard hazards safety ghs lethal dose ld50 odor odour colour color appearance value values data"
  ).split(" "),
);

/**
 * The names a search tries, in order: the query as written, then the query without the words that ask
 * about a compound ("boiling point of tetrahydrofuran" is "tetrahydrofuran"), then a CAS number or
 * InChIKey written in it. A name with spaces is kept whole: "sodium borohydride" is one compound.
 */
export function namesIn(query: string): string[] {
  const written = query.trim().replace(/[?.!]+$/, "");
  const kept = written
    .split(/\s+/)
    .filter((w) => !ASKING.has(w.toLowerCase().replace(/[,;:?!()"]/g, "")))
    .join(" ")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "");
  const ids = [...written.matchAll(/\b\d{2,7}-\d{2}-\d\b|\b[A-Z]{14}-[A-Z]{10}-[A-Z]\b/g)].map((m) => m[0]).filter((id) => /[A-Z]/.test(id) || isCasNumber(id));
  return [...new Set([written, kept, ...ids].filter((n) => n.length > 1))];
}

/** A number PubChem gives as a string ("72.11") or a number, as written. */
const asText = (value: string | number | undefined) => (value === undefined ? undefined : String(value));

/** A hit's line: "C4H8O, 72.11 g/mol; IUPAC name: oxolane". */
function snippet(p: PubChemProperties): string {
  const parts = [p.MolecularFormula, p.MolecularWeight !== undefined ? `${asText(p.MolecularWeight)} g/mol` : undefined].filter(Boolean).join(", ");
  return [parts, p.IUPACName ? `IUPAC name: ${p.IUPACName}` : undefined].filter(Boolean).join("; ") || "No properties.";
}

/** The sections under a heading, anywhere in the tree. */
function sectionsNamed(sections: PugViewSection[] | undefined, heading: string): PugViewSection[] {
  const found: PugViewSection[] = [];
  for (const section of sections ?? []) {
    if (section.TOCHeading === heading) found.push(section);
    found.push(...sectionsNamed(section.Section, heading));
  }
  return found;
}

/** An Information's value as text: its strings, or its numbers with their unit. */
function valueText(value: NonNullable<PugViewSection["Information"]>[number]["Value"]): string {
  if (!value) return "";
  const strings = (value.StringWithMarkup ?? []).map((s) => s.String?.trim()).filter(Boolean);
  if (strings.length) return strings.join(" ");
  if (value.Number?.length) return `${value.Number.join(", ")}${value.Unit ? ` ${value.Unit}` : ""}`;
  return "";
}

/**
 * A compound's experimental properties as text, from PUG View's "Experimental Properties" section: each
 * property a heading, and under it up to VALUES_PER_PROPERTY values, each with the source PubChem names
 * ("66 °C (Hazardous Substances Data Bank)"). Values repeated by several sources are written once.
 */
export function experimentalText(view: PugViewRecord): string {
  const record = view.Record;
  const sources = new Map((record?.Reference ?? []).map((r) => [r.ReferenceNumber, r.SourceName]));
  const lines: string[] = [];
  for (const experimental of sectionsNamed(record?.Section, "Experimental Properties")) {
    for (const property of experimental.Section ?? []) {
      const seen = new Set<string>();
      const values: string[] = [];
      for (const info of property.Information ?? []) {
        const text = valueText(info.Value).replace(/\s+/g, " ");
        if (!text || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        const source = sources.get(info.ReferenceNumber);
        values.push(`- ${text}${source ? ` (${source})` : ""}`);
      }
      if (!values.length) continue;
      lines.push(`### ${property.TOCHeading ?? "Property"}`);
      lines.push(...values.slice(0, VALUES_PER_PROPERTY));
      if (values.length > VALUES_PER_PROPERTY) lines.push(`(${values.length - VALUES_PER_PROPERTY} more values on PubChem)`);
    }
  }
  return lines.join("\n");
}

/** A compound's text: its computed properties, identifiers and synonyms, descriptions, and experimental properties. */
export function compoundText(
  p: PubChemProperties,
  extra: { synonyms?: string[]; descriptions?: Array<{ text: string; source?: string }>; experimental?: string; notes?: string[] },
): string {
  const title = p.Title ?? `CID ${p.CID}`;
  const smiles = p.SMILES ?? p.IsomericSMILES ?? p.CanonicalSMILES;
  const cas = [...new Set((extra.synonyms ?? []).filter(isCasNumber))];
  const names = (extra.synonyms ?? []).filter((s) => !isCasNumber(s) && s !== title).slice(0, SYNONYMS);
  const lines = [
    `# ${title} (PubChem CID ${p.CID})`,
    ...(p.IUPACName ? [`IUPAC name: ${p.IUPACName}`] : []),
    ...(p.MolecularFormula ? [`Molecular formula: ${p.MolecularFormula}`] : []),
    ...(p.MolecularWeight !== undefined ? [`Molecular weight: ${asText(p.MolecularWeight)} g/mol`] : []),
    ...(p.ExactMass !== undefined ? [`Exact mass: ${asText(p.ExactMass)} Da`] : []),
    ...(p.Charge ? [`Charge: ${p.Charge}`] : []),
    ...(p.XLogP !== undefined ? [`XLogP3 (computed): ${p.XLogP}`] : []),
    ...(cas.length ? [`CAS number${cas.length > 1 ? "s" : ""}: ${cas.join(", ")}`] : []),
    ...(p.InChIKey ? [`InChIKey: ${p.InChIKey}`] : []),
    ...(p.InChI ? [`InChI: ${p.InChI}`] : []),
    ...(smiles ? [`SMILES: ${smiles}`] : []),
    ...(names.length ? [`Other names: ${names.join("; ")}`] : []),
    "(The formula, weights, XLogP3 and identifiers are computed by PubChem from the structure.)",
  ];
  if (extra.descriptions?.length) {
    lines.push("", "## Description");
    for (const d of extra.descriptions) lines.push(`${d.text}${d.source ? ` (${d.source})` : ""}`);
  }
  if (extra.experimental) lines.push("", "## Experimental properties", extra.experimental);
  if (extra.notes?.length) lines.push("", ...extra.notes.map((n) => `(${n})`));
  return lines.join("\n");
}

/**
 * PubChem as an open source. A search tries each of namesIn's names as a name, synonym or CAS number,
 * then PubChem's autocomplete, and gives up to five compounds with their formula, weight and IUPAC name.
 * Reading a compound asks for its computed properties, synonyms, descriptions and experimental properties;
 * a part that fails is left out and said to be.
 */
export function createPubChem(fetchImpl: FetchLike = fetch): OpenSource {
  const label = "PubChem";

  /** The CIDs a name gives, or none when PubChem knows no such name (it answers 404). */
  async function cidsFor(name: string, signal?: AbortSignal): Promise<number[]> {
    const namespace = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(name) ? "inchikey" : /^(?:CID\s*)?\d+$/i.test(name) && !isCasNumber(name) ? "cid" : "name";
    const id = namespace === "cid" ? name.replace(/\D/g, "") : name;
    if (namespace === "cid") return [Number(id)];
    try {
      const data = await getJson(fetchImpl, label, `${PUBCHEM_REST}/compound/${namespace}/${encodeURIComponent(id)}/cids/JSON`, signal);
      return ((data?.IdentifierList?.CID ?? []) as number[]).filter((cid) => cid > 0);
    } catch (error) {
      if (error instanceof SourceError && (error.status === 404 || error.status === 400)) return [];
      throw error;
    }
  }

  async function properties(cids: number[], fields: string, signal?: AbortSignal): Promise<PubChemProperties[]> {
    const data = await getJson(fetchImpl, label, `${PUBCHEM_REST}/compound/cid/${cids.join(",")}/property/${fields}/JSON`, signal);
    return (data?.PropertyTable?.Properties ?? []) as PubChemProperties[];
  }

  /** Names PubChem's autocomplete suggests for what was typed, for a name written another way. */
  async function suggestions(text: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const data = await getJson(fetchImpl, label, `${PUBCHEM_AUTOCOMPLETE}/${encodeURIComponent(text)}/json?limit=3`, signal);
      return (data?.dictionary_terms?.compound ?? []) as string[];
    } catch (error) {
      if (signal?.aborted) throw error;
      return [];
    }
  }

  return {
    name: "pubchem",
    label,
    searchHint: "Query one compound's name, CAS number or InChIKey, not a question.",
    async search(query, signal) {
      const cids: number[] = [];
      const add = (found: number[]) => {
        for (const cid of found) if (!cids.includes(cid)) cids.push(cid);
      };
      const names = namesIn(query);
      for (const name of names) {
        add(await cidsFor(name, signal));
        if (cids.length) break;
      }
      if (!cids.length) {
        for (const name of names.slice(-2)) {
          for (const suggested of await suggestions(name, signal)) {
            add(await cidsFor(suggested, signal));
            if (cids.length >= HITS) break;
          }
          if (cids.length) break;
        }
      }
      if (!cids.length) return [];
      const found = await properties(cids.slice(0, HITS), SEARCH_PROPERTIES, signal);
      return found.map((p): SourceHit => ({ id: pubchemDocId(p.CID), title: p.Title ?? `CID ${p.CID}`, snippet: snippet(p) }));
    },
    async fetch(id, signal) {
      const cid = Number(/^pubchem:(\d+)$/.exec(id)?.[1]);
      if (!Number.isInteger(cid) || cid <= 0) throw new SourceError(`"${id}" is not a PubChem compound ID.`);
      let props: PubChemProperties[];
      try {
        props = await properties([cid], READ_PROPERTIES, signal);
      } catch (error) {
        // A property PubChem no longer knows by that name makes the whole request fail (HTTP 400): ask again for the basic ones.
        if (!(error instanceof SourceError && error.status === 400)) throw error;
        props = await properties([cid], `${SEARCH_PROPERTIES},ExactMass,InChI,InChIKey,XLogP,Charge`, signal);
      }
      const p = props[0];
      if (!p) throw new SourceError(`PubChem has no compound with CID ${cid}.`);
      const notes: string[] = [];
      /** A part of the record: a failure leaves it out, and says so, unless the run was stopped. */
      const part = async <T>(what: string, get: () => Promise<T>): Promise<T | undefined> => {
        try {
          return await get();
        } catch (error) {
          if (signal?.aborted) throw error;
          if (!(error instanceof SourceError && error.status === 404)) notes.push(`PubChem did not give this compound's ${what}, so they are left out.`);
          return undefined;
        }
      };
      const synonyms = await part("synonyms", async () => {
        const data = await getJson(fetchImpl, label, `${PUBCHEM_REST}/compound/cid/${cid}/synonyms/JSON`, signal);
        return (data?.InformationList?.Information?.[0]?.Synonym ?? []) as string[];
      });
      const descriptions = await part("descriptions", async () => {
        const data = await getJson(fetchImpl, label, `${PUBCHEM_REST}/compound/cid/${cid}/description/JSON`, signal);
        const info = (data?.InformationList?.Information ?? []) as Array<{ Description?: string; DescriptionSourceName?: string }>;
        return info.filter((i) => i.Description).map((i) => ({ text: i.Description!.replace(/\s+/g, " ").trim(), ...(i.DescriptionSourceName ? { source: i.DescriptionSourceName } : {}) }));
      });
      const experimental = await part("experimental properties", async () => {
        const view = (await getJson(fetchImpl, label, `${PUBCHEM_VIEW}/data/compound/${cid}/JSON?heading=${encodeURIComponent("Experimental Properties")}`, signal)) as PugViewRecord;
        return experimentalText(view);
      });
      const doc: FetchedDocument = {
        id: pubchemDocId(cid),
        title: p.Title ?? `PubChem CID ${cid}`,
        text: compoundText(p, { ...(synonyms ? { synonyms } : {}), ...(descriptions ? { descriptions } : {}), ...(experimental ? { experimental } : {}), notes }),
        url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
        retrievedAt: new Date().toISOString(),
      };
      return doc;
    },
  };
}
