# Live Tester Feedback Ledger — v1

**Purpose:** capture every real tester session (who, device/language/browser,
login path, exact steps, what worked, where they got stuck, dead taps, unclear/
fake-looking states, exact comments + screenshot/video refs). Source of truth for
the smoke-fix PR train.

**Privacy (binding):** no passwords, tokens, OAuth secrets, Supabase keys,
cookies, private messages, or payment data. Tester aliases unless the owner gives
a real name. Only UX-debugging fields (alias, persona, language, device, browser,
approx country/city, time, route, action, result, comment, evidence ref).

**Rule:** events are recorded ONLY from real owner/tester comments, screenshots,
videos, logs, or observed app behavior. Nothing is invented.

---

## Capture defaults (owner-set)

- **App URL:** https://app.labourmarket.ai (production)
- **Tester identity:** aliases by default — `Tester-01`, `Tester-02`, `Tester-03`,
  `Tester-04` — real names only if the owner explicitly provides them.

## Current state (pre-feedback baseline)

- Integration train **PR3–PR12 merged** to `main` (see
  [`first-launch-final-smoke-and-blockers-v1.md`](./first-launch-final-smoke-and-blockers-v1.md)).
- **NOT** declared FIRST-LAUNCH READY — waiting on owner/tester live authenticated
  smoke + the external OAuth consent-branding P0.
- All 11 canonical surfaces reachable with honest states; 6064 tests green.

## Capture status

> **No tester sessions captured yet — awaiting live tester comments / screenshots.**
> As the owner forwards tester notes, each becomes one `## Tester <alias>` block
> below, one JSONL line in `runtime/launch-smoke/live-tester-feedback.jsonl`, and
> (if P0/P1) a row in `runtime/launch-smoke/owner-next-fixes.md`.

| Sessions captured | P0 | P1 | P2 | Later |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 |

---

## Canonical surfaces (every item maps to exactly one)

Dashboard · Diary/Journal · Calendar/Bookings · Marketplace · Company/Player Card ·
CV/Profile · Skills · Reports/Documents · Map · Opportunities/Matching ·
Account/Admin/Paid Pilot · OAuth/External Auth Branding

## Severity legend

- **P0** — blocks a tester from continuing or destroys trust (cannot enter app,
  main CTA dead, save fails, data lost on reload, can't understand the app,
  serious fake-looking state).
- **P1** — important launch issue, not a total blocker (unclear labels, hidden
  feature, confusing flow, missing post-action feedback, unexplained recognition).
- **P2** — polish (spacing, copy, icon clarity, card order, small mobile friction).
- **Later** — good idea, not required for the first manual paid pilot.

---

## Session template (copy per tester)

```
## Tester <alias> — <date/time>

### Context
- Tester:
- Role/persona:
- Language:
- Device:
- Browser:
- Start route:
- Auth method:
- Production/local:
- Screenshot/video refs:

### Step-by-step path
| Step | Route/screen | Action | Expected | Actual | Status | Severity |
|---|---|---|---|---|---|---|

### What worked
-

### What the tester understood
-

### What confused the tester
-

### Dead taps / slow opens / unclear actions
-

### Feature-specific notes
- Login/Auth:
- Dashboard/MyZone:
- Diary/Journal:
- Calendar/Bookings:
- Marketplace:
- Company/Player Card:
- CV/Profile:
- Skills:
- Reports/Documents:
- Map:
- Opportunities/Matching:
- Account/Admin/Paid Pilot:

### Fix classification
- P0:
- P1:
- P2:
- Later:

### Recommended PR(s)
-
```

---

## Captured sessions

_(none yet — awaiting live tester comments)_
