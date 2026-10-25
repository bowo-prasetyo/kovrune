// One research question over a set of documents: chunk, index, run the agent,
// and check the evidence. The app and the benchmark both call this, so the
// benchmark measures exactly what users get.

import { chunkDocument, parentId } from "../documents/chunk.ts";
import type { LanguageModel } from "../models/types.ts";
import { createResearchTools, RESEARCH_SYSTEM, type ResearchFinal } from "../tools/research.ts";
import { DocumentIndex, type SourceDocument } from "../tools/search.ts";
import { runAgent, type AgentRun, type CallRecord } from "./agent.ts";
import { answerStatus, checkEvidence, type AnswerStatus, type CheckedEvidence } from "./evidence.ts";

// Search and read actions are short; the budget is for final answers, which carry quotes.
export const RESEARCH_LIMITS = { maxCalls: 8, maxTokensPerCall: 512 };

export interface ResearchResult {
  status: AnswerStatus | "no-answer";
  final?: ResearchFinal;
  /** Evidence with each quote checked against its document. */
  evidence: CheckedEvidence[];
  agent: AgentRun;
}

/** Chunks documents and builds the search index once, for many questions. */
export class ResearchLibrary {
  readonly documents: SourceDocument[];
  readonly index: DocumentIndex;
  private readonly byId: Map<string, SourceDocument>;

  constructor(documents: SourceDocument[]) {
    this.documents = documents;
    this.index = new DocumentIndex(documents.flatMap((doc) => chunkDocument(doc)));
    this.byId = new Map(documents.map((doc) => [doc.id, doc]));
  }

  /** Full document text for a document or chunk ID; quotes are checked against the whole document. */
  textFor(id: string): string | undefined {
    return this.byId.get(parentId(id))?.text;
  }

  /** The document a document or chunk ID belongs to. */
  documentFor(id: string): SourceDocument | undefined {
    return this.byId.get(parentId(id));
  }
}

export async function runResearch(options: {
  question: string;
  library: ResearchLibrary;
  model: LanguageModel;
  constrained?: boolean;
  signal?: AbortSignal;
  onCall?: (call: CallRecord, index: number) => void;
}): Promise<ResearchResult> {
  const { library } = options;
  const agent = await runAgent({
    model: options.model,
    system: RESEARCH_SYSTEM,
    task: options.question,
    tools: createResearchTools(library.index),
    finalTool: "final_answer",
    config: { constrained: options.constrained ?? true, ...RESEARCH_LIMITS },
    signal: options.signal,
    onCall: options.onCall,
  });
  const raw = agent.final as ResearchFinal | undefined;
  if (!raw) return { status: "no-answer", evidence: [], agent };
  const final = { ...raw, answer: withoutPartLabels(raw.answer) };
  const evidence = checkEvidence(final.evidence, (id) => library.textFor(id));
  return { status: answerStatus(final.found, evidence), final, evidence, agent };
}

/** Chunk titles such as "Report (part 2 of 5)" are internal; models sometimes copy them into answers. */
export function withoutPartLabels(answer: string): string {
  return answer.replace(/\s*\(part \d+ of \d+\)/gi, "");
}
