# Kovrune
Think Freely. Build Together. Stay Decentralized. 

An open-source, browser-first, peer-to-peer agentic AI ecosystem for research and software development.

## Design

See [`docs/design.md`](docs/design.md) for the product definition, architecture, security model, and roadmap.

## Status

Kovrune is at milestone **M0**: a benchmark that decides whether browser-sized models can do the agent work. See [`docs/m0-benchmark.md`](docs/m0-benchmark.md) to run it on your hardware and contribute results.

```bash
npm ci
npm test               # validate the evaluation set and harness
npm run bench:browser  # benchmark WebLLM / wllama models in your browser
```

## License

[Mozilla Public License 2.0](LICENSE)
