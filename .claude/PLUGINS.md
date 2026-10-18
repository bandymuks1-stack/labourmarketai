# Claude Code plugins — authority boundaries

Config-only. These plugins change the **agent working environment**, never
product code, schema, or runtime behaviour. Declared in `.claude/settings.json`
(`extraKnownMarketplaces` + `enabledPlugins`), each marketplace pinned to an
exact commit SHA.

| Plugin | Role | Authority |
|---|---|---|
| `impeccable@impeccable` | Supplementary **runtime / visual** QA | Secondary. Manual only. |
| `claude-code-setup@claude-plugins-official` | Read-only Claude Code setup advice | Advisory. Recommends, never writes. |
| `humanizer@humanizer` | Prose style — how copy *reads* | Secondary to doctrine. |

## Impeccable — manual only

Automatic `PostToolUse` and `Stop` design hooks are **disabled** by owner
decision (2026-09-13), by two independent mechanisms:

- `.impeccable/config.json` → `hook.enabled: false` (in-band, harness-agnostic)
- `.claude/settings.json` → `env.IMPECCABLE_HOOK_DISABLED=1` (session-level)

Explicit use stays fully available and is the intended mode — above all the
live-URL audit:

```
/impeccable audit http://localhost:3000
```

**`baseline-ui` remains the primary authority for static/source UI review**
(Tailwind typography scale, animation durations, layout anti-patterns,
component a11y). Impeccable is supplementary runtime/visual QA.

Do not duplicate rules between them. Where both could speak on the same
static source concern, `baseline-ui` wins. In practice the overlap is small:
Impeccable's static detectors fire on HTML/CSS, and returned no findings on
this repo's `.tsx` components — its real value here is the rendered-page pass,
which `baseline-ui` does not cover.

`env.IMPECCABLE_NO_UPDATE_CHECK=1` keeps the pinned engine from phoning
`impeccable.style` for version checks.

## Humanizer — prose only, never claims

Adjusts **how** prose reads. It has no authority over **what** product copy may
claim. `doctrine-guard`, `product-copy-forbidden-terms.test.ts` and the honesty
guards under `apps/web/lib/guards/` remain binding and win on every conflict.

Never use it to soften or remove an honesty label (`preview`, `concept`,
`not live yet`), a status qualifier, or any evidence-level wording.

## Trust gate — never bypass

These plugins install only after a human confirms **"Yes, I trust this folder"**
in the first *interactive* Claude Code session on a clone or workspace. That
prompt is a security boundary, not friction: it is what stops a repository from
silently installing plugins that execute code — which Impeccable does, via its
downloaded engine binary.

- Every new clone or workspace requires that human confirmation, each time.
- Never pre-seed, automate, script or otherwise bypass the trust gate, and
  never write the acceptance flag on someone's behalf.
- A session that has not been trusted simply runs without these plugins. That
  is the correct outcome — not a fault to work around.

## Rejected

**21st.dev / Magic MCP** — component code retrieval, generation and publishing
are metered, an account API key (`API_KEY_21ST`) is required, and the domain is
unreachable from our environment. Do not add it while any of that holds.
