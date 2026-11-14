// Questions over computer science research papers (harness 0.69.0): the kind of document a computer and
// information sciences researcher brings, which no other suite holds. The field suite's documents are
// Wikipedia leads, a licence and the app's own documentation, and the clinical suite's are trial
// reports. None has a results table of methods against datasets, a learning rate written as a power of
// ten, an ablation, or a paper whose terms are mostly acronyms, which are where reading a CS paper goes
// wrong.
//
// The documents are ten open-access journal papers, CC BY 4.0, from Europe PMC's full-text XML, kept as
// published and built by source/build.py (README.md lists them with their licences). arXiv, where most
// CS papers are read, could not be reached where the suite was written. They are their own library,
// and overlap on purpose: five federated learning papers that share FedAvg, FedProx, CIFAR-10 and
// MNIST, three on retrieval-augmented generation and LLMs, two on knowledge distillation, and many
// numbers that differ only by row, column, dataset or skew level.
//
// The questions ask what a researcher reading related work asks, in kinds tagged on each task:
// - result: a value given in a results or ablation table, next to the other methods', datasets' and
//   settings' values;
// - setup: a hyperparameter or configuration, often a power of ten whose superscript the text lost
//   ("10−3" for 10⁻³), or a value whose unit matters (KB, MB, ms, s);
// - acronym: a question in the words an acronym stands for, about a paper whose tables use only the
//   acronym (or the other way round), which keyword search cannot bridge;
// - negative: a method that did not improve, was not significant or did not cause an effect. Such a
//   task has a fact group of the ways to say so, so an answer that turns "does not consistently
//   outperform" into "outperforms" fails;
// - design: who or what was studied, how many;
// - comparison: two papers' values together;
// - and questions the papers do not answer, with a nearby value in another paper.
//
// Two suites, as for the clinical papers: `cs` may be looked at task by task while a change is
// developed; `csholdout` is read only as totals. The questions and their facts were written from the
// papers before any model was run on them, and are not changed to fit a run. Scoring is the research
// suite's: every fact group in the answer, every cited document, a verified quote.

