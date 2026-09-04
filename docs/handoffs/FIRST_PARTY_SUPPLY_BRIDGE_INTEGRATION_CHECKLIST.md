# First-party supply bridge — final integration checklist

**PREPARED, NOT EXECUTED.** Nothing in this document has been run. It exists so
the owner can execute it in order, and so each step states its own proof rather
than being ticked on faith.

PR **#1496** · branch `feat/cc/first-party-supply-bridge-v1` · **draft**, label
`needs-human-gate`.

Standing owner holds at the time of writing: **do not merge**, **do not apply
the RED migration**, **do not modify the parallel implementation train**, **no
secret/env writes**, **do not touch the Agentai repo**.

Each step below is blocked by the one above it. A step that cannot produce its
evidence is not done, and the ones after it do not start.

---

## 1. Latest-main rebase

```
git -C <worktree> fetch origin main
git -C <worktree> rebase origin/main
```

**Evidence:** `git rev-list --count HEAD..origin/main` = `0`; working tree clean.

**Expected conflict surface:** `apps/web/messages/{lt,en,ru,nl,de}.json`. The
parallel train edits those catalogs on almost every commit. This branch only
ADDS the `privacyConsent.partnerSupply` object and one `sections.partnerSupply`
key, so conflicts resolve by keeping both sides. Never resolve by dropping a key
from one locale — the parity guard would then fail for a reason unrelated to the
real change.

## 2. Overlap audit

```
git diff --name-only <merge-base>..origin/main
```

**Evidence:** the intersection with this branch's changed files is empty, or
each shared file is listed with a resolution.

**Known non-overlap, re-verified 2026-09-05** against `origin/main` `cf8ae437`:
the parallel train's `feat/cc/who-available` work is `lib/conversation/capacity*`
— a company's OWN roster over a 7-day approved-absence window, states
`free | unavailable`, contract/legitimate-interest basis. This branch is
consent-gated market supply intent for representation outside the product. Two
different questions, no shared table, no shared file, no migration collision.

**Reconcile rather than duplicate** if upstream introduces its own availability
or consent structure before merge: the canonical homes are
`privacy_consent_events` (the legal act) and
`first_party_supply_declarations` (the scope). A second store for either is the
failure to avoid.

## 3. CI

Required checks on `main`: **`quality`** and **`migration-safety`**.

**Evidence:** both green on the final SHA. `migration-safety` will report
`STRUCTURAL-GREEN, RISK-ACKNOWLEDGED` — that is not a safety pass, it is the
annotation acknowledging RED class.

**Known environmental non-blockers:** Vercel deploys are rate-limited on the
Hobby plan (24h); `Supabase Preview` skips without branch integration.

## 4. Human RED-migration review

`supabase/migrations/20260904120000_first_party_supply_representation_v1.sql`
(+ paired rollback).

What a reviewer is being asked to approve, specifically:

- **six SECURITY DEFINER functions**, one of them — `first_party_supply_feed_v1()`
  — REVOKEd from `public`, `anon` AND `authenticated` and granted to
  `service_role` alone, because it answers with every authorised person at once;
- **three new RLS policies**, all `profile_id = auth.uid()`, on a NEW table, and
  **no DELETE policy** (withdrawal is a stamp, so a person can prove what they
  withdrew and when);
- **one `privacy_consent_purposes` row**, pinning version `2026-09-04.v1` and
  hash `1e756f06…788f`, which must equal
  `consentTextHash(PARTNER_SUPPLY_REPRESENTATION_V1)`;
- **an UPDATE inside `withdraw_partner_supply_representation_consent`** that
  stamps the declaration withdrawn in the same transaction as the ledger row, so
  the two cannot drift apart.

No existing table, column or policy is altered. Nothing is dropped.

**Evidence:** explicit owner approval sentence, recorded with the PR.

## 5. Migration apply

Via Supabase MCP `apply_migration` **only**. Never `supabase db push` — repo
filenames do not match the ledger versions and a push would re-run applied
migrations.

**Evidence:** ledger row recorded; then, as a readback,
`select public.first_party_supply_freshness(now(), now() + interval '1 day', null)`
returns `CURRENT`, and
`select has_function_privilege('authenticated', 'public.first_party_supply_feed_v1()', 'execute')`
returns **false**.

