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

**Use the preview site:** open <https://kovrune.pages.dev/> in Chrome or Edge. Nothing needs installing for the app itself; the model runs on your computer either way (section 2).

The preview is built automatically from the latest `main` by GitHub Actions and served by Cloudflare Pages; the commit it was built from is shown at the bottom of the page. It is not yet a signed release, so if you prefer to run code you built yourself, run the app locally instead.

**Used the old address?** The preview used to be at `bowo-prasetyo.github.io/kovrune`, which now forwards here. Browsers keep saved data separately for each site, so if you saved documents or answers there, the old address shows how many and offers **Download a backup**; restore it here under **Storage and backup**. Models are downloaded again at the new address, and the browser asks for its permissions again.

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

**In the browser**, pick a model. Kovrune suggests Qwen3.5-2B on devices with 8 GB of memory or less. The download happens once and is stored in the browser; **Delete the download** frees the space again. Kovrune downloads a fixed version of each model and checks every file against its published SHA-256 checksum before using it, in a short **Checking the download** step at the end of the first load. If a file doesn't match, the download is deleted and the model isn't used. If the GPU lacks 16-bit shader support, Kovrune uses a 32-bit version of the model, which needs more memory and runs slower.

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
| [Qwen3.5-4B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf) | 2.6 GB | Better answers. Choose it when a question needs several sources (for example your PDF and Wikipedia), or when accuracy matters more than speed |
| [Qwen3.5-2B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf) | 1.2 GB | Faster. Good for questions one of your documents answers; often answers from one source only |

On a laptop with 8 GB of memory and integrated Intel graphics, both run on the processor:

| Model | Model test speed | A question about one PDF | A question using a PDF, Wikipedia and OpenAlex |
| --- | --- | --- | --- |
| Qwen3.5-2B | about 8 tokens/s | 1–2 minutes | 2–3 minutes, often from one source only |
| Qwen3.5-4B | about 5.5 tokens/s | 3–4 minutes (estimated from the speed) | about 7 minutes, combining the sources |

