import { LoadProgressView } from "../LoadProgressView.tsx";
import { describeSetup } from "../models.ts";
import { useModelLoad } from "../useModelLoad.ts";
import type { Settings } from "../settings.ts";
import { DocumentLibrary } from "./DocumentLibrary.tsx";
import type { SavedAnswer } from "./answers.ts";
import type { SavedDocuments, SavedRecords } from "./useSavedDocuments.ts";
import { ResearchPanel } from "./ResearchPanel.tsx";
import { StorageSection } from "./StorageSection.tsx";

export function ResearchScreen({
  settings,
  library,
  history,
  onRetest,
  onChangeSetup,
}: {
  settings: Settings;
  library: SavedDocuments;
  history: SavedRecords<SavedAnswer>;
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
      <ResearchPanel settings={settings} documents={library.documents} modelReady={load.state.phase === "ready"} history={history} />
      <StorageSection settings={settings} library={library} history={history} />
    </>
  );
}
