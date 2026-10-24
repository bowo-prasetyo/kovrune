import { LoadProgressView } from "../LoadProgressView.tsx";
import { describeSetup } from "../models.ts";
import { useModelLoad } from "../useModelLoad.ts";
import type { Settings } from "../settings.ts";
import { DocumentLibrary } from "./DocumentLibrary.tsx";
import type { LibraryDocument } from "./library.ts";
import { ResearchPanel } from "./ResearchPanel.tsx";

export function ResearchScreen({
  settings,
  documents,
  onDocumentsChange,
  onRetest,
  onChangeSetup,
}: {
  settings: Settings;
  documents: LibraryDocument[];
  onDocumentsChange: (update: (documents: LibraryDocument[]) => LibraryDocument[]) => void;
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
      <DocumentLibrary documents={documents} onChange={onDocumentsChange} />
      <ResearchPanel settings={settings} documents={documents} modelReady={load.state.phase === "ready"} />
    </>
  );
}
