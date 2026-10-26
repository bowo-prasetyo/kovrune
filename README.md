# Kovrune
Your documents. Your machine. Answers you can check.

Kovrune is an open-source, local-first research app. Ask a question about your own documents, and optionally Wikipedia and scholarly papers, and get an answer that quotes its sources. Kovrune checks that every quote is really in the source. The AI model runs on your computer, in the browser or on a local model server, so nothing is sent to an online AI service.

## Where we're going

Research is the first part of a longer plan, captured in the project's motto: *Think Freely. Build Together. Stay Decentralized.* These are planned, not built:

- **A coding agent** that proposes changes and checks them by running tests in a sandbox in the browser (milestone M2.5).
- **Kovrune Circles:** small groups of invited peers, such as a lab or a team, who can hand tasks to each other's agents (M3 and later).

Kovrune has no tokens, no blockchain and no central AI service. See [`docs/design.md`](docs/design.md) for the product definition, architecture, security model, and roadmap.

## Status

- **M0 (benchmark gate): provisional go.** See [`docs/m0-benchmark.md`](docs/m0-benchmark.md#m0-status). Help confirm it by running the benchmark on a 16 GB laptop: [issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9).
- **M1 (local research agent): in progress.** See [`docs/m1-plan.md`](docs/m1-plan.md). The app runs a model in your browser or on a local model server, and answers questions about your own documents with verified quotes. It can also search Wikipedia and OpenAlex (scholarly papers) when you choose to.

## Running the app

**Try the preview:** <https://bowo-prasetyo.github.io/kovrune/> in Chrome or Edge. It is published from `main` by GitHub Actions and is not yet a signed release.

The [user guide](docs/user-guide.md) covers setup step by step, including llama.cpp on Windows with WSL, and troubleshooting. To run the app locally instead, you need Node.js 22 or newer; start it and open the address it prints:

```bash
npm ci
npm run dev
```

The setup wizard checks your device and recommends where to run the model:

- **In the browser**, on computers with a capable GPU (Apple silicon, recent NVIDIA or AMD) in a browser with WebGPU, such as Chrome or Edge. The page downloads the model once from Hugging Face (2.4 GB for the recommended Qwen3.5-4B, 1.1 GB for the lighter Qwen3.5-2B) and keeps it in the browser's storage. GPUs without 16-bit shader support get a slower 32-bit version.
- **On a local model server**, everywhere else, including laptops with integrated Intel graphics. [llama.cpp server](https://github.com/ggml-org/llama.cpp) is the supported one; Ollama is experimental. Start it with the recommended [Qwen3.5-4B (Q4_K_M)](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf):
  ```bash
  llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
  ```
  On an 8 GB laptop, Qwen3.5-2B is lighter but answers fewer questions correctly. If the browser and the server run on different systems (for example Windows and WSL), add `--host 0.0.0.0`.

Either way, the wizard then tests the model (about a minute on capable hardware) and saves your setup in the browser.

Then add documents (PDF, text, Markdown or HTML), or tick Wikipedia or OpenAlex to search those too, and ask a question. You see each step the model takes, then the answer with the passages it quoted. Each quote is checked against your document:
- **Quotes found**: every quote is word for word in your documents, and every sentence of the answer shares most of its words with a quote. This proves the quotes are real, not that the answer is right; check that they support the whole answer.
- **3 of 5 sentences backed by a quote**: the quotes are real, but the sentences marked ⚠ share few words with any of them, so they may come from the model's memory.
- **Some quotes not found**, **Quotes not found** or **No quotes**: the answer isn't fully backed by its sources, so check it yourself. For a quote that is nearly right, the closest passage in the source is shown with the differences marked.
- **Not found in your sources**: the model found no answer in your documents.

Documents and answers stay on your device: they are saved in your browser, so they are still there after a reload. A question interrupted by a reload or a lost model server can continue where it stopped. An answer can be exported as Markdown, with its quotes and sources, and the papers it cites as BibTeX. Scanned PDFs without a text layer cannot be read.

Nothing you type or add is sent to an online AI service. The app's network requests are the model download (Hugging Face, plus WebLLM's runtime library from GitHub, at fixed versions checked against their SHA-256), the model server you connect it to, and, only when you tick them, Wikipedia and OpenAlex searches.

## Development

```bash
npm test                  # unit tests, evaluation set checks
npm run typecheck
npm run build             # production build of the app into dist/app
npm run checksums         # SHA-256 of every built file, to compare with a release
npm run bench:browser     # M0 benchmark page (WebLLM)
npm run bench:endpoint    # M0 benchmark against a local model server
```

Releases are built from version tags and can be rebuilt byte for byte; see [`docs/releases.md`](docs/releases.md).

Product code lives in `src/` (`agent/`, `tools/`, `models/`, `app/`); the benchmark in `eval/` imports it, so benchmark results measure the code the app runs.

## License

[Mozilla Public License 2.0](LICENSE)
