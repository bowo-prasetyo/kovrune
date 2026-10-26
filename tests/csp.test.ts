import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { connectionPolicy, contentSecurityPolicy, CSP_DIRECTIVES } from "../src/app/csp.ts";
import { pinnedAppConfig } from "../src/models/pinned.ts";

/**
 * Whether a connect-src source list allows a URL, for the kinds of source used here.
 * As in CSP, a source with scheme http: also allows https:.
 */
function allows(policy: string, url: string): boolean {
  const target = new URL(url);
  const sources = policy.replace(/^connect-src /, "").split(" ");
  return sources.some((source) => {
    if (source === "'self'") return false;
    const schemeOk = (scheme: string) => scheme === target.protocol || (scheme === "http:" && target.protocol === "https:");
    if (/^[a-z]+:$/.test(source)) return schemeOk(source);
    const match = /^([a-z]+:)\/\/(\*\.)?([^:/]+)(?::(\d+|\*))?$/.exec(source)!;
    if (!schemeOk(match[1]!)) return false;
    const hostOk = match[2] ? target.hostname.endsWith(`.${match[3]}`) : target.hostname === match[3];
    const defaultPort = target.protocol === "https:" ? "443" : "80";
    const portOk = match[4] === "*" || (match[4] ?? defaultPort) === (target.port || defaultPort) || (!match[4] && target.protocol === "https:" && match[1] === "http:");
    return hostOk && portOk;
  });
}

const pinned = pinnedAppConfig(prebuiltAppConfig).model_list.find((r) => r.model_id === "Qwen3.5-4B-q4f16_1-MLC")!;
const KNOWN = [
  `${pinned.model}params_shard_0.bin`,
  "https://cas-bridge.xethub.hf.co/xet-bridge-us/abc",
  "https://us.gcp.cdn.hf.co/xet-bridge-us/abc",
  "https://cdn-lfs.huggingface.co/repos/abc",
  pinned.model_lib,
  "https://ja.wikipedia.org/w/api.php",
  "https://api.openalex.org/works",
];

describe("content security policy", () => {
  it("allows only the app's own scripts, and no inline code", () => {
    assert.deepEqual(CSP_DIRECTIVES["script-src"], ["'self'", "'wasm-unsafe-eval'"]);
    assert.doesNotMatch(contentSecurityPolicy(), /unsafe-inline|'unsafe-eval'/);
    assert.deepEqual(CSP_DIRECTIVES["object-src"], ["'none'"]);
    assert.deepEqual(CSP_DIRECTIVES["base-uri"], ["'none'"]);
  });

  it("lets setup reach any model server address", () => {
    const base = `connect-src ${CSP_DIRECTIVES["connect-src"]!.join(" ")}`;
    for (const url of ["http://127.0.0.1:8080/v1", "http://192.168.1.20:8080/v1", "http://my-desktop.local:8080/v1", ...KNOWN]) {
      assert.ok(allows(base, url), url);
    }
  });

  it("after setup, allows the known hosts and the saved model server only", () => {
    const policy = connectionPolicy("http://192.168.1.20:8080/v1")!;
    for (const url of [...KNOWN, "http://192.168.1.20:8080/v1/chat/completions"]) assert.ok(allows(policy, url), url);
    for (const url of [
      "https://example.com/collect",
      "http://example.com/collect",
      "http://192.168.1.21:8080/v1",
      "http://192.168.1.20:9090/v1",
      "https://huggingface.co.example.com/x",
      "https://evil-wikipedia.org/x",
    ]) {
      assert.equal(allows(policy, url), false, url);
    }
    assert.equal(allows(connectionPolicy(undefined)!, "http://127.0.0.1:8080/v1"), false, "browser path: no model server");
  });

  it("leaves connections alone when the server address can't be written in a policy", () => {
    assert.equal(connectionPolicy("http://[::1]:8080/v1"), undefined);
    assert.equal(connectionPolicy("not a url"), undefined);
    assert.equal(connectionPolicy("http://localhost:11434/v1"), `${connectionPolicy()} http://localhost:11434`);
  });
});
