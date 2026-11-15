import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanDoi,
  describeWork,
  doiInText,
  latexToText,
  linkedFiles,
  matchReference,
  parseBibtex,
  parseReferences,
  parseRis,
  referenceLine,
  workFromEntry,
} from "../src/documents/references.ts";

// As Zotero exports a collection "with files": each entry links to its PDF under files/<n>/.
const ZOTERO_BIB = String.raw`
@comment{jabref-meta: databaseType:bibtex;}
@article{lee_gan_2021,
	title = {A {GaN}-Based Totem-Pole {PFC} Rectifier with Soft Switching},
	volume = {36},
	doi = {10.1109/TPEL.2021.3061234},
	journal = {IEEE Transactions on Power Electronics},
	author = {Lee, Fred C. and M{\"u}ller, J{\"o}rg and Zhang, Wei},
	year = {2021},
	pages = {9012--9025},
	file = {Full Text PDF:files/12/Lee et al. - 2021 - A GaN-Based Totem-Pole PFC Rectifier.pdf:application/pdf},
}

@inproceedings{ortiz_2019,
	title = "Thermal Cycling of Sintered Silver Die Attach",
	booktitle = {Proc. IEEE APEC},
	author = {Ortiz, Ana},
	year = 2019,
	file = {:C\:/Users/ana/Mendeley Desktop/Ortiz 2019 sintered.pdf:pdf},
}
`;

const ZOTERO_RIS = `TY  - JOUR
TI  - Fatigue of Welded Joints under Variable Amplitude Loading
AU  - Sonsino, C. M.
AU  - Fricke, Wolfgang
PY  - 2018
DA  - 2018/03/01/
T2  - International Journal of Fatigue
DO  - 10.1016/j.ijfatigue.2017.11.004
L1  - files/7/Sonsino and Fricke - 2018 - Fatigue of Welded Joints.pdf
ER  - 

TY  - BOOK
TI  - Power Electronics: Converters, Applications, and Design
AU  - Mohan, Ned
PY  - 2003
PB  - Wiley
ER  - 
`;

describe("reference exports", () => {
  it("reads BibTeX as Zotero and Mendeley write it", () => {
    const [gan, ortiz] = parseBibtex(ZOTERO_BIB);
    assert.deepEqual(gan, {
      title: "A GaN-Based Totem-Pole PFC Rectifier with Soft Switching",
      authors: ["Fred C. Lee", "Jörg Müller", "Wei Zhang"],
      year: 2021,
      doi: "10.1109/TPEL.2021.3061234",
      venue: "IEEE Transactions on Power Electronics",
      files: ["lee et al. - 2021 - a gan-based totem-pole pfc rectifier.pdf"],
    });
    assert.deepEqual(ortiz, {
      title: "Thermal Cycling of Sintered Silver Die Attach",
      authors: ["Ana Ortiz"],
      year: 2019,
      venue: "Proc. IEEE APEC",
      files: ["ortiz 2019 sintered.pdf"],
    });
    assert.equal(parseReferences("library.bib", ZOTERO_BIB).length, 2);
  });

  it("reads RIS", () => {
    const [fatigue, book] = parseRis(ZOTERO_RIS);
    assert.deepEqual(fatigue, {
      title: "Fatigue of Welded Joints under Variable Amplitude Loading",
      authors: ["C. M. Sonsino", "Wolfgang Fricke"],
      year: 2018,
      doi: "10.1016/j.ijfatigue.2017.11.004",
      venue: "International Journal of Fatigue",
      files: ["sonsino and fricke - 2018 - fatigue of welded joints.pdf"],
    });
    assert.deepEqual(book, { title: "Power Electronics: Converters, Applications, and Design", authors: ["Ned Mohan"], year: 2003, venue: "Wiley", files: [] });
    assert.equal(parseReferences("Export.RIS", ZOTERO_RIS).length, 2);
  });

  it("turns LaTeX into text", () => {
    assert.equal(latexToText(String.raw`Sch{\"o}nberg and {\'E}cole -- \&{} 50\% \textit{in situ}`), "Schönberg and École – & 50% in situ");
    assert.equal(latexToText(String.raw`Gau\ss{} and {\o}stergaard`), "Gauß and østergaard");
  });

  it("finds linked files in Zotero, Mendeley and JabRef fields", () => {
    assert.deepEqual(linkedFiles("Snapshot:files/3/page.html:text/html;Full Text:files/3/paper.pdf:application/pdf"), ["page.html", "paper.pdf"]);
    assert.deepEqual(linkedFiles(":paper%20one.pdf:PDF"), ["paper one.pdf"]);
    assert.deepEqual(linkedFiles("/Users/me/Zotero/storage/ABCD/Paper.PDF"), ["paper.pdf"]);
  });
});

