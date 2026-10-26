// The app's Content Security Policy (docs/design.md §7.3).
//
// The base policy is a <meta> tag added to index.html at build time, because GitHub
// Pages cannot send headers (§7.4). It allows only the app's own scripts. It can't
// limit connections much: setup must reach whatever model server address the user
// types, including another computer by IP address, which a policy can't list in
// advance, and in CSP a source of `http:` also allows `https:`.
//
// Once a setup is saved, the app adds a second policy that allows connections only to
// the known hosts and that setup's model server. Policies add up, so this can only
// narrow the first; changing the setup reloads the page to start from the base policy.
//
// A meta policy can't set frame-ancestors and doesn't apply inside workers; the
// hosting in M2 slice 5 will send the policy as a header, which covers both.

/** Hosts the app fetches over HTTPS: model downloads, and the open sources the user can tick. */
export const CONNECT_HOSTS = [
  // Model weights; large files redirect to Hugging Face's CDN hosts.
  "https://huggingface.co",
  "https://*.huggingface.co",
  "https://*.hf.co",
  // WebLLM's compiled model libraries.
  "https://raw.githubusercontent.com",
  "https://*.wikipedia.org",
  "https://api.openalex.org",
];

export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  // No inline or third-party scripts. WebLLM and pdf.js compile WebAssembly, which needs 'wasm-unsafe-eval'.
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  "worker-src": ["'self'"],
  // Narrowed once a setup is saved (connectionPolicy).
  "connect-src": ["'self'", "https:", "http:"],
  "img-src": ["'self'", "data:", "blob:"],
  "style-src": ["'self'"],
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};

export function contentSecurityPolicy(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * The policy that limits connections to the known hosts and the saved setup's model
 * server, if any. Undefined when the server's address can't be written in a policy
 * (an IPv6 address such as http://[::1]:8080); the base policy then stays alone.
 */
export function connectionPolicy(serverUrl?: string): string | undefined {
  const sources = ["'self'", ...CONNECT_HOSTS];
  if (serverUrl) {
    let origin: string;
    try {
      origin = new URL(serverUrl).origin;
    } catch {
      return undefined;
    }
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) return undefined;
    sources.push(origin);
  }
  return `connect-src ${sources.join(" ")}`;
}

let restricted = false;

/** Adds the connection policy to the page, once. */
export function restrictConnections(serverUrl: string | undefined, doc: Document = document): void {
  const policy = connectionPolicy(serverUrl);
  if (restricted || !policy) return;
  const meta = doc.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = policy;
  doc.head.append(meta);
  restricted = true;
}
