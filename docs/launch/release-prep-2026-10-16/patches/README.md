# Release-prep patches (2026-10-16)

Reviewer-finding fixes prepared during controlled-release preparation. They are
NOT pushed to the pull-request branches (this session may push only to its own
branch); each is a plain `git diff` against the PR head listed below, verified
locally with the PR's own tests.

| Patch | PR | Base head | Finding it answers | Local proof |
|---|---|---|---|---|
| `2435-entry-locale-q0.patch` | #2435 | `96a82469` | Codex P2: `Accept-Language: sv-SE,de;q=0` must not count the refused `de` as a routed match (RFC 9110 §12.4.2) | `vitest lib/i18n/entry-locale.test.ts` 7/7 |
| `2436-dsr-calendar-month.patch` | #2436 | `a8516857` | Codex P1: Art. 12(3) "one month" is a calendar month (EDPB 01/2022 §5.1), not 30 days; weekend → next Monday | `vitest lib/privacy/dsr-deadline.test.ts lib/admin/privacy-requests.test.ts` 21/21 |
| `2444-local-harness-secret.patch` | #2444 | `18abe067` | Codex P2: `dev:acceptance` / `e2e:local` must supply a local-only `CONVERSATION_TOKEN_SECRET` now that the service-role fallback is gone | `vitest lib/guards/confirmation-token-secret-required.test.ts` 3/3 |
| `2438-future-date-guard-pending.patch` | #2438 | `70bd76af` | Codex P1: the spec said the future-date guard is enforced on every transport; it is pending #2432 | docs only |

Apply on a checkout of the PR branch:

```bash
git checkout <pr-branch>
git apply docs/launch/release-prep-2026-10-16/patches/<file>.patch
pnpm -F web exec vitest run <the test files above>
```

The #2436 patch changes the due date the admin queue shows for the request
received 2026-10-14 08:53 UTC: 30-day rule → 2026-11-13; calendar-month rule
→ 2026-11-14 (a Saturday) → **Monday 2026-11-16**. The public-holiday
extension stays a human reading in the review note.
