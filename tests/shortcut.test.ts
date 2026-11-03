import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSubmitShortcut, shortcutKeys } from "../src/app/research/shortcut.ts";

const key = (fields: Partial<Parameters<typeof isSubmitShortcut>[0]>) => ({ key: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...fields });

describe("asking from the keyboard", () => {
  it("asks on Ctrl+Enter or ⌘ Enter", () => {
    assert.equal(isSubmitShortcut(key({ ctrlKey: true })), true);
    assert.equal(isSubmitShortcut(key({ metaKey: true })), true);
  });

  it("leaves Enter alone, and other combinations", () => {
    assert.equal(isSubmitShortcut(key({})), false, "Enter starts a new line");
    assert.equal(isSubmitShortcut(key({ ctrlKey: true, shiftKey: true })), false);
    assert.equal(isSubmitShortcut(key({ ctrlKey: true, altKey: true })), false);
    assert.equal(isSubmitShortcut(key({ key: "a", ctrlKey: true })), false);
  });

  it("doesn't ask while an input method is composing", () => {
    // Typing Japanese, Enter confirms the converted text; the question must not be asked half typed.
    assert.equal(isSubmitShortcut(key({ ctrlKey: true, isComposing: true })), false);
  });

  it("names the keys as the computer does", () => {
    assert.deepEqual(shortcutKeys("MacIntel"), ["⌘", "Enter"]);
    assert.deepEqual(shortcutKeys("iPhone"), ["⌘", "Enter"]);
    assert.deepEqual(shortcutKeys("Win32"), ["Ctrl", "Enter"]);
    assert.deepEqual(shortcutKeys("Linux x86_64"), ["Ctrl", "Enter"]);
  });
});
