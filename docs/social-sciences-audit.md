# Social Sciences Audit, November 2026

An audit of Kovrune from a social scientist's point of view (sociology, political science, psychology, economics, and qualitative research in health and education), at `6c525c3` (harness 0.100.0). It asks two things:

1. Is Kovrune already useful for research in the social sciences?
2. What stands in the way, and what should change first?

Like the earlier audits, it ran the app's own code without a model, on four kinds of input:

- 24 pairs of answer sentences written for the audit, one right and one wrong for each, against a quote typical of the field;
- sentences from a real CC BY survey paper;
- nine CC BY papers from PubMed Central, five quantitative and four qualitative, read with the app's JATS reader;
- a journal-style PDF and an interview transcript, both made for the audit.

Coverage figures come from OpenAlex. Each figure below comes from those runs ([Method](#method)). The model's own checks (review, cross-check, completeness, contradiction) were **not** run, so the findings on sentence checks say what the word checks let through to them, not what reaches the user.

## Verdict

**Useful today for private, checkable reading of your own documents. Not yet trustworthy for the question quantitative social scientists ask most: who differs from whom, in which direction, by how much, and is it significant?**

What works well:

- **Local-first is the strongest argument for social scientists.** Interview transcripts, field notes and survey microdata are often covered by an ethics board (IRB) protocol, consent forms or the GDPR, which rule out sending them to an online AI service. Kovrune sends nothing you add to such a service. No mainstream AI research tool can say that.
- **Checked verbatim quotes fit the field's norms.** Qualitative work is judged on whether excerpts are real and correctly attributed, and Kovrune proves the first.
- **The literature is easy to find, as abstracts.** OpenAlex has an abstract for 83–91% of 2023 articles in Social Sciences, Psychology, Economics, Business and Humanities.
- **Your library comes in whole.** A Zotero, Mendeley or EndNote export (BibTeX or RIS) with its PDFs keeps each paper's details. Word files keep their footnotes and merged table cells. Excel and CSV are read, as are documents in any language.
- **Report mode** gives a literature-review-shaped answer, with a label for each section.

What gets in the way (details in [Findings](#findings)):

1. **APA-style numbers lose their leading zero and their sign.** "r = −.34" is read as 34, so it backs "r = .34" and "34%", and a right "d = 0.45" is marked against "d = .45". APA style requires this notation for p, r, α and standardized β, so nearly every psychology paper uses it.
2. **The sentence check misses the reversals that matter in the field.** Of 24 wrong sentences it caught 7, all by a number or an existing opposite. It missed groups swapped ("men were more likely than women"), "more/less likely", "rose/declined", "support/oppose", "majority/minority", country swaps, a correlation stated as a cause, a hedge removed, and "percent" for "percentage points". On a real paper, all four wrong sentences tried were marked backed.
3. **A quote that leaves out a footnote or citation marker is not found.** "with panel data", where the PDF has "with¹ panel data", is labelled not found. Footnote-heavy fields (history, law, political theory, Chicago-style sociology) will see right answers lose their label often.
4. **Regression tables come out misaligned or not at all.** In JATS, merged cells are not expanded, so standard errors shift one column left under the wrong coefficient, and tables in `<floats-group>` (MDPI's layout) are dropped. In PDFs, empty cells disappear, so a coefficient no longer says which model it belongs to.
5. **Full text is out of reach through the sources.** At most 3% of Social Sciences and 4% of Economics articles are on arXiv or PubMed Central, the two places Kovrune reads in full, against 41% in physics. The field filter offers none of the social-science fields, and retracted papers are not flagged.

The first and third are deterministic defects in code that every field shares. They can be fixed and measured without a model, and should come first.

**Status (harness 0.101.0):** recommendations 1–5 are done. S1: ".05" and "−.34" are read as 0.05 and −0.34, so six of the seven cases in S1's table now come out as they should; the seventh, "p > .05" for "p < .05", is a direction (S2). S3: a quote may leave out the source's footnote and citation markers, and a PDF's footnotes are read after the paragraph that finishes a sentence they would cut. S4: Europe PMC tables in `<floats-group>` are read, after the paragraph that cites them, and merged cells and bold cells are kept. S5 and S6: OpenAlex marks retracted works, offers the social-science fields, and reads a work's Zenodo copy when DataCite is ticked. OSF Preprints, RePEc/EconStor and HAL are not yet checked. Re-scoring 10,005 recorded answers changes no label ([field README](../eval/field/README.md#social-sciences-numbers-without-a-leading-zero-note-markers-tables-and-openalex-01010)). S2, S7 and S8 remain.

**Status (harness 0.104.0):** every finding is addressed. S8: the social-science suite (`eval/socsci/`), 8 CC BY papers and 2 made-up transcripts, 34 open and 12 held-out questions; Qwen3.5-4B passes 29/34 and 10/12, with no wrong answer labelled **Quotes found** (0 of 20). S2: 22 of the 24 wrong sentences in S2's table are now marked, against 7, and every right one stays backed (comparisons turned round, social-science opposites, claim strength, percent and percentage points, the interviewer's words); a country swapped and a subgroup left out remain for the model's checks. On the suite's answers the checks change no label: the model wrote none of these errors. S7: caption files (`.vtt`, `.srt`) are read as transcripts, a part that starts inside a turn says whose, and **Find every passage** lists every matching paragraph with its speaker, without the model. S9: references from element citations are written apart, the user guide says how data under an ethics protocol is kept, and backups can be encrypted with a password; an APA reference list was not added, since the BibTeX export gives Zotero what it needs to format one. S5: HAL's API allows web pages, RePEc's needs an access code; OSF Preprints and EconStor are still unconfirmed ([field README](../eval/field/README.md#social-sciences-a-suite-group-comparisons-and-claim-strength-transcripts-and-every-passage-01040)).

## Findings

### S1. High: numbers without a leading zero are read wrong

`NUMBER` in `src/agent/support.ts` needs a digit before the decimal point, so ".05" is read as the number 05, and in "r = −.34" the sign is never attached.

| Quote | Answer sentence | Marked | Should be |
| --- | --- | --- | --- |
| r = −.34, n = 812 | "… in 34% of the 812 cases" | backed | not backed |
| r = −.34 | r = .34 (sign dropped) | backed | not backed |
| p < .05 | p > .05 | backed | not backed (S2) |
| p < .05 | p < 0.05 | **not backed** | backed |
| d = .45 | d = 0.45 | **not backed** | backed |
| d = 0.45 | d = .45 | **not backed** | backed |
| Cronbach's α = .82 | alpha of 0.82 | **not backed** | backed |

**Why it matters:** APA style (7th edition, §6.36) writes values that cannot exceed 1 without the leading zero: p, r, α, standardized β, R² and proportions. A model may write either form. Today a right answer is marked whenever the model adds the zero, and a sign error on a correlation passes. Of the nine PMC papers, one survey paper alone has 65 such numbers ("p =.029"). The PDF made for the audit gives "R² .08". The glued-together reference lists (S9) add more matches that are not statistics.

**Fix:** in `numberText`, write a bare leading decimal as "0.dd" ("(?<![\p{Nd}.,])([-−+±]?)\.(\p{Nd})" → "$10.$2"), keeping the sign. Then ".05" and "0.05" are one number, and "−.34" is −0.34. Measure the change by rescoring every recorded run (`bench:rescore`); outside the social sciences, no verdict should change.

### S2. Medium-high: the sentence check misses social-science reversals

Each case pairs a real-style quote with a right sentence and a wrong one. All 24 right sentences were backed. Seven of the 24 wrong ones were marked:

| Caught (7) | Missed (17) |
| --- | --- |
| coefficient sign (β = 0.21 for −0.21), p threshold (.001 for .05), odds ratio (1.54 for 1.45), sample size (14,208 for 12,408), decade (1990s for 1980s), "positive/negative relationship", "significant (p = .02)" for "not significant (p = .27)" | more ↔ less likely; groups swapped around "than" (women/men, Democrats/Republicans); rose ↔ declined; widened ↔ narrowed; majority ↔ minority; supported ↔ opposed; trust ↔ distrust; fewer ↔ more; rural ↔ urban; richest ↔ poorest; Germany → France; "associated with" → "caused"; "suggest … may reduce" → "demonstrate … reduces"; "7 percentage points" → "7 percent"; "only for girls in the poorest quintile" → "among children"; an interviewer's question reported as what the participant said |

On sentences from a real CC BY survey paper ([PMC12562420](https://europepmc.org/article/PMC/PMC12562420), "Black participants were approximately 50% less likely … than White participants (AOR = 0.499 …)"), all four wrong sentences were marked backed: the two groups swapped, "less likely" made "more likely", and both swaps of Democrats and Republicans.

The reasons:

- **"more" is a stop word, and "less" is in no pair of `OPPOSITES`.** The field's most common comparison, "more/less likely", is therefore invisible.
- **The list of opposites stops at the natural sciences.** It has increase/decrease but not rise/fall, rose/declined or widen/narrow. Social-science pairs (support/oppose, majority/minority, trust/distrust, rural/urban, richest/poorest, liberal/conservative, approve/disapprove, employed/unemployed) are absent. Wrong directions in this field are mostly expressed with verbs like these, not with numbers.
- **Word order is not read.** "A was more likely than B" and "B was more likely than A" have the same words. The check already declines to judge pairs a sentence states both sides of (0.71.0). Comparisons around "than" and "compared with" need their own rule.
- **Causal and hedged language is not compared.** The difference between "is associated with" and "causes", or "suggests … may" and "shows", is the main thing a reviewer in this field checks, and no rule looks at it.

The model's own check, cross-check and contradiction check may catch some of these. They were not run here, and the earlier audits found the review rarely catches a contradiction a word check passes ([AI/ML audit F2](ai-ml-audit.md#f2-high-the-word-checks-pass-contradictions-and-the-self-review-rarely-catches-them)).

**Fix, in three parts:**

1. Add the pairs above to `OPPOSITES`, plus "more likely"/"less likely" as two-word sides and rise/rose/risen against fall/fell/declined.
2. A comparison rule: when a sentence says "X … than Y" or "X … compared with Y", and a quote says the same comparison with X and Y the other way round, mark it.
3. A strength-of-claim rule: a sentence with causal or certain wording ("causes", "leads to", "the effect of", "demonstrates", "proves") is not backed by quotes that say only "associated", "correlated", "linked", "suggests" or "may". Also add "percentage points" as a unit distinct from "%".

Measure each part on the suite of S8.

### S3. Medium-high: a quote that leaves out a footnote or citation marker is not found

`locateQuote` in `src/agent/evidence.ts` needs the quote's words in sequence, and a footnote marker in the source is a word:

| Source text | Quote | Found |
| --- | --- | --- |
| We test this claim with¹ panel data from 2,118 municipalities. | We test this claim with panel data from 2,118 municipalities | no |
| the state is weak.12 Yet elites persisted | the state is weak. Yet elites persisted | no |
| the state is weak,³ yet elites persisted | the state is weak, yet elites persisted | no |
| as Weber argued.[14] Bureaucracy spreads | as Weber argued. Bureaucracy spreads | no |

The PDF made for the audit gives exactly the first form: the app's PDF reader writes the raised footnote number as "¹". The same PDF shows a second problem. The paper's key finding, "longer commutes are associated with higher turnout … among homeowners **but not among renters**", runs onto the next page, and the footnotes are read in between. The quote of the whole finding is therefore not found, and a model that reads only the first part gives the finding without its condition.

**Why it matters:** the model usually leaves the markers out, so a right answer is labelled **Some quotes not found**. In fields that write in footnotes, the label would be unreliable on nearly every answer.

**Fix:**

- When matching, allow the source to have a footnote or citation marker where the quote has none: superscript digits, "[n]" and "[n–m]", and one to three digits directly after a word or "." and before a space and a capital letter. Never let the quote have one the source lacks.
- In the PDF reader, move lines in a smaller font below a short rule at the foot of a page to after the paragraph, as the Word reader already does with its notes, so a paragraph that crosses a page break reads as one.

### S4. Medium: regression tables are misaligned or missing

In the nine PMC papers:

- **Tables in `<floats-group>` are dropped.** `jatsToMarkdown` reads `<body>` and `<back>` only. [PMC12562420](https://europepmc.org/article/PMC/PMC12562420), from IJERPH (an MDPI journal, with its tables at the end in `<floats-group>`), loses all 4 of its tables, including the logistic regression its abstract reports. MDPI publishes *Social Sciences*, *Societies*, *Behavioral Sciences*, *Sustainability* and IJERPH, so this affects much of the field's open-access output.
- **`colspan` and `rowspan` are ignored.** In [PMC12753609](https://europepmc.org/article/PMC/PMC12753609) (OLS models of life expectancy on income inequality), "Model D", "Model E" and "Model F" each span three columns but are written over one. Every row of standard errors has one cell fewer than the row above, because the variable's name spans both rows, so the errors shift one column left:

  ```
  | Top 10% income share | − 0.0104*** | − 0.0156** | − 0.0128** |
  | (0.0024) | (0.0046) | (0.0034) |
  ```

  A model asked for the standard error of the female model reads the male one. The Word reader already expands both kinds of merge (`office.ts`, gridSpan and vMerge); the JATS reader should do the same.
- **Unlabelled tables get an empty heading** ("****"), and a table's bold cells, which this paper uses to mean p < 0.05, become plain text. The table note says so ("Bold = p < 0.05"), but the cell no longer shows it. Writing bold cells as `**0.045**` would keep the meaning.

In the PDF made for the audit, empty cells disappear: "Homeowner 3.05\*\*\*" no longer says it is Model 2's. Stars and the significance note survive.

### S5. Medium: the open sources reach little social-science full text

Articles published in 2023, from OpenAlex:

| Field | Articles | With abstract | On arXiv | In PMC | Open access |
| --- | ---: | ---: | ---: | ---: | ---: |
| Social Sciences | 948,071 | 88% | 0.1% | 2.8% | 82% |
| Psychology | 173,125 | 87% | 0.1% | 13.1% | 79% |
| Economics, Econometrics and Finance | 137,779 | 83% | 0.9% | 3.3% | 75% |
| Business, Management and Accounting | 297,595 | 91% | 0.0% | 1.0% | 83% |
| Arts and Humanities | 374,110 | 86% | 0.0% | 0.6% | 78% |
| *Physics and Astronomy, for comparison* | 126,571 | 83% | 34.2% | 6.4% | 74% |

Most social-science papers are open, but not where Kovrune can read them. The repositories that hold copies of them, by number of 2023 articles:

- **Social Sciences:** DOAJ journals 113,137; Zenodo 34,171; RePEc 26,942; HAL 11,940.
- **Economics:** RePEc 27,636; Zenodo 4,961; SSRN 3,621; EconStor 2,455.
- **Psychology:** Zenodo 5,862; OSF Preprints 1,376.

What follows:

- **The field filter offers none of these fields.** `OPENALEX_FIELDS` lists the 11 an engineering or physical-sciences researcher would want. Add Social Sciences (`fields/33`), Psychology (32), Economics (20), Business (14), Arts and Humanities (12) and Decision Sciences (18).
- **Zenodo copies are not used.** `fullTextIds` reads an OpenAlex work in full only from arXiv or Europe PMC. The DataCite source can already read a Zenodo PDF, so an OpenAlex work with a Zenodo location should be read from there. That is 34,171 more Social Sciences articles from 2023 alone.
- **The field's own repositories are not sources.** These are OSF Preprints (SocArXiv, PsyArXiv), RePEc/EconStor and HAL. Whether their APIs allow requests from web pages could not be checked from the audit's network, which blocked them. Check each as the CS audit did for the ACL Anthology. SSRN has no open API.

For now, the realistic path is the researcher's own PDFs, so S1, S3 and S4 matter more here than in fields with arXiv.

### S6. Medium: retracted papers are not flagged

OpenAlex marks 9,680 works in Social Sciences, Psychology and Economics as retracted, including LaCour and Green (2014), "When contact changes minds" (*Science*), and Shu et al. (2012) on signing at the top of a form (*PNAS*, cited 454 times). `WORK_FIELDS` doesn't ask for `is_retracted`, so these show as ordinary results, with their citation counts. The replication crisis makes this more pressing in psychology than anywhere else. Europe PMC results are already flagged (`RETRACTED_NOTE`); add `is_retracted` to `WORK_FIELDS` and show the same note.

### S7. Medium: interview transcripts

Kovrune is not a qualitative data analysis tool, and shouldn't try to be NVivo or ATLAS.ti. Asking "what did my participants say about X?" over one's own transcripts, privately, is still a strong use case. Three things get in its way:

- **A part that starts mid-turn doesn't say who is speaking.** In a transcript made for the audit (an interviewer and participant P07, with turns of 1–3 parts), 7 of 13 parts start inside P07's turn with no speaker label. A model reading such a part can't tell interviewer from participant. The check also doesn't notice an interviewer's question reported as the participant's view (S2, last case). The fix for proofs (0.97.0, "[This part continues the proof of …]") applies directly: "[This part continues P07's turn]", for lines that start with a short label and a colon.
- **Transcript formats are not accepted.** Zoom, Teams and Otter export WebVTT (`.vtt`) and SubRip (`.srt`). Both are plain text with timestamps and are simple to read, and the timestamps could serve as page numbers.
- **A question reads at most a few passages** (three per search, about four parts in a 4,096-token context). A question about a theme across 15 interviews will quote some and miss others, and a researcher may read it as a summary of all. Say this in the user guide. A cheap, model-free addition would serve qualitative researchers well: list *every* passage that matches a search, with its document and speaker, as a concordance.

### S8. Medium: no social-science suite

Every finding above was measured on cases written for the audit, not on how a model answers. As with `eval/lab`, `eval/chem` and `eval/math`, a suite would turn the findings into numbers:

- 8–10 CC BY papers: survey and panel regressions with APA statistics, a field experiment, an MDPI paper with tables in `<floats-group>`, a qualitative interview study, and a non-English one;
- an interview transcript set made for the suite;
- questions about directions, groups, subgroups, significance, standard errors read from tables, and who said what, with a held-out set.

### S9. Low: other observations

- **Reference lists in JATS lose their separators.** "MMWR Morb. Mortal. Wkly Rep.20247379379810.15585/mmwr.mm7336a3" is journal, year, volume, pages and DOI run together. The reference can't be read, and it makes long numbers that are not in the paper. Join the parts of `<element-citation>` and `<mixed-citation>` with ". ".
- **Data protection should be stated plainly.** Documents are kept in the browser's storage, and the backup file is plain JSON, both unencrypted. That is often acceptable, but ethics protocols ask about it. Add a short section to the user guide on what is stored, where, and how to delete it all. Consider an optional password on backups. The guide already warns that a model server on another computer is reached unencrypted.
- **Citation export is BibTeX only.** Zotero imports BibTeX, so this is mostly fine. An APA-formatted reference list in the Markdown export would save a step.

## Recommendations, in order

| # | Change | Finding | Kind | Needs a model to measure |
| --- | --- | --- | --- | --- |
| 1 | Read ".05" and "−.34" as 0.05 and −0.34 | S1 | defect fix | no (rescore) |
| 2 | Allow footnote and citation markers in the source when matching quotes; move PDF footnotes after the paragraph | S3 | defect fix | no |
| 3 | JATS: read `<floats-group>`, expand colspan and rowspan, keep bold cells | S4 | defect fix | no |
| 4 | Flag retracted OpenAlex works | S6 | small feature | no |
| 5 | Add the social-science fields to the field filter; read OpenAlex works from their Zenodo copy | S5 | small feature | no |
| 6 | Build the social-science suite | S8 | evaluation | yes |
| 7 | Social-science opposites, comparison order around "than", and claim strength (causal and hedged) | S2 | check | yes, on the suite |
| 8 | Speaker notes for transcript parts; accept `.vtt` and `.srt`; a list of every matching passage | S7 | feature | partly |
| 9 | Check OSF Preprints, RePEc/EconStor and HAL as sources | S5 | investigation | no |
| 10 | Data-protection section in the user guide; optional backup password | S9 | docs / feature | no |

Items 1–5 are small, deterministic and testable without a model. With them done, Kovrune would be a credible private reading assistant for one's own social-science PDFs and transcripts. Items 6–7 decide whether its **Quotes found** label can be trusted on the field's key claims.

## Method

- **Sentence checks:** `sentenceSupport` called directly, with one verified quote and the title "Survey study", on 24 right/wrong pairs (S1–S24 above) and 13 statistic-notation cases.
- **Real paper:** five sentences against the paragraph of PMC12562420 that reports the multivariable model.
- **JATS:** `jatsToMarkdown` on the full-text XML of PMC12753609, PMC12714948, PMC12562420, PMC12798833 (quantitative), and PMC12377238, PMC12506218, PMC12216660, PMC12625911, PMC12422356 (qualitative), all CC BY, chosen by a Europe PMC search for survey or regression papers and qualitative interview studies published 2019–2025. One quantitative paper chosen (PMC12721513) could not be downloaded.
- **PDF:** a two-page PDF made with ReportLab: a running header, superscript footnote markers, two footnotes, a paragraph crossing the page break, and an OLS table with stars and standard errors. It was read with `extractPdfText` and pdf.js, as `eval/paging-model.ts` does. Quote matching used `locateQuote`.
- **Transcript:** 16 alternating turns with long P07 turns, split by `chunkDocument`.
- **Coverage:** OpenAlex counts for articles published in 2023, by primary-topic field, with `has_abstract`, `has_pmcid`, `is_oa` and the arXiv source, and grouped by repository location; `is_retracted` for the fields 32, 33 and 20.
- **Not run:** any model, and the browser app. OSF, RePEc, HAL and Zenodo could not be reached from the audit's network.
