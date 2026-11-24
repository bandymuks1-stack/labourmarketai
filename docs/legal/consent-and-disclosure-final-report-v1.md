# Consent and Disclosure — Final Report v1 (2026-07-11)

```text
STATUS: GREEN (technical controls live in production, fail-closed proven;
  legal-text review + controller identity remain owner actions — documented,
  not GREEN-blockers for the technical risk control this goal ordered)
BASE: main @ e906502 (after PR #699)
FINAL MAIN COMMIT: 50d610c (PR #700) + this docs/fix PR on top
PRS:
  #700 feat(privacy): consent and disclosure safety v1 — fail-closed worker
       visibility (code, migration, UX, i18n, tests, legal docs)
  (+ follow-up docs/fix PR: ordering-fix migration file, APPLIED_LEDGER,
   this report)
MIGRATIONS:
  20260711130000_privacy_consent_and_disclosure_v1 (@human-gate-approved,
    paired rollback) — ledgers, version pinning, RLS swap, 12 RPCs
  20260711150000_privacy_consent_event_ordering_fix_v1 (@human-gate-approved,
    paired rollback) — monotonic seq tie-breaker: a withdrawal ALWAYS beats
    a same-instant grant (found by the production rollback self-test)
PRODUCTION MIGRATION LEDGER: both applied 2026-07-11 via Supabase MCP
  apply_migration to gorgitwvdzxbnaxhrsrw per docs/APPLIED_LEDGER.md
  (entries added); post-apply verified by direct SQL: 2 purposes seeded,
  0 consent events (NO backfill), workers_select = can_view_worker(id),
  append-only trigger present, 12 RPCs with authenticated-only grants.
CONTROLLER IDENTITY: NOT RESOLVED (nothing invented). Only partner-route
  entities are named anywhere (UAB Nonstop Group LT / Labour Market AI
  Sp. z o.o. PL); the privacy policy honestly lists controller identity as
  pending. Consequence applied: NO outward disclosure-execution UI ships;
  record_personal_data_disclosure exists as the mandatory fail-closed gate
  with no caller. Owner decision spec: docs/legal/legal-basis-matrix-v1.md.
LEGAL BASIS MATRIX: docs/legal/legal-basis-matrix-v1.md (draft for review).
DISCLOSURE SURFACES AUDITED: 21 surfaces —
  docs/legal/personal-data-disclosure-surface-audit-v1.md. One real DB
  exposure found (workers/worker_skills/worker_professions readable by ANY
  employer); contacts/documents/public routes were already closed.
EMERGENCY FAIL-CLOSED RESULT: the RLS swap IS the server-side block —
  proven in production by a rolled-back simulation: employer sees 0 foreign
  workers before consent; +1 after a real RPC grant; back to 0 immediately
  after withdrawal; ledger returned to 0 rows (nothing persisted).
PROFILE DISCOVERABILITY: live. Opt-in, default OFF, separate from Terms
  (signup has no consent control at all), versioned text (2026-07-11.v1,
  hash-pinned in DB, stale version = consent off), equal enable/decline
  buttons, exact employer preview, one-click withdrawal on the same screen.
EMPLOYER-SPECIFIC DISCLOSURE: RPCs live (grant/withdraw/guard/record):
  per recipient organization + typed context (company_need|booking|
  service_request, existence-validated) + closed 7-field whitelist;
  payload-wider-than-consent refused; admin-gated execution; no UI caller
  yet (deliberate — controller identity pending).
CONSENT LEDGER: privacy_consent_events — append-only (trigger blocks
  UPDATE/DELETE for every role incl. service role), worker-only SELECT,
  writes only via auth.uid()-derived RPCs, records purpose/action/version/
  hash/locale/source/time (+recipient/context/fields for disclosure).
DISCLOSURE LEDGER: personal_data_disclosures — append-only, one-way
  revoked_access_at, categories only (never document copies).
RLS: workers/worker_skills/worker_professions SELECT via can_view_worker();
  profiles stays self+admin (guard forbids any employer widening);
  ledger tables have no write policies at all.
RPC: 12 functions, SECURITY DEFINER (history reader is SECURITY INVOKER),
  pinned search_path, authenticated-only EXECUTE, no anon, no user-id
  parameters on grant/withdraw (auth.uid() only).
EXISTING USERS: all 20 production workers = not_set (private). NO backfill
  (guard-tested: only statement-level INSERT is the 2-row purposes seed).
NEW USERS: default not_set = invisible; nothing at signup grants anything.
WITHDRAWAL: same screen, one click, always accepted; removes the profile
  from new employer queries at the next statement (no cache above RLS);
  private CV/journal/profile untouched; ordering fix guarantees a
  withdrawal beats a same-instant grant.
ADMIN READINESS: /dashboard/admin/launch-readiness "Consented profiles" =
  CURRENT granted ledger rows (admin_privacy_readiness_counts RPC); legacy
  profiles.consent_data_processing RETIRED from the metric (it never had a
  write path — the old count was structurally 0/false); honest breakdown
  tiles (discoverable/awaiting/withdrawn/stale/permissions/disclosures),
  no percentages; candidate pool shows "Awaiting worker permission"; admin
  has NO consent-granting control (no such RPC exists — guard-tested).
PRIVACY DOCUMENTS: Privacy Policy sections 3 (“Who can see your data”) and
  4 (“Consent”) rewritten in lt/en/ru/nl/de; 5 new docs under docs/legal/
  (audit, design, legal-basis matrix, copy register, DPIA screening —
  explicitly NOT lawyer-approved).
LT/EN/RU/NL/DE: privacyConsent namespace + consent registry texts complete
  in all 5 active locales; parity guards green; i18n-debt unchanged
  (de=0, nl=0, ru=0); NL/DE/RU remain preview-tagged pending native review
  (project convention).
SECURITY TESTS: consent-fail-closed.test.ts + consent-definitions.test.ts +
  consent-ux-honesty.test.ts (54 tests) cover the 26 required proofs:
  IDOR/impersonation (auth.uid()-only), consent spoofing (version+hash),
  recipient/context substitution, stale version, replay-safe append-only,
  admin bypass, payload widening, signed-URL absence, ledger immutability.
  Production simulation additionally proved the live RLS behavior.
FULL TESTS: 8281 tests / 528 files ✅ typecheck ✅ lint ✅ build ✅
  placeholders:check ✅ check:i18n-debt ✅ check:public-seo-indexing ✅
  check:primary-route-smoke (35) ✅ check:constitution ✅ migration-safety
  self-test 26/26 + diff classifier GREEN (RED patterns human-gated) ✅
PRODUCTION SMOKE (2026-07-11, after #700 deploy dpl_8FGDPMEjawZvgjraPKks1LL6Uhy1
  READY): apex 200 · www 308→apex · app 200 · /lt/auth/login 200 ·
  /lt/dashboard/privacy → auth-gated login redirect (correct) ·
  /lt/legal/privacy 200 with the new consent wording · sitemap 130 URLs /
  5 locales / no private paths · legacy URL still 404.
LANDING UNCHANGED: landing-freeze guard green through every commit
  (frozen files and namespaces untouched byte-identical).
REAL CONSENTS CREATED: 0 (zero) real-user consents exist; 0 test rows
  persisted — the production behavioral proof ran inside a rolled-back
  transaction (ledger verified 0 rows after); NO automatic backfill of any
  kind occurred. The owner may additionally run a persistent test with
  their own test account at any time (grant → check /dashboard/privacy →
  withdraw): the flow is the exact one proven above.
REMAINING LEGAL REVIEW (owner actions, in order):
  1. Decide + name the data controller entity, address, privacy contact
     (one concrete recommendation in legal-basis-matrix-v1.md) and clear
     the pendingItems in the privacy policy.
  2. Lawyer review of the 5-locale consent texts + rewritten policy
     sections; set retention periods; add supervisory-authority reference.
  3. Native review of NL/DE/RU catalogs (existing project-wide action).
  4. Full DPIA before any AUTOMATED matching feature ships (screening
     verdict in privacy-risk-and-dpia-screening-v1.md).
BLOCKERS: none technical. A 390px authenticated privacy-UX browser pass
  was not run (needs a logged-in session; the screen is built from
  existing audited layout primitives and is covered by build + route
  smoke) — owner can eyeball it on first login.
ROLLBACK: app — revert the squash commits; DB — paired down files restore
  the ORIGINAL employer-open policies (re-opens the audited exposure; hard
  technical failure only, never a product choice).
NEXT ACTION: owner performs legal-review items 1–2; product work can
  proceed on real supply collection — new profiles are private by default
  and the readiness view now counts only real ledger consents.
```