**Rollback path if needed:**
`supabase/rollbacks/20260904120000_first_party_supply_representation_v1.down.sql`.
It refuses to drop the table while any declaration row exists — a declaration is
a person's stated consent scope, and dropping one silently revokes something
they said.

## 6. Production secret

Set `SUPPLY_FEED_BEARER_TOKEN` (≥32 characters, freshly generated, not derived
from `CRON_SECRET`) in Vercel production.

**Evidence:** `GET /api/internal/supply-feed/first-party-v1` with no header
answers **401**; with the correct header answers **200** and
`content-type: application/x-ndjson`.

**Owner action.** This train performs no secret or env writes.

## 7. Agentai VPS secret

The same value on the Agentai side, in that project's own environment.

**Evidence:** the pull command in step 8 returns 200 from the VPS.

**Owner action.** This train does not touch the Agentai repo or host.

## 8. Transport

The loader documented in `FIRST_PARTY_SUPPLY_BRIDGE_V1.md` §4, run on the
Agentai VPS:

```sh
curl -fsS --max-time 30 \
  -H "Authorization: Bearer $SUPPLY_FEED_BEARER_TOKEN" \
  -o /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl.tmp \
  https://labourmarket.ai/api/internal/supply-feed/first-party-v1 \
&& mv /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl.tmp \
      /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl
```

`curl -f` is load-bearing: without it a 503 body is written as the feed, and a
failed read becomes a measured zero.

**Evidence:** the file exists on the VPS; `summariseSupplyFeed` reports
`feedPresent: true`. **An empty file is a pass** — it is a measured zero, and it
is what the contract asks for when nobody has consented yet.

## 9. Synthetic production E2E

Re-run the rolled-back production proof (`FIRST_PARTY_SUPPLY_BRIDGE_V1.md` §5)
against the now-APPLIED schema, this time WITHOUT the DDL — only the four
synthetic actors and the assertions, still inside `begin; … rollback;`.

**Evidence:** 1 emitted row of 4 declarations; the three privacy negatives; the
feed RPC refused SQLSTATE 42501 as `authenticated`; and the zero-residue check
afterwards (`privacy_consent_events` and `workers` counts unchanged).

## 10. Real-worker UI E2E

```
E2E_REQUIRE_AUTH=1 pnpm -F web e2e tests/e2e/partner-supply-representation.spec.ts
```

Needs the local stack (Supabase running, the migration applied to it) and a
minted session:
`E2E_OWNER_EMAIL=dev.worker@local.test pnpm -F web exec tsx scripts/e2e-mint-session.ts`.

The spec refuses to report a skip as a pass when `E2E_REQUIRE_AUTH=1`.

**Evidence:** both tests green — the full path (consent → intent → markets →
authorities → save → canonical state → present in the feed → withdraw → absent
from the feed) plus the second test proving that withdrawing the CONSENT alone
also removes the row.

**Currently BLOCKED on this machine**, and this is why it has not been run:
Docker does not respond (`docker info` hangs past 120s), and the local Supabase
stack cannot bind its ports because Windows reserves 54290–54389. Both are
recorded environment faults, not properties of this change.

## 11. Production verification

**Evidence, in this order:**

1. A real worker completes the section at `/lt/dashboard/privacy#partner-supply`
   and the screen shows their own answers back after a reload.
2. `pnpm -F web supply-feed:emit --dry-run` against production reports
   `rows emitted: 1` (or more) and an `authorities` line whose
   `contactAuthority` count is **less than** the row count on any real
   population — equality there means something is granting rather than reading.
3. The Agentai commercial-conversion log moves from
   `blocked on SUPPLY : N` to a non-null `potential matches`.
4. The same worker withdraws, and the next emission drops them.

Only after (4) is the loop proven in both directions.

---

## What this checklist does NOT cover

- **Languages and credential validity.** v1 has twenty fixed keys and the
  consumer drops unknown ones, so emitting them would be an invisible no-op.
  That is a deliberate **v2 contract change with a consent story**, owned by the
  Agentai train, and explicitly not a v1 blocker.
- **`evidenceCompleteness`.** Null for every real worker because
  `workers.profile_completeness` is uncomputed. Null is honest and neutral
  downstream; closing it is the separate `AVAILABILITY_CAPACITY` requirement.
- **`allowedChannels`.** Always empty — there is no canonical channel consent
  yet, and empty means NONE on both ends. Publication is therefore refused at
  the channel gate even where `publicationAuthority` is granted.
