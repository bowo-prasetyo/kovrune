# M1 Plan: Local Research Agent

| | |
| --- | --- |
| Status | Planned, starting October 2026 |
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
   - **Browser:** WebLLM with a two-model catalog: Qwen3.5-4B (default) and Qwen3.5-2B (lighter). It includes a compatibility check (WebGPU, `shader-f16`, estimated GPU memory) and download progress.
4. **Device advisor (D1).** It recommends the browser path when WebGPU is available, `shader-f16` is supported, and the adapter can fit the default model. Otherwise it recommends a local server. It never runs a model on WebGPU without the self-check passing.
5. **Research sources.** The user's documents (chunked and searched with the benchmark's search, stemming included), plus Wikipedia and OpenAlex, which allow browser requests. Each source records its URL and retrieval time.
6. **Trust features.**
   - **Evidence check.** `final_answer` must include, for each citation, a short verbatim quote. The app checks that each quote appears in the cited source (ignoring whitespace and case). If none verify, the answer is shown as **unverified**. The evidence step also gives the model an explicit "the sources do not contain the answer" path.
   - **Repeat guard.** After two identical actions, the next call allows only `final_answer`, enforced through the constrained-decoding schema.
   - **"Not found in your sources"** is a first-class result, not an error.
7. **Evaluation continuity.** The M0 evaluation set keeps running on the moved engine. M1 adds tasks for the new behaviour (below) and reports them separately, so M0 comparisons stay valid.

### Not in M1

| Item | Milestone |
| --- | --- |
| Saving tasks and documents between sessions (beyond settings) | M2 |
| Signed reproducible builds, CSP, hosting | M2 |
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

## Acceptance

M1 is done when:

1. **Local server, class 1:** a new user on the class 1 laptop with llama.cpp server gets a cited, verified answer to a question about their own PDF, with time to first answer under 15 minutes including setup.
2. **Browser, class 2:** the same works in the browser on a class 2 machine. If the class 2 gate failed, this becomes "the device advisor recommends the local server", and the design is updated.
3. **Evaluation (Qwen3.5-4B, constrained):**
   - original research set ≥ 73%;
   - unanswerable set ≥ 2/3 correct refusals;
   - valid actions ≥ 95%;
   - every answer judged correct includes a verified quote.
4. **No hosted inference** in any path, verified by the app's network requests: only Hugging Face model downloads, the configured local server, Wikipedia and OpenAlex.
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

- **Owner:** decisions, PR review and merge, testing on the class 1 laptop, recruiting a class 2 tester and usability testers, promoting issue #9.
- **Claude:** implementation, tests, native benchmark runs in the cloud, documentation, PRs, and monitoring issue #9.
