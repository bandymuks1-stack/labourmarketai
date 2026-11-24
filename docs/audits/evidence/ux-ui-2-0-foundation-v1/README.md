# UX/UI 2.0 — visual evidence (PR #869)

39 captures. Every one is a real authenticated run against the **local** stack
(`pnpm -C apps/web e2e:local`) — never production, never a real user's data.

Naming: `<scenario>__<theme>__<viewport>.png`.

| Field | Value |
|---|---|
| Product source rendered | `2bb179b3c51708ff83d50f0b8e5eac24aa9e7d72` (stage 1–8 + review cycles) |
| Base compared against | `main @ e0cbaaf8` |
| Locale | `lt` unless the filename says otherwise |
| Theme | as named; light is the product default, dark is the stored preference |
| Suites | `ux-2-0-visual-evidence.spec.ts` 42/42, `ux-2-0-profile-growth-states.spec.ts` 3/3 |

The screenshots are never the only proof — each capturing test also **measures**
the property it illustrates (font sizes, radii, touch-target heights, segment
counts, `animation-name`, overflow), so a picture that looked right but measured
wrong would fail the run.

## Two things in the frame that are NOT the product

* The small round mark bottom-left (sometimes reading **"1 Issue"**) is the
  **Next.js dev-server indicator**. It exists only in `pnpm dev`, never in a
  production build, and it is not a product error badge.
* The small pencil disc on the right edge is the existing in-app **feedback
  FAB**, which is real and ships.

## The owner's requested set

| # | Asked for | File |
|---|---|---|
| 1 | Light desktop — empty conversation | `empty-state__light__desktop-1536x864.png` |
| 2 | Light desktop — active conversation | `active-conversation__light__desktop-1536x864.png` |
| 3 | Dark desktop | `empty-state__dark__desktop-1536x864.png`, `active-conversation__dark__desktop-1536x864.png` |
| 4 | Light mobile | `empty-state__light__mobile-390x844.png`, `active-conversation__light__mobile-390x844.png` |
| 5 | Dark mobile | `empty-state__dark__mobile-390x844.png`, `active-conversation__dark__mobile-390x844.png` |
| 6 | CTA before / after | `cta-primary-secondary__light__desktop.png` — **after only, see the gap note below** |
| 7 | Composer, 1 line | `composer-1-line__light__desktop.png` |
| 8 | Composer, many lines | `composer-multiline__light__desktop.png`, `composer-max-height__light__desktop.png` |
| 9 | Command search | `command-search-chat__light__desktop.png`, `command-search-advanced__light__desktop.png` |
| 10 | Profile 0/5 | `profile-0-of-5__light__desktop-1536x864.png` |
| 11 | Profile 4/5 | `profile-4-of-5__light__desktop-1536x864.png` |
| 12 | Profile 5/5 | `profile-5-of-5__light__desktop-1536x864.png` |
| 13 | LT | `locale-lt__light__desktop-1366x768.png` |
| 14 | EN | `locale-en__light__desktop-1366x768.png` |
| 15 | RU | `locale-ru__light__desktop-1366x768.png` |

## Known gap — the CTA "before"

`cta-primary-secondary` shows the **after**: exactly one solid primary in a row
of ghost secondaries. There is no matching **before** screenshot, and none was
fabricated.

A truthful "before" means rendering `main @ e0cbaaf8` and photographing it. That
needs either a second worktree or a branch switch in this one, both of which the
task explicitly forbids. The before state is therefore reported as measurements
rather than a picture: every action rendered at the same visual weight, 40px
tall (below the 44px minimum), with no primary/secondary distinction anywhere in
the conversation.

The owner has two ways to see the real before if a picture is wanted: allow a
throwaway worktree at `e0cbaaf8` for one capture, or compare against production,
which still runs the pre-2.0 build until this PR is merged.

## Profile growth, 0/5 → 4/5 → 5/5

The shared local fixture worker sits at 2/5 (`profile-2-of-5`), so the other
three states come from a **dedicated local user** built up additively by
`scripts/ux-evidence-seed.ts` + `ux-2-0-profile-growth-states.spec.ts`. No
existing fixture row is mutated and no cloud target is reachable — both refuse
anything that is not the local stack.

Each state is written to the same canonical tables the product itself writes
(`profiles.profile_text`, `profile_skill_claims`, `worker_languages`,
`workers.availability_status`, `engagement_contexts`), so the bar is reporting a
real server read every time. Nothing is faked into the UI.

Reproduce:

```bash
npx supabase start
pnpm -C apps/web tsx scripts/ux-evidence-seed.ts
E2E_OWNER_EMAIL=dev.ux-evidence@local.test pnpm -C apps/web tsx scripts/e2e-mint-session.ts
UX_EVIDENCE_GROWTH=1 pnpm -C apps/web tsx scripts/e2e-local.ts ux-2-0-profile-growth-states.spec.ts
```

## Everything else in the folder

`assistant-identity`, `composer-mobile-keyboard`, `cv-import-entry`,
`greeting-named`, `keyboard-focus`, `messages-calendar-ownership-{simple,advanced}`,
`opening-centred`, `stream-anchored`, `unboxed-assistant-speech`,
`profile-growth-reduced-motion`, `reduced-motion`, `theme-default-no-preference`,
`theme-stored-dark`, plus the 1366×768 desktop pair in both themes.
