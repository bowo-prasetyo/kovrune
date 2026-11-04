// Office Open XML packages (.docx, .pptx, .xlsx): how their parts point to each other.

import type { ZipArchive } from "./zip.ts";
import { walkXml } from "./xml.ts";

export interface Relationship {
  id: string;
  /** The last segment of the relationship type, e.g. "officeDocument" or "slide". */
  type: string;
  /** The target part's path in the archive. */
  target: string;
}

/** The relationships of a part (or of the package, for ""), from its .rels part. */
export async function relationships(zip: ZipArchive, part: string): Promise<Relationship[]> {
  const slash = part.lastIndexOf("/");
  const folder = part.slice(0, slash + 1);
  const xml = await zip.text(`${folder}_rels/${part.slice(slash + 1)}.rels`);
  if (!xml) return [];
  const found: Relationship[] = [];
  walkXml(xml, {
    open(name, attr) {
      if (name !== "rel:Relationship" || attr("TargetMode") === "External") return;
      const id = attr("Id");
      const type = attr("Type")?.split("/").at(-1);
      const target = attr("Target");
      if (id && type && target) found.push({ id, type, target: resolvePath(folder, target) });
    },
  });
  return found;
}

/** A relationship target, relative to the source part's folder or absolute from the package root. */
export function resolvePath(folder: string, target: string): string {
  const parts = (target.startsWith("/") ? target.slice(1) : folder + target).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

export async function mainPart(zip: ZipArchive, fallback: string): Promise<string> {
  const main = (await relationships(zip, "")).find((rel) => rel.type === "officeDocument")?.target;
  return main && zip.has(main) ? main : fallback;
}
