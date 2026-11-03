/** The user guide, on GitHub so it is readable without running the app. */
export const HELP_URL = "https://github.com/bowo-prasetyo/kovrune/blob/main/docs/user-guide.md";

/**
 * What a reload keeps, on the page shown after a crash (ErrorBoundary.tsx). The setup is in
 * localStorage; documents, saved answers and the question in progress are in the browser's database
 * (research/store.ts), except in a private window, where they last only until a reload.
 */
export const CRASH_RECOVERY =
  "Reloading usually fixes it. Your setup, documents and saved answers are kept in this browser, and a question that was running can continue where it stopped. In a private window, documents and answers last only until a reload.";
