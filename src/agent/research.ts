// One research question over a set of documents: chunk, index, run the agent,
// and check the evidence. The app and the benchmark both call this, so the
// benchmark measures exactly what users get.

import { chunkDocument, parentId } from "../documents/chunk.ts";
import { documentLanguages } from "../documents/languages.ts";
import { stripThinking, type LanguageModel } from "../models/types.ts";
import { SourceSession, type Citation } from "../sources/session.ts";
import type { OpenSource } from "../sources/types.ts";
import { createResearchTools, researchSystem, type ResearchFinal, type Translate } from "../tools/research.ts";
import { DocumentIndex, type SourceDocument } from "../tools/search.ts";
import { runAgent, type AgentRun, type CallRecord } from "./agent.ts";
import { answerStatus, checkEvidence, type AnswerStatus, type CheckedEvidence } from "./evidence.ts";
import { checkCompleteness, checksCompleteness } from "./completeness.ts";
import { crossCheckAnswer, crossChecksAnswers } from "./crosscheck.ts";
import { reviewAnswer, reviewsShortAnswers } from "./review.ts";
import { reviewAsked, sentenceSupport, wordChecksPass, type SentenceSupport } from "./support.ts";

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

  /** The documents' languages, the most common first (languages.ts), worked out once. */
  get languages(): string[] {
    return (this.cachedLanguages ??= documentLanguages(this.documents.map((doc) => doc.text)));
  }

  private cachedLanguages?: string[];

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
  /** Called as the model starts checking that the quotes back its answer (review.ts). */
  onReview?: () => void;
}): Promise<ResearchResult> {
  const { library, signal } = options;
  const sources = options.sources ?? [];
  const session = sources.length ? new SourceSession(sources, options.question, signal) : undefined;
  const agent = await runAgent({
    model: options.model,
    system: researchSystem({ documents: library.documents.length > 0, sources: sources.map((s) => s.label) }),
    task: options.question,
    tools: createResearchTools(library.index, session, options.question, library.languages, translator(options.model, signal)),
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
  const titleFor = (id: string) => library.documentFor(id)?.title ?? citations[id]?.title;
  const support = sentenceSupport(final.answer, evidence, titleFor, options.question);
  // The word checks pass incomplete and misattributed answers, so the model checks those they would
  // label (review.ts). They cannot judge short ones either, which models whose check has been
  // measured to tell right short answers from wrong ones check too (reviewsShortAnswers).
  const status = answerStatus(final.found, evidence);
  if (wordChecksPass(status, evidence, support) || (reviewsShortAnswers(options.model.info.id) && reviewAsked(status, evidence, support))) {
    options.onReview?.();
    support.review = await reviewAnswer({
      model: options.model,
      question: options.question,
      answer: final.answer,
      evidence,
      titleFor,
      constrained: options.constrained,
      signal,
    });
    // A "yes" is given to nearly every answer with real quotes, so for models it is measured for, the
    // answer the model reads in the passages without seeing this one must agree with it (crosscheck.ts).
    if (support.review === "yes" && crossChecksAnswers(options.model.info.id)) {
      support.crossCheck = await crossCheckAnswer({
        model: options.model,
        question: options.question,
        answer: final.answer,
        evidence,
        titleFor,
        constrained: options.constrained,
        signal,
      });
    }
    // The checks above judge what the answer says, not what it leaves out: an answer to one part of a
    // two-part question passes them all. For models it is measured for, the model lists the parts the
    // question asks for, and the answer must give each (completeness.ts).
    if (support.review === "yes" && support.crossCheck?.agrees !== false && checksCompleteness(options.model.info.id)) {
      support.completeness = await checkCompleteness({
        model: options.model,
        question: options.question,
        answer: final.answer,
        constrained: options.constrained,
        signal,
      });
    }
  }
  return { status, final, evidence, support, citations, sourceErrors: sourceErrors(), agent };
}

/**
 * Translates search terms with the research model itself, in a short call of its own, for search
 * across languages (tools/research.ts). Each query and language is translated once per question.
 * A failed translation gives no translation, so the search goes on with the terms as they are.
 */
function translator(model: LanguageModel, signal?: AbortSignal): Translate {
  const cache = new Map<string, Promise<string | undefined>>();
  return (query, language) => {
    const key = `${language}\n${query}`;
    if (!cache.has(key)) cache.set(key, translateTerms(model, query, language, signal));
    return cache.get(key)!;
  };
}

async function translateTerms(model: LanguageModel, query: string, language: string, signal?: AbortSignal): Promise<string | undefined> {
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: `Translate the search terms the user gives into ${language}. Reply with the translated search terms only, on one line.` },
        { role: "user", content: query },
      ],
      maxTokens: 48,
      temperature: 0,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
  const line = stripThinking(text).split("\n").map((l) => l.trim()).find(Boolean);
  return line?.replace(/^["'“「]+|["'”」]+$/g, "") || undefined;
}

/** Chunk titles such as "Report (part 2 of 5)" are internal; models sometimes copy them into answers. */
export function withoutPartLabels(answer: string): string {
  return answer.replace(/\s*\(part \d+ of \d+\)/gi, "");
}
