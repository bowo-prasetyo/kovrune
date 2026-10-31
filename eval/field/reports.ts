// The report suite (docs/report-mode.md, slice 4): report requests over the field suite's documents,
// each with the sections a good report on it covers. A section is named by keywords, which find the
// plan question that asks about it, and by the facts its answer must give, as a field task's are.
// The requests and their sections were written before any model was run on them, and are not changed
// to fit a run.
//
// `reports` may be looked at report by report while a change is developed; `reportsholdout` is read
// only as totals, like the held-out suites. Run them with `npm run bench:report` (eval/report.ts).

export interface ExpectedSection {
  /** What the section is about, for the reports. */
  name: string;
  /** Lower-case words or stems; a plan question that contains more of them than of another section's asks about this one. */
  keywords: string[];
  /** As a research task's: each group lists accepted spellings, and the answer must contain one of each. */
  facts: string[][];
  /** The documents the facts are in. */
  citations: string[][];
}

export interface ReportTask {
  id: string;
  request: string;
  sections: ExpectedSection[];
}

const GUIDE = [["kovrune-user-guide"]];
const DESIGN = [["kovrune-design-r3"]];
const MPL = [["mpl-2.0"]];
const ADA = [["ada-lovelace-lead"]];
const FUJI = [["mount-fuji-ja-lead"]];
const EIFFEL = [["eiffel-tower-fr-lead"]];

export const reportTasks: ReportTask[] = [
  {
    id: "rp01-local-server",
    request: "Write a report on setting up Kovrune with a local model server.",
    sections: [
      { name: "downloading a model", keywords: ["download", "model file", "gguf", "size"], facts: [["2.6 GB", "1.2 GB"]], citations: GUIDE },
      { name: "starting the server", keywords: ["start", "command", "launch", "run the server", "flag"], facts: [["4096"]], citations: GUIDE },
      { name: "connecting the app", keywords: ["connect", "address", "url", "endpoint"], facts: [["127.0.0.1:8080"]], citations: GUIDE },
      { name: "the browser permission", keywords: ["permission", "preview", "chrome", "browser"], facts: [["Apps on device"]], citations: GUIDE },
    ],
  },
  {
    id: "rp02-privacy",
    request: "Write a report on what Kovrune does with my data and what it sends over the network.",
    sections: [
      { name: "what an open source is sent", keywords: ["wikipedia", "openalex", "send", "sent", "online"], facts: [["search words", "search terms"]], citations: GUIDE },
      { name: "where documents go", keywords: ["document", "upload", "file"], facts: [["never uploaded", "not uploaded"]], citations: GUIDE },
      { name: "where the model comes from", keywords: ["download", "model", "hugging"], facts: [["Hugging Face"]], citations: GUIDE },
      { name: "removing everything", keywords: ["remove", "delete", "clear", "erase"], facts: [["site's data", "site data"]], citations: GUIDE },
    ],
  },
  {
    id: "rp03-reading-answers",
    request: "Write a report on how to read and check the answers Kovrune gives.",
    sections: [
      { name: "what Quotes found means", keywords: ["quotes found", "label", "mean"], facts: [["quotes are real"]], citations: GUIDE },
      { name: "the closest passage", keywords: ["closest", "partly", "mostly", "not word for word", "differ"], facts: [["70%"]], citations: GUIDE },
      { name: "saving and exporting", keywords: ["export", "save", "past", "markdown"], facts: [["BibTeX"]], citations: GUIDE },
    ],
  },
  {
    id: "rp04-mpl",
    request: "Write a report on the main obligations and rights under the Mozilla Public License 2.0.",
    sections: [
      { name: "secondary licenses", keywords: ["secondary", "compatib", "gpl"], facts: [["GNU General Public License", "GPL"]], citations: MPL },
      { name: "termination and cure", keywords: ["terminat", "cure", "violat", "complian", "breach"], facts: [["30 days"]], citations: MPL },
      { name: "larger works", keywords: ["larger work", "combin"], facts: [["terms of your choice", "separate file"]], citations: MPL },
      { name: "litigation", keywords: ["litigation", "court", "jurisdiction", "law"], facts: [["principal place of business"]], citations: MPL },
    ],
  },
  {
    id: "rp05-ada",
    request: "Write a short biography of Ada Lovelace.",
    sections: [
      { name: "family", keywords: ["parent", "born", "family", "early life", "childhood"], facts: [["Byron"]], citations: ADA },
      { name: "work with Babbage", keywords: ["babbage", "engine", "notes", "bernoulli", "work"], facts: [["Bernoulli"]], citations: ADA },
      { name: "her vision", keywords: ["vision", "beyond", "legacy", "idea", "foresaw", "music"], facts: [["music"]], citations: ADA },
      { name: "marriage", keywords: ["marri", "marry", "husband", "countess", "title"], facts: [["William King"]], citations: ADA },
    ],
  },
  {
    id: "rp06-roadmap",
    request: "Write a report on Kovrune's roadmap and the decisions behind it, according to its design.",
    sections: [
      { name: "the M0 gate", keywords: ["m0", "benchmark", "gate"], facts: [["provisional go"]], citations: DESIGN },
      { name: "trusted circles", keywords: ["circle", "peer", "p2p", "collaborat"], facts: [["Trystero", "WebRTC"]], citations: DESIGN },
      { name: "the license", keywords: ["licens"], facts: [["MPL-2.0", "Mozilla Public License"]], citations: DESIGN },
      { name: "hosting", keywords: ["host", "deploy", "pages"], facts: [["Cloudflare Pages", "Netlify"]], citations: DESIGN },
    ],
  },
];

export const reportHoldoutTasks: ReportTask[] = [
  {
    id: "rx01-eiffel",
    request: "Write a report on the Eiffel Tower.",
    sections: [
      { name: "its height", keywords: ["height", "tall", "high", "metre", "meter"], facts: [["330"]], citations: EIFFEL },
      { name: "why it was built", keywords: ["built", "construct", "history", "why", "origin", "exposition"], facts: [["1889"]], citations: EIFFEL },
      { name: "its visitors", keywords: ["visit", "touris", "attract"], facts: [["5,9 millions", "5.9 million", "300 millions", "300 million"]], citations: EIFFEL },
    ],
  },
  {
    id: "rx02-fuji",
    request: "Write a report on Mount Fuji.",
    sections: [
      { name: "its height", keywords: ["height", "elevation", "tall", "high", "metre", "meter"], facts: [["3776", "3775"]], citations: FUJI },
      { name: "World Heritage", keywords: ["heritage", "unesco", "world"], facts: [["2013"]], citations: FUJI },
      { name: "where it is", keywords: ["where", "locat", "prefecture", "region"], facts: [["山梨", "Yamanashi"], ["静岡", "Shizuoka"]], citations: FUJI },
    ],
  },
  {
    id: "rx03-troubleshooting",
    request: "Write a troubleshooting report for problems setting up Kovrune with llama.cpp.",
    sections: [
      { name: "the port in use", keywords: ["port", "8080", "bind", "in use"], facts: [["pkill", "ss -ltnp", "--port 8081"]], citations: GUIDE },
      { name: "HTTPS not supported", keywords: ["https", "ssl", "-hf"], facts: [["libssl-dev", "curl"]], citations: GUIDE },
      { name: "a failing model test", keywords: ["garbled", "model test", "test fail", "tool results"], facts: [["local model server", "llama.cpp server"]], citations: GUIDE },
    ],
  },
];
