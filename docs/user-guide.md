# Kovrune user guide

Kovrune answers questions about your documents, and optionally Wikipedia and scholarly papers, with an AI model that runs on your own computer. Every answer quotes its sources, and Kovrune checks that each quote is really in the source.

New here? Start with the [quick start](#1-quick-start). The other sections are for when you need them.

- [1. Quick start](#1-quick-start)
- [2. Set up Kovrune](#2-set-up-kovrune)
  - [Open the app](#open-the-app)
  - [Choose where the model runs](#choose-where-the-model-runs)
  - [Set up llama.cpp](#set-up-llamacpp)
  - [Run the model in the browser](#run-the-model-in-the-browser)
  - [Use a model server on another computer](#use-a-model-server-on-another-computer)
  - [Use Ollama (experimental)](#use-ollama-experimental)
  - [Change the setup or switch models](#change-the-setup-or-switch-models)
- [3. Ask questions and write reports](#3-ask-questions-and-write-reports)
  - [Choose where to search](#choose-where-to-search)
  - [While a question runs](#while-a-question-runs)
  - [Write a report](#write-a-report)
- [4. Read the answer](#4-read-the-answer)
  - [The labels](#the-labels)
  - [The evidence](#the-evidence)
  - [How the checks work](#how-the-checks-work)
- [5. What Kovrune can read](#5-what-kovrune-can-read)
  - [Your documents](#your-documents)
  - [Open sources](#open-sources)
- [6. Past answers, export and backup](#6-past-answers-export-and-backup)
- [7. Privacy](#7-privacy)
- [8. Troubleshooting](#8-troubleshooting)

## 1. Quick start

Kovrune needs an AI model running on your computer. There are two ways; the app checks your device and recommends one.

**With a local model server.** This works on any computer with 8 GB of memory or more, including laptops with integrated Intel graphics. It is the tested path. The first time takes longest: installing llama.cpp and a 2.6 GB download.

1. Install llama.cpp: on Linux or WSL, build it ([below](#install-llamacpp)); on a Mac, `brew install llama.cpp`; on Windows, see the same section.
2. Download the recommended model, Qwen3.5-4B:
   ```bash
   mkdir -p ~/models
   curl -L -o ~/models/Qwen3.5-4B-Q4_K_M.gguf \
     https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf
   ```
3. Start the server, and leave its terminal open while you use Kovrune:
   ```bash
   llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
   ```
   If you built llama.cpp, the command is `~/llama.cpp/build/bin/llama-server`. Wait for `listening on`.
4. Open <https://kovrune.pages.dev/> in Chrome or Edge. Choose **Use a local model server** → **Connect**. When the browser asks to let the site reach **Apps on device**, choose **Allow**.
5. Press **Test this model**. The test takes about a minute.
6. Add a document with **Choose files**, type a question, and press **Ask**.

On an 8 GB laptop, the lighter Qwen3.5-2B is faster but answers fewer questions correctly ([which model](#choose-where-the-model-runs)). If the browser runs in Windows and the server in WSL, add `--host 0.0.0.0` to the command in step 3.

**In the browser** (experimental). This works on Apple silicon Macs and computers with a recent NVIDIA or AMD GPU, in Chrome or Edge.

1. Open <https://kovrune.pages.dev/>. Choose **Run in this browser**.
2. Pick **Qwen3.5-4B** and press **Download and test**. The model is downloaded once (2.4 GB) and kept in the browser.
3. Add a document with **Choose files**, type a question, and press **Ask**.

Then read the label above the answer ([section 4](#the-labels)): it says how far the quotes back the answer. A real quote doesn't prove a right answer, so check the quotes yourself.

## 2. Set up Kovrune

### Open the app

**Use the preview site:** open <https://kovrune.pages.dev/> in Chrome or Edge. Nothing needs installing for the app itself; the model runs on your computer either way.

The preview is built automatically from the latest `main` by GitHub Actions and served by Cloudflare Pages; the commit it was built from is shown at the bottom of the page. It is not a signed release. Signed releases are on the [releases page](https://github.com/bowo-prasetyo/kovrune/releases); to run one, or code you built yourself, run the app locally instead.

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

### Choose where the model runs

The first screen checks your device and recommends one of two options. You can choose the other one anyway. Either way, the next step tests the model, which takes about a minute on suitable hardware, and your choice is saved in the browser.

| Option | Good for | What you need |
| --- | --- | --- |
| **Local model server** | Everything, including laptops with integrated Intel graphics | llama.cpp, set up once ([below](#set-up-llamacpp)) |
| **In this browser** (experimental) | Apple silicon Macs, computers with a recent NVIDIA or AMD GPU | Chrome or Edge with WebGPU, and space for a one-time download (2.4 GB for Qwen3.5-4B, 1.1 GB for Qwen3.5-2B, 0.4 GB for the experimental Qwen3.5-0.8B) |

The browser option is **experimental**. In testing it has answered questions end to end on a laptop with integrated Intel graphics (Iris Xe, 16 GB), but slowly: Qwen3.5-4B ran at about 3 tokens/s, so a question can take up to half an hour, and once the GPU stopped responding. On the same laptop a local server ran the same model at 5.5 tokens/s. It has not yet been measured on an Apple silicon Mac or a dedicated NVIDIA or AMD GPU, where it should be much faster ([issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9)). If the model test is slow or the answers look broken, use a local model server.

**Which model.** Kovrune is tested with two models, the same on both paths:

| Model | Use |
| --- | --- |
| **Qwen3.5-4B** (recommended) | Better answers. Choose it when a question needs several sources (for example your PDF and Wikipedia), when you write reports, or when accuracy matters more than speed |
| **Qwen3.5-2B** | Faster and lighter, for devices with 8 GB of memory or less. Good for questions one of your documents answers; it often answers from one source only, and more of its answers need checking |

The browser path also offers **Qwen3.5-0.8B**, marked **experimental**: the weakest model, for devices with too little memory for Qwen3.5-2B, such as a phone with 4 GB. In testing it answered about 55% of the field questions, against 75% for Qwen3.5-2B, and about 1 in 5 of its answers labelled **Quotes found** were wrong, against 1 in 15. Check every answer against its quoted passages. Kovrune never selects or recommends it, and mentions it only on a device with too little memory for Qwen3.5-2B; a model server on another computer still gives better answers. It may not run there either: on an Android phone reporting 4 GB (Arm Mali GPU), it downloaded and loaded, then the GPU stopped at its first answer, every time. Of the 1.6 GB it needs, about 0.4 GB is the model itself and most of the rest is working memory fixed when the model was built for the browser, so no setting in Kovrune can lower it.

On a laptop with 8 GB of memory and integrated Intel graphics, both run on the processor:

| Model | Model test speed | A question about one PDF | A question using a PDF, Wikipedia and OpenAlex |
| --- | --- | --- | --- |
| Qwen3.5-2B | about 8 tokens/s | 1–2 minutes | 2–3 minutes, often from one source only |
| Qwen3.5-4B | about 5.5 tokens/s | 3–4 minutes (estimated from the speed) | about 7 minutes, combining the sources |

"Tokens/s" is how fast the model writes: a token is about three quarters of a word. The model test shows your own speed and how long a research task can take.

### Set up llama.cpp

[llama.cpp](https://github.com/ggml-org/llama.cpp) server is the supported local server. Setting it up takes three steps: install it, download a model file, and start it. The project tested it on Linux and in WSL (Linux inside Windows); the other ways below install the same server.

#### Install llama.cpp

**On Linux, or Windows with WSL,** build it. To get WSL, run `wsl --install` in PowerShell as administrator, restart, and open **Ubuntu** from the Start menu; run everything below in that terminal.

```bash
sudo apt install build-essential cmake git libssl-dev
cd ~
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build
cmake --build build --config Release -j
```

The server is then at `~/llama.cpp/build/bin/llama-server`. `libssl-dev` gives it HTTPS support. Without it, the `-hf` download option fails with "HTTPS is not supported", and you'll need to download the model yourself as below.

**On a Mac,** install it with [Homebrew](https://brew.sh/): `brew install llama.cpp`. The server is then `llama-server`.

**On Windows without WSL,** download a release from the [llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases): a Windows `.zip` with `cpu-x64` in its name runs on most PCs. Unzip it; the server is `llama-server.exe` in that folder. Download the model in your browser with the link below, and run the commands in PowerShell from that folder with `.\llama-server.exe` and the model file's full path.

In the commands below, `llama-server` stands for the server you installed.

#### Download a model

Download one model file (see [which model](#choose-where-the-model-runs)) into a folder of your choice, for example `~/models`:

| Model | File size |
| --- | --- |
| [Qwen3.5-4B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf) | 2.6 GB |
| [Qwen3.5-2B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf) | 1.2 GB |

The files are in GGUF, llama.cpp's format; "Q4_K_M" means the model is compressed to about 4 to 5 bits per weight, which makes it small enough for a laptop. In a terminal:

```bash
mkdir -p ~/models
curl -L -o ~/models/Qwen3.5-4B-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf
ls -lh ~/models    # the file should be about 2.6G; a few KB means an error page
```

For Qwen3.5-2B, use its link from the table, and name the file `Qwen3.5-2B-Q4_K_M.gguf`. You can download both and [switch between them](#change-the-setup-or-switch-models).

The `.gguf` files inside `llama.cpp/models/` (`ggml-vocab-…`) are test files, not models.

#### Start the server

```bash
llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080
```

Wait for `listening on http://127.0.0.1:8080`, and leave the terminal open while you use Kovrune. What the options do:

- `-m` is the model file: use the real path to yours.
- `-c 4096` gives the model 4,096 tokens of context: what it can see at once, the question, the steps so far and what it read. Kovrune needs at least 2,048.
- `-np 1` serves one request at a time, so that request gets the whole context.
- `--jinja` uses the chat format that comes with the model, which Kovrune needs for the model's actions (search, read, answer).
- `--port 8080` is the port Kovrune connects to.
- Add `--host 0.0.0.0` only when the browser and the server run on different systems, such as Windows and WSL, or [another computer](#use-a-model-server-on-another-computer). It lets other systems on your network reach the server.

If the server fails to start or the computer becomes very slow with the bigger model, close other programs, especially browser tabs, and try again.

#### Connect Kovrune

In the app: **Use a local model server** → keep the address `http://127.0.0.1:8080/v1` → **Connect** → **Test this model**.

**On the preview site,** the page is on the web and the server is on your computer, so Chrome and Edge need your permission for the site to reach it. That permission is called **Apps on device** ("Access other apps and services on this device"). When the browser asks, choose **Allow**. If it doesn't ask, or you blocked it, click the icon left of the address bar → **Site settings** → set **Apps on device** to **Allow**, then reload the page. **Local network access** is a different permission, for other devices on your network, and isn't needed for a server on your own computer.

### Run the model in the browser

The browser path needs WebGPU, which lets a web page use the GPU; recent Chrome and Edge have it. Without WebGPU, the device step offers only the local server.

Pick a model. Kovrune suggests Qwen3.5-2B on devices with 8 GB of memory or less. On a device that reports less memory than even Qwen3.5-2B needs (2.2 GB of GPU memory, plus about 2 GB for the system and the browser), such as a phone with 4 GB, neither model is recommended: loading usually fails near the end, and on a phone the page may just reload without an error. Use [a model server on another computer](#use-a-model-server-on-another-computer) instead, or, when the device has the memory for it, the experimental Qwen3.5-0.8B (1.6 GB of GPU memory; [its limits](#choose-where-the-model-runs)). **Download and test** downloads it once and stores it in the browser; the next time, the button reads **Load and test**. **Delete the download** frees the space again, after asking, since using the model again means downloading it again.

Kovrune downloads a fixed version of each model and checks every file against its published SHA-256 checksum before using it, in a short **Checking the download** step at the end of the first load. If a file doesn't match, the download is deleted and the model isn't used.

If the GPU lacks 16-bit shader support (a feature of newer GPUs that the faster model versions need), Kovrune uses a 32-bit version of the model, which needs more memory and runs slower.

### Use a model server on another computer

If your laptop is slow but you have a faster computer on the same network, such as a desktop with a GPU or more memory, run the server there and use Kovrune on the laptop. Answers come at the desktop's speed, and the desktop can run the bigger Qwen3.5-4B even when the laptop can't. The same works from a phone or tablet, whose memory is too small for the browser models: follow the laptop steps below in its browser.

**On the desktop:**
1. Set up llama.cpp and start the server as above, with `--host 0.0.0.0` so other computers can reach it, and with an API key so that only you can use it. Make a key and note it, then pass it to the server:
   ```bash
   KEY=$(openssl rand -hex 16); echo "$KEY"
   llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf -c 4096 -np 1 --jinja --host 0.0.0.0 --port 8080 --api-key "$KEY"
   ```
2. Find its IP address on your network, for example `192.168.1.20`: `ipconfig` on Windows (IPv4 Address), `ipconfig getifaddr en0` on macOS, `hostname -I` on Linux.
3. Allow incoming connections on port 8080 in its firewall. Windows asks the first time `llama-server` starts; choose **Private networks**.
4. If the server runs in WSL, other computers can't reach it by default. WSL's mirrored networking mode (`networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`) makes it reachable; Microsoft's [WSL networking guide](https://learn.microsoft.com/windows/wsl/networking) has the steps, including the firewall rule it may need.

**On the laptop,** in the app: **Use a local model server** → change the address to `http://192.168.1.20:8080/v1` (your desktop's address) → enter the key under **API key** → **Connect** → **Test this model**. The key is saved in this browser with the rest of the setup; without it, or with a wrong one, **Connect** says the server refused the request.

- **On the preview site,** Chrome and Edge ask for the **Local network access** permission; choose **Allow**. This is the other permission from the one above: **Apps on device** covers servers on your own computer, **Local network access** covers other devices.
- **Use the IP address, or a name ending in `.local`** (Macs have one, such as `my-desktop.local`). From the preview site, the browser blocks other names, such as `my-desktop` or `my-desktop.lan`, even with the permission allowed.
- **Only on a network you trust,** such as your home network. The API key stops others on the network from using your server, but the connection isn't encrypted: your questions, the passages of your documents the model reads, and the key itself travel to the desktop in the clear, and anyone on the same network could read them. Don't do this on public, office or campus Wi-Fi.

### Use Ollama (experimental)

Ollama works but is experimental: in testing, some versions repeated the same step instead of answering. Use llama.cpp if you can.

- **Context.** Ollama cuts a prompt that is longer than the context it gives the model, without saying so, which can leave out the documents an answer quotes. After the model test, Kovrune asks Ollama for that context and uses it; if Ollama doesn't say, the test shows a warning. To give models more context, start Ollama with `OLLAMA_CONTEXT_LENGTH=4096` or more (for example `OLLAMA_CONTEXT_LENGTH=8192 ollama serve`).
- **The preview site.** llama.cpp server accepts requests from any site by default; for Ollama, add the site to `OLLAMA_ORIGINS` (for example `OLLAMA_ORIGINS=https://kovrune.pages.dev`).

### Change the setup or switch models

**To switch a local server's model:**
1. In the terminal where `llama-server` runs, press **Ctrl+C** to stop it.
2. Start it again with the other model file after `-m`, for example `llama-server -m ~/models/Qwen3.5-2B-Q4_K_M.gguf -c 4096 -np 1 --jinja --port 8080`, and wait for `listening on`.
3. In the app: **Change setup** → **Use a local model server** → **Connect** (it lists the new model) → **Test this model**. The header then names the new model.

**Change setup** doesn't throw your setup away. The setup steps show it as **Current setup**, with its last model test (date and speed), and it stays in use until a new setup passes its test. **Keep current setup** goes back to your questions without changing anything. The research screen also shows the last test next to the setup's name.

## 3. Ask questions and write reports

1. **Add documents** with **Choose files**, or by dropping them on the page: PDF, Word, PowerPoint, Excel, OpenDocument, CSV, text, Markdown, HTML, chemistry files (CIF, molfiles, JCAMP-DX spectra), XRD scans (.xrdml), or interview transcripts (WebVTT, SubRip) ([what Kovrune reads](#your-documents)). **Show text** shows what Kovrune read from a file.
2. **Choose where to search**, under **Search in**. Your documents are always searched. Tick **Wikipedia**, **OpenAlex**, **arXiv**, **DataCite** or **Europe PMC** to search those too ([below](#choose-where-to-search)).
3. **Type a question and press Ask**, or Ctrl+Enter (⌘ Enter on a Mac). The question box is at the top; where to search and **Mode** (a question or a report) are below it.

You see each step the model takes, then the answer with its label and the quotes it is based on ([section 4](#4-read-the-answer)).

Tips:

- Ask about one document at a time, with words that appear in it.
- With a small model, an answer takes a minute or two.
- You can ask in another language than your documents' ([how](#documents-in-other-languages)).
- Documents stay in the list after a reload: their text is saved in this browser. **Remove** deletes a document's saved copy; **Undo**, in the notice that follows, brings it back. In a private window, or when the browser blocks site data, they are kept only until you reload, and the page says so.

### Choose where to search

- **Your documents come first:** the model reads what it finds in them before it may search the others.
- **With any open source ticked,** you can ask questions without adding documents. Wikipedia is searched in the language you choose next to it.
- **Every source you tick is searched** before the answer, and the answer combines them: your documents for what is specific to them, the others for background and what your documents don't cover. Each quote names its source.
- **Each ticked source adds a step or two,** so an answer takes a little longer. Leave them unticked for answers from your documents only.
- **Combining sources works best with Qwen3.5-4B.** Qwen3.5-2B often answers from one source only.

What each open source covers, and how much of it Kovrune reads, is in [Open sources](#open-sources).

### While a question runs

- **The steps:** what the model searched for, how much each search found ("5 results", "nothing found"), and what it read. A long article or paper is read a part at a time, and each read shows which part, for example "Reading Wikipedia: Paracetamol (part 4 of 9)". A source that found results but isn't quoted in the answer was searched, and the model chose not to use it.
- **Guards:** if the model is about to say the answer isn't there without having read anything its search found, it is asked once to read first; if it answers in another language than your question, it is asked once to use yours. The step says so.
- **The timer,** under the steps, shows how long the question has taken, and how long your model test says it can take. If it takes longer, it says so, and you can keep waiting or stop.
- **Stop** ends the run at any time. When the answer arrives, the page scrolls to it.

**If a question is interrupted.** Kovrune saves each step of a question as it goes. If the page is closed or reloaded, or the browser crashes, the page shows the question as **Interrupted** the next time:
- **Continue** picks up where it stopped. The steps already done are restored without asking the model again, so the answer comes sooner. The trace notes how many steps were restored.
- **Ask again from the start** puts the question back in the box; **Discard** forgets it.
- If a document the question searched has been removed, or you changed the model setup, it can only be asked again.

**Is the model server running?** With a local model server, the line above your documents says **Server connected**, or **Server not ready** with the reason: the server can't be reached, didn't answer within 5 seconds, or no longer offers the model your setup was tested with. Start the server, or start it with that model, and press **Check again**; Kovrune also checks again when you come back to its tab.

If the model server stops answering in the middle of a question, start it again and press **Continue from step N** under the error. **Stop** discards the question's progress.

### Write a report

An answer is a few sentences, each checked against a quote. For a longer report, choose **Write a report** under **Mode**, below the question box. Kovrune builds it from several checked answers, one per section.

1. **Type the topic** (for example "blockchain technology, how it works and where it is used") and press **Plan the report**. The model proposes a title and a few questions, one per section, each answerable from a passage or two.
2. **Edit the plan.** Change the title or any question, reorder them (↑ ↓), and add or remove sections, from 2 to 8. Questions that ask one thing each work best: split a question that asks two. Below the plan is how long the report can take, from your model test. Each section takes about as long as a question.
3. **Choose whether to add an introduction and conclusion.** The model writes them after the sections, from the sections' answers only, in one more step. Their sentences are checked against the sections' quotes like an answer's, and ⚠ marks the ones no quote backs. They never change a section's label.
4. **Press Write the report.** Above 30 minutes, it asks you to confirm first. Each section's question is researched in turn, as a question is: you see its heading and its steps. **Stop** keeps the sections already written.

The report shows a summary of the sections' verdicts, for example "3 of 4 sections: Backed by quotes. 1: Needs checking.", then the introduction, each section with its own label, answer and evidence, and the conclusion. A section's label covers that section only, so check each one, as you would an answer.

A section the model could not answer says so, and the next one starts. If the model server stops answering, the report stops there, and the sections already written are saved. A report is saved under **Past answers** after every section, so a reload keeps what was written. If a section can't be saved, the research screen says so while the report goes on, and saving is tried again with the next section.

**Export as Markdown** writes the report, with its introduction and conclusion if it has them, each section's quotes numbered against one list of references, and the steps. **Export papers as BibTeX** collects the OpenAlex, arXiv, DataCite and Europe PMC works of every section.

Reports work best with Qwen3.5-4B. With Qwen3.5-2B, sections are often long and mostly unbacked by quotes: the labels say so.

## 4. Read the answer

Each answer has a verdict, then the answer, then one sentence on what the verdict means, then the evidence: the quotes the answer is based on.

### The verdict

Every answer gets one of three verdicts, or none when there is no answer:

| Mark | Verdict | What it means | What to do |
| --- | --- | --- | --- |
| ✓ | **Backed by quotes** | Every quote is word for word in its source, and every check passed | Check that the quotes answer what you asked. Real quotes don't prove a right answer |
| ⚠ | **Needs checking** | The quotes are real, but a check could not confirm that they back the whole answer | Compare the answer with the quotes before relying on it. **Why** says which check |
| ✗ | **Not backed** | Quotes are missing, or not in the sources they cite | Treat the answer as unchecked |
| – | **Not found in your sources** | The model found no answer in what it searched | Often the right answer. If you expected one, ask with words from the document, or tick more sources |

### Why: the precise labels

Under the verdict, **Why** opens the precise label and what it means. They are listed here for reference; you don't need to learn them to read an answer.

| Mark | Label | What it means | What to do |
| --- | --- | --- | --- |
| ✓ | **Quotes found** | Every quote is word for word in its source, every sentence of the answer is backed by a quote, and the model confirmed that the quoted passages state the answer | Read the quotes and check that they support the whole answer. Real quotes don't prove a right answer: a small model often confirms its own |
| ⚠ | **Quotes found, answer not confirmed** | The quotes are real, but the model's check found that they state only part of the answer, give a different answer, or leave part of your question unanswered; or it gave no clear reply; or your question names a formula ("Z/pZ × F₅ⁿ", "k = 3") that neither the answer nor its quotes mention, so the answer may be about another result. Or your question asks about the proof of a statement ("Step 3 of the proof of Theorem 4.1") and every quote stands in the proof of another, so the answer may come from the same step of another proof. The explanation under the label says which, and when the model's check gave no answer, why: it found none in the passages, its reply was cut off or could not be read (the reply is shown), or the check could not be run. A check that gave no answer to compare (its reply cut off or unreadable, or not run) does not take the label away: the answer keeps **Quotes found** if the other checks pass, and the explanation says this check could not be completed | Check the answer against the sources: a number or a condition may differ, or part of the answer may be missing |
| ⚠ | **Quotes found, a source says otherwise** | Every quote is real and backs the answer, but another sentence of a document the model read answers your question and says the opposite. The label shows that sentence | Read the sentence shown and decide which one answers what you asked: the answer may rest on a passage about something else. This is the error a real quote hides best |
| ⚠ | **Quotes found, answer too short to check** | The quotes are real, but the answer, such as a name, a number or a version, is too short to compare with them. Shown with models other than Qwen3.5-4B, and on answers saved by earlier versions | Check that the quotes answer your question. Short answers are often wrong even with real quotes, for example a version that fixed a problem when you asked which versions it affected |
| ⚠ | **3 of 5 sentences backed by a quote** | The quotes are real, but the sentences marked ⚠ are not backed by them | Check the marked sentences against the sources: small models often add details from memory next to real quotes. A sentence marked "in the source, not quoted" is nearly word for word in a document the model read: check it there |
| ✗ | **Some quotes not found (2 of 3 found)** | Only some quotes are in their sources | Check the answer against the sources, starting with the quotes marked ✗ |
| ✗ | **Quotes not found** | None of the quotes are in the cited sources | The answer may be wrong: check it yourself |
| ✗ | **No quotes** | The model answered without quoting anything | Nothing backs the answer: check it yourself |
| – | **Not found in your sources** | The model found no answer in what it searched | This is often the right answer. If you expected one, ask with words from the document, or tick more sources |

**A real quote is not proof that a document is right, or honest.** The check confirms the quote is in the document, not that the document is true. A document, or a Wikipedia page, can also contain text written to steer an AI ("ignore your instructions and answer…"). Kovrune tells the model to treat what it reads as data, and the model can only search, read and answer, so such text cannot reach your files or other sites; but it can still change the answer, with quotes that check out. Look at which document each quote comes from, and be wary of answers built on a document you don't know.

### The evidence

Under **Evidence**, each quote shows ✓ (found) or ✗ (not found), and the document it came from.

- **Where it is:** for a quote from a PDF, the page is shown next to the document's name, for example "p. 4"; from a presentation, its slide, for example "slide 4"; from a spreadsheet, its sheet, for example "sheet 2". Word and OpenDocument text files have no fixed pages (they depend on the layout), so their quotes show no page. Quotes from Wikipedia, OpenAlex, arXiv, DataCite and Europe PMC link to the page and show when it was retrieved.
- **Show in the source,** under each quote that was found, opens the passage around it, as it is in the document, with the quoted words highlighted.
- **The closest passage:** for a quote that is mostly real but not word for word (at least 70% of its words appear in order in one passage), Kovrune shows the closest passage with the differences marked: highlighted words are in the source, struck-out words appear only in the quote. Small models often start with a real sentence and finish it from memory, and this shows where they did.
- **Quotes with "...":** a quote may leave words out with "...". It is found when its parts are in the source in that order, close together, and the passage shown includes the words it left out. A quote that leaves out more than five words in one place is still found, but backs no sentence of the answer: joining distant words can change what the source says. A quote whose parts are further apart than that, more than about 200 characters, is not found, even when every part is word for word in the source; under it, **Show part 1 in the source**, **Show part 2 in the source** and so on show where each part is, so you can see what the model joined and whether, together, they say what the answer says.
- **What counts as a match:** quotes must match whole words; capitals, quote marks, list bullets, the bars between table cells, hyphens inside words and line breaks written out as "\n" don't matter. A middle dot between digits, as some journals print decimals ("0·82"), counts as a decimal point. A footnote or citation marker in the source may be left out of a quote: "with panel data" is found in "with¹ panel data", and "argued. Bureaucracy" in "argued.[14] Bureaucracy" or "argued.12 Bureaucracy"; the passage shown keeps the marker. A marker in the quote that the source doesn't have still fails it. A digit under a bar counts as a minus and the digit, and a space group written with spaces as one written together, so "Fm-3m" is found in "Fm3̄m" and in a CIF file's "F m -3 m", and "(-110)" in "(1̄10)"; searches find them the same way.
- **Math:** a paper read from its LaTeX source keeps its formulas as LaTeX, which is what quotes are checked against. On screen, in the answer, the quotes and the source passages, a formula is shown as text: `$20\times$` as "20×", `$h_{t-1}$` as "hₜ₋₁", a fraction as "a/b". Point at a formula to see it as written. A formula with a command Kovrune doesn't read here, such as a matrix or a paper's own macro, is shown as written. **Export as Markdown** keeps the LaTeX, which Markdown viewers with math support display.

### How the checks work

You don't need this to use Kovrune; it says what the labels rest on.

1. **The quotes.** Each quote must be in the source it cites, as above.
2. **The sentences.** Each sentence of the answer must share most of its words with the quotes, with no number, unit, month, "not", direction such as "higher", "significant", or name such as "TNF-α", "CD45+", "Pd/C" or "(R)-" that the quotes don't back, and not rest on a quote that leaves out more than five words in one place. A sentence that joins a second claim to its first, with "and is…", ";", "while" or ", but", must do so for each part too, so a claim added to a quoted one is not carried by it. Sentences that fail are marked ⚠. A marked sentence that is nearly word for word in a document the model read, though not in any of its quotes, also says "(in the source, not quoted)"; point at it to see the passage. It is still marked, since only quotes back an answer, but you know where to check it. Only full claims are looked for, every word or nearly in one sentence of the document, and not in a sentence that sets two claims against each other ("but", "however"), so most marked sentences won't say this even when the source has something close. For those, **Where to check the ⚠ sentences**, under the answer, lists the closest passages the model read: for each marked sentence, the one or two sentences of the documents it read that share the most of its words, the second chosen for words the first lacks, with each document's name. They are not quotes and may not back the sentence: one may say it in other words, and another may say something else or the opposite, which is why the sentence stays marked. A sentence that shares too few words with anything read gets none.
   - **Units** include clinical ones (mg, µg, g, mL, mmol, IU, mmHg): "500 mg" is not backed by "500 µg". They also include engineering ones with their prefixes (Pa to GPa, N and kN, V, A, W, Hz, Ω, pF to µF, J, °C and K, dB and dBm): "276 GPa" is not backed by "276 MPa"; and laboratory ones (M to fM, µL and nL, Da and kDa, bp and kb, nt, × g, U, CFU and PFU): "10 mM" is not backed by "10 µM", nor "12,000 rpm" by "12,000 × g"; and chemistry ones (ppm, ppb, mol and mmol, mol%, wt%, equiv): "12 ppm" is not backed by "12 ppb", nor "2 wt%" by "2 mol%". A percentage keeps what it is of when the words around it say: "92% yield" is not backed by "92% ee". And materials ones (HV, HB and HRC hardness, µΩ, mS and µS, dpa, emu, µB): "320 HV" is not backed by "320 HB", nor "1.2 mS" by "1.2 ms". A symbol is read in its case, since "mW" is a milliwatt and "MW" a megawatt, and "mM" millimolar, not millimetres. A unit is read with the units after it and their powers: "185 mAh g⁻¹", "185 mAh/g" and "185 mAh per gram" are one unit, and "185 mAh cm⁻²" another; "4.5 MPa·m^1/2" (a toughness) is not "4.5 MPa" (a strength), nor "45 mV dec⁻¹" "45 mV". A sentence may leave out a "per" unit the quote gives ("185 mAh" for "185 mAh g⁻¹"), but not give another one ("10 mg/kg" for "10 mg/day"). A unit's power is not a number, so the "1" of "g⁻¹" backs no "1C". A temperature per minute, or per degree, is the same in K and °C ("5 K/min" for "5 °C/min"), and "8.6 ppm/K" is "8.6 × 10⁻⁶ K⁻¹".
   - **Signs and powers of ten:** "40 °C" is not backed by "−40 °C", nor "10³" by "10⁻³". A number written without its leading zero, as APA style writes p, r and α, is the same number with one: "p < .05" and "p < 0.05" are one value, and "r = −.34" is −0.34, so it backs neither "r = .34" nor "34%". "1.2 × 10⁻³", "1.2e-3" and "0.0012" count as one number. A sentence may give the size of a fall without its minus sign: "fell by 3.2%" is backed by "a change of −3.2%". A reduction potential is not a fall, so "+1.25 V vs SCE" is not backed by "−1.25 V vs SCE".
   - **Directions:** a sentence that says "higher", "increased", "present", "superior", "maximum", "tensile", "inlet" or "passed" is not backed by quotes that say only the opposite ("lower", "reduced", "absent", "inferior", "minimum", "compressive", "outlet", "failed"). Laboratory ones count too: upregulated and downregulated, activates and inhibits, agonist and antagonist, overexpression and knockdown, enriched and depleted, resistant and sensitive, wild-type and mutant, male and female, in vitro and in vivo, and others; and chemistry ones: oxidized and reduced (where "reduced" names a reaction, as in "reduced to the alcohol", not "reduced mortality"), oxidant and reductant, nucleophile and electrophile, acidic and basic conditions, kinetic and thermodynamic control, hydrophobic and hydrophilic, electron-donating and electron-withdrawing, upfield and downfield, axial and equatorial, soluble and insoluble, and others. An answer that turns a comparison round ("higher in the control group" for "lower in the treated group") is marked too, so check it against the quote; one that says both sides ("inhibited the activation") is left to the other checks. A change "from" one number "to" another must go the way the quotes give it: "from 97.1% to 96.4%" is not backed by "from 96.4% to 97.1%".
   - **Counts:** a sentence that says how many people were recruited, enrolled or randomised is not backed by a quote that gives that number only as a target, such as "a desired sample size of 25 participants was calculated".
   - **Names one character tells apart:** a name with a Greek letter (TNF-α and TNF-β, ERα and ERβ, written with the letter or its name), a cell marker with its sign (CD45+ and CD45−, or "CD45-positive"), a genotype (Tlr4−/− and Tlr4+/+) or a species with its genus shortened ("S. aureus") must be in the quotes, the cited titles or your question, though every other word matches. A name that only adds plain letters to one the quotes give, such as a mouse line's "PPARαBATKO" beside the gene's "PPARα", counts as backed. Species written out in full, and gene names that differ in a digit, are left to the other checks (a digit is a number, and numbers are checked).
   - **Chemistry:** where the quotes name a formula, a metal, a solvent, a substituent or a stereo- or regiochemical descriptor, a sentence must name the one they name: "Pt/C" is not backed by "Pd/C", "CO" by "CO₂", "Ni(II)" by "Ni(0)", "in DMSO" by "in water", "the ethyl ester" by "the methyl ester", "(S)" by "(R)", "exo" by "endo", "para" by "ortho". One name written another way counts: "Pd" is backed by "palladium", "THF" by "tetrahydrofuran", "Fe(III)" by "iron(III)". A sentence naming something the quotes name nothing of the kind for is left to the other checks. The positions in a name are read as positions, not numbers: "2,6-dinitrophenol" is not backed by "2,4-dinitrophenol", and a quote naming "2,4-D" or "1,3,5-triazine" does not back "2.4 mg" or "135 °C".
   - **Significance:** a sentence that calls a result significant is not backed by quotes that call it only "not significant", "non-significant" or "did not reach significance".
   - **Comparisons between groups:** a sentence that compares two groups the other way round from its quote is not backed: "White participants were less likely than Black participants" against "Black participants were less likely than White participants". The same finding said from the other side ("White participants were more likely than Black participants") is backed. Opposites social-science papers turn on count as directions do: more and less, rose and declined, widened and narrowed, majority and minority, supported and opposed, trust and distrust, rural and urban, richest and poorest, and others.
   - **How strong a claim is:** a sentence saying one thing *caused* another is not backed by quotes that say only that the two are associated, correlated or linked; one saying a result was *demonstrated*, *proved* or *confirmed* is not backed by quotes that say only that it suggests, may or might.
   - **Percent and percentage points:** "rose by 7 percent" is not backed by "rose by 7 percentage points", nor the reverse.
   - **The interviewer's words:** when every quote is the interviewer's turn in a transcript ("Interviewer: So would you say you felt excluded?"), a sentence about what the participant said or felt is not backed; one saying what was asked is.
   - **Lists in one sentence:** an answer written as "three challenges: 1) … 2) … 3) …" is checked item by item, each item a sentence of its own, so a quote backs the item it states and an item no quote backs is marked on its own. Only numbered or lettered items in order count ("1)", "(1)", "1." or "a)"), so a reference such as "as in (2)" stays in its sentence.
   - **Document names in the answer:** a sentence that names the document it quotes, such as `- From arxiv:2608.25291#13: "…"`, is checked without the name, whose digits are not numbers the answer claims.
   - **A report's introduction:** its sentences that only restate the report's questions ("This report examines how …") say what the report covers, not what it found, so they are not marked. A sentence of the introduction that adds a finding is checked like any other, and every sentence of the conclusion is.
3. **A sentence that says otherwise.** The documents the model read are searched for a sentence that answers your question and denies it, where the answer does not. Such a sentence takes **Quotes found** away and is shown to you. It catches an answer built on a real quote about something else: a quote saying that reduced expression of a gene raised pathogen clearance does not answer what the heterozygous knockout did, and the paper's own sentence about the heterozygote says it had no major effect.
4. **The model's check.** The model reads the quoted passages again and is asked whether they state what the answer says. Only a clear yes keeps **Quotes found**.
5. **Short answers,** such as "4 KiB" or "1987年", are too short to compare word by word, so they get **Quotes found** only when the model confirms them in step 3. So far only Qwen3.5-4B is asked about them: Qwen3.5-2B confirms nearly every answer, right or wrong, so its short answers read **Quotes found, answer too short to check**.
6. **With Qwen3.5-4B,** the model also reads the passages without seeing its answer, and must find the same answer there.
7. **With Qwen3.5-2B,** the model lists the parts your question asks for, and the answer must give each.

Steps 4 to 7 ask the same small model that wrote the answer, so they catch some wrong answers, not all. Step 3 asks nothing of the model: it compares your question with the sentences of the documents it read.

## 5. What Kovrune can read

### Your documents

| Kind | Files |
| --- | --- |
| PDF | `.pdf` with a text layer. Scanned PDFs (images without a text layer) can't be read |
| Word and OpenDocument text | `.docx`, `.odt` |
| Presentations | `.pptx`, `.odp` |
| Spreadsheets | `.xlsx`, `.ods`, `.csv`, `.tsv` |
| Text | `.txt`, Markdown (`.md`), HTML (`.html`) |
| Chemistry and materials | crystal structures (`.cif`), molfiles and SD files (`.mol`, `.sdf`), spectra in JCAMP-DX (`.jdx`, `.dx`, `.jcamp`), X-ray diffraction scans from PANalytical instruments (`.xrdml`) |
| Interview transcripts | captions exported from a recorded call: WebVTT (`.vtt`, from Zoom, Microsoft Teams or Otter) and SubRip (`.srt`) |

- **PDFs:** Kovrune reads the text where it is on the page, so a subscript, a superscript or a symbol set against the text before it is read with it ("RDS(on) = 40 mΩ", "fsw", "−25 °C"), a raised exponent is written as one ("2.0 × 10⁵", "cm⁻³", "⁸⁷Rb", not "2.0 × 105"), paragraphs are kept apart, and a running header or footer that repeats on most pages ("IEEE TRANSACTIONS ON …", "Page 2 of 3") is read once, where it first appears. Footnotes at the foot of a page whose last sentence runs on to the next page are read after the paragraph that finishes it, so the sentence is read whole. PDFs added before this version keep the text they were read with; remove one and add it again to read it this way. Formulas, figures and their labels are read as whatever text they hold, which is often not much.
- **Figures and tables in papers:** a figure is read as its caption only. A stress–strain curve, an XRD pattern, a micrograph, a cycling plot or a J–V curve gives Kovrune no values, so a question whose answer is only in a figure ends as "not found": that means not in the text, not that the paper does not show it. Look at the figure, or ask about the table or sentence that reports the value. In a PDF, a table is read as rows of cells with "|" between them, each value under the column it is set in, and a cell left empty written "–" ("| ZTA-20 | 20 | 98.6 | – | 5.9 | 610 |"), so a value after an empty cell stays in its column. A table whose rows are set too close together to tell its columns apart, or whose header spans several columns, is read as before, its cells joined with spaces: check a value from such a table against the table itself. Tables from Europe PMC, Word, Excel and CSV keep their columns too.
- **Interview transcripts:** a caption file splits speech into cues of a few seconds; Kovrune joins each speaker's cues into one turn, written "Daniel [00:00:08]: …" with the time it starts in the recording, so a quote is found in one piece and says who spoke. A transcript you typed or exported as text, Word or Markdown, with each turn after its speaker's label ("P07: …", "Interviewer: …"), is read as it is. Either way, when a long answer runs over several parts, a part that starts inside it says whose turn it continues ("[This part continues what P07 says, in a turn that begins in interview-t01#3.]"), and a quote that is only the interviewer's question doesn't back a sentence about what the participant said.
- **Find every passage**, under the list of documents, lists every paragraph that has all the words you type (in any form: "rota" also finds "rotas"), or a "phrase in quotes", with its document, page and, in a transcript, who is speaking, and **Download as CSV** saves them for a spreadsheet or a coding tool. It doesn't use the model, so it misses nothing and makes nothing up. A question reads only a few passages, so for every mention of something, for example to code interviews, use this instead.
- **Pages without text:** a PDF that has text on some pages but not others, such as a scanned appendix or an older paper scanned into a newer one, says which pages have none ("Pages 2 and 4 of 5 have no text Kovrune can read"), under its name, and the summary after adding a folder counts them. Kovrune has no OCR, so a question about such a page finds nothing. A full-page figure or a blank page is marked the same way.
- **Abbreviations:** when a document defines one, as "finite element analysis (FEA)", a search with those words also finds the passages that say only "FEA".
- **Chemical names:** a search for a common solvent, reagent, catalyst, metal or technique also looks for its other spellings, though your documents never define them: "dichloromethane" also finds "CH2Cl2" and "DCM", "Hünig's base" finds "N,N-diisopropylethylamine", "tricyclohexylphosphine" finds "PCy3", and "Pd" finds "palladium". An abbreviation or a formula counts only in its case, so "HER" (the hydrogen evolution reaction) is not "her". The list holds about 160 common substances and terms, not every name: a ligand, a product or a trade name not on it is searched only as written.
- **Materials names:** the same for about 150 materials, processes and techniques: "titania" also finds "TiO2", "lithium lanthanum zirconate" finds "LLZO" and "Li7La3Zr2O12", "laser powder bed fusion" and "L-PBF" find "SLM", "Ti64" and "TC4" find "Ti-6Al-4V", and "YSZ" finds "3Y-TZP". A material's other spellings count only in passages that don't already use the spelling you typed, so a question about "LLZO" ranks the passages that say "LLZO" as before. An abbreviation with two meanings, such as "LFP" (lithium iron phosphate, or laser flash photolysis), adds only the other meanings' formulas and abbreviations. An abbreviation is not expanded into words ("SPS" does not add "spark plasma sintering"); papers usually define theirs, and the abbreviations rule above finds them.
- **Word and OpenDocument text files:** Kovrune reads the text, tables, and footnotes and endnotes, which follow the text. A table is read one row per line; when it has a header row, each value is labelled with its column's header, for example "Good: ◯", so **Show text** shows these labels although the document doesn't spell them out. It leaves out headers and footers, comments, and text deleted with tracked changes.
- **A note asking you to add a file again:** documents added before Kovrune labelled table columns lost which column each value was in. Remove the document and add the file again.
- **Presentations:** each slide's text and tables, then its speaker notes. Charts, SmartArt and pictures are not read.
- **Spreadsheets:** every sheet, one row per line, with each value labelled by its column's header ("Customer: Acme Trading | Total: ¥125,000"), and dates and numbers as the cells show them. Formulas show the value saved with the file. A workbook is read up to 20,000 rows and 100 columns per sheet; the document says so when a file is larger.
  - Ask about particular rows: "Which orders are delayed?" or "What is Acme Trading's phone number?".
  - Totals, averages and counts over many rows are not reliable: the model reads only a few parts of a sheet at a time.
- **Chemistry files:**
  - A **CIF** is read as its items, one per line in its own words ("cell length a: 3.7155(4)", "space group name H-M alt: P 21/c", "refine ls R factor gt: 0.0412"), and its loops as tables, each row's values labelled with their column ("label: N1 | type symbol: N | fract x: -0.1230(4)"). Unknown values ("?") are left out. A table is read up to 2,000 rows, so a long list of reflections is cut. When the file gives the cell but not its volume, or Z and the formula but not the density, Kovrune works them out and says so ("cell volume: 2180.92 Å³ (worked out by Kovrune from the cell's lengths and angles)", "calculated density: 5.114 g/cm³ (worked out by Kovrune from Z, the formula weight and the cell volume)").
  - A **molfile or SD file** is read one structure at a time: its name, its formula and molecular weight, the atoms and bonds drawn, and an SD file's data items ("Yield (%): 82"). The formula and weight are worked out by Kovrune and say so: a drawing usually leaves out hydrogens, and they are counted from each atom's usual valence, which can be wrong for unusual bonding (hypervalent atoms, metals, radicals the file does not mark).
  - A **JCAMP-DX spectrum** is read as its header ("Data type: INFRARED SPECTRUM", "X units: 1/CM", "Observe frequency (MHz): 400.13", "Solvent: CDCl3"), how many points it has over what range, and its peak table when it has one. The points themselves are not read, so a question about a band or a peak is answered only from a peak table.
  - An **XRD scan** (`.xrdml`, as PANalytical instruments save them) is read as its sample, comments, wavelength (Kα1, Kα2, Kβ), X-ray tube, and each scan's mode, 2θ and ω ranges, number of points, step (worked out from the range and the points) and counting time, with when and by whom it was measured. As for a spectrum, the counts are not read, so a question about a peak's position or intensity finds nothing in the scan itself.
- **CSV and TSV files** are read as one sheet, the same way. Files saved by Japanese Excel as "CSV (comma delimited)" (Shift_JIS) and as "CSV UTF-8" both read correctly; for other languages' older encodings, save as "CSV UTF-8".
- **Can't be read:** older Office files (.doc, .ppt, .xls), RTF files and password-protected files. Open them in Word, PowerPoint, Excel or LibreOffice, save them as .docx, .pptx, .xlsx or PDF (removing the password), and add them again.

#### Adding many papers at once

For the papers you downloaded through a library or a subscription (IEEE Xplore, ScienceDirect, SpringerLink), which no open source holds in full:

- **A folder:** **Choose a folder**, or drop a folder on the page, adds every document in it and in its subfolders. Hidden files (such as `.DS_Store`) are left out, and a file Kovrune can't read (such as an old `.doc`) is named in the summary.
- **Files already here are skipped:** a file with the same name and size as one in your documents, so adding the same folder again adds only what is new.
- **Paper details from a reference manager:** export your collection as BibTeX (`.bib`) or RIS (`.ris`) from Zotero, Mendeley, EndNote or JabRef, with its files (in Zotero: **Export Collection…**, with **Export Files** ticked), and add the export folder. Each document gets the title, authors, year, journal and DOI of the entry that links to its file, or that has the DOI the document prints, or whose title is on its first page. An export added later on its own is matched to the documents already here. The details show under each document's name.
- **A DOI without an export:** a document that prints its DOI on its first pages shows it. **Look up details on OpenAlex** finds the rest for all such documents at once; only each DOI is sent.
- **In answers:** a quote from a document with details is cited with them ("Lee and Müller (2021). A Silicon Carbide Totem-Pole PFC Rectifier. IEEE Transactions on Power Electronics. https://doi.org/…"), in the Markdown export too, and **Export papers as BibTeX** includes it, with a note that it is from your library.

#### Documents in other languages

- Documents can be in any language, including Chinese, Japanese, Korean and Thai, which are written without spaces.
- **In another writing system:** when your documents are in another writing system than your search, such as Japanese documents and an English question, each search is also translated, and the best match in that language is added (the step says "Found by searching the Japanese documents for …").
- **In the same alphabet:** between languages that share an alphabet, such as English and French, searches are not translated. Ask about a French document in French, or use words both languages share, such as names.
- Accents don't matter: "energie" finds "énergie".

### Open sources

All seven are off until you tick them. All but EPO patents need no account; EPO patents needs your own free EPO key. When the model first reads a part of a long article or paper from any of them, it is also shown the document's outline: which parts hold which sections and tables (for example "#3 Findings; #19 Table 1: Baseline characteristics"), so it can go to the part it needs. If the model then reads a paper of twenty parts or more part after part (parts 1, 2, 3 …), the third read gives the part it asked for and, once, the outline again, with a note that reading in order takes many steps.

- **Wikipedia:** encyclopedia articles, in the language edition you choose. A long article is read a part at a time, the part that best matches your question first.
- **OpenAlex:** scholarly papers of every field. OpenAlex catalogues papers and does not hold their text, so Kovrune reads their abstracts, or the full text from arXiv or Europe PMC when you tick those too (below). A question about a paper's methods or results beyond its abstract usually ends as "not found" otherwise.
  - **Limits (optional).** Under OpenAlex, **Published from** keeps works from a year on, **Field** keeps works whose main subject is in a field such as Engineering, Materials Science, Social Sciences, Psychology or Economics, **Venue** keeps papers from the ACL Anthology (ACL, EMNLP, NAACL, EACL, Findings and their workshops) or from NeurIPS, and **Open-access works only** keeps works with a free copy. Each search shows five works, those with an abstract first, since a work without one gives the model nothing to read.
  - **Full texts.** A paper OpenAlex finds that is also on arXiv, or in PubMed Central, is read in full from there when you tick **arXiv** or **Europe PMC** too; a paper with a copy on Zenodo, as many in the social sciences have, is read from its PDF there when you tick **DataCite** too; otherwise as its abstract. A conference paper that OpenAlex keeps apart from its arXiv preprint is looked for on arXiv by its exact title, when **arXiv** is ticked. When a paper can be read only as its abstract but has a free PDF elsewhere, such as an ACL Anthology paper that is not on arXiv, the abstract names that PDF: download it and add it to your documents to ask about it in full. Kovrune cannot download it for you, since the ACL Anthology and OpenReview do not let web pages read their files. Nothing is read from a site you did not tick.
  - **Retractions.** A paper OpenAlex marks as retracted shows **RETRACTED** in the results, and its text starts with a warning.
  - **Citations.** A paper read from OpenAlex shows how many works in OpenAlex cite it and how many of its references OpenAlex has; reference lists are incomplete for some papers (32 of Self-RAG's 58). **Let the model follow citations (experimental)**, under the boxes, tells the model it can list the works a paper cites, or the works citing it, by searching OpenAlex for "references of" or "citing" the paper, by its ID or title, with a topic to narrow them ("citing Lost in the Middle: graph"). It is off by default: in a check of five such questions, Qwen3.5-4B answered fewer right when told, as it often followed the citations of a paper it had just read rather than the one the question named. A larger model may do better.
  - **API key (optional).** Without a key, OpenAlex shares a small daily budget among everyone on your network's address, which can run out until midnight UTC on a shared network (an office, a campus, a mobile carrier). A free key from [OpenAlex](https://help.openalex.org/api/authentication/) gives you your own; enter it under the boxes once OpenAlex is ticked. It is kept in this browser and sent only to OpenAlex, and backups do not include it. arXiv does not use it.
- **arXiv:** preprints in physics, mathematics, computer science and related fields, read in full. Papers are found through DataCite, which registers every arXiv paper's DOI (arXiv's own search can't be used from a web page), and each paper the model reads is downloaded from arxiv.org. Kovrune reads a paper from its LaTeX source when arXiv has it, as most papers do: its tables keep their rows, its equations are read as their LaTeX with their numbers (for example `J_T = \mathbb{E}[...] (3)`), not as the loose symbols a PDF's text gives, and its citations read as printed, "(Liu et al., 2023)". A value written with its unit through the siunitx or hepunits packages reads as the PDF prints it, "1.5 meV" or "139 fb⁻¹", and so does a formula written with mhchem or chemformula, "CO₂" or "[Ru(bpy)₃]²⁺", so the unit or formula is in the text the model quotes and the quote check compares. Theorems, lemmas, conjectures and the paper's other numbered statements read with their headings and numbers as the PDF prints them, "Lemma 3.2 (Key Lemma).", even when the paper declares them under its own names, and a reference to one reads "by Lemma 3.2", so you can ask what a numbered result says, which results a proof uses, or whether a statement is proved or only conjectured. A paper that numbers its statements in an unusual way (its own environments built on others', or numbers set by hand) may still read with numbers that differ from the PDF's. An equation or symbol kept as LaTeX, such as `$T_\mathrm{c}$`, may be quoted in another form, `$T_\text{c}$` or "σB" for `$\sigma B$`; the quote check reads both as math, so such a quote is still found. So is a formula quoted in plain text or Unicode, with or without its dollar signs: "p >= 7" or "p ≥ 7" for `$p \geq 7$`, "1/8" for `$\frac{1}{8}$`, "|A|^2" for `$|A|^2$`. A quote with another number, relation or symbol in it ("p > 7", "1/4", "∪" for `\cap`) is still not found. A paper without a source, or whose source can't be read well enough, is read from its PDF. A long paper is read a part at a time, the part that best matches your question. A theorem or lemma is kept in the same part as the start of its proof, and a part that begins inside a proof says whose proof it continues and where it begins. Under arXiv, **Subjects** limits searches to arXiv archives or categories, such as math, math.CO or hep-th (leave it empty for all of arXiv); each paper found shows its categories, and the MSC codes its authors gave. zbMATH Open can't be offered as a source: its API doesn't allow requests from web pages. A quote from a PDF shows its page; one from a source shows none, since a source has no pages. Text drawn inside a figure (an image of a chat, a chart's labels) is in the PDF only, so a question about it is better asked of the PDF, added to your documents. Downloading a paper takes a few seconds more than reading an abstract.
- **DataCite:** works that research repositories register: Zenodo, university repositories and others, besides arXiv's papers, which the arXiv box covers. Only texts are searched (articles, preprints, reports, theses), not datasets or software. Works on Zenodo, most of what a search finds, are read in full from their PDFs, downloaded from zenodo.org; other works, and Zenodo works without an open PDF, are read as their abstracts. Repositories hold work that has not been peer reviewed, so weigh what you read as you would a preprint.
- **Europe PMC:** the biomedical and life-sciences literature: PubMed's records, PubMed Central's full texts, and preprints from medRxiv, bioRxiv and others. It also holds the open-access full texts of many journals outside biomedicine, among them MDPI's *Materials*, *Nanomaterials* and *Polymers* (about 15,000 papers from 2023 alone) and open-access papers in *Nature Communications* and *Science Advances*, so tick it for materials science, chemistry or physics too. Most papers of Elsevier's materials journals, such as *Acta Materialia*, are not there; add their PDFs to your documents. Each result shows its year, journal and kind of study (randomized controlled trial, systematic review, preprint and so on), and whether it is open access ("full text") or not ("abstract only"). Open-access papers are read in full, tables included, which is where a trial's baseline characteristics, adverse events and subgroups usually are. A table cell that spans several columns or rows fills each of them, so every value stays under its heading (a regression's standard errors under their estimates), a cell set in bold stays bold, a line break in a cell is a space, a power of ten keeps its exponent ("1.3 × 10¹² cm⁻²", not "1.3 × 1012"), and tables a journal prints after the article are read after the paragraph that first cites them; other papers are read as their abstracts. A long paper is read a part at a time. A paper Europe PMC marks as retracted shows **RETRACTED** in the results, and its text starts with a warning. Searches ask for papers with all of the model's words, and with any of them when none has all. Kovrune asks for three sets of up to 25 papers at once: those Europe PMC ranks first by their full text, those with all the words in their title or abstract, and the most cited with all the words in their title. Of these, the five whose title and abstract hold the most of the words are shown, with papers cited more counted a little higher. So a trial's own report comes before the papers that followed it, and a broad search such as "paracetamol", which matches thousands of papers, shows well-cited reviews and trials about it, not just this year's newest papers. To find recent work on a broad subject, add words that narrow it. Words that only say how a question is asked are left out of the search, such as "what", "the", "uses" or "usually": "paracetamol uses" is searched as "paracetamol". A secondary analysis, substudy or trial protocol is named as one in the results, and a protocol counts half as much: it gives what a trial planned, its report what was done.
  - A full text can take Europe PMC several seconds to give, a preprint's sometimes much longer; after a minute, the paper is read as its abstract.
- **INSPIRE-HEP:** the literature of high-energy physics, run by CERN, DESY, Fermilab, IHEP and SLAC: particle, nuclear and astroparticle physics, gravitation and cosmology, with papers, preprints, conference contributions, theses and collaboration notes. Each result shows its year, collaboration and how many INSPIRE records cite it. A record is read with its journal reference ("Phys.Lett.B 716 (2012) 1-29"), DOI, arXiv number, report numbers, INSPIRE TeX key ("ATLAS:2012yve"), citations (with and without self-citations) and abstract, or in full from arXiv when you tick **arXiv** too and the paper is there. Searches look for records with all the model's words in their title, most cited first, then with them in their title, abstract or author list; a search that finds nothing is tried again without its plain numbers, then with its first three words. Words INSPIRE would read as its own search commands are left out ("a", "and", "not"), so a question can be asked in plain words. **Let the model follow citations through INSPIRE (experimental)** tells the model it can list the records a paper cites or that cite it, as for OpenAlex ("references of inspire:1124337: Higgs"); INSPIRE's reference lists are curated, so they are more complete than OpenAlex's for physics papers. **Export papers as BibTeX** keys an INSPIRE record by its TeX key, as INSPIRE's own BibTeX does, and cites a collaboration's paper by its collaboration. INSPIRE needs no key. NASA ADS, astronomy's counterpart, can't be offered: it lets only its own website, not other web pages, use its search.
- **PubChem:** chemical compounds, from the US National Library of Medicine. Search by a compound's name, CAS number or InChIKey; a question in words ("boiling point of THF") is searched for the name it holds, and a name PubChem does not know is looked up through its suggestions, when one is spelled almost the same. A compound is read with its IUPAC name, formula, molecular weight, CAS numbers, InChI, InChIKey and SMILES (computed by PubChem, and said to be), other names, descriptions with their sources, and its measured properties (boiling and melting points, density, solubility, vapour pressure, pKa and others), up to six values each, each with the database PubChem took it from. Safety and hazard data are not read. PubChem needs no key.
- **Alexandria:** about five million crystal structures computed with density functional theory, from Ruhr University Bochum, read through OPTIMADE, the open standard API of materials databases. Search by a formula ("Li7La3Zr2O12", "TiO2"), a materials name Kovrune knows ("LLZO", "titania"), or a list of elements ("Li-La-Zr-O"); a doped formula with fractions is searched by its elements. Up to five structures are listed, the most stable first, each with its space group number and crystal system, band gap and distance from the convex hull. A structure is read with its formulas, space group, cell (lengths, angles, volume and density, worked out by Kovrune from the lattice vectors, and said to be), band gap, formation energy, distance from the hull, what it decomposes into, and its sites. Every value is computed with the PBE functional, not measured, and the text says so: PBE band gaps are usually well below measured ones, and a structure on the hull is stable in the calculation, which need not be the phase made in a laboratory. Formulas are written as OPTIMADE writes them, elements in alphabetical order ("O2Ti" for TiO2). Alexandria needs no key. Other OPTIMADE databases (the Materials Project, the Crystallography Open Database, JARVIS, AFLOW) do not allow requests from web pages, so Kovrune cannot read them.
- **ChemRxiv:** chemistry's preprint server, searched through Crossref, which holds its records (DataCite does not). Each preprint is read as its title, authors, year, DOI and abstract, with the DOI of its journal version when Crossref records one; its full text, on chemrxiv.org, is not read. A preprint's versions have DOIs of their own, and a search shows the first it finds. Crossref needs no key.
- **EPO patents:** patents from every office, through the European Patent Office's Open Patent Services, for prior art and the state of the art. Each result has an English title and abstract, Chinese patents included, with its number, applicant and year. European (EP) and international (WO) patents are read in full: their claims and description. Others (US, CN, JP and so on) are read as their abstracts, marked "[abstract only]" in the results, since the EPO gives full texts for European and international patents only. A search looks among EP and WO patents first and fills the rest from all offices, one patent per family. A search needs every word in a patent's title or abstract, and the EPO lists matches newest first, not by how well they match, so add words that narrow the subject. A quote links to the patent on Espacenet, and **Export papers as BibTeX** includes cited patents with their numbers.
  - **Your EPO key.** Register for free at the [EPO developer portal](https://developers.epo.org/), add an app under **My Apps**, and open it: its page shows a **Consumer Key** and a **Consumer Secret**. Tick **EPO patents** and enter both under it. They are kept in this browser, sent only to the EPO, and backups do not include them. Patents are searched once both are entered. The EPO limits free use (a few searches a minute, and a weekly amount): a question uses a few searches and reads.

## 6. Past answers, export and backup

### Past answers

Each finished answer is saved in the browser. The research screen lists the three most recent under **Recent answers**; **All past answers**, there or at the top of the page, opens the **Past answers** page with every saved answer, newest first, each with its label, when it was asked and which model answered. A report shows how many of its sections are **Backed by quotes**, in red when any section is **Not backed**.

- **Search** finds answers by words in the question or the answer, or in a report's sections; accents and capitals don't matter. **Show** narrows the list by verdict: backed by quotes (✓), needs checking (⚠), not backed (✗), no answer, or reports.
- Click a question to open the answer on its own page, as it was, with its label, evidence and steps. It still shows a document's name and pages after you remove the document. Its address (`…/answers/…`) can be bookmarked; it opens only in the browser that saved it.
- A question that is running keeps running while you look at past answers, and what you typed in the question box stays there.
- **Delete**, on the Past answers page or an answer's page, removes one answer, and **Undo** in the notice that follows brings it back; **Delete all saved answers**, at the bottom of the Past answers page, removes them all, after asking. Documents and models are kept.

The browser's **Back** and **Forward** buttons move between the setup steps, the research screen and past answers, and a reload stays on the same screen.

### Export

- **Export as Markdown** saves the question, the label, the answer (with ⚠ marks), each quote with its source and page, and the steps, as a `.md` file.
- **Export papers as BibTeX** appears when the answer cites OpenAlex, arXiv, DataCite or Europe PMC works, and saves a `.bib` file with their authors, year, venue or repository, DOI and link; arXiv papers carry their arXiv identifier, and papers with PubMed identifiers carry their PMID and PMCID, which biomedical journals and grant forms ask for.

Exports are made in the browser; nothing is uploaded.

### Storage and backup

**Storage and backup**, at the bottom of the research screen, shows what Kovrune keeps in this browser:
- **Space used:** how much Kovrune uses, and how much the browser allows it.
- **Protected or not protected:** browsers may clear a site's data without asking when the disk runs low, and Safari after a week without use. **Ask the browser to keep it** asks for protection. Chrome and Edge decide from how you use the site, so they may decline at first.
- **Downloaded models:** each one with its size, and **Delete** to free the space, after asking. The model in use can't be deleted; change the setup to another model first.

**Download a backup** saves your documents' text and your saved answers in one `.json` file. With a **Backup password**, the file is encrypted in the browser (AES-GCM, with a key derived from the password by PBKDF2), and only that password opens it: keep it, since nobody can recover a backup without it, Kovrune included. To restore an encrypted backup, enter its password first. **Restore from a backup** adds them back, in this browser after it cleared its data, or in another browser. Restoring only adds what is missing; a document with the same name but different text is added alongside the one already here. Models and the setup aren't in the backup: download the model again and redo the setup.

If a saved document or answer can't be read, for example because the browser's storage damaged it, Kovrune leaves it out of the list and says so above it. **Save to a file** keeps a copy, which you can attach to a bug report; **Delete** removes it from the browser.

If the browser's storage for Kovrune is full, saving a document or an answer fails with a message saying so. Free space under **Storage and backup**, for example by deleting a model you don't use, or free disk space.

If saving an answer fails for another reason, for example because the browser closed Kovrune's connection to its storage while the tab was in the background, Kovrune connects again and saves it again: at once, and then every few seconds, five times. While it can't, the research screen says so under the question, and a finished answer or report can still be kept with **Export as Markdown**.

## 7. Privacy

- **The model runs on your computer.** Nothing is sent to an online AI service.
- **Your documents** are read in the browser and never uploaded.
- **Wikipedia, OpenAlex, arXiv, DataCite, Europe PMC, INSPIRE-HEP, PubChem, Alexandria, ChemRxiv and EPO patents** are off by default. When you tick them, the search words the model chooses and the pages it reads are requested from those services: arXiv searches go to DataCite, and so does the title of a conference paper whose arXiv version is looked for, the arXiv papers the model reads are downloaded from arxiv.org, the DataCite works it reads on Zenodo, and with **DataCite** ticked the OpenAlex works it reads from a copy on Zenodo, are downloaded from zenodo.org, Europe PMC's searches and full texts come from www.ebi.ac.uk, INSPIRE-HEP's searches and records from inspirehep.net, PubChem's from pubchem.ncbi.nlm.nih.gov, Alexandria's from alexandria.icams.rub.de, and ChemRxiv's searches and records from api.crossref.org. Your documents and your question as you typed it are not sent. **Look up details on OpenAlex** (under Your documents) sends only the DOIs your documents print, when you click it. An OpenAlex API key, if you enter one, is sent only to OpenAlex. With **EPO patents** ticked, the search words and the patents the model reads are requested from ops.epo.org, and your EPO consumer key and secret are sent only there, to get an access token.
- **Other network requests:**
  - the browser path downloads the model from Hugging Face, and WebLLM's runtime library from GitHub, both at fixed versions that are checked against published checksums;
  - the local-server path talks only to the server address you entered. If that server is on another computer, your questions and the passages the model reads go to it over your network ([how](#use-a-model-server-on-another-computer)).
- **Saved in the browser:** your setup, your source choices, and the text extracted from your documents (not the original files). Finished answers are saved too, with their quotes and steps. They stay on this computer, in this browser only. Removing documents or answers never removes a downloaded model; clearing the site's data in the browser settings removes everything, models included.
- **Find every passage** searches your documents in the browser, without the model and without any network request.

### Data under an ethics protocol or data-protection rules

Interview transcripts, field notes and survey data are often covered by an ethics board (IRB) protocol, participants' consent, or data-protection law such as the GDPR. What Kovrune does with them, for a data management plan:
- **Nothing you add leaves your computer**, except as above: passages the model reads go to the model server you set up, which is on this computer unless you chose [one on another computer](#use-a-model-server-on-another-computer), and nothing goes to an open source unless you tick it. To be sure no open source is asked, leave them all unticked.
- **Stored unencrypted.** The text of your documents and your answers is kept in this browser's storage for this site, which is not encrypted by Kovrune; it is protected as the rest of your user account's files are, so use full-disk encryption and a locked screen as your protocol requires. The original files are not kept.
- **Backups:** without a password, **Download a backup** writes your documents' text and answers into a plain `.json` file; give a **Backup password** to have it encrypted ([how](#storage-and-backup)). Either way, keep it where your protocol allows the data.
- **Deleting:** **Remove** deletes a document's saved text (after the few seconds **Undo** allows), **Delete all saved answers** deletes every answer, and clearing this site's data in the browser's settings deletes everything Kovrune keeps. In a private window, nothing is kept after you close it.
- **Use de-identified text where you can**, as you would with any software: Kovrune quotes your documents word for word, so a name in a transcript appears in answers, exports and backups.

## 8. Troubleshooting

### Starting llama.cpp server

| Problem | Cause | Fix |
| --- | --- | --- |
| `couldn't bind HTTP server socket ... port: 8080` | Another server (often an earlier llama-server) is using the port | `ss -ltnp \| grep 8080` shows it; stop it with `pkill -x llama-server`, or start on another port (`--port 8081`) and use that address in the app |
| `failed to open GGUF file ... No such file or directory` | Wrong model path | `find ~ -name "*.gguf"` and use the full path of your model (not a `ggml-vocab` file) |
| `HTTPS is not supported` with `-hf` | llama.cpp was built without SSL | Download the model with `curl` as in [Download a model](#download-a-model), or rebuild after `sudo apt install libssl-dev` |

### Connecting to the server

| Problem | Cause | Fix |
| --- | --- | --- |
| **Connect** says it couldn't reach the server | The server isn't running, listens only inside WSL, or uses another port | Start it; with WSL, add `--host 0.0.0.0`. If Windows still can't reach WSL, use the address from `hostname -I` in WSL |
| **Connect** fails on the preview site but works with `npm run dev`. The browser console (F12) shows "Permission was denied for this request to access the `loopback` address space" | The browser blocked the web page from reaching servers on your computer | Icon left of the address bar → **Site settings** → **Apps on device**: **Allow**, then reload. **Local network access** is not the one. Safari may block it entirely; use Chrome or Edge |
| **Connect** to a server on another computer fails | The server listens only on its own computer, its firewall blocks the port, or the browser blocked the request | Start it with `--host 0.0.0.0` and allow port 8080 in its firewall. On the preview site, use its IP address or `.local` name and set **Local network access** to **Allow** ([how](#use-a-model-server-on-another-computer)) |
| "The server is running but reports no models" | The server has no model loaded | Start llama.cpp server with `-m` and the path to your model file; with Ollama, download a model first (`ollama pull`) |
| "The server gives each request only … tokens of context" | The server was started with a small `-c`, or with `-np` above 1, which splits the context | Restart it with `-c 4096 -np 1`, then test again |
| After the model test, a note says Ollama runs the model with less context than you set, or didn't say how much | Ollama's default context is smaller than Kovrune needs, and Ollama cuts longer prompts without saying so | Start Ollama with `OLLAMA_CONTEXT_LENGTH=4096` or more, then test again |

### The browser path

| Problem | Cause | Fix |
| --- | --- | --- |
| "This browser does not offer WebGPU" | The browser is old, or WebGPU is off or unsupported on this system | Use a recent Chrome or Edge, or a local model server |
| "Not enough browser storage: the download needs …" | The disk, or the browser's share of it, is too full | Free disk space, or delete a model you don't use under **Storage and backup** |
| "Integrity verification failed: … did not match their published SHA-256" | A file was damaged or changed on the way; it was deleted and not used | Try again. If it happens again, open an issue (below) |
| "This device reports about … GB of memory … It may fail to load", or "This GPU allows buffers of only … MiB" | The GPU or the device may have too little memory for the model | Choose Qwen3.5-2B, or use a local model server. On a phone, use [a model server on another computer](#use-a-model-server-on-another-computer), or try the experimental Qwen3.5-0.8B |
| The model test fails with garbled output | The browser path on a GPU that runs models incorrectly | Use a local model server |
| "The GPU stopped responding or ran out of memory" (the console may show `DXGI_ERROR_DEVICE_HUNG`, "Device was lost" or "A valid external Instance reference no longer exists") | The GPU took too long on the model's work and the graphics driver reset it, or it ran out of memory. Seen on integrated Intel graphics with Qwen3.5-4B, and on a 4 GB Android phone with Qwen3.5-0.8B | Close other tabs and programs and press **Test again** (the model loads again from the browser's storage), or try Qwen3.5-2B. If it fails the same way every time, as on the phone, the device cannot run that model in the browser: use [a model server on another computer](#use-a-model-server-on-another-computer). On integrated graphics, a local model server usually works better |
| "Part of Kovrune, the model runner, could not be downloaded", or loading stays on its first step | The connection was cut while downloading part of the app (seen as `ERR_CONNECTION_RESET` in the browser's Network tab) | Reload the page and try again. If it keeps happening, try with a VPN or antivirus web protection turned off, or on another network |

### The model test and speed

| Problem | Cause | Fix |
| --- | --- | --- |
| The model test says the model is "not acting on tool results" | Server problem with multi-step conversations (seen with Ollama) | Use llama.cpp server with the same model file |
| An answer takes many minutes | Slow hardware, or the server is short of memory | Use Qwen3.5-2B, close other programs, and stop Ollama if it's running (`sudo systemctl stop ollama`) |
| The model test reports far fewer tokens/s than the [speed table](#choose-where-the-model-runs), and the first request is the slowest | The model is short of memory: other programs (large spreadsheets, many browser tabs) use it, so parts of the model are moved to disk. WSL gets only half the computer's memory by default | Close those programs and test again. With WSL, give it more memory: in `%UserProfile%\.wslconfig` put `[wsl2]` and `memory=6GB` on two lines, run `wsl --shutdown`, and start the server again. In WSL, `free -h` shows whether swap (memory moved to disk) is in use |
| "The model server sent nothing for 300 seconds" | The model server stopped or hung during the question | Check the terminal where llama-server runs; restart it if it's stuck, then press **Continue** on the interrupted question to pick up where it stopped |

### Open sources

In each case, the research continues with your other sources.

| Problem | Cause | Fix |
| --- | --- | --- |
| "Wikipedia could not be reached" | No internet connection, or the network blocks it | Check the connection |
| "Wikipedia did not answer within 20 seconds" (or OpenAlex) | The service is slow or the connection is poor | Try again later |
| "arXiv did not answer within 90 seconds" | A paper's PDF downloads slowly on a poor connection | Try again later |
| "The PDF of arXiv paper … could not be read" | The PDF is damaged or unusual, or scanned images | Nothing to fix: the model can read other papers |
| An OpenAlex search finds nothing with **Field** or **Published from** set | The limits are too narrow for the model's words, or OpenAlex did not recognise them | Clear **Field** and **Published from** and try again |
| A Europe PMC paper is read only as its abstract | It is not open access, or Europe PMC did not give its full text within a minute; the text says which | Nothing to fix: the model answers from the abstract or reads another paper |
| A DataCite work is read only as its abstract ("only its record was read") | The work is not on Zenodo, has no PDF there, or its PDF is too large, scanned or could not be downloaded; the step says which | Nothing to fix: the model answers from the abstract or reads another work |
| "OpenAlex is busy (too many requests)" | OpenAlex limits how often anonymous users may search, and many questions in a short time reach the limit. Kovrune waits and tries once more when OpenAlex asks for a short wait | Wait a few minutes. The search's step in the trace ends with "failed" |
| "EPO OPS did not accept the consumer key and secret" | The key or secret is mistyped, or is not the app's pair (the portal also shows your sign-in details), or the EPO has not activated your account yet | Copy the **Consumer Key** and **Consumer Secret** again from your app under **My Apps** in the EPO developer portal. If they are right, ask the EPO's OPS support |
| "EPO OPS refused the request (HTTP 403)" | Your key's free use is used up for now (the EPO limits searches a minute and data a week) | Try again later |
| A patent is read only as its abstract | The EPO gives claims and descriptions for European (EP) and international (WO) patents only | Nothing to fix: look for the patent's EP or WO family member, or download its PDF from Espacenet and add it to your documents |
| "OpenAlex has no requests left for now; they come back in about … hours" | Without an API key, OpenAlex gives everyone on your network's address one small daily budget, and it is used up until midnight UTC | Add a free OpenAlex API key under **Search in** ([how](#open-sources)) |

### Documents

| Problem | Cause | Fix |
| --- | --- | --- |
| A PDF shows "No text found" | The PDF is scanned images | Use a PDF with selectable text |
| A PDF says "Pages … have no text Kovrune can read" | Those pages are scans (an older paper's pages, a scanned appendix), full-page figures without text, or blank. The rest of the PDF is read | For a scanned page, find a version with selectable text (the publisher's, or one run through OCR in Acrobat or OCRmyPDF), remove the document and add that file. Nothing is needed for a figure or a blank page |
| A file is "password-protected" | Kovrune can't open protected files | Open it, remove the password, save it, and add it again |
| An older Office file (.doc, .ppt, .xls) or RTF file is refused | These formats aren't read | Save it as .docx, .pptx, .xlsx or PDF, and add it again |

Still stuck? Open an issue at <https://github.com/bowo-prasetyo/kovrune/issues> with what you did, what you saw, and your OS and browser.
