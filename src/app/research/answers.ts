// Past answers (issue #34): what the result view needs to show an answer again after a
// reload, and its export as Markdown or, for scholarly works, BibTeX.

import type { CheckedEvidence } from "../../agent/evidence.ts";
import type { ResearchLibrary, ResearchResult } from "../../agent/research.ts";
import type { SentenceSupport } from "../../agent/support.ts";
import type { Citation } from "../../sources/session.ts";
import { describeNoAnswer, describePages, describeStatus } from "./trace.ts";

export interface SavedAnswer {
  id: string;
  question: string;
  /** ISO time the question was asked. */
  askedAt: string;
  /** The model and where it ran, e.g. "Qwen3.5-4B on llama.cpp server". */
  model: string;
  status: ResearchResult["status"];
  answer?: string;
  evidence: CheckedEvidence[];
  support?: SentenceSupport;
  citations: Record<string, Citation>;
  /** Names of cited documents from the user's library, so the answer reads the same after a document is removed. */
  titles: Record<string, string>;
  sourceErrors: string[];
  /** Why there is no answer, for status "no-answer". */
  noAnswer?: string;
  /** The research steps, as the trace showed them. */
  steps: string[];
  /**
   * A report (docs/report-mode.md): its sections, each a saved answer to one question of the plan. The
   * record's own question is the report's title, and its status sums up the sections (reportStatus).
   */
  report?: SavedReport;
}

export interface SavedReport {
  title: string;
  /** What the user asked for. */
  request: string;
  /** The questions of the plan, in order; `sections` holds the answers to the first of them. */
  plan: string[];
  sections: SavedAnswer[];
  /** True while the sections are being written, and when the page closed before they were all done. */
  unfinished?: boolean;
  /** True when the user stopped it before every section was written. */
  stopped?: boolean;
}

export function toSavedAnswer(options: {
  question: string;
  result: ResearchResult;
  steps: string[];
  library: ResearchLibrary;
  model: string;
  now?: Date;
}): SavedAnswer {
  const { question, result, steps, library, model, now = new Date() } = options;
  const titles: Record<string, string> = {};
  for (const { docId } of result.evidence) {
    const title = library.documentFor(docId)?.title;
    if (title) titles[docId] = title;
  }
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    askedAt: now.toISOString(),
    model,
    status: result.status,
    ...(result.final ? { answer: result.final.answer } : {}),
    evidence: result.evidence,
    ...(result.support ? { support: result.support } : {}),
    citations: result.citations,
    titles,
    sourceErrors: result.sourceErrors,
    ...(result.status === "no-answer" ? { noAnswer: describeNoAnswer(result.agent.stopReason, result.agent.error) } : {}),
    steps: [...steps],
  };
}

/** Sentence marks apply only when a quote checked out; otherwise the label already says nothing backs the answer. */
export function shownSupport(answer: SavedAnswer): SentenceSupport | undefined {
  return answer.status === "verified" ? answer.support : undefined;
}

/** A cited document's name: the open-source title, or the user's document as it was named. */
export function sourceTitle(answer: SavedAnswer, docId: string): string {
  return answer.citations[docId]?.title ?? answer.titles[docId] ?? docId;
}

export const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The answer as a Markdown document: question, label, answer, evidence and steps. */
export function answerToMarkdown(answer: SavedAnswer): string {
  const lines = [`# ${oneLine(answer.question)}`, "", `Asked ${formatTime(answer.askedAt)} with ${answer.model}.`, ""];
  for (const error of answer.sourceErrors) lines.push(`> ${error} The answer is based on the other sources only.`, "");
  if (answer.status === "no-answer") {
    lines.push(answer.noAnswer ?? "The model did not give an answer.", "");
  } else {
    const support = shownSupport(answer);
    const status = describeStatus(answer.status, answer.evidence, support);
    lines.push(`**${status.label}.** ${status.detail}`, "");
    if (answer.answer) {
      const unbacked = support?.sentences.some((s) => s.backed === false);
      lines.push(
        unbacked ? support!.sentences.map((s) => (s.backed === false ? `⚠ ${s.text}` : s.text)).join("") : answer.answer,
        "",
      );
      if (unbacked) lines.push("⚠ marks sentences that share few words with the quotes that were found, or have a number, unit, month or \"not\" that the quotes don't back.", "");
    }
    if (answer.evidence.length) {
      lines.push("## Evidence", "");
      answer.evidence.forEach((item, i) => {
        const citation = answer.citations[item.docId];
        const where = citation
          ? `[${citation.title}](${citation.url}) (${citation.source}, retrieved ${citation.retrievedAt.slice(0, 10)})`
          : `${sourceTitle(answer, item.docId)}${item.context?.pages ? `, ${describePages(item.context.pages)}` : ""}`;
        lines.push(`${i + 1}. ${item.verified ? "✓" : "✗"} ${where}`, "", `   > ${oneLine(item.quote)}`, "");
        if (!item.verified && item.reason) lines.push(`   Not found: ${item.reason}.`, "");
      });
    }
  }
  if (answer.steps.length) lines.push("## Steps", "", ...answer.steps.map((step) => `- ${step}`), "");
  lines.push(
    "---",
    "",
    "Exported from Kovrune. ✓ means the quote was found word for word in its source: the quotes are real, which does not prove the answer is right.",
    "",
  );
  return lines.join("\n");
}

/** BibTeX values are braced; braces and backslashes inside them would break the entry. */
const bib = (value: string) => value.replace(/[{}\\]/g, "");

/** BibTeX entries for the scholarly works the answer cites, or undefined when it cites none. */
export function answerToBibtex(answer: SavedAnswer): string | undefined {
  const entries = new Map<string, string>();
  for (const { docId } of answer.evidence) {
    const citation = answer.citations[docId];
    if (!citation?.work) continue;
    const key = `openalex_${docId.replace(/^openalex:/, "").replace(/#\d+$/, "")}`;
    const { authors, year, doi, venue } = citation.work;
    const fields: Array<[string, string | number | undefined]> = [
      ["title", citation.title],
      ["author", authors.length ? authors.join(" and ") : undefined],
      ["year", year],
      [venue ? "journal" : "howpublished", venue ?? citation.source],
      ["doi", doi],
      ["url", citation.url],
      ["note", `Retrieved from ${citation.source} on ${citation.retrievedAt.slice(0, 10)}`],
    ];
    const body = fields
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `  ${name} = {${bib(String(value))}}`)
      .join(",\n");
    entries.set(key, `@${venue ? "article" : "misc"}{${key},\n${body}\n}`);
  }
  return entries.size ? `${[...entries.values()].join("\n\n")}\n` : undefined;
}

/** A file name for an exported answer, e.g. "kovrune-how-to-create-an-activity-diagram-2026-10-25.md". */
export function exportFileName(answer: SavedAnswer, extension: "md" | "bib"): string {
  const words = answer.question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  // Long questions are cut at a word boundary, so no word is cut in half.
  const cut = words.length > 50 ? words.slice(0, words.lastIndexOf("-", 50)) || words.slice(0, 50) : words;
  const slug = cut || "answer";
  return `kovrune-${slug}-${answer.askedAt.slice(0, 10)}.${extension}`;
}
