// Chemical names a search should treat as one (harness 0.98.0): a reagent, solvent, catalyst, element or
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

/**
 * Materials (harness 0.108.0, docs/materials-science-audit.md, MS7): a material's formula and its acronym, a word and
 * its formula, a process and its several acronyms, which papers rarely write as a definition ("LLZO" for
 * Li7La3Zr2O12, "titania" for TiO2, "SLM", "L-PBF" and "LPBF" for one process). On the materials suite's library,
 * 20 of 31 such spellings found their document among the first three results before these entries
 * (eval/materials/README.md). Abbreviations that name something else in the other suites are left out: "RA"
 * (rheumatoid arthritis), "PE", "PP" and "CV" (clinical terms), "PBS" (a buffer), "DMA" (dimethylacetamide, above),
 * "CMC" (a critical micelle concentration), "HP" and "AM"; so are spellings whose search terms are ordinary words or
 * fragments ("FAST" for SPS adds "fast"; "Ta-LLZO" adds "ta"). "LFP" is lithium iron phosphate here and laser flash
 * photolysis above: a spelling of two entries adds only their one-word spellings (chemicalNameTerms).
 *
 * A query naming one of these entries by its abbreviation or formula adds only the entry's other abbreviations,
 * formulas and one-word names, not its names of several words, as for a query naming it in words: "SPS" adds "FAST"
 * and "PECS", not "field-assisted sintering technology". With every spelling, the suite's questions that name the
 * paper's own abbreviation ("the SPS-sintered Al-LLZO", "the hot-pressed B4C") also searched "field", "assisted",
 * "current", "lithium", "oxide" and "boron", which ranked the papers' introductions over the tables that answer them,
 * and 49 of 56 questions found everything they need against 52 without the list, as a query writing "Vi-TT" lost
 * clinical passages when it searched its long form's words (search.ts, expandedTerms).
 */
