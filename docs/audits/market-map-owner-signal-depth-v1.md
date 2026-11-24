# Market Map — owner signal depth v1 (audit)

**Scope:** enrich the already-working owner-only Market Map with deeper REAL
signals (location intents, priority, notes, company-need shape, project
location) — **no public aggregate, no cross-user read, no SECURITY DEFINER RPC,
no DB migration, no billing/auth/env, no fake data.**

## Files reviewed

`components/app/market-map-shell.tsx`, `market-map-my-signals.tsx`,
`market-map-capture.tsx`; `lib/market-map/{signals,signal-model,capture,
capture-actions}.ts`; `lib/supabase/types.ts`; `messages/{lt,en,ru}.json`; and
the underlying tables (`preferred_locations`, `company_demand_locations`,
`projects`, `workers`, `worker_skills`, `worker_professions`,
`journal_entries`).

## Answers

**1. What extra signals can already be shown without a migration?**
- **Preferred locations:** `intents[]`, `priority`, `short_note`,
  `visibility_level`, `active`, `granularity`, `region`, `city`,
  `confirmed_by_user` — all present (`20260617120000`).
- **Company-need locations:** `need_type`, `people_count_min/max`,
  `start_date`, `end_date`, `urgency` (low/medium/high), `mobility_required`,
  `accommodation_needed`, `visibility_level`, `active`, `granularity` — all
  present.
- **Projects:** `country`, `city`, `granularity`, `location_confirmed`,
  `visibility_level`, `status`, `start_date`, `end_date` — present; the owner
  read layer already emits `project_location` signals.

**2. What is "next step" due to missing DB fields?**
- **Worker/profile availability block (Scope D):** `workers.availability_status`
  + `available_from` exist, but surfacing them needs a new owner-scoped fetch
  and a small block — deferred to a focused next PR (no migration needed, just
  out of this slice's blast radius).
- **Skills / capability hints (Scope E):** `worker_skills.self_rated_level` +
  `verified`, `worker_professions.is_primary`, `journal_entry_skills` exist;
  a safe owner-only "self-declared vs confirmed" summary is feasible without a
  migration but needs its own join + careful framing — next PR.
- **Rates / price signals (Scope F):** no honest per-bucket rate source exists
  yet; building it now would be a placeholder. Documented for a later PR with
  the four distinct rate types (worker take-home / freelancer-ZZP / company-
  subcontract / client price) kept strictly separate. **Not** rendered now.

**3. Does `preferred_locations` already have intents / priority / visibility /
active / note, and how are they shown?**
Yes — all present. **Before:** the capture panel showed only place + a visibility
select + enable/disable. **Now:** each preferred row shows its **priority**
(primary / secondary / optional, localized), its **intents** as chips, and its
**note**; the add form lets the owner pick priority and add a short note (intents
+ visibility were already there).

**4. Does `company_demand_locations` already have need_type / people_count /
urgency / mobility / accommodation / dates / visibility?**
Yes — all present. **Now** each company-need row shows the **need type**
(localized), **people count** range, **urgency** badge, **mobility** /
**accommodation** badges and the **date** window; need type + visibility stay
editable owner-scoped (no new rows — creation stays in the demand flow).

**5. Do projects already have location granularity / confirmation / visibility?**
Yes (`granularity`, `location_confirmed`, `visibility_level`). The owner map
already renders `project_location` signals (country/region level, exact only if
`location_confirmed`). A richer per-project confirmation badge + project-page CTA
is a small next step.

**6. Can skills / capabilities / journal evidence be tied to a region owner-only
without public aggregation?** Technically yes (all owner-scoped tables), but it
needs a dedicated join and a careful self-declared / suggested / confirmed
framing (never "confirmed" without real platform evidence). Deferred to a next
PR (Scope E) — not done here to keep this slice safe.

**7. Where is mobile UX still weak?** The capture rows were a single dense line;
adding depth must stay as **chips/badges**, not long text, and must not cause
horizontal overflow at 390px. Addressed: intents/priority/need-shape render as
wrapping chips; the 390px e2e asserts no overflow and reachable controls.

**8. What copy is still too technical?** Company-need visibility previously
showed raw enum tokens (fixed in #463); this slice keeps everything localized —
priority, need type, urgency, mobility/accommodation are all localized labels,
never raw enums.

## What this PR builds vs documents

- **Builds:** Scope A (preferred depth), Scope B (company-need depth), copy
  (G), mobile (H). Scope C signals already render (kept; richer badge = next
  step).
- **Documents for next PR:** Scope D (availability block), Scope E (skills
  hints), Scope F (rate-type structure), Scope C enrichment.

## Safety confirmation

No public aggregate (`marketSignals` never imported by the UI), no cross-user
read (owner-scoped `getOwnMarketSignals` + RLS), no `service_role`, no `.rpc`,
no SECURITY DEFINER, **no DB migration**, no billing/auth/env, no fake data.

## Recommendation for the next PR

1. Owner availability & mobility block from `workers.availability_status` /
   `available_from` (Scope D).
2. Owner-only skill/capability hints (self-declared vs confirmed) from
   `worker_skills` / `journal_entry_skills` (Scope E).
3. Honest rate-type structure (four separate rate kinds) (Scope F).
4. Per-project confirmation badge + project-page CTA (Scope C enrichment).
