// The social-sciences audit's open items (docs/social-sciences-audit.md, harness 0.104.0): S2's checks of which group a
// comparison puts first, how strong a claim is, percent and percentage points, and an interviewer's words; S7's
// transcripts (caption files, speaker notes, every passage found); S9's references from element citations.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { comparisons } from "../src/agent/socialscience.ts";
import { sentenceSupport } from "../src/agent/support.ts";
import { chunkDocument, partNotes, transcriptSpeakers } from "../src/documents/chunk.ts";
import { findPassages, passagesCsv } from "../src/documents/concordance.ts";
import { detectKind, extractText } from "../src/documents/extract.ts";
import { readTranscript } from "../src/documents/transcripts.ts";
import { jatsToMarkdown, parseXml } from "../src/sources/jats.ts";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "../src/app/research/backup-crypto.ts";

const marks = (quote: string, answer: string, context?: { before: string; more: boolean }) =>
  sentenceSupport(answer, [{ docId: "d", quote, verified: true, ...(context ? { context: { before: context.before, passage: quote, after: "", more: { before: context.more, after: false } } } : {}) }], () => "Survey study")
    .sentences.map((s) => (s.backed === undefined ? "·" : s.backed ? "✓" : "⚠"))
    .join("");

describe("S2: social-science sentences read the way the quote does", () => {
  it("marks a group comparison turned round, and backs the same comparison said the other way", () => {
    const q = "Specifically, Black participants were approximately 50% less likely to be willing to participate in SCDM discussions with pharmacists than White participants (AOR = 0.499, 95% CI = 0.326, 0.763).";
    assert.equal(marks(q, "Black participants were about 50% less likely than White participants to be willing to participate in SCDM discussions with pharmacists (AOR = 0.499)."), "✓");
    assert.equal(marks(q, "White participants were about 50% less likely than Black participants to be willing to participate in SCDM discussions with pharmacists (AOR = 0.499)."), "⚠");
    assert.equal(marks(q, "White participants were more likely than Black participants to be willing to participate in SCDM discussions with pharmacists."), "✓", "the same finding, said from the other side");
    const parties = "Participants who identified as members of the U.S. Democratic Party were two times more likely (AOR = 2.133, 95% CI = 1.331, 3.421) to be willing to engage in SCDM with pharmacists compared to those affiliated with the Republican Party.";
    assert.equal(marks(parties, "Republicans were two times more likely than Democrats to be willing to engage in SCDM with pharmacists (AOR = 2.133)."), "⚠");
    assert.equal(marks(parties, "Democrats were two times more likely than Republicans to be willing to engage in SCDM with pharmacists (AOR = 2.133)."), "✓");
  });

  it("reads a comparison's two sides, leaving out the words they share", () => {
    assert.deepEqual(comparisons("Women were more likely than men to report experiencing workplace harassment."), [{ first: ["women"], second: ["men", "report", "experienc"], up: true }]);
    assert.deepEqual(comparisons("No comparison here, only a fact."), []);
  });

  it("marks more for less, a change the wrong way, and a side reversed", () => {
    for (const [quote, right, wrong] of [
      ["The negative value suggests that, on average, benefiting households spend 26.10% less on food consumption than non-benefitting households.", "Benefiting households spend 26.10% less on food than non-benefitting households.", "Benefiting households spend 26.10% more on food than non-benefitting households."],
      ["Union membership declined steadily in the manufacturing sector over the period.", "Union membership declined in the manufacturing sector over the period.", "Union membership rose steadily in the manufacturing sector over the period."],
      ["The gender wage gap narrowed between 1990 and 2010 among college graduates.", "The gender wage gap narrowed between 1990 and 2010 among college graduates.", "The gender wage gap widened between 1990 and 2010 among college graduates."],
      ["A majority of respondents in rural districts opposed the school consolidation plan.", "A majority of rural respondents opposed the school consolidation plan.", "A minority of rural respondents supported the school consolidation plan."],
      ["Broadband adoption was lowest among older households in rural areas.", "Broadband adoption was lowest among older rural households.", "Broadband adoption was lowest among older urban households."],
    ]) {
      assert.equal(marks(quote!, right!), "✓", right);
      assert.equal(marks(quote!, wrong!), "⚠", wrong);
    }
  });

  it("does not back a cause or a certainty the quotes do not state", () => {
    const associated = "Neighbourhood social cohesion was associated with lower rates of self-reported depression.";
    assert.equal(marks(associated, "Neighbourhood social cohesion was associated with lower rates of self-reported depression."), "✓");
    assert.equal(marks(associated, "Neighbourhood social cohesion caused lower rates of self-reported depression."), "⚠");
    const suggests = "These results suggest that remote work may reduce commuting-related stress among parents.";
    assert.equal(marks(suggests, "The results demonstrate that remote work reduces commuting-related stress among parents."), "⚠");
    assert.equal(marks("The randomised transfer caused a rise in school attendance among girls.", "The transfer caused a rise in school attendance among girls."), "✓", "a quote that states the cause backs it");
    // Only the explicit words, and not a hyphenated name: "led to" paraphrases an experiment, "X-linked" is a gene's place.
    assert.equal(marks("Enhanced clearance of the pathogens was associated with elevated transcription of pro-inflammatory genes.", "Reduced IL10 expression led to enhanced clearance of the pathogens with elevated transcription of pro-inflammatory genes."), "✓");
    assert.equal(marks("Loss of the X-linked gene FMR1 in neurons reduced dendritic branching.", "Loss of FMR1 in neurons caused reduced dendritic branching."), "✓");
    assert.equal(marks("These results suggest that remote work may reduce stress.", "The results suggest remote work caused less stress."), "✓", "a hedge alone does not deny a cause; certainty is checked apart");
  });

  it("tells percentage points from percent", () => {
    const q = "Turnout among voters aged 18 to 24 rose by 7 percentage points between 2016 and 2020.";
    assert.equal(marks(q, "Turnout among voters aged 18 to 24 rose by 7 percentage points between 2016 and 2020."), "✓");
    assert.equal(marks(q, "Turnout among voters aged 18 to 24 rose by 7 percent between 2016 and 2020."), "⚠");
    assert.equal(marks(q, "Turnout among voters aged 18 to 24 rose by 7% between 2016 and 2020."), "⚠");
  });

  it("does not back a participant's view with only the interviewer's question", () => {
    const asked = "Interviewer: So would you say you felt excluded by your colleagues?";
    assert.equal(marks(asked, "The participant said they felt excluded by their colleagues."), "⚠");
    assert.equal(marks(asked, "The interviewer asked whether the participant felt excluded by colleagues."), "✓");
    // A quote from inside the interviewer's line, found by the line it stands in.
    assert.equal(marks("would you say you felt excluded by your neighbours", "Rosa felt excluded by her neighbours.", { before: "P07: Four meetings.\n\nIV: So ", more: false }), "⚠");
    assert.equal(marks("not excluded, I would not put it like that at all", "Rosa was not excluded, she would not put it like that.", { before: "IV: So?\n\nP07: No, ", more: false }), "✓");
  });
});