import type { FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

/** Files in eval/cs/docs/, each the article of the PMCID in its title. */
export const csDocuments: FieldDocument[] = [
  { id: "fedcode-compression", title: "FEDCODE: A Framework and Experimental Study of Model-Update Compression for Communication-Efficient Federated Learning (Sensors 2026, PMC13667620)", file: "fedcode-compression.md" },
  { id: "stabfl-label-skew", title: "StabFL: Stabilized Logit Adjustment with Queue-Augmented Representation Learning for Label-Skewed Federated Learning (Sensors 2026, PMC13667722)", file: "stabfl-label-skew.md" },
  { id: "fl-plant-disease-stabilization", title: "A Comparative Study of Client-Level Stabilization Techniques in Federated Learning for Robust Plant Disease Recognition (Sensors 2026, PMC13709045)", file: "fl-plant-disease-stabilization.md" },
  { id: "vcfedadam-verifiable", title: "VCFedAdam: A Verifiable and Compressed FedAdam Aggregation Scheme for Federated Learning in Distributed Sensor Networks (Sensors 2026, PMC13611767)", file: "vcfedadam-verifiable.md" },
  { id: "fl-iiot-poisoning", title: "Privacy-Preserving and Poisoning-Robust Federated Learning for Industrial IoT (Sensors 2026, PMC13517349)", file: "fl-iiot-poisoning.md" },
  { id: "imflkd-incentive", title: "IMFLKD: an incentive mechanism for decentralized federated learning based on knowledge distillation (Scientific Reports 2026, PMC13039868)", file: "imflkd-incentive.md" },
  { id: "kd-intrusion-detection", title: "A temperature-adaptive logit-standardized knowledge distillation for lightweight network intrusion detection (PLOS One 2026, PMC13726990)", file: "kd-intrusion-detection.md" },
  { id: "arabic-rag-noise", title: "Benchmarking retrieval augmented generation LLMs for Arabic noise robustness (Frontiers in Big Data 2026, PMC13526670)", file: "arabic-rag-noise.md" },
  { id: "longtail-entity-rag", title: "Hierarchical context enhancement for long-tail entity retrieval augmented generation (Frontiers in Artificial Intelligence 2026, PMC13269389)", file: "longtail-entity-rag.md" },
  { id: "llm-bias-rule-induction", title: "Feedback-driven rule induction and retrieval-augmented bias mitigation for large language models (Frontiers in Artificial Intelligence 2026, PMC13638623)", file: "llm-bias-rule-induction.md" },
];

const FEDCODE = ["fedcode-compression"];
const STABFL = ["stabfl-label-skew"];
const PLANT = ["fl-plant-disease-stabilization"];
const VCFEDADAM = ["vcfedadam-verifiable"];
const IIOT = ["fl-iiot-poisoning"];
const IMFLKD = ["imflkd-incentive"];
const KDIDS = ["kd-intrusion-detection"];
const ARABIC = ["arabic-rag-noise"];
const HCE = ["longtail-entity-rag"];
const BIAS = ["llm-bias-rule-induction"];

/**
 * The ways an answer says a method did not improve on another, or a difference was not significant. A
 * negative task needs one of them, so "it outperformed" fails where the paper says it did not; the
 * scorer matches substrings of the lower-cased answer.
 */
const NOT_BETTER = [
  "did not",
  "didn't",
  "does not",
  "doesn't",
  "not consistently",
  "no significant",
  "not significant",
  "not statistically",
  "no statistically",
  "not reach",
  "underperform",
  "worse",
  "lower than",
  "no improvement",
  "not improve",
  "no,",
  "no.",
];

/** A power of ten as the papers' text gives it once its superscript is lost ("10−3"), and as a model may write it. */
const power = (mantissa: string, exponent: number): string[] => {
  const e = String(exponent);
  const m = mantissa === "1" ? ["", "1×", "1 × ", "1x"] : [`${mantissa}×`, `${mantissa} × `, `${mantissa}x`, `${mantissa} x `];
  const decimal = (Number(mantissa) * 10 ** -exponent).toFixed(exponent + (mantissa.includes(".") ? 1 : 0)).replace(/0+$/, "");
  return [...m.flatMap((p) => [`${p}10−${e}`, `${p}10-${e}`, `${p}10^-${e}`, `${p}10^−${e}`]), `${mantissa}e-${e}`, decimal];
};

export const csTasks: ResearchTask[] = [
  // FEDCODE: model-update compression (MNIST, CIFAR-10, FEMNIST, Sent140).
  {
    // result: Table 5 only; FedPAQ (82.27), SparsyFed (83.90) and the raw baseline (88.68) are in the same column.
    id: "cs01-fedcode-fedbat-cifar",
    kind: "lookup",
    question: "In the FEDCODE study, what final test accuracy did the FedBAT baseline reach on CIFAR-10?",
    answerable: true,
    facts: [["86.28"]],
    citations: [FEDCODE],
  },
  {
    // setup: Table 3; MNIST and CIFAR-10 use SGD at 0.01, Sent140 SGD at 0.0003.
    id: "cs02-fedcode-femnist-optimizer",
    kind: "lookup",
    question: "Which optimizer and learning rate did the FEDCODE experiments use on FEMNIST?",
    answerable: true,
    facts: [["Adam"], ["0.004"]],
    citations: [FEDCODE],
  },
  {
    // negative: the abstract and RQ3 say adaptive tuning "does not consistently outperform strong fixed configurations".
    id: "cs03-fedcode-adaptive-tuning",
    kind: "lookup",
    question: "In the FEDCODE study, did adaptive coder-parameter tuning consistently outperform strong fixed coder configurations?",
    answerable: true,
    facts: [NOT_BETTER],
    citations: [FEDCODE],
  },
  // StabFL: label-skewed federated learning (CIFAR-10, PAMAP2).
  {
    // result: Table 4, a two-row header; FedProx's PAMAP2 accuracy at α=0.1 (73.87) and macro-F1 at α=0.3 (76.81) are next to it.
    id: "cs04-stabfl-fedprox-pamap2",
    kind: "lookup",
    question: "In the StabFL paper, what macro-F1 did FedProx reach on PAMAP2 under severe label skew (α=0.1)?",
    answerable: true,
    facts: [["72.37"]],
    citations: [STABFL],
  },
  {
    // setup: Table 3 gives 10−3 and 10−4, superscripts lost, in a row below their headers.
    id: "cs05-stabfl-learning-rate",
    kind: "lookup",
    question: "What learning rate and weight decay were used to train StabFL on CIFAR-10?",
    answerable: true,
    facts: [power("1", 3), power("1", 4)],
    citations: [STABFL],
  },
  {
    // result: in the text only; the whole objective's 2.44× and 2.34× of FedAvg are next to it.
    id: "cs06-stabfl-queue-cost",
    kind: "lookup",
    question: "By how much did adding the client-local queue increase StabFL's average mini-batch time?",
    answerable: true,
    facts: [["4.2%", "4.2 %", "1.042", "0.234"]],
    citations: [STABFL],
  },
  // Plant disease recognition with FedAvg, FedProx and FedAvgM.
  {
    // result: Table 10; the other clients use 6/2 or 8/3.
    id: "cs07-plant-client4-epochs",
    kind: "lookup",
    question: "In the federated plant disease study's second scenario, how many head-training and fine-tuning epochs did client 4 use?",
    answerable: true,
    facts: [["12"], ["4"]],
    citations: [PLANT],
  },
  {
    // negative: the μ ablation finds the decline also at μ=0, "without any regularization", and not growing with μ.
    id: "cs08-plant-fedprox-decline",
    kind: "lookup",
    question: "In the federated plant disease study, was FedProx's late-round accuracy decline caused by its proximal term?",
    answerable: true,
    facts: [["not caused", "not due", "isn't caused", "wasn't caused", "no,", "no.", "without any regularization", "without regularization", "μ=0", "μ = 0", "not grow", "does not", "did not"]],
    citations: [PLANT],
  },
  // VCFedAdam: verifiable, compressed secure aggregation.
  {
    // result: the abstract's totals, next to the sketch ablation's 17.79% and 73.05%.
    id: "cs09-vcfedadam-savings",
    kind: "lookup",
    question: "At a 25% compression ratio, by how much did VCFedAdam reduce computation and communication overhead compared with traditional secure aggregation?",
    answerable: true,
    facts: [["90.25"], ["75.38"]],
    citations: [VCFEDADAM],
  },
  {
    // setup, unit: Table 6; each AN stores 3.33 KB, the server 266.72 KB, and all together 8.30 MB.
    id: "cs10-vcfedadam-user-storage",
    kind: "lookup",
    question: "How much storage does VCFedAdam need on each user?",
    answerable: true,
    facts: [["80.16 KB", "80.16KB", "80.16 kilobytes"]],
    citations: [VCFEDADAM],
  },
  {
    // acronym: the paper names it "CBV" after its first use; it adds 20.33% computation and 113.50% communication.
    id: "cs11-vcfedadam-commitment-cost",
    kind: "lookup",
    question: "How much does the commitment-bound verification mechanism increase VCFedAdam's communication overhead?",
    answerable: true,
    facts: [["113.5"]],
    citations: [VCFEDADAM],
  },
  // Poisoning-robust federated learning for Industrial IoT.
  {
    // result: Table 2; removing multi-layer detection gives 78.6, the full method 84.3.
    id: "cs12-iiot-majority-voting",
    kind: "lookup",
    question: "In the poisoning-robust federated learning paper for Industrial IoT, what accuracy did the method reach under the Sign Flip attack with majority voting removed?",
    answerable: true,
    facts: [["80.5"]],
    citations: [IIOT],
  },
  {
    // setup: given once in the text; Table 3 shows each with three other values.
    id: "cs13-iiot-defaults",
    kind: "lookup",
    question: "What default values of α, β and C does the poisoning-robust federated learning method for Industrial IoT use?",
    answerable: true,
    facts: [["0.65"], ["1.0"], ["0.2"]],
    citations: [IIOT],
  },
  // IMFLKD: incentives for decentralized knowledge-distillation federated learning.
  {
    // result: Table 1, a unit joined to each value ("5062.17s"); IMFLKD's own 0.4465s is in the same row.
    id: "cs14-imflkd-gtg-shapley",
    kind: "lookup",
    question: "In the IMFLKD runtime comparison, how long did GTG-Shapley take with 10 clients?",
    answerable: true,
    facts: [["5062.17", "5,062.17"]],
    citations: [IMFLKD],
  },
  {
    // design: clients 1 through 30 of 100; the label aggregation test uses 10 nodes.
    id: "cs15-imflkd-malicious",
    kind: "lookup",
    question: "In IMFLKD's label-flipping attack experiment, how many of the participating clients were malicious?",
    answerable: true,
    facts: [["30"]],
    citations: [IMFLKD],
  },
  // Knowledge distillation for network intrusion detection (NSL-KDD, CIC-IDS2017).
  {
    // negative: Table 7, every p-value above 0.05.
    id: "cs16-kdids-significance",
    kind: "lookup",
    question: "In the temperature-adaptive logit-standardized knowledge distillation paper, was the full model's difference from standard knowledge distillation statistically significant?",
    answerable: true,
    facts: [NOT_BETTER],
    citations: [KDIDS],
  },
  {
    // setup: powers of ten in the text ("5×10−4", "1×10−5"), next to a batch size of 256 and 30 epochs.
    id: "cs17-kdids-learning-rate",
    kind: "lookup",
    question: "What initial learning rate and weight decay were used to train the lightweight network intrusion detection models?",
    answerable: true,
    facts: [power("5", 4), power("1", 5)],
    citations: [KDIDS],
  },
  {
    // result: Table 6, a two-row header; the CIC-IDS2017 teacher (1,972,360) and the student (462,149) are next to it.
    id: "cs18-kdids-teacher-params",
    kind: "lookup",
    question: "How many parameters does the teacher network have on NSL-KDD in the knowledge distillation paper for network intrusion detection?",
    answerable: true,
    facts: [["1,970,821", "1970821", "1 970 821"]],
    citations: [KDIDS],
  },
  // Arabic RAG noise robustness.
  {
    // result: Table 1; GPT-3.5 has 58.67 in the same column, GPT-4o 80.67 at 100% noise in Table 2.
    id: "cs19-arabic-gpt4o-80",
    kind: "lookup",
    question: "On the Arabic RAG noise-robustness benchmark, what accuracy did GPT-4o reach when 80% of the documents were noise?",
    answerable: true,
    facts: [["61.00", "61.0", "61%", "61 %"]],
    citations: [ARABIC],
  },
  {
    // design: the abstract.
    id: "cs20-arabic-benchmark-size",
    kind: "lookup",
    question: "How many questions and documents does the Arabic RAG noise-robustness benchmark contain?",
    answerable: true,
    facts: [["300"], ["6,196", "6196", "6 196"]],
    citations: [ARABIC],
  },
  // HCE-RAG: long-tail entities in retrieval-augmented generation.
  {
    // acronym, result: the question names the method's acronym, the table calls it "Ours (+All)"; 0.78 is the contextual subset.
    id: "cs21-hcerag-lowfreq-recall",
    kind: "lookup",
    question: "What Recall@10 did HCE-RAG reach on low-frequency entities in the factual subset?",
    answerable: true,
    facts: [["0.82"]],
    citations: [HCE],
  },
  {
    // acronym: the table says only "w/o ESCA"; "w/o CQR" (0.6541) is the next row.
    id: "cs22-hcerag-without-augmentation",
    kind: "lookup",
    question: "In the long-tail entity RAG paper, what accuracy on low-frequency factual questions did the framework reach without entity-sensitive contextual augmentation?",
    answerable: true,
    facts: [["0.6508"]],
    citations: [HCE],
  },
  {
    // negative: "both HyDE and General Query Rewrite underperform the baseline hybrid method" (0.6480 against 0.7116).
    id: "cs23-hcerag-hyde",
    kind: "lookup",
    question: "In the long-tail entity RAG paper, did HyDE query expansion improve accuracy over plain hybrid retrieval?",
    answerable: true,
    facts: [NOT_BETTER],
    citations: [HCE],
  },
  // Feedback-driven rule induction for gender bias.
  {
    // acronym, effect: the 500-record evaluation, next to the 120-record one (24.16 to 7.08).
    id: "cs24-bias-stereotype-500",
    kind: "lookup",
    question: "In the 500-record evaluation of the feedback-driven external alignment memory, how did stereotypical gender assumption change?",
    answerable: true,
    facts: [["14.4"], ["11.0", "11%", "11 %"]],
    citations: [BIAS],
  },
  // Across papers.
  {
    // comparison: FEDCODE's Table 3 (0.01 for MNIST and CIFAR-10) and StabFL's Table 3 (10−3).
    id: "cs25-learning-rates-fedcode-stabfl",
    kind: "comparison",
    question: "Which learning rate did FEDCODE use for its CIFAR-10 experiments, and which did StabFL use for CIFAR-10?",
    answerable: true,
    facts: [["0.01"], power("1", 3)],
    citations: [FEDCODE, STABFL],
  },
  {
    // not in the papers: Gemini-2.5 Flash is evaluated only in the bias paper; the Arabic benchmark has six other models.
    id: "cs26-arabic-gemini",
    kind: "unanswerable",
    question: "What accuracy did Gemini-2.5 Flash reach on the Arabic RAG noise-robustness benchmark with 80% noise documents?",
    answerable: false,
    facts: [],
    citations: [],
  },
];

/** Read only as totals, like the other held-out suites. */
export const csHoldoutTasks: ResearchTask[] = [
  {
    // result: Table 5's raw reference row.
    id: "ch01-fedcode-raw-cifar",
    kind: "lookup",
    question: "In the FEDCODE study, what final accuracy did the uncompressed raw baseline reach on CIFAR-10?",
    answerable: true,
    facts: [["88.68"]],
    citations: [FEDCODE],
  },
  {
    // design: five of 20 by default; the participation analysis uses all 20.
    id: "ch02-stabfl-participation",
    kind: "lookup",
    question: "How many clients take part in each communication round by default in the StabFL experiments, out of how many?",
    answerable: true,
    facts: [["five", "5"], ["20"]],
    citations: [STABFL],
  },
  {
    // setup: the backbone's input size.
    id: "ch03-plant-input-size",
    kind: "lookup",
    question: "What input image size does the CNN backbone in the federated plant disease study take?",
    answerable: true,
    facts: [["320×320", "320x320", "320 × 320", "320 x 320"]],
    citations: [PLANT],
  },
  {
    // setup, unit: about 270 s at 128 kbps, about 3.5 s at 10 Mbps.
    id: "ch04-vcfedadam-latency",
    kind: "lookup",
    question: "What single-round protocol latency did VCFedAdam have at a bandwidth of 128 kbps?",
    answerable: true,
    facts: [["270"]],
    citations: [VCFEDADAM],
  },
  {
    // result: Table 1; FedAvg takes 54.22 s per round on the same dataset.
    id: "ch05-iiot-mvtec-time",
    kind: "lookup",
    question: "How long did each training round take on MVTec AD with the proposed poisoning-robust federated learning method for Industrial IoT?",
    answerable: true,
    facts: [["61.34"]],
    citations: [IIOT],
  },
  {
    // negative: "Pruned Student does not consistently show stronger overall classification performance".
    id: "ch06-kdids-pruned",
    kind: "lookup",
    question: "In the knowledge distillation paper for network intrusion detection, did the 30% pruned student consistently show stronger classification performance?",
    answerable: true,
    facts: [NOT_BETTER],
    citations: [KDIDS],
  },
  {
    // result: Table 2; 69.33 is also Llama-3's accuracy at 80% noise in Table 1.
    id: "ch07-arabic-gpt35-rejection",
    kind: "lookup",
    question: "On the Arabic RAG benchmark, what did GPT-3.5 score in the negative rejection setting, where every document is noise?",
    answerable: true,
    facts: [["69.33"]],
    citations: [ARABIC],
  },
  {
    // result: Table 4; one iteration takes 3 calls, two take 6.
    id: "ch08-bias-api-calls",
    kind: "lookup",
    question: "At most, how many API calls does the feedback-driven bias correction procedure make per sample?",
    answerable: true,
    facts: [["9", "nine"]],
    citations: [BIAS],
  },
  {
    // comparison: FEDCODE's FEMNIST runs (Table 3) and StabFL under severe skew (Table 3).
    id: "ch09-rounds-fedcode-stabfl",
    kind: "comparison",
    question: "How many communication rounds did FEDCODE run on FEMNIST, and how many did StabFL run on CIFAR-10 under severe label skew?",
    answerable: true,
    facts: [["100"], ["200"]],
    citations: [FEDCODE, STABFL],
  },
  {
    // not in the papers: IMFLKD uses EMNIST, MNIST and CIFAR-10; FEMNIST accuracies are FEDCODE's.
    id: "ch10-imflkd-femnist",
    kind: "unanswerable",
    question: "What test accuracy did IMFLKD reach on FEMNIST?",
    answerable: false,
    facts: [],
    citations: [],
  },
];
