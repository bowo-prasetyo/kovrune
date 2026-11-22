// X-ray diffraction scans as PANalytical's (Malvern Panalytical's) instruments save them, .xrdml (harness
// 0.109.0), recommendation 10 of the materials science audit (docs/materials-science-audit.md, MS11).
//
// An .xrdml file is XML: the sample, the wavelength, the tube and optics, and one or more scans, each with
// its axis ranges, counting time and intensities. Read as text, it answers what a researcher asks of a scan
// they keep beside their papers: which sample, which radiation, which 2θ range and step, how long per step,
// when and by whom. As for JCAMP-DX spectra (chemfiles.ts), the points themselves are not written: thousands
// of counts no one quotes. Their number is, and the step, worked out from the range, says so.

import type { ChemText } from "./chemfiles.ts";
import { walkXml } from "./xml.ts";

interface Positions {
  axis: string;
  unit: string;
  start?: string;
  end?: string;
  common?: string;
  /** The number of positions listed, for an axis given point by point. */
  listed?: number;
}

interface Scan {
  attributes: Array<[string, string]>;
  header: Array<[string, string]>;
  positions: Positions[];
  countingTime?: string;
  countingUnit?: string;
  points: number;
  intensityUnit?: string;
}

/** Element names as read: their local part, so a prefixed file reads as an unprefixed one. */
const local = (name: string) => name.slice(name.indexOf(":") + 1);

/** The words of an element name: "anodeMaterial" as "anode material". */
const words = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** The wavelength lines' names. */
const WAVELENGTHS: Record<string, string> = { kAlpha1: "Kα1", kAlpha2: "Kα2", kBeta: "Kβ", ratioKAlpha2KAlpha1: "Kα2/Kα1 ratio" };

/** Units as the text writes them. */
const unitText = (unit: string | undefined) => (!unit ? "" : unit === "Angstrom" ? " Å" : unit === "deg" ? "°" : ` ${unit}`);

/** "2Theta" as "2θ", "Omega" as "ω": the axes as papers name them. */
const axisName = (axis: string) => ({ "2theta": "2θ", omega: "ω", phi: "φ", psi: "ψ", chi: "χ", theta: "θ" })[axis.toLowerCase()] ?? axis;

/** A decimal's digits after the point, so a worked-out step is given to the precision of the range it is from. */
const decimals = (text: string) => /\.(\d+)/.exec(text)?.[1]!.length ?? 0;

/**
 * An .xrdml file as text: the sample, the comments, the wavelength and the tube, then each scan's mode,
 * axis ranges, number of points, step (worked out by Kovrune from the range and the points), counting
 * time, and when and by whom it was measured. The points are not written.
 */
