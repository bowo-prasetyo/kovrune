import { useEffect, useState } from "react";
import { detectCapabilities, recommendPath, type DeviceCapabilities, type Recommendation } from "../device.ts";

export function DeviceStep({ onContinue }: { onContinue: () => void }) {
  const [caps, setCaps] = useState<DeviceCapabilities>();
  const [advice, setAdvice] = useState<Recommendation>();

  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then((detected) => {
      if (cancelled) return;
      setCaps(detected);
      setAdvice(recommendPath(detected));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!advice || !caps) {
    return (
      <section>
        <h2>Checking your device…</h2>
      </section>
    );
  }

  return (
    <section>
      <h2>Where should the model run?</h2>
      {advice.path === "local-server" ? (
        <p className="callout">
          <strong>Recommended: a local model server.</strong> {advice.reason}
        </p>
      ) : (
        <p className="callout">
          <strong>Your GPU looks capable of running the model in this browser.</strong> {advice.reason} Running in the
          browser arrives in a later update; for now, connect to a model server on this computer.
        </p>
      )}
      <p>
        A local model server runs the model natively on your computer. Kovrune talks to it directly; nothing is sent to an
        online AI service.
      </p>
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
        </ul>
      </details>
      <div className="actions">
        <button className="primary" onClick={onContinue}>
          Use a local model server
        </button>
      </div>
    </section>
  );
}
