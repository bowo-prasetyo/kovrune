// Retrieval on its own (audit item 2): how often the app's search finds what a task needs, with no
// model in the loop. Task success measures search, reading and answering together, so a change to
// search shows here first, and cheaply. The question is the query; the agent writes its own, so this
// is a fixed yardstick for search, not a prediction of what the agent finds.

import { parentId } from "../../src/documents/chunk.ts";
import { normalizeForMatch } from "../../src/agent/evidence.ts";
import type { ResearchLibrary } from "../../src/agent/research.ts";
import { mainScript } from "../../src/documents/scripts.ts";
import type { ResearchTask } from "../tasks/research.ts";
import { DISTRACTOR_PREFIX } from "./distractors.ts";

/** What search shows the model for one query: the results' document or passage IDs, best first. */
export type Search = (library: ResearchLibrary, query: string) => string[];

/** The app's search, as the search tool calls it; `limit` shows more or fewer results, to compare. */
export const appSearch =
  (limit?: number): Search =>
  (library, query) =>
    library.index.search(query, limit).map((hit) => hit.docId);

export interface TaskRetrieval {
  taskId: string;
  /**
   * The question is in another writing system than every document it cites. The search tool then
   * translates the terms with the model (tools/research.ts), which this measure does not run, so
   * these tasks are counted apart.
   */
  acrossScripts: boolean;
  /** Cited documents (one of each citation group) among the results. */
  documents: { found: number; wanted: number };
  /** Facts (one spelling of each fact group) that a result's own text contains. */
  passages: { found: number; wanted: number };
}

/** Over the tasks asked in their documents' writing system. */
export interface RetrievalSummary {
  tasks: number;
  /** Tasks left out because their question is in another writing system (TaskRetrieval.acrossScripts). */
  acrossScripts: number;
  /** Share of citation groups with a cited document among the results. */
  documentRecall: number;
  /** Share of fact groups that a result's text contains: the passage the model needs is in front of it. */
  passageRecall: number;
  /** Tasks whose every cited document and fact is among the results. */
  complete: number;
}

const has = (text: string, option: string) => normalizeForMatch(text).includes(normalizeForMatch(option));

/** Retrieval for each answerable task, with the question as the query. */
export function measureRetrieval(library: ResearchLibrary, tasks: ResearchTask[], search: Search = appSearch()): TaskRetrieval[] {
  return tasks
    .filter((task) => task.answerable)
    .map((task) => {
      const results = search(library, task.question);
      const documents = new Set(results.map(parentId));
      // A result's own text: the passage the model sees a snippet of, and reads next. Generated
      // documents (distractors.ts) may hold an answer's spelling by chance ("30 days"), but not the answer.
      const texts = results.filter((id) => !id.startsWith(DISTRACTOR_PREFIX)).map((id) => library.index.get(id)?.text ?? "");
      const script = mainScript(task.question)?.script;
      const cited = task.citations.flat().map((id) => mainScript(library.documentFor(id)?.text ?? "")?.script);
      return {
        taskId: task.id,
        acrossScripts: cited.length > 0 && !cited.includes(script),
        documents: { found: task.citations.filter((group) => group.some((id) => documents.has(id))).length, wanted: task.citations.length },
        passages: {
          found: task.facts.filter((group) => group.some((option) => texts.some((text) => has(text, option)))).length,
          wanted: task.facts.length,
        },
      };
    });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarizeRetrieval(all: TaskRetrieval[]): RetrievalSummary {
  const results = all.filter((r) => !r.acrossScripts);
  const sum = (pick: (r: TaskRetrieval) => number) => results.reduce((s, r) => s + pick(r), 0);
  return {
    tasks: results.length,
    acrossScripts: all.length - results.length,
    documentRecall: round(sum((r) => r.documents.found) / Math.max(sum((r) => r.documents.wanted), 1)),
    passageRecall: round(sum((r) => r.passages.found) / Math.max(sum((r) => r.passages.wanted), 1)),
    complete: results.filter((r) => r.documents.found === r.documents.wanted && r.passages.found === r.passages.wanted).length,
  };
}
