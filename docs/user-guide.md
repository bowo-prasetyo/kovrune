# Kovrune user guide

Kovrune answers questions about your documents, and optionally Wikipedia and scholarly papers, with an AI model that runs on your own computer. Every answer quotes its sources, and Kovrune checks that each quote is really in the source.

- [1. Start the app](#1-start-the-app)
- [2. Choose where the model runs](#2-choose-where-the-model-runs)
- [3. Set up a local model server](#3-set-up-a-local-model-server)
- [4. Ask questions](#4-ask-questions)
- [5. Reading the answer](#5-reading-the-answer)
- [6. Privacy](#6-privacy)
- [7. Troubleshooting](#7-troubleshooting)

## 1. Start the app

**Use the preview site:** open <https://bowo-prasetyo.github.io/kovrune/> in Chrome or Edge. Nothing needs installing for the app itself; the model runs on your computer either way (section 2).

The preview is published automatically from the latest `main` by GitHub Actions; the commit it was built from is shown at the bottom of the page. It is not yet a signed release (that comes in milestone M2), so if you prefer to run code you built yourself, run the app locally instead.

**Or run it locally.** You need [Node.js](https://nodejs.org/) 22 or newer and git. In a terminal:

```bash
git clone https://github.com/bowo-prasetyo/kovrune.git
cd kovrune
npm ci
npm run dev
```

Open the address it prints, usually `http://localhost:5173/`, in Chrome or Edge. To update later, in the same `kovrune` folder:

```bash
git pull
npm ci
npm run dev
```

On Windows with WSL, run these commands in the WSL terminal and open the address in your Windows browser.

Settings and downloaded browser models are stored per site: the preview site and a local copy each have their own.

## 2. Choose where the model runs

The first screen checks your device and recommends one of two options:

| Option | Good for | What you need |
| --- | --- | --- |
| **In this browser** | Apple silicon Macs, laptops with a recent NVIDIA or AMD GPU | Chrome or Edge, and space for a one-time download (2.4 GB for Qwen3.5-4B, 1.1 GB for Qwen3.5-2B) |
| **Local model server** | Everything else, including laptops with integrated Intel graphics | llama.cpp, set up once ([section 3](#3-set-up-a-local-model-server)) |

You can choose the other option anyway. Either way, the next step tests the model, which takes about a minute on suitable hardware, and your choice is saved in the browser.

**In the browser**, pick a model. Kovrune suggests Qwen3.5-2B on devices with 8 GB of memory or less. The download happens once and is stored in the browser; **Delete the download** frees the space again. If the GPU lacks 16-bit shader support, Kovrune uses a 32-bit version of the model, which needs more memory and runs slower.

## 3. Set up a local model server

[llama.cpp](https://github.com/ggml-org/llama.cpp) server is the supported local server. Ollama works but is experimental: in testing, some versions repeated the same step instead of answering.

### Install llama.cpp

Get a release from the [llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases), or build it. To build on Linux or WSL:

```bash
sudo apt install build-essential cmake git libssl-dev
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build
cmake --build build --config Release -j
```

The server is then at `build/bin/llama-server`. `libssl-dev` gives it HTTPS support. Without it, the `-hf` download option fails with "HTTPS is not supported", and you'll need to download the model yourself as below.

### Download a model

Download one model file into a folder of your choice, for example `~/models`:

| Model | Size | Use |
| --- | --- | --- |
| [Qwen3.5-4B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf) | 2.6 GB | Recommended: better answers |
| [Qwen3.5-2B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf) | 1.2 GB | Lighter and faster, for 8 GB laptops |

```bash
mkdir -p ~/models
curl -L -o ~/models/Qwen3.5-2B-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf
ls -lh ~/models    # the file should be about 1.2G; a few KB means an error page
```

The `.gguf` files inside `llama.cpp/models/` (`ggml-vocab-…`) are test files, not models.

### Start the server

```bash
cd ~/llama.cpp/build/bin
./llama-server -m ~/models/Qwen3.5-2B-Q4_K_M.gguf -c 4096 -np 1 --jinja --host 0.0.0.0 --port 8080
```

- Use the real path to your model file after `-m`.
- `--host 0.0.0.0` is needed when the browser and the server run on different systems, such as Windows and WSL.
- Wait for `listening on http://0.0.0.0:8080`, and leave the terminal open while you use Kovrune.

Then, in the app: **Use a local model server** → keep the address `http://127.0.0.1:8080/v1` → **Connect** → **Test this model**.

**On the preview site,** the page is on the web and the server is on your computer, so Chrome and Edge need your permission for the site to reach it. That permission is called **Apps on device** ("Access other apps and services on this device"). When the browser asks, choose **Allow**. If it doesn't ask, or you blocked it, click the icon left of the address bar → **Site settings** → set **Apps on device** to **Allow**, then reload the page. **Local network access** is a different permission, for other devices on your network, and isn't needed for a server on your own computer. llama.cpp server accepts requests from any site by default; for Ollama, add the site to `OLLAMA_ORIGINS` (for example `OLLAMA_ORIGINS=https://bowo-prasetyo.github.io`).

## 4. Ask questions

1. **Add documents:** PDF, text, Markdown or HTML, with **Choose files** or by dropping them on the page. **Show text** shows what Kovrune read from a file.
2. **Choose where to search.** Your documents are always searched, and come first: the model can use Wikipedia or OpenAlex only after it has read one of your documents, or when searching your documents found nothing. Tick **Wikipedia** (with its language) or **OpenAlex** (scholarly papers) to search those too; with either ticked, you can ask questions without adding documents.
3. **Type a question and press Ask.** You see each step: what the model searched for and what it read. **Stop** ends the run at any time.

Tips:

- Ask about one document at a time, with words that appear in it.
- With a small model, an answer takes a minute or two.
- Documents are kept only until you reload the page.
- Scanned PDFs (images without a text layer) can't be read.

## 5. Reading the answer

Each answer has a label:

| Label | Meaning |
| --- | --- |
| **Quotes found** | Every quote is word for word in its source. This proves the quotes are real, **not** that the answer is right: check that they support the whole answer. |
| **Some quotes not found (2 of 3 found)** | Only some quotes are in their sources. Check the answer against the sources, starting with the quotes marked ✗. |
| **Quotes not found** | None of the quotes are in the cited sources. The answer may be wrong. |
| **No quotes** | The model answered without quoting anything, so nothing backs the answer. |
| **Not found in your sources** | The model found no answer in what it searched. This is often the right answer. |

Under **Evidence**, each quote shows ✓ (found) or ✗ (not found), and the document it came from. Quotes must match whole words. For a quote that is mostly real but not word for word (at least 70% of its words appear in order in one passage), Kovrune shows the **closest passage** with the differences marked: highlighted words are in the source, struck-out words appear only in the quote. Small models often start with a real sentence and finish it from memory, and this shows where they did. Wikipedia and OpenAlex sources link to the page and show when it was retrieved.

## 6. Privacy

- **The model runs on your computer.** Nothing is sent to an online AI service.
- **Your documents** are read in the browser and never uploaded.
- **Wikipedia and OpenAlex** are off by default. When you tick them, the search words the model chooses and the pages it reads are requested from those services. Your documents and your question as you typed it are not sent.
- **Other network requests:**
  - the browser path downloads the model from Hugging Face, and WebLLM's runtime library from GitHub;
  - the local-server path talks only to the server address you entered.
- **Saved in the browser:** your setup and source choices. Documents and answers aren't saved.

## 7. Troubleshooting

| Problem | Cause | Fix |
| --- | --- | --- |
| `couldn't bind HTTP server socket ... port: 8080` | Another server (often an earlier llama-server) is using the port | `ss -ltnp \| grep 8080` shows it; stop it with `pkill -x llama-server`, or start on another port (`--port 8081`) and use that address in the app |
| `failed to open GGUF file ... No such file or directory` | Wrong model path | `find ~ -name "*.gguf"` and use the full path of your model (not a `ggml-vocab` file) |
| `HTTPS is not supported` with `-hf` | llama.cpp was built without SSL | Download the model with `curl` as in [section 3](#download-a-model), or rebuild after `sudo apt install libssl-dev` |
| **Connect** says it couldn't reach the server | The server isn't running, listens only inside WSL, or uses another port | Start it with `--host 0.0.0.0`; if Windows still can't reach WSL, use the address from `hostname -I` in WSL |
| **Connect** fails on the preview site but works with `npm run dev`. The browser console (F12) shows "Permission was denied for this request to access the `loopback` address space" | The browser blocked the web page from reaching servers on your computer | Icon left of the address bar → **Site settings** → **Apps on device**: **Allow**, then reload. **Local network access** is not the one. Safari may block it entirely; use Chrome or Edge |
| The model test fails with garbled output | The browser path on a GPU that runs models incorrectly | Use a local model server |
| The model test says the model is "not acting on tool results" | Server problem with multi-step conversations (seen with Ollama) | Use llama.cpp server with the same model file |
| An answer takes many minutes | Slow hardware, or the server is short of memory | Use Qwen3.5-2B, close other programs, and stop Ollama if it's running (`sudo systemctl stop ollama`) |
| "Wikipedia could not be reached" | No internet connection, or the network blocks it | Check the connection; the research continues with the other sources |
| A PDF shows "No text found" | The PDF is scanned images | Use a PDF with selectable text |

Still stuck? Open an issue at <https://github.com/bowo-prasetyo/kovrune/issues> with what you did, what you saw, and your OS and browser.
