import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBudget, recordUsage } from "./checkpoint.js";

describe("budget accounting", () => {
  it("blocks before any model call when a cap is zero", () => {
    assert.equal(emptyBudget(0).exhausted, true);
    assert.equal(emptyBudget(undefined, 0).exhausted, true);
  });

  it("accumulates usage and exhausts token caps", () => {
    const first = recordUsage(emptyBudget(undefined, 100), 40, 0.01);
    const second = recordUsage(first, 60, 0.02);

    assert.equal(second.usedTokens, 100);
    assert.equal(second.usedUsd, 0.03);
    assert.equal(second.exhausted, true);
  });

  it("exhausts USD caps independently", () => {
    const budget = recordUsage(emptyBudget(0.05), 10, 0.05);

    assert.equal(budget.usedUsd, 0.05);
    assert.equal(budget.exhausted, true);
  });

  it("rejects invalid provider usage", () => {
    assert.throws(
      () => recordUsage(emptyBudget(), Number.NaN, 0),
      /Invalid token usage/,
    );
    assert.throws(
      () => recordUsage(emptyBudget(), 1, -0.01),
      /Invalid USD usage/,
    );
  });
});
