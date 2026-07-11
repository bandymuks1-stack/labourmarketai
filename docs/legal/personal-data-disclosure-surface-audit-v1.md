# Personal-Data Disclosure Surface Audit — v1 (2026-07-11)

Phase 0 of the consent-and-disclosure build. Every surface through which one
user's (worker's) personal data could reach another user or the public,
audited in code AND against the live production RLS policies
(`gorgitwvdzxbnaxhrsrw`, read 2026-07-11). "Fix" column states what this
build changes; fixes marked RLS-SWAP ship in
`supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql`.

## Verdict up front

- **One real DB-layer exposure existed**: the `workers_select` /
  `worker_skills_select` / `worker_professions_select` RLS policies allowed
  **any authenticated company or agency account to read EVERY worker row**
  (display name, headline, free-text bio, location, salary range,
  availability) with **no consent flag of any kind** — the only protection
  was app-layer discipline. This is the emergency fail-closed target.
- **Contacts were already fail-closed**: `profiles` (email/phone/full_name)
  is self+admin only; `worker_documents` owner+admin only; no cross-user
  CV/document signed-URL path exists; `canViewWorkerContact()` is hard-wired
  `false`; no email/Telegram notification carries worker PII.
- **No public/anonymous worker PII surface exists**: no public profile
  route, sitemap and robots exclude all dashboard/cv surfaces.

## Surface-by-surface

