# Releases and reproducible builds

Kovrune is a web app, so what you run is whatever the server sends. This page explains how a release is built, and how anyone can check that a release is exactly what its source code produces. It also covers the Content Security Policy that limits what the page itself may do.

| | |
| --- | --- |
| Status | Builds are reproducible (M2 slice 4). The app is hosted on Cloudflare Pages, which sends the policy as a header, and releases are signed by the owner (slice 5) |

## How a release is made

1. The owner pushes a version tag, such as `v0.1.0`.
2. The [release workflow](../.github/workflows/release.yml) runs the tests and builds the app with `KOVRUNE_BUILD=release`. It then writes `SHA256SUMS`, the SHA-256 of every file in the build.
3. It creates a **draft** GitHub release with `SHA256SUMS` and the build as a `.tar.gz`.
4. The owner rebuilds the tag on their own computer and signs `SHA256SUMS` with a key CI never sees ([below](#sign-a-release-owner)). Signing first checks that the owner's own build matches CI's checksums.
5. The owner attaches `SHA256SUMS.sig` to the draft and publishes it. The [release signature workflow](../.github/workflows/release-signature.yml) then checks the signature against [`release-signers`](../release-signers), as of the tag, and turns the release back into a draft if it's missing or wrong.

So a published release carries two independent checks: GitHub Actions built it, and the owner's own rebuild matched it before they signed.

The app at <https://kovrune.pages.dev/> is the preview, built from `main` on every push ([`cloudflare.yml`](../.github/workflows/cloudflare.yml)); releases are for anyone who wants to host or check a fixed version.

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

**Check the signature** too, with `SHA256SUMS.sig` from the release next to `SHA256SUMS`:

```bash
npm run release:verify -- path/to/SHA256SUMS
```

`Good signature … by bowo-prasetyo` means the owner signed exactly these checksums. Without Node, OpenSSH does the same: `ssh-keygen -Y verify -f release-signers -I bowo-prasetyo -n kovrune-release -s SHA256SUMS.sig < SHA256SUMS`.

Compare files, not the `.tar.gz`: archive tools add their own metadata, so the archive is for convenience only.

**What makes the build reproducible:**
- Dependencies are locked in `package-lock.json`, and `npm ci` installs exactly those.
- The Node.js version is pinned in `.nvmrc`, and the workflows use it.
- The build reads nothing from the machine: the date in the footer is the commit's date, not the build day, and no file paths end up in the output.
- The output depends only on the commit and the variables above (`KOVRUNE_BUILD`, `KOVRUNE_BASE`, `GITHUB_SHA`, `GITHUB_REF_NAME`).

CI checks this on every pull request. The `reproducible` job builds the commit twice, in different directories and time zones, and fails if any file differs.

**What this doesn't prove:** a match shows the release came from that tag, and the signature shows the owner vouches for it. It doesn't show that a site you open serves that release; the preview at kovrune.pages.dev serves `main`. To run a release you have checked, serve its files yourself.

## Sign a release (owner)

**Once: create the signing key** on your own computer, not in CI or a cloud session. In WSL, macOS or Linux, or in Windows PowerShell (OpenSSH comes with Windows 10 and later):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kovrune-release -C "Kovrune releases"
```

Give it a passphrase when asked. Back up `~/.ssh/kovrune-release` somewhere offline: without it you can't sign, and a new key means a new line in `release-signers`. Then add the **public** half to [`release-signers`](../release-signers), in a pull request:

```bash
echo "bowo-prasetyo namespaces=\"kovrune-release\" $(cut -d' ' -f1,2 ~/.ssh/kovrune-release.pub) Kovrune releases"
```

The `.pub` file is public and safe to share; never share or commit the file without `.pub`.

**For each release,** after the release workflow has made the draft:

```bash
git fetch --tags && git checkout v0.1.0
npm ci
KOVRUNE_BUILD=release GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=v0.1.0 npm run build
# Download SHA256SUMS from the draft release, then:
npm run release:sign -- path/to/SHA256SUMS --key ~/.ssh/kovrune-release
```

`release:sign` refuses to sign if your build doesn't match the draft's `SHA256SUMS`. Otherwise it asks for the key's passphrase, writes `SHA256SUMS.sig` and checks it against `release-signers`. Attach `SHA256SUMS.sig` to the draft and publish.

## Content Security Policy

Built pages carry a Content Security Policy ([`src/app/csp.ts`](../src/app/csp.ts)). It is a `<meta>` tag, because GitHub Pages can't send headers.

**Scripts:** only the app's own. No inline scripts, no scripts from other sites, no `eval`. WebAssembly is allowed (`'wasm-unsafe-eval'`), because WebLLM and pdf.js need it. Plugins (`object-src`), `<base>` and form submissions are blocked.

**Connections**, in two stages:
- **During setup,** the page may connect anywhere. It has to reach whatever model server address you type, including another computer by IP address ([user guide](user-guide.md#use-a-model-server-on-another-computer)). A policy can't list such addresses in advance, and in CSP, allowing `http:` also allows `https:`.
- **Once a setup is saved,** the app adds a second policy that allows only Hugging Face, GitHub's raw files (model libraries), Wikipedia, OpenAlex, and the model server you saved. Policies add up, so this can only narrow the first. **Change setup** reloads the page to lift it for the new setup.
  - The exception is a server address the policy can't express, such as an IPv6 address (`http://[::1]:8080`); connections then stay open.

**As a header:** on Cloudflare Pages, the build's `_headers` file sends the same policy as a header, with `frame-ancestors 'none'` so no other site can show the app in a frame. A header policy also applies inside workers, such as the one WebLLM downloads models from. The deploy workflow checks that the served page carries it.

**On hosts that ignore `_headers`,** such as the GitHub Pages preview, only the `<meta>` tag applies. It can't set `frame-ancestors` and doesn't cover workers; WebLLM's downloads are still checked against their SHA-256 ([design §3.4](design.md#34-catalog-entries-and-downloads)).

`npm run dev` has no policy, because Vite's hot reloading needs inline scripts. To try the policy locally, run `npm run build && npm run preview`.
