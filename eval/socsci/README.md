# Social-science suite

Questions over social-science papers and interview transcripts (harness 0.104.0), recommendation 6 of the social-sciences audit ([`docs/social-sciences-audit.md`](../../docs/social-sciences-audit.md), S8). No other suite has a survey's adjusted odds ratios for one group against another, a panel regression with its standard errors in a row under its estimates, a field experiment's response rates by treatment, interviewees quoted by code, or a transcript in which the interviewer suggests one thing and the participant says another. Those are where reading the field goes wrong: which group was more likely, which way an association went, whether an estimate was significant, and who said it. The audit found the sentence check marking 17 of 24 wrong social-science sentences backed; this suite measures how often that matters on answers a model writes, and what the S2 checks of 0.104.0 change ([below](#results)).

```bash
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --modes constrained \
  --suites socsci,socsciholdout --out eval/results/socsci-qwen3.5-4b-q4km.json
```

`socsci` (34 questions) may be looked at task by task while a change is developed; `socsciholdout` (12) is read only as totals, like the other held-out suites. The questions and their facts were written from the documents before any model ran on them, and are not changed to fit a run. Scoring is the research suite's (`eval/harness/scoring.ts`): every fact group in the answer, every cited document cited, a verified quote, and `found` right. The scorer matches lower-cased substrings, so it can't tell "Black participants were less likely than White participants" from the reverse; a group question asks for what only the right reading gives (the odds ratio, the group the question doesn't name), and the reports are read for the rest.

## The documents

Eight open-access journal papers, all [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and two made-up interview transcripts. They are their own library (`socsciLibrary` in `eval/harness/field.ts`).

- **Overlap on purpose:** two surveys of trust (patients in pharmacists; a field experiment on how candidates answer voters), two studies of who wins and loses in politics (a German election experiment, British MPs after the Brexit referendum), a programme evaluation, a panel regression, three interview studies, and two transcripts whose interviewees are both shift workers, one who felt excluded by her neighbours' association and one who did not.
- **What goes wrong:** a group comparison turned round; "less likely" for "more likely"; a coefficient's sign or its standard error read from the wrong column; an estimate significant in one model and not in the next; a finding that holds only for some participants; a quote given to the wrong interviewee; the interviewer's question taken for the participant's view; and a fact in the middle of a long answer, in a part that starts inside the participant's turn.

| File | Article | Size | Licence |
| --- | --- | --- | --- |
| `pharmacist-trust-vaccination-survey.md` | Oluchukwu M. Ezeala et al. From Trust to Choice: A Cross-Sectional Survey of How Patient Trust in Pharmacists Shapes Shared Clinical Decision-Making for Vaccination. *Int J Environ Res Public Health* 2025. [doi:10.3390/ijerph22101525](https://doi.org/10.3390/ijerph22101525); [PMC12562420](https://europepmc.org/article/PMC/PMC12562420) | 66 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `income-inequality-life-expectancy-canada.md` | Edgardo R Sepulveda et al. Income inequality and life expectancy in Canada: New evidence from province-level panel regression analysis. *Can J Public Health* 2025. [doi:10.17269/s41997-025-01024-6](https://doi.org/10.17269/s41997-025-01024-6); [PMC12753609](https://europepmc.org/article/PMC/PMC12753609) | 44 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `politician-email-field-experiment.md` | Ekkehard A Köhler and May. Politicians' email communication with voters: A field experiment for the 2021 Bundestag elections. *PLOS One* 2025. [doi:10.1371/journal.pone.0324542](https://doi.org/10.1371/journal.pone.0324542); [PMC12282911](https://europepmc.org/article/PMC/PMC12282911) | 45 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `party-realignment-single-issue-voters.md` | Christian Cox and Shapiro. Party realignment and single-issue voters. *PLOS One* 2025. [doi:10.1371/journal.pone.0319522](https://doi.org/10.1371/journal.pone.0319522); [PMC11913262](https://europepmc.org/article/PMC/PMC11913262) | 36 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `older-people-care-academia-gender-gap.md` | María Rosario Vidal-Abarca et al. Older people care increases the gender gap in academia. *Scientific Reports* 2025. [doi:10.1038/s41598-025-13360-1](https://doi.org/10.1038/s41598-025-13360-1); [PMC12480459](https://europepmc.org/article/PMC/PMC12480459) | 42 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `cash-transfer-food-security-nigeria.md` | Otu W. Ibok et al. Impact of conditional cash transfer on households food security in Akwa Ibom State, Nigeria. *PLOS One* 2025. [doi:10.1371/journal.pone.0325594](https://doi.org/10.1371/journal.pone.0325594); [PMC12176151](https://europepmc.org/article/PMC/PMC12176151) | 57 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `psycho-oncologists-patient-deaths.md` | Svenja Wandke et al. A qualitative interview study on psycho-oncologists' experiences with patient deaths in Germany. *Scientific Reports* 2025. [doi:10.1038/s41598-025-06991-x](https://doi.org/10.1038/s41598-025-06991-x); [PMC12216660](https://europepmc.org/article/PMC/PMC12216660) | 43 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `social-relationships-long-term-conditions.md` | Hilda Hounkpatin et al. Experiences of Social Relationships for Adults Living With Multiple Long-Term Conditions: A Qualitative Interview Study. *Health Expectations* 2025. [doi:10.1111/hex.70335](https://doi.org/10.1111/hex.70335); [PMC12422356](https://europepmc.org/article/PMC/PMC12422356) | 34 KB | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `interview-t01-rosa.md` | Made up for the suite: interview T01 of a "Shift Work and Neighbourhood Life" study, a nurse on rotating shifts, typed with speaker labels ("IV:", "P07:") | 6 KB | this repository's licence |
| `interview-t02-daniel.vtt` | Made up for the suite: interview T02, a warehouse operative on fixed nights, as a WebVTT caption file of the kind a recorded video call exports, read by the app's caption reader (`src/documents/transcripts.ts`) | 5 KB | this repository's licence |

Each paper names its authors in full, as published.

**How they were made.** `source/build.ts` downloads each article's full-text XML from Europe PMC and writes it as Markdown with the app's own converter (`src/sources/jats.ts`), so each reads as Kovrune reads it from Europe PMC: its merged table cells spread over their columns and rows, its bold cells kept, its tables from `<floats-group>` placed after the paragraph that cites them (0.101.0), and its references written with their parts apart (0.104.0). The other suites' papers were made with `eval/clinical/source/jats2md.py`, which predates those fixes. It refuses an article whose XML licence is not CC BY 4.0. The article's own text is kept; as the licence asks to be told, figures are kept as their captions only, supplementary material is left out, and tables given only as images in the source (the email experiment's Tables 2–10) have only their captions.

```bash
node --experimental-strip-types eval/socsci/source/build.ts
```

**The transcripts** were written for the suite. One answer in each is longer than a part (1,800 characters), with a fact the questions ask about in its second half, so a part starts inside the participant's turn and only its note says whose turn it is (`speakersContinued` in `src/documents/chunk.ts`). Each has an interviewer's question the participant rejects ("So would you say you felt excluded…?" "No, not excluded…"), and the two interviewees disagree on purpose: Rosa felt welcome but kept away by her rota; Daniel felt shut out by his neighbours' group chat.

**Which papers, and which not.** Candidates came from Europe PMC searches (2018–2025, open access, CC BY) for surveys and regressions on trust, voting, inequality and income; field experiments and cash transfers; political science in *PLOS One* and *Humanities and Social Sciences Communications*; and qualitative interview studies. Europe PMC holds social science mostly where it touches health, so most of the papers are from journals that publish both, and none is from a sociology or economics journal as such; those are rarely in PubMed Central (0.1–3% of 2023 articles, the audit's S5). One candidate's text contradicts itself (the email experiment says in its abstract that candidates exert more effort when they disagree, and in its results that those who agree write longer replies), so no question asks about it; another has internally inconsistent shares (the cash transfer's 55% food-insecure and 64% food-secure beneficiaries), so no question asks about those either.

## The questions

Kinds of the 34 open questions, tagged in each task's comment in `tasks.ts`: **group** (8), **direction** (4), **significance** (4), **table** (4), **subgroup** (2), **negative** (3), **who** (5), **turn** (2), **number** (2), **lookup** of what a paper reports among its benefits (1, s32), **comparison** (1), and one the documents do not answer, with nearby facts (how long Daniel has lived on his street: Rosa has lived on hers for eleven years, and Daniel has been on nights for five). Some questions are of two kinds. The held-out set has 11 answerable questions of the same kinds and one unanswerable.

## Results

Qwen3.5-4B (Q4_K_M) in constrained mode, llama.cpp `fae9ac5` built portably (`-DGGML_NATIVE=OFF`), 4,096-token context, thinking off, on a 4-core cloud CPU (Intel Xeon @ 2.10GHz). Run in three parts on one machine (a background job there may run two hours) and merged into one report, then s34 on its own. One run, so a task that passes or fails once may not do so again.

| Suite | Passed | Labelled Quotes found | Of those, wrong |
| --- | --- | --- | --- |
| `socsci`, as run (33) | 26/33 | 12 | 1 (s24, a task defect: right) |
| `socsci`, two task defects fixed, with s34 (34) | **29/34** | 12 | **0** |
| `socsciholdout` (12) | **10/12** | 8 | **0** |

What the 0.104.0 checks change on these answers, the failures, and the speaker notes measured with and without: [field README](../field/README.md#social-sciences-a-suite-group-comparisons-and-claim-strength-transcripts-and-every-passage-01040).

### Task defects

Fixed after the first run, as each was plainly wrong; the scores above give both.
- **s24** asked how many patient deaths a month the psycho-oncologists saw, with the abstract's "two" as its fact. The results say "an average of 2.2", and the model answered 2.2 with that quote: right, and failed. "2.2" was added.
- **s32** was written as unanswerable (the cash transfer study measured food security and investment, not school enrolment). The paper reports, among the benefits beneficiaries named, that "some beneficiaries who could not send their children to school can now do so", and the model found it. It is now answerable from that passage. The model's answer overstates it ("a positive effect on children's school enrolment"), which neither the fact nor the sentence check can tell; its sentences are marked as not sharing enough words with the quote, not for the overstatement. **s34** was added as the open set's unanswerable question, and run on its own: it passes.

**Limits:** one author chose the papers, wrote the questions and the transcripts, and wrote the checks they test; the transcripts are short and made up. Social science that is not in PubMed Central (most of sociology, political science and economics) is represented only by the papers here that happen to be. The scorer reads substrings, so a reversed group comparison passes it when it names the right numbers; the reports are read for such answers.