describe("S7: interview transcripts", () => {
  const vtt = [
    "WEBVTT",
    "",
    "NOTE Interview T09, recorded 2 May 2024.",
    "",
    "1",
    "00:00:01.000 --> 00:00:04.000",
    "Interviewer: How long have you lived here?",
    "",
    "2",
    "00:00:04.500 --> 00:00:09.000",
    "Ana: Nine years. I moved in",
    "",
    "3",
    "00:00:09.100 --> 00:00:12.000",
    "Ana: when the <i>estate</i> was new &amp; quiet.",
    "",
    "4",
    "00:00:12.500 --> 00:00:14.000",
    "<v Interviewer>And now?</v>",
  ].join("\n");

  it("joins a speaker's cues into one turn with its start time, and keeps the recording's note", () => {
    assert.equal(readTranscript(vtt).text, "Interview T09, recorded 2 May 2024.\n\nInterviewer [00:00:01]: How long have you lived here?\n\nAna [00:00:04]: Nine years. I moved in when the estate was new & quiet.\n\nInterviewer [00:00:12]: And now?");
  });

  it("reads SubRip, and a file naming no speaker as paragraphs split at pauses", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:03,000\r\nHello there\r\n\r\n2\r\n00:00:03,500 --> 00:00:05,000\r\nsecond line\r\n\r\n3\r\n00:00:09,000 --> 00:00:10,000\r\nafter a pause\r\n";
    assert.equal(readTranscript(srt).text, "[00:00:01] Hello there second line\n\n[00:00:09] after a pause");
    assert.match(readTranscript("not captions at all").warning!, /No captions found/);
  });

  it("is read from .vtt and .srt files as a transcript", async () => {
    assert.equal(detectKind("call.vtt"), "transcript");
    assert.equal(detectKind("call.srt"), "transcript");
    const bytes = new TextEncoder().encode(vtt);
    const read = await extractText({ name: "call.vtt", arrayBuffer: async () => bytes.buffer }, async () => {
      throw new Error("no PDF here");
    });
    assert.equal(read.kind, "transcript");
    assert.match(read.text, /^Ana \[00:00:04\]: Nine years/m);
  });

  it("notes, on a part that starts inside a long turn, whose turn it continues; and nothing on other documents", () => {
    const turn = (who: string, n: number) => `${who}: ${Array.from({ length: n }, (_, i) => `Sentence ${i + 1} of what ${who} says about shifts and the estate.`).join(" ")}`;
    const text = [turn("IV", 2), turn("P07", 60), turn("IV", 2), turn("P07", 3), turn("IV", 1), turn("P07", 2), turn("IV", 1)].join("\n\n");
    const parts = chunkDocument({ id: "t", title: "t", text });
    const notes = partNotes(parts);
    assert.ok(parts.length >= 3);
    assert.ok(notes.some((n) => n === "[This part continues what P07 says, in a turn that begins in t#1.]\n" || /continues what P07 says/.test(n)), notes.join("|"));
    assert.ok(notes.every((n, i) => !n || !/^(?:IV|P07):/.test(parts[i]!.text)), "no note on a part that starts a turn");
    assert.deepEqual([...transcriptSpeakers(text)].sort(), ["IV", "P07"]);
    // A document with a few "Note: …" lines is not a transcript.
    assert.equal(transcriptSpeakers("Note: one.\n\nNote: two.\n\nNote: three.\n\nMethods: four.").size, 0);
  });

  it("finds every passage with all the words, with its speaker and page, and writes them as CSV", () => {
    const docs = [
      { id: "t01", name: "t01.md", text: "IV: Did you feel excluded?\n\nP07: No, not excluded. It was the rota.\n\nIV: And meetings?\n\nP07: Four meetings, because of the rota.\nThe rota rules everything.\n\nIV: Thanks.\n\nP07: You are welcome." },
      { id: "paper", name: "paper.pdf", text: "Page one says nothing.\n\nOn page two the rotas are discussed.", pageStarts: [0, 24] },
    ];
    const rota = findPassages(docs, "rota");
    assert.equal(rota.total, 3);
    assert.deepEqual(rota.passages.map((p) => [p.name, p.speaker ?? p.page]), [["t01.md", "P07"], ["t01.md", "P07"], ["paper.pdf", 2]]);
    assert.equal(findPassages(docs, '"not excluded" rota').total, 1);
    assert.equal(findPassages(docs, "excluded meetings").total, 0, "every word must be in the passage");
    assert.equal(passagesCsv(findPassages(docs, '"not excluded"').passages), 'document,page,speaker,passage\r\nt01.md,,P07,"P07: No, not excluded. It was the rota."\r\n');
  });

  it("verifies a quote of a caption file's turn, joined across its cues", () => {
    const { text } = readTranscript(vtt);
    assert.equal(checkEvidence([{ docId: "t", quote: "Nine years. I moved in when the estate was new & quiet." }], () => text)[0]!.verified, true);
  });
});

