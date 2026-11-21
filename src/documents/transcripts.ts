// Interview transcripts exported as captions (harness 0.104.0): WebVTT (.vtt), as Zoom, Microsoft Teams and Otter
// export a recorded call, and SubRip (.srt). A caption file splits speech into cues of a few seconds each, so a
// speaker's answer is a dozen cues; read cue by cue, a quote of one sentence would run across cue numbers and
// timings, and nothing would say who spoke. So consecutive cues of one speaker are joined into a turn, a
// paragraph of its own, written "Daniel [00:00:08]: …" with the time it starts, so a quote can be found in the
// recording. A speaker is named as Teams names one, in a voice tag ("<v Daniel>…</v>"), or as Zoom and Otter
// do, before a colon at the start of the cue ("Daniel: …"). A cue naming no speaker continues the turn before
// it. A file naming no speaker at all is read as paragraphs, a new one after a pause of two seconds or more,
// each with its start time. WebVTT NOTE blocks, which can hold the recording's description, are kept first.
// Styles, regions, cue settings and inline tags are dropped (docs/social-sciences-audit.md, S7).

/** A cue: when it starts, in seconds, and what it says, with its speaker if it names one. */
interface Cue {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

/** A cue's timing line: "00:00:08.010 --> 00:00:14.950" (WebVTT, hours optional) or "00:00:08,010 --> 00:00:14,950" (SubRip). */
const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
/** A speaker named before a colon at a cue's start: a name of up to four words, the first capitalised, or a label such as "P07" or "IV". */
const SPEAKER_PREFIX = /^((?:\p{Lu}|\p{Lt})[\p{L}\p{N}'’.\-]*(?: [\p{L}\p{N}'’.\-]+){0,3}):\s+/u;
/** A pause, in seconds, that starts a new paragraph in a file naming no speaker. */
const PAUSE = 2;

function seconds(time: string): number {
  const parts = time.replace(",", ".").split(":").map(Number);
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}

/** A time as "hh:mm:ss", the start of a turn. */
function clock(time: number): string {
  const whole = Math.floor(time);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "", rlm: "" };

/** A cue's text without its tags, and the speaker its voice tag names, if any. */
function cueText(lines: string[]): { text: string; speaker?: string } {
  const raw = lines.join(" ");
  const voice = /<v(?:\.[\w.-]+)?\s+([^>]+)>/.exec(raw)?.[1]?.trim();
  const text = raw
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&(\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/\s+/g, " ")
    .trim();
  return voice ? { text, speaker: voice } : { text };
}

/** The cues of a WebVTT or SubRip file, and its notes. */
function parseCues(raw: string): { cues: Cue[]; notes: string[] } {
  const blocks = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const cues: Cue[] = [];
  const notes: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim());
    if (!lines.length) continue;
    if (/^WEBVTT\b/.test(lines[0]!)) continue;
    if (/^NOTE\b/.test(lines[0]!)) {
      const note = [lines[0]!.replace(/^NOTE\s*/, ""), ...lines.slice(1)].join(" ").trim();
      if (note) notes.push(note);
      continue;
    }
    if (/^(?:STYLE|REGION)\b/.test(lines[0]!)) continue;
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at < 0) continue;
    const [, from, to] = TIMING.exec(lines[at]!)!;
    const { text, speaker } = cueText(lines.slice(at + 1));
    if (!text) continue;
    const named = speaker ? undefined : SPEAKER_PREFIX.exec(text);
    cues.push({
      start: seconds(from!),
      end: seconds(to!),
      ...(speaker ? { speaker } : named ? { speaker: named[1] } : {}),
      text: named ? text.slice(named[0].length) : text,
    });
  }
  return { cues, notes };
}

/** A caption file's text: its notes, then one paragraph per speaker's turn (or per stretch of speech without a pause). */
export function readTranscript(raw: string): { text: string; warning?: string } {
  const { cues, notes } = parseCues(raw);
  if (!cues.length) return { text: notes.join("\n\n"), warning: "No captions found. Is this a WebVTT (.vtt) or SubRip (.srt) file?" };
  const named = cues.some((cue) => cue.speaker);
  const turns: Array<{ start: number; speaker?: string; texts: string[] }> = [];
  let lastEnd = -Infinity;
  for (const cue of cues) {
    const current = turns.at(-1);
    const sameTurn = current && (named ? !cue.speaker || cue.speaker === current.speaker : cue.start - lastEnd < PAUSE);
    if (sameTurn) current.texts.push(cue.text);
    else turns.push({ start: cue.start, ...(cue.speaker ? { speaker: cue.speaker } : {}), texts: [cue.text] });
    lastEnd = cue.end;
  }
  const paragraphs = turns.map(({ start, speaker, texts }) => `${speaker ? `${speaker} [${clock(start)}]:` : `[${clock(start)}]`} ${texts.join(" ")}`);
  return { text: [...notes, ...paragraphs].join("\n\n") };
}
