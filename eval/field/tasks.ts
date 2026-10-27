// The field suite (issue #35): questions over real documents rather than the synthetic
// corpus, so prompt and guard changes are judged on the kind of text users bring. The
// committed set uses documents whose licences allow it (see eval/field/README.md); private
// documents, such as usability testers' PDFs, are added locally in eval/field/local/.
//
// Scoring is the same as for the research suite (harness/scoring.ts).

import type { ResearchTask } from "../tasks/research.ts";

export interface FieldDocument {
  id: string;
  title: string;
  /** File in eval/field/docs/ (or eval/field/local/ for local documents). PDFs are extracted with pdf.js, as in the app. */
  file: string;
}

/** Frozen copies, so later edits to the originals do not change the suite. */
export const fieldDocuments: FieldDocument[] = [
  { id: "kovrune-user-guide", title: "kovrune-user-guide.md", file: "kovrune-user-guide.md" },
  { id: "kovrune-design-r3", title: "kovrune-design-r3.pdf", file: "kovrune-design-r3.pdf" },
  { id: "mpl-2.0", title: "mpl-2.0.txt", file: "mpl-2.0.txt" },
  { id: "ada-lovelace-lead", title: "Ada Lovelace (Wikipedia, lead section).txt", file: "ada-lovelace-lead.txt" },
  // Documents in other languages (harness 0.19.0): a script without spaces, Han only, and accented Latin.
  { id: "mount-fuji-ja-lead", title: "富士山 (Wikipedia, lead section).txt", file: "mount-fuji-ja-lead.txt" },
  { id: "great-wall-zh-lead", title: "长城 (Wikipedia, lead section).txt", file: "great-wall-zh-lead.txt" },
  { id: "eiffel-tower-fr-lead", title: "Tour Eiffel (Wikipedia, lead section).txt", file: "eiffel-tower-fr-lead.txt" },
];

const GUIDE = ["kovrune-user-guide"];
const DESIGN = ["kovrune-design-r3"];
const MPL = ["mpl-2.0"];
const ADA = ["ada-lovelace-lead"];
const FUJI = ["mount-fuji-ja-lead"];
const WALL = ["great-wall-zh-lead"];
const EIFFEL = ["eiffel-tower-fr-lead"];

