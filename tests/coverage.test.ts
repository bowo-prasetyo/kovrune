import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accessOf, kovruneRoute } from "../eval/coverage.ts";

describe("reading coverage of cited works", () => {
  it("finds Kovrune's routes to a full text as its sources do", () => {
    assert.equal(kovruneRoute({ id: "W1", locations: [{ landing_page_url: "https://arxiv.org/abs/2401.01234v2" }] }), "arxiv");
    assert.equal(kovruneRoute({ id: "W1", doi: "https://doi.org/10.48550/arxiv.1706.03762" }), "arxiv");
    assert.equal(kovruneRoute({ id: "W1", ids: { pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/8862100" } }), "europepmc");
    assert.equal(kovruneRoute({ id: "W1", doi: "https://doi.org/10.5281/zenodo.15310522" }), "zenodo");
    assert.equal(kovruneRoute({ id: "W1", doi: "https://doi.org/10.1109/tpel.2024.1" }), undefined);
  });

  it("sorts a work by the best way to get its text", () => {
    const closed = { id: "W1", doi: "https://doi.org/10.1016/j.x.2020.1", open_access: { is_oa: false } };
    assert.equal(accessOf({ ...closed, ids: { pmcid: "PMC1" } }, true), "kovrune");
    assert.equal(accessOf({ ...closed, open_access: { is_oa: true } }, false), "free");
    assert.equal(accessOf(closed, true), "abstract");
    assert.equal(accessOf(closed, false), "none");
  });
});
