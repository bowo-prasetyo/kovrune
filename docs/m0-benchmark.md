# M0 Benchmark Gate

M0 decides whether models small enough to run in a browser can do Kovrune's agent work well enough to be the primary path (see [design §12](design.md#12-roadmap)). This document defines the evaluation set, the procedure, the go/no-go thresholds, and where results are recorded.

## M0 status

**Decision: provisional go (browser-first, with the local-server path as a first-class option).** Quality and native speed are measured; browser speed on class 2 is estimated, not yet measured. The provisional go becomes final, or is reversed, after the [class 2 confirmation run](#class-2-confirmation-run) early in M1.

| Question | Answer so far | Evidence |
| --- | --- | --- |
| **Quality:** can a browser-sized model do the tasks? | **Yes, with Qwen3.5-4B** (research 73%, coding 67%, 100% valid actions). Qwen3.5-2B is one task short (59%). | [Quality results](#quality-native-runs) |
| **Native speed:** is it fast enough outside the browser? | **Yes, even on class 1.** Qwen3.5-2B on an 8 GB laptop through llama.cpp server: 10.6 tokens/s, 20 s median research task. | [Field notes](#field-notes-not-gate-results) |
| **Browser speed:** is it fast enough in the browser on class 2? | **Expected yes, not measured.** Estimated 13–25 tokens/s on 16 GB Apple Silicon and more on mid-range GPUs, against a gate of 10. Needs a WebLLM run of `Qwen3.5-4B-q4f16_1-MLC` on a class 2 machine. | [Browser speed estimate](#browser-speed-estimate-class-2) |

Two cross-cutting findings so far:

- **The browser build is the bottleneck on class 1.** On the same laptop and model file, native llama.cpp generated about 7× faster than wllama in the browser, and finished a research task in about 20 s instead of 770 s. M1 should treat the local-server path as a primary option for machines like this, not an extra.
- **No candidate refuses unanswerable questions reliably** (1 correct refusal out of 9 across three models). M1 needs an explicit mitigation rather than relying on the model.

## What is measured

For each model, runtime, and hardware class:

| Metric | Definition |
| --- | --- |
| Task success | Share of tasks whose objective checks all pass (below) |
| Valid action rate | Share of model calls that produced a valid JSON tool action |
| Decode speed | Completion tokens per second of generation time after the first token |
| Prefill speed | Prompt tokens per second of time-to-first-token. Includes prompt-cache effects, so it is an *effective* rate |
| Median task time | Median wall-clock seconds per task, including tool execution |

Each suite runs in two modes:

- **Constrained:** the action's JSON Schema is passed to the runtime (WebLLM `response_format` with XGrammar, wllama/llama.cpp `json_schema`, OpenAI-compatible `json_schema`), so decoding cannot produce an invalid action.
- **Unconstrained:** the model writes free text; the harness extracts and validates JSON, and sends invalid replies back with the error.

Comparing the two shows how much constrained decoding matters for each model ([design §3.3](design.md#33-common-model-interface)).

## Evaluation set

34 tasks in [`eval/tasks/`](../eval/tasks/), all scored without a model judge. Harness 0.5.0 (M1 slice 2) adds 12 more in two new suites, for 46 in total; see [M1 additions](#m1-additions-harness-050).

### Research: 22 tasks

The agent answers questions using `search`, `read`, and `final_answer` over a fixed set of 14 documents ([`corpus.ts`](../eval/tasks/corpus.ts)). **Every project, person, and number in the corpus is fictional**, so models cannot answer from memory. Some documents are deliberately superseded by later ones.

| Kind | Count | What it tests |
| --- | --- | --- |
| Lookup | 9 | Find and report a single fact |
| Multi-hop | 5 | Combine facts across documents |
| Comparison | 2 | Report and compare figures from two sources |
| Contradiction | 3 | Prefer a later correction over an earlier claim |
| Unanswerable | 3 | Report `found: false` instead of inventing an answer |

A research task passes when the agent finishes, reports `found` correctly, includes every required fact (any accepted spelling), cites at least one acceptable document for each required source, and cites no document that does not exist. From harness 0.5.0, citations are evidence items `{docId, quote}`, and an answerable task also needs every quote to be found word for word in its document (the app's **Verified** status).

### M1 additions (harness 0.5.0)

| Suite | Tasks | What it tests |
| --- | --- | --- |
| `unanswerable` | 8 | Questions about the same corpus that it does not answer; the agent must report `found: false`. With the original 3, refusals are measured on 11 questions |
| `pdf` | 4 | Questions over two PDFs in [`eval/tasks/pdfs/`](../eval/tasks/pdfs/), extracted with pdf.js as the app does. The annual report is long enough to be split into chunks; one task also needs a corpus document |

The PDFs are generated from [`pdf-sources.ts`](../eval/tasks/pdf-sources.ts) by `node eval/tasks/make-pdfs.ts`; `npm test` checks the committed files are current and extract word for word. Reports keep each suite on its own line, so the original 22 research tasks stay comparable with M0 runs (allowing for the evidence requirement).

### Coding: 12 tasks

Nine "implement" and three "fix the bug" tasks in plain JavaScript ([`coding.ts`](../eval/tasks/coding.ts)). The agent can call `run_tests` on the visible tests before submitting with `final_answer`. A task passes when the submission passes all visible **and hidden** tests, run in a worker with a timeout.

The harness sandbox is not a security boundary; it only runs code the model under test wrote for these fixed tasks. The real sandbox is milestone M2.5.

### Validating the set

`npm test` checks that every coding task is solvable (a reference solution passes all its tests), every bug-fix starter fails at least one test, and every required research fact appears in an acceptable cited document.

### Known limits

- Fact checks are substring matches, so an answer that mentions the right value in the wrong role can still pass. Required citations and the number of fact groups per task reduce this, but results should be read alongside the recorded action traces.
- Agent budgets are fixed: 8 calls and 512 output tokens per call for research (256 before harness 0.6.0); 6 calls and 768 tokens for coding.
- 34 tasks give a coarse signal (one task is about 4.5 percentage points of research success). Treat differences under about 10 points as noise.

## Candidate models

From [`eval/candidates.ts`](../eval/candidates.ts). Memory and size figures come from the runtimes' own metadata.

| Runtime | Model | Download / VRAM | License |
| --- | --- | --- | --- |
| WebLLM | Qwen3.5-2B-q4f16_1-MLC | ~2.2 GB VRAM | Apache-2.0 |
| WebLLM | Llama-3.2-3B-Instruct-q4f16_1-MLC | ~2.3 GB VRAM | Llama 3.2 |
| WebLLM | Qwen3-4B-q4f16_1-MLC | ~3.4 GB VRAM | Apache-2.0 |
| WebLLM | Phi-3.5-mini-instruct-q4f16_1-MLC | ~3.7 GB VRAM | MIT |
| WebLLM | Qwen3.5-4B-q4f16_1-MLC | ~3.9 GB VRAM | Apache-2.0 |
| wllama | unsloth/Qwen3.5-2B-GGUF, Q4_K_M | 1.2 GB file | Apache-2.0 |
| wllama | bartowski/Llama-3.2-3B-Instruct-GGUF, Q4_K_M | 1.9 GB file | Llama 3.2 |
| Local endpoint | Any model on Ollama, LM Studio, or llama.cpp server | — | — |

Qwen3-family models run with thinking disabled, because the benchmark measures direct tool use within a small token budget.

Runtime constraints found while building the harness:

- **WebLLM prebuilt models use a 4,096-token context window.** The agent drops old tool results to stay within it.
- **wllama loads files of at most 2 GB.** Larger GGUF models must be split with `llama-gguf-split`, so 4B Q4_K_M files (about 2.4–2.6 GB) are not on the wllama list.
- **wllama downloads are pinned to a commit SHA.** WebLLM's prebuilt list (pinned by package version, 0.2.85) resolves weights from each repository's `main` branch, so WebLLM weight revisions are not yet pinned.

## Hardware classes

| Class | Description | Examples |
| --- | --- | --- |
| 1 | Laptop with integrated GPU, 8 GB RAM | Older Intel/AMD ultrabooks |
| 2 | 16 GB unified memory, or a mid-range discrete GPU | Apple M1–M4 with 16 GB; RTX 3060 / 4060 laptops |
| 3 | Desktop discrete GPU with 12 GB+ VRAM | RTX 3080 / 4070 Ti and above |

Use Chrome or Edge with WebGPU enabled, on mains power, with other heavy tabs and applications closed. Record the browser version and anything unusual in the notes field.

## Running the benchmark

```bash
npm ci
npm test                       # validates the evaluation set and harness
```

### In the browser (WebLLM or wllama)

```bash
npm run bench:browser          # dev server with cross-origin isolation headers
```

Open the printed URL, choose the runtime, candidate, hardware class and task set, and press **Run benchmark**. The model downloads once and is cached by the browser. When the run finishes, press **Download report** and save the JSON in `eval/results/`.

For automation, the page exposes `window.kovruneBench.run(options)`, which returns the report.

### Against a local model server

**Prefer llama.cpp server.** It applies the model's own chat template, and all native quality results so far use it. Ollama 0.40.10 with Qwen3.5 and thinking off repeated its first search on every call in a multi-step run, while llama.cpp server with the same model file on the same laptop did not (see [Field notes](#field-notes-not-gate-results)). The self-check now catches this.

```bash
# llama.cpp server, with thinking disabled for Qwen3 / Qwen3.5 models
llama-server -m Qwen3.5-2B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-2b --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --hardware-class 2 \
  --out eval/results/llamacpp-qwen3.5-2b-class2.json

# Ollama (thinking is turned off with reasoning_effort; check the self-check passes)
npm run bench:endpoint -- --base-url http://localhost:11434/v1 --model hf.co/unsloth/Qwen3.5-2B-GGUF:Q4_K_M \
  --context 4096 --extra-body '{"reasoning_effort":"none"}' --hardware-class 2 \
  --out eval/results/ollama-qwen3.5-2b-class2.json
```

Notes for Ollama: set `OLLAMA_CONTEXT_LENGTH=4096` and `OLLAMA_NUM_PARALLEL=1` for the service. Without `reasoning_effort`, Qwen3.5 thinks first, and Ollama returns the thinking separately with an empty answer until it finishes, which the harness sees as invalid replies. In WSL, give WSL enough memory (`memory=6GB` in `.wslconfig` on an 8 GB machine); with the default of half the RAM, Ollama was killed by the out-of-memory killer during coding tasks.

Options: `--preset full|quick`, `--suites research,unanswerable,pdf,coding` (the default), `--modes constrained,unconstrained`, `--tasks r01-lumen-maintainer,c01-slugify`, `--ignore-self-check`, `--notes "..."`. Press Ctrl+C to stop early; the report still includes the completed tasks.

### What happens during a run

1. **Self-check.** After loading, two short calls check the setup before any task runs, in about a minute even on slow hardware:
   1. The model must reply to a research question with a valid action. This also warms the runtime up.
   2. Given a search result that names the right document, the model must read it or answer, not search again. This catches servers that mishandle multi-step tool conversations.

   Speed is measured on the second, warm call, along with the worst-case time for one research task. If either step fails, the run does not start, and the log shows the model's raw output and a hint. Tick **Run even if the self-check fails** (or pass `--ignore-self-check`) to run anyway.
2. **Live progress.** Every model call is logged as it finishes, with its action (or, for an invalid reply, the error and the start of the output), time and speed. For example: `call 2: search {"query":"LumenDB license"} (14.2 s, 3.1 tok/s)`.
3. **Stopping early.** **Stop** (or Ctrl+C) discards only the task in progress. The report is still produced and downloadable, marked as stopped early (`"complete": false`).

### Task sets

| Set | Tasks | Use |
| --- | --- | --- |
| Full | All 46 (34 before harness 0.5.0) | Gate results. Only a complete full run of all suites can pass the gate. |
| Quick | 8: `r01`, `r03`, `r10`, `r16`, `r17`, `r20`, `c01`, `c03` | First checks and slow machines. Covers every task kind; not enough for the gate. |

On slow machines, start with the Quick set in constrained mode only. Use the self-check's time estimate to decide whether a full run is practical.

### Troubleshooting

| Symptom | Likely cause | What to try |
| --- | --- | --- |
| Self-check fails with garbled or empty output (wllama) | WebGPU produces broken output on some integrated GPUs | Set **GPU layers** to 0 to run on the CPU |
| WebLLM model fails to load; Environment shows `"shaderF16": false` | The GPU lacks 16-bit shader support, which `q4f16` models need | Use the wllama runtime |
| Self-check step 2 fails: "not acting on tool results" | The server mishandles multi-step conversations for this model (seen with Ollama 0.40.10 and Qwen3.5, thinking off) | Use llama.cpp server with the same model file |
| Self-check fails with "no JSON object found" or a cut-off reply | A thinking model is thinking first and runs out of tokens | Turn thinking off: `chat_template_kwargs` for llama.cpp, `reasoning_effort: "none"` for Ollama |
| `fetch failed` partway through a run | The model server stopped, often killed for lack of memory | Check the server log (for Ollama: `journalctl -u ollama`); give it more memory |
| Every call is valid but tasks hit the call limit (8/8), and the self-check passed | The model searches or re-runs tests repeatedly without answering | A model quality result; record it |
| Calls take minutes each | Hardware below the model's needs | Try a smaller model or the Quick set, and record the speed |

## Go/no-go gate

A **single run** passes the gate when, in constrained mode:

| Criterion | Threshold |
| --- | --- |
| Complete run of the full evaluation set | All 46 tasks, all four suites, not stopped early (34 tasks and two suites before harness 0.5.0) |
| Research task success | ≥ 60% |
| Valid action rate (all suites) | ≥ 95% |
| Decode speed | ≥ 10 tokens/s |
| Median research task time | ≤ 60 s |

The harness evaluates these automatically and includes the result in every report (`gate`).

**Two questions, answered in order.** The gate mixes a quality question and a speed question, and only speed depends on the hardware:

1. **Quality:** can a browser-sized model do the tasks at all? The same model file gives the same answers on any machine, so this is measured with **native runs**: the same GGUF files served by llama.cpp on whatever hardware is available, through `bench:endpoint`. Only research success and valid action rate count; speed figures from these runs are ignored.
2. **Speed:** is a model that passes on quality fast enough in the browser on class 2 hardware? This needs a WebLLM or wllama run on a class 2 machine.

If no candidate passes on quality, M0 is a no-go for browser-first without needing class 2 runs.

**M0 decision:**

- **Go (browser-first):** at least one WebLLM or wllama candidate passes the gate on **hardware class 2**. That model becomes the default catalog model for M1.
- **No-go (endpoint-first):** no browser candidate passes on class 2. The local endpoint adapter becomes the primary path for agent work in M1; the browser runtime is positioned for lighter tasks (single-step Q&A, embeddings), and the roadmap is adjusted.

Either way, class 1 and class 3 results set the minimum and recommended hardware published with M1.

### Provisional go

With only class 1 hardware available to the project, M0 records a **provisional go**: quality and native speed pass, and browser speed on class 2 is expected to pass on the estimate below. M1 planning proceeds on that basis, with these conditions:

- **The local-server adapter stays a first-class path in M1** whatever the class 2 result, because class 1 machines need it.
- **The class 2 confirmation run is a gating check in M1's first two weeks.** If it fails, M0 becomes a no-go for browser-first and M1 switches to endpoint-first as described above.
- **Unanswerable questions need a mitigation in M1** regardless of runtime.

### Browser speed estimate (class 2)

This is arithmetic, not a measurement. Generating each token reads all model weights once, so decode speed is limited by memory bandwidth. `Qwen3.5-4B-q4f16_1-MLC` has about 2.5 GB of weights. The WebLLM authors report that WebLLM retains up to about 80% of native performance ([WebLLM paper, arXiv:2412.15803](https://arxiv.org/abs/2412.15803)); the estimate assumes 50–60% of the bandwidth ceiling to leave margin.

| Class 2 example | Memory bandwidth | Ceiling | Estimate | Gate (≥ 10 tok/s) |
| --- | --- | --- | --- | --- |
| Apple M1, 16 GB | ~68 GB/s | ~27 tok/s | ~13–16 tok/s | Pass, thin margin |
| Apple M2 / M3, 16 GB | ~100 GB/s | ~40 tok/s | ~20–25 tok/s | Pass |
| Laptop RTX 4060, 8 GB | ~256 GB/s | ~100 tok/s | ~50 tok/s or more | Pass |

Prompt processing on a GPU usually runs at hundreds of tokens per second, and native runs finished research tasks in 2–4 calls, so a median research task of about 20–40 s is expected against the 60 s limit.

What the estimate cannot rule out:

- **WebGPU driver problems.** WebGPU produced broken output on the class 1 laptop's Intel GPU (through wllama).
- **The thin margin on the slowest class 2 machines.** A 30% error moves a base M1 below the gate.
- **Graphics memory.** The model needs about 3.9 GB; GPUs with 4–6 GB are borderline.
- **Quality of the WebLLM quantization.** WebLLM uses q4f16, not the Q4_K_M GGUF files that passed the quality runs.

### Class 2 confirmation run

One run on one class 2 machine settles the open question:

- WebLLM, `Qwen3.5-4B-q4f16_1-MLC`, full task set, constrained mode, hardware class 2.
- About 1–2 hours including the 2.5 GB download.
- Submitted with the [benchmark result issue template](../.github/ISSUE_TEMPLATE/m0-benchmark-result.md).

The go becomes final if the run passes the gate. If it fails on speed only, the model is retried on a faster class 2 machine before concluding; if it fails on quality, the q4f16 quantization is the suspect, and the next step is a WebLLM run of Qwen3.5-2B and a check of the quantization.

## Results

Reports live in [`eval/results/`](../eval/results/). Add new rows here when you commit a report.

### Quality (native runs)

Full evaluation set, harness 0.3.0. Each model is the same Q4_K_M GGUF file the browser candidates use, served by native llama.cpp (commit `6b9ba4f2`) on CPU in a 4-core cloud container, with a 4,096-token context to match the browser runtimes. Thinking is disabled. Speed figures from these runs are ignored.

| Model | Research (constrained) | Coding (constrained) | Valid actions (constrained) | Research (unconstrained) | Valid actions (unconstrained) | Quality criteria | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen3.5-2B | 13/22 (59%) | 4/12 (33%) | 100% research, 95.5% coding | 13/22 (59%) | 87% research, 38% coding | ❌ research 59% (needs 60%) | [json](../eval/results/native-qwen3.5-2b-q4km.json) |
| Llama-3.2-3B-Instruct | 7/22 (32%) | 3/12 (25%) | 100% | 4/22 (18%) | 83% research, 19% coding | ❌ | [json](../eval/results/native-llama-3.2-3b-q4km.json) |
| Qwen3.5-4B | **16/22 (73%)** | **8/12 (67%)** | 100% | 7/22 (32%) | 51% research, 50% coding | ✅ research 73%, valid actions 100% | [json](../eval/results/native-qwen3.5-4b-q4km.json) |

Constrained research results by task kind:

| Kind | Qwen3.5-2B | Llama-3.2-3B | Qwen3.5-4B |
| --- | --- | --- | --- |
| Lookup (9) | 7 | 3 | 8 |
| Multi-hop (5) | 2 | 2 | 4 |
| Comparison (2) | 2 | 1 | 2 |
| Contradiction (3) | 2 | 0 | 2 |
| Unanswerable (3) | 0 | 1 | 0 |

What these runs show:

- **Qwen3.5-4B passes the quality criteria** (research 73%, valid actions 100%) and is the only candidate that does. It also handles multi-hop questions (4/5) and coding (67%) far better than the 2B and 3B models.
- **Qwen3.5-2B is one task short** of the research threshold (59%), and coding is weak (33%).
- **Llama-3.2-3B is clearly weaker** than the smaller Qwen3.5-2B (research 32%).
- **No model handles unanswerable questions**: all three invented an answer for nearly every question the documents cannot answer (1 correct refusal out of 9). For a research tool this is the most serious quality gap, and the M1 agent needs a mitigation (for example, an explicit "evidence check" step before answering) rather than relying on the model.
- **Constrained decoding is essential.** Without it, valid action rates fall to 51–87% for research and 19–50% for coding. Qwen3.5-4B drops from 73% to 32% research success.

**Next step for the decision:** measure the speed of Qwen3.5-4B in the browser on class 2 hardware. It is available as `Qwen3.5-4B-q4f16_1-MLC` in WebLLM (about 3.9 GB of VRAM). It is not available through wllama, because its 2.6 GB GGUF file exceeds wllama's 2 GB file limit. WebLLM uses a different 4-bit quantization (q4f16_1) from these GGUF runs, so the class 2 run should include the full set to confirm quality holds.

### Speed (browser runs on reference hardware)

| Model | Runtime | Class | Research (constrained) | Coding (constrained) | Valid actions | Decode tok/s | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| *Reference-hardware runs pending* | | | | | | | |

### Field notes (not gate results)

**Class 1 laptop: Intel Core i5-8250U (4 cores, 8 threads), Intel UHD Graphics 620 (Gen 9, reports `shader-f16`), 8 GB RAM, Windows.** Model: wllama with `unsloth/Qwen3.5-2B-GGUF` `Qwen3.5-2B-Q4_K_M.gguf` at revision `f6d5376b`, 4,096-token context, constrained mode, harness 0.1.0.

| Run | Browser | Tasks | Valid actions | Result | Decode tok/s | Prefill tok/s | Time per task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WebGPU (all GPU layers) | Chromium-based | First 3 research tasks (stopped) | 0/8 per task | 0/3 | — | — | about 1,200 s |
| CPU only (GPU layers = 0) | Edge 155 | `r01-lumen-maintainer` | 8/8 | 0/1, call limit reached | 1.6 | 2.1 | 770 s |

What these runs show:

- **WebGPU output is broken on this GPU.** The same model and file produced valid constrained actions on CPU, both on this laptop and in the cloud container. The GPU reports `shader-f16`, so missing 16-bit support is not the cause. wllama must run CPU-only here. The self-check in harness 0.2.0 now catches this before a run starts.
- **Class 1 hardware is below the floor for browser agents.** On CPU, decode speed is about 6× below the gate (1.6 vs 10 tokens/s), and one research task took almost 13 minutes against a 60 s limit. Even an ideal three-call task would take several minutes. The model made only valid calls but never answered within the 8-call budget.
- **Prefill is unusually slow** (2.1 tokens/s), which suggests the WebAssembly build adds a large overhead on top of the hardware limit. The native runs below confirm it.

#### Same laptop, native runs (WSL, 6 GB memory, harness 0.3.0, Quick set, constrained)

Same model file (`Qwen3.5-2B-Q4_K_M.gguf`, SHA-256 `aaf42c8b…`), served natively instead of in the browser.

| Server | Thinking | Research | Coding | Valid actions | Decode tok/s | Median research task | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ollama 0.40.10 (WSL limited to 4 GB) | On | 2/6 | 0/2, server killed (out of memory) | 50% research | 21.3 (self-check) | 192 s | [json](../eval/results/ollama-qwen3.5-2b-class1-thinking-on.json) |
| Ollama 0.40.10 | Off (`reasoning_effort: none`) | 0/6, first search repeated 8 times | 1/2 | 100% | 9.7 | 49 s | [json](../eval/results/ollama-qwen3.5-2b-class1-thinking-off.json) |
| **llama.cpp server** | Off | **3/6** | 1/2 | 100% | **10.6** | **20 s** | [json](../eval/results/llamacpp-qwen3.5-2b-class1.json) |

What these runs show:

- **Running natively, this class 1 laptop meets the gate's speed criteria** (10.6 tokens/s, 20 s median research task). The same model in the browser managed 1.6 tokens/s and 770 s per task: the WebAssembly build, not the hardware, is the main bottleneck here.
- **Ollama's thinking-on run failed for setup reasons.** Thinking used up each reply's token budget, so the harness received empty answers, and the coding tasks failed when the out-of-memory killer stopped Ollama.
- **The thinking-off Ollama run is a server compatibility problem, not a model result.** Every research task repeated its first search until the call limit, while llama.cpp server with the same file behaved normally (2–4 calls per task). Ollama does keep conversation history in a simple two-turn test, so the problem is specific to longer tool conversations with this model. The two-step self-check in harness 0.4.0 catches it.
- **The model's own weak spots match the cloud runs.** It searched 8 times instead of saying "not found" on the unanswerable question, and re-ran the same broken code 6 times on `c01`, ignoring the repeat notice both times. M1's agent needs firmer guards for small models, such as forcing a final answer after repeated actions.
- **The old one-call self-check underestimated speed** (3.6 tokens/s against 10.6 during the run) because it measured the cold first call. Harness 0.4.0 measures a warm call.

These are Quick-set observations, not gate results: a gate result needs a complete full run.

### Harness smoke test (not a gate result)

To prove the browser path works end to end, the harness was run in headless Chromium on a 4-core cloud container with no GPU, using wllama and the 0.8B smoke-test model on two research tasks. The model loaded in 31 s, produced 100% valid actions under constrained decoding, and failed both tasks (0/2) at about 5 tokens/s, using the container's software-emulated WebGPU.

This confirms model download from a pinned revision, loading, constrained decoding, tool execution, scoring, and reporting. It says nothing about reference hardware: the container has no GPU, and the model is far below candidate size.

## Harness versions

Results are only comparable within a harness version (`harnessVersion` in each report).

| Version | Changes |
| --- | --- |
| 0.1.0 | Initial harness and evaluation set |
| 0.2.0 | Self-check after loading, live per-call logs, partial reports, quick preset, full-set gate criterion |
| 0.3.0 | Search matches word forms (light stemming) and picks snippets by term rarity; a repeated identical action gets a notice instead of a re-run; `run_tests` reports how many visible tests pass; console output from submitted code is discarded |
| 0.4.0 | Two-step self-check: a warm-up action, then a check that the model acts on a tool result; speed is measured on the warm call. Task scoring is unchanged from 0.3.0, so task results remain comparable |
| 0.5.0 | M1 slice 2. Research answers carry evidence quotes, and answerable tasks need every quote verified; a repeated action restricts the next call to `final_answer` (repeat guard); long documents are split into chunks; new `unanswerable` (8) and `pdf` (4) suites. Research results are stricter than 0.4.0, so compare them with care |
| 0.6.0 | After the first test on a user's own PDF. A repeated search removes only `search`, so the model can still read what it found instead of answering from snippets; a repeated read of a long document's part lists the other parts; a second repeat allows only `final_answer`. Research replies may use 512 tokens (was 256), so long answers with quotes are not cut off. Task sets are unchanged |
| 0.7.0 | Document IDs in `read` and in `final_answer` evidence are limited to IDs the task has seen (the documents and their parts, search results, fetched articles), through the constrained-decoding schema. A made-up ID is now an invalid action rather than a citation that fails the `citationsExist` check. Task sets are unchanged |
| 0.8.0 | Quotes must match on whole-word boundaries, so a quote cut mid-word no longer verifies. With open sources (not used in the evaluation), their searches become available only after the user's documents have been searched. Task sets are unchanged |
| 0.9.0 | A "[…]" at either end of a quote is ignored, like other edge punctuation (open-source snippets end with it). With open sources (not used in the evaluation), their searches become available only after a document has been read, or when searching the documents found nothing. Task sets are unchanged |
| 0.10.0 | A search that found results must be followed by a read before that search tool is offered again, so the model no longer spends its steps rewording searches. When no other tool is available, `final_answer` is. With open sources (not used in the evaluation), every ticked source must be searched before `final_answer`, the prompt asks for an answer that combines them, and each source adds two calls to the limit. Task sets are unchanged |
| 0.11.0 | Quote matching ignores list markers standing alone ("•", "–", "-" and similar), which models swap or drop when quoting slides. A reply cut off at the token limit gets a notice saying so and asking for a shorter answer, instead of the general "not a valid action". Re-checking every quote in the 0.10.0 report gives the same result, and the 0.10.0 run had no invalid replies, so results are comparable with 0.10.0 |
| 0.12.0 | A reply cut off at the token limit is retried with 1,024 tokens instead of 512, asking for the same answer with one-sentence quotes (older tool results make room). Only a second cut-off asks for a shorter answer. With open sources (not used in the evaluation), the prompt asks for one-sentence quotes. The closest-passage diff no longer pairs different symbols. The 0.10.0 run had no invalid replies, so results are comparable with 0.10.0 and 0.11.0 |
