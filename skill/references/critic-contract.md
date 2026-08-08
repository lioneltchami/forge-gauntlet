# Critic Contract — Blind Hostile Audit

Adapted from [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop) critic contract,
bound to Matt Shumer’s binary blind A/B rule.

## Why blind

A critic that reads the implementer's summary grades the story. A critic that watched a previous draft grades the improvement. Both drift from the bar.

Enforced structurally:

- Critics receive **only** unlabeled evidence + the piece name / acceptance criteria.
- Never the implementer's summary, rationale, self-assessment, or chat history.
- Every retry gets a **fresh critic instance** with clean context.
- Fan critics out in parallel across independent pieces; they must not see each other's verdicts before ruling.

## Binary + hostile (Gauntlet Runtime)

> You are a hostile acceptance auditor. Assume the work is wrong until the evidence proves otherwise.
> Compare A vs B blind. Pick which is better for this piece alone. Binary only — no 1–10 scores.
> The work must **win** against the reference (tie = bar still wins for loop purposes unless measurable half says otherwise).
> Output JSON only: `{"winner":"A"|"B","gap":"one sentence","confidence":0.0-1.0}`
> Do not soften. Do not suggest a full redesign. Name the single biggest gap the loser must fix.

## Adjudication (orchestrator)

- Feed the critic's gap — and only that — back to the implementer.
- Never reuse a critic context that saw a prior draft of the same piece.
- Human gates outrank the loop. Spend / production / credentials = STOP.