describe("DOIs", () => {
  it("cleans a DOI as cited", () => {
    assert.equal(cleanDoi("https://doi.org/10.1109/TPEL.2021.3061234."), "10.1109/TPEL.2021.3061234");
    assert.equal(cleanDoi("doi:10.1016/j.ijfatigue.2017.11.004)"), "10.1016/j.ijfatigue.2017.11.004");
    assert.equal(cleanDoi("not a doi"), undefined);
  });

  it("finds a document's own DOI on its first pages, not those it cites later", () => {
    const pages = ["IEEE TRANSACTIONS ON POWER ELECTRONICS\nDigital Object Identifier 10.1109/TPEL.2021.3061234.\n", "Body text.\n", "[1] Cited, doi:10.1016/j.x.2019.1\n"];
    const pageStarts = [0, pages[0]!.length, pages[0]!.length + pages[1]!.length];
    assert.equal(doiInText(pages.join(""), pageStarts), "10.1109/TPEL.2021.3061234");
    assert.equal(doiInText(`Body.\n${"x ".repeat(5000)}\n[1] doi:10.1016/j.x.2019.1`, [0, 3, 5]), undefined);
    assert.equal(doiInText("Available at https://dx.doi.org/10.5281/zenodo.123456 under CC BY."), "10.5281/zenodo.123456");
  });
});

describe("matching an export to documents", () => {
  const entries = [...parseBibtex(ZOTERO_BIB), ...parseRis(ZOTERO_RIS)];

  it("matches by the linked file, then the printed DOI, then the title", () => {
    const byFile = matchReference({ fileName: "Lee et al. - 2021 - A GaN-Based Totem-Pole PFC Rectifier.pdf", text: "Unrelated text." }, entries);
    assert.equal(byFile?.by, "file");
    assert.equal(byFile?.entry.year, 2021);
    const byDoi = matchReference({ fileName: "1-s2.0-S0142112317304607-main.pdf", text: "International Journal of Fatigue 108 (2018)\nhttps://doi.org/10.1016/j.ijfatigue.2017.11.004" }, entries);
    assert.equal(byDoi?.by, "doi");
    assert.equal(byDoi?.entry.authors[1], "Wolfgang Fricke");
    const byTitle = matchReference({ fileName: "download (3).pdf", text: "APEC 2019\nThermal cycling of sintered-silver die attach\nAna Ortiz" }, entries);
    assert.equal(byTitle?.by, "title");
    assert.equal(matchReference({ fileName: "other.pdf", text: "Something else entirely." }, entries), undefined);
  });

  it("does not match a short title by its words alone", () => {
    const short = parseBibtex("@misc{x, title = {Introduction}, author = {A, B}}");
    assert.equal(matchReference({ fileName: "a.pdf", text: "1. Introduction\nThis paper…" }, short), undefined);
  });

  it("describes a document's details", () => {
    const work = workFromEntry(entries[0]!, "library.bib");
    assert.equal(work.from, "export");
    assert.equal(work.source, "library.bib");
    assert.equal(describeWork(work), "Lee, Müller and Zhang (2021)");
    assert.equal(describeWork({ ...work, authors: ["A B", "C D", "E F", "G H"] }), "B et al. (2021)");
    assert.equal(
      referenceLine(work, "file.pdf"),
      "Lee, Müller and Zhang (2021). A GaN-Based Totem-Pole PFC Rectifier with Soft Switching. IEEE Transactions on Power Electronics. https://doi.org/10.1109/TPEL.2021.3061234",
    );
    assert.equal(referenceLine({ authors: [], doi: "10.1/x", from: "text" }, "file.pdf"), "file.pdf. https://doi.org/10.1/x");
  });
});
