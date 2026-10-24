# Kovrune
Think Freely. Build Together. Stay Decentralized. 

An open-source, browser-first, peer-to-peer agentic AI ecosystem for research and software development.

## Design

See [`docs/design.md`](docs/design.md) for the product definition, architecture, security model, and roadmap.

## Status

- **M0 (benchmark gate): provisional go.** See [`docs/m0-benchmark.md`](docs/m0-benchmark.md#m0-status). Help confirm it by running the benchmark on a 16 GB laptop: [issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9).
- **M1 (local research agent): in progress.** See [`docs/m1-plan.md`](docs/m1-plan.md). Slice 1 adds the app's setup wizard; asking questions about your documents comes in slice 2.

## Running the app

You need Node.js 22 or newer and a local model server. [llama.cpp server](https://github.com/ggml-org/llama.cpp) is the supported one; Ollama is experimental.

1. Start llama.cpp server with a model, for example the recommended [Qwen3.5-4B (Q4_K_M)](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf):
   ```bash
   llama-server -m Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
   ```
   On an 8 GB laptop, Qwen3.5-2B is lighter but answers fewer questions correctly. If the browser and the server run on different systems (for example Windows and WSL), add `--host 0.0.0.0`.
2. Start the app and open the address it prints:
   ```bash
   npm ci
   npm run dev
   ```
3. Follow the setup wizard: it checks your device, connects to the server, and tests the model in about a minute. Your setup is saved in the browser.

Nothing is sent to an online AI service: the app talks only to the model server you connect it to.

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
