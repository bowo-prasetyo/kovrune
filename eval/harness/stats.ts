// How sure a benchmark result is (audit item 3). The suites are small, 4 to 47 tasks, so one task
// is 2 to 25 percentage points, and a change of a task or two can be chance: which token wins at
// temperature 0 moves with the CPU and the build (eval/field/README.md). These say how much.

/** Wilson score interval at 95% for k successes in n trials, as shares; [0, 0] when n is 0. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const center = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/**
 * Exact two-sided McNemar test for two runs of the same tasks: `gained` tasks pass only in the
 * second run, `lost` only in the first. Tasks with the same result in both say nothing about the
 * difference. The p-value is the chance of a split at least this uneven if the change did nothing,
 * so each discordant task went either way with even odds.
 */
export function mcnemar(gained: number, lost: number): number {
  const n = gained + lost;
  if (n === 0) return 1;
  const k = Math.min(gained, lost);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binomial(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

/** "85% (72–93%)": a rate with its 95% interval, in whole percent. */
export function formatRate(k: number, n: number): string {
  if (n === 0) return "–";
  const [low, high] = wilson(k, n);
  const percent = (x: number) => Math.round(x * 100);
  return `${percent(k / n)}% (${percent(low)}–${percent(high)}%)`;
}