export const MATERIALS_NAMES: string[][] = [
  ["aluminium", "aluminum"],
  ["LiFePO4", "LFP", "lithium iron phosphate"],
  ["LMFP", "LiMnFePO4", "lithium manganese iron phosphate"],
  ["NMC", "NCM", "lithium nickel manganese cobalt oxide", "nickel manganese cobalt oxide"],
  ["NMC811", "NCM811", "LiNi0.8Mn0.1Co0.1O2", "LiNi0.8Co0.1Mn0.1O2"],
  ["NMC622", "NCM622", "LiNi0.6Mn0.2Co0.2O2", "LiNi0.6Co0.2Mn0.2O2"],
  ["NMC532", "NCM523", "LiNi0.5Mn0.3Co0.2O2", "LiNi0.5Co0.2Mn0.3O2"],
  ["NCA", "LiNi0.8Co0.15Al0.05O2", "lithium nickel cobalt aluminium oxide", "lithium nickel cobalt aluminum oxide"],
  ["LCO", "LiCoO2", "lithium cobalt oxide"],
  ["LMO", "LiMn2O4", "lithium manganese oxide"],
  ["LNMO", "LiNi0.5Mn1.5O4", "lithium nickel manganese oxide"],
  ["LTO", "Li4Ti5O12", "lithium titanate"],
  ["LLZO", "LLZTO", "Li7La3Zr2O12", "lithium lanthanum zirconium oxide", "lithium lanthanum zirconate"],
  ["LATP", "Li1.3Al0.3Ti1.7(PO4)3", "lithium aluminium titanium phosphate", "lithium aluminum titanium phosphate"],
  ["LAGP", "Li1.5Al0.5Ge1.5(PO4)3", "lithium aluminium germanium phosphate", "lithium aluminum germanium phosphate"],
  ["LLTO", "lithium lanthanum titanate"],
  ["LGPS", "Li10GeP2S12"],
  ["LiPF6", "lithium hexafluorophosphate"],
  ["LiTFSI", "Li-TFSI", "lithium bis(trifluoromethanesulfonyl)imide", "lithium bis(trifluoromethanesulphonyl)imide"],
  ["EC", "ethylene carbonate"],
  ["DMC", "dimethyl carbonate"],
  ["DEC", "diethyl carbonate"],
  ["EMC", "ethyl methyl carbonate"],
  ["FEC", "fluoroethylene carbonate"],
  ["PVDF", "PVdF", "poly(vinylidene fluoride)", "polyvinylidene fluoride", "polyvinylidene difluoride", "poly(vinyl difluoride)"],
  ["SEI", "solid electrolyte interphase"],
  ["TiO2", "titania", "titanium dioxide"],
  ["Al2O3", "alumina", "aluminium oxide", "aluminum oxide"],
  ["ZrO2", "zirconia", "zirconium dioxide", "zirconium oxide"],
  ["YSZ", "8YSZ", "3YSZ", "3Y-TZP", "Y-TZP", "yttria-stabilized zirconia", "yttria-stabilised zirconia", "yttria stabilized zirconia", "yttria stabilised zirconia"],
  ["ZTA", "zirconia-toughened alumina", "zirconia toughened alumina", "Al2O3-ZrO2"],
  ["CeO2", "ceria", "cerium oxide", "cerium dioxide"],
  ["SiO2", "silica", "silicon dioxide"],
  ["MgO", "magnesia", "magnesium oxide"],
  ["ZnO", "zinc oxide"],
  ["SnO2", "tin oxide", "tin dioxide", "stannic oxide"],
  ["ITO", "indium tin oxide"],
  ["FTO", "fluorine-doped tin oxide"],
  ["Fe2O3", "hematite", "haematite"],
  ["Fe3O4", "magnetite"],
  ["SiC", "silicon carbide"],
  ["B4C", "boron carbide"],
  ["TiB2", "titanium diboride"],
  ["ZrB2", "zirconium diboride"],
  ["Si3N4", "silicon nitride"],
  ["h-BN", "hBN", "hexagonal boron nitride"],
  ["cBN", "c-BN", "cubic boron nitride"],
  ["WC", "tungsten carbide"],
  ["TiN", "titanium nitride"],
  ["TiC", "titanium carbide"],
  ["GaN", "gallium nitride"],
  ["GaAs", "gallium arsenide"],
  ["MoS2", "molybdenum disulfide", "molybdenum disulphide"],
  ["WS2", "tungsten disulfide", "tungsten disulphide"],
  ["MXene", "MXenes", "Ti3C2Tx", "Ti3C2"],
  ["GO", "graphene oxide"],
  ["rGO", "RGO", "reduced graphene oxide"],
  ["CNT", "CNTs", "carbon nanotube", "carbon nanotubes"],
  ["Li-S", "Li–S", "lithium-sulfur", "lithium–sulfur", "lithium-sulphur", "lithium sulfur", "lithium sulphur"],
  ["HEMT", "HEMTs", "high electron mobility transistor", "high-electron-mobility transistor", "high electron mobility transistors"],
  // Perovskite photovoltaics.
  ["PSC", "PSCs", "perovskite solar cell", "perovskite solar cells"],
  ["MAPbI3", "MAPI", "CH3NH3PbI3", "methylammonium lead iodide", "methylammonium lead triiodide"],
  ["FAPbI3", "HC(NH2)2PbI3", "formamidinium lead iodide", "formamidinium lead triiodide"],
  ["CsPbI3", "caesium lead iodide", "cesium lead iodide"],
  ["CsPbBr3", "caesium lead bromide", "cesium lead bromide"],
  ["MAI", "methylammonium iodide"],
  ["MABr", "methylammonium bromide"],
  ["FAI", "formamidinium iodide", "formimidamide hydroiodide"],
  ["PEAI", "phenethylammonium iodide", "phenylethylammonium iodide"],
  ["PAI", "propylammonium iodide", "propylamine hydroiodide", "n-propylammonium iodide"],
  ["PTAA", "poly(triaryl amine)", "poly(triarylamine)", "polytriarylamine"],
  ["spiro-OMeTAD", "Spiro-OMeTAD"],
  ["PCBM", "PC61BM", "PC60BM", "[6,6]-phenyl-C61-butyric acid methyl ester"],
  // Polymers.
  ["PLA", "PLLA", "PDLA", "polylactide", "poly(lactic acid)", "polylactic acid", "poly-lactic acid", "poly(lactide)"],
  ["PET", "poly(ethylene terephthalate)", "polyethylene terephthalate"],
  ["HDPE", "high-density polyethylene"],
  ["LDPE", "low-density polyethylene"],
  ["UHMWPE", "ultra-high molecular weight polyethylene", "ultrahigh molecular weight polyethylene"],
  ["iPP", "isotactic polypropylene"],
  ["PMMA", "poly(methyl methacrylate)", "polymethyl methacrylate", "polymethylmethacrylate"],
  ["PEEK", "polyether ether ketone", "poly(ether ether ketone)", "polyetheretherketone"],
  ["PCL", "polycaprolactone", "poly(ε-caprolactone)", "poly(caprolactone)"],
  ["PEO", "poly(ethylene oxide)", "polyethylene oxide"],
  ["PVA", "PVOH", "poly(vinyl alcohol)", "polyvinyl alcohol"],
  ["PTFE", "polytetrafluoroethylene", "poly(tetrafluoroethylene)"],
  ["PA6", "nylon 6", "nylon-6", "polyamide 6"],
  ["TPU", "thermoplastic polyurethane"],
  ["DSC", "differential scanning calorimetry"],
  ["TGA", "thermogravimetric analysis", "thermogravimetry"],
  ["GPC", "gel permeation chromatography", "size exclusion chromatography", "size-exclusion chromatography"],
  ["FTIR", "FT-IR", "Fourier transform infrared", "Fourier-transform infrared"],
  // Materials characterization.
  ["EBSD", "electron backscatter diffraction", "electron back-scatter diffraction", "electron backscattered diffraction"],
  ["EDS", "EDX", "EDXS", "energy-dispersive X-ray spectroscopy", "energy dispersive X-ray spectroscopy", "energy-dispersive spectroscopy", "energy dispersive spectroscopy"],
  ["BET", "Brunauer-Emmett-Teller", "Brunauer–Emmett–Teller"],
  ["AFM", "atomic force microscopy"],
  ["XRF", "X-ray fluorescence"],
  ["TRPL", "time-resolved photoluminescence", "time resolved photoluminescence"],
  ["EQE", "external quantum efficiency"],
  ["KAM", "kernel average misorientation"],
  // Processes.
  ["L-PBF", "LPBF", "PBF-LB", "PBF-LB/M", "SLM", "DMLS", "laser powder bed fusion", "selective laser melting", "direct metal laser sintering"],
  ["EBM", "PBF-EB", "electron beam melting"],
  ["DED", "directed energy deposition"],
  ["WAAM", "wire arc additive manufacturing"],
  ["HIP", "HIPed", "HIPping", "hot isostatic pressing", "hot isostatically pressed", "hot-isostatic pressing"],
  ["SPS", "PECS", "spark plasma sintering", "field-assisted sintering", "field assisted sintering", "field-assisted sintering technology", "pulsed electric current sintering"],
  ["CVD", "chemical vapour deposition", "chemical vapor deposition"],
  ["PVD", "physical vapour deposition", "physical vapor deposition"],
  ["ALD", "atomic layer deposition"],
  ["MBE", "molecular beam epitaxy"],
  ["PLD", "pulsed laser deposition"],
  ["MOCVD", "MOVPE", "metal-organic chemical vapour deposition", "metalorganic chemical vapor deposition", "metal-organic chemical vapor deposition"],
  ["FSW", "friction stir welding"],
  ["ECAP", "equal channel angular pressing", "equal-channel angular pressing"],
  ["HPT", "high-pressure torsion", "high pressure torsion"],
  ["TBC", "TBCs", "thermal barrier coating", "thermal barrier coatings"],
  // Alloys, structures and mechanisms.
  ["Ti-6Al-4V", "Ti6Al4V", "Ti64", "TC4", "Ti-6Al-4V ELI"],
  ["TC25", "BT25", "Ti-6.5Al-2Mo-1Zr-1Sn-1W-0.2Si"],
  ["316L", "SS316L", "AISI 316L", "316L stainless steel"],
  ["IN718", "Inconel 718", "alloy 718"],
  ["IN625", "Inconel 625", "alloy 625"],
  ["HEA", "HEAs", "MPEA", "MPEAs", "high-entropy alloy", "high-entropy alloys", "high entropy alloy", "high entropy alloys", "multi-principal element alloy"],
  ["CoCrFeMnNi", "CrMnFeCoNi", "FeMnCoCrNi", "Cantor alloy"],
  ["A354", "354 alloy", "AlSi9Cu2Mg", "Al-9Si-2Cu-0.6Mg"],
  ["A356", "356 alloy", "AlSi7Mg"],
  ["fcc", "FCC", "face-centred cubic", "face-centered cubic"],
  ["bcc", "BCC", "body-centred cubic", "body-centered cubic"],
  ["hcp", "HCP", "hexagonal close-packed", "hexagonal close packed"],
  ["TRIP", "transformation-induced plasticity", "transformation induced plasticity"],
  ["TWIP", "twinning-induced plasticity", "twinning induced plasticity"],
  ["PAG", "PAGs", "prior austenite grain", "prior austenite grains"],
  ["UTS", "ultimate tensile strength"],
  ["CTE", "coefficient of thermal expansion", "thermal expansion coefficient"],
];