export const fieldTasks: ResearchTask[] = [
  // A how-to manual: the user guide (Markdown, 15 KB).
  {
    id: "f01-preview-permission",
    kind: "lookup",
    question: "On the preview site, which Chrome permission lets Kovrune reach a model server on my own computer?",
    answerable: true,
    facts: [["Apps on device"]],
    citations: [GUIDE],
  },
  {
    id: "f02-not-local-network",
    kind: "lookup",
    question: "Which similar-sounding browser permission is not needed for a model server on my own computer?",
    answerable: true,
    facts: [["Local network access"]],
    citations: [GUIDE],
  },
  {
    id: "f03-https-not-supported",
    kind: "lookup",
    question: "llama-server says \"HTTPS is not supported\" when I use -hf. What should I do?",
    answerable: true,
    facts: [["curl", "libssl-dev"]],
    citations: [GUIDE],
  },
  {
    id: "f04-2b-download-size",
    kind: "lookup",
    question: "How big is the browser download for Qwen3.5-2B?",
    answerable: true,
    facts: [["1.1 GB", "1.1GB"]],
    citations: [GUIDE],
  },
  {
    id: "f05-model-test-time",
    kind: "lookup",
    question: "How long does the model test take on suitable hardware?",
    answerable: true,
    facts: [["a minute", "one minute", "1 minute"]],
    citations: [GUIDE],
  },
  {
    id: "f06-context-flag",
    kind: "lookup",
    question: "What context size does the user guide's llama-server command use?",
    answerable: true,
    facts: [["4096", "4,096"]],
    citations: [GUIDE],
  },
  {
    id: "f07-stop-shortcut",
    kind: "unanswerable",
    question: "Which keyboard shortcut stops a running question in Kovrune?",
    answerable: false,
    facts: [],
    citations: [],
  },

  // A long report as an 18-page PDF: the design document, revision 3.
  {
    id: "f08-download-target",
    kind: "lookup",
    question: "What is the target for the model download completion rate?",
    answerable: true,
    facts: [["90%", "90 %", "90 percent"]],
    citations: [DESIGN],
  },
  {
    id: "f09-hosts",
    kind: "lookup",
    question: "Which static hosts does the design suggest instead of GitHub Pages?",
    answerable: true,
    facts: [["Cloudflare"], ["Netlify"]],
    citations: [DESIGN],
  },
  {
    id: "f10-signaling",
    kind: "lookup",
    question: "Which signaling library is suggested for the peer-to-peer prototype?",
    answerable: true,
    facts: [["Trystero"]],
    citations: [DESIGN],
  },
  {
    id: "f11-m0-duration",
    kind: "lookup",
    question: "How long was the M0 benchmark gate estimated to take?",
    answerable: true,
    facts: [["2–3 weeks", "2-3 weeks", "two to three weeks", "2 to 3 weeks"]],
    citations: [DESIGN],
  },
  {
    id: "f12-reassurance-target",
    kind: "multi-hop",
    question: "What is the target for the false reassurance rate, and what was its baseline?",
    answerable: true,
    facts: [["10%", "10 %"], ["14%", "14 %", "3 of 22"]],
    citations: [DESIGN],
  },
  {
    id: "f13-class-1",
    kind: "lookup",
    question: "What hardware is reference hardware class 1?",
    answerable: true,
    facts: [["integrated"], ["8 GB", "8GB"]],
    citations: [DESIGN],
  },
  {
    id: "f14-steering-approval",
    kind: "unanswerable",
    question: "On which date did the steering committee approve the design document?",
    answerable: false,
    facts: [],
    citations: [],
  },

  // A legal text: the Mozilla Public License 2.0.
  {
    id: "f15-cure-period",
    kind: "lookup",
    question:
      "Under the MPL-2.0, if a contributor notifies me of non-compliance for the first time, how long do I have to become compliant to keep my rights?",
    answerable: true,
    facts: [["30 days", "thirty days"]],
    citations: [MPL],
  },
  {
    id: "f16-litigation",
    kind: "lookup",
    question: "Where may litigation relating to the MPL-2.0 be brought?",
    answerable: true,
    facts: [["principal place of business"]],
    citations: [MPL],
  },
  {
    id: "f17-secondary-licenses",
    kind: "lookup",
    question: "Which licenses count as Secondary Licenses under the MPL-2.0?",
    answerable: true,
    facts: [["General Public License", "GPL"], ["Lesser General Public License", "LGPL"], ["Affero"]],
    citations: [MPL],
  },
  {
    id: "f18-mpl-fine",
    kind: "unanswerable",
    question: "What fine, in euros, does the MPL-2.0 set for violating it?",
    answerable: false,
    facts: [],
    citations: [],
  },

  // An encyclopedia article: the lead of Wikipedia's "Ada Lovelace", as in the live checks.
  {
    id: "f19-ada-born",
    kind: "lookup",
    question: "When was Ada Lovelace born?",
    answerable: true,
    facts: [["10 December 1815", "December 10, 1815"]],
    citations: [ADA],
  },
  {
    id: "f20-ada-parents",
    kind: "lookup",
    question: "Who were Ada Lovelace's parents?",
    answerable: true,
    facts: [["Byron"], ["Milbanke"]],
    citations: [ADA],
  },
  {
    id: "f21-ada-music",
    kind: "lookup",
    question: "Besides numbers, what kind of information did Lovelace suggest such a machine could encode?",
    answerable: true,
    facts: [["music"]],
    citations: [ADA],
  },
  {
    // A small model claimed this in a live check (docs/m1-plan.md); the license mentions patents, as a distractor.
    id: "f22-ada-patent",
    kind: "unanswerable",
    question: "Was Ada Lovelace the first person to be awarded a patent?",
    answerable: false,
    facts: [],
    citations: [],
  },

  // Questions across two documents.
  {
    id: "f23-license-and-cure",
    kind: "multi-hop",
    question:
      "Under which license is Kovrune released, and how many days after a first notice of non-compliance does that license give me to comply?",
    answerable: true,
    facts: [["MPL-2.0", "MPL 2.0", "Mozilla Public License"], ["30 days", "thirty days"]],
    citations: [DESIGN, MPL],
  },
  {
    id: "f24-servers",
    kind: "comparison",
    question: "Which local model server does Kovrune support, and what status does Ollama have?",
    answerable: true,
    facts: [["llama.cpp"], ["experimental"]],
    citations: [[...GUIDE, ...DESIGN]],
  },

  // Documents in other languages, asked in their own language. Each has a nearby wrong number
  // (Fuji's 標高 3775.56 m, the wall's traditional 4,500-6,000 km, the tower's original 312 m) and
  // one question the lead does not answer.
  {
    id: "f25-fuji-summit",
    kind: "lookup",
    question: "富士山の山体の最高地点は何メートルですか？",
    answerable: true,
    facts: [["3776.12", "3,776.12"]],
    citations: [FUJI],
  },
  {
    id: "f26-fuji-prefectures",
    kind: "lookup",
    question: "富士山はどの県に跨っていますか？",
    answerable: true,
    facts: [["山梨"], ["静岡"]],
    citations: [FUJI],
  },
  {
    id: "f27-fuji-heritage",
    kind: "lookup",
    question: "富士山が世界文化遺産に登録されたのは何年ですか？",
    answerable: true,
    facts: [["2013"]],
    citations: [FUJI],
  },
  {
    // The lead does not mention the last eruption (1707); models may know it.
    id: "f28-fuji-last-eruption",
    kind: "unanswerable",
    question: "富士山が最後に噴火したのは何年ですか？",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "f29-wall-heritage",
    kind: "lookup",
    question: "长城是哪一年被联合国教科文组织列为世界文化遗产的？",
    answerable: true,
    facts: [["1987"]],
    citations: [WALL],
  },
  {
    id: "f30-wall-length",
    kind: "lookup",
    question: "根据国家文物局的认定，长城墙壕遗存总长度是多少千米？",
    answerable: true,
    facts: [["21,196", "21196"]],
    citations: [WALL],
  },
  {
    id: "f31-wall-dynasty",
    kind: "lookup",
    question: "现存的长城遗迹主要是哪个朝代修筑的？",
    answerable: true,
    facts: [["明长城", "明朝", "明代"]],
    citations: [WALL],
  },
  {
    id: "f32-wall-visitors",
    kind: "unanswerable",
    question: "长城每年接待多少游客？",
    answerable: false,
    facts: [],
    citations: [],
  },
  {
    id: "f33-eiffel-height",
    kind: "lookup",
    question: "Quelle est la hauteur de la tour Eiffel avec ses antennes ?",
    answerable: true,
    facts: [["330"]],
    citations: [EIFFEL],
  },
  {
    id: "f34-eiffel-occasion",
    kind: "lookup",
    question: "Pour quel événement la tour Eiffel a-t-elle été construite ?",
    answerable: true,
    facts: [["Exposition universelle"]],
    citations: [EIFFEL],
  },
  {
    id: "f35-eiffel-visitors-2016",
    kind: "lookup",
    question: "Combien de visiteurs la tour Eiffel a-t-elle accueillis en 2016 ?",
    answerable: true,
    facts: [["5,9 millions", "5.9 millions", "5,9 million", "5.9 million"]],
    citations: [EIFFEL],
  },
  {
    id: "f36-eiffel-ticket",
    kind: "unanswerable",
    question: "Combien coûte un billet pour monter au sommet de la tour Eiffel ?",
    answerable: false,
    facts: [],
    citations: [],
  },

  // Questions in another language than the document that answers them (harness 0.24.0): search
  // matches words, so an English query finds nothing in Japanese or Chinese text.
  {
    id: "f37-fuji-summit-en",
    kind: "lookup",
    question: "How high is the highest point of Mount Fuji, in metres?",
    answerable: true,
    facts: [["3776.12", "3,776.12"]],
    citations: [FUJI],
  },
  {
    id: "f38-wall-heritage-en",
    kind: "lookup",
    question: "In which year did UNESCO list the Great Wall of China as a World Heritage Site?",
    answerable: true,
    facts: [["1987"]],
    citations: [WALL],
  },
  {
    id: "f39-wall-length-en",
    kind: "lookup",
    question: "According to the survey by China's National Cultural Heritage Administration, how long are the Great Wall's walls and trenches in total, in kilometres?",
    answerable: true,
    facts: [["21,196", "21196"]],
    citations: [WALL],
  },
  {
    id: "f40-eiffel-address-en",
    kind: "lookup",
    question: "What is the official address of the Eiffel Tower?",
    answerable: true,
    facts: [["Anatole-France", "Anatole France"]],
    citations: [EIFFEL],
  },
  {
    id: "f41-ada-born-ja",
    kind: "lookup",
    question: "エイダ・ラブレスは何年に生まれましたか？",
    answerable: true,
    facts: [["1815"]],
    citations: [ADA],
  },
  {
    // The Japanese lead does not mention the last eruption (1707), as in f28.
    id: "f42-fuji-last-eruption-en",
    kind: "unanswerable",
    question: "In which year did Mount Fuji last erupt?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
