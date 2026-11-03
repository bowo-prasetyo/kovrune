// Ctrl+Enter (⌘ Enter on a Mac) asks the question in the box, so it can be asked without leaving the
// keyboard; Enter alone still starts a new line.

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True while an input method is composing, e.g. typing Japanese: Enter then confirms the text. */
  isComposing?: boolean;
}

/** Whether a key press in the question box asks the question. */
export function isSubmitShortcut(event: KeyLike): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.isComposing;
}

/** The shortcut's keys as this computer names them: ["⌘", "Enter"] on Apple devices, ["Ctrl", "Enter"] elsewhere. */
export function shortcutKeys(platform: string): [string, string] {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? ["⌘", "Enter"] : ["Ctrl", "Enter"];
}
