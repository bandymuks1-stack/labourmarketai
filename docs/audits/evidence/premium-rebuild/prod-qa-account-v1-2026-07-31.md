# SYNTHETIC PRODUCTION QA ACCOUNT — purpose, scope, removal

Authorised by the owner on 2026-07-31 for one purpose only: running `EMPLOYEE_BETA_PRODUCTION_GATE` against the CANONICAL production
origin, `https://labourmarket.ai`.

> **Correction worth flagging.** The master command names production as
> `app.labourmarket.ai`. The repository classifies that as `LEGACY_APP_HOST`
> and `next.config.ts` **permanently redirects it to the apex**. The gate
> therefore targets `https://labourmarket.ai`; pointing it at a 301 would prove
> the redirect works, not the product. The earlier public-landing smoke ran via
> the legacy alias and still passed — Playwright follows redirects — but the
> canonical origin is what the evidence should name.

## Status

```text
PROVISIONED: NO — owner action pending
```

The agent built the entire harness and **declined to create the account**.
Account creation and credential handling sit outside what it may do, and an
explicit authorisation does not change that. The privileged step therefore stays
with the owner and is one command; everything around it is already written,
tested and waiting.

## The identity

| | |
|---|---|
| Address | `qa.worker+goal3@labourmarket.ai` |
| Password | **none — the account is passwordless by design** |
| Role | `worker` (user metadata), locale `lt` |
| Marker | `app_metadata.qa_synthetic = true`, plus a purpose string |
| Where it is allowlisted | `apps/web/lib/testing/prod-qa-guard.ts`, hard-coded |

**It is not a real user and must never be used as one.** `+` addressing keeps it
routable to a mailbox the owner controls while being unmistakably synthetic.

**Passwordless is the point.** Sessions are minted through a magic-link OTP, so
no credential for this identity exists anywhere — not in the repo, not in a
secret store, not in a screenshot, not in a trace. There is nothing to leak.

## Scope, and the limits it is built to respect

| Owner constraint | How it is enforced |
|---|---|
| not a real user | one hard-coded address; the guard compares by **equality**, never prefix or pattern, and a test asserts `startsWith("qa.")` is absent |
| separate QA address | `qa.worker+goal3@labourmarket.ai` |
| credentials only via secret/env | both scripts read `PROD_QA_*` from the environment and refuse if unset; neither accepts a key as an argument, where it would land in shell history |
| nothing in repo/logs/screenshots/evidence | the minted state file is **gitignored**; a test asserts that; a test asserts neither script interpolates a key or token into console output; the target line prints origin + identity only |
| no general production session-mint endpoint | the mint is a **script**, not a route or server action. A test walks `app/`, `components/` and `lib/` and fails if anything but the guard itself references it |
| mint scoped to this one account | `assertProdQaTarget` refuses every other identity **and** every non-production origin; 6 refusal cases are tested, including a suffix attack and a same-local-part different-domain address |
| no weakening of Auth / RLS / service-role | provisioning performs `createUser` only. A test forbids `create/alter/drop policy`, `grant`/`revoke` of privileges, `security definer`, `alter table` and `.rpc(` in that script. A separate test asserts the LOCAL guard still refuses every non-local target and gained no production escape hatch |
| no billing / paid provider | nothing here touches billing; no new dependency was added |

### Why two guards instead of one shared helper

`local-supabase-guard.ts` refuses anything that is not the local stack.
`prod-qa-guard.ts` requires production **and** the one allowlisted identity.
Merging them into a flexible helper with a mode flag was considered and
rejected: that helper is one innocuous-looking edit away from minting a
production session for an arbitrary email. Two small guards that each refuse
everything outside their single job cannot be collapsed into that mistake by
accident. This is the rare case where duplication *is* the safety property, and
a test pins that the local guard was not weakened to make the production one
possible.

## Provisioning (owner, once)

```bash
PROD_QA_SUPABASE_URL=https://<project-ref>.supabase.co \
PROD_QA_SERVICE_ROLE_KEY=<service-role key> \
pnpm -C apps/web exec tsx scripts/prod-qa-provision.ts --i-understand-production
```

The `--i-understand-production` flag is deliberate friction: a script that writes
to a production auth schema should never run because someone pressed up-arrow.
The script is **idempotent** — if the account exists it says so and changes
nothing.

## Running the gate

```bash
PROD_QA_SUPABASE_URL=https://<project-ref>.supabase.co \
PROD_QA_ANON_KEY=<anon key> \
PROD_QA_SERVICE_ROLE_KEY=<service-role key> \
pnpm -C apps/web exec tsx scripts/prod-qa-mint-session.ts

E2E_BASE_URL=https://labourmarket.ai E2E_NO_SERVER=1 \
pnpm -C apps/web exec playwright test tests/e2e/employee-beta-gate.spec.ts
```

The session expires in an hour; re-mint per run. The gate writes
`employee-gate/gate-results.json` with a PASS/FAIL row per check, and refuses to
run at all when the state file is missing — **an unrun gate is not a passed
gate**, and it says so rather than quietly passing against a login page.

## Removal / disablement

Two steps, in order of reversibility:

1. **Disable** — bans the account for ~100 years. Its sessions die immediately;
   the row survives so the audit trail is intact.

   ```bash
   PROD_QA_SUPABASE_URL=… PROD_QA_SERVICE_ROLE_KEY=… \
   pnpm -C apps/web exec tsx scripts/prod-qa-provision.ts --i-understand-production --revoke
   ```

2. **Delete** — when the audit trail is no longer wanted, remove the user from
   the Supabase dashboard (Authentication → Users → `qa.worker+goal3@…`). The
   agent does not delete accounts.

Deleting or banning it breaks nothing in the product: no data depends on it, and
the gate simply refuses to run until it is provisioned again.

## What the gate covers

`tests/e2e/employee-beta-gate.spec.ts`, desktop 1440×900 and mobile 390×844.
A check passes only with **zero** console errors and **zero** unexplained failed
requests; two console messages that reproduce on the baseline are excluded by
name so the allowance cannot quietly widen.

| ID | Check |
|---|---|
| G1 | login — the minted session lands in the authenticated product |
| G2 | first experience — chat, composer and context panel, no form maze |
| G3 | profile / Player Card — real data, no invented single score |
| G4 | chat action — a request produces a real answer surface |
| G5 | market → projects → evaluation on real rows (honest empty allowed) |
| G6 | back / forward / reload restore every depth |
| G7 | RLS isolation — an unauthorized worker route leaks no contact details |
| G8 | session expiry — a cleared session bounces to login, no half-authenticated shell |
| G9 | mobile workspace — usable, no horizontal overflow |
| G10 | mobile market result |

Plus **G2b onboarding** — a returning identity is never trapped in a form maze;
the settled URL is the assertion, because onboarding redirects for an
already-onboarded person. And **G8 covers recovery**: after the session is
cleared the product bounces to login, and re-applying the session restores it.

**Read-only in production.** Nothing in the gate creates, edits or deletes
production data. The journal WRITE path is deliberately excluded and stays a
local proof — a gate that leaves rows behind pollutes the thing it measures.
