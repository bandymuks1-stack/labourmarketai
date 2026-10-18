# Localization status — premium completion namespaces

> Updated 2026-10-02. States: **AUTHORED** (written in the source language by the author),
> **AGENT_TRANSLATED** (machine/agent translation with the repo's terminology reused where it
> existed), **NATIVE_REVIEWED** (a native speaker has read it in context).
> No premium namespace is NATIVE_REVIEWED yet. Do not report a locale as linguistically
> production-proven until its row says so.

| Namespace | en | lt | de, nl, pl, ru, da, sv, no, et, lv |
|---|---|---|---|
| `workLifecycle` (public graph) | AUTHORED | AUTHORED* | AGENT_TRANSLATED |
| `twoSides` (homepage band) | AUTHORED | AUTHORED* | AGENT_TRANSLATED |
| `evidenceChain` | AUTHORED | AUTHORED* | AGENT_TRANSLATED |
| `livingCvStory` | AUTHORED | AUTHORED* | AGENT_TRANSLATED |
| `workContext` | AUTHORED | AUTHORED* | AGENT_TRANSLATED |
| `playerCard.identity.noRecords / noManagerRecord` | AUTHORED | AUTHORED* | AUTHORED* |

\* Written by the engineering agent, not by a native speaker. For `lt` this means
"authored, not yet native-reviewed".

## Constraints the translations had to satisfy (so a reviewer knows what is intentional)

- **Worker-facing vocabulary guards** (`worker-facing-copy-exhaustive`, `silent-trust-wording`): no
  "evidence / proof / verification / confirmation" stems on worker-facing namespaces; a manager's
  standing is named by origin ("manager's record"). Existing locale terms were reused where present.
- **i18n ratchet**: de/nl values may not be byte-identical to English (so a few labels use a
  deliberately different natural word, e.g. de "Ihr Team", nl "Het project").
- **ICU plurals**: ru/pl/lt/lv carry their own plural categories.

## Text-expansion checks (production, 2026-10-02, 375 and 1280)

Graph and homepage band rendered in de, pl, lt, ru: no page overflow, no clipping, no `[EN]`.
Findings: ru record rows (long uppercase labels beside the fact) collided and broke words at
375 px — **fixed** by stacking label above fact on narrow screens. de on the desktop spine is
tight but legible. Re-check after any copy change.

## To reach NATIVE_REVIEWED

Per locale: a native reader checks the five namespaces above in the rendered pages (not the JSON),
then the status here is flipped by the reviewer, not by an agent.
