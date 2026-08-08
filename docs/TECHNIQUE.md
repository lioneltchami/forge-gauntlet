# The Gauntlet Loop Technique

**Technique by [Matt Shumer](https://github.com/mshumer)** — originally demonstrated in [Claude of Duty](https://github.com/mshumer/Claude-of-Duty) via a [152-word aim prompt](https://github.com/mshumer/Claude-of-Duty/blob/main/prompt.md).

This project packages that technique as an honest runtime: named bars, separate critics, blind A/B with evidence, and a human brake. Credit the technique to Matt Shumer. This repo is scaffolding around it.

## The loop in five steps

1. **Aim at a named reference.** Not “AAA quality” — Stripe’s pricing page, Nike’s running campaign, a Julia Evans post, COD gameplay footage you can actually open.
2. **Fan out builders** on the smallest pieces that can be judged alone (hero, type, motion…).
3. **Separate harsh critic** with fresh context — never the builder grading its own work.
4. **Blind A/B** against the real fetched reference (labels stripped). Binary pick: ours or the bar. One gap sentence if the bar wins.
5. **Loop until ours wins** — or the human stops. Never a fixed round count.

## Non-negotiable rules

| Rule                                          | Why                                                |
| --------------------------------------------- | -------------------------------------------------- |
| Bar is **named, fetchable, comparable**       | Vague bars make critics hallucinate approval       |
| Critic never sees builder rationale           | Self-grading drifts upward every round             |
| Verdict is binary (`ours` \| `bar`) + one gap | Scores out of 10 inflate                           |
| Bar must be fetched as evidence               | No comparing against a description of quality      |
| Exit = all pieces win, or human brake         | Round caps fake completion                         |
| You are the brake                             | Infinite loops burn money; the human stops the run |

## What this project adds

Prompt-only wrappers write a good aim prompt and stop. Gauntlet Runtime:

- Validates the bar (fail closed if it cannot be fetched)
- Writes a machine-readable ledger + live `progress.md` / `workbench.md`
- Captures evidence (screenshots / text) for blind comparison
- Isolates critic context by construction
- Emits Spisak-shaped orchestrator prompts (`compose`) with human gates
- Supports Cursor, Claude Code, Codex, and generic subagent verbs
- Apex mode: `CONTRACT.md`, named shots, budget/resume for long climbs

**Not** a multi-model chat product ([trygauntlet.com](https://www.trygauntlet.com/)). Compete on enforced standards.

## Attribution

- Technique: Matt Shumer ([Claude of Duty](https://github.com/mshumer/Claude-of-Duty))
- Prompt-skill packaging: [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop), [duolahypercho/gauntlet-loop](https://github.com/duolahypercho/gauntlet-loop)
- Role-split / gates / delegation contracts: [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop)
- Long-run capture / CONTRACT lessons: [jolbol1/apex-gp](https://github.com/jolbol1/apex-gp)

Positioning: **Not another multi-model chat. A quality loop that won’t stop until it beats a real bar.**

Continuity: see [`HANDOFF.md`](HANDOFF.md).
