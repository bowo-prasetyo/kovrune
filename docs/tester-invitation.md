# Tester invitations

Ready-to-send texts for the last two M1 checks (see [`m1-plan.md`](m1-plan.md#progress)):

- **A. Usability session:** 3–5 people, about 45 minutes each, run with [`usability-test.md`](usability-test.md).
- **B. Class 2 browser check:** someone with a capable GPU runs the model in the browser on their own and reports back. This is the open slice 3 check. A class 2 usability participant covers it too.

Each comes in English and Japanese; edit names, dates and contact details before sending. Keep invitation A short and neutral. **Don't explain the answer labels or how to judge answers**: the session checks whether those come across without help.

## A. Usability session

### English

> **Subject:** Try a new research app for 45 minutes?
>
> Hi [name],
>
> I'm testing Kovrune, an open-source app that answers questions about your own documents with an AI model that runs on your computer. Nothing is sent to an online AI service.
>
> Would you try it for about 45 minutes, in person or over a screen share? You'd install it, ask it a few questions, and tell me what you think as you go. It's the app being tested, not you.
>
> What you'd need:
> - a laptop or desktop (Windows, macOS or Linux) where you can install software;
> - Chrome or Edge;
> - one PDF of your own with selectable text (a report, manual or paper), and one question you know it answers. You decide what to share; I won't keep your document.
>
> A Mac with Apple silicon, or a PC with a recent NVIDIA or AMD graphics card, is especially welcome, but any computer with 8 GB of memory works.
>
> Could you reply with a few times that suit you over the next two weeks?
>
> Thanks,
> [your name]

### 日本語

> **件名:** 新しいリサーチアプリを45分ほど試していただけませんか
>
> [お名前]さん
>
> Kovrune(コヴルーン)というオープンソースのアプリをテストしています。手元のパソコン上で動く AI モデルを使い、ご自身の文書についての質問に答えるアプリです。オンラインの AI サービスには何も送信されません。
>
> 対面または画面共有で、45分ほど試していただけないでしょうか。インストールして、いくつか質問をしながら、感じたことをその場で話していただくだけです。テストするのはアプリで、あなたではありません。
>
> ご用意いただきたいもの:
> - ソフトウェアをインストールできるノートパソコンまたはデスクトップ(Windows、macOS、Linux のいずれか)
> - Chrome または Edge
> - 文字を選択できる PDF を1つ(報告書、マニュアル、論文など)と、その PDF に答えが書かれている質問を1つ。どの文書を使うかはお任せします。文書をこちらで保存することはありません。
>
> Apple シリコン搭載の Mac、または最近の NVIDIA/AMD のグラフィックカードを搭載した PC だと特に助かりますが、メモリ 8 GB 以上のパソコンであれば大丈夫です。
>
> 今後2週間でご都合のよい日時をいくつか教えていただけますか。
>
> よろしくお願いします。
> [あなたのお名前]

## B. Class 2 browser check

For someone who can't join a session but has a capable GPU. It can go by email, or as a comment on [issue #9](https://github.com/bowo-prasetyo/kovrune/issues/9), whose readers already have class 2 machines.

### English

> **Help wanted: run Kovrune's AI model in your browser (about 20 minutes)**
>
> Kovrune can now run its research agent entirely in the browser with WebLLM. We need one check on real hardware: a **Mac with Apple silicon (M1 or newer)**, or a **PC with a recent NVIDIA or AMD GPU**, in Chrome or Edge.
>
> 1. `git clone https://github.com/bowo-prasetyo/kovrune.git && cd kovrune && npm ci && npm run dev`, then open the printed address.
> 2. On **Your device**, note what Kovrune recommends, then choose **Run in this browser**.
> 3. Choose **Qwen3.5-4B** (a 2.4 GB download, once) and press **Download and test**. Note how long the download and the model test take, and the speed the test reports.
> 4. Add any PDF with selectable text, and ask one question it answers and one it doesn't.
>
> Please reply with:
> - your machine (model, memory, GPU), OS and browser;
> - what the device step recommended;
> - the model test result and speed;
> - for each question, the label (for example **Quotes found** or **Not found in your sources**), whether the answer was right, and how long it took.
>
> Everything runs on your computer. The only downloads are the model from Hugging Face and WebLLM's runtime library from GitHub. Your PDF and questions never leave your machine.

### 日本語

> **お願い:Kovrune の AI モデルをブラウザで動かしてみてください(約20分)**
>
> Kovrune は、リサーチ用のエージェントをブラウザだけで(WebLLM で)動かせるようになりました。実機での確認が1件必要です。対象は **Apple シリコン(M1 以降)搭載の Mac**、または**最近の NVIDIA/AMD GPU 搭載の PC** で、ブラウザは Chrome か Edge です。
>
> 1. `git clone https://github.com/bowo-prasetyo/kovrune.git && cd kovrune && npm ci && npm run dev` を実行し、表示されたアドレスを開きます。
> 2. **Your device** の画面で Kovrune がどちらを勧めるかをメモしてから、**Run in this browser** を選びます。
> 3. **Qwen3.5-4B**(初回のみ 2.4 GB のダウンロード)を選び、**Download and test** を押します。ダウンロードとモデルテストにかかった時間、およびテストが表示した速度をメモしてください。
> 4. 文字を選択できる PDF を1つ追加し、その PDF で答えられる質問と答えられない質問を1つずつ尋ねます。
>
> 次の内容をお知らせください:
> - お使いの機種(モデル、メモリ、GPU)、OS、ブラウザ
> - デバイス画面で勧められた方法
> - モデルテストの結果と速度
> - 各質問について、表示されたラベル(例:**Quotes found**、**Not found in your sources**)、答えが正しかったか、かかった時間
>
> すべてお使いのパソコン上で動きます。ダウンロードされるのは Hugging Face のモデルと GitHub の WebLLM ランタイムだけで、PDF や質問がパソコンの外に出ることはありません。

## After a session or check

Record the results as described in [`usability-test.md`](usability-test.md#reporting): counts in `m1-plan.md`, and an issue for each finding that needs a change. For a class 2 browser check, add the result under slice 3 in `m1-plan.md`. Ask before quoting anyone.
