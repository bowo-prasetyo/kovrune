// Loads the field suite in Node.js (issue #35): the committed documents and tasks in
// eval/field/, plus any local ones in eval/field/local/ (not committed, see eval/field/README.md).
// Documents go through the app's own extraction, so a PDF is read exactly as when a user adds it.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ResearchLibrary } from "../../src/agent/research.ts";
import { extractText, type PdfJsLike } from "../../src/documents/extract.ts";
import type { SourceDocument } from "../../src/tools/search.ts";
import { fieldDocuments, fieldTasks, type FieldDocument } from "../field/tasks.ts";
import type { ResearchTask } from "../tasks/research.ts";

export const FIELD_DIR = fileURLToPath(new URL("../field/", import.meta.url));

export interface FieldSuite {
  library: ResearchLibrary;
  tasks: ResearchTask[];
  /** How many tasks and documents came from eval/field/local/; runs that include them are not comparable with others'. */
  local: { tasks: number; documents: number };
}

const localManifest = z
  .object({
    documents: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: z.string(), file: z.string() }).strict()),
    tasks: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(["lookup", "multi-hop", "comparison", "contradiction", "unanswerable"]),
          question: z.string(),
          answerable: z.boolean(),
          facts: z.array(z.array(z.string()).min(1)),
          citations: z.array(z.array(z.string()).min(1)),
        })
        .strict(),
    ),
  })
  .strict();

async function readDocument(doc: FieldDocument, dir: string, loadPdfJs: () => Promise<PdfJsLike>): Promise<SourceDocument> {
  const bytes = await readFile(join(dir, doc.file));
  const file = { name: doc.file, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const { text, pageStarts, warning } = await extractText(file, loadPdfJs);
  if (!text) throw new Error(`Field document ${doc.file}: ${warning ?? "no text"}`);
  return { id: doc.id, title: doc.title, text, ...(pageStarts ? { pageStarts } : {}) };
}

/** The field suite; `root` is eval/field/ by default, with documents in docs/ and local ones in local/. */
export async function loadFieldSuite(root = FIELD_DIR): Promise<FieldSuite> {
  const loadPdfJs = async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  const documents = await Promise.all(fieldDocuments.map((doc) => readDocument(doc, join(root, "docs"), loadPdfJs)));
  const tasks = [...fieldTasks];

  const localDir = join(root, "local");
  const manifestPath = join(localDir, "tasks.json");
  let local = { tasks: 0, documents: 0 };
  if (existsSync(manifestPath)) {
    const manifest = localManifest.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    const ids = new Set([...documents.map((d) => d.id), ...tasks.map((t) => t.id)]);
    for (const id of [...manifest.documents.map((d) => d.id), ...manifest.tasks.map((t) => t.id)]) {
      if (ids.has(id)) throw new Error(`eval/field/local/tasks.json: the ID "${id}" is already used.`);
      ids.add(id);
    }
    documents.push(...(await Promise.all(manifest.documents.map((doc) => readDocument(doc, localDir, loadPdfJs)))));
    tasks.push(...manifest.tasks);
    local = { tasks: manifest.tasks.length, documents: manifest.documents.length };
  }
  return { library: new ResearchLibrary(documents), tasks, local };
}