describe("S9: references given as element citations", () => {
  it("are written with their parts apart, and a label's own point is not doubled", () => {
    const xml = `<article><front><journal-meta><journal-title>J</journal-title></journal-meta><article-meta><article-title>T</article-title><pub-date><year>2025</year></pub-date></article-meta></front><back><ref-list><ref id="B7"><label>7.</label><element-citation publication-type="journal"><person-group person-group-type="author"><name><surname>Kobayashi</surname><given-names>M.</given-names></name><name><surname>Leidner</surname><given-names>A.J.</given-names></name><etal/></person-group><article-title>Use of 21-Valent Pneumococcal Conjugate Vaccine Among U.S. Adults</article-title><source>MMWR Morb. Mortal. Wkly Rep.</source><year>2024</year><volume>73</volume><fpage>793</fpage><lpage>798</lpage><pub-id pub-id-type="doi">10.15585/mmwr.mm7336a3</pub-id></element-citation></ref></ref-list></back></article>`;
    assert.match(jatsToMarkdown(parseXml(xml)), /\n7\. Kobayashi M\., Leidner A\.J\. et al\. Use of 21-Valent Pneumococcal Conjugate Vaccine Among U\.S\. Adults\. MMWR Morb\. Mortal\. Wkly Rep\. 2024\. 73\. 793–798\. DOI: 10\.15585\/mmwr\.mm7336a3\.\n/);
  });
});

describe("S9: a backup protected by a password", () => {
  const json = JSON.stringify({ format: "kovrune-backup", documents: [{ text: "P07: No, not excluded. It was the rota." }] });

  it("is encrypted, says how, and opens only with its password", async () => {
    const text = await encryptBackup(json, "correct horse", 1_000);
    assert.ok(isEncryptedBackup(text));
    assert.ok(!text.includes("rota"), "the documents' text is not in the file");
    const envelope = JSON.parse(text);
    assert.deepEqual([envelope.kdf.name, envelope.kdf.hash, envelope.kdf.iterations, envelope.cipher.name], ["PBKDF2", "SHA-256", 1_000, "AES-GCM"]);
    assert.equal(await decryptBackup(text, "correct horse"), json);
    await assert.rejects(decryptBackup(text, "wrong horse"), /Wrong password/);
    assert.notEqual(await encryptBackup(json, "correct horse", 1_000), text, "a new salt and IV each time");
  });

  it("leaves a plain backup recognised as plain", () => {
    assert.equal(isEncryptedBackup(json), false);
    assert.equal(isEncryptedBackup("not json"), false);
  });
});
