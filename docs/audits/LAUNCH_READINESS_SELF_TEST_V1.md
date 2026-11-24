# Launch Readiness Self-Test v1 — first-tester guide & evidence

> **Purpose.** Real workers / testers log in within ~12 hours. This is the
> automatic, no-fake-data self-test of the whole core cycle plus the short guide
> a first tester (and you, the owner) follow so nothing breaks silently.
>
> **Scope guard.** No production DB apply, no `db push`, no MCP `apply_migration`,
> no fake production data, no fake workers/matches, no billing, no external AI,
> no broader talent-pool, no Phase C/D/E, no RLS/grant/policy/SECURITY DEFINER
> change, no outreach. Verified read-only against prod where stated.

## The cycle under test

```
worker onboarding → profile / player card → Work Journal skill evidence
        → company need → matching v1 → scouting → shortlist
        → manager confirmation (raises evidence tier)
```

## Verdict (2026-06-12)

**GO for first testers.** No critical launch blocker found on any of the three
paths. Every stage renders, every empty state is honest, no blank pages, no dead
buttons, no fake verification, and every data-sparse / pre-migration branch
degrades gracefully (tagged state, never a 500). The two halves of the evidence
loop are both live (worker `work_journal` via PR #330; manager `manager_confirmed`
RPC applied to prod — verified: 2 real confirmed rows).

## How it was tested (without touching prod data)

1. **Route inventory + dead-UI scan** — `pnpm -F web check:primary-route-smoke`
   (22 primary routes, 0 blocking findings; report under
   `runtime/project-quality/`).
2. **Static path audit** — every worker / company / manager stage read for: does
   it render, what does a brand-new user see first, what is the empty state, any
   dead button / blank / 500 / misleading copy.
3. **Regression net** — `lib/guards/launch-readiness-self-test.test.ts` pins the
   critical routes + honest empty states + graceful-degradation branches so they
   can't silently regress (Docker-free, runs in CI).
4. **Engine tests** — matching v1 (`lib/market/match-v1.test.ts`) already covers
   sparse / insufficient-data / determinism / evidence-strength ordering;
   scouting returns a tagged state for every path.
5. **Live render layer (manual / Docker)** — the Playwright suite
   (`pnpm e2e:local`) walks the authenticated happy paths but needs a **local**
   Supabase stack (Docker) and never targets prod (hard guard in
   `scripts/e2e-local.ts`). It is the owner's optional deeper check, not run in
   this CI-only pass.

## First-tester guide

### Worker — first 5 minutes
1. **Sign in / sign up** → `/auth/login`. After login you land on `/dashboard`.
   A brand-new account is sent through `/onboarding` first (pick role, name,
   country) — that's expected, not an error.
2. **Set your trade + skills** → `/dashboard/profile`. Pick your profession,
   then add the skills you actually have. With nothing added you'll see honest
   "none yet" pillars and a clear "add profession first" prompt — that's the
   empty state, not a bug.
3. **Open your player card** → `/dashboard/player-card`. With no evidence yet it
   shows honest zeros + "None yet" for verified skills. Nothing is faked.
4. **Write a Work Journal entry** → `/dashboard/journal`. If you have no
   employer/engagement yet it honestly says "waiting on organization / no
   context" — that is correct. With an engagement, the composer is right there.
5. **Link the entry to a skill** — on each journal entry, use "mark which of your
   skills this entry supports". That raises the skill to the **work-journal**
   evidence tier on your player card automatically (no fake verification).

### Company — first 5 minutes
1. **Open the company dashboard** → `/dashboard/company`. If you have no company
   yet it guides you to create one (`/dashboard/start/company`).
2. **Create a need (private draft)** — the "First action" block on the company
   dashboard. It saves a **private draft** (`customer_requests`) and says so
   explicitly; it is not auto-submitted or billed.
3. **Structure the need's required skills**, then **scout** →
   `/dashboard/company/scouting?request=<id>`. If the need isn't structured yet
   it tells you to structure it first; if there are no matching workers yet it
   says so honestly. With matches you see ranked candidates with **why / gaps /
   confirmed-vs-declared** — never a global person score.
4. **Shortlist** — the status buttons (saved / interested / reviewed / not_fit)
   persist per-demand to `demand_shortlist`. They only write your own rows; do
   **not** create fake shortlist rows on prod while testing.

### Manager — first 5 minutes
1. **Open the inbox** → `/dashboard/inbox`. With nothing pending it shows an
   honest empty state (no fake entries).
2. **Confirm a journal entry's skills** — open a pending entry, pick which
   declared skills it proves, submit. This calls the SECURITY DEFINER
   `confirm_entry_and_verify_skills` RPC (already live on prod) and raises those
   skills to the **manager-confirmed** tier. Confirmation is a real human
   decision — nothing is auto-confirmed.

## What to send the owner if something looks wrong
- The **URL** you were on and your **role** (worker / company / manager).
- A **screenshot** of the blank/broken/confusing screen.
- What you **expected** vs. what you **saw** (e.g. "button did nothing").
- Any red error text on screen (copy it verbatim).
- Do **not** send passwords or other people's personal data.

## Known limitations (honest)
- **`work_journal` tier shows 0 on prod today** simply because no worker has
  linked a journal entry to a skill yet — the mechanism is live and fills in the
  moment a real worker does it.
- **Live E2E (Playwright) needs Docker / a local Supabase stack** — it is not in
  the CI-only pass; the static guard + engine tests are the automated net here.
- **Minor polish (non-blocking):** scouting shortlist save shows a generic error
  on failure; the manager RPC returns a generic (not "needs-migration") error if
  the RPC were ever absent — moot on prod where it's applied.
- This guard is **source-level**, not a live browser render — it proves files
  and honest states exist, not pixel layout. Mobile/visual polish is owner-eyes.

## Owner-openable review artifact
`docs/audits/launch-readiness/OWNER_REVIEW.html` — a self-contained checklist
(open it in a browser, no terminal): route list, per-path readiness, exactly
where to click, and the go/no-go. Pairs with the gitignored
`runtime/project-quality/primary-route-smoke-report.html` if you want the raw
route-smoke output.
