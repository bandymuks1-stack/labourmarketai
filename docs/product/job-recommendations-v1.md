# Job Recommendations v1 — surfacing the matching engine (Sprint v2 §4)

Owner goal: matching jobs become a main reason a worker returns daily — the
worker frequently sees which jobs fit, WHY they fit, the salary comparison,
the missing skills, and what is new. Quality first, zero spam.

This slice adds NO second engine. Every number comes from the canonical
deterministic pipeline that already powers the worker opportunity board:
`list_open_demand_for_workers()` (gated SECURITY DEFINER RPC, Model A
approved routes only) × `matchWorkerToNeed` (apps/web/lib/market/match-v1.ts)
ordered by the shared §19 comparator `compareMatches`.

## Architecture

| Layer | File | Role |
|---|---|---|
| Pure model | `apps/web/lib/opportunities/recommendations-model.ts` | Recommendability filter, near-miss rule, isNew, salary outcome, journal↔job connection. Unit-tested without a DB. |
| Read model | `apps/web/lib/opportunities/recommendations.ts` | `getWorkerJobRecommendations({limit})` + `getNewJobMatchCount()`. Request-cached (React `cache`) — layout spine, overview card and journal block share ONE computation per request. Session-derived: only ever the signed-in worker's own recommendations. |
| Seen store | `apps/web/lib/opportunities/seen.ts` / `seen-actions.ts` / `components/app/mark-opportunities-seen.tsx` | First-seen markers via the gated RPC; fire-and-forget on render. |
| Migration (OWNER GATE) | `supabase/migrations/20260714170000_worker_opportunity_seen_v1.sql` (+ paired rollback) | `worker_opportunity_seen` table + `mark_worker_opportunities_seen_v1(uuid[])`. |

## Recommendability (quality gate)

A demand becomes a recommendation ONLY when:

1. `match.eligible === true` — no failed hard criterion (language, licence,
   compensation floor, engagement form, shifts…). A hard-blocked job is
   never recommended regardless of skill coverage.
2. A real skill basis exists (`skillFit !== null`) with ≥ 1 matched skill —
   unstructured needs have no percentage and no recommendation (§19).
3. Band is `strong`/`possible`, OR a **near-miss**: ≤ 2 required skills
   missing (the missing chips tell the worker exactly how to close the gap).

Ordering = `compareMatches` (status → coverage → confirmed share →
availability), stable on ties.

## Surfaces

- **Dashboard card** — `components/app/dashboard/job-recommendations-card.tsx`,
  mounted once on the worker overview (`app/[locale]/dashboard/page.tsx`).
  Top 3 rows: work-type label, location/start, §19 basis in the compact
  canonical form ("12 iš 15 įgūdžių, 8 patvirtinti"), salary badge when the
  engine concluded `pay_within_offer`/compensation-met, up to 2 missing-skill
  chips + "+n", link to the board. Honest empty state ("šiuo metu
  atitinkančių skelbimų nėra — papildykite įgūdžius profilyje") with a
  profile link. While the worker-visibility RPC is unapplied the card renders
  NOTHING (no fake emptiness). The PR #751 configurable module grid is a
  registry of link-tile shortcuts — the registry carries this feature's
  attention (the `opportunities` module badges the `new-job-matches` spine
  signal); the rich card is the adjacent content surface, following the
  existing content-card pattern (invitations, privacy status).
- **Notifications** — ONE aggregate spine signal `new-job-matches`
  ("Nauji jums tinkantys darbo skelbimai" + real count badge), catalogued in
  `lib/notifications/spine-signals.ts`, counted by
  `getNewJobMatchCount()` in `lib/notifications/spine.ts`. It appears in the
  bell, the dashboard status strip, the activity centre and the module-card
  badge — all from the same count. In-app only; no push, no email.
- **Journal context** — `components/app/journal-job-context.tsx`, ONE
  insertion point at the end of `app/[locale]/dashboard/journal/page.tsx`.
  Deterministic: recent (7-day) `journal_entry_skills` links ∩ the
  recommendations' matched/missing skill sets; up to 2 jobs, each with the
  §19 basis + a connection line ("įrašas parėmė įgūdį X — jo reikia šiam
  darbui"). Wording is "parėmė/supported", never "patvirtino/confirmed" —
  journal links are evidence-support, not verification (§7); guard-pinned.
  Honest empty → renders nothing.
- **Opportunities board** — unchanged presentation (its
  `skillMatch.basis` copy already carries matched/total/confirmed — the
  guard pins the card and the board to the same three components). The board
  now mounts `<MarkOpportunitiesSeen>` for every rendered row.
- **Market map** — untouched.

## Anti-spam rules

1. **One aggregate signal, never per-job rows** — the catalogue has exactly
   one job signal; its count is the number of UNSEEN recommendations.
2. **Rendering is the read event** — the dashboard card, the board and the
   journal block mark their shown rows seen (`worker_opportunity_seen`,
   first-seen wins). Visiting the board clears the whole count.
3. **Honest degradation** — while the seen migration is unapplied the count
   is 0 (a badge that could never clear is permanent noise, forbidden by the
   spine doctrine). The "Nauja" chip then falls back to the real 7-day
   created_at window.
4. **Quality gate** — hard-blocked/ineligible demands never surface;
   near-miss is capped at 2 missing skills.
5. **No push/email** — in-app spine only.

## §19 compliance statement

- No global person score exists anywhere in this slice; every fit is bound
  to one demand's context and computed at read time (never persisted).
- Every rendered fit uses the canonical basis form — matched/total counts
  WITH the confirmed share — via `opportunities.recommendations.basisCompact`
  ("{matched} iš {total} įgūdžių, {confirmed} patvirtinti"). A bare % never
  renders on these surfaces (`basis.pct` is guard-banned in the card and the
  journal block); the aggregate notification carries no percentage at all.
- Confirmed vs declared stays split (matchedConfirmed comes from
  manager-confirmed `worker_skills.verified` only).
- Guards: `apps/web/lib/guards/job-recommendations.test.ts` (this slice) +
  the existing `fit-not-rating.test.ts` family.

## Owner gate

Apply `supabase/migrations/20260714170000_worker_opportunity_seen_v1.sql`
via Supabase MCP after review (see APPLIED_LEDGER.md deferred entry).
Until applied: recommendations + card + journal block work (recency-only
"Nauja"), the notification count stays honestly 0.

## Known costs / follow-ups

- `getSpineCounts()` now runs the recommendation read model once per
  authenticated request (request-cached; non-workers short-circuit after one
  `workers` miss). If board volume grows, a cheaper unseen-count RPC is the
  next optimization.
- Deliberately NO worker-initiated apply/contact CTA (guard-pinned) —
  communication stays inside the platform workflow.
