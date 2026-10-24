import { useEffect, useState } from "react";
import { detectCapabilities, recommendPath, type DeviceCapabilities, type ModelPath } from "../device.ts";

export function DeviceStep({ onChoose }: { onChoose: (path: ModelPath, caps: DeviceCapabilities) => void }) {
  const [caps, setCaps] = useState<DeviceCapabilities>();

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((detected) => {
      if (!cancelled) setCaps(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!caps) {
    return (
      <section>
        <h2>Checking your device…</h2>
      </section>
    );
  }

  const advice = recommendPath(caps);
  const browserButton = (
    <button className={advice.path === "browser" ? "primary" : undefined} onClick={() => onChoose("browser", caps)}>
      {advice.path === "browser" ? "Run in this browser" : "Run in this browser anyway"}
    </button>
  );
  const serverButton = (
    <button className={advice.path === "local-server" ? "primary" : undefined} onClick={() => onChoose("local-server", caps)}>
      Use a local model server
    </button>
  );

  return (
    <section>
      <h2>Where should the model run?</h2>
      <p className="callout">
        <strong>
          {advice.path === "browser" ? "Recommended: in this browser." : "Recommended: a local model server."}
        </strong>{" "}
        {advice.reason}
      </p>
      <ul>
        <li>
          <strong>In this browser:</strong> the page downloads a model once (1–2.4 GB) and runs it on your GPU. Nothing
          else to install.
        </li>
        <li>
          <strong>Local model server:</strong> you install llama.cpp and run the model natively. Works on most
          computers, including those without a suitable GPU.
        </li>
      </ul>
      <p>Either way, the model runs on your computer; nothing is sent to an online AI service.</p>
      <details>
        <summary>What Kovrune detected</summary>
        <ul>
          <li>WebGPU: {caps.webgpu ? "available" : "not available"}</li>
          {caps.webgpu && (
            <>
              <li>GPU: {[caps.vendor, caps.architecture].filter(Boolean).join(" ") || "unknown"}</li>
              <li>16-bit shaders: {caps.shaderF16 ? "yes" : "no"}</li>
              <li>Largest GPU buffer: {caps.maxBufferMiB} MiB</li>
            </>
          )}
          {caps.ramGiB !== undefined && <li>Device memory (as reported by the browser): about {caps.ramGiB} GB</li>}
        </ul>
      </details>
      <div className="actions">
        {advice.path === "browser" ? (
          <>
            {serverButton}
            {browserButton}
          </>
        ) : (
          <>
            {caps.webgpu && browserButton}
            {serverButton}
          </>
        )}
      </div>
    </section>
  );
}
