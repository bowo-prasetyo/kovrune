import { modelLabel, SERVER_PRESETS } from "../servers.ts";
import type { Settings } from "../settings.ts";

export function ReadyStep({
  settings,
  onRetest,
  onChangeSetup,
}: {
  settings: Settings;
  onRetest: () => void;
  onChangeSetup: () => void;
}) {
  return (
    <section>
      <h2>You're set up</h2>
      <dl>
        <dt>Server</dt>
        <dd>
          {SERVER_PRESETS[settings.serverKind].label} at <code>{settings.baseUrl}</code>
        </dd>
        <dt>Model</dt>
        <dd>{modelLabel(settings.model)}</dd>
        <dt>Context length</dt>
        <dd>{settings.contextLength.toLocaleString()} tokens</dd>
      </dl>
      <p className="callout">
        Asking questions about your own documents arrives in the next update. Your setup is saved in this browser, so you
        won't need to repeat it.
      </p>
      <div className="actions">
        <button onClick={onChangeSetup}>Change setup</button>
        <button className="primary" onClick={onRetest}>
          Test the model again
        </button>
      </div>
    </section>
  );
}
