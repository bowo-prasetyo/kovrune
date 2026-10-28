import { LoadProgressView } from "../LoadProgressView.tsx";
import { describeSetup, modelCaution } from "../models.ts";
import { useModelLoad } from "../useModelLoad.ts";
import { describeLastTest, type Settings } from "../settings.ts";
import { DocumentLibrary } from "./DocumentLibrary.tsx";
import type { SavedAnswer } from "./answers.ts";
import type { SavedDocuments, SavedRecords } from "./useSavedDocuments.ts";
import { ResearchPanel } from "./ResearchPanel.tsx";
import { StorageSection } from "./StorageSection.tsx";

export function ResearchScreen({
  settings,
  library,
  history,
  openAnswerId,
  onOpenAnswer,
  onRetest,
  onChangeSetup,
}: {
  settings: Settings;
  library: SavedDocuments;
  history: SavedRecords<SavedAnswer>;
  openAnswerId?: string;
  onOpenAnswer: (id: string | undefined) => void;
  onRetest: () => void;
  onChangeSetup: () => void;
}) {
  const load = useModelLoad(settings);
  const caution = modelCaution(settings);
  return (
    <>
      <div className="setup-summary">
        <span>
          {describeSetup(settings)}
          {settings.lastTest && <span className="hint">, {describeLastTest(settings.lastTest)}</span>}
        </span>
        <span className="links">
          <button className="link" onClick={onRetest}>
            Test the model again
          </button>
          <button className="link" onClick={onChangeSetup}>
            Change setup
          </button>
        </span>
      </div>
      {caution && (
        <p className="hint" role="note">
          {caution}
        </p>
      )}
      <LoadProgressView state={load.state} onRetry={load.retry} />
      <DocumentLibrary library={library} />
      <ResearchPanel settings={settings} documents={library.documents} modelReady={load.state.phase === "ready"}
        history={history}
        openAnswerId={openAnswerId}
        onOpenAnswer={onOpenAnswer}
      />
      <StorageSection settings={settings} library={library} history={history} />
    </>
  );
}
