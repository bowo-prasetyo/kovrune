# Security policy

Kovrune keeps your documents, answers and model setup in your browser, and promises that nothing is sent to an online AI service. A bug that breaks that promise, or that lets someone change what the app runs, is a security problem. Please report it privately.

## Report a vulnerability

Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability**. Only the maintainers see the report.

If that button isn't there, open an issue that says only that you have a security report and asks for a private contact. Don't put details in the issue.

Please include what you did, what happened, and the commit or release you used (shown at the bottom of the page). We aim to reply within 7 days. This is a two-person project, so we can't promise faster fixes, but we will tell you what we plan to do and credit you in the release notes unless you'd rather not be named.

## What counts

In scope:

- **Data leaving the device:** documents, questions or answers sent anywhere other than the model server you configured, or, when you tick them, Wikipedia and OpenAlex searches and the arXiv source's DataCite searches and paper downloads ([README](README.md#running-the-app)).
- **The Content Security Policy** ([`docs/releases.md`](docs/releases.md#content-security-policy)): a way to run scripts the app didn't ship, or to connect to hosts the saved setup doesn't allow.
- **Downloads:** a model file used without matching its pinned SHA-256 ([design §3.4](docs/design.md#34-catalog-entries-and-downloads)).
- **Releases:** a way to publish a release whose files don't match its tag, or whose `SHA256SUMS.sig` isn't checked against [`release-signers`](release-signers).
- **Content from documents or open sources** that makes the app itself misbehave, beyond steering the model's answer, for example script injection through a PDF or a Wikipedia page.

Not a vulnerability, but please open a normal issue:

- A wrong answer, or a wrong answer labelled **Quotes found**. The labels show that quotes are real, not that the answer is right ([user guide](docs/user-guide.md)). These are quality bugs we track closely.
- A prompt in a document that changes what the model says. The model only reads and quotes; it has no tools that write, send or run anything.
- Problems in llama.cpp, Ollama, WebLLM or the models themselves. Report those upstream.

## Supported versions

| Version | Fixes |
| --- | --- |
| The latest signed release | Yes |
| The preview at <https://kovrune.pages.dev/> (built from `main`) | Yes, fixed on `main` |
| Older releases | No; update to the latest |
