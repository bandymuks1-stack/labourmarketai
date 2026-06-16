# P0 Authenticated UI Reality Audit & Fix — v1 (2026-06-16)

Owner tested the product logged-in and reported launch blockers: a hidden /
"being-prepared" market map, a `/dashboard/search` that showed
"Detali paieška — numatoma M2" and opened nothing, forms that looked like they
saved but (per owner) didn't persist, and internal roadmap labels leaking into
the UI. This is the audit + the fixes shipped to clear them.

## Zones audited (authenticated)

`/dashboard` (hub) · profile · player-card · company · company-need · candidates ·
opportunities · market-map · communication · search · projects · documents ·
journal · account · admin · scouting. Desktop + mobile chrome (DashboardTabs,
BottomNav, AccountMenu, IdentityActions).

Two independent read-only sweeps were run: (1) nav + dead-CTA + roadmap-copy, and
(2) save/persistence across every form flow.

## Findings

### Dead CTAs / dead ends
- **`/dashboard/search`** rendered a single `DashboardSection` whose body was the
  roadmap label "Detali paieška — numatoma M2" — a terminal screen with no action,
  no back link. **Reachable** from the company **candidates** room, whose primary
  CTA "Ieškoti darbuotojų" pointed at it (`primaryHref="/dashboard/search"`).
- No other broken nav links: all primary/secondary nav targets resolve to existing
  routes.

### Fake saves
- **None found.** Every save flow audited performs a real persistence write and
  surfaces errors honestly:
  profile (`worker_professions`/`worker_skills`/`profiles`/`profile_skill_claims`),
  player card (RPC `save_worker_card`/`confirm_worker_card`),
  documents consent (RPC `set_docs_aggregate_consent`, success only when the RPC
  returns `"saved"`), skills (`profile_skill_claims` upsert/delete),
  work journal (RPC `create_journal_entry_full`), company demand draft
  (RPC `save_demand_draft`), communication (`conversation_messages` insert — RLS
  denial surfaced as `not_a_participant`, not faked), account role switch
  (`profiles.active_role` update).
- The marketing **company-need** form is intentionally a non-persisting AI-suggestion
  preview and says so (no "saved/įrašyta" claim) — not a fake save.
- Owner's "shows saved but doesn't persist" is most consistent with a
  **migration-not-applied** path in production (an RPC/column missing), which the
  code already surfaces as an honest `needs_migration` / `needs_gate` state rather
  than a fake success. No code change persists fake success. Owner should confirm
  the relevant migrations are applied in prod (DB apply stays owner-gated).

### Roadmap / placeholder copy shown to users
- `auth.dashboard.empty.{worker,company,agency,customer,discover,search}` carried
  `M2`/`M3` (orphaned — only `empty.search` was still rendered).
- `marketMap`: filter bar tagged "· ruošiama"; empty canvas titled
  "Žemėlapio drobė ruošiama"; "Planned layers" / "planned" status;
  accommodation note "planned future data layer".
- `legal.draftNote` leaked an internal "(M5)" milestone code.
- `skills.customComingSoon` was a bare "coming soon" tag.

## Fixes shipped

1. **Search room** (`/dashboard/search`) rewritten from the dead placeholder into an
   honest "Darbuotojų paieška" page: states plainly that free-text people search is
   not open yet and **why** (no consented/verified supply → would mean fake
   results), then offers two real paths — **Search by need** →
   `/dashboard/company/scouting` (the deterministic match engine) and **Post a need**
   → `/dashboard/company`. Back link to the action center. New `searchRoom` i18n
   namespace (lt/en/ru).
2. **Candidates room** primary CTA repointed
   `primaryHref="/dashboard/search"` → `"/dashboard/company/scouting"` (real engine).
3. **Market map** de-roadmapped: removed the "· ruošiama" tag (now "Signal scope"),
   empty canvas reframed ("Signal map — empty for now"), "Planned layers" → "Signal
   layers", status "planned" → "no data yet", accommodation note reworded. No fake
   markers — unchanged (signal-only, points require verified coordinates).
4. **Milestone-code cleanup** across lt/en/ru: `auth.dashboard.empty.*` M2/M3 →
   "will be enabled later"; `legal.draftNote` "(M5)" dropped; `skills.customComingSoon`
   → "free entry not active yet".

## Persistence after reload

No persistence code changed — all audited saves were already real server-action /
API / Supabase writes with read-after-write or `router.refresh()`, so saved data
survives reload. The only "non-persisting but honest" surface (CV import scaffold,
company-need preview) explicitly tells the user nothing is stored yet and points to
the real path.

## Guards added

`lib/guards/p0-auth-ui-reality.test.ts` (runs in CI `pnpm -F web test`):
- A: no internal milestone codes (`M0–M9`) in any active-locale value;
- B: no roadmap words (`numatoma`/`planned`/`coming soon`/`TODO`) in authenticated
  product namespaces (`auth.dashboard`, `marketMap`, `searchRoom`, `skills`);
- C: `/dashboard/search` is a real room (no `DashboardSection`/`empty.search`, real
  CTAs to scouting + company need, back link, complete `searchRoom` copy);
- D: candidates room primary CTA points at `/dashboard/company/scouting`, not the
  bare search page;
- E: market map is framed as a live signal map (no "preparing" tag / "planned
  layers" copy).

## Not in scope / left honest by design

- Public marketing `waitlist.title` "coming soon" (a genuine waitlist) and legal
  draft notices — out of the authenticated product scope.
- DB apply, Stripe, env/secrets — untouched (owner-gated).
- Market map markers — still zero by design until verified coordinates exist.

## First-user invite readiness

The two concrete dead ends the owner hit (search + market-map framing) are fixed,
roadmap codes are gone from served copy, and saves were already real. **Ready to
continue first-user invites**, with one owner action: confirm production migrations
are applied so no save surfaces a `needs_migration` state to real users.
