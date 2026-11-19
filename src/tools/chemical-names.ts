// Chemical names a search should treat as one (harness 0.94.0): a reagent, solvent, catalyst, element or
// technique a paper writes one way and a chemist types another. Chemists rarely define these: a paper writes
// "CH2Cl2" or "Hünig's base" or "PCy3" throughout, and a question asking about "dichloromethane", "DIPEA" or
// "tricyclohexylphosphine" matched it nowhere. The library's own abbreviations (abbreviations.ts) bridge only
// what a document defines in brackets, which these are not. On the chemistry suite's papers, 13 of 30 such
// spellings found their paper among the first three results before this list (eval/chem/README.md).
//
// Like the gene-name forms of 0.87.0 (search.ts, nameForms), it works on the query only: a query naming any
// spelling of an entry also searches the terms of the entry's other spellings. The index is unchanged, so a
// document's own words weigh as before, and a spelling a query does not use adds nothing.
//
// A spelling with a capital letter and no space ("THF", "MeCN", "Pd(OAc)2", "CO2") is matched in its case,
// as a whole word of the query, so "HER" (the hydrogen evolution reaction) is not "her", nor "DMA" "dma" in
// a sentence; others match as a run of the query's words in any case ("hünig's base", "methyl viologen").

import { words } from "../documents/scripts.ts";

/**
 * Entries, each the spellings of one substance or term. Spellings are data: a formula as papers print it
 * (subscripts as digits, as NFKC writes "CO₂"), an abbreviation, an IUPAC or trivial name.
 */
