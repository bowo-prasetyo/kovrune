# Releases and reproducible builds

Kovrune is a web app, so what you run is whatever the server sends. This page explains how a release is built, and how anyone can check that a release is exactly what its source code produces. It also covers the Content Security Policy that limits what the page itself may do.

| | |
| --- | --- |
| Status | M2 slice 4: builds are reproducible, releases are built from tags. Releases are **not signed yet**; signing and hosting are slice 5 ([design §7.4](design.md#74-hosting-requirements)) |

## How a release is made

1. The owner pushes a version tag, such as `v0.1.0`.
2. The [release workflow](../.github/workflows/release.yml) runs the tests and builds the app with `KOVRUNE_BUILD=release`. It then writes `SHA256SUMS`, the SHA-256 of every file in the build.
3. It creates a **draft** GitHub release with `SHA256SUMS` and the build as a `.tar.gz`. The owner reviews the draft and publishes it.

The preview site is separate: it is built from `main` on every push ([`pages.yml`](../.github/workflows/pages.yml)), with `KOVRUNE_BASE=/kovrune/` and `KOVRUNE_BUILD=preview`.

## Check a release yourself

You need git and the Node.js version in [`.nvmrc`](../.nvmrc).

```bash
git clone https://github.com/bowo-prasetyo/kovrune.git && cd kovrune
git checkout v0.1.0                     # the release's tag
npm ci
KOVRUNE_BUILD=release GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=v0.1.0 npm run build
npm run checksums -- --check path/to/SHA256SUMS   # the file from the release
```

`All N files in dist/app match` means your build is byte for byte the release. On Linux or macOS you can also run `cd dist/app && sha256sum -c path/to/SHA256SUMS`.

Compare files, not the `.tar.gz`: archive tools add their own metadata, so the archive is for convenience only.

**What makes the build reproducible:**
- Dependencies are locked in `package-lock.json`, and `npm ci` installs exactly those.
- The Node.js version is pinned in `.nvmrc`, and the workflows use it.
- The build reads nothing from the machine: the date in the footer is the commit's date, not the build day, and no file paths end up in the output.
- The output depends only on the commit and the variables above (`KOVRUNE_BUILD`, `KOVRUNE_BASE`, `GITHUB_SHA`, `GITHUB_REF_NAME`).

CI checks this on every pull request. The `reproducible` job builds the commit twice, in different directories and time zones, and fails if any file differs.

**What this doesn't prove yet:** a match shows the release came from that tag. It doesn't show that the site you open serves the release. That needs the signed releases and hosting of slice 5.

## Content Security Policy

Built pages carry a Content Security Policy ([`src/app/csp.ts`](../src/app/csp.ts)). It is a `<meta>` tag, because GitHub Pages can't send headers.

**Scripts:** only the app's own. No inline scripts, no scripts from other sites, no `eval`. WebAssembly is allowed (`'wasm-unsafe-eval'`), because WebLLM and pdf.js need it. Plugins (`object-src`), `<base>` and form submissions are blocked.

**Connections**, in two stages:
- **During setup,** the page may connect anywhere. It has to reach whatever model server address you type, including another computer by IP address ([user guide](user-guide.md#use-a-model-server-on-another-computer)). A policy can't list such addresses in advance, and in CSP, allowing `http:` also allows `https:`.
- **Once a setup is saved,** the app adds a second policy that allows only Hugging Face, GitHub's raw files (model libraries), Wikipedia, OpenAlex, and the model server you saved. Policies add up, so this can only narrow the first. **Change setup** reloads the page to lift it for the new setup.
  - The exception is a server address the policy can't express, such as an IPv6 address (`http://[::1]:8080`); connections then stay open.

**Limits of a `<meta>` policy,** which the header-based hosting in slice 5 removes:
- `frame-ancestors` can't be set, so other sites could embed the page in a frame.
- The policy doesn't apply inside workers. WebLLM downloads models from a worker, so those downloads aren't covered; the files are checked against their SHA-256 instead ([design §3.4](design.md#34-catalog-entries-and-downloads)).

`npm run dev` has no policy, because Vite's hot reloading needs inline scripts. To try the policy locally, run `npm run build && npm run preview`.
