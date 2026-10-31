// Questions that need more than one passage (audit N2): over the field suite's documents, each
// asks for facts that no single passage holds, within one document split into parts or across
// two documents. In the field and held-out suites, 104 of the 126 questions are lookups that one
// passage answers, so their scores say little about these, the kind a reader asks once the
// answer is spread out, and the kind that fills the context window with several reads.
//
// Two suites, reported apart from the others: `multi` (--suites multi) may be looked at task by
// task while a change is developed; `multiholdout` is read only as totals, as the held-out suite
// is (holdout.ts). A question whose facts the held-out suite already asks for is held out here
// too, so developing against `multi` cannot tune on them. The questions and their facts were
// written before any model was run on them, and are not changed to fit a run. Scoring is the
// research suite's: every fact group in the answer, every cited document, a verified quote.

import type { ResearchTask } from "../tasks/research.ts";

const GUIDE = ["kovrune-user-guide"];
const DESIGN = ["kovrune-design-r3"];
const MPL = ["mpl-2.0"];
const ADA = ["ada-lovelace-lead"];
const FUJI = ["mount-fuji-ja-lead"];
const WALL = ["great-wall-zh-lead"];
const EIFFEL = ["eiffel-tower-fr-lead"];

export const multiTasks: ResearchTask[] = [
  // Two parts of the user guide.
  {
    id: "m01-ollama-steps",
    kind: "multi-hop",
    question:
      'The user guide calls Ollama experimental. What went wrong with it in testing, and when the model test says the model is "not acting on tool results", what does the troubleshooting table suggest using instead, and with which model file?',
    answerable: true,
    facts: [["same step"], ["same model file"]],
    citations: [GUIDE],
  },
  {
    id: "m02-wsl-setup",
    kind: "multi-hop",
    question:
      "On Windows with WSL, where should I run the commands that start the app locally, and which llama-server option lets the Windows browser reach a server running in WSL?",
    answerable: true,
    facts: [["WSL terminal"], ["0.0.0.0"]],
    citations: [GUIDE],
  },
  {
    id: "m03-wikipedia-sent",
    kind: "multi-hop",
    question: "When I tick Wikipedia, what does Kovrune send to it, and what happens to the research if Wikipedia can't be reached?",
    answerable: true,
    facts: [["search words", "search terms", "search word"], ["continues", "other sources"]],
    citations: [GUIDE],
  },
  {
    id: "m04-stop-server",
    kind: "multi-hop",
    question:
      "An earlier llama-server is blocking port 8080. Which command does the troubleshooting table give to stop it, and which keys stop llama-server in its own terminal when switching models?",
    answerable: true,
    facts: [["pkill"], ["Ctrl+C"]],
    citations: [GUIDE],
  },
  // Two sections of the licence.
  {
    id: "m05-larger-work",
    kind: "multi-hop",
    question: 'Under the MPL-2.0, what is a "Larger Work", and under which terms may I distribute one?',
    answerable: true,
    facts: [["separate file"], ["terms of your choice", "terms of my choice", "any terms"]],
    citations: [MPL],
  },
  // The user guide and the design.
  {
    id: "m06-context-manager",
    kind: "multi-hop",
    question:
      "What context size does the user guide's llama-server command use, and which component of the design's agent engine selects relevant context within the model's measured context length?",
    answerable: true,
    facts: [["4096"], ["memory manager"]],
    citations: [GUIDE, DESIGN],
  },
  {
    id: "m07-webllm-github",
    kind: "multi-hop",
    question:
      "According to the design, from which GitHub repository does WebLLM fetch its compiled model libraries in M1, and what does the user guide's privacy section say the browser path downloads from GitHub?",
    answerable: true,
    facts: [["binary-mlc-llm-libs"], ["runtime library"]],
    citations: [DESIGN, GUIDE],
  },
  {
    id: "m08-2b-revision",
    kind: "multi-hop",
    question:
      "How big is the one-time browser download of Qwen3.5-2B, according to the user guide, and from which revision does WebLLM fetch model weights in M1, according to the design?",
    answerable: true,
    facts: [["1.1 GB"], ["main"]],
    citations: [GUIDE, DESIGN],
  },
  {
    id: "m09-preview-hosts",
    kind: "multi-hop",
    question:
      "What does the user guide say is shown at the bottom of the preview page, and which static hosts does the design name to replace the GitHub Pages preview?",
    answerable: true,
    facts: [["commit"], ["Cloudflare Pages", "Netlify"]],
    citations: [GUIDE, DESIGN],
  },
  // Two parts of the design.
  {
    id: "m10-reassurance-eval-set",
    kind: "multi-hop",
    question: "What is the design's target for the false reassurance rate, and how many fixed tasks does it plan for the evaluation set?",
    answerable: true,
    facts: [["10%"], ["20–50", "20-50", "20 to 50", "20 and 50"]],
    citations: [DESIGN],
  },
  {
    id: "m11-class-2-gate",
    kind: "multi-hop",
    question:
      "Which hardware is the design's reference hardware class 2, and what must a browser-runnable model do on it to pass the M0 benchmark gate?",
    answerable: true,
    facts: [["16 GB"], ["research tasks"]],
    citations: [DESIGN],
  },
  // Two parts of a lead in Japanese, and of one in English.
  {
    id: "m12-fuji-prefectures-site",
    kind: "multi-hop",
    question: "富士山はどの県に跨っていて、史跡に指定されたのは何年ですか？",
    answerable: true,
    facts: [["山梨"], ["静岡"], ["2011"]],
    citations: [FUJI],
  },
  {
    id: "m13-engine-music",
    kind: "multi-hop",
    question:
      "What has Babbage's analytical engine been recognised as, and besides numbers, what kind of information did Lovelace suggest such a machine could manipulate?",
    answerable: true,
    facts: [["Turing-complete", "Turing complete"], ["music"]],
    citations: [ADA],
  },
];

