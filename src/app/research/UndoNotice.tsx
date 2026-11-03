import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_SECONDS } from "./undo.ts";

interface Offer {
  text: string;
  undo: () => void;
  /** Distinguishes two removals with the same text, so each restarts the timer. */
  key: number;
}

/**
 * An undo offer after a removal: `offer` shows it, replacing any earlier one. It moves focus to its Undo
 * button, since the removed item's own button is gone, and stays UNDO_SECONDS, longer while the pointer
 * or focus is on it.
 */
export function useUndo(): { offer: (text: string, undo: () => void) => void; notice: React.JSX.Element | null } {
  const [current, setCurrent] = useState<Offer>();
  const offer = useCallback((text: string, undo: () => void) => setCurrent((last) => ({ text, undo, key: (last?.key ?? 0) + 1 })), []);
  const notice = current ? <UndoNotice key={current.key} offer={current} onDone={() => setCurrent(undefined)} /> : null;
  return { offer, notice };
}

function UndoNotice({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const held = useRef(false);

  useEffect(() => {
    button.current?.focus({ preventScroll: true });
    const timer = setInterval(() => {
      if (!held.current && !box.current?.contains(document.activeElement)) onDone();
    }, UNDO_SECONDS * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      ref={box}
      className="undo-notice"
      role="status"
      onPointerEnter={() => (held.current = true)}
      onPointerLeave={() => (held.current = false)}
    >
      <span>{offer.text}</span>
      <button
        ref={button}
        onClick={() => {
          offer.undo();
          onDone();
        }}
      >
        Undo
      </button>
      <button className="link" aria-label="Dismiss" onClick={onDone}>
        ×
      </button>
    </div>
  );
}
