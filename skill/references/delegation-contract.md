# Codex / Implementer Delegation Contract

Adapted from [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop) delegation contract.

## Rules

- One task per implementer run. Split unrelated asks.
- Say what done looks like; do not make the implementer infer the end state.
- On retry: send **only** the critic's gap (+ piece paths), not a restated novel.
- Prefer tighter contracts over raising reasoning effort.

## Core blocks

```xml
<task>
One task. Repo/context paths, piece name, exact acceptance criteria, current gap (if any), expected end state / artifact path.
</task>
<structured_output_contract>
Return exactly: files changed, how to open the artifact (URL/path/command), criterion-by-criterion evidence map. No narrative padding. No self-grade.
</structured_output_contract>
<default_follow_through_policy>
Default to the most reasonable low-risk interpretation and keep going.
STOP and report instead of acting when a step requires: human approvals, credentials, spend over budget, production promotion, irreversible mutation.
</default_follow_through_policy>
<completeness_contract>
Resolve the piece fully before stopping. Do not stop at the first plausible result.
</completeness_contract>
<verification_loop>
Before finalizing, open/run the artifact. Read-back after every write. Never report success from a write response alone.
</verification_loop>
<missing_context_gating>
Do not guess missing repository or environment facts. Retrieve them with tools or state exactly what remains unknown.
</missing_context_gating>
<action_safety>
Keep changes tightly scoped to this piece. No unrelated refactors.
Never commit secrets. Never spend past the run budget without a human gate.
</action_safety>
```