/** Terms an entry adds that say nothing on their own: "acid" of "formic acid", "base" of "Hünig's base". */
const GENERIC = new Set(["acid", "acids", "base", "salt", "reaction", "solution", "ratio", "s", "n", "d", "di", "tri", "tetra"]);

/** A spelling read in its case: a capital letter and no space ("THF", "MeCN", "Pd(OAc)2", "HER"). */
const cased = (spelling: string) => /\p{Lu}/u.test(spelling) && !/\s/.test(spelling);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Matcher {
  entry: number;
  /** The spelling's place in its entry. */
  spelling: number;
  /** Whether the spelling is an abbreviation or a formula, read in its case. */
  cased: boolean;
  test: (raw: string, query: string[]) => boolean;
}

/** Each spelling of each entry, ready to find in a query. */
/** Every entry: the chemical names, then the materials names, whose entries add no names of several words to a query naming them by an abbreviation. */
const ALL_NAMES = [...CHEMICAL_NAMES, ...MATERIALS_NAMES];
const FIRST_MATERIALS_ENTRY = CHEMICAL_NAMES.length;
/** Spellings of more than one entry, as "LFP" (laser flash photolysis, lithium iron phosphate): a query writing one is not about either entry for sure. */
const AMBIGUOUS = new Set(ALL_NAMES.flat().filter((spelling, i, all) => all.indexOf(spelling) !== i));

