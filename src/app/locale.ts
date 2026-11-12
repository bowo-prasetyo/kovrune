// The app's text is English, so dates and numbers are written the English way too, whatever
// the browser's language: on a Japanese system the page read "tested 11月12日" and
// "2026/11/12 13:26" in English sentences. Day-month order (en-GB) avoids the US-only
// month-first form.
export const APP_LOCALE = "en-GB";

/** "12 Nov 2026, 13:26". */
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(APP_LOCALE, { dateStyle: "medium", timeStyle: "short" });
