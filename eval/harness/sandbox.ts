// Runs submitted code against tests in a separate worker with a hard timeout.
//
// M0 only runs code produced by the model under test for our own fixed tasks.
// This is NOT a security boundary: the real sandbox (no network, memory limits,
// Pyodide/QuickJS isolation) is milestone M2.5 in docs/design.md.

import type { CodeTest } from "../tasks/coding.ts";

export interface TestOutcome {
  expr: string;
  passed: boolean;
  /** Short explanation for failures, shown to the agent for visible tests. */
  detail?: string;
}

export interface TestRun {
  outcomes: TestOutcome[];
  /** Set when the code could not be loaded or the run timed out. */
  error?: string;
}

export interface CodeRunner {
  run(code: string, tests: CodeTest[], timeoutMs?: number): Promise<TestRun>;
}

/**
 * Executed inside the worker, so it must not reference anything outside its own body.
 * Common host capabilities are shadowed so submitted code cannot reach them by name.
 */
function runTestsInWorker(code: string, tests: CodeTest[]): TestRun {
  const shadowed = ["require", "process", "fetch", "XMLHttpRequest", "WebSocket", "importScripts", "postMessage", "self", "globalThis"];
  const describe = (value: unknown): string => {
    try {
      const text = JSON.stringify(value);
      return text === undefined ? String(value) : text.length > 200 ? `${text.slice(0, 200)}…` : text;
    } catch {
      return String(value);
    }
  };
  const deepEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  };

  const outcomes: TestOutcome[] = [];
  for (const test of tests) {
    try {
      // Each test re-evaluates the code so state cannot leak between tests.
      const evaluate = new Function(...shadowed, `"use strict";\n${code}\n;return (${test.expr});`);
      const actual = evaluate();
      if (test.throws) {
        outcomes.push({ expr: test.expr, passed: false, detail: `expected an error, got ${describe(actual)}` });
      } else if (deepEqual(actual, test.expected)) {
        outcomes.push({ expr: test.expr, passed: true });
      } else {
        outcomes.push({ expr: test.expr, passed: false, detail: `expected ${describe(test.expected)}, got ${describe(actual)}` });
      }
    } catch (error) {
      if (test.throws) {
        outcomes.push({ expr: test.expr, passed: true });
      } else {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        outcomes.push({ expr: test.expr, passed: false, detail: `threw ${message}` });
      }
    }
  }
  return { outcomes };
}

const workerBody = `const runTestsInWorker = ${runTestsInWorker.toString()};`;

function timedOut(tests: CodeTest[], timeoutMs: number): TestRun {
  return {
    outcomes: tests.map((test) => ({ expr: test.expr, passed: false, detail: "timed out" })),
    error: `Timed out after ${timeoutMs} ms`,
  };
}

/** Runner for browsers: a dedicated Web Worker created from a Blob URL. */
export class BrowserCodeRunner implements CodeRunner {
  async run(code: string, tests: CodeTest[], timeoutMs = 3000): Promise<TestRun> {
    const source = `${workerBody}\nonmessage = (e) => postMessage(runTestsInWorker(e.data.code, e.data.tests));`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    try {
      return await new Promise<TestRun>((resolve) => {
        const timer = setTimeout(() => resolve(timedOut(tests, timeoutMs)), timeoutMs);
        worker.onmessage = (event: MessageEvent<TestRun>) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          event.preventDefault();
          resolve({ outcomes: tests.map((t) => ({ expr: t.expr, passed: false, detail: "worker error" })), error: event.message });
        };
        worker.postMessage({ code, tests });
      });
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }
}

/** Runner for Node.js: a worker thread. */
export class NodeCodeRunner implements CodeRunner {
  async run(code: string, tests: CodeTest[], timeoutMs = 3000): Promise<TestRun> {
    const { Worker } = await import("node:worker_threads");
    const source = `${workerBody}\nconst { parentPort, workerData } = require("node:worker_threads");\nparentPort.postMessage(runTestsInWorker(workerData.code, workerData.tests));`;
    const worker = new Worker(source, { eval: true, workerData: { code, tests }, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    try {
      return await new Promise<TestRun>((resolve) => {
        const timer = setTimeout(() => resolve(timedOut(tests, timeoutMs)), timeoutMs);
        worker.once("message", (result: TestRun) => {
          clearTimeout(timer);
          resolve(result);
        });
        worker.once("error", (error: Error) => {
          clearTimeout(timer);
          resolve({ outcomes: tests.map((t) => ({ expr: t.expr, passed: false, detail: "worker error" })), error: error.message });
        });
      });
    } finally {
      await worker.terminate();
    }
  }
}
