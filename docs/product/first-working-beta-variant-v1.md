# First Working Beta Variant v1

> A first working beta lets a user create an account, start from a
> non-locking role / intention, describe their skills or work in natural
> language, review detected suggestions, confirm what is correct, save
> useful profile and journal state, and understand what is preparing
> without being misled.

This document defines the **first usable beta** of labourmarket.ai — what
it includes today, what it deliberately does not include, and what is
blocked behind an explicit owner-decision sprint.

## 1. What the first working beta includes

A new user can do **all** of this end-to-end without contacting the
founder for help (subject to the owner running the production smoke first):

1. **Sign up** with Google OAuth or email + password.
2. **Onboard** with a multi-select intention picker — pick worker today,
   optionally add company / agency / customer later. The wizard explicitly
   says "this is only your starting point".
3. **Reach the dashboard** with a first-use panel that explains the
   shortest path:
   1. Tell us what you can do
   2. Confirm detected suggestions
   3. Add today's work
   4. Build a useful work profile over time
4. **Build a profile by typing** — describe yourself in your own words or
   paste a CV. The rule-based parser proposes skills, work directions,
   roles, CV entries, years of experience and team size.
5. **Confirm or discard each suggestion**. Confirmed skills land in the
   profile via the existing `worker_skills` flow. The applied state
   visibly tells the user *Confirmed by you · Added to your profile ·
   Needs external confirmation later*.
6. **Log work in the journal** — first field is "Ką šiandien dirbote?".
   The composer surfaces detected time / quantity / unit / direction /
   site / strengthens-skill suggestions. The user confirms what's
   correct and the entry is saved through the existing
   `createJournalEntry` server action.
7. **See a clear saved state** — a success card stays on the form until
   the next submit, so the worker on mobile cannot miss it.
8. **Manage roles honestly** — `/dashboard/account` lists the worker role
   as "Aktyvus" and tags the other roles as `RUOŠIAMA`, with an explicit
   non-locking intro paragraph. The header `RoleSwitcher` repeats the
   same framing inside its menu.

## 2. What is intentionally NOT in the first working beta

These are deliberate omissions, not bugs:

- **Real external confirmation flow for skills.** Skills land as
  user-confirmed facts. Manager / client confirmation runs through the
  existing `journal_entry_confirmations` pipeline only — there is no
  "trust score", no auto-promotion, no public proof page yet.
- **Matching / scoring / ranking.** No matchmaking, no candidate ranking,
  no employer-side "find me workers" surface. Per
  PRODUCT_CONSTITUTION §10 and the contextual-fit-signals doctrine, this
  has to remain context-specific and human-confirmed, and is not in this
  sprint.
- **Full company / agency / customer dashboards.** Those roles route to
  the existing pilot cockpit ("define need → prepare criteria → review
  fit → request pilot") and submit to `/api/leads`. They are openly
  labelled `RUOŠIAMA`. Owner manually onboards the company side of any
  early pilot for now.
- **AI extraction.** The structuring parser is a small lexicon + regex.
  Every place it's surfaced says so honestly. A real LLM second-parser
  is documented in `docs/product/confirmed-suggestions-foundation.md` as
  a future step, never as the current state.
- **CV file extraction.** PDF / DOCX upload is scaffolded in the UI but
  marked "M2"; the worker pastes text for now. The parser handles the
  text path identically.
- **Public proof / sharable verified pages.** Blocked behind the
  feature flags PR #18 ships (`visibility.public_proof`,
  `visibility.client_report`) — neither flag is enabled today.

## 3. What is preparing (visible but honest)

- Company / agency / customer roles → `RUOŠIAMA` chip in the role
  switcher + the account list. Click leads to the existing pilot
  cockpit, not a full management surface.
- `/dashboard/discover` and `/dashboard/search` routes still exist with
  honest "coming in M2 / M3" empty states but are removed from primary
  nav so they are not dead-end destinations.

## 4. What is blocked by DB migration review

- PR #18 — `0014_journal_security_hardening.sql`. Blocked until the
  migration is re-validated against the current schema, `supabase db
  reset` is run, the staging-copy DB validation passes, and the owner
  explicitly approves the production push. Full path in
  [issue #32](https://github.com/bandymuks1-stack/labourmarketai/issues/32).
- What PR #18 unblocks: audit logs on confirm / reject / revoke, the
  reject / revoke ledger, narrowed RLS, RPCs for confirm / reject /
  revoke / set-visibility, the public-proof / client-report feature
  flags, the `proof_of_work` scaffold. Until that lands, the journal
  works via the existing direct-insert flow with the `closed` visibility
  scope.

## 5. What is blocked by owner production smoke

- The PR #30 production mobile smoke is still **PENDING**. The
  checklist owner walks through is at
  `docs/evidence/post-merge-production-smoke-pr30.md`. The guard test
  `apps/web/lib/guards/product-readiness.test.ts` enforces that the
  checklist's `Status: PENDING` line cannot be silently flipped — only
  the owner flips it after a real check.
- Until the smoke passes, the first working beta is allowed only for a
  **founder-guided closed cohort**: 3 – 5 hand-picked workers + 1 – 2
  small companies, each personally onboarded.

## 6. What a first user can actually do today

Given the owner has verified `SUPABASE_SERVICE_ROLE_KEY` and run the
production smoke:

1. Sign up with Google.
2. Pick "Darbuotojas" in onboarding.
3. Land on the dashboard with the new first-use panel; tap "Tvarkyti
   profilį".
4. Type a paragraph describing what they do; tap "Pasiūlykite struktūrą".
5. Confirm a few skill / direction / role suggestions; tap "Įtraukti
   patvirtintus pasiūlymus". See the *Confirmed by you* trail.
6. Open the journal; type what they did today; tap "Pasiūlykite
   struktūrą"; confirm useful suggestions; tap "Patvirtinti įrašą". See
   the "Įrašas išsaugotas" success card.
7. Open `/dashboard/account`, see their worker role marked Aktyvus and
   the others marked `RUOŠIAMA`, with the rolesIntro paragraph
   explaining they can add more roles later.

Nothing in steps 1 – 7 requires the founder to intervene. Steps 8 + are
where the founder picks back up (manager confirmation of journal
entries, etc.) — that is fine for a closed pilot cohort.

## 7. The next three most important sprints

In dependency order, not calendar order:

1. **Run the PR #30 production smoke, fix any deltas.** Owner-only;
   blocking for any traffic beyond the founder-guided cohort.
2. **PR #18 migration review sprint** (per issue #32). Brings the
   journal security hardening (audit logs, ledger, narrowed RLS, RPCs,
   `proof_of_work` scaffold, feature flags) onto the current schema.
   Without it the journal can't grow toward shareable proof.
3. **Confirmed-suggestions persistence layer** (per
   `docs/product/confirmed-suggestions-foundation.md`). Lands the
   `suggestion_proposals` + `suggestion_confirmations` tables (or
   equivalent) so the audit trail of "why is this skill on my CV?"
   starts collecting from the next user forward. Strictly behind PR #18
   review — same database, similar invariants.

After those three, the next layer is the manager confirmation UI + the
first public proof surface, both of which become safe to ship once PR
#18's machinery is in place.
