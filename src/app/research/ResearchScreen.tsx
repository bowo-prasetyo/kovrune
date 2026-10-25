import { LoadProgressView } from "../LoadProgressView.tsx";
import { describeSetup } from "../models.ts";
import { useModelLoad } from "../useModelLoad.ts";
import type { Settings } from "../settings.ts";
import { DocumentLibrary } from "./DocumentLibrary.tsx";
import type { SavedDocuments } from "./useSavedDocuments.ts";
import { ResearchPanel } from "./ResearchPanel.tsx";

export function ResearchScreen({
  settings,
  library,
  onRetest,
  onChangeSetup,
}: {
  settings: Settings;
  library: SavedDocuments;
  onRetest: () => void;
  onChangeSetup: () => void;
}) {
  const load = useModelLoad(settings);
  return (
    <>
      <div className="setup-summary">
        <span>{describeSetup(settings)}</span>
        <span className="links">
          <button className="link" onClick={onRetest}>
            Test the model again
          </button>
          <button className="link" onClick={onChangeSetup}>
            Change setup
          </button>
        </span>
      </div>
      <LoadProgressView state={load.state} onRetry={load.retry} />
      <DocumentLibrary library={library} />
      <ResearchPanel settings={settings} documents={library.documents} modelReady={load.state.phase === "ready"} />
    </>
  );
}
