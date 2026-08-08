import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeFromPlan, composeWithGaps } from "./compose.js";
import {
  buildCriteriaAuditPrompt,
  buildSmoothingPrompt,
  isRiskyPiece,
  parseAuditJson,
  SECOND_ORDER_CHECKS,
} from "./critic.js";
import { extractPlan } from "./plan.js";

describe("plan extract", () => {
  it("derives criteria and flags gaps when plan has none", () => {
    const analysis = extractPlan(
      "# Ship checkout\n\nBuild a fast checkout flow vs Stripe.",
    );
    assert.equal(analysis.derivedCriteria, true);
    assert.ok(analysis.acceptanceCriteria.length >= 3);
    assert.ok(analysis.gaps.some((g) => /DERIVED|derived|criteria/i.test(g)));
    assert.match(analysis.mission, /checkout/i);
  });

  it("pulls checklist criteria and gates from markdown", () => {
    const analysis = extractPlan(`# Plan
Mission line for the work.
- [ ] LCP under 2.5s on mobile
- [ ] Blind critic prefers ours vs Stripe Checkout
- [ ] Production promote requires human approval
- Never commit secrets
`);
    assert.equal(analysis.derivedCriteria, false);
    assert.ok(analysis.acceptanceCriteria.some((c) => /LCP|Stripe/i.test(c)));
    assert.ok(analysis.humanGates.some((g) => /Production|approval/i.test(g)));
    assert.ok(analysis.safetyNever.some((s) => /secret/i.test(s)));
  });

  it("strips HTML and extracts text", () => {
    const analysis = extractPlan(
      `<html><body><h1>Spec</h1><p>Ship pricing page.</p><ul><li>Must pass Lighthouse a11y</li><li>Do not leak PII</li></ul></body></html>`,
      { kind: "html" },
    );
    assert.equal(analysis.sourceKind, "html");
    assert.match(analysis.mission, /pricing|Ship/i);
    assert.ok(
      analysis.acceptanceCriteria.length || analysis.safetyNever.length,
    );
  });
});

describe("compose gaps", () => {
  it("returns ≤3 honesty gaps and Spisak sections", () => {
    const { systemPrompt, gaps } = composeWithGaps({
      goal: "pricing page",
      barName: "Stripe pricing",
      barUrl: "https://stripe.com/pricing",
      agentEnv: "claude-code",
      mode: "apex",
    });
    assert.ok(gaps.length <= 3);
    assert.match(systemPrompt, /never implement/i);
    assert.match(systemPrompt, /smoothing/i);
    assert.match(systemPrompt, /Adversarial/i);
    assert.match(systemPrompt, /DERIVED/i);
  });

  it("composeFromPlan merges extracted criteria", () => {
    const { systemPrompt, gaps, analysis } = composeFromPlan({
      goal: "fallback",
      barName: "Linear",
      agentEnv: "generic",
      planText: `# Build docs site
- [ ] Done means every page has TOC
- [ ] Credential provisioning is a human gate
`,
    });
    assert.ok(analysis);
    assert.match(systemPrompt, /TOC/);
    assert.ok(gaps.length <= 3);
  });
});

describe("critic contracts", () => {
  it("criteria audit prompt includes second-order checks", () => {
    const prompt = buildCriteriaAuditPrompt({
      pieceName: "auth",
      artifactSummary: "login form html",
      acceptanceCriteria: ["No plaintext passwords"],
      mode: "adversarial",
    });
    assert.match(prompt, /adversarial/i);
    for (const c of SECOND_ORDER_CHECKS.slice(0, 3)) {
      assert.match(
        prompt,
        new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  });

  it("smoothing prompt asks for coherence", () => {
    const prompt = buildSmoothingPrompt({
      goal: "landing",
      pieceSummaries: ["- hero: won"],
      acceptanceCriteria: ["Hero beats reference"],
    });
    assert.match(prompt, /smoothing/i);
    assert.match(prompt, /Hero beats/);
  });

  it("parseAuditJson + isRiskyPiece", () => {
    const audit = parseAuditJson(
      'noise {"passed":false,"findings":["auth → missing MFA"],"gap":"MFA missing"}',
    );
    assert.equal(audit.passed, false);
    assert.equal(audit.findings[0], "auth → missing MFA");
    assert.equal(isRiskyPiece({ id: "p1", name: "Hero" }), false);
    assert.equal(isRiskyPiece({ id: "p2", name: "Auth login" }), true);
    assert.equal(isRiskyPiece({ id: "p3", name: "Hero" }, ["Hero"]), true);
  });
});