| # | Surface | Files / route | Data returned | Who could see it | Consent checked? | Contacts? | Docs? | Indexable? | Fix |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Worker directory (DB layer) | RLS `workers_select` (0001) | every `workers` column: display_name, headline, bio, experience, location country, preferred countries, availability, salary range | ANY `is_employer()` account | **NO** | no (no contact columns) | no | no (auth-gated) | **RLS-SWAP**: employer read now requires current granted `profile_discoverability` consent OR an active work relationship (`can_view_worker`) |
| 2 | Worker skills / professions (DB layer) | RLS `worker_skills_select`, `worker_professions_select` (0001/0008) | skill + profession links | ANY `is_employer()` | **NO** | no | no | no | **RLS-SWAP**: same `can_view_worker` gate |
| 3 | Company Scouting (the one real employer query) | `/dashboard/company/scouting`; `lib/scouting/scouting.ts`; `lib/market/match-subject.ts` (pulls ALL workers, limit 200) | anonymized label, country, availability, rate-from, evidence count, fit % — app layer strips names via `scout-safe-view` | authenticated `company` role, own demands only | app-layer only (no DB gate); `SupplyCandidate` carries displayName/headline in memory | no | no | no | RLS-SWAP closes the DB layer; consent-less workers now vanish from the pull itself. App-layer strip stays as defense-in-depth |
| 4 | Free-text worker search | `/dashboard/search` | — | — | — | — | — | no | none needed (honest placeholder, no real query) |
| 5 | Player cards / talent | `/dashboard/talent` | "Sample ·" data only | superadmin | n/a | no | no | no | none (sample-only, superadmin) |
| 6 | Operator candidate pool | `/dashboard/admin/candidate-pool`; `lib/staffing/candidate-pool.ts` | real worker names, trade, country, availability, evidence | **superadmin only** | operator role is the basis (Art. 6(1)(f) internal ops) | no | no | no | ADDED: per-candidate `Awaiting worker permission` state from the consent ledger; outward sharing gated on `employer_data_disclosure` |
| 7 | Matching workbench / shortlist (`demand_shortlist`, `matches`) | `/dashboard/admin/matching`; RLS owner+admin | worker names to operator | superadmin / owner | operator basis | no | no | no | same as 6; external send must call `record_personal_data_disclosure` (fails closed without worker grant) |
| 8 | Company/agency roster of LINKED workers | `lib/company/company-workers.ts`, `lib/agency/agency-workers.ts` | linked worker display_name (email embed already RLS-nulled) | the org the worker ACCEPTED an invitation to | relationship = accepted invitation (contract basis, not consent) | intended email embed is blocked by profiles RLS | no | no | KEPT deliberately: `can_view_worker` includes active `company_workers`/`agency_workers`/`engagement_contexts` links (see legal-basis-matrix). Latent risk documented: never widen `profiles_select` |
| 9 | Manager journal review queue | `lib/journal/review-queue.ts`; `/dashboard/inbox` | journal `original_text`, declared skills; name embed RLS-nulled → "—" | org manager with `journal_review_enabled` engagement | relationship-gated (RPC `reviewable_journal_entry_ids`) | no | no | no | none in v1 (active-engagement basis); documented |
| 10 | Project operations view + CSV | `lib/projects/operations.ts`; `/dashboard/projects/[id]/operations` | assigned workers' display_name (+journal counts); real full_name embed RLS-nulled | manager of that project | assignment relationship | no | no | no | KEPT via `can_view_worker` project-assignment clause; documented |
| 11 | Conversations counterpart identity | `conversation_counterpart_identities` RPC | counterpart full_name ONLY, 2-person direct convo | the other participant | participation is the basis | no | no | no | none (narrow, revocation-aware) |
| 12 | Service-request requester identity | `requester_identities_for_provider` RPC | buyer full_name for requests addressed to the provider | that provider | request-initiated | no | no | no | none |
| 13 | Agency docs readiness | `agency_pool_docs_readiness()` RPC | category COUNTS only | worker's own agency, only when `docs_aggregate_consent=true` (default false) | YES (existing model gate) | no | no (counts) | no | none — this was already the model |
| 14 | Worker documents / CV files | `worker_documents` RLS; `customer-request-attachments` | — | owner + admin only | n/a | n/a | owner-only | no | none; disclosure of any document now additionally requires `employer_data_disclosure` + `record_personal_data_disclosure` before any handover |
| 15 | GDPR exports (privacy/journal) | `/dashboard/privacy/export`, `/dashboard/journal/export` | caller's OWN data | self | n/a | own | own | no | none |
| 16 | Admin exports | operations CSV (see 10); no other admin export | RLS-scoped rows | manager/superadmin | role basis | no | no | no | none |
| 17 | Market map | `lib/market-map/signals.ts` | caller's own rows only | self | per-row visibility model | no | no | no | none (no cross-user aggregate built) |
| 18 | Public routes / sitemap / robots | `sitemap.ts`, `robots.ts` | no worker URLs; `/*/dashboard`, `/*/cv`, `/*/auth` disallowed | public | n/a | no | no | **no worker PII indexable** | none |
| 19 | Email / Telegram notifications | `lib/notifications/telegram-owner-alerts.ts` (only outbound) | company-need intake fields (employer-side B2B contact, not worker data) | owner | n/a | employer contact only | no | no | none for worker data |
| 20 | Service-role usage | 5 sites (leads funnel, admin intakes, billing, launch-readiness) | no worker-PII-returning public path | n/a | CI-pinned inventory (`chat-visibility-rls.test.ts`) | no | no | no | none; consent RPCs deliberately use the CALLER's auth context, never service role |
| 21 | API routes | `api/workers/[workerId]/skills` (owner-gated), `api/leads` (anon write-only), `api/cv/extract` (self-upload parse) | own data | self | owner checks present | no | no | no | none |

## Emergency fail-closed action taken (this build)

The RLS swap in `20260711130000_privacy_consent_and_disclosure_v1.sql` is the
server-side block: after apply, an employer/agency query for workers returns
ONLY workers with a CURRENT granted `profile_discoverability` consent (ledger
row, current text version) or an active work relationship with the caller.
UI hiding is NOT relied on anywhere. Until real users grant consent, employer
discovery surfaces are empty — that is the intended truthful state.

## Latent risks documented (not new exposures)

1. Three modules still SELECT `profiles.full_name/email` embeds of other
   users (`operations.ts`, `review-queue.ts`, `company-workers.ts`) and are
   fail-closed ONLY by the self+admin `profiles_select` policy. Rule: any
   widening of `profiles_select` is a consent-model change and must come back
   through this design. Guard: `consent-fail-closed.test.ts` pins the policy.
2. `SupplyCandidate` carries displayName/headline in memory through scouting;
   the safe-view strip plus the new RLS gate together keep it off-screen.
3. Legacy `consents` table (0 rows, update-in-place semantics) and
   `profiles.consent_data_processing/consent_marketing` booleans (no write
   path) are DEPRECATED for consent purposes — superseded by the append-only
   `privacy_consent_events` ledger. Left in place (additive-only rule).
