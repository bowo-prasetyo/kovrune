import { download } from "./download.ts";
import { confirmDamagedDeletion, damagedFileName, describeDamaged } from "./records.ts";

/** Above a list: saved records that can't be read (records.ts), with a copy to save and a way to delete them. */
export function DamagedNotice({ damaged, onDelete, noun }: { damaged: unknown[]; onDelete: () => Promise<void>; noun: "document" | "answer" }) {
  if (!damaged.length) return null;
  return (
    <div className="warning damaged" role="alert">
      <p>{describeDamaged(damaged.length, noun)}</p>
      <div className="actions">
        <button onClick={() => download(damagedFileName(noun), JSON.stringify(damaged, null, 2), "application/json")}>Save to a file</button>
        <button onClick={() => void (confirm(confirmDamagedDeletion(damaged.length, noun)) && onDelete())}>Delete</button>
      </div>
    </div>
  );
}
