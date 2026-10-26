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
import { sentenceSupport, type SentenceSupport } from "./support.ts";

// Search and read actions are short; the budget is for final answers, which carry quotes.
// Each open source adds a search and a read, since every ticked source is searched.
// A reply cut off at 512 tokens is retried with 1,024; at 8 tokens/s that is about two minutes.
export const RESEARCH_LIMITS = { maxCalls: 8, maxTokensPerCall: 512, cutOffMaxTokens: 1024, callsPerSource: 2 };

export interface ResearchResult {
  status: AnswerStatus | "no-answer";
  final?: ResearchFinal;
  /** Evidence with each quote checked against its document. */
  evidence: CheckedEvidence[];
  /** Which answer sentences the verified quotes back; absent without an answer. */
  support?: SentenceSupport;
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

  /** A PDF's page offsets in the text textFor returns, for a document or chunk ID. */
  pageStartsFor(id: string): number[] | undefined {
    return this.byId.get(parentId(id))?.pageStarts;
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
  /** Called when a search has run, with its result count. */
  onResult?: (call: CallRecord, index: number) => void;
}): Promise<ResearchResult> {
  const { library, signal } = options;
  const sources = options.sources ?? [];
  const session = sources.length ? new SourceSession(sources, options.question, signal) : undefined;
  const agent = await runAgent({
    model: options.model,
    system: researchSystem({ documents: library.documents.length > 0, sources: sources.map((s) => s.label) }),
    task: options.question,
    tools: createResearchTools(library.index, session, options.question),
    finalTool: "final_answer",
    config: {
      constrained: options.constrained ?? true,
      maxCalls: RESEARCH_LIMITS.maxCalls + RESEARCH_LIMITS.callsPerSource * sources.length,
      maxTokensPerCall: RESEARCH_LIMITS.maxTokensPerCall,
      cutOffMaxTokens: RESEARCH_LIMITS.cutOffMaxTokens,
    },
    signal,
    onCall: options.onCall,
    onResult: options.onResult,
  });
  const raw = agent.final as ResearchFinal | undefined;
  const sourceErrors = () => [...(session?.errors ?? [])];
  if (!raw) return { status: "no-answer", evidence: [], citations: {}, sourceErrors: sourceErrors(), agent };
  const final = { ...raw, answer: withoutPartLabels(raw.answer) };
  await session?.ensure(final.evidence.map((e) => e.docId));
  const evidence = checkEvidence(
    final.evidence,
    (id) => library.textFor(id) ?? session?.textFor(id),
    (id) => library.pageStartsFor(id),
  );
  const citations: Record<string, Citation> = {};
  for (const { docId } of final.evidence) {
    const citation = session?.citation(docId);
    if (citation) citations[docId] = citation;
  }
  const support = sentenceSupport(final.answer, evidence, (id) => library.documentFor(id)?.title ?? citations[id]?.title, options.question);
  return { status: answerStatus(final.found, evidence), final, evidence, support, citations, sourceErrors: sourceErrors(), agent };
}

/** Chunk titles such as "Report (part 2 of 5)" are internal; models sometimes copy them into answers. */
export function withoutPartLabels(answer: string): string {
  return answer.replace(/\s*\(part \d+ of \d+\)/gi, "");
}