export const CHEMICAL_NAMES: string[][] = [
  // Solvents.
  ["THF", "tetrahydrofuran", "oxolane"],
  ["2-MeTHF", "2-methyltetrahydrofuran"],
  ["DMF", "N,N-dimethylformamide", "dimethylformamide"],
  ["DMAc", "DMA", "N,N-dimethylacetamide", "dimethylacetamide"],
  ["DMSO", "dimethyl sulfoxide", "dimethylsulfoxide", "dimethyl sulphoxide"],
  ["DCM", "CH2Cl2", "dichloromethane", "methylene chloride", "methylene dichloride"],
  ["CHCl3", "chloroform", "trichloromethane"],
  ["CDCl3", "chloroform-d", "deuterochloroform", "deuterated chloroform"],
  ["CH2Br2", "dibromomethane", "methylene bromide"],
  ["MeCN", "CH3CN", "ACN", "acetonitrile"],
  ["MeOH", "CH3OH", "methanol", "methyl alcohol"],
  ["EtOH", "ethanol", "ethyl alcohol"],
  ["iPrOH", "IPA", "isopropanol", "2-propanol", "isopropyl alcohol"],
  ["Et2O", "diethyl ether"],
  ["EtOAc", "ethyl acetate"],
  ["DME", "1,2-dimethoxyethane", "dimethoxyethane", "glyme"],
  ["NMP", "N-methyl-2-pyrrolidone", "N-methylpyrrolidone"],
  ["HFIP", "hexafluoroisopropanol", "hexafluoro-2-propanol"],
  ["TFE", "trifluoroethanol", "2,2,2-trifluoroethanol"],
  ["PhMe", "toluene", "methylbenzene"],
  ["dioxane", "1,4-dioxane"],
  ["H2O", "water"],
  ["D2O", "deuterium oxide", "heavy water"],
  // Bases and acids.
  ["DIPEA", "DIEA", "iPr2NEt", "EtN(iPr)2", "N,N-diisopropylethylamine", "diisopropylethylamine", "Hünig's base", "Hunig's base", "Hünig base", "Hunig base"],
  ["Et3N", "TEA", "NEt3", "triethylamine"],
  ["DBU", "1,8-diazabicyclo[5.4.0]undec-7-ene", "diazabicycloundecene"],
  ["DMAP", "4-dimethylaminopyridine", "dimethylaminopyridine"],
  ["LDA", "lithium diisopropylamide"],
  ["KOtBu", "tBuOK", "potassium tert-butoxide", "potassium t-butoxide"],
  ["NaH", "sodium hydride"],
  ["K2CO3", "potassium carbonate"],
  ["Na2CO3", "sodium carbonate"],
  ["Cs2CO3", "caesium carbonate", "cesium carbonate"],
  ["K3PO4", "potassium phosphate", "tripotassium phosphate"],
  ["KHCO3", "potassium bicarbonate", "potassium hydrogen carbonate", "potassium hydrogencarbonate"],
  ["NaHCO3", "sodium bicarbonate", "sodium hydrogen carbonate"],
  ["NaOH", "sodium hydroxide"],
  ["KOH", "potassium hydroxide"],
  ["TFA", "trifluoroacetic acid"],
  ["HCl", "hydrochloric acid", "hydrogen chloride"],
  ["H2SO4", "sulfuric acid", "sulphuric acid"],
  ["HNO3", "nitric acid"],
  ["AcOH", "HOAc", "acetic acid"],
  ["HCOOH", "HCO2H", "formic acid", "formate", "HCOO-"],
  ["PhOH", "phenol"],
  // Reagents.
  ["NaBH4", "sodium borohydride"],
  ["LiAlH4", "LAH", "lithium aluminium hydride", "lithium aluminum hydride"],
  ["DIBAL", "DIBAL-H", "diisobutylaluminium hydride", "diisobutylaluminum hydride"],
  ["nBuLi", "n-BuLi", "butyllithium", "n-butyllithium"],
  ["TBAF", "tetrabutylammonium fluoride"],
  ["TBAPF6", "Bu4NPF6", "NBu4PF6", "tetrabutylammonium hexafluorophosphate"],
  ["TBACl", "Bu4NCl", "tetrabutylammonium chloride"],
  ["mCPBA", "m-CPBA", "meta-chloroperoxybenzoic acid", "3-chloroperoxybenzoic acid"],
  ["NBS", "N-bromosuccinimide"],
  ["NCS", "N-chlorosuccinimide"],
  ["NIS", "N-iodosuccinimide"],
  ["DDQ", "2,3-dichloro-5,6-dicyano-1,4-benzoquinone"],
  ["TEMPO", "(2,2,6,6-tetramethylpiperidin-1-yl)oxyl", "tetramethylpiperidinyloxyl"],
  ["AIBN", "azobisisobutyronitrile"],
  ["Boc2O", "di-tert-butyl dicarbonate", "Boc anhydride"],
  ["Piv2O", "pivalic anhydride", "trimethylacetic anhydride"],
  ["B2pin2", "bis(pinacolato)diboron"],
  ["H2O2", "hydrogen peroxide"],
  ["AgPF6", "silver hexafluorophosphate"],
  ["CuF2", "copper(II) fluoride", "cupric fluoride"],
  ["CuCl", "copper(I) chloride", "cuprous chloride"],
  ["Hantzsch ester", "HEH", "diethyl 2,6-dimethyl-1,4-dihydropyridine-3,5-dicarboxylate"],
  ["TsNa", "p-TolSO2Na", "sodium p-toluenesulfinate", "sodium 4-methylbenzenesulfinate", "sodium toluenesulfinate"],
  ["MV2+", "methyl viologen", "paraquat"],
  ["isonitrile", "isonitriles", "isocyanide", "isocyanides"],
  ["propylene oxide", "PO", "methyloxirane", "1,2-epoxypropane", "epoxypropane"],
  // Catalysts and ligands.
  ["Ni(cod)2", "Ni(COD)2", "bis(cyclooctadiene)nickel", "bis(1,5-cyclooctadiene)nickel"],
  ["cod", "COD", "1,5-cyclooctadiene", "cyclooctadiene"],
  ["PCy3", "tricyclohexylphosphine"],
  ["PPh3", "triphenylphosphine"],
  ["P(OPh)3", "triphenyl phosphite"],
  ["Pd(OAc)2", "palladium acetate", "palladium(II) acetate"],
  ["Pd(PPh3)4", "tetrakis(triphenylphosphine)palladium"],
  ["Pd2(dba)3", "tris(dibenzylideneacetone)dipalladium"],
  ["Pd/C", "palladium on carbon"],
  ["dtbbpy", "4,4'-di-tert-butyl-2,2'-bipyridine", "di-tert-butylbipyridine"],
  ["bpy", "2,2'-bipyridine", "bipyridine", "bipy"],
  ["phen", "1,10-phenanthroline", "phenanthroline"],
  ["[Ru(bpy)3]2+", "Ru(bpy)3", "[Ru(bpy)3](PF6)2", "[Ru(bpy)3]Cl2", "tris(bipyridine)ruthenium", "tris(2,2'-bipyridine)ruthenium", "ruthenium trisbipyridine"],
  ["Ir(ppy)3", "fac-Ir(ppy)3", "tris(2-phenylpyridine)iridium", "tris(phenylpyridine)iridium"],
  ["4CzIPN", "2,4,5,6-tetra(carbazol-9-yl)isophthalonitrile"],
  ["TPP", "tetraphenylporphyrin", "5,10,15,20-tetraphenylporphyrin"],
  ["FeTPP", "FeTPPCl", "Fe(TPP)Cl", "iron tetraphenylporphyrin"],
  ["FLP", "FLPs", "frustrated Lewis pair", "frustrated Lewis pairs"],
  // Small molecules and gases.
  ["CO2", "carbon dioxide"],
  ["CO", "carbon monoxide"],
  ["H2", "dihydrogen", "hydrogen gas"],
  ["CH4", "methane"],
  ["C2H4", "ethylene", "ethene"],
  ["C2H2", "acetylene", "ethyne"],
  ["NH3", "ammonia"],
  ["N2O", "nitrous oxide"],
  // Electrochemistry, spectroscopy and computation.
  ["SCE", "saturated calomel electrode"],
  ["RHE", "reversible hydrogen electrode"],
  ["NHE", "normal hydrogen electrode"],
  ["SHE", "standard hydrogen electrode"],
  ["Fc", "Fc+", "Fc/Fc+", "ferrocene", "ferrocenium"],
  ["CV", "cyclic voltammetry", "cyclic voltammogram", "cyclic voltammograms"],
  ["LSV", "linear sweep voltammetry"],
  ["EIS", "electrochemical impedance spectroscopy"],
  ["CPE", "controlled potential electrolysis", "bulk electrolysis"],
  ["FE", "faradaic efficiency", "Faradaic efficiency", "faradic efficiency", "Faraday efficiency"],
  ["CO2RR", "CO2 reduction reaction", "carbon dioxide reduction", "CO2 reduction", "CO2 electroreduction"],
  ["HER", "hydrogen evolution reaction", "hydrogen evolution"],
  ["OER", "oxygen evolution reaction", "oxygen evolution"],
  ["ORR", "oxygen reduction reaction", "oxygen reduction"],
  ["TOF", "turnover frequency"],
  ["TON", "turnover number"],
  ["ee", "enantiomeric excess"],
  ["er", "enantiomeric ratio"],
  ["dr", "diastereomeric ratio"],
  ["SET", "single-electron transfer", "single electron transfer"],
  ["HAT", "hydrogen atom transfer"],
  ["PCET", "proton-coupled electron transfer"],
  ["EnT", "energy transfer"],
  ["ISC", "intersystem crossing"],
  ["LFP", "laser flash photolysis"],
  ["TA", "transient absorption"],
  ["EDA", "electron donor-acceptor", "electron donor–acceptor"],
  ["NMR", "nuclear magnetic resonance"],
  ["HRMS", "high-resolution mass spectrometry"],
  ["XPS", "X-ray photoelectron spectroscopy"],
  ["XRD", "X-ray diffraction"],
  ["TEM", "transmission electron microscopy"],
  ["STEM", "scanning transmission electron microscopy"],
  ["SEM", "scanning electron microscopy"],
  ["ICP-OES", "inductively coupled plasma optical emission spectroscopy"],
  ["DLS", "dynamic light scattering"],
  ["DFT", "density functional theory"],
  ["TS", "transition state"],
  ["MOF", "MOFs", "metal-organic framework", "metal–organic framework", "metal-organic frameworks"],
  ["COF", "COFs", "covalent organic framework", "covalent organic frameworks"],
  ["SAC", "SACs", "single-atom catalyst", "single-atom catalysts"],
  ["GNF", "GNFs", "graphitized carbon nanofibers", "graphitised carbon nanofibres"],
  // Metals, by symbol and name. Symbols that are also words or names ("In", "As", "Li") are left out.
  ["Pd", "palladium"],
  ["Pt", "platinum"],
  ["Ni", "nickel"],
  ["Cu", "copper"],
  ["Co", "cobalt"],
  ["Fe", "iron"],
  ["Ru", "ruthenium"],
  ["Rh", "rhodium"],
  ["Ir", "iridium"],
  ["Ag", "silver"],
  ["Au", "gold"],
  ["Zn", "zinc"],
  ["Mn", "manganese"],
  ["Cr", "chromium"],
  ["Ti", "titanium"],
  ["Zr", "zirconium"],
  ["Mo", "molybdenum"],
  ["Os", "osmium"],
  ["Mg", "magnesium"],
  ["Cs", "caesium", "cesium"],
  ["Sn", "tin"],
  ["Bi", "bismuth"],
];

