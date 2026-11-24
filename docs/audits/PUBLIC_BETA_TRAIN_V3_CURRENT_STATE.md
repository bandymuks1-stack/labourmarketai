# PUBLIC BETA TRAIN V3 — CURRENT STATE RECONCILIATION

Execution ledger, not an audit. Derived from GitHub and the repository on
**2026-08-10**, not from the train command's own claims.

- Canonical repo: `C:\Users\Mano\Documents\labourmarketai` (dirty — another
  session is using it; left untouched)
- Implementation worktree: `C:\Users\Mano\Documents\lmai-wt\beta-train-v2`
- Starting `origin/main`: **`dc354727`**
- Intervening commits since the command's orientation SHA: **none.**
  `origin/main` was already exactly `dc354727`, so there was no parallel work
  to classify or incorporate.

## PR reconciliation

| PR | State | Head | Migration | Production | Owner gate | Still relevant? | Safe next action |
|---|---|---|---|---|---|---|---|
| #1119 | OPEN → **merged by this train** | `a9c833ef` (scope unchanged, matched the reviewed implementation) | none | deploys with main | product decision supplied by TRAIN V3 §2.1 | yes | unblock the product gate, merge, verify |
| #1116 | MERGED 2026-08-09 | `fe6f3730` | write model shipped; migration **UNAPPLIED**, still gated | app code live, table absent | owner | yes | untouched by this train |
| #1112 | MERGED 2026-08-09 | `db929b6a` | none | live | — | yes | needs its first real production import to prove stamping |
| #1113 | MERGED 2026-08-09 | `07125b0b` | none | live | — | superseded as a task | MarketPulse liveness claim already removed |
| #1117 | MERGED 2026-08-10 | `a5f52be6` | none | live | — | yes | NUL-byte ratchet active |
| #1118 | MERGED 2026-08-10 | `ba04d9bb` | none | live | — | yes | per-channel checkpoint truth active |
| #1095 | OPEN draft | `61073d5f` | draft, UNAPPLIED | not deployed | **OWNER** | yes | not touched — see below |
| #1097 | OPEN draft | `53ad409b` | draft, UNAPPLIED | not deployed | **OWNER** | yes | not touched — see below |

The train command listed #1119 as blocked on a Product Constitution waiver.
That was **half right, and the half that was wrong mattered**: the mechanical
blocker was CI job `quality` failing with `undeclared_surface` (A-09) — the new
screen had no entry in the surface registry at all. No waiver could have fixed
that, because a waiver excuses a *finding*, and the finding was "you did not
declare this". Declaring it is what produced the six A-01 findings a waiver can
then legitimately cover.

## What this train changed

`/create-cv` is now **declared** in `apps/web/lib/product-gate/surface-registry.ts`
with all six mandatory justification answers, and the five World-State answers
recorded **honestly as "no"** — because a pre-authentication public acquisition
route genuinely has no World State, no map, no assistant and no workspace to
stay inside. Rewriting them to "yes" to get a green gate would have been the
exact fake-honesty defect A-06 exists to prevent.

Those six answers are excused by **one** scoped owner waiver
(`public-acquisition-route-create-cv` in `.github/scripts/owner-waivers.mjs`),
bound to axiom A-01, to the route `/create-cv`, to PR #1119, and to an expiry of
**2026-12-31**.

### A leak found and closed while writing it

The waiver's `files` list is used for two different comparisons: `decideWaiver`
matches a finding by `finding.what` (for a screen, the **route** `/create-cv`),
while `touchesWaivedFile` compares the same list against the **real changed file
paths** in the diff. Listing only the route id would have meant no changed path
could ever match, every unlisted PR would have been classified "unrelated", and
it would have silently inherited the waiver — destroying the "nothing new can
ever inherit this" guarantee the mechanism is sold on. Both the route id and
`apps/web/app/[locale]/(marketing)/create-cv/page.tsx` are therefore listed, and
a negative-control test pins it.

### A known property the owner should see

`decideWaiver` tests `expiresAt` **before** the unrelated-PR escape, and gate
rule 6c re-validates the whole registry on every run. So after **2026-12-31**
these six findings block **every pull request in the repository**, not only ones
touching `/create-cv`. That is the mechanism's designed pressure to resolve debt
rather than renew it — but it is a repo-wide deadline and it is written down
here, in the waiver record, and in a test, so nobody meets it by surprise.

### What removes the waiver

`gate-learns-public-acquisition-route-category`. The gate does not model a
pre-auth public acquisition route as a distinct kind, so it judges one by
workspace rules. The 118 grandfathered `BASELINE_SCREEN_COUNT` screens — `/`,
`/for-workers`, `/for-companies`, `/pricing` — fail the same five questions and
escape only by being older, not by being compliant. Teaching the gate that
category is a **constitution change**, and TRAIN V3 §2.1 granted authority over
the product surface, not over the constitution ("Do not interpret this as
permission to waive unrelated landing/page rules"). It is therefore left as an
owner decision.

## Not attempted by this train

Recorded so the next window does not mistake silence for completion. None of
these were started; none are claimed:

Sweden supply cursor recovery (§4) · import session history (§5) · CV funnel
E2E and template/import proof (§6.1–§6.5) · CV analytics (§7) · notification
coverage (§8–§9) · #1095 / #1097 (§10) · Latvia NVA (§11) · Le Forem (§12) ·
matching user-lens proof (§13) · worker E2E (§14) · employer E2E (§15) · auth
proof (§16) · feedback (§17) · mobile sweep (§18–§19) · zero-row pass (§20) ·
landing/pricing regression (§21–§22) · assistant capability matrix (§23–§24) ·
Telegram operations (§25).