export function readXrdml(raw: string): ChemText {
  const path: string[] = [];
  let buffer = "";
  const sample: Array<[string, string]> = [];
  const comments: string[] = [];
  const measurement: Array<[string, string]> = [];
  const wavelength: Array<[string, string]> = [];
  const tube: Array<[string, string]> = [];
  const scans: Scan[] = [];
  let scan: Scan | undefined;
  let positions: Positions | undefined;
  let unit: string | undefined;
  let seen = false;

  walkXml(raw, {
    open(name, attr) {
      const n = local(name);
      path.push(n);
      buffer = "";
      unit = attr("unit");
      if (n === "xrdMeasurements") seen = true;
      if (n === "xrdMeasurement") {
        for (const key of ["measurementType", "status"]) {
          const value = attr(key);
          if (value) measurement.push([words(key), value]);
        }
      } else if (n === "sample") {
        const type = attr("type");
        if (type) sample.push(["type", type]);
      } else if (n === "xRayTube") {
        const tubeName = attr("name");
        if (tubeName) tube.push(["name", tubeName]);
      } else if (n === "scan") {
        scan = { attributes: [], header: [], positions: [], points: 0 };
        for (const key of ["mode", "scanAxis", "status"]) {
          const value = attr(key);
          if (value) scan.attributes.push([words(key), value]);
        }
        scans.push(scan);
      } else if (n === "positions" && scan) {
        positions = { axis: attr("axis") ?? "", unit: attr("unit") ?? "" };
        scan.positions.push(positions);
      } else if ((n === "intensities" || n === "counts") && scan) scan.intensityUnit = attr("unit");
    },
    text(text) {
      // An element's own text: the intensities are counted, not kept.
      const n = path.at(-1);
      if (scan && (n === "intensities" || n === "counts")) scan.points += text.split(/\s+/).filter(Boolean).length;
      else if (positions && n === "listPositions") positions.listed = (positions.listed ?? 0) + text.split(/\s+/).filter(Boolean).length;
      else buffer += text;
    },
    close(name) {
      const n = local(name);
      const parent = path.at(-2);
      const value = buffer.trim().replace(/\s+/g, " ");
      buffer = "";
      if (value) {
        if (parent === "sample" && (n === "id" || n === "name" || n === "preparedBy")) sample.push([words(n), value]);
        else if (parent === "comment" && n === "entry") comments.push(value);
        else if (parent === "usedWavelength" && WAVELENGTHS[n]) wavelength.push([WAVELENGTHS[n]!, `${value}${n.startsWith("ratio") ? "" : unitText(unit)}`]);
        else if (parent === "xRayTube" && (n === "tension" || n === "current" || n === "anodeMaterial" || n === "focus")) tube.push([words(n), `${value}${unitText(unit)}`]);
        else if (positions && parent === "positions") {
          if (n === "startPosition") positions.start = value;
          else if (n === "endPosition") positions.end = value;
          else if (n === "commonPosition") positions.common = value;
        } else if (scan && n === "commonCountingTime") {
          scan.countingTime = value;
          scan.countingUnit = unit;
        } else if (scan && path.includes("header") && ["startTimeStamp", "endTimeStamp", "name", "applicationSoftware", "instrumentControlSoftware", "instrumentID"].includes(n)) {
          scan.header.push([n === "name" ? "author" : words(n), value]);
        }
      }
      if (n === "positions") positions = undefined;
      if (n === "scan") scan = undefined;
      path.pop();
    },
  });

  if (!seen) return { text: "", warning: "This file has no XRDML data." };
  const title = sample.find(([k]) => k === "name")?.[1] ?? sample.find(([k]) => k === "id")?.[1];
  const lines = [`# X-ray diffraction measurement${title ? `: ${title}` : ""}`];
  for (const [k, v] of sample) lines.push(`Sample ${k}: ${v}`);
  for (const comment of comments) lines.push(`Comment: ${comment}`);
  for (const [k, v] of measurement) lines.push(`${k[0]!.toUpperCase()}${k.slice(1)}: ${v}`);
  if (wavelength.length) lines.push(`Wavelength: ${wavelength.map(([k, v]) => `${k} ${v.trim()}`).join(", ")}`);
  if (tube.length) lines.push(`X-ray tube: ${tube.map(([k, v]) => `${k} ${v.trim()}`).join(", ")}`);
  scans.forEach((s, i) => {
    lines.push("", `## Scan ${i + 1}${s.attributes.length ? ` (${s.attributes.map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}`);
    for (const p of s.positions) {
      const name = axisName(p.axis);
      const u = unitText(p.unit);
      if (p.start !== undefined && p.end !== undefined) {
        let line = `${name}: from ${p.start}${u} to ${p.end}${u}`;
        const count = s.points || p.listed || 0;
        const [from, to] = [Number(p.start), Number(p.end)];
        if (count > 1 && Number.isFinite(from) && Number.isFinite(to) && from !== to) {
          const step = (to - from) / (count - 1);
          line += `, a step of ${step.toFixed(Math.max(decimals(p.start), decimals(p.end), 3))}${u} (worked out by Kovrune from the range and the ${count} points)`;
        }
        lines.push(line);
      } else if (p.common !== undefined) lines.push(`${name}: ${p.common}${u} throughout`);
      else if (p.listed) lines.push(`${name}: ${p.listed} positions listed`);
    }
    if (s.points) lines.push(`Points: ${s.points}${s.intensityUnit ? ` (intensities in ${s.intensityUnit})` : ""}. The points are not written here; Kovrune reads a scan's settings only.`);
    if (s.countingTime) lines.push(`Counting time per step: ${s.countingTime}${unitText(s.countingUnit)}`);
    for (const [k, v] of s.header) lines.push(`${k[0]!.toUpperCase()}${k.slice(1)}: ${v}`);
  });
  return { text: lines.join("\n") };
}
