import { useCallback, useEffect, useRef, useState } from "react";
import { describeSaveError, sharedStores, type TaskStore } from "./store.ts";
import { TASK_ID, type SavedTask } from "./tasks.ts";

export interface PendingTask {
  /** The saved question in progress: one interrupted earlier, or the one running now. */
  task?: SavedTask;
  save: (task: SavedTask) => void;
  clear: () => void;
  /** Set when progress could not be saved, e.g. because the browser's storage is full. */
  saveError?: string;
}

/** The question in progress, saved in the browser (tasks.ts). Writes are queued, so they land in order. */
export function usePendingTask(): PendingTask {
  const [task, setTask] = useState<SavedTask>();
  const [saveError, setSaveError] = useState<string>();
  const store = useRef<Promise<TaskStore>>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const open = () => (store.current ??= sharedStores().then((stores) => stores.tasks));

  useEffect(() => {
    let cancelled = false;
    void open()
      .then((tasks) => tasks.list())
      .then(
        (saved) => {
          const found = saved.find((t) => t.id === TASK_ID);
          // A task saved while this page loaded wins over the old one.
          if (!cancelled && found) setTask((current) => current ?? found);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const write = useCallback((action: (tasks: TaskStore) => Promise<void>) => {
    queue.current = queue.current
      .then(() => open())
      .then(action)
      .then(
        () => setSaveError(undefined),
        (error: unknown) => setSaveError(describeSaveError(error, "progress on this question", "it can't continue after a reload.")),
      );
  }, []);

  const save = useCallback(
    (next: SavedTask) => {
      setTask(next);
      write((tasks) => tasks.put(next));
    },
    [write],
  );

  const clear = useCallback(() => {
    setTask(undefined);
    write((tasks) => tasks.remove(TASK_ID));
  }, [write]);

  return { task, save, clear, saveError };
}
