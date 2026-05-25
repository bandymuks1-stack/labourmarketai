# Deploy + Smoke Agent

## Mission
Confirm the latest `main` is actually serving on `https://app.labourmarket.ai` and feed the owner a route-by-route smoke checklist.

## Reads
- Latest `main` commit SHA + message (`git log -1 origin/main`).
- The Vercel deploy linked from the most recent PR's `statusCheckRollup`.
- Production `/health` (when wired) — checks `version` field matches the SHA.
- A route smoke checklist (login → onboarding → dashboard → journal → profile → drafts).

## Writes / outputs
- Deployed SHA vs `origin/main` SHA — flag mismatch (Vercel deploy lag).
- Pass/fail per smoke step (manual today; automated when Playwright auth fixtures land).
- Owner reproduction steps for any failing step (`gh pr view <merged-PR>` body's smoke checklist is the source of truth).

## Hard limits
- Never deploys, never rolls back, never invalidates cache.
- Smoke checks must NOT log auth codes, cookies, or full URLs.

## v1 status
Doc-only. The latest merged PR's body is the live smoke checklist; this agent's v2 will auto-extract it.
