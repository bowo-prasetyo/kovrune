// One research question over a set of documents: chunk, index, run the agent,
// and check the evidence. The app and the benchmark both call this, so the
// benchmark measures exactly what users get.

import { chunkDocument, parentId } from "../documents/chunk.ts";
import type { LanguageModel } from "../models/types.ts";
import { SourceSession, type Citation } from "../sources/session.ts";
import type { OpenSource } from "../sources/types.ts";
import { createResearchTools, researchSystem, type ResearchFinal } from "../tools/research.ts";
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
  /** Where cited open-source documents came from, by document ID. */
  citations: Record<string, Citation>;
  /** Open sources that failed during the question, in plain words. */
  sourceErrors: string[];
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
  /** Open sources the agent may search besides the library (none by default). */
  sources?: OpenSource[];
  constrained?: boolean;
  signal?: AbortSignal;
  onCall?: (call: CallRecord, index: number) => void;
}): Promise<ResearchResult> {
  const { library, signal } = options;
  const sources = options.sources ?? [];
  const session = sources.length ? new SourceSession(sources, options.question, signal) : undefined;
  const agent = await runAgent({
    model: options.model,
    system: researchSystem({ documents: library.documents.length > 0, sources: sources.map((s) => s.label) }),
    task: options.question,
    tools: createResearchTools(library.index, session),
    finalTool: "final_answer",
    config: { constrained: options.constrained ?? true, ...RESEARCH_LIMITS },
    signal,
    onCall: options.onCall,
  });
  const raw = agent.final as ResearchFinal | undefined;
  const sourceErrors = () => [...(session?.errors ?? [])];
  if (!raw) return { status: "no-answer", evidence: [], citations: {}, sourceErrors: sourceErrors(), agent };
  const final = { ...raw, answer: withoutPartLabels(raw.answer) };
  await session?.ensure(final.evidence.map((e) => e.docId));
  const evidence = checkEvidence(final.evidence, (id) => library.textFor(id) ?? session?.textFor(id));
  const citations: Record<string, Citation> = {};
  for (const { docId } of final.evidence) {
    const citation = session?.citation(docId);
    if (citation) citations[docId] = citation;
  }
  return { status: answerStatus(final.found, evidence), final, evidence, citations, sourceErrors: sourceErrors(), agent };
}

/** Chunk titles such as "Report (part 2 of 5)" are internal; models sometimes copy them into answers. */
export function withoutPartLabels(answer: string): string {
  return answer.replace(/\s*\(part \d+ of \d+\)/gi, "");
}
