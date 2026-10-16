# OWNER DECISION SHEET — post-audit security and release programme (2026-10-16, revised 22:50 UTC)

| Field | Value |
|---|---|
| **Scope** | P0 Stripe · P0 Work Journal integrity · P0 GDPR · P1 release readiness · P1 remaining security findings |
| **Sources** | Production read-only reads on 2026-10-16 (Supabase MCP, project `gorgitwvdzxbnaxhrsrw`, Postgres 17.6, ACTIVE_HEALTHY): migration ledger, billing tables (counts and statuses only), function grants, trigger catalog, storage policies, query plans; the code on `main` `100fef1ec`; the master audit (`docs/audits/MASTER_AUDIT_2026-10-16.md`); the independent review of PRs #2432–#2438; the local PostgreSQL 16 proofs attached to PRs #2439 and #2442. |
| **Rule** | Nothing below was applied, merged, deployed, charged or rotated. Every item that needs you is marked **DECIDE**. Vercel is blocked (HTTP 402); a separate agent is restoring hosting on Hostinger — nothing here touches DNS, hosting, Supabase configuration or user data. |

---

## 1. Decisions required now

| Id | Decision | Default if you do nothing |
|---|---|---|
| **N-1 Stripe** | **DECIDE: (a) keep live armed and finish the proof, or (b) disarm now.** Recommended: **(b) disarm today, (a) re-arm after the proof** — §3. Code-side half is ready: [#2441](https://github.com/bandymuks1-stack/labourmarketai/pull/2441) (RED, billing) makes the owner-only DB flag `live_payments_enabled` the real second act. | Live stays armed; any completed checkout starts a 14-day trial whose first €99 charge is taken by Stripe with no entitlement granted on our side. |
| **N-9 Journal integrity** | **DECIDE: approve RED [#2439](https://github.com/bandymuks1-stack/labourmarketai/pull/2439)** — server-side hash chain, immutable evidence, orphan-only photo delete, immutable audit log. **Adversarial proof 15/15 PASS** on a throwaway PostgreSQL 16 after three proof-driven fixes (service-role bypass executable; server-set monotonic `created_at`; `project_id` not hashed). Apply via MCP; nothing else. | A worker can insert forged chain hashes through PostgREST; the tamper-evidence claim stays unsupported. |
| **N-4 GDPR** | **DECIDE: keep #2426 blocked (draft); review RED [#2442](https://github.com/bandymuks1-stack/labourmarketai/pull/2442) (erasure v3) with legal on its §15 list L-1…L-15; name the executor and the Art. 12 reply author** for the open request due **~2026-11-14**. v3 local proof 71/71 (an account with AI usage + journal history + Stripe mapping is severed, not deleted; forged/expired/reused tokens refused; undeclared FKs refused by name; receipts carry no identifier). | Deadline passes with no lawful executor. |
| **N-5 money RPCs** | **Closed** — production shows `authenticated` has no EXECUTE on the six LMC money RPCs (20261006100300 applied). | — |
| **N-10 transcript guard** | **DECIDE: approve RED [#2440](https://github.com/bandymuks1-stack/labourmarketai/pull/2440)** (null-safe owner check; latent). | Latent fail-open remains. |
| **N-11 merge of the GREEN PRs** | **DECIDE: approve the merge order in §5.** The independent review returned two REQUEST CHANGES; **both are fixed and pushed** (#2433 chain-path matcher; #2432 supersede date rule) plus the #2434 goods-wording nit. | The fixes stay unmerged. |
| **N-12 register truth** | **Ledger now read:** 20261003150100, 20261003150500, 20260915185038, 20261007150000, 20261012110000, 20261012180000 and 20261006100300 are **applied**. **DECIDE: let me correct the journey register (J-TIME-FREEDOM override, brigade-as-unit) and the EVID-2 / ARCH-5 / ORCHESTRATION rows** in one docs PR. | `product-truth` keeps reporting two journeys broken. |
| **N-13 confirmation secret** | **DECIDE: set `CONVERSATION_TOKEN_SECRET` in the restored production environment (Hostinger) before merging [#2444](https://github.com/bandymuks1-stack/labourmarketai/pull/2444)** (`fix/cc/confirmation-token-secret-required`). It removes the service-role-key fallback per your P5. | Chat and capability confirmations would refuse after merge if the variable is missing. |

---

## 2. Exact technical risks

### Stripe (measured 2026-10-16)
| Fact | Value | Source |
|---|---|---|
| Billing adapter state in production | `stripe_live` (armed 2026-09-05: `PRICING_READINESS_STATE = "owner_confirmed"` in code + Vercel env `STRIPE_LIVE_ACTIVATION = approved-by-owner`, a public literal) | code + `MASTER_COMPLETION_MAP_2026-09-05.md:30` |
| Live Stripe customers created by the app | **3** (2026-09-05 … 2026-10-02) | `billing_customers` |
| Live checkout operations | **3**: 1 `expired` (2026-09-05, the owner's proof session), **2 still `open`** (2026-09-22 07:33 UTC, 2026-10-02 16:08 UTC), both `test_mode = false`, source `web`, no subscription id, no failure recorded | `billing_checkout_operations` |
| Those two sessions' Stripe expiry | 45 minutes after creation — long past | `expires_at` |
| Subscriptions recorded / webhook events ever received | **0 / 0** | `billing_subscriptions`, `payment_webhook_events` |
| Recovery cadence | inert (`BILLING_RECOVERY_SCHEDULE_ENABLED` / `BILLING_RECOVERY_ENABLED` unset) | workflow + route |
| DB flag `live_payments_enabled` | `false`, read by no billing code today (gated by #2441 once merged) | `lmc_settings` |
| LMC flags | all seven `false` | `lmc_settings` |

**What the two `open` rows mean.** A row is closed only by a webhook; none has ever arrived. Our side cannot distinguish "abandoned" from "paid, trial started, first €99 charge due ~2026-10-06 / ~2026-10-16 with no entitlement". Only the Stripe dashboard knows. **This is the customer exposure.** Candidate causes, all owner-side: endpoint never registered in live mode; registered with a secret that differs from Vercel's `STRIPE_WEBHOOK_SECRET` (handler answers 400 and records nothing); or the deploy never served. The handler itself verifies signature and mode, records first, and is idempotent.

**What disarming does (code read):** removing `STRIPE_LIVE_ACTIVATION` → `stripe_live_blocked`: no new checkout; account page shows the honest disabled statement; webhook rejects (so a live subscription, if any, stays invisible until re-armed); entitlement enforcement switches **off** (nobody is locked out); existing Stripe subscriptions keep billing at Stripe until cancelled there.

### Work Journal integrity — see N-9 (proof attached to #2439).
### GDPR — see N-4 (design + proof in #2442; legal list §15 there).
### Remaining
- `append_assistant_message` null-safe guard: #2440.
- Policy-related FK indexes, measured with `EXPLAIN (ANALYZE, BUFFERS)` on production: `invitations` (79 rows) seq scan, 9.6 ms incl. 16 ms planning; `audit_logs.actor_id` already indexed (bitmap scan, 7.5 ms); `ai_runs` 418 rows; `marketplace_listings` 13 rows. **No index is needed at current volume.** Keep the list as a cheap pre-emptive set when a table passes ~10k rows. No action now.
- Rate limiting is per-instance memory (SEC-8); no CAPTCHA. GREEN follow-up (shared counter) proposed; Turnstile needs an owner key.

---

## 3. Recommended safe option — Stripe containment (no charge, no rotation, no config change by me)

**Step 0 (you, 10 minutes, read-only, Stripe dashboard → live mode):** (1) the three app-created customers — any subscription, invoice, payment? (2) the checkout sessions of 2026-09-22 ~07:33 UTC and 2026-10-02 ~16:08 UTC — `expired` or `complete`? (3) Developers → Webhooks — is `https://labourmarket.ai/api/billing/webhook` registered in live mode, which events, does the signing secret match the deployed `STRIPE_WEBHOOK_SECRET`?

**Step 1 — if any subscription or payment exists:** cancel/refund in Stripe (you); tell me the ids; I grant the entitlement through the existing admin override path (`manual_override_plan_key`). No code change.

**Step 2 — disarm (recommended regardless):** remove `STRIPE_LIVE_ACTIVATION` from the production environment (you). Keep the live keys so re-arming is one env change. **Alternative with the same effect for new checkouts:** merge #2441 — with the DB flag false, new live sessions are refused (503 `live_not_enabled`) while reconciliation keeps working.

**Step 3 — re-arm only after:** webhook registered with the matching secret; hosting restored and `/api/health` reports the build; the smallest live charge + immediate refund observed as one `payment_webhook_events` row and one `billing_subscriptions` row; recovery cadence enabled; then the owner-only flag `live_payments_enabled` set to true (the second act, #2441).

---

## 4. PR and migration dependencies

| PR | Class | Depends on | Blocks |
|---|---|---|---|
| [#2432](https://github.com/bandymuks1-stack/labourmarketai/pull/2432) journal fact (GREEN) — review: REQUEST CHANGES → **fixed** (`72c868f8a`, supersede date rule) | code | — | — |
| [#2433](https://github.com/bandymuks1-stack/labourmarketai/pull/2433) AI refusals (GREEN) — review: REQUEST CHANGES → **fixed** (`18920e837`, chain-path matcher + test) | code | — | #2419 benefits after it |
| [#2434](https://github.com/bandymuks1-stack/labourmarketai/pull/2434) marketplace goods (GREEN) — review: APPROVE WITH NITS → **nit fixed** (`35638a5d5`, Goods wording, dead branch removed) | code + i18n | — | — |
| [#2435](https://github.com/bandymuks1-stack/labourmarketai/pull/2435) international entry (GREEN) — APPROVE WITH NITS | code + middleware | — | — |
| [#2436](https://github.com/bandymuks1-stack/labourmarketai/pull/2436) privacy copy + DSR due (GREEN) — APPROVE WITH NITS | code + i18n | — | the queue date for the 11-14 request |
| [#2437](https://github.com/bandymuks1-stack/labourmarketai/pull/2437) company unknown≠0 (GREEN) — APPROVE WITH NITS | code | — | — |
| [#2438](https://github.com/bandymuks1-stack/labourmarketai/pull/2438) docs (GREEN) — APPROVE WITH NITS (wording "(fixed)" → "fix in #24xx") | docs | merge last | — |
| [#2444](https://github.com/bandymuks1-stack/labourmarketai/pull/2444) confirmation secret (GREEN) | code + env | **`CONVERSATION_TOKEN_SECRET` set in production** | — |
| [#2439](https://github.com/bandymuks1-stack/labourmarketai/pull/2439) journal integrity (**RED**, draft, proof 15/15) | migration 20261016190000 + rollback | your approval; apply via MCP | #2442 relies on its bypass GUC |
| [#2440](https://github.com/bandymuks1-stack/labourmarketai/pull/2440) transcript null guard (**RED**, draft) | migration 20261016190100 + rollback | your approval | — |
| [#2441](https://github.com/bandymuks1-stack/labourmarketai/pull/2441) Stripe second act (**RED**: billing, no migration) | code | N-1 | — |
| [#2442](https://github.com/bandymuks1-stack/labourmarketai/pull/2442) erasure v3 (**RED**, draft, proof 71/71) | migration 20261016150000 + rollback + design | legal review §15; #2439 applied first | the 2026-11-14 request |
| #2426 erasure v2 (**RED**, draft) | — | **superseded by #2442** — close after acceptance | — |
| #2419 AI monitor (GREEN) | code | — | — |

Migration order if all approved: 20261016190000 (journal integrity) → 20261016190100 (transcript guard) → 20261016150000 (erasure v3; its timestamp sorts earlier but it depends on the journal bypass — apply order is by decision, the files do not touch each other's objects). Each has a verbatim rollback.

---

## 5. Deterministic merge order, rollback, smoke test

**Order (one at a time, `quality` + `migration-safety` green, `/api/health` build check after each; the reviewer's order, adopted):**
1. #2437 company → 2. #2436 privacy copy + DSR date → 3. #2435 international entry → 4. #2434 marketplace (nit fixed) → 5. #2432 journal (supersede fix in) → 6. #2433 AI (matcher fix in) → 7. #2444 confirmation secret **only after N-13** → 8. #2419 AI monitor → 9. #2438 docs last, with its "(fixed)" wording updated to the merged state.
RED set only after your approval and only via MCP.

**Rollback:** every GREEN PR is a plain `git revert` (no data, env or schema effects; details in the review). RED migrations roll back with their `.down.sql` via MCP; #2439's rollback demotes any version-2 rows to `legacy` (hashes kept).

**Post-deploy smoke (after hosting restore, ~20 minutes, the sanctioned prod-qa worker):** `/api/health` build = merged SHA · journal composer refuses tomorrow, accepts yesterday; an EDIT cannot re-date into the future · chat "nuo 8 iki 17, 30 min pertrauka" → three time metrics on the entry · chat "turiu 30 kg agurkų parduoti" → listings chip; "pagaminome 500 palečių" → the Goods line · listings page under a forced read error shows the unavailable copy · `curl -sI -H 'Accept-Language: sv-SE' https://labourmarket.ai/` → 307 `/en`; `x-default` → `/en/about` · privacy section 8 and cookies page carry the new wording · admin privacy queue shows "Reply due by 2026-11-13" · `ai_runs` last 24 h: no refused run without `blocked_reason = egress_refused` · one chat confirmation succeeds (CONVERSATION_TOKEN_SECRET present).

---

## 6. What was completed autonomously vs what cannot be

**Done (no approval needed):** independent review of #2432–#2438 and all requested fixes; erasure v3 design + draft migration + local proof (#2442); journal-integrity RED draft + proof-driven fixes + 15/15 proof (#2439); transcript null-guard RED draft (#2440); Stripe second-act RED draft with route tests (#2441); #2444 confirmation secret; production reads for every fact above; production query plans for the index question; this sheet.

**Never autonomous:** removing or adding any production env; any Stripe dashboard action; any live charge or refund; applying any migration; merging to `main` while the owner's hold stands; rotating a secret; closing #2426; DNS/hosting/Supabase configuration changes (the Hostinger agent's domain).
