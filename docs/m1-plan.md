# M1 Plan: Local Research Agent

| | |
| --- | --- |
| Status | In progress: slices 1, 2 done; slice 3 waits on a class 2 run; slice 4 built and checked live on class 1, waiting on the usability test. See [Progress](#progress) |
| Depends on | M0 provisional go ([`m0-benchmark.md`](m0-benchmark.md#m0-status)) |
| Team | Project owner (decisions, reviews, laptop testing) and Claude (implementation, tests, benchmark runs, docs) |

## Goal

> A user asks a research question about their own documents or open sources, and gets a **cited, verifiable answer** from a model running on their own machine, in the browser or on a local server, with no hosted AI service.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Which model path a new user sees first | A **device advisor** chooses automatically: the browser (WebLLM) on capable GPUs, a local server otherwise. The user can override it. |
| D2 | Supported local servers | **llama.cpp server** is officially supported. **Ollama is experimental**: allowed, but only after it passes the self-check, with a warning. |
| D3 | PDF support | **Yes, in M1**: text extraction with pdf.js. Scanned PDFs without a text layer are reported as "no text found"; there is no OCR. |
| D4 | Team | Two people. Work is cut into vertical slices; each ends in a pull request the owner reviews and tests on the class 1 laptop. |

## What M0 changed

| M0 finding | Consequence for M1 |
| --- | --- |
| Browser speed on class 2 is estimated, not measured | Class 2 confirmation run is a gate in slice 1 ([issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9)) |
| On class 1, the browser is about 7× slower than native llama.cpp | The local-server path is built first and is a first-class path |
| wllama: broken WebGPU output on Intel Gen 9, too slow on CPU | wllama is not shipped in M1; WebLLM is the only in-browser runtime |
| Ollama 0.40.10 loops on Qwen3.5 tool conversations with thinking off | D2: llama.cpp server is the supported local server |
| Models invent answers to unanswerable questions (1 correct refusal out of 9) | An evidence check: answers must quote their sources, and quotes are verified |
| Small models repeat actions and ignore the repeat notice | A repeat guard that forces a final answer |
| The two-step self-check catches broken setups in about a minute | It becomes the in-app **Test model** step |

## Scope

### In M1

1. **Agent engine in `src/`.** The agent loop, tools, search and model adapters move from `eval/harness/` into `src/agent/` and `src/tools/`. The benchmark harness then imports the product code, so the evaluation measures what users run.
2. **App.** A React and Vite app with:
   - a setup wizard: device advisor, model path, Test model;
   - a document library: add text, Markdown, HTML and PDF files;
   - a question box and a live step-by-step trace of the agent's actions;
   - a result view with the answer, citations, quoted passages and verification status.
3. **Model paths.**
   - **Local server:** connect to an OpenAI-compatible URL. llama.cpp server is supported; Ollama is experimental. The self-check runs on connect, and setup instructions are shown for llama.cpp.
   - **Browser:** WebLLM with a two-model catalog: Qwen3.5-4B (default) and Qwen3.5-2B (lighter). It includes a compatibility check (WebGPU, `shader-f16`, estimated GPU memory) and download progress. GPUs without `shader-f16` get the 32-bit (q4f32) build of the same model (added in slice 3).
4. **Device advisor (D1).** It recommends the browser path when WebGPU is available, `shader-f16` is supported, and the adapter can fit the default model. Otherwise it recommends a local server. It never runs a model on WebGPU without the self-check passing.
5. **Research sources.** The user's documents (chunked and searched with the benchmark's search, stemming included), plus Wikipedia and OpenAlex, which allow browser requests. Each source records its URL and retrieval time.
6. **Trust features.**
   - **Evidence check.** `final_answer` must include, for each citation, a short verbatim quote. The app checks that each quote appears in the cited source (ignoring whitespace and case), and labels the answer **Quotes found**, **Quotes not found** or **No quotes**. The labels say only what the check proves: a real quote does not show that the whole answer is right (see the class 1 field notes under slice 2). The evidence step also gives the model an explicit "the sources do not contain the answer" path.
   - **Repeat guard.** A repeated action narrows what the model may do next, enforced through the constrained-decoding schema. A repeated search removes `search`, so the model can still read what it found. A repeated read of one part of a long document lists the other parts. A second repeat allows only `final_answer`.
   - **Last-step guard** (added in slice 2). The last call a task is allowed also accepts only `final_answer`, and the model is told to finish with what it has found. Without it, small models rephrased searches until the budget ran out on questions the documents do not answer (4 of 11 in the first slice 2 run).
   - **"Not found in your sources"** is a first-class result, not an error.
7. **Evaluation continuity.** The M0 evaluation set keeps running on the moved engine. M1 adds tasks for the new behaviour (below) and reports them separately, so M0 comparisons stay valid.

### Not in M1

| Item | Milestone |
| --- | --- |
| Checkpointing tasks so an interrupted question can resume (documents and finished answers are saved since [issue #34](https://github.com/bowo-prasetyo/kovrune/issues/34)) | M2 |
| Signed reproducible builds, CSP, production hosting (an unsigned preview has been published from `main` since slice 4) | M2 |
| Coding agent and sandboxed execution | M2.5 |
| Peer-to-peer collaboration | M3+ |
| Embedding-based search (Transformers.js) | After M1, if keyword search proves the bottleneck |
| OCR for scanned PDFs | Not planned |
| wllama in the app | Revisit if its WebGPU and CPU performance improve |

## Slices

Each slice ends in one pull request with tests, a benchmark check where relevant, and steps for the owner to try on the class 1 laptop. Durations are elapsed time and depend mostly on review and testing turnaround.

| Slice | Content | Exit check | Estimate |
| --- | --- | --- | --- |
| **1. Engine and skeleton** | Move the engine into `src/`; harness imports it. App skeleton and setup wizard with the local-server path and Test model. **Class 2 gate** (issue #9). | Benchmark results unchanged on native llama.cpp (Qwen3.5-4B research 16/22 ±1). The owner connects the app to llama.cpp on the laptop and Test model passes. | 1–2 weeks |
| **2. Research over your documents** | Document library (text, Markdown, HTML, **PDF**), chunking, search, agent run with a live trace, result view. Evidence check, repeat guard, "not found" result. New evaluation tasks. | Qwen3.5-4B: original research set ≥ 73%, new unanswerable set ≥ 2/3 correct refusals, valid actions ≥ 95%. The owner asks a question about one of their own PDFs and gets a verified, cited answer. | 2 weeks |
| **3. Browser path** | WebLLM catalog, compatibility check, download progress, device advisor. | The same task works in the browser on a class 2 machine (from issue #9 or a tester). On the class 1 laptop, the advisor recommends the local server. | 1–2 weeks |
| **4. Open sources and polish** | Wikipedia and OpenAlex sources, error states, onboarding text, user documentation. Usability test with 3–5 people. | M1 acceptance below. | 1–2 weeks |

Total: about 6–8 weeks elapsed.

### New evaluation tasks (slice 2)

- **8 more unanswerable questions** over the existing corpus. Three is too few to measure refusals: one task is 33 percentage points.
- **4 PDF tasks**: two documents converted to PDF, checking extraction and citation.
- **Evidence scoring**: a research task also requires a quote that verifies against a cited document.

These change the evaluation set, so reports bump the harness version and keep the original 22 research tasks as a separate line for comparison with M0.

## Progress

### Slice 1: engine and skeleton (done)

The engine moved into `src/`, and the app gained the setup wizard. On native llama.cpp, the Qwen3.5-4B results were identical to M0, task by task ([`slice1-regression-qwen3.5-4b-q4km.json`](../eval/results/slice1-regression-qwen3.5-4b-q4km.json)). The class 2 gate is still open in issue #9.

### Slice 2: research over your documents (done)

The app now has a document library (PDF, text, Markdown, HTML; kept in memory until M2), a question box with a live step trace and a Stop button, and a result view. The view shows **Verified**, **Unverified** or **Not found in your sources**, with each quote marked as found or not found in its document. The evaluation adds the `unanswerable` and `pdf` suites (harness 0.5.0).

Exit check, Qwen3.5-4B (Q4_K_M) on native llama.cpp, constrained, 4 CPU threads in the cloud container ([`slice2-qwen3.5-4b-q4km.json`](../eval/results/slice2-qwen3.5-4b-q4km.json)):

| Target | Result |
| --- | --- |
| Original research set ≥ 73%, now with verified quotes required | 19/22 (86%); M0 was 16/22 without quotes |
| Correct refusals ≥ 2/3 (11 unanswerable questions) | 11/11; in M0, the three models refused 1 of 9 times in total |
| Valid actions ≥ 95% | 100% |
| Every answer judged correct has a verified quote | Yes (the scoring requires it) |
| PDF suite | 3/4 |

The first run without the last-step guard reached 7/11 refusals. The model never invented an answer, but it kept rephrasing searches until it ran out of calls on four questions. The last-step guard turned exactly those four into correct refusals and changed no other result.

Remaining failures:
- r04 gives only one of the two fixed versions.
- r12 cites a related document instead of the expected one.
- r19 names the wrong library after a correction.
- p04 decides that a two-part question is unanswerable.

Decode speed in the container is about 7 tokens/s, which is not a class 1 or class 2 measurement.

#### Class 1 field notes

The owner's first test on the class 1 laptop used Qwen3.5-2B (Q4_K_M) on llama.cpp server in WSL, with a 35-page slide-deck PDF: an English Eclipse Papyrus tutorial whose slide templates also contain French placeholder text.

- **Setup.** The device step recommended a local server ("Integrated Intel graphics"). The model test passed in 18.9 s at 8.4 tokens/s.
- **Getting llama-server running took several tries:**
  - an old server was still holding port 8080;
  - the command used a placeholder model path;
  - `-hf` failed because the build had no HTTPS support, so the GGUF was downloaded with `curl` instead.

  The setup docs should cover these.
- **Extraction.** All 35 pages were read (15,210 characters, 10 parts).
- **Unanswerable question.** "Who is the CEO of Atos?" was answered **Not found in your sources**, although "Atos" appears on every slide.
- **"How to create an activity diagram?"** came back labelled **Verified** with one real quote, but two of its three steps were wrong.
  - The model searched twice. The old repeat guard then allowed only `final_answer`, so the model answered from search snippets without reading the slides.
  - This led to three changes:
    - the labels now say only that the quotes were found;
    - a repeated search no longer forces an answer;
    - research replies may use 512 tokens, because the longer answers that follow a read were being cut off at 256.

Before and after, the same Qwen3.5-2B on 8 questions about the extracted text (6 answerable, 2 not), native llama.cpp in the cloud container. The owner's exact run did not reproduce here; a different llama.cpp build and CPU change the model's path.

| | Before | After |
| --- | --- | --- |
| Wrong answer with quotes found ("Verified") | 2 | 1 |
| Correct answer with quotes found | 3 | 3 |
| Correct answer, quote not word for word | 1 | 1 |
| Answerable question refused | 0 | 1 |
| Unanswerable questions refused | 2/2 | 2/2 |

The full benchmark with Qwen3.5-4B (harness 0.6.0) is unchanged task for task: research 19/22, refusals 11/11, PDF 3/4, valid actions 100% ([`slice2-fix-qwen3.5-4b-q4km.json`](../eval/results/slice2-fix-qwen3.5-4b-q4km.json)).

**Second class 1 run, after the fix.** Same laptop, PDF and Qwen3.5-2B, with the fix merged:
- **Model test:** passed in 21 s at 13.8 tokens/s. The first run's 8.4 tokens/s was probably slowed by another process competing for memory.
- **"How to create an activity diagram?"**
  - The model searched twice with the same query. The guard took away search, and the model then read the slides.
  - The answer listed all five steps from slides 3–5: Papyrus perspective, New › Other… › Papyrus Project, project name, UML language, UML Activity Diagram.
  - Its quote was correct, and the label read **Quotes found**.

This completes the slice 2 exit check: the owner asked about one of their own PDFs on the class 1 laptop and got a correct, cited answer whose quote checked out. The unanswerable question earlier got a correct **Not found in your sources**.

### Slice 3: browser path (built; class 2 run pending)

The model can now run in the browser:

- **Device step.** It offers both paths. The recommended one is the primary button, and on a GPU the advisor doesn't recommend, the browser path is offered as "Run in this browser anyway".
- **Model step.** The catalog has Qwen3.5-4B and Qwen3.5-2B. The 2B is suggested on devices that report 8 GB of memory or less.
- **Compatibility check.**
  - It blocks: no WebGPU, GPU buffers too small, or not enough browser storage.
  - It warns about: no `shader-f16` (the 32-bit build is used instead), integrated Intel graphics, an untested GPU, or low device memory.
  - Warnings leave the decision to the model test.
- **Download and loading.**
  - A progress bar shows the download, and later visits load the model from the browser's storage.
  - Models already downloaded are marked, and their download can be deleted.
  - The browser is asked to keep the download persistent.
  - The model is loaded once per visit and shared by the model test and the research screen.
- **Settings.** They are saved only after the model test passes, as before. Settings saved by slices 1–2 still load as local-server settings.
- **Stop.** Stop now takes effect at once with WebLLM too. Before, it waited for the engine's next token, which on a slow GPU can be minutes away.

Tested in the cloud container:
- Unit tests cover the catalog against WebLLM's prebuilt list, the compatibility check, settings migration and the immediate stop.
- End-to-end runs in headless Chromium at 375 px used the container's software WebGPU (SwiftShader, no `shader-f16`). They covered:
  - the device advice;
  - the 32-bit fallback warning;
  - detecting a cached model;
  - loading from the browser's storage (10 s for Qwen3.5-2B);
  - the start of the model test;
  - Ask enabled only after loading;
  - Stop;
  - deleting a download.
- Generation itself is far too slow on a software GPU to finish a model test: the first call of Qwen3.5-0.8B had not finished after 10 minutes. So answers in the browser are not yet checked end to end.
- The local-server wizard and research flow were re-run end to end against llama.cpp, with the same results as slice 2.

Still open for the slice:
- **Class 2 check.** The same research task works in the browser on a class 2 machine (issue #9 or a tester).
- ~~**Class 1 check.** On the class 1 laptop, the advisor recommends the local server.~~ Done: the device step recommended a local server because of the integrated Intel graphics.

Known limitation: WebLLM fetches its compiled model libraries from the `main` branch of `mlc-ai/binary-mlc-llm-libs` on GitHub, and model weights from the `main` revision on Hugging Face. Pinning both to fixed revisions belongs with the M2 build and hosting work. Done in M2 slice 1: both are pinned and every file is checked against its SHA-256 ([design §3.4](design.md#34-catalog-entries-and-downloads)).

### Slice 4: open sources and polish (built; usability test pending)

- **Open sources.**
  - Wikipedia (MediaWiki Action API, any language edition) and OpenAlex (scholarly works) can be searched besides the user's documents. Both are off by default and chosen under **Search in**.
  - With either one ticked, questions work without any documents.
  - The agent gets `search_wikipedia` and `search_openalex` tools. `read` fetches an article or work. A long Wikipedia article is split into parts, and the part that best matches the question is returned first.
  - Fetched text is kept for the question, so quotes are checked against exactly what the model read. A cited article the model never read is fetched for the check, so an invented quote still fails.
  - Citations link to the source and show the retrieval time (scope item 5).
  - With no open source ticked, the tools and system prompt are exactly the benchmark's. A full Qwen3.5-4B run confirmed results unchanged task for task.
- **Privacy text.** The research screen says what goes to Wikipedia or OpenAlex: the model's search words and the pages it reads, not the user's documents or the question as typed.
- **Error states.**
  - Source failures (offline, HTTP errors, missing articles) become tool results the agent can act on, and are shown in plain words.
  - Stop also cancels source requests.
  - An error boundary replaces a blank page after a crash with a message and a Reload button.
- **Onboarding.** A welcome note before setup, a Help link to the user guide, and a getting-started hint with example questions on an empty research screen.
- **User documentation.** [`user-guide.md`](user-guide.md) covers:
  - starting the app;
  - both model paths;
  - llama.cpp setup on Linux and WSL, including the snags from the class 1 run;
  - asking questions;
  - what the answer labels mean;
  - privacy;
  - troubleshooting.
- **Usability test.** [`usability-test.md`](usability-test.md) has the protocol, tasks, questions and results sheet for 3–5 participants.

The cloud container's network policy blocks `en.wikipedia.org` and `api.openalex.org`, so the adapters were first unit-tested against responses shaped like the documented APIs.

#### First live checks (class 1, Qwen3.5-2B)

Both services worked live from the owner's browser: searches returned the right articles and papers. Both answers still went wrong, for the same reason: **the model typed document IDs that did not exist.**

- **Wikipedia, "Who was Ada Lovelace?"**
  - The search returned `wikipedia:Ada_Lovelace`, but the model read `wikiped:Ada_Lovelace` twice. Both reads failed.
  - It then answered from the snippet and its own memory, inventing an "Algorithm No. 62" and a 2009 award.
  - Its quote, the article's real first sentence, was rejected as "no such document" because it was filed under the mistyped ID. The label read **Quotes not found**.
- **OpenAlex, "How does LLM think?"**
  - The search found relevant papers, but the model read the bare ID `W7150387116`, without the `openalex:` prefix, twice. Both reads failed.
  - It summarized the snippets without quoting anything (**No quotes**), and called that an answer while saying the sources had "no direct answer".

**Fix (harness 0.7.0).** The `docId` in `read` and in `final_answer` evidence is now an enum of the IDs the task has seen: the user's documents and their parts, search results, and fetched articles and their parts. It is rebuilt before every model call. Under constrained decoding a mistyped ID cannot be produced; unconstrained, it is rejected as an invalid action and the model is told so. The labels now say "not in the sources they cite" and "without quoting any source" instead of "your documents". The evidence reason now reads "the model cited a document ID it never found".

With the fix, the full Qwen3.5-4B benchmark (harness 0.7.0) is unchanged task for task: research 19/22, refusals 11/11, PDF 3/4, valid actions 100%. The 8 Papyrus questions on Qwen3.5-2B give the same status for every question. The live typos are replayed in unit tests: after the two searches, `read` accepts exactly `wikipedia:Ada_Lovelace` and `openalex:W7150387116`.

**Second live checks, after the fix.** Both now read the right document.
- **OpenAlex, "How does LLM think?"** The model read `openalex:W7150387116` ("How LLMs Might Think") and quoted its abstract word for word: **Quotes found**, with a fair summary.
- **Wikipedia, "Who was Ada Lovelace?"** The model read the article but **misquoted** it.
  - Its quote kept the article's first sentence up to "an English mathematician and", then finished with "computer programmer", taken from the article's third sentence.
  - The article says "and writer chiefly known for work on Charles Babbage's proposed mechanical general-purpose computer".
  - **Quotes not found** was correct, and the answer's claim of "the first person to be awarded a patent" is not in the article.
  - The owner, comparing the two sentences, first read them as identical.

So the app now shows, for a quote that is close but not word for word, the **closest passage** in the source as a word-level diff: words only in the source are highlighted, words only in the quote are struck out. The case is a unit test with the article's real first paragraph. The **Quotes found** text now says "in the source it cites" instead of "in your documents".

**Third live checks, with the closest passage.** Three questions, with the Papyrus PDF added and both sources ticked:
- **"How to create an activity diagram?"** The model **skipped the PDF**. It searched and read Wikipedia's "Activity diagram" article and gave a generic UML answer, supported by one real but thin quote ("diamonds represent decisions;"). The prompt asks for the user's documents first; Qwen3.5-2B did not follow it.
- **"Who was Ada Lovelace?"**
  - The first misquote got a useful diff: "writer chiefly known for…" in the source against "computer programmer" in the quote.
  - Two further "quotes" were mostly invented ("Algorithm No. 62", a "Charles Babbage Medal … in 1936"). The closest-passage matcher still found passages sharing common words such as "the", "computer" and "Babbage", and showed a meaningless word mix.
- **"How does LLM think?"**
  - One of three quotes failed, but the label read **Quotes found: Every quote below is word for word**. An answer is marked verified when *any* quote checks out.
  - Another quote ended mid-word ("…can sometimes match hum…", from a cut-off search snippet) and passed, because "hum" is inside "human".

Fixes (harness 0.8.0):
- **Documents first.** When the user has documents, Wikipedia and OpenAlex searches become available only after the model has searched the documents. This is enforced through the schema, like the ID limit.
- **Closest passage only for mostly real quotes:** at least 70% of the quote's words must match one passage in order.
- **Honest partial label:** **Some quotes not found (2 of 3 found)**.
- **Whole-word matching** for quotes.

Each case is a unit test, using the article lead the owner pasted (`tests/fixtures/ada-lovelace-lead.txt`). The full Qwen3.5-4B benchmark (harness 0.8.0) is unchanged task for task: research 19/22, refusals 11/11, PDF 3/4.

**Fourth live checks, after harness 0.8.0.**
- **"Who was Ada Lovelace?"** Worked as designed.
  - The misquote got its closest-passage diff, and a second quote from the "Ada Lovelace Award" article checked out.
  - The label read **Some quotes not found (1 of 2 found)**.
  - An invented paper title ("On the Analytical Engine") was not backed by any quote.
- **"How does LLM think?"** Worked as designed: **2 of 4 found**, and both failures were real misquotes.
  - The model never read the OpenAlex paper. It took the snippet cut at "…can sometimes match hum…" and finished it as "human-level performance on tasks requiring analogical reasoning"; the abstract says "…match humans in analogical reasoning".
  - Whole-word matching caught it.
- **"How to create an activity diagram?"** Not enough.
  - The trace now began with a search of the PDF, as required, but the model then went to Wikipedia without reading the PDF.
  - The answer was correct for UML in general, with both quotes checking out, but not the Papyrus-specific answer the PDF gives.

Fixes (harness 0.9.0):
- **Read the documents first.** Wikipedia and OpenAlex searches become available once the model has *read* one of the user's documents, or when searching the documents found nothing, so questions the documents do not cover still reach the open sources.
- **Complete snippets.** OpenAlex snippets end at a sentence end, marked "[…]", instead of mid-word after 240 characters. The prompt, with open sources only, says snippets can be cut off and to quote only complete text. A "[…]" at the edge of a quote is ignored by the check.

Both cases are unit tests. The full Qwen3.5-4B benchmark (harness 0.9.0) is unchanged task for task: research 19/22, refusals 11/11, PDF 3/4.

**Fifth live checks, after harness 0.9.0.** All three questions now behave as designed.
- **"How to create an activity diagram?"** Fixed.
  - The model searched the PDF four times with small rewordings, then read it (the repeat guard moved it on), and never went to Wikipedia.
  - The answer gave the five Papyrus steps from slides 3–5, with a verified quote. The quote was long: it spans three slides, including the repeated "Papyrus | © 2011…" footer, but it is genuine.
- **"Who was Ada Lovelace?"** As before: **1 of 2 found**, with the misquote's closest passage shown. Invented details ("Algorithm A", a paper titled "On the Analytical Engine") have no quote behind them.
- **"How does LLM think?"** The model read Wikipedia's "Large language model" article, and its one quote is real.
  - But the quote is the article's paragraph on mental-health uses. It supports only a side remark about hallucinations and stigma, not the main claims ("statistical models that predict the next token", "lack true reasoning").
  - **Quotes found** with "Check that the quotes support the whole answer" is accurate, but a reader could take it as more than it is.

**Sixth live check, on the preview site (harness 0.9.0).** "How to create an activity diagram?", with the Papyrus PDF added and Wikipedia ticked.
- The answer was right: the five Papyrus steps, with a verified quote.
- But the model searched the PDF five times, the last two identical, before reading it: 5 of its 8 steps.
- It then stopped without searching Wikipedia. That was allowed, since the PDF answered, but the owner had ticked Wikipedia expecting it to be checked too, for example for what an activity diagram is in general.

Fixes (harness 0.10.0):
- **Read before searching again.** After a search finds results, that search tool is offered again only once the model has read something. A search that found nothing can still be reworded.
- **Every ticked source is searched.** With Wikipedia or OpenAlex ticked, `final_answer` becomes available only once each of them has been searched, after the user's documents as before. A source that cannot be reached counts as searched.
- **Combined answers.** The prompt asks the model to prefer the user's documents for what is specific to them, use the other sources for background and for what the documents do not cover, and say when sources disagree.
- **More steps with open sources:** 8 calls, plus 2 for each ticked source.
- **Said when it matters.** While a ticked source is still unsearched, the result of reading a document (or of a document search that found nothing) ends with "Before you answer, also search Wikipedia". Without it, Qwen3.5-2B could not answer and did not know why, and read the PDF part after part until it ran out of steps.

The full Qwen3.5-4B benchmark (harness 0.10.0) is unchanged task for task: research 19/22, refusals 11/11, PDF 3/4, valid actions 100%. It took 108 model calls for the 34 research, refusal and PDF tasks, against 122 with 0.9.0.

Checked in the container with the Papyrus PDF's text and Wikipedia ticked. Wikipedia was mocked, with the API's real response shapes and the "Activity diagram" article's opening, because the container's network blocks it:
- **Qwen3.5-4B**
  - "How to create an activity diagram?": the Papyrus steps plus Wikipedia's definition. All six quotes verified, 78 s.
  - "What is an activity diagram, and how do I create one in Papyrus?": the definition and the steps. One quote was Wikipedia's sentence cited as the PDF, and the check caught it: **3 of 4 found**, 72 s.
- **Qwen3.5-2B**
  - "How to create an activity diagram?": the Papyrus steps with a verified quote, 27 s. It searched Wikipedia but did not use it.
  - The combined question: only Wikipedia's definition, without the Papyrus steps. Small models combine sources poorly.
  - A reminder to combine after the Wikipedia search made it worse: Qwen3.5-2B then answered both questions from the snippet alone. So it is not included.

**Seventh live check, on the preview site (harness 0.10.0).** "How to create an activity diagram?" with Qwen3.5-2B, the Papyrus PDF, Wikipedia and OpenAlex.
- The new order worked: one PDF search, a read, then a Wikipedia search and an OpenAlex search.
- Then six replies in a row were "not a valid action". Reproduced in the container, with five results from each source: the final answer, full of quotes, hit the 512-token reply limit and was cut off. Told only "not a valid action", the model wrote the same answer again each time. The last-step notice finally produced a short answer.
- Its one quote failed, although every word is in the slide: the PDF has "– Using the creation wizard" and the model wrote "• Using". The closest-passage view showed no difference, because it compares words only.

Fixes (harness 0.11.0):
- **Cut-off replies are named.** A reply that reaches the token limit gets "Your reply was cut off because it was too long. Reply again, shorter: a brief answer and only the few quotes that support it most". In the reproduction, the next reply was a valid answer with two of three quotes verified, the third being a real misquote ("Select the UML language" for "Select UML language").
- **List markers are ignored** in quote matching, when they stand alone: "•", "–", "-" and similar. Re-checking the 24 quotes of the 0.10.0 benchmark report gives the same result for each.

**Eighth live check, on the preview site (harness 0.11.0).** The same question and sources, with Qwen3.5-2B.
- One "not a valid action", then a short answer: the cut-off notice worked.
- But the short answer had lost steps that earlier, longer answers had ("Fill the project name", "Select UML language"). The owner asked: what if the long answer was correct? A cut-off reply is unusable, but asking for a shorter one throws content away without knowing whether it was right.
- Its one quote failed for a real reason: it left out "– Using the creation wizard :" from the middle of the slide text.
- The closest-passage view showed "Choose • Papyrus Project »", pairing the quote's "«" with the source's "•", since neither has letters.

Fixes (harness 0.12.0):
- **More room, not less content.** A reply cut off at 512 tokens is retried with 1,024, asking for the same answer with one-sentence quotes. Older tool results are dropped to make room. Only a second cut-off asks for a shorter answer. On the class 1 laptop, 1,024 tokens from Qwen3.5-2B take about two minutes.
- **One-sentence quotes** are asked for in the prompt when open sources are ticked, since long quotes are what fill the reply.
- **The trace says why.** "The model's reply was cut off at the length limit; asking again with more room". Other invalid replies show their reason.
- **The diff no longer pairs different symbols.** For the owner's quote it now marks exactly the missing "– Using the creation wizard :".

Checked in the container, with Wikipedia and OpenAlex mocked (five results each):
- **Qwen3.5-2B:** cut off once, then the full answer within 1,024 tokens. Its first section is the Papyrus project steps from the PDF. The six sections after it ("Click on the "Activity" icon…", "Save the diagram") are invented, each with an invented quote. All seven quotes failed, and the label was **Quotes not found**. So here the long answer was not correct. With more room the model showed that, and the check flagged it, instead of the answer being cut short to something that looked better.
- **Qwen3.5-4B:** no cut-off. Seven steps, all from the PDF, 161 s. Two quotes verified; the third joined lines from two slides and failed correctly.

**Ninth and tenth live checks, on the preview site (harness 0.12.0).** "What is an activity diagram and how to create it?", with the Papyrus PDF, Wikipedia and OpenAlex, on the class 1 laptop.
- **Qwen3.5-2B** answered only the first half, quoting two OpenAlex abstracts. Both quotes are real, but they say only that activity diagrams are part of UML. The definition sentence came from Wikipedia's snippet, uncited. The "how to create" half was dropped, although the model had read the PDF. This is the same limit seen in the container: the 2B model combines sources poorly.
- **Qwen3.5-4B** answered both halves: Wikipedia's definition and the Papyrus steps, with three, then five, verified quotes over two runs. One sentence per run had no quote behind it, the first slightly wrong: activity diagrams model "state transitions", which is what state machine diagrams do.
  - Model test: 5.5 tokens/s, against 8.4 for the 2B model. Self-check 52 s.
  - The question took about 7 minutes; the model test had estimated "up to 7.3 min".
- **OpenAlex answered HTTP 429** once, after a day of testing: it limits how often anonymous users may search. The answer continued from the other sources as designed. The warning now says "OpenAlex is busy (too many requests). Try again in a few minutes.", and the search's step ends with ": failed" instead of stopping mid-sentence.
- **Recommendation for class 1:**
  - Qwen3.5-2B for quick questions one document answers;
  - Qwen3.5-4B for questions that need several sources, or when accuracy matters more than speed.
  - The user guide gives both, with these timings and how to switch. The device step's advice is unchanged: it recommends the local server for this laptop.

**Known limit: real quotes that do not support the answer.** The evidence check proves that quotes exist in their sources, not that they support each sentence of the answer. Small models often add claims from memory next to real quotes. A candidate for M2 is to compare each answer sentence with the quotes and mark sentences that no quote shares much with. This is a heuristic, not a proof.

**Built ahead of M2 ([issue #31](https://github.com/bowo-prasetyo/kovrune/issues/31)).** Each answer sentence with at least three content words is compared with the verified quotes. It counts as backed when at least half of its words appear in them. Words from the cited documents' titles are left out of the count: they name what the quotes are about, but they do not back a claim. Sentences that are not backed are marked ⚠. When every quote is found but some sentences are not backed, the label reads, for example, **1 of 3 sentences backed by a quote** instead of **Quotes found**.
- The live cases are unit tests: the fifth check's next-token claims, the Ada Lovelace checks' "Algorithm No. 62" and Babbage Medal, and the ninth check's "state transitions" are marked, and the sentences their quotes do back are not.
- On the recorded Qwen3.5-4B benchmark answers (`slice2-qwen3.5-4b-q4km.json` and `slice2-fix-qwen3.5-4b-q4km.json`), no sentence of a verified answer is marked. Benchmark scoring is unchanged: the marks only change what the app shows.

**False reassurance rate ([issue #32](https://github.com/bowo-prasetyo/kovrune/issues/32)).** This tracks how often an answer labelled **Quotes found** is wrong or only partly right. The target is under 10% on Qwen3.5-4B ([design §1.6](design.md#16-success-metrics)).
- **Benchmark:** from harness 0.13.0, reports count the answers labelled **Quotes found** and how many of them failed their task.
- **Baseline:** recomputed from the last recorded Qwen3.5-4B report (`slice2-fix-qwen3.5-4b-q4km.json`, harness 0.6.0), with the 0.13.0 label rule. It is **3 of 22, 14%**, above the target. The three are failures listed under slice 2:
  - r04 gives one of the two fixed versions;
  - r12 cites a related document;
  - r19 names the wrong library after a correction.
  Each has real quotes, and each sentence is backed by them, so neither check catches it.
- **Live checks and the usability test:** from now on, each write-up records how many answers labelled **Quotes found** were wrong or only partly right.

**Field suite ([issue #35](https://github.com/bowo-prasetyo/kovrune/issues/35)).** Since harness 0.10.0, prompt and guard changes have been driven by three live questions, and the synthetic research set no longer shows the behaviour being tuned: every change from 0.7.0 on left it unchanged task for task.
- **The suite:** harness 0.14.0 adds a `field` suite: 24 questions over four real documents that may be committed (the user guide, the design document as an 18-page PDF, the MPL-2.0 text and Wikipedia's Ada Lovelace lead). Usability testers' documents can be added locally in `eval/field/local/` ([`eval/field/README.md`](../eval/field/README.md)).
- **The rule:** from now on, a prompt or guard change must improve the field suite without regressing the research, unanswerable and pdf suites, on Qwen3.5-2B and Qwen3.5-4B.
- **First results** ([`eval/field/README.md`](../eval/field/README.md#results)), run on CPU in a cloud container with the class 1 model files, constrained mode:
  - **Field suite:** Qwen3.5-2B 15/24 and Qwen3.5-4B 19/24 on harness 0.14.0.
  - **Main failure:** a nearby wrong fact with a real quote, such as the licence's 60-day reinstatement period given as its 30-day cure period. The app labels most of these **Quotes found**.
  - **Weakest kind:** questions that need two documents. Both models fail both of them.
- **First change judged on it** (harness 0.15.0): quote matching ignores Markdown emphasis and code marks. Two right answers had failed only because the source said "**Apps on device**" and "**Quotes found**", and the models quoted them without the asterisks.
  - **Result:** the field suite rises to 17/24 (2B) and 20/24 (4B). Research, unanswerable and pdf results are unchanged, and every task took the same actions as before.
  - **Side effect:** one wrong 2B answer now has a found quote and counts as false reassurance.

**Preview site.** To make the remaining checks easier, the app is now published to <https://bowo-prasetyo.github.io/kovrune/> by a GitHub Actions workflow (`.github/workflows/pages.yml`) on every push to `main`, after the tests pass. Testers need only Chrome or Edge; a footer shows the commit the page was built from and says it is not yet a signed release. Signed, reproducible releases and a content security policy remain M2 work.
- The browser path and the open sources work from the preview unchanged: WebLLM needs HTTPS, which Pages provides, and Wikipedia and OpenAlex accept requests from any site.
- The local-server path goes from a public HTTPS page to `http://127.0.0.1`. llama.cpp's CORS default allows it; Ollama needs the site in `OLLAMA_ORIGINS`.
- **Checked on the class 1 laptop (Chrome).**
  - The first **Connect** failed. The console showed "Permission was denied for this request to access the `loopback` address space", and the app only said it couldn't reach the server.
  - Allowing **Local network access** did not help: that permission covers other devices on the network.
  - Allowing **Apps on device** ("Access other apps and services on this device") alone fixed it, and the app connected and listed the model.
  - The app now checks this permission when a connection from the public site fails, and names **Apps on device** in its message. The user guide's troubleshooting table has the console error.
  - The site also has an icon now, which ends a harmless `favicon.ico` 404.

Still open for the slice: run the usability test (owner), using [`usability-test.md`](usability-test.md) and the invitation in [`tester-invitation.md`](tester-invitation.md). Wikipedia and OpenAlex are confirmed working live.

## Acceptance

M1 is done when:

1. **Local server, class 1:** a new user on the class 1 laptop with llama.cpp server gets a cited, verified answer to a question about their own PDF, with time to first answer under 15 minutes including setup.
2. **Browser, class 2:** the same works in the browser on a class 2 machine. If the class 2 gate failed, this becomes "the device advisor recommends the local server", and the design is updated.
3. **Evaluation (Qwen3.5-4B, constrained):**
   - original research set ≥ 73%;
   - unanswerable set ≥ 2/3 correct refusals;
   - valid actions ≥ 95%;
   - every answer judged correct includes a verified quote.
4. **No hosted inference** in any path, verified by the app's network requests: only model downloads (Hugging Face weights, and WebLLM's compiled model libraries from GitHub), the configured local server, Wikipedia and OpenAlex.
5. **Usability:** at least 3 of 5 test users complete setup and one research task without help.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Class 2 gate fails or no tester is found | Medium | Browser path limited to lighter tasks | Local server is the main path from slice 1; the advisor already handles it |
| The 4,096-token context limits long documents | High | Missed evidence | Chunking and search send only relevant passages; show which passages were used |
| 73% research accuracy limits trust | High | Users distrust answers | Evidence check, visible quotes, "unverified" labels |
| Evidence check makes small models refuse too often | Medium | Lower success rate | Measure both success and refusals; tune the prompt and quote rules in slice 2 |
| PDF extraction quality varies (columns, tables) | Medium | Wrong or missing text | Show extracted text preview; test with real papers in slice 2 |
| Two-person team: review and testing are the bottleneck | Medium | Slower slices | Small PRs, scripted test steps, cloud runs for anything not needing the laptop |

## Roles

- **Owner:** decisions, PR review and merge, testing on the class 1 laptop, recruiting a class 2 tester and usability testers, promoting issue #9, and the optional [Circles interviews](circles-interviews.md) after usability sessions.
- **Claude:** implementation, tests, native benchmark runs in the cloud, documentation, PRs, and monitoring issue #9.
