// The app's addresses: which screen a path shows, and which path a screen has, so the
// browser's Back and Forward move between screens, a reload stays on the screen, and a
// past answer can be bookmarked. The host serves the app for every path (Cloudflare
// Pages does so when there is no 404.html; Vite's dev and preview servers do too).

export type Step = "device" | "server" | "browser" | "test" | "research";

/** What a path asks for. */
export type Route =
  | { screen: "home" }
  | { screen: "server" }
  | { screen: "browser" }
  | { screen: "test" }
  | { screen: "answer"; id: string };

/** What the app shows. */
export interface View {
  step: Step;
  /** The past answer opened, on the research screen. */
  answerId?: string;
}

const SETUP_PATHS: Record<"server" | "browser" | "test", string> = {
  server: "setup/server",
  browser: "setup/browser",
  test: "setup/test",
};

/** The route for a path; anything unknown is the home page. */
export function routeFromPath(pathname: string, base = "/"): Route {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, "");
  const clean = path.replace(/\/+$/, "");
  for (const [screen, setupPath] of Object.entries(SETUP_PATHS)) {
    if (clean === setupPath) return { screen } as Route;
  }
  const answer = /^answers\/([^/]+)$/.exec(clean);
  if (answer) return { screen: "answer", id: decodeURIComponent(answer[1]!) };
  return { screen: "home" };
}

/** The path a view has. Before the first setup, home is its first step. */
export function pathForView(view: View, base = "/"): string {
  if (view.step === "research") return view.answerId ? `${base}answers/${encodeURIComponent(view.answerId)}` : base;
  if (view.step === "device") return base;
  return `${base}${SETUP_PATHS[view.step]}`;
}

/**
 * What a route can show now. A saved setup goes straight to research: changing it goes
 * through "Change setup", which reloads (csp.ts). A setup step needs what came before it.
 */
export function resolveRoute(route: Route, now: { saved: boolean; draft: boolean; caps: boolean }): View {
  const start: View = { step: now.saved ? "research" : "device" };
  switch (route.screen) {
    case "home":
      return start;
    case "server":
      return now.saved ? start : { step: "server" };
    case "browser":
      return now.saved || !now.caps ? start : { step: "browser" };
    case "test":
      // Testing a saved setup again is allowed; it is what "Test the model again" does.
      return now.draft ? { step: "test" } : start;
    case "answer":
      return now.saved ? { step: "research", answerId: route.id } : start;
  }
}

const TITLES: Record<Step, string> = {
  device: "Set up",
  server: "Connect to your model server",
  browser: "Choose a model",
  test: "Test the model",
  research: "",
};

/** The browser tab's title for a view. */
export function titleForView(view: View, answerQuestion?: string): string {
  const name = view.answerId && answerQuestion ? answerQuestion : TITLES[view.step];
  if (!name) return "Kovrune";
  return `${name.length > 60 ? `${name.slice(0, 59)}…` : name} – Kovrune`;
}