/** Terms an entry adds that say nothing on their own: "acid" of "formic acid", "base" of "Hünig's base". */
const GENERIC = new Set(["acid", "acids", "base", "salt", "reaction", "solution", "ratio", "s", "n", "d", "di", "tri", "tetra"]);

/** A spelling read in its case: a capital letter and no space ("THF", "MeCN", "Pd(OAc)2", "HER"). */
const cased = (spelling: string) => /\p{Lu}/u.test(spelling) && !/\s/.test(spelling);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Matcher {
  entry: number;
  /** Whether the spelling is an abbreviation or a formula, read in its case. */
  cased: boolean;
  test: (raw: string, query: string[]) => boolean;
}

/** Each spelling of each entry, ready to find in a query. */
const MATCHERS: Matcher[] = CHEMICAL_NAMES.flatMap((spellings, entry) =>
  spellings.map((spelling): Matcher => {
    if (cased(spelling)) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(spelling.normalize("NFKC"))}(?![\\p{L}\\p{N}])`, "u");
      return { entry, cased: true, test: (raw) => pattern.test(raw) };
    }
    const own = words(spelling);
    return {
      entry,
      cased: false,
      test: (_raw, query) => own.length > 0 && query.some((_, i) => own.every((w, j) => query[i + j] === w)),
    };
  }),
);

/**
 * The search terms of the other spellings of each entry a query names, made by `terms` (search.ts's
 * tokenizer), without numbers and terms that say nothing alone (GENERIC). "dichloromethane" gives "dcm" and
 * "ch2cl2"; "Pd(OAc)2" gives "palladium" and "acetat".
 *
 * A query that names an entry by an ordinary word adds only its formulas, abbreviations and one-word names, not
 * its names of several words: "methanol dehydrogenase" (an enzyme, in the lab suite) also searched "methyl
 * alcohol", whose "methyl" and "alcohol" changed what search returned for a question about the enzyme. A query
 * naming the entry by an abbreviation or a formula ("MeOH", "FeTPP") is about the chemical, and adds every
 * spelling, so "FeTPP" also searches "iron tetraphenylporphyrin".
 */
export function chemicalNameTerms(query: string, terms: (text: string) => string[]): string[] {
  const raw = query.normalize("NFKC").replace(/[’‘]/g, "'");
  const said = words(raw);
  const matched = MATCHERS.filter((m) => m.test(raw, said));
  const byAbbreviation = new Set(matched.filter((m) => m.cased).map((m) => m.entry));
  const added = new Set<string>();
  for (const entry of new Set(matched.map((m) => m.entry))) {
    for (const spelling of CHEMICAL_NAMES[entry]!) {
      if (!byAbbreviation.has(entry) && !cased(spelling) && words(spelling).length > 1) continue;
      for (const term of terms(spelling)) if (!/^\d+$/.test(term) && !GENERIC.has(term)) added.add(term);
    }
  }
  return [...added];
}
