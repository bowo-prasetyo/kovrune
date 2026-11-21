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
| False reassurance (research suites) | Of the answers the app would label **Quotes found**, the share whose task fails. Reported per suite and over the constrained research suites, against the target in [design §1.6](design.md#16-success-metrics); not part of the gate. Added in harness 0.13.0 |

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
- **wllama downloads are pinned to a commit SHA.** WebLLM's prebuilt list (pinned by package version, 0.2.85) resolves weights from each repository's `main` branch, so WebLLM weight revisions are not yet pinned. Since M2 slice 1, the app's catalog models (Qwen3.5-4B and 2B) are pinned and checked, on the benchmark page too; the other WebLLM candidates are not ([design §3.4](design.md#34-catalog-entries-and-downloads)).

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

**For quality runs, build llama.cpp portably.** A build tuned to its CPU (`-DGGML_NATIVE=ON`, the default) gives other results on another CPU, and can stop with an illegal instruction there. Built as below, the same tasks gave the same results on two different CPUs, all 97 alike, so runs on different machines compare. Pass the build with `--build`; speeds still depend on the machine.

```bash
# A portable llama.cpp build: AVX2 and FMA, nothing tuned to this CPU
cmake -B build -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --target llama-server -j

# llama.cpp server, with thinking disabled for Qwen3 / Qwen3.5 models
llama-server -m Qwen3.5-2B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
npm run bench:endpoint -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-2b --context 4096 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --hardware-class 2 \
  --build "llama.cpp <commit>, -DGGML_NATIVE=OFF, AVX2" \
  --out eval/results/llamacpp-qwen3.5-2b-class2.json

# Ollama (thinking is turned off with reasoning_effort; check the self-check passes)
npm run bench:endpoint -- --base-url http://localhost:11434/v1 --model hf.co/unsloth/Qwen3.5-2B-GGUF:Q4_K_M \
  --context 4096 --extra-body '{"reasoning_effort":"none"}' --hardware-class 2 \
  --out eval/results/ollama-qwen3.5-2b-class2.json
```

Notes for Ollama: set `OLLAMA_CONTEXT_LENGTH=4096` and `OLLAMA_NUM_PARALLEL=1` for the service. Without `reasoning_effort`, Qwen3.5 thinks first, and Ollama returns the thinking separately with an empty answer until it finishes, which the harness sees as invalid replies. In WSL, give WSL enough memory (`memory=6GB` in `.wslconfig` on an 8 GB machine); with the default of half the RAM, Ollama was killed by the out-of-memory killer during coding tasks.

Options:
- **What runs:** `--preset full|quick`, `--suites research,unanswerable,pdf,coding` (the default; the field suites below are added by name), `--modes constrained,unconstrained`, `--tasks r01-lumen-maintainer,c01-slugify`, `--ignore-self-check`.
- **The server:** `--base-url`, `--model`, `--context` (default 4096), `--api-key`, `--extra-body '{...}'` (merged into every request), `--prompt-cache` (from harness 0.75.0 a run sends `cache_prompt: false`, so llama-server's prompt cache does not make a task's reply depend on the tasks before it; this flag keeps the cache, faster but [noisier to compare](../eval/field/README.md#the-prompt-cache-makes-a-task-depend-on-the-tasks-before-it)).
- **The record:** `--hardware-class 1|2|3|other`, `--build "..."` (the llama.cpp commit and flags, harness 0.31.0), `--notes "..."`, `--out <file>`.
- **Settings being measured,** off or at the app's value unless given ([`eval/field/README.md`](../eval/field/README.md)): `--fit-headroom <share>` (0.54.0), `--long-reply-room always|when-answering` (0.55.0), `--forced-read-passage` and `--as-source` (0.56.0).

Press Ctrl+C to stop early; the report still includes the completed tasks.

### What happens during a run

1. **Self-check.** After loading, two short calls check the setup before any task runs, in about a minute even on slow hardware:
   1. The model must reply to a research question with a valid action. This also warms the runtime up.
   2. Given a search result that names the right document, the model must read it or answer, not search again. This catches servers that mishandle multi-step tool conversations.
   3. Only for the experimental Qwen3.5-0.8B, and only if it repeated the same search in step 2: it gets the reply a research task gives to a repeated action, searching is no longer offered, and it must read a document the result lists or answer citing one. It repeats the search in step 2 every time, but research tasks never offer it a second search before it has read a result, and in them it repeated its first search in 1 of 160 ([A smaller model](#a-smaller-model-for-low-memory-devices-0650)).

   Speed is measured on the second, warm call, along with the worst-case time for one research task. If either step fails, the run does not start, and the log shows the model's raw output and a hint. Tick **Run even if the self-check fails** (or pass `--ignore-self-check`) to run anyway.
2. **Live progress.** Every model call is logged as it finishes, with its action (or, for an invalid reply, the error and the start of the output), time and speed. For example: `call 2: search {"query":"LumenDB license"} (14.2 s, 3.1 tok/s)`.
3. **Stopping early.** **Stop** (or Ctrl+C) discards only the task in progress. The report is still produced and downloadable, marked as stopped early (`"complete": false`).

### Task sets

| Set | Tasks | Use |
| --- | --- | --- |
| Full | All 46 (34 before harness 0.5.0) | Gate results. Only a complete full run of all suites can pass the gate. |
| Quick | 8: `r01`, `r03`, `r10`, `r16`, `r17`, `r20`, `c01`, `c03` | First checks and slow machines. Covers every task kind; not enough for the gate. |
| Field | `field` (89 questions over seven real documents, plus any local ones), `holdout` (37), `multi` (13, questions that need more than one passage), `multiholdout` (8), `office` (15, over Word, Excel and CSV files) and `officeholdout` (7), each named in `--suites` | Judging prompt and guard changes on real text; reported separately and not part of the gate. The held-out suites are read only as totals. See [`eval/field/README.md`](../eval/field/README.md). |

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

1. **Quality:** can a browser-sized model do the tasks at all? The same model file gives the same answers on any machine when llama.cpp is built portably (below; a CPU-tuned build does not, see [`eval/field/README.md`](../eval/field/README.md#runs-repeat-on-one-machine-not-across-machines)), so this is measured with **native runs**: the same GGUF files served by llama.cpp on whatever hardware is available, through `bench:endpoint`. Only research success and valid action rate count; speed figures from these runs are ignored.
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

### A smaller model for low-memory devices (0.65.0)

On an Android phone reporting 4 GB of memory (Arm Mali GPU), Qwen3.5-2B always failed near the end of loading. Qwen3.5-0.8B needs about 1.6 GB of GPU memory in the browser (0.4 GB download), so it fits. These runs measure what it costs in answer quality. Both models ran on the same 4-core cloud container, CPU only, with llama.cpp server, thinking off, 4,096-token context and constrained decoding, over the five research suites. Speeds are not representative of any hardware class.

| Suite | Qwen3.5-0.8B | Qwen3.5-2B |
| --- | --- | --- |
| research | 12/22 | 14/22 |
| unanswerable | 5/8 | 5/8 |
| pdf | 3/4 | 3/4 |
| field | 49/89 (55%) | 67/89 (75%) |
| holdout | 21/37 | 23/37 |
| Wrong under **Quotes found** | 9 of 43 (21%) | 4 of 59 (7%) |

Reports: [0.8B](../eval/results/small-qwen3.5-0.8b-q4km.json) (harness 0.64.0; a 0.62.0 run gave the same result on every task), [2B](../eval/results/small-qwen3.5-2b-q4km.json) (harness 0.62.0).

What these runs show:

- **0.8B is clearly weaker, and its labels are less trustworthy.** It fails 36 tasks that 2B passes and passes 14 that 2B fails. About 1 in 5 of its **Quotes found** answers is wrong, against 1 in 15 for 2B. So it is offered in the browser only as an experimental model: never selected first or shown as recommended, mentioned only on a device with too little memory for Qwen3.5-2B, and with a warning to check every answer when chosen. Its answers carry the same caution.
- **It failed the self-check every time, but not because of the server.** Given a search result in step 2, it searched again (6 of 6 runs). In research tasks, where searching is not offered again before a result is read, it repeated its first search in 1 of 160 runs. So for this model only, the self-check gives it the reply a task gives to a repeated action and takes away the search; it then read a document the result lists in 6 of 6 runs. Other models keep the two-step check, which is stricter about servers that lose the conversation.
- **On the phone it was built for, it did not run.** On the Android phone reporting 4 GB (Arm Mali, Chrome), 0.8B downloaded and loaded, then the first answer of the model test failed with "A valid external Instance reference no longer exists": the browser's GPU connection was gone. It failed the same way after reloading the page. The app now counts that message as a lost GPU, so **Test again** loads the model again and the advice for the lightest models points to another computer.
- **No setting in Kovrune lowers its memory much.** Of its 1.6 GB, the weights are 0.4 GB. In WebLLM 0.2.85 the prefill chunk (1,024 tokens) is fixed in the compiled model library, and the working memory planned for it takes most of the rest. The context window is the one setting left, and it buys little: only 6 of Qwen3.5-0.8B's 24 layers keep a KV cache (2 KV heads of 256 dimensions, 12 KB per token in 16-bit), so halving the window to 2,048 tokens saves about 25 MB, while the agent's prompts reach 3,194 tokens. A smaller footprint would need a model library compiled with a smaller prefill chunk, which is not built here.
- **The completeness check Qwen3.5-2B gets (`completeness.ts`) does nothing for 0.8B.** With it, no task changed result and 8 of 40 answers under **Quotes found** were wrong ([report](../eval/results/small-qwen3.5-0.8b-q4km-completeness.json)), so it is not adopted for this model.

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
| 0.13.0 | Reports add, for each research task, how many answer sentences a found quote backs (`support`) and whether the app would label the answer **Quotes found** (`quotesFound`), and for each research suite the false reassurance counts (`falseReassurance`). The agent, task sets and scoring are unchanged, so results are comparable with 0.10.0–0.12.0 |
| 0.14.0 | New `field` suite: 24 questions over four real documents (a how-to manual, an 18-page PDF report, a licence, an encyclopedia article), plus local documents and tasks in `eval/field/local/`. It runs only with `--suites field` and is not part of the gate. Reports from runs with it record how many tasks were local. The other suites, the agent and scoring are unchanged, so their results are comparable with 0.10.0–0.13.0 |
| 0.15.0 | Quote matching ignores Markdown emphasis and code marks (`*`, `**`, `__`, `` ` ``), which models drop when quoting Markdown documents, and PDFs made from them. Found by the first field-suite runs: right answers to `f01` and `f12` failed only because the source had `**Apps on device**` and `**Quotes found**`. Re-checking every quote in the 0.14.0 reports changes only those field tasks, so research, unanswerable and pdf results are comparable with 0.10.0–0.14.0 |
| 0.16.0 | An answer with no sentence long enough to judge (fewer than three content words, such as "LumenDB 3.2" or "40") is no longer labelled **Quotes found**: nothing compared it with its quotes, and in the 0.15.0 reports 13 of the 16 wrong answers so labelled were like this. A quote that leaves words out with "...", "…" or "[…]" verifies when its pieces are in the source in order, each at most 200 characters after the one before, and one piece is at least three words long. Quote matching applies Unicode NFKC (ligatures such as "ﬁ"), ignores soft hyphens and zero-width characters, and ignores a hyphen between letters with any line break after it ("finan-\ncial"). PDF text joins a word broken across lines at a hyphen, keeping the hyphen. The self-check's worst-case task time uses the research limits (512 tokens a call, not 256) and reports what each open source adds. Re-checking the 0.15.0 reports: only r01 changes, now passing on Qwen3.5-4B (its quote had "..."); false reassurance falls from 6 of 40 to 3 of 25 (Qwen3.5-4B) and from 12 of 40 to 2 of 17 (Qwen3.5-2B), counting the five field answers too long to re-check from the report at their recorded label. The field suite's design PDF loses seven line breaks after hyphens ("JSON-\nschema" is now "JSON-schema"), so field results are comparable with 0.15.0 with care |
| 0.17.0 | **Not adopted; the harness stays at 0.16.0, and the next change is 0.18.0.** An experiment that asked the model for a full-sentence answer, so that the sentence check could judge every answer. On Qwen3.5-4B it raised false reassurance from 3 of 26 to 5 of 36 and lowered the field suite from 20 to 17 ([`eval/field/README.md`](../eval/field/README.md#results)). Its reports (`full-sentences-*.json`) say 0.17.0 |
| 0.18.0 | Search, quote checks, sentence support and chunking work in any script. Words are Unicode letters, marks and digits, with accents dropped from Latin and Greek letters. Chinese, Japanese, Korean, Thai, Lao, Khmer and Myanmar text is indexed as single characters and pairs of characters. Quotes in these scripts may start and end anywhere, two characters count as one word, and whitespace between their characters is ignored. Sentences also end at "。", "！", "？" and "।". Chunk sizes and the context budget count each Chinese or Japanese character as a token. Every benchmark document chunks as before, the 238 search queries in the committed reports return the same results, and re-checking the 0.16.0 reports changes no verdict, so runs are identical to 0.16.0 |
| 0.19.0 | The field suite adds three Wikipedia leads in Japanese, Chinese and French and 12 tasks asked in their languages (`f25`–`f36`), for 36 tasks. The research, unanswerable and pdf suites are unchanged, and both models repeated the 0.16.0 baseline on them exactly. The new documents change the field library's search statistics, so 3 of the earlier 24 field tasks for Qwen3.5-4B and 2 for 2B took other actions, with the same pass counts ([`eval/field/README.md`](../eval/field/README.md#results)) |
| 0.20.0 | Read before "not found": `final_answer` with `"found": false` is sent back once while the last search's results are unread, asking the model to read what it found (never on the last step). Reports show such a call as `final_answer (rejected)`. Qwen3.5-4B rises from 61 to 63 of 70 tasks (`f30`, `p04`), 2B is unchanged, and no task regresses; tasks where the guard did not fire took the same actions as in 0.19.0 ([`eval/field/README.md`](../eval/field/README.md#results)) |
| 0.21.0 | Reply in the question's language: `final_answer` is sent back once when the answer is in another writing system than the question, asking for the answer in the question's language with the quotes unchanged. Short answers are not checked, and languages sharing a script (French, English) are not told apart. Only Qwen3.5-4B's `f28` changes, now answered in Japanese; every result and the other 69 tasks' actions are as in 0.20.0. 2B was not re-run, because none of its 0.20.0 answers would be sent back |
| 0.22.0 | A short answer (no sentence long enough to judge) counts as backed, and can be labelled **Quotes found**, when it is word for word in a verified quote that, with its document's title, shares more than two thirds of the question's content words (`SHORT_ANSWER_QUESTION_SHARE`). Only the label changes, not what the model does, so re-checking the recorded reports gives the exact effect. On the 0.21.0 (4B) and 0.20.0 (2B) runs, false reassurance goes from 2 of 31 to 2 of 36 (4B) and from 3 of 22 to 3 of 28 (2B). Across the 12 recorded reports, the rule labels 59 of 162 right short answers and none of 74 wrong ones |
| 0.23.0 | The reply-language guard also compares languages in Latin script (English, French, German, Spanish, Italian, Portuguese, Dutch), by their function words, so an English answer to a French question is sent back once. A language is named only with at least 3 function words and twice the runner-up's. None of the 1,033 final answers in the recorded reports would be sent back, so runs are as in 0.21.0 |
| 0.24.0 | Search across languages. The field suite adds six tasks asked in another language than the document that answers them (`f37`–`f42`), for 42. For each document language written in another script than a search, the research model translates the search terms, and search adds the best match in that language. On the field suite, cross-language tasks rise from 2 to 5 of 6 on both models; 4B's other 36 tasks are unchanged, and 2B keeps 25 of 36, with four gained and four lost. A prompt line and a guard asking the model to search in other languages were measured first and not adopted ([`eval/field/README.md`](../eval/field/README.md#results)). Research, unanswerable and pdf runs are unchanged, because their documents are all in English, so nothing is translated |
| 0.25.0 | The field suite adds five tasks across English and French, which share an alphabet (`f43`–`f47`), for 47. Before any change, 4B passes 4 of the 5 and 2B passes 3. Translating searches into languages sharing the query's alphabet, when the question's language is known, was measured in two versions and not adopted: 4B stays at 41 of 47 with both, and 2B goes from 33 to 32 and 31 ([`eval/field/README.md`](../eval/field/README.md#results)). Search is unchanged, so research, unanswerable and pdf runs are too |
| 0.26.0 | The sentence check: each number in a backed sentence must be quoted (or be in a cited title or the question, or the sum or difference of two quoted numbers), a sentence that says "not" needs a quote that does, and a "…" in a quote may not leave out a negation. Five search results instead of three were measured and not adopted ([field README](../eval/field/README.md#five-search-results)) |
| 0.27.0 | New `holdout` suite (16 questions over the field documents), read only as totals. From here, a change is run on it too and compared with its baseline by `npm run bench:compare`, task by task, with tasks gained, lost and a p-value ([held-out suite](../eval/field/README.md#held-out-suite)) |
| 0.28.0 | The model checks its answer: an answer the word checks would label **Quotes found** is shown back with its quoted passages, and keeps the label only if the model says they state it (`src/agent/review.ts`) |
| 0.29.0 | Search fixes (a final "s" kept after another, words joined by "-" or "." also indexed by their parts), measured and not adopted at first ([search ranking](../eval/field/README.md#search-ranking)). From here, quality runs use a portable llama.cpp build |
| 0.30.0 | The 0.29.0 search fixes adopted as defect fixes, with a guard: an answer quoting a document seen only as a search snippet is sent back once to read it ([read before answering](../eval/field/README.md#read-before-answering)) |
| 0.31.0 | `--build` records the llama.cpp build in the report's environment, and `bench:compare` warns about different CPUs only when the two runs do not share a portable build ([field README](../eval/field/README.md#runs-repeat-on-one-machine-not-across-machines)) |
| 0.32.0 | The field suite grows from 47 to 89 tasks and the held-out suite from 16 to 37, over the same documents. Results before 0.32.0 are on the smaller suites ([growing the suites](../eval/field/README.md#growing-the-suites)) |
| 0.33.0 | Quotes are compared with a Markdown source as it reads: a link or image counts as its text, a backslash escape as the character it escapes. Measured by re-scoring |
| 0.34.0 | The model's check fails closed: no readable verdict reads **Quotes found, answer not confirmed**. Short answers, too short for the sentence check, are asked about too |
| 0.35.0 | The check of short answers is limited to Qwen3.5-4B; other models' short answers keep **Quotes found, answer too short to check** |
| 0.36.0 | From the AI/ML audit: cut-off replies detected from the finish reason; each call records the tool results removed to fit the context; source requests time out after 20 s and retry once on HTTP 429; the model server fails after 5 minutes of silence. The sentence check also needs a "not" to come from a quote making the same claim, and a date's month and a number's unit to match the quotes |
| 0.37.0 | A quote that leaves out more than five words in one place is found but backs no sentence; search no longer indexes a part's label ("part 4 of 12"); a comma is a decimal mark where it can't be a thousands separator ("1,5"); a resumed task replays a cut-off reply as cut off. Measured by re-scoring: no recorded label changes |
| 0.38.0 | Ollama's context is read after the model test (`/api/ps`, `/api/show`); "not" and "no" are search stop words. Run on Qwen3.5-4B to measure the 0.34.0 short-answer check |
| 0.39.0 | Used only on the branch of [pull request #85](https://github.com/bowo-prasetyo/kovrune/pull/85), a new stemmer, measured and not adopted; `main` went from 0.38.0 to 0.40.0 |
| 0.40.0 | The cross-check, for Qwen3.5-4B: the model reads the quoted passages without seeing the answer, and an answer it reads differently loses **Quotes found** (`src/agent/crosscheck.ts`). Measured on recorded answers with `npm run bench:crosscheck` |
| 0.41.0 | A quote's `\n`, `\r` and `\t` written out as text count as whitespace. Measured by re-scoring: two answers change |
| 0.42.0 | Reports record the cross-check's result (`support.crossCheck`), and `bench:rescore` uses it. Qwen3.5-4B run live with the cross-check |
| 0.43.0 | An action whose result was removed to fit the context is no longer a repeat, so the model can read a document again |
| 0.44.0 | A read result that has to leave the context keeps its document's ID, title and the two sentences that best match the question |
| 0.45.0 | Used only on an unmerged branch: a dropped search keeping its results' IDs and titles, measured and not adopted |
| 0.46.0 | New `multi` (13) and `multiholdout` (8) suites: questions that need more than one passage |
| 0.47.0 | Reports keep final answers up to 8,000 characters (`FINAL_CHARS`), instead of 600 |
| 0.48.0 | The completeness check, for Qwen3.5-2B: the model lists the parts the question asks for, and an answer that leaves one out loses **Quotes found** (`src/agent/completeness.ts`). Measured with `npm run bench:completeness` |
| 0.49.0 | After a reply is cut off, the raised token limit (1,024) is kept for the rest of the question |
| 0.50.0 | The read-first guard asks only for as many reads as the calls left allow, keeping two for the answer and a retry |
| 0.51.0 | The report suite (`reports`, 6 requests; `reportsholdout`, 3) and `npm run bench:report` ([report-mode.md](report-mode.md)) |
| 0.52.0 | The report planner's source overview, measured and not adopted (`plansFromSources` off; `bench:report --overview`) |
| 0.53.0 | A report's introduction and conclusion (`src/agent/synthesis.ts`), measured and off by default |
| 0.54.0 | Reports record the prompt tokens the server took from its cache, and its prompt time. `--fit-headroom`, measured and not adopted |
| 0.55.0 | `--long-reply-room`, measured on the report suite: no effect, not adopted. `bench:report` records cut-off replies and cache use per section |
| 0.56.0 | `--as-source` serves the field documents as an open source, and reports record the objections that sent the model on. `--forced-read-passage`, measured and not adopted |
| 0.57.0 | The chunker keeps a heading with what it introduces. Adopted as a defect fix before its model runs; the retrieval floors in `tests/retrieval.test.ts` lowered by one passage |
| 0.58.0 | New `office` (15) and `officeholdout` (7) suites, over a Word report card, an Excel workbook and a Shift_JIS CSV file. Not yet run on a model ([office documents](../eval/field/README.md#office-documents-0580)) |
| 0.59.0 | Sentence support checks clinical units, directions (higher/lower and other opposites) and statistical significance, and reads "0·82" as 0.82. Adopted as a defect fix: no recorded answer changes label ([clinical checks](../eval/field/README.md#clinical-units-directions-and-significance-0590-defect-fix)) |
| 0.60.0 | New `clinical` (23) and `clinicalholdout` (10) suites, over ten CC BY 4.0 trial reports from Europe PMC: effect sizes, negative results, doses, table values. First runs: 4B 17/23 and 7/10, 2B 13/23 and 4/10 ([clinical suite](../eval/clinical/README.md#the-first-model-runs-0600)) |
| 0.61.0 | Two clinical task defects fixed: `c03` no longer requires a ratio its question does not ask for, and "no statistical" joins the ways to say a result did not differ (`c20`). Re-scored from the 0.60.0 runs: 4B `clinical` 19/23, wrong under **Quotes found** 2 of 20; 2B unchanged ([clinical suite](../eval/clinical/README.md#the-first-model-runs-0600)) |
| 0.62.0 | Sentence support: a count of people recruited, enrolled or randomised is not backed by a quote that gives the number only as a target (planned, desired, calculated sample size). Adopted as a defect fix: of every recorded answer, only the clinical suite's two `c09` labels change. `bench:rescore` uses a recorded review only where the app would ask for one ([clinical suite](../eval/clinical/README.md#a-target-is-not-a-count-0620)) |
| 0.63.0 | Used only on an unmerged branch ([#141](https://github.com/bowo-prasetyo/kovrune/pull/141), closed): search ordering a long document's own parts by position as well as relevance. Measured on the clinical suites, not adopted: it found the abstract's Findings and lost Table 1 ([write-up](../eval/clinical/README.md#a-papers-first-parts-first-0630-measured-not-adopted)) |
| 0.64.0 | Reports record every reply the model gave in each task (`replies`), and `npm run bench:replay` tells, without a model, which tasks a code change can affect: those whose requests to the model differ between two versions. The rule's runs can skip the rest ([replaying recorded runs](../eval/field/README.md#replaying-recorded-runs-0640)) |
| 0.65.0 | The experimental browser model Qwen3.5-0.8B, and a third self-check step for it alone: after repeating its search, it must use the result once told it has not changed. `npm run pin:browser-models` can pin only the models it is given. Measured against Qwen3.5-2B ([a smaller model](#a-smaller-model-for-low-memory-devices-0650)) |
| 0.66.0 | When llama.cpp refuses a prompt as too long, the agent fits the conversation to as much less as it was over and asks the step again, up to three times (`contextOverflow`): `estimateTokens` counts ordinary text up to a fifth short. A defect fix; replaying both models' recorded runs found every task the same ([write-up](../eval/field/README.md#a-prompt-the-server-refuses-as-too-long-0660-defect-fix)). Found by a long document's outline, measured on an unmerged branch ([#144](https://github.com/bowo-prasetyo/kovrune/pull/144), closed) and not adopted: 4B gained on the clinical suites, and field did not improve on either model ([write-up](../eval/clinical/README.md#a-long-documents-outline-144-measured-not-adopted)) |
| 0.67.0 | A cross-check (4B) whose reply could not be read, or whose call failed, no longer takes an answer's label: it found nothing against the answer, and the label says it could not be completed, and why (`crossCheckRejects`). A user's right answer about paracetamol had lost its label so in the browser build. Rescoring every recorded report, 3 of 6,487 answers change, right answers to `f17` that keep their label, and no task passes or fails differently ([write-up](../eval/field/README.md#a-cross-check-that-could-not-be-completed-does-not-take-the-label-0670)). The same version also numbers the sentence check's engineering units, signs, powers of ten and changes ([#158](https://github.com/bowo-prasetyo/kovrune/pull/158), [write-up](../eval/field/README.md#engineering-units-signs-powers-of-ten-and-changes-0670-defect-fix)), merged alongside; no reports were recorded at 0.67.0 |
| 0.68.0 | Each part of a sentence that makes its own claim, joined by "and" before a verb, ";", "while", "whereas" or ", but", must share most of its words with the quotes, as the whole sentence must (`clausesBacked`): a claim joined to a backed one had ridden along. Rescoring every recorded report, 2 of 7,319 sentences change, one right answer of the experimental 0.8B model twice, and 2 of 6,487 labels; no task passes or fails differently ([write-up](../eval/field/README.md#each-claim-of-a-sentence-checked-0680)) |
| 0.69.0 | New `cs` (26) and `csholdout` (10) suites, over ten CC BY 4.0 computer science papers from Europe PMC (federated learning, retrieval-augmented generation, knowledge distillation): results tables, hyperparameters written as powers of ten, acronyms, negative results. The JATS converter keeps displayed equations and places MDPI's floated tables; the clinical documents rebuild unchanged. Search alone finds everything for 27 of 34 answerable questions; the acronym questions are among the misses. First runs: 4B 17/26 and 9/10, wrong under **Quotes found** 1 of 13; 2B 11/26 and 7/10, 4 of 12 ([CS suite](../eval/cs/README.md#the-first-model-runs-0690)) |
| 0.70.0 | PDF pages read by layout (touching pieces joined, so "40 mΩ", "−25 °C" and "fsw" stay whole; paragraphs marked; running headers and footers read once), and the quote check also joins a minus sign, a unit prefix before Ω and a power of ten. A search in words adds the abbreviation the library defines for them (Schwartz and Hearst). OpenAlex limits (first year, field, open access), 25 candidates for 5 results, and full texts through arXiv and Europe PMC. New `engineering` (25) and `engineeringholdout` (10) suites over made-up engineering documents: 2B 19 → 22 and 7 → 8, 4B 23 → 23 and 9 → 10, no task lost ([write-up](../eval/field/README.md#pdf-layout-abbreviations-and-openalex-limits-0700)) |
| 0.71.0 | Sentence support checks laboratory units (M to fM, µL, nL, Da, kDa, bp, nt, × g, U, CFU, PFU; "mM" is no longer read as millimetres), fourteen laboratory opposites (upregulated/downregulated, activate/inhibit, agonist/antagonist, overexpression/knockdown and others), and names one character tells apart: Greek letters (TNF-α, TNF-β), cell markers' signs (CD45+, CD45−), genotypes (−/−, +/+) and species with a shortened genus (S. aureus). A pair of opposites a sentence states both sides of is no longer judged. From an audit from a biological and biomedical sciences researcher's point of view: with a real quote, 17 of 22 wrong laboratory sentences were marked backed, and 1 is now. Adopted as a defect fix: rescoring every recorded report, no label and no sentence count changes ([write-up](../eval/field/README.md#laboratory-units-opposites-and-names-0710-defect-fix)) |
| 0.72.0 | New `lab` (32) and `labholdout` (11) suites, over ten CC BY 4.0 laboratory biology papers from Europe PMC (mouse, chicken, zebrafish, *Arabidopsis*, *S. aureus*, enzyme kinetics, human cell lines): molar concentrations, knockout genotypes, names one Greek letter apart, directions of regulation, controls that showed no effect, and three questions asked in a researcher's own spelling of a name. From the same audit as 0.71.0, to show what those checks catch on text a model writes. Search alone finds everything for 39 of 40 answerable questions, higher than the clinical and CS suites, because each paper is about its own organism; searching "IL-10" alone, where the paper writes "IL10", returns three unrelated papers and not that one ([lab suite](../eval/lab/README.md)). First runs: 4B passes 28 of 32 and 10 of 11 held out, with 1 of 28 labelled answers wrong (4%, under the target); 2B 22 of 32 and 9 of 11, with 4 of 19 (21%). Recomputing every answer's marks with and without the 0.71.0 laboratory rules isolates their effect: one sentence of 86 answers, no label and no result, and that one mark is a false positive on a right answer |
| 0.73.0 | From the CS suite's first runs: a table longer than a part is split between its rows, each later piece starting with its label, caption and column names (not indexed); a part that cites a table held in another part ends with where it is; a passage that uses only an abbreviation the query spells out keeps a place in the results (taken out in 0.77.0); snippets end at a whole word, marked "[…]". `cs24`'s facts ask for the direction, not the numbers (task defect). On clinical and CS, 4B gains 4 tasks and loses 2, 2B gains 3 and loses 1; the protected suites are measured separately ([CS suite](../eval/cs/README.md#four-changes-from-the-first-runs-0730)) |
| 0.74.0 | Two fixes from the lab suite's first runs. Sentence support: a distinguishing name that adds a plain suffix to a name the quotes give is backed ("PPARαBATKO" beside the paper's "PPARα"), while a suffix that is itself the distinguishing character is not ("TNF-β" against "TNF", "CD45+" against "CD45"), which repairs the one false positive those runs found (`plainSuffix`). Rescoring every recorded report, 7,321 answers give the same line as before, and the only sentence mark that changes is the one this fixes. The BibTeX export, and the citations behind it, also carry a paper's PMID and PMCID where Europe PMC or OpenAlex gave them, which biomedical journals and grant forms ask for ([write-up](../eval/field/README.md#a-backed-name-with-a-plain-suffix-0740-defect-fix)) |
| 0.75.0 | Benchmark runs turn llama-server's prompt cache off (`cache_prompt: false`, `--prompt-cache` keeps it), since with it the same request can get another reply depending on the tasks run before it: comparing 0.70.0 with the code before it on Qwen3.5-2B, 42 of 85 tasks that changed first parted on an identical request with the cache on, and none of 51 with it off. Reports record the fields added to every request (`environment.extraBody`), and `bench:compare` warns when a run used the cache. No task, prompt or check changes; runs are slower, about 2 hours instead of 1¼ for pdf, field and holdout on 2B ([write-up](../eval/field/README.md#the-prompt-cache-makes-a-task-depend-on-the-tasks-before-it)) |
| 0.76.0 | Three changes from the lab suite's first runs. A part that holds a figure's legend ends with where that figure is discussed, since a paper gives a figure's values in the prose that cites it (`figureNote`, the mirror of 0.73.0's pointer to a table): on the lab suites 4B goes from 27 to 29 of 32 and 2B from 20 to 21, each gaining tasks and losing none, with both held-out totals unchanged. A sentence of a document the model read that covers three quarters of the question's words and denies it, where the answer does not, takes **Quotes found** and is shown to the reader as "Quotes found, a source says otherwise" (`contradictedSupport`): over 7,321 recorded answers it changes exactly one label, the one wrong answer that kept a green label on bench papers. A preprint's text now names the published version Europe PMC links it to. Also measured, and not adopted: Europe PMC's synonym option, which loses 2 of 6 of the suite's papers ([write-up](../eval/lab/README.md#three-changes-from-the-first-runs-0760)) |
| 0.77.0 | 0.73.0's place for a passage that uses only an abbreviation is taken out: on the clinical, CS and lab suites it gained 3 tasks and lost 2, and the lab held-out total fell on 4B, so under the rule it is not adopted; `bench:retrieval`'s CS figures go back to 27 of 34. 0.73.0's other three changes are kept: on research, unanswerable, pdf and holdout neither model gains or loses a task, and against `main` before 0.73.0, 0.77.0 gains 6 tasks and loses 3 on 4B, and gains 4 and loses 4 on 2B, over the lab, field, CS and clinical suites ([CS suite](../eval/cs/README.md#the-other-suites-and-the-rules-decisions-0770)) |
| 0.78.0 | A part that holds table rows takes no figure note (`TABLE_ROW`), from the CS suites' first runs with the 0.76.0 note. There 4B went from 22 to 21 of 26: on `cs04` it searched the same way, read the same part and gave the same right value, but with the note quoted Table 4's row from the middle, which is not word for word, so the quote check failed the task. That part holds the table the question needs beside a figure's legend, so the note pointed away from the values in hand. With the narrowing both models sit on their baselines (4B 22 of 26 and 10 of 10, 2B 13 of 26 and 7 of 10, 0 gained and 0 lost) and `cs04` passes again, while all 53 of the lab suite's noted parts keep their note, so its gains carry over unrun. These are also the first CS runs with the prompt cache off ([write-up](../eval/cs/README.md#the-figure-note-and-why-it-is-not-given-to-a-tables-part-0780)) |
| 0.79.0 | Computer science venues through OpenAlex: a search can be limited to the ACL Anthology (by its DOI prefix) or NeurIPS; a paper whose OpenAlex record has no arXiv link is looked for on arXiv by its exact title, when arXiv is ticked; and a paper read as its abstract names its free PDF for the user to add. The ACL Anthology and OpenReview can't be read by a web page (no `Access-Control-Allow-Origin` for other sites), and OpenAlex holds almost none of ICLR's, ICML's or JMLR's recent papers, so those are not offered. On 160 sampled 2023 and 2025 papers, 108 read in full from arXiv, 10 of them found by title; 39 name a free PDF ([CS suite](../eval/cs/README.md#computer-science-venues-0790)). No benchmark suite reads OpenAlex, so no run changes |
| 0.80.0 | A paper OpenAlex finds in PubMed Central is read in full from Europe PMC, and its PMCID is cited: OpenAlex gives PMCIDs as URLs with the bare number (`…/pmc/articles/8862100`), which Kovrune never recognised (`pmcidOf`). Found by a new measurement, `npm run bench:coverage`: of 16,565 works cited by 140 engineering reviews across 14 subfields, Kovrune reads 9 to 12% in full (3% before this fix), about 28% more are free elsewhere, 26% only as an abstract, and 34% with no abstract, most of them Elsevier's. No benchmark suite uses OpenAlex ([write-up](../eval/coverage/README.md)) |
| 0.81.0 | arXiv papers are read from their LaTeX source when arXiv has it (arxiv.org/src, which web pages may read), converted by `src/documents/latex.ts`: sections numbered as printed, tables as caption and rows, figures as captions, displayed equations as their LaTeX with their numbers, inline math as written, citations and references as printed from the `.bbl`. A paper without a source, or one converting to fewer than 800 words or with unresolved references, is read from its PDF. On 30 sampled 2024–2025 ACL and NeurIPS papers on arXiv, all 30 had a source and converted (23 to 408 ms to unpack and convert, median 69; the 30 sources are 143 MB to download against 120 MB of PDFs); each text holds 89% of its PDF's words and the PDF 91% of its, the difference being equations' symbols and text drawn in figures; 397 numbered equations and 2,742 inline formulas with sub- or superscripts keep their structure, which the PDF's text flattens. Table rows were already whole in the PDF in 1,849 of 1,871 cases. No benchmark suite reads arXiv, so no run changes ([CS suite](../eval/cs/README.md#arxiv-papers-from-their-latex-source-0810)) |
| 0.82.0 | Adding many documents at once, for the papers a researcher downloads through a library (60% of what engineering reviews cite, [coverage](../eval/coverage/README.md)): a folder, chosen or dropped, with its subfolders; files already added (same name and size) and hidden files skipped, and the files Kovrune can't read named; a BibTeX or RIS export from Zotero, Mendeley, EndNote or JabRef, with the folder or later on its own, gives each document its title, authors, year, venue and DOI, matched by the file the entry links to, the DOI the document prints, or its title on the first page (`src/documents/references.ts`); a document that prints only a DOI can have its details looked up on OpenAlex, sending only the DOI. Answers cite such documents with their details, in the Markdown export too, and the BibTeX export includes them. The agent and its prompts are unchanged, so no benchmark result changes |
| 0.83.0 | A PDF with text on some pages but not others says which pages have none, under its name ("Pages 2 and 4 of 5 have no text Kovrune can read: they may be scans, full-page figures or blank"), and the summary after adding a folder counts such PDFs. A page has no text when it holds fewer than 25 letters and digits (`pagesWithoutText`); each of the 25 pages of the repository's PDFs holds at least 174. Before, only a PDF with no text at all was marked, so a scanned appendix or the scanned pages of an older paper were left out without a word. Computed from the saved text, so documents added earlier are marked too. The agent and its prompts are unchanged, so no benchmark result changes |
| 0.84.0 | Following citations through OpenAlex: the source reads "references of <paper>: <topic>" and "citing <paper>: <topic>", the paper named by its OpenAlex ID, DOI, arXiv ID or title, and a work read from OpenAlex shows its citation counts. Telling the model about the forms is a setting, off by default: on five live citation questions Qwen3.5-4B passed 4 told nothing, 4 with a note after a read (never used), and 2 and 3 with the forms in the search tool's usage line, mostly following the citations of the wrong paper ([CS suite](../eval/cs/README.md#following-citations-through-openalex-0840)). No benchmark suite reads OpenAlex, so no run changes |
| Baseline, taken at 0.78.0 | A baseline of the lab and CS suites, both models, prompt cache off: lab 26 of 32 on 4B and 19 of 32 on 2B, labholdout 10 of 11 on both, cs 22 of 26 and 13 of 26, csholdout 10 of 10 and 7 of 10. The CS figures match what the 0.78.0 write-up quotes; the lab figures fall by three tasks on 4B and two on 2B against the 0.76.0 write-up, whose runs had the cache on. Those write-ups' paired decisions stand, their absolute totals do not, and this table is what to quote. Taken at 0.78.0 and checked to still describe `main` at 0.84.0: the same retrieval figures and part counts, the same scores when the six reports are re-scored on 0.84.0's code, and no change on these suites' path ([write-up](../eval/lab/README.md#the-baseline-on-main-at-0780)) |
| 0.85.0 | Two fixes from a preview user's reports. An arXiv source with a `.bib` and no `.bbl` cites by authors and year from the `.bib` ("(Samsi et al., 2023)"), not by raw keys ("[samsi2023words]"): on the 30 sampled papers, 3 have no `.bbl`, and their raw keys go from 122 to none ([CS suite](../eval/cs/README.md#arxiv-papers-from-their-latex-source-0810)). The browser's storage: when the browser closes the page's database connection, the next write failed with InvalidStateError and so did every one after it until a reload, so a report written for an hour was kept with no sections; the store now reconnects and writes again, a failed write is retried rather than taken for done, and the research screen says when saving fails. No benchmark run changes |
| 0.86.0 | Three label fixes from a preview user's reports (`src/agent/support.ts`). A list written into one sentence, "challenges: 1) … 2) … 3) …", is checked item by item (`listItems`): in the user's report, two of three items were word for word in their quotes yet the whole read "0 of 1 sentence backed", and the third, which the model said was not in its sources, hid behind them; now the two are backed and the third marked. A sentence that names the document it quotes ("- From arxiv:2608.25291#13: …") is checked without the name, whose digits failed the number check, so the model's own pasted quotes were marked. A report's introduction does not mark sentences that only restate its questions (`scope`, the conclusion is checked as before). Over the 7,730 recorded answers re-scored (`bench:rescore --labels`) no label changes: 1 of 8,889 recorded answers has a numbered list, on lines of its own, and none names a source's ID |
| 0.87.0 | A query's search terms also carry the other spellings of a gene or protein name: the joined form of a hyphenated or dotted word, a Greek letter by its name and a name ending in one by the letter, and two words joined when one holds a digit or is a single letter (`nameForms`, `joinedPairs`). The lab suite measured 8 of 28 researcher spellings missing their paper before it; 26 of 28 find it now. Query side only, measured: adding the forms to the index lengthened every document and cost tasks on three suites. Two tasks gained and none lost over six runs — lab 26 to 27 of 32 and clinical 17 to 18 of 23 on 4B, the others unchanged — and the clinical gain is `c06`, a risk ratio 4B had missed since the suite's first runs ([write-up](../eval/lab/README.md#matching-a-gene-or-protein-name-however-a-query-writes-it-0870)) |
| 0.88.0 | LaTeX math shown as text people read (`src/app/research/math.ts`): in answers, quotes and source passages, `$20\times$` shows as "20×" and `$O(n^2 \cdot d)$` as "O(n² · d)", with the LaTeX shown when pointed at. Only the display changes: answers and quotes are kept, checked and exported as written. A formula with a command not read here is shown as written. On the 30 sampled arXiv papers' text, 4,599 of 4,879 inline formulas with TeX marks (94.3%) and 195 of 313 numbered displayed equations (62.3%) are shown as text; the rest are environments (`cases`, `aligned`) and papers' own macros. No benchmark run changes |
| 0.89.0 | A sixth open source, **EPO patents**, through the European Patent Office's Open Patent Services with the user's own free key (consumer key and secret, exchanged for an access token): a search on titles and abstracts looks among European and international (EP, WO) publications first, which are read in full (claims and description), and fills the rest from all offices as abstracts, one per patent family; cited patents link to Espacenet and export to BibTeX with their numbers (`src/sources/patents.ts`, [patents](../eval/patents/README.md)). Requests can now send a method, headers and a body, and read text (`getText`). Off by default and unused by any suite, so no benchmark result changes |
| 0.90.0 | Physics, from a physicist's audit. arXiv sources written with **siunitx** or **hepunits** keep their units: `\SI{1.5}{\milli\electronvolt}` reads as "1.5 meV", not "1.5"; `\num`, `\qty`, `\si`, ranges, lists, products, `\ang`, `\DeclareSIUnit` and `per-mode` are read as the PDF prints them (`src/documents/siunitx.ts`). The sentence check knows physics units (meV, TeV, mK, T, fs, fm, Å, fb, pc to Gpc, Gyr, M☉, Jy, Sv, Bq and others), gives a value with its uncertainty the unit after both ("125.10 ± 0.14 GeV"), and reads 24 physics opposites (upper/lower limit, excluded/allowed, ferromagnetic/antiferromagnetic, redshift/blueshift and others). Adopted as a defect fix: re-scoring 9,492 recorded answers in 138 reports changes no label ([physics checks](../eval/field/README.md#physics-siunitx-quantities-physics-units-and-opposites-0900-defect-fix)) |
| 0.91.0 | Physics suite (`eval/physics/`, recommendation 4 of the physicist's audit): three LaTeX papers, a two-column PDF, a commissioning report and a table, 26 open and 10 held-out questions on unit prefixes, uncertainties, upper and lower limits and table rows, and facts a task may require in their case (`casedFacts`: "meV", not "MeV"). The number check reads LaTeX math, concise uncertainties ("1.50(5)" is 1.50 ± 0.05), asymmetric ones, and σ as standard deviations (recommendation 3). The suite's runs found and fixed: PDF exponents read as digits ("2.0 × 105", now "2.0 × 10⁵"), `\ensuremath` macros that lost their commands, a REVTeX title read twice, right answers whose quote wrote kept LaTeX math another way, and a number backed by the digits of a formula. Qwen3.5-4B: 20/26 and 10/10 before, 23/26 and 10/10 after (re-scored), no labelled answer wrong. Adopted as a defect fix: re-scoring 9,492 recorded answers in 138 reports changes no label ([physics suite](../eval/field/README.md#physics-suite-pdf-exponents-latex-macros-and-math-in-quotes-0910)) |
| 0.92.0 | **INSPIRE-HEP** as an open source, from a physicist's review of the sources: high-energy physics records with journal references, DOIs, arXiv and report numbers, TeX keys, citation counts and abstracts, read in full from arXiv when arXiv is ticked (`src/sources/inspire.ts`). Searches take a query's content words, by title first and then title, abstract or author, most cited first, retrying without plain numbers; citations are followed through INSPIRE's curated reference lists (experimental, off by default). BibTeX exports key a record by its TeX key. NASA ADS was checked and can't be offered: it lets only its own website call its API. A paper named by its arXiv ID or DOI is looked up first, and a quote of LaTeX without its markup ("P_c(4450)^+" for `$P_c(4450)^+$`) verifies. Live, with Qwen3.5-4B and no documents, eight HEP questions: OpenAlex and arXiv 3 of 8, INSPIRE and arXiv 5 of 8 (7 of 8 re-scored); re-scoring every recorded report changes no label ([INSPIRE-HEP](../eval/field/README.md#inspire-hep-as-an-open-source-nasa-ads-cant-be-0920)) |
| 0.93.0 | Chemistry, from a chemistry researcher's audit, where the sentence check marked 38 of 51 wrong chemistry sentences backed. arXiv sources written with **mhchem** or **chemformula** keep their formulas: `\ce{CO2}` reads as "CO₂", not "eCO2", and a letter accent is read only as a command of its own, so `\vec` and `\verb` keep their first letter (`src/documents/mhchem.ts`). The sentence check knows chemistry units (ppm, ppb, mol, mol%, wt%, equiv) and what a percentage is of ("92% ee" is not "92% yield"), does not take a reduction potential's sign for a fall, reads chemistry opposites (oxidant/reductant, nucleophile/electrophile, hydrophobic/hydrophilic, axial/equatorial and others), and gives formulas, metals, oxidation states, stereo- and regiochemical descriptors, solvents and substituents only as the quotes give them (`src/agent/chemistry.ts`). Adopted as a defect fix: re-scoring 9,564 recorded answers in 140 reports changes no label ([chemistry checks](../eval/field/README.md#chemistry-mhchem-formulas-chemistry-units-opposites-and-names-0930-defect-fix)) |
| 0.94.0 | Mathematics, from a mathematician's audit ([`docs/math-audit.md`](math-audit.md)). arXiv sources read theorem-like statements as the paper declares and numbers them: `\newtheorem`, `\spnewtheorem`, thmtools's `\declaretheorem`, aliascnt's `\newaliascnt` and `\numberwithin`, numbered in one pass with the equations as amsthm does, so a conjecture keeps its heading ("Conjecture 1.4.") and "by Lemma~\ref{…}" reads "by Lemma 3.2", not the section's "3"; also `\tag`, the appendix package's environments and `\texorpdfstring` (`src/documents/latex.ts`). On 48 recent arXiv mathematics papers, references to statements whose number the PDF has go from 2,171 of 3,239 to 3,385 of 3,403, and 1,514 of 1,518 numbered headings match the PDF. No committed document converts differently, so no recorded run changes. Mathematics suite (`eval/math/`): two LaTeX papers, lecture notes and a PDF, 24 open and 10 held-out questions on whether a statement is proved, numbered statements, hypotheses and exact bounds. Qwen3.5-4B: 9/24 and 4/10 before, 11/24 and 5/10 after, no labelled answer wrong; six right answers fail the quote check because the model writes the paper's math another way (audit M4) ([write-up](../eval/field/README.md#mathematics-theorem-like-statements-numbered-as-amsthm-numbers-them-0940-defect-fix), [suite](../eval/math/README.md#results)) |
| 0.95.0 | Quotes of math in any common form, from the mathematics suite's runs (audit M4): a quote that writes a paper's LaTeX math in ASCII or Unicode, with or without dollar signs ("p >= 7" or "p ≥ 7" for `$p \geq 7$`, "1/8" for `\frac{1}{8}`, "|A|^2"), is compared with both sides written alike (`mathMatchKey` in `src/documents/math.ts`), as the quote check's last try; a quote with other math still fails. Re-scoring 9,632 recorded answers in 142 reports loses no label and no pass; outside the mathematics suite one task changes, field f11 on 2B, now passing in 19 reports with a real quote across a Markdown link's line break. Qwen3.5-4B on the mathematics suite, same answers as at 0.94.0: 16/24 and 6/10, from 11/24 and 5/10; labelled and scored wrong, ma15 (right in substance, a fact asked by name) and held-out mah01 (an answer off the question, which the model's check passed), so held-out false reassurance on this suite rises from 0 of 4 to 1 of 5: adoption is the owner's decision ([write-up](../eval/field/README.md#quotes-of-math-in-any-common-form-0950-defect-fix), [suite](../eval/math/README.md#quotes-of-math-in-any-common-form-0950)) |
| 0.96.0 | From the mathematics suite's runs and the audit's M3. An answer is labelled **Quotes found** only if it or a verified quote has the formula the question asks about, when the question names one that relates things ("Z/pZ × F₅ⁿ", "s ≤ 1/2"), compared as math; otherwise **Quotes found, answer not confirmed**, naming it (`src/agent/mathematics.ts`). A "not found" answer that comes with quotes is asked once whether they answer the question, also with "no", "not proved" or "not known" (`src/tools/research.ts`). The sentence check marks a formula a quote gives with another relation, number, set operation or part (≥ for ≤, ≥ 1 for > 1, Im for Re, an exponent), "every" against "there exists", and "proves" against "conjectured" or "no proof": five of the audit's nine wrong sentences, against one. Re-scoring 9,666 recorded answers in 143 reports changes one label, held-out mah01's wrong one, in three reports; no right answer loses its label. Qwen3.5-4B: on the nine tasks with recorded quoted not-found answers, the same results as `main`, every refusal kept; on the mathematics suite 19/24 and 6/10, from 16/24 and 6/10, held-out false reassurance 0 of 4, from 1 of 5 ([write-up](../eval/field/README.md#the-questions-formula-quoted-no-answers-and-formulas-quantifiers-and-status-0960), [suite](../eval/math/README.md#the-questions-formula-quoted-no-answers-and-formulas-quantifiers-and-status-0960)) |
| 0.97.0 | The audit's M5 and M7. zbMATH Open was checked and can't be offered: its API sends no `Access-Control-Allow-Origin` header, so a web page can't read it. Instead, arXiv searches can be limited to subjects the user names ("math", "math.CO, math.NT", "hep-th"), through DataCite's arXiv categories, and each result shows its categories and the MSC codes its authors gave (`src/sources/arxiv.ts`). A long paper's statements stay with the start of their proofs, the LaTeX converter ends a proof with "∎", and a part that starts inside a proof says whose (`src/documents/chunk.ts`): on 48 arXiv mathematics papers, statements cut from their proofs go from 139 to 17, and 1,001 of 3,278 parts start inside a proof. Only the mathematics suite's two LaTeX papers' parts change; re-scoring its four reports changes no label, search finds every answering passage as before, and no suite reads arXiv live, so no benchmark result changes ([write-up](../eval/field/README.md#arxiv-subjects-and-proofs-across-parts-0970)) |
| 0.98.0 | **Chemistry suite** (`eval/chem/`, recommendation 3 of the chemistry researcher's audit): eight CC BY 4.0 papers from Europe PMC (nickel-catalysed couplings, an enantioselective propargylation, photoredox and a photocatalyst study, a copper CO₂ electrocatalyst, iron porphyrins, a computational frustrated Lewis pair), 40 open and 12 held-out questions on units, screening-table conditions, names a character apart, stereochemistry, directions, negatives and aliases. **Chemical names in search** (recommendation 4): a built-in list of 161 solvents, reagents, catalysts, metals and techniques, so a query naming one spelling also searches the others, on the query side only (`src/tools/chemical-names.ts`); 30 of 30 other spellings now find their paper, against 13 before, and `bench:retrieval` is unchanged on every other suite. Qwen3.5-4B scores 33/40 and 12/12 held out, 2B 22/40 and 10/12; with and without the list, answers move 2–0 on 4B and 1–2 on 2B ([chemistry suite](../eval/chem/README.md)) |
| 0.99.0 | Recommendations 5 and 6 of the chemistry researcher's audit. **PubChem** (compounds: computed properties and identifiers, CAS numbers, descriptions, and measured properties with their sources) and **ChemRxiv through Crossref** (preprint records and abstracts) as open sources; checked against the live services afterwards, which fixed ChemRxiv's search (Crossref refused a field it asked for), PubChem's suggestions (only close spellings) and its names (without other databases' identifiers). **Chemistry files**: CIF, molfiles and SD files (with formulas worked out from the atoms) and JCAMP-DX spectra (header and peak table). **Locants**: the positions in a chemical name are read whole ("2,4-"), so "2,4-D" no longer backs 2.4 and "1,3,5-triazine" no longer backs 135. Re-scoring 9,928 recorded answers changes no label; retrieval is unchanged ([write-up](../eval/field/README.md#pubchem-and-chemrxiv-chemistry-files-and-locants-0990)) |
| 0.100.0 | The mathematics audit's last open items. **M8:** more of a paper's math read as text (every blackboard and Fraktur letter, declared operators such as `\Irr` and `\Hom`, more relations and arrows, `\pmod`, `\binom`, spacing commands): on 48 arXiv papers, inline formulas shown raw go from 5,838 to 1,165 of 62,667. **M3:** the sentence check marks a conclusion stated without its quoted hypothesis, a quantifier swapped on the noun it binds when the quote states both kinds, and "proves" for a conjecture quoted without its heading: 8 of the audit's 9 wrong sentences are now marked. **M7:** a made-up paper whose two proofs run over several parts, and three questions on it: with the proof notes off and on reading only, 1 of 3; search now finds a part by the proof it continues and its snippet carries the note, and an answer about one proof whose quotes all stand in another's is not labelled: 2 of 3, and the wrong one (37 for 12) loses its label. Mathematics suite 20/26 and 9/11, 0 of 5 held-out labels wrong. Re-scoring 9,928 recorded answers changes no label; retrieval is unchanged on every suite ([write-up](../eval/field/README.md#more-formulas-as-text-hypotheses-and-bound-quantifiers-and-proofs-found-by-search-01000)) |
| 0.101.0 | Recommendations 1–5 of the social-sciences audit ([`social-sciences-audit.md`](social-sciences-audit.md)). **S1:** a number written without its leading zero, as APA style writes p, r and α, is read with it and its sign: "r = −.34" no longer backs "r = .34" or "34%", and "d = 0.45" is backed by "d = .45". **S3:** a quote may leave out the source's footnote and citation markers ("with¹", "weak.12", "[14]"), and a PDF's footnotes are read after the paragraph that finishes a sentence they would cut. **S4:** Europe PMC tables after the article (`<floats-group>`, MDPI) are read after the paragraph that cites them, merged cells fill every column and row they cover, and all-bold cells stay bold: an IJERPH survey paper has its 4 tables, from none, and a regression table's standard errors stand under their estimates. **S5, S6:** OpenAlex marks retracted works, offers six social-science fields, and with DataCite ticked reads a work from its Zenodo copy. Re-scoring 10,005 recorded answers changes no label; retrieval is unchanged; the 8 benchmark PDFs read as before ([write-up](../eval/field/README.md#social-sciences-numbers-without-a-leading-zero-note-markers-tables-and-openalex-01010)) |
| 0.102.0 | Where to check a ⚠ sentence (`closestPassages` in `src/agent/support.ts`): for each marked sentence that is in no source word for word, the one or two sentences of the documents the model read sharing the most of its words, weighted by how rare each word is in what was read, the second chosen for words the first lacks; at least 3 words and a quarter of the sentence's. Shown under the answer and in the Markdown export; labels and counts do not change. A preview user's answer on combining LLMs and genetic programming had 0 of 3 sentences backed, with nothing saying where to look: the passages now point to the paper's own sentences, among them the one that shows the first sentence reversed it (the paper says the LLM causes hallucination and GP fixes it). 378 ms for 4 marked sentences over 100,574 words read |
| 0.103.0 | Two follow-ups from a preview user's reports. A quote whose "…" joins passages too far apart to be one quote, each part word for word in the source, stays not found and shows each part in its source (`CheckedEvidence.parts`); splitting it into verified quotes instead, tried first, would have labelled 10 recorded wrong answers **Quotes found** and no right one (`bench:rescore --labels`, 12 of 7,986 answers changed, all wrong). A long online paper read part after part gets its outline again at the third part in a row, after the part asked for, once ([CS suite](../eval/cs/README.md#reading-a-long-paper-part-after-part-second-attempt-01030)): no benchmark task's requests change, and on the user's three questions live it never showed, so both sides ran the same. Labels unchanged |
