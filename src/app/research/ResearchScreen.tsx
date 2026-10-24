import { modelLabel, SERVER_PRESETS } from "../servers.ts";
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
  return (
    <>
      <div className="setup-summary">
        <span>
          {modelLabel(settings.model)} on {SERVER_PRESETS[settings.serverKind].label}
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
      <DocumentLibrary documents={documents} onChange={onDocumentsChange} />
      <ResearchPanel settings={settings} documents={documents} />
    </>
  );
}