The model test shows your own speed and how long a research task can take. You can download both models and switch between them ([below](#switch-models)).

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

### Switch models

1. In the terminal where `llama-server` runs, press **Ctrl+C** to stop it.
2. Start it again with the other model file after `-m`, for example `./llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --host 0.0.0.0 --port 8080`, and wait for `listening on`.
3. In the app: **Change setup** → **Use a local model server** → **Connect** (it lists the new model) → **Test this model**. The header then names the new model.

**Change setup** doesn't throw your setup away. The setup steps show it as **Current setup**, with its last model test (date and speed), and it stays in use until a new setup passes its test. **Keep current setup** goes back to your questions without changing anything. The research screen also shows the last test next to the setup's name.

If the server fails to start or the computer becomes very slow with the bigger model, close other programs, especially browser tabs, and try again.

**On the preview site,** the page is on the web and the server is on your computer, so Chrome and Edge need your permission for the site to reach it. That permission is called **Apps on device** ("Access other apps and services on this device"). When the browser asks, choose **Allow**. If it doesn't ask, or you blocked it, click the icon left of the address bar → **Site settings** → set **Apps on device** to **Allow**, then reload the page. **Local network access** is a different permission, for other devices on your network, and isn't needed for a server on your own computer. llama.cpp server accepts requests from any site by default; for Ollama, add the site to `OLLAMA_ORIGINS` (for example `OLLAMA_ORIGINS=https://kovrune.pages.dev`).

### Use a model server on another computer

If your laptop is slow but you have a faster computer on the same network, such as a desktop with a GPU or more memory, run the server there and use Kovrune on the laptop. Answers come at the desktop's speed, and the desktop can run the bigger Qwen3.5-4B even when the laptop can't.

**On the desktop:**
1. Set up llama.cpp and start the server as above, with `--host 0.0.0.0` so other computers can reach it, and with an API key so that only you can use it. Make a key and note it, then pass it to the server:
   ```bash
   KEY=$(openssl rand -hex 16); echo "$KEY"
   ./llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --host 0.0.0.0 --port 8080 --api-key "$KEY"
   ```
2. Find its IP address on your network, for example `192.168.1.20`: `ipconfig` on Windows (IPv4 Address), `ipconfig getifaddr en0` on macOS, `hostname -I` on Linux.
3. Allow incoming connections on port 8080 in its firewall. Windows asks the first time `llama-server` starts; choose **Private networks**.
4. If the server runs in WSL, other computers can't reach it by default. WSL's mirrored networking mode (`networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`) makes it reachable; Microsoft's [WSL networking guide](https://learn.microsoft.com/windows/wsl/networking) has the steps, including the firewall rule it may need.

**On the laptop,** in the app: **Use a local model server** → change the address to `http://192.168.1.20:8080/v1` (your desktop's address) → enter the key under **API key** → **Connect** → **Test this model**. The key is saved in this browser with the rest of the setup; without it, or with a wrong one, **Connect** says the server refused the request.

- **On the preview site,** Chrome and Edge ask for the **Local network access** permission; choose **Allow**. This is the other permission from the one above: **Apps on device** covers servers on your own computer, **Local network access** covers other devices.
- **Use the IP address, or a name ending in `.local`** (Macs have one, such as `my-desktop.local`). From the preview site, the browser blocks other names, such as `my-desktop` or `my-desktop.lan`, even with the permission allowed.
- **Only on a network you trust,** such as your home network. The API key stops others on the network from using your server, but the connection isn't encrypted: your questions, the passages of your documents the model reads, and the key itself travel to the desktop in the clear, and anyone on the same network could read them. Don't do this on public, office or campus Wi-Fi.

## 4. Ask questions

1. **Add documents:** PDF, text, Markdown or HTML, with **Choose files** or by dropping them on the page. **Show text** shows what Kovrune read from a file.
2. **Choose where to search.** Your documents are always searched. Tick **Wikipedia** (with its language) or **OpenAlex** (scholarly papers) to search those too; with either ticked, you can ask questions without adding documents.
   - Your documents come first: the model reads what it finds in them before it may search the others.
   - Then every source you ticked is searched before the answer, and the answer combines them: your documents for what is specific to them, the others for background and what your documents don't cover. Each quote names its source.
   - Each ticked source adds a step or two, so an answer takes a little longer. Leave them unticked for answers from your documents only.
   - Combining sources works best with Qwen3.5-4B. Qwen3.5-2B often answers from one source only.
3. **Type a question and press Ask.** You see each step: what the model searched for, how much each search found ("5 results", "nothing found"), and what it read. A source that found results but isn't quoted in the answer was searched, and the model chose not to use it. If the model is about to say the answer isn't there without having read anything its search found, it is asked once to read first; if it answers in another language than your question, it is asked once to use yours. The step says so. **Stop** ends the run at any time.

Tips:

- Ask about one document at a time, with words that appear in it.
- Documents can be in any language, including Chinese, Japanese, Korean and Thai, which are written without spaces. You can ask in another language than a document's: when your documents are in another writing system than your search, such as Japanese documents and an English question, each search is also translated, and the best match in that language is added (the step says "Found by searching the Japanese documents for …"). Between languages that share an alphabet, such as English and French, searches are not translated, so ask about a French document in French, or use words both languages share, such as names. Accents don't matter: "energie" finds "énergie".
- With a small model, an answer takes a minute or two.
- Documents stay in the list after a reload: their text is saved in this browser. **Remove** deletes a document's saved copy. In a private window, or when the browser blocks site data, they are kept only until you reload, and the page says so.
- Scanned PDFs (images without a text layer) can't be read.

**If a question is interrupted.** Kovrune saves each step of a question as it goes. If the page is closed or reloaded, or the browser crashes, the page shows the question as **Interrupted** the next time:
- **Continue** picks up where it stopped. The steps already done are restored without asking the model again, so the answer comes sooner. The trace notes how many steps were restored.
- **Ask again from the start** puts the question back in the box; **Discard** forgets it.
- If a document the question searched has been removed, or you changed the model setup, it can only be asked again.

If the model server stops answering in the middle of a question, start it again and press **Continue from step N** under the error. **Stop** discards the question's progress.

## 5. Reading the answer

Each answer has a label:

| Label | Meaning |
| --- | --- |
| **Quotes found** | Every quote is word for word in its source, and every sentence of the answer shares most of its words with a quote, with no number or "not" that no quote has. A short answer, such as "4 KiB" or "1987年", is too short to compare word by word, so it gets this label only when the model confirms it, as below. Last, the model reads the quoted passages again and confirms that they state what the answer says. This proves the quotes are real, **not** that the answer is right: a small model often confirms its own answer. Check that they support the whole answer. |
| **Quotes found, answer not confirmed** | The quotes are real, but when the model read the quoted passages again, it said they state only part of the answer, or do not answer the question, or gave no clear reply. A number or a condition may differ from the source, or part of the answer may be missing: check it against the sources. |
| **Quotes found, answer too short to check** | Shown on answers saved by earlier versions, which did not ask the model about short answers. Every quote is word for word in its source, but the answer, such as a name, a number or a version, is too short to compare with them. Short answers are often wrong even with real quotes, for example a version that fixed a problem when the question asked which versions it affected: check that the quotes answer your question. |
| **3 of 5 sentences backed by a quote** | Every quote is in its source, but the sentences marked ⚠ share few words with the quotes, or have a number or a "not" that no quote has. Small models often add details from memory next to real quotes; check the marked sentences against the sources. |
| **Some quotes not found (2 of 3 found)** | Only some quotes are in their sources. Check the answer against the sources, starting with the quotes marked ✗. |
| **Quotes not found** | None of the quotes are in the cited sources. The answer may be wrong. |
| **No quotes** | The model answered without quoting anything, so nothing backs the answer. |
| **Not found in your sources** | The model found no answer in what it searched. This is often the right answer. |

Under **Evidence**, each quote shows ✓ (found) or ✗ (not found), and the document it came from. Quotes must match whole words; capitals, quote marks, list bullets and hyphens inside words don't matter. A quote may leave words out with "...": it is found when its parts are in the source in that order, close together, and the passage shown includes the words it left out. For a quote that is mostly real but not word for word (at least 70% of its words appear in order in one passage), Kovrune shows the **closest passage** with the differences marked: highlighted words are in the source, struck-out words appear only in the quote. Small models often start with a real sentence and finish it from memory, and this shows where they did. Wikipedia and OpenAlex sources link to the page and show when it was retrieved. For a quote from a PDF, the page it is on is shown next to the document's name, for example "p. 4". Under each quote that was found, **Show in the source** opens the passage around it, as it is in the document, with the quoted words highlighted.

### Past answers and export

Each finished answer is saved in the browser and listed under **Past answers**, newest first, with when it was asked and which model answered. Open one to see it as it was, with its label, evidence and steps. It still shows a document's name and pages after you remove the document. An open answer has its own address (`…/answers/…`), so you can bookmark it; it opens only in the browser that saved it.

The browser's **Back** and **Forward** buttons move between the setup steps and past answers, and a reload stays on the same screen.

- **Export as Markdown** saves the question, the label, the answer (with ⚠ marks), each quote with its source and page, and the steps, as a `.md` file.
- **Export papers as BibTeX** appears when the answer cites OpenAlex papers, and saves a `.bib` file with their authors, year, venue and DOI.
- **Delete** removes one answer; **Delete all saved answers** removes them all. Documents and models are kept.

Exports are made in the browser; nothing is uploaded.

### Storage and backup

**Storage and backup**, at the bottom of the research screen, shows what Kovrune keeps in this browser:
- **Space used:** how much Kovrune uses, and how much the browser allows it.
- **Protected or not protected:** browsers may clear a site's data without asking when the disk runs low, and Safari after a week without use. **Ask the browser to keep it** asks for protection. Chrome and Edge decide from how you use the site, so they may decline at first.
- **Downloaded models:** each one with its size, and **Delete** to free the space. The model in use can't be deleted; change the setup to another model first.

**Download a backup** saves your documents' text and your saved answers in one `.json` file. **Restore from a backup** adds them back, in this browser after it cleared its data, or in another browser. Restoring only adds what is missing; a document with the same name but different text is added alongside the one already here. Models and the setup aren't in the backup: download the model again and redo the setup.

If the browser's storage for Kovrune is full, saving a document or an answer fails with a message saying so. Free space under **Storage and backup**, for example by deleting a model you don't use, or free disk space.

## 6. Privacy

- **The model runs on your computer.** Nothing is sent to an online AI service.
- **Your documents** are read in the browser and never uploaded.
- **Wikipedia and OpenAlex** are off by default. When you tick them, the search words the model chooses and the pages it reads are requested from those services. Your documents and your question as you typed it are not sent.
- **Other network requests:**
  - the browser path downloads the model from Hugging Face, and WebLLM's runtime library from GitHub, both at fixed versions that are checked against published checksums;
  - the local-server path talks only to the server address you entered. If that server is on another computer, your questions and the passages the model reads go to it over your network ([section 3](#use-a-model-server-on-another-computer)).
- **Saved in the browser:** your setup, your source choices, and the text extracted from your documents (not the original files). Finished answers are saved too, with their quotes and steps. They stay on this computer, in this browser only. Removing documents or answers never removes a downloaded model; clearing the site's data in the browser settings removes everything, models included.

## 7. Troubleshooting

| Problem | Cause | Fix |
| --- | --- | --- |
| `couldn't bind HTTP server socket ... port: 8080` | Another server (often an earlier llama-server) is using the port | `ss -ltnp \| grep 8080` shows it; stop it with `pkill -x llama-server`, or start on another port (`--port 8081`) and use that address in the app |
| `failed to open GGUF file ... No such file or directory` | Wrong model path | `find ~ -name "*.gguf"` and use the full path of your model (not a `ggml-vocab` file) |
| `HTTPS is not supported` with `-hf` | llama.cpp was built without SSL | Download the model with `curl` as in [section 3](#download-a-model), or rebuild after `sudo apt install libssl-dev` |
| **Connect** says it couldn't reach the server | The server isn't running, listens only inside WSL, or uses another port | Start it with `--host 0.0.0.0`; if Windows still can't reach WSL, use the address from `hostname -I` in WSL |
| **Connect** fails on the preview site but works with `npm run dev`. The browser console (F12) shows "Permission was denied for this request to access the `loopback` address space" | The browser blocked the web page from reaching servers on your computer | Icon left of the address bar → **Site settings** → **Apps on device**: **Allow**, then reload. **Local network access** is not the one. Safari may block it entirely; use Chrome or Edge |
| **Connect** to a server on another computer fails | The server listens only on its own computer, its firewall blocks the port, or the browser blocked the request | Start it with `--host 0.0.0.0` and allow port 8080 in its firewall. On the preview site, use its IP address or `.local` name and set **Local network access** to **Allow** ([section 3](#use-a-model-server-on-another-computer)) |
| The model test fails with garbled output | The browser path on a GPU that runs models incorrectly | Use a local model server |
| The model test says the model is "not acting on tool results" | Server problem with multi-step conversations (seen with Ollama) | Use llama.cpp server with the same model file |
| An answer takes many minutes | Slow hardware, or the server is short of memory | Use Qwen3.5-2B, close other programs, and stop Ollama if it's running (`sudo systemctl stop ollama`) |
| The model test reports far fewer tokens/s than the table in [section 3](#download-a-model), and the first request is the slowest | The model is short of memory: other programs (large spreadsheets, many browser tabs) use it, so parts of the model are moved to disk. WSL gets only half the computer's memory by default | Close those programs and test again. With WSL, give it more memory: in `%UserProfile%\.wslconfig` put `[wsl2]` and `memory=6GB` on two lines, run `wsl --shutdown`, and start the server again. In WSL, `free -h` shows whether swap is in use |
| "Wikipedia could not be reached" | No internet connection, or the network blocks it | Check the connection; the research continues with the other sources |
| "OpenAlex is busy (too many requests)" | OpenAlex limits how often anonymous users may search, and many questions in a short time reach the limit | Wait a few minutes. The answer meanwhile comes from your other sources, and the search's step in the trace ends with "failed" |
| A PDF shows "No text found" | The PDF is scanned images | Use a PDF with selectable text |

Still stuck? Open an issue at <https://github.com/bowo-prasetyo/kovrune/issues> with what you did, what you saw, and your OS and browser.
