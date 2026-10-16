# Production smoke test — 20 minutes (controlled release, 2026-10-16)

Run AFTER hosting is restored and AFTER each merge step in
`RELEASE_PREPARATION_2026-10-16.md` §A (steps 1–9 in full after the last one;
the two-minute block 0 after every single merge). Walk with the sanctioned
synthetic worker (`qa.worker+goal3`, the `prod-qa-*` chain) — never with a real
person's account. Record PASS / FAIL / BLOCKED per row with the time; a FAIL in
block 0, 1 or 7 is a rollback trigger (`git revert` of the last merged PR).

Prerequisites: the apex answers; a superadmin account; `psql`-free read access
through Supabase MCP for rows 6.2 and 9 (read-only SQL only); the merged SHA.

| # | Minute | Step | Where | Expected | Rollback trigger? |
|---|---|---|---|---|---|
| 0.1 | 0–1 | `curl -s https://labourmarket.ai/api/health` | apex | HTTP 200, `ok: true`, `build` = the merged SHA (a deploy that did not happen keeps the old build) | yes |
| 0.2 | 1–2 | `curl -sI https://app.labourmarket.ai/lt/dashboard` | app host | 307/302 to `/auth/login` for an anonymous request (not 500) | yes |
| 1.1 | 2–4 | Sign in as the QA worker; open `/lt/dashboard/journal` | app | Composer renders; the work-date control refuses tomorrow (max = today) and accepts yesterday — #2432 | yes |
| 1.2 | 4–5 | Edit (supersede) an existing entry and try a future date | journal | Refused on the supersede path too (#2432 fix `72c868f8`) | yes |
| 2 | 5–7 | Chat: `nuo 8 iki 17, 30 min pertrauka` | `/lt/dashboard` chat | A journal draft with three time metrics (start, end, break) on the entry after confirmation — #2432 | no |
| 3.1 | 7–8 | Chat: `turiu 30 kg agurkų parduoti` | chat | The listings chip / Goods route appears; nothing saved until published — #2434 | no |
| 3.2 | 8–9 | Chat: `pagaminome 500 palečių` | chat | The Goods line, not a workforce reading — #2434 | no |
| 3.3 | 9–10 | Listings page with a forced read error (owner-side: temporarily revoke, or use the documented test switch) — skip if no safe switch exists | `/lt/dashboard/listings` | "could not be read right now" copy, never an empty board — #2434 | no |
| 4.1 | 10–11 | `curl -sI -H 'Accept-Language: sv-SE' https://labourmarket.ai/` | apex | 307 to `/en` — #2435 | no |
| 4.2 | 11 | `curl -sI -H 'Accept-Language: sv-SE,de;q=0' https://labourmarket.ai/` | apex | 307 to `/en` (only with the #2435 q=0 patch; without it `/de`) | no |
| 4.3 | 11–12 | `curl -s https://labourmarket.ai/en/about \| grep x-default` | apex | `hreflang="x-default"` → `/en/...` — #2435 | no |
| 5.1 | 12–13 | Privacy notice section on AI and browser storage; cookies page | `/lt/privacy`, `/lt/cookies` | The new wording (what AI receives today; what browser storage holds) — #2436 | no |
| 5.2 | 13–14 | Admin privacy queue | `/lt/dashboard/admin` | The open request (received 2026-10-14) shows a due date: **2026-11-13** with #2436 as pushed, **2026-11-16** with the calendar-month patch applied; not overdue today — #2436 | no |
| 6.1 | 14–15 | Project card and stadium with one project whose reads fail or are empty | `/lt/dashboard/projects/[id]` | "unknown" / "not measured" states, never `0` — #2437 | no |
| 6.2 | 15–16 | Read-only SQL: `select count(*) from ai_runs where created_at > now() - interval '24 hours' and blocked_reason is null and provider_failure like 'unsupported: data egress gate%'` | Supabase MCP | 0 rows; and `usage_cost_events` has no `status='error'` rows from refusals — #2433 | no |
| 7 | 16–17 | One chat action that needs a confirmation (e.g. rename a workspace object), confirm it | chat | The confirmation succeeds once and is refused on replay — proves `CONVERSATION_TOKEN_SECRET` is set (#2444); a named refusal means the variable is missing → rollback #2444 | yes |
| 8 | 17–18 | Account → billing section | `/lt/dashboard/account` | Shows the honest state the owner chose in N-1 (disabled statement, or live with the second act off: no new checkout) — nothing here may start a charge | yes if a checkout can start |
| 9 | 18–19 | Read-only SQL: counts of `billing_subscriptions`, `payment_webhook_events`, `billing_checkout_operations where status='open'` | Supabase MCP | Unchanged from the pre-release baseline (0 / 0 / 2) unless the owner ran the live webhook proof | no |
| 10 | 19–20 | `GET /api/health` again; mobile viewport sanity on the journal page (375 px) | apex / app | 200 with the same build; tap targets ≥ 44 px (#2445 is the hosting agent's — not asserted here) | no |

Outcome line to record: `SMOKE <date> <sha> PASS|FAIL rows=<list of FAIL/BLOCKED>`.
Block 3.3 and 6.1 need a safe way to force a read failure; if none exists, mark
BLOCKED (not FAIL) and keep the merged state.
