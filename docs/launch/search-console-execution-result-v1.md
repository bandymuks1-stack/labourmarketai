# Search Console Execution Result — v1 (2026-07-11)

Owner action 3 from `non-landing-launch-repair-final-report-v1.md`.
Honest execution record: what was really done, what is BLOCKED and exactly
why. No screenshots, no account data, no secrets.

## Access check (performed first, exhaustively)

An authenticated Google session is required for every Search Console
operation (property check/creation, sitemap submission, URL inspection,
removals). On 2026-07-11 the execution environment had:

- Claude-in-Chrome browser extension: **no connected browser** (empty list);
- `gcloud` CLI / OAuth application-default credentials: **not installed / none**;
- Google service-account JSON or Search Console API keys in the repo,
  `agantai` secure env, or user config dirs: **none found**;
- No safe DNS management access for a TXT verification record
  (nameservers are third-party per the Vercel domain record).

→ Every action that happens INSIDE Search Console is
**BLOCKED_EXTERNAL_INPUT_REQUIRED** (owner must either connect the Chrome
extension with their Google session, or provide Search Console API
credentials). Nothing was faked; no property state can even be read.

## Status ledger (SUBMITTED vs INDEXED distinction preserved)

| Item | State | Evidence |
|---|---|---|
| Domain property `labourmarket.ai` exists/verified | **UNKNOWN — BLOCKED** (cannot read GSC without a session) | — |
| Property creation + verification | **BLOCKED** (needs Google session; DNS TXT also unavailable) | — |
| Sitemap submission to GSC | **NOT SUBMITTED — BLOCKED** | — |
| Sitemap readiness (prerequisite) | **VERIFIED LIVE 2026-07-11**: `https://labourmarket.ai/sitemap.xml` → HTTP 200, 130 URLs, all canonical apex (`https://labourmarket.ai/...`), locales lt/en/ru/nl/de present, zero dashboard/admin/auth URLs | real HTTP fetch |
| URL inspection for canonical pages (`/`, `/lt`, `/en`, `/ru`, `/nl`, `/de`, `/lt/for-workers`, `/lt/for-companies`, `/lt/for-agencies`, `/lt/pricing`, `/lt/company-need`) | **NOT PERFORMED — BLOCKED** (GSC-only tool). All 11 URLs verified live-reachable (200) by the launch-repair production smoke; index state remains UNKNOWN | — |
| Removal requests | **NONE SUBMITTED — BLOCKED**. Removal precondition NOW satisfied for the legacy host: `labourmarket-ai.vercel.app` returns **404 `DEPLOYMENT_NOT_FOUND`** since the legacy Vercel project deletion (2026-07-11, see `legacy-vercel-project-retirement-v1.md`), so any indexed legacy URLs are removal-eligible and will also drop out naturally on recrawl | real HTTP fetch |
| Public search spot-check | Indicative only: web search for `site:labourmarket-ai.vercel.app` and `site:labourmarket.ai` surfaced no indexed pages from either host (not an authoritative index read — GSC required for that) | search tool, 2026-07-11 |

## What Google is still expected to process (after the owner unblocks)

1. Property verification (instant once done in GSC with the owner account).
2. Sitemap: SUBMITTED → DISCOVERED → INDEXED takes days–weeks; do not
   treat submission as indexing.
3. Legacy `labourmarket-ai.vercel.app` URLs: natural de-indexing via 404,
   or faster via Removals once the property covers it (a `vercel.app`
   subdomain needs its own property or the URL-prefix removal flow —
   verify eligibility in the Removals tool).

## Exact owner unblock (one of two)

- **Option A (fastest, recommended):** open Chrome with the Claude-in-Chrome
  extension connected, log in to Search Console, and re-run this task —
  the agent can then create/verify the domain property (DNS TXT will be
  shown by Google; add it at the DNS provider), submit
  `https://labourmarket.ai/sitemap.xml`, run the 11 URL inspections, and
  file eligible removals.
- **Option B:** provide a Google service account with Search Console API
  access (property must first be verified by the owner once) — the agent
  can then automate sitemap submission and inspection via the official API.

Until GSC confirms, the index state is UNKNOWN — this document makes no
claim that any URL is indexed or removed.
