// How long a question or report has been running, shown under its steps. On a slow laptop a question
// can take several minutes with only "Waiting for the model…" on screen, and the usability test
// protocol asks whether people think the app has frozen. The model test's estimate (settings.ts,
// lastTest.maxTaskMinutes) says how long is normal.

/** "0:42", "12:05", or "1:02:05" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** "under a minute", "up to 7 min", "up to 1.5 hours", as the report estimate says them (report.ts). */
function upTo(minutes: number): string {
  if (minutes < 1) return "under a minute";
  return minutes < 90 ? `up to ${Math.round(minutes)} min` : `up to ${Math.round(minutes / 6) / 10} hours`;
}

/**
 * The line under a running question or report: the time so far, and how long the model test says it
 * can take. Past that, it says so, and that waiting or stopping are both fine.
 */
export function describeElapsed(
  elapsedMs: number,
  upToMinutes: number | undefined,
  what: "question" | "report" = "question",
): { text: string; over: boolean } {
  const clock = `${formatClock(elapsedMs)} so far`;
  if (upToMinutes === undefined) return { text: `${clock}.`, over: false };
  const subject = what === "report" ? "this report" : "a question";
  if (elapsedMs <= upToMinutes * 60_000) {
    return { text: `${clock}. At the speed the model test measured, ${subject} can take ${upTo(upToMinutes)}.`, over: false };
  }
  return {
    text: `${clock}, longer than the ${upTo(upToMinutes)} the model test suggested. The model may be busy or slower now; you can keep waiting, or stop.`,
    over: true,
  };
}
