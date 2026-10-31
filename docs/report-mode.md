# Report Mode: Long Answers Built from Checked Ones

| | |
| --- | --- |
| Status | Agreed (decisions R1–R5 below). Slices 1–4 are built and the option is shown to everyone; slice 5, the introduction and conclusion, remains. See [Progress](#progress) |
| Depends on | M1's research agent and its checks ([`m1-plan.md`](m1-plan.md)) |
| Prompted by | A preview user's request for "a nice report in 400 words or more", which ended with no answer ([field README](../eval/field/README.md#the-raised-token-limit-kept-after-a-cut-off-0490)) |

## Goal

> A user asks for a report on a topic and gets a long answer that is still checkable: every section quotes its sources, each quote is verified, and each section carries its own label.

Research usually ends in a report, often a long one. Today Kovrune gives one short answer per question: the model's final reply is capped at 512 tokens (1,024 after a cut-off), and the checks are built for a few sentences against a few passages.

## Why not just allow longer answers

- **The checks would stop meaning anything.** Every sentence must share most of its words with a verified quote. The review, the cross-check and the completeness check each judge a short answer against a few passages. A 400-word answer has more sentences than its quotes can back, so it would mostly read as "partly backed" or go unchecked.
- **The models do worse the more passages an answer needs.** On questions that need two passages, Qwen3.5-4B passes 14 of 21 and Qwen3.5-2B 4 of 21. On the field suite, which is mostly one-passage questions, they pass 89% and 78% ([multi-passage suites](../eval/field/README.md#questions-that-need-more-than-one-passage-0460)).
- **The limits are physical.** A 4,096-token context holds about four read documents. On a class 1 laptop, one long reply takes minutes, and if it is cut off, the whole answer is lost.

## The flow

1. **Ask.** A **Write a report** option next to **Ask**. The question box takes the topic, for example "blockchain technology", or a request like the preview user's.
2. **Plan.** The model turns the request into 3–6 focused questions, one per section, each answerable from a few passages:
   - for blockchain: what a blockchain is; how blocks are linked; how consensus is reached; what it is used for; its known limitations.

   The plan is shown before anything runs. The user can edit, reorder, add or remove questions (2–8), and sees an estimated time from the model test's speed: about 3–7 minutes per section on class 1 with Qwen3.5-4B.
3. **Research each section.** Each question runs through the research agent as it is today, one after another:
   - with its own call budget, the user's chosen sources, the quote check and the label;
   - with progress shown per section, and **Stop** keeping the sections already done.

   A section that ends without an answer, or with one that is not confirmed, says so and does not stop the others.
4. **Assemble.** The report is the sections in plan order, each with its heading (the question), answer, label, evidence and **Show in the source**. Above them is a one-line summary of the labels, for example "4 of 5 sections: Quotes found".
5. **Introduction and conclusion (optional).** These are written by the model from the section answers only, without new searching or reading, in one short call.
   - Each sentence is checked like an answer sentence, against the verified quotes of the sections it draws on.
   - Sentences no quote backs are marked ⚠, as in an answer today.
   - They never change a section's label.
6. **Save and export.** The report is saved under **Past answers** like an answer. **Export as Markdown** writes the sections, labels, quotes, pages and steps, with a references list. **Export papers as BibTeX** covers every section.

## Planning

- **One short constrained call.** The model is shown the request and the sources ticked, not the documents, and replies with JSON `{"title": "...", "sections": [{"question": "..."}]}`, with 2–8 sections. It is asked for questions that one or two passages can answer, in the request's language, without overlap.
- **A plan that cannot be read falls back** to the request as a single section, which is today's behaviour.
- **The request itself is not researched.** Only the sections are, so a section never asks for 400 words.

## Running the sections

- **Fresh conversations.** Each section starts a new conversation, so context fitting, guards and limits apply as they do now, and one section's reads do not crowd out the next. Documents read in one section are to be cached, so a second section reading the same document costs no extraction or network request. The model still reads it again in its own context.
- **Sources.** The user's documents and the ticked open sources are searched in every section, as for a question.
- **Time.** The estimate is shown before the run, and a report on a slow setup asks for confirmation. On the preview user's 0.6 tokens/s, five sections would take hours.
- **Models.** Qwen3.5-4B is recommended. With Qwen3.5-2B the plan screen says that answers combining several sources are weaker, as the user guide already does for questions.

## What stays the same

- **Each section is a question as today:** same agent, prompts, checks, labels and benchmark behaviour. Nothing in the question path changes.
- **The promise holds per section.** The report is long, but every claim in it is either backed by a verified quote, with a label saying how far, or marked.
- **Nothing new leaves the device:** the same requests to the same sources.

## Measuring it

A **report suite** over the field documents (`eval/field/`): 8–10 report requests, a third held out. Each comes with the sections a good report should cover, written as facts, like the multi-passage questions, before any model is run. The harness runs the planner and the sections and scores:
- **Coverage:** the share of expected sections whose facts appear in some section of the report.
- **Section accuracy:** the share of sections that pass their facts, where they match an expected section.
- **False reassurance per section:** sections labelled Quotes found that are wrong, against the design's 10% target.
- **The introduction and conclusion:** how many of their sentences the quotes back.
- **Time:** calls and minutes per report.

The plan step can also be judged alone, cheaply, on the expected sections: does the plan cover them?

**Adopted when**, on Qwen3.5-4B, coverage and section accuracy reach agreed targets and false reassurance per section stays under 10%. The targets are to be set by the owner after a first baseline run. 2B is reported, not gated.

## Slices

Each slice is its own pull request, reviewed and tested on the class 1 laptop.

1. **Plan.** The planning call, the plan screen with editing and the time estimate, and the fallback. Unit tests with scripted models.
2. **Sections and assembly.** Running the sections one after another, progress, stop, partial reports, the label summary, saving.
3. **Export.** The Markdown report with references, and BibTeX across sections.
4. **Report suite and harness.** The suite, a baseline on both models, and the plan-only measurement.
5. **Introduction and conclusion.** The synthesis call and its sentence check, measured on the report suite before it is shown by default.

## Decisions

| # | Question | Decided |
| --- | --- | --- |
| R1 | Is a report part of the primary job in the design (§1.4)? | Yes: "…answer a question **or write a short report**…, with quotes I can check". |
| R2 | How does a user start a report? | An explicit **Write a report** option. A request detected from its wording ("report", "400 words") only suggests it. |
| R3 | Sections by default, and the most allowed | 4 by default, 2–8 allowed |
| R4 | Introduction and conclusion | Off until slice 5's measurement, then on by default if their sentences are mostly backed |
| R5 | Slow setups | Above 30 minutes estimated, ask for confirmation, and suggest fewer sections or Qwen3.5-2B for a first draft |

All five were agreed by the project owner as proposed. R1 is in the design's primary job (§1.4).

## Progress

- **Slice 1, the plan: built.**
  - `planReport` (`src/agent/report.ts`) makes one constrained call, with the request and the sources ticked, and reads a title and 2–8 questions. Empty and repeated questions are dropped, and a plan that cannot be read falls back to the request as one section.
  - The plan screen (`ReportPlanView`) edits, reorders, adds and removes sections, and shows the time estimate from the model test. Above 30 minutes it says that the report will ask for confirmation.
  - In question mode, a question that asks for a report ("report", "overview", "400 words") gets a hint offering **Write a report**.
  - The option was shown only with `?report` in the address until reports could be exported (slice 3).
  - Tried live on both models with the preview user's blockchain request, and on "how Kovrune checks the quotes in its answers". Both gave a title and 2–4 focused questions in 17–37 seconds on CPU. Some questions ask two things at once ("its definition and technical architecture"), which the multi-passage suites showed is harder. The plan screen lets the user split them, and slice 4 measures how often it happens before the prompt is changed.
- **Slice 2, writing the report: built.**
  - **Write the report** researches each section's question in turn, with `runResearch` as a question is: the same agent, checks and labels. The library is built once for all sections.
  - Above 30 minutes estimated, it asks for confirmation first (R5).
  - The trace shows each section's heading and its steps. **Stop** ends the section in progress, and the report keeps the sections already written.
  - A section that ends without an answer says so, and the next one starts. A model or server error stops the report and says that the sections written before it are saved.
  - **Saving:** a report is saved under **Past answers** as an answer with a `report` field: its title, request, plan and sections, each a saved answer. It is saved again after every section, so a reload keeps the sections written. A report the page closed on says how many sections were not written. Backups validate a report's sections as answers.
  - **The view:** the report shows the title, a label summary ("2 of 3 sections: Quotes found. 1: Quotes found, answer not confirmed."), then each section's question, label, answer and evidence.
  - A report is not yet exported (slice 3), so its export buttons are hidden, and it cannot be continued after an error, only written again.
  - **Checked end to end** in Chromium against Qwen3.5-2B on the model server, with the user guide as the only document:
    - planned "Setting Up a Local Model Server for Kovrune" in four sections, cut to two on the plan screen;
    - wrote both in 4.1 minutes, the trace showing each section's heading and steps;
    - the report was still under **Past answers** after a reload.

    The run showed that labels with counts ("2 of 13 sentences backed by a quote") were summed up one by one, so they are now counted by kind ("2 of 2 sections: Some sentences not backed by a quote."). 2B's answers to these broad questions were long and mostly unbacked, which is what the label says, and what slice 4's report suite will measure.
- **Slice 3, export: built.**
  - **Export as Markdown** (`reportToMarkdown` in `answers.ts`) writes:
    - the title, the date and model, the request and the label summary;
    - each section's question, label, answer with ⚠ marks, and quotes, each pointing to a numbered reference ("✓ [1], p. 4: > …");
    - the questions not written, when the report was stopped;
    - one list of references for the whole report, numbered in the order they are first quoted, with a document's parts counted as one source and open sources linked with their retrieval date;
    - the steps, by section.
  - **Export papers as BibTeX** collects the OpenAlex papers of every section, each once. Files are named after the report's title.
  - With export in place, the `?report` gate is removed: **Write a report** is shown to everyone. The user guide has a section on it ([Write a report](user-guide.md#write-a-report)).
- **Slice 4, the report suite: built and run** ([field README](../eval/field/README.md#the-report-suite-0510)).
  - Nine report requests over the field documents (`eval/field/reports.ts`), three held out, each with the sections a good report covers: keywords and facts.
  - `npm run bench:report` writes each report as the app does and scores plan coverage, report coverage, matched sections that give their facts, false reassurance, unmatched sections, joined questions and time.
  - **First run at 4,096 tokens.** On the six `reports`, Qwen3.5-4B's reports give the facts of 9 of the 23 expected sections, and Qwen3.5-2B's of 3. The cause is mostly the plan: written without seeing the sources, it asks what such a report usually covers ("tokenomics", "encryption methods"), and those sections end as "not found". 4B also often plans two sections instead of four.
  - Few sections are labelled Quotes found (2 of 30 on 4B, none wrong), because long section answers are rarely backed sentence by sentence.
  - **Next:** show the planner what the sources hold before it plans, judged on this suite. Then the introduction and conclusion (slice 5) can be measured on it too.

- **The source overview: the planner sees what the documents hold (harness 0.52.0).**
  - Before planning, `planReport` searches the user's documents for the request as the research agent would, without the words that only ask for a report ("write", "report", "400 words"), and with the terms translated into each document language written in another script. From each passage found (6, plus 2 per such language) it keeps the 3 sentences that best match, at most 2,400 characters in all, grouped by document.
  - The planner is shown them and asked to base the sections on what the sources hold, not on what a report on the subject usually covers. The plan screen names the documents it was shown. Open sources are not searched before planning: a plan from Wikipedia or OpenAlex alone is still written blind.
  - **Adoption condition, declared before the run.** At 4,096 tokens, on the report suite, the overview is kept when:
    1. report coverage on `reports` rises on at least one of Qwen3.5-4B and 2B, and falls on neither;
    2. the `reportsholdout` coverage total falls on neither model;
    3. no more matched sections are labelled Quotes found without their facts than in the baseline.
