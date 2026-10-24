# M0 Benchmark Gate

M0 decides whether models small enough to run in a browser can do Kovrune's agent work well enough to be the primary path (see [design §12](design.md#12-roadmap)). This document defines the evaluation set, the procedure, the go/no-go thresholds, and where results are recorded.

**Status:** harness and evaluation set complete. Reference-hardware runs are pending (see [Results](#results)).

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

34 tasks in [`eval/tasks/`](../eval/tasks/), all scored without a model judge.

### Research: 22 tasks

The agent answers questions using `search`, `read`, and `final_answer` over a fixed set of 14 documents ([`corpus.ts`](../eval/tasks/corpus.ts)). **Every project, person, and number in the corpus is fictional**, so models cannot answer from memory. Some documents are deliberately superseded by later ones.

| Kind | Count | What it tests |
| --- | --- | --- |
| Lookup | 9 | Find and report a single fact |
| Multi-hop | 5 | Combine facts across documents |
| Comparison | 2 | Report and compare figures from two sources |
| Contradiction | 3 | Prefer a later correction over an earlier claim |
| Unanswerable | 3 | Report `found: false` instead of inventing an answer |

A research task passes when the agent finishes, reports `found` correctly, includes every required fact (any accepted spelling), cites at least one acceptable document for each required source, and cites no document that does not exist.

### Coding: 12 tasks

Nine "implement" and three "fix the bug" tasks in plain JavaScript ([`coding.ts`](../eval/tasks/coding.ts)). The agent can call `run_tests` on the visible tests before submitting with `final_answer`. A task passes when the submission passes all visible **and hidden** tests, run in a worker with a timeout.

The harness sandbox is not a security boundary; it only runs code the model under test wrote for these fixed tasks. The real sandbox is milestone M2.5.

### Validating the set

`npm test` checks that every coding task is solvable (a reference solution passes all its tests), every bug-fix starter fails at least one test, and every required research fact appears in an acceptable cited document.

### Known limits

- Fact checks are substring matches, so an answer that mentions the right value in the wrong role can still pass. Required citations and the number of fact groups per task reduce this, but results should be read alongside the recorded action traces.
- Agent budgets are fixed: 8 calls and 256 output tokens per call for research; 6 calls and 768 tokens for coding.
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

```bash
# Ollama
npm run bench:endpoint -- --base-url http://localhost:11434/v1 --model qwen3:8b \
  --context 8192 --hardware-class 2 --out eval/results/qwen3-8b-ollama-class2.json

# llama.cpp server running a Qwen3 model, with thinking disabled
npm run bench:endpoint -- --base-url http://localhost:8080/v1 --model qwen3 \
  --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --out eval/results/qwen3-llamacpp.json
```

Options: `--preset full|quick`, `--suites research,coding`, `--modes constrained,unconstrained`, `--tasks r01-lumen-maintainer,c01-slugify`, `--ignore-self-check`, `--notes "..."`. Press Ctrl+C to stop early; the report still includes the completed tasks.

### What happens during a run

1. **Self-check.** After loading, the model gets one short research prompt and must reply with a valid action. This takes about a minute even on slow hardware. It also measures decode speed and shows the worst-case time for one research task. If it fails, the run does not start, and the log shows the model's raw output and a hint. Tick **Run even if the self-check fails** (or pass `--ignore-self-check`) to run anyway.
2. **Live progress.** Every model call is logged as it finishes, with its action (or, for an invalid reply, the error and the start of the output), time and speed. For example: `call 2: search {"query":"LumenDB license"} (14.2 s, 3.1 tok/s)`.
3. **Stopping early.** **Stop** (or Ctrl+C) discards only the task in progress. The report is still produced and downloadable, marked as stopped early (`"complete": false`).

### Task sets

| Set | Tasks | Use |
| --- | --- | --- |
| Full | All 34 | Gate results. Only a complete full run of both suites can pass the gate. |
| Quick | 8: `r01`, `r03`, `r10`, `r16`, `r17`, `r20`, `c01`, `c03` | First checks and slow machines. Covers every task kind; not enough for the gate. |

On slow machines, start with the Quick set in constrained mode only. Use the self-check's time estimate to decide whether a full run is practical.

### Troubleshooting

| Symptom | Likely cause | What to try |
| --- | --- | --- |
| Self-check fails with garbled or empty output (wllama) | WebGPU produces broken output on some integrated GPUs | Set **GPU layers** to 0 to run on the CPU |
| WebLLM model fails to load; Environment shows `"shaderF16": false` | The GPU lacks 16-bit shader support, which `q4f16` models need | Use the wllama runtime |
| Every call is valid but tasks hit the call limit (8/8) | The model searches repeatedly without answering | A model quality result; record it |
| Calls take minutes each | Hardware below the model's needs | Try a smaller model or the Quick set, and record the speed |

## Go/no-go gate

A **single run** passes the gate when, in constrained mode:

| Criterion | Threshold |
| --- | --- |
| Research task success | ≥ 60% |
| Valid action rate (all suites) | ≥ 95% |
| Decode speed | ≥ 10 tokens/s |
| Median research task time | ≤ 60 s |

The harness evaluates these automatically and includes the result in every report (`gate`).

**M0 decision:**

- **Go (browser-first):** at least one WebLLM or wllama candidate passes the gate on **hardware class 2**. That model becomes the default catalog model for M1.
- **No-go (endpoint-first):** no browser candidate passes on class 2. The local endpoint adapter becomes the primary path for agent work in M1; the browser runtime is positioned for lighter tasks (single-step Q&A, embeddings), and the roadmap is adjusted.

Either way, class 1 and class 3 results set the minimum and recommended hardware published with M1.

## Results

Reports live in [`eval/results/`](../eval/results/). Add new rows here when you commit a report.

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
- **Prefill is unusually slow** (2.1 tokens/s), which suggests the WebAssembly build adds a large overhead on top of the hardware limit. A native run of the same model on the same laptop (Ollama via `npm run bench:endpoint`) would separate the two; it has not been done yet.

These are single-task observations, not gate results: a gate result needs a complete full run.

### Harness smoke test (not a gate result)

To prove the browser path works end to end, the harness was run in headless Chromium on a 4-core cloud container with no GPU, using wllama and the 0.8B smoke-test model on two research tasks. The model loaded in 31 s, produced 100% valid actions under constrained decoding, and failed both tasks (0/2) at about 5 tokens/s, using the container's software-emulated WebGPU.

This confirms model download from a pinned revision, loading, constrained decoding, tool execution, scoring, and reporting. It says nothing about reference hardware: the container has no GPU, and the model is far below candidate size.
