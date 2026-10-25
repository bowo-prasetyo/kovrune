# Kovrune
Think Freely. Build Together. Stay Decentralized. 

An open-source, browser-first, peer-to-peer agentic AI ecosystem for research and software development.

## Design

See [`docs/design.md`](docs/design.md) for the product definition, architecture, security model, and roadmap.

## Status

- **M0 (benchmark gate): provisional go.** See [`docs/m0-benchmark.md`](docs/m0-benchmark.md#m0-status). Help confirm it by running the benchmark on a 16 GB laptop: [issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9).
- **M1 (local research agent): in progress.** See [`docs/m1-plan.md`](docs/m1-plan.md). The app runs a model in your browser or on a local model server, and answers questions about your own documents with verified quotes. Open sources (Wikipedia, OpenAlex) come in slice 4.

## Running the app

You need Node.js 22 or newer. Start the app and open the address it prints:

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

Then add documents (PDF, text, Markdown or HTML) and ask a question. You see each step the model takes, then the answer with the passages it quoted. Each quote is checked against your document:
- **Quotes found**: every quote is word for word in your documents. This proves the quotes are real, not that the answer is right; check that they support the whole answer.
- **Quotes not found** or **No quotes**: the answer isn't backed by your documents, so check it yourself.
- **Not found in your sources**: the model found no answer in your documents.

Documents stay on your device and are kept only until you reload the page. Scanned PDFs without a text layer cannot be read.

Nothing you type or add is sent to an online AI service. The app's only network requests are the model download (Hugging Face, plus WebLLM's runtime library from GitHub) and the model server you connect it to.

## Development

```bash
npm test                  # unit tests, evaluation set checks
npm run typecheck
npm run build             # production build of the app into dist/app
npm run bench:browser     # M0 benchmark page (WebLLM)
npm run bench:endpoint    # M0 benchmark against a local model server
```

Product code lives in `src/` (`agent/`, `tools/`, `models/`, `app/`); the benchmark in `eval/` imports it, so benchmark results measure the code the app runs.

## License

[Mozilla Public License 2.0](LICENSE)
