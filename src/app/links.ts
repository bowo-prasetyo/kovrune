// Links between the app's screens (routes.ts): real links, so they can be opened in a new tab or
// bookmarked, that switch screens in place when clicked plainly.

import type { MouseEvent } from "react";
import { pathForView, type View } from "./routes.ts";

/** Shows a view and gives it its address (App.tsx). */
export type Navigate = (view: View) => void;

/** href and onClick for a link to `view`. A click with a modifier key, or not the main button, is left to the browser. */
export function linkTo(view: View, navigate: Navigate, base: string = import.meta.env.BASE_URL) {
  return {
    href: pathForView(view, base),
    onClick: (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(view);
    },
  };
}
