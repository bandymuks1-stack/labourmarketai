# Wagon 3 — Dashboard and Navigation Simplification: fact audit + slice (2026-07-16)

Branch `feat/dashboard-navigation-simplification-v2` from main `0cc92555`.
Audit ran against THIS tree (an earlier agent pass accidentally audited a stale
checkout — every claim below was re-verified on current main).

## What the doc asked vs. what main already has

| Doc requirement | Current main state | Verdict |
|---|---|---|
| Worker nav uses plain concepts | 6 tabs, same for all roles: Mano erdvė / Žemėlapis / Darbo žurnalas / Žinutės / Kalendorius / Ryšiai (+Admin desktop-only). Owner-approved naming (PR #751). | **Already delivered** — labels are human; "Nustatymai" lives in the avatar menu (`tabs.account`), "Mano profilis" deliberately not a tab (`worker-nav-human-labels` guard forbids it in primary nav). Kept as-is: doc says "wording consistent with existing product language". |
| No internal-architecture terms in nav | All 7 tab labels architecture-free in lt/en/de/nl/ru | **Already delivered — but unguarded.** This wagon adds the guard. |
| Company dashboard first-view order (need → responses → next action → planning status → market context) | Was: hub → next action → status strip → market context → responses → … → need readback at position 14 | **THIS WAGON**: org branch reordered to the doc's task order; nothing removed. |
| Agency dashboard order | Shared org branch (no separate agency branch; partner-intent copy) | Same reorder applies; hub company block = "current organization". |
| Route cleanup: duplicate profile/CV | `player-card` → redirects `/dashboard/journal` (owner IA decision 2026-06-25, in-file comment); profile is canonical identity surface | **Already delivered.** Redirect now pinned by guard. |
| opportunity/talent/scouting duplication | Different actors: opportunities = worker demand board; talent = superadmin-gated preview (`requireSuperadmin`); candidates = own drafts; company/scouting = company shortlist | **Audited, not duplicates.** No action. |
| duplicate agency surfaces | `agency` → `company`, `agency/pool` → `company#company-team`, `start/agency` → `start/company` redirects exist | **Already delivered.** Pinned by guard. |
| old laboratory routes | None exist (only marketing `labour-market` page) | **N/A.** |
| `/match-preview` | Marketing, deliberately NON-PERSISTED preview tool (Staffing OM v1 PR8) with honest "preview only" labels | **Audited, kept** — doc forbids deleting real capabilities; this is a deliberate detail route. |
| unclear route names | `/dashboard/intelligence` renders (owner intelligence workspace, NOT in nav, linked from trust cards as "Atverti rinkos įžvalgas") | **Audited, kept** — deliberate detail route for the owner-facing intelligence stack (#755-#763); renaming would break its canonical links for no user benefit. |
| Comprehension gate (30 s) | Worker overview: one state-driven top-slot action, status strip, MyZone; org overview now leads with their need + responses + one next action | Met by existing action-first pattern + this reorder. |

## Changes in this slice
1. `app/[locale]/dashboard/page.tsx` — org (company/agency/customer) branch
   reordered to the doc's order: **DemandRequestsReadback (current need) →
   count-gated response/pending cards → DashboardNextAction → status strip →
   HubCompanyIntelligence (optional market context)**; duplicate readback
   render at old position removed (renders exactly once).
2. `lib/guards/wagon3-nav-simplification.test.ts` — NEW guard: (a) primary-nav
   tab labels architecture-free in all 5 locales; (b) consolidation redirects
   pinned (marketplace→market-map, player-card→journal, agency→company);
   (c) org overview order pinned; (d) readback single-render pinned.

## Explicitly NOT done (with reasons)
- No tab renames (owner-approved naming stands; doc's list is illustrative —
  "such as").
- No second dashboard, no new routes, no route deletions.
- No migrations, no production data changes.
- Worker branch untouched (already action-first; Wagon 5 owns journal work).