const MATCHERS: Matcher[] = ALL_NAMES.flatMap((spellings, entry) =>
  spellings.map((spelling, index): Matcher => {
    if (cased(spelling)) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(spelling.normalize("NFKC"))}(?![\\p{L}\\p{N}])`, "u");
      return { entry, spelling: index, cased: true, test: (raw) => pattern.test(raw) };
    }
    const own = words(spelling);
    return {
      entry,
      spelling: index,
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
 * spelling, so "FeTPP" also searches "iron tetraphenylporphyrin". Since harness 0.108.0, not for the materials
 * entries (MATERIALS_NAMES), nor for an abbreviation of two entries ("LFP"), which add only one-word spellings.
 */
export function chemicalNameTerms(query: string, terms: (text: string) => string[]): string[] {
  return expansions(query, terms, (entry) => entry < FIRST_MATERIALS_ENTRY).flatMap((e) => e.added);
}

/** A material the query names: the terms of each spelling of it the query uses, and the terms of its other spellings. */
export interface MaterialName {
  own: string[][];
  added: string[];
}

/**
 * The materials entries a query names (harness 0.108.0), each with the search terms of the spellings the query uses
 * (`own`, one list for each spelling) and those of its other spellings (`added`, as chemicalNameTerms makes them).
 * Search counts an entry's added terms only in a passage that has none of the query's spellings of it whole: a part
 * writing "LLZO", as the query does, gains nothing
 * from also matching "Li7La3Zr2O12", and a part writing only "Li7La3Zr2O12" is found. Added to every passage, as the
 * chemical names are, the materials suite's questions that use a paper's own abbreviation lost answer passages to
 * the parts that also wrote the other spellings (eval/materials/README.md).
 */
export function materialsNameAlternatives(query: string, terms: (text: string) => string[]): MaterialName[] {
  return expansions(query, terms, (entry) => entry >= FIRST_MATERIALS_ENTRY);
}

function expansions(query: string, terms: (text: string) => string[], include: (entry: number) => boolean): MaterialName[] {
  const raw = query.normalize("NFKC").replace(/[’‘]/g, "'");
  const said = words(raw);
  const matched = MATCHERS.filter((m) => include(m.entry) && m.test(raw, said));
  // An entry named by an abbreviation or formula that belongs to it alone; "LFP", of two entries, names neither for sure.
  const byAbbreviation = new Set(matched.filter((m) => m.cased && !AMBIGUOUS.has(ALL_NAMES[m.entry]![m.spelling]!)).map((m) => m.entry));
  const seen = new Set<string>();
  const out: MaterialName[] = [];
  for (const entry of new Set(matched.map((m) => m.entry))) {
    const own = matched.filter((m) => m.entry === entry).map((m) => terms(ALL_NAMES[entry]![m.spelling]!));
    const added: string[] = [];
    for (const spelling of ALL_NAMES[entry]!) {
      const wordsOnlyWhenNamedInWords = !byAbbreviation.has(entry) || entry >= FIRST_MATERIALS_ENTRY;
      if (wordsOnlyWhenNamedInWords && !cased(spelling) && words(spelling).length > 1) continue;
      for (const term of terms(spelling)) {
        if (/^\d+$/.test(term) || GENERIC.has(term) || seen.has(term)) continue;
        seen.add(term);
        added.push(term);
      }
    }
    out.push({ own, added });
  }
  return out;
}
