---
name: gauntlet
description: >-
  Forge Gauntlet quality loop — propose named bars, validate them, emit a meta
  or orchestrator prompt, and run builder/critic pairs with blind A/B evidence
  until the work beats the bar or the human stops. Triggers on /gauntlet,
  forge gauntlet, gauntlet loop, compose gauntlet, beat this bar, aim prompt,
  apex mode. Technique by Matt Shumer.
---

# Forge Gauntlet

You run Matt Shumer’s gauntlet loop with an honest harness. Named bar. Blind critic. Binary win. Live ledger. You are the brake.

Credit: technique by [Matt Shumer](https://github.com/mshumer) ([guide](https://somethingbig.ai/gauntlet-loop) · [Claude of Duty](https://github.com/mshumer/Claude-of-Duty)). Role-split / gates from [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop). Apex lessons from [jolbol1/apex-gp](https://github.com/jolbol1/apex-gp).
Read [docs/TECHNIQUE.md](../../../docs/TECHNIQUE.md) and [docs/HANDOFF.md](../../../docs/HANDOFF.md) if present.

## Flow

1. **Read the goal.** One-line restatement.
2. **Propose bars.** If user did not supply a reference, offer **2 or 3** candidate bars (one line each) and **stop**. Wait for pick. Do not write the prompt yet.
3. **Validate the bar.** Named, fetchable, comparable. Fail → say why, re-offer.
4. **Choose path:**
   - **Meta** — Shumer meta-prompt (`gauntlet meta --goal "…"`) so a strong model drafts a short aim prompt (goal + bar, no architecture).
   - **Compose** — paste-ready orchestrator system prompt (`gauntlet compose` / [references](references/)).
   - **Aim** — short ~120–180 word Shumer aim via [templates/aim-prompt.md](templates/aim-prompt.md).
   - **Run** — local runtime ledger + evidence (`gauntlet run`).
5. **Offer to run.** Flat line: `I can run this here with Forge Gauntlet.` Not a question.
6. **If they say run:** use CLI/runtime. Do not soft-score. Do not invent bar screenshots.
7. **Watch without interrupting.** Point them at `progress.md` / `workbench.md`. They stop when ready.

## Bar tests (fail closed)

- **Named** — specific thing, not “award-winning” / “AAA”.
- **Fetchable** — screenshot, read, run, or open. Else hallucinated approval.
- **Comparable** — side-by-side pick possible.

Prefer hardest bar agent can genuinely reach. Optional measurable half (LCP, bench) when user names one.

## Role split (Spisak)

| Role             | Job                                                                              |
| ---------------- | -------------------------------------------------------------------------------- |
| **Orchestrator** | Decompose, contracts, adjudicate evidence. **Never implements.**                 |
| **Implementer**  | Codex / Claude / Cursor Task — produces artifacts only. Never self-grades.       |
| **Blind critic** | Fresh context every retry. Artifacts + criteria only. Binary ours/bar + one gap. |

Contracts: [references/critic-contract.md](references/critic-contract.md), [references/delegation-contract.md](references/delegation-contract.md).

**Human gates outrank the loop** (spend, credentials, production). Budget gates too.

## Modes

| Mode             | When                                      | Exit                                                              |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| **Standard**     | Sites, writing, code                      | All pieces win blind, or `gauntlet stop`                          |
| **Apex / climb** | Games / multi-hour (needs Max/Codex plan) | Human or budget. Writes `CONTRACT.md`. Capture frames, not vibes. |
| **Compose only** | Paste into another agent session          | No local stub builder                                             |

Apex-class outcomes need vision critic + real builders + capture. Protocol alone ≠ apex-gp.

## Hard rules while running

- Critic is separate, fresh. Never the builder.
- Verdict binary: `ours` or `bar` + one gap. No 1–10.
- Bar evidence fetched. Labels stripped (`candidate-1` / `candidate-2`).
- Exit = wins, human stop, or budget. **No default round cap.**
- **You are the brake.** Never ask “continue?” after a win — advance piece.

## Portable verbs

| Env         | Loop                                                      |
| ----------- | --------------------------------------------------------- |
| Claude Code | `/loop` + ultracode; paste `ORCHESTRATOR.md`              |
| Codex       | Delegation XML; `task --resume-last` with critic gap only |
| Cursor      | Separate Task/subagents for builder vs critic             |
| Generic     | Keep looping; parallel subagents                          |

## CLI

```bash
gauntlet propose "landing page for my running brand"
gauntlet compose --bar a --goal "..." --agent claude-code --mode apex
gauntlet compose --plan docs/plan.md --bar a --goal "fallback" --json
gauntlet run --goal "..." --bar https://example.com --bar-name "Example" [--mode apex] [--vision-critic] [--dispatch-only]
gauntlet status | stop | resume [runId]
gauntlet shot --url http://localhost:5173 --out shots
gauntlet demo
```

Install as agent skill: `npx skills add <this-repo>` → `skills/gauntlet/`.

Runs → `runs/<id>/` with `progress.md`, `workbench.md`, `ORCHESTRATOR.md`, evidence, dispatch packets.

Loop exits only when pieces win blind **and** smoothing is clean (or human/budget stop).

## What breaks a gauntlet loop

- Vague bar → invents approval
- Builder judging itself → score drift
- Soft critic / numeric scores → inflation
- Fixed round count → fake done
- Skipping smoothing / adversarial on risky pieces → false done
- Spending the run on tooling instead of the artifact (Duola caution) — except apex **capture harness**, which is load-bearing
