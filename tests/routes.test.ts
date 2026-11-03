import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathForView, resolveRoute, routeFromPath, titleForView, type View } from "../src/app/routes.ts";

describe("addresses", () => {
  it("reads each screen's path, under any base", () => {
    for (const base of ["/", "/kovrune/"]) {
      assert.deepEqual(routeFromPath(base, base), { screen: "home" });
      assert.deepEqual(routeFromPath(`${base}setup/server`, base), { screen: "server" });
      assert.deepEqual(routeFromPath(`${base}setup/browser/`, base), { screen: "browser" });
      assert.deepEqual(routeFromPath(`${base}setup/test`, base), { screen: "test" });
      assert.deepEqual(routeFromPath(`${base}answers`, base), { screen: "answers" });
      assert.deepEqual(routeFromPath(`${base}answers/`, base), { screen: "answers" });
      assert.deepEqual(routeFromPath(`${base}answers/mfx1-abc123`, base), { screen: "answer", id: "mfx1-abc123" });
      assert.deepEqual(routeFromPath(`${base}no/such/page`, base), { screen: "home" });
    }
  });

  it("gives each view a path that reads back as the same view", () => {
    const views: View[] = [{ step: "server" }, { step: "browser" }, { step: "test" }, { step: "research" }, { step: "answers" }, { step: "answers", answerId: "a b/c" }];
    for (const view of views) {
      const now = { saved: view.step === "research" || view.step === "answers", draft: true, caps: true };
      assert.deepEqual(resolveRoute(routeFromPath(pathForView(view)), now), view);
    }
    assert.equal(pathForView({ step: "device" }), "/");
    assert.equal(pathForView({ step: "research" }, "/kovrune/"), "/kovrune/");
    assert.equal(pathForView({ step: "answers" }, "/kovrune/"), "/kovrune/answers");
    // Bookmarks of past answers made before the answers page still open the answer, now on its own page.
    assert.equal(pathForView({ step: "answers", answerId: "a b/c" }), "/answers/a%20b%2Fc");
  });

  it("before the first setup, starts at the first step, and a step needs what comes before it", () => {
    const fresh = { saved: false, draft: false, caps: false };
    assert.deepEqual(resolveRoute({ screen: "home" }, fresh), { step: "device" });
    assert.deepEqual(resolveRoute({ screen: "server" }, fresh), { step: "server" });
    assert.deepEqual(resolveRoute({ screen: "browser" }, fresh), { step: "device" }, "needs the device check");
    assert.deepEqual(resolveRoute({ screen: "browser" }, { ...fresh, caps: true }), { step: "browser" });
    assert.deepEqual(resolveRoute({ screen: "test" }, fresh), { step: "device" }, "nothing to test");
    assert.deepEqual(resolveRoute({ screen: "test" }, { ...fresh, draft: true }), { step: "test" });
    assert.deepEqual(resolveRoute({ screen: "answer", id: "x" }, fresh), { step: "device" });
    assert.deepEqual(resolveRoute({ screen: "answers" }, fresh), { step: "device" });
  });

  it("with a saved setup, goes to research, except to test it again", () => {
    const saved = { saved: true, draft: true, caps: true };
    assert.deepEqual(resolveRoute({ screen: "home" }, saved), { step: "research" });
    assert.deepEqual(resolveRoute({ screen: "server" }, saved), { step: "research" });
    assert.deepEqual(resolveRoute({ screen: "browser" }, saved), { step: "research" });
    assert.deepEqual(resolveRoute({ screen: "test" }, saved), { step: "test" });
    assert.deepEqual(resolveRoute({ screen: "answers" }, saved), { step: "answers" });
    assert.deepEqual(resolveRoute({ screen: "answer", id: "x" }, saved), { step: "answers", answerId: "x" });
  });

  it("names the tab after the screen or the open answer", () => {
    assert.equal(titleForView({ step: "research" }), "Kovrune");
    assert.equal(titleForView({ step: "test" }), "Test the model – Kovrune");
    assert.equal(titleForView({ step: "answers" }), "Past answers – Kovrune");
    assert.equal(titleForView({ step: "answers", answerId: "x" }, "When is the review meeting?"), "When is the review meeting? – Kovrune");
    assert.equal(titleForView({ step: "answers", answerId: "x" }, "q".repeat(80)), `${"q".repeat(59)}… – Kovrune`);
  });
});
