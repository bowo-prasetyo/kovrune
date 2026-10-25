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
];

const GUIDE = ["kovrune-user-guide"];
const DESIGN = ["kovrune-design-r3"];
const MPL = ["mpl-2.0"];
const ADA = ["ada-lovelace-lead"];

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
];