export const multiHoldoutTasks: ResearchTask[] = [
  {
    id: "x01-4b-sizes",
    kind: "comparison",
    question:
      "How big is the one-time browser download of Qwen3.5-4B, and how big is its Q4_K_M file for a local model server?",
    answerable: true,
    facts: [["2.4 GB"], ["2.6 GB"]],
    citations: [GUIDE],
  },
  {
    id: "x02-download-delete",
    kind: "multi-hop",
    question: "From where does the browser path download its model, and which button frees the space that download takes?",
    answerable: true,
    facts: [["Hugging Face"], ["Delete the download"]],
    citations: [GUIDE],
  },
  {
    id: "x03-node-cmake",
    kind: "multi-hop",
    question:
      "Which Node.js version does running Kovrune locally need, and which build tool besides git and build-essential does the user guide install with apt to build llama.cpp?",
    answerable: true,
    facts: [["22"], ["cmake"]],
    citations: [GUIDE],
  },
  {
    id: "x04-server-address-wsl",
    kind: "multi-hop",
    question:
      "Which address does the app use for a llama-server on the same computer, and which command gives the address to use instead when Windows can't reach the server in WSL?",
    answerable: true,
    facts: [["127.0.0.1:8080"], ["hostname -I"]],
    citations: [GUIDE],
  },
  {
    id: "x05-m0-speed",
    kind: "multi-hop",
    question:
      "What was the outcome of the design's M0 benchmark gate, and how fast is the model test of the model that passed its quality criteria, on the user guide's laptop with 8 GB of memory and integrated Intel graphics?",
    answerable: true,
    facts: [["provisional go"], ["5.5"]],
    citations: [DESIGN, GUIDE],
  },
  {
    id: "x06-ada-exposition",
    kind: "comparison",
    question:
      "Which came first, Ada Lovelace's death or the Exposition universelle for which the Eiffel Tower was built? Give both years.",
    answerable: true,
    facts: [["1852"], ["1889"]],
    citations: [ADA, EIFFEL],
  },
  {
    id: "x07-heritage-first",
    kind: "comparison",
    question: "Which became a UNESCO World Heritage Site first, Mount Fuji or the Great Wall of China, and in which years?",
    answerable: true,
    facts: [["1987"], ["2013"]],
    citations: [WALL, FUJI],
  },
  {
    id: "x08-tower-fuji-height",
    kind: "comparison",
    question: "Which is higher: the Eiffel Tower with its antennas, or the highest point of Mount Fuji? Give both heights in metres.",
    answerable: true,
    facts: [["330"], ["3776.12", "3,776.12", "3776"]],
    citations: [EIFFEL, FUJI],
  },
];
