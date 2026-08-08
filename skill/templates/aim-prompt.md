# Aim prompt template

Fill brackets. Keep ~120–180 words. Plain sentences. No bullet lists inside the prompt. No architecture dump unless the user demanded a stack.

```
Build [GOAL].

The bar is [BAR]. Get the real thing first and compare against it directly, not against a description of it.
[OPTIONAL_MEASURABLE: Also beat [METRIC] = [TARGET]. Taste and the number both have to win.]
[OPTIONAL_BUDGET: Stay under [BUDGET].]
[OPTIONAL_STACK: Do this in [STACK].]

Break this into the smallest pieces that can be improved and judged on their own. For each piece, fan out a builder and a separate critic with fresh context. The critic inspects the actual output, puts it next to the bar blind with the labels stripped, says which one is better, and names the single biggest remaining gap. Then it goes back to the builder.

The critic should be a harsh critic. Praise is not useful. If ours does not win, it keeps going.

[LOOP_VERBS]

Keep a live progress page updating as the work evolves so I can watch it.

Fan out subagents.
```

## LOOP_VERBS by environment

- **Claude Code:** `/loop on each piece until the critic picks ours blind. Do not stop before that. Fan out subagents and ultracode.`
- **Cursor:** `Keep looping each piece until the critic picks ours blind. Run the builder and critic as separate subagents with isolated context.`
- **Generic:** `Keep looping until the critic picks ours. Run the builders and critics as parallel subagents.`

## Rules for fills

- Bake the bar in as a concrete, fetchable thing (URL, product name, repo, title).
- Add budget / stack / measurable lines **only if the user named them**.
- Everything else stays out. The agent decides decomposition better than a pre-written spec.
