# Legacy Vercel Project Retirement — v1 (2026-07-11)

Owner action 1 from `non-landing-launch-repair-final-report-v1.md`, executed
for real via the authenticated Vercel CLI/API session on 2026-07-11.

## Before state (captured prior to any change)

| Property | Value |
|---|---|
| Project name | `labourmarket-ai` |
| Project ID | `prj_jfas1luytfA6XOM2gCXUh28AH0TL` |
| Team / account | `bandymuks1-6851's projects` (`team_9I08cH4MYemR80sA8I04Qs7T`) |
| Created | 2026-05-18 (53 days before removal) |
| Framework | Next.js |
| Git link | GitHub `bandymuks1-stack/labourmarket.ai` (the OLD repo — not `bandymuks1-stack/labourmarketai`) |
| Domains attached | `labourmarket-ai.vercel.app` only (the project's default domain — not an alias of any other project) |
| Custom domains | none |
| Production env vars | none |
| Integrations | none observed on the project object |
| Production deployment | `dpl_D9rP4vsnJLtCJWFvcK9Z4ynnWM8e` (READY, 2026-05-18) |
| Content served | gated "Sign in to review the new labourmarket.ai" build with old "Labour Market Operating System" branding |

The current production project is separate and was verified before the
change: `labourmarketai` (`prj_ZbFhWTGNX3kNP1ztujit9INvlnIC`), linked to
GitHub `bandymuks1-stack/labourmarketai`, holding `labourmarket.ai`,
`www.labourmarket.ai`, `app.labourmarket.ai` and `labourmarketai.vercel.app`.

## Classification and action taken

Scenario A (isolated, unneeded legacy project): the project served only its
own default `*.vercel.app` domain, had no custom domains, no env vars, no
integrations, and pointed at the retired GitHub repo. Deletion permanently
removes the public address of the old product — the default project domain
cannot survive project deletion, and no other alias for the old build
exists.

Action: `DELETE /v9/projects/labourmarket-ai` (by name, after an automated
pre-delete re-verification that the target was NOT the production project,
had no production domains and no env). Result: **HTTP 204 — deleted**.

Pre-delete safety checks (all PASS): name = `labourmarket-ai`; id ≠
production id; git repo = old `labourmarket.ai` repo; env vars = 0; domains
= exactly `labourmarket-ai.vercel.app`; no production custom domain
attached.

## After state — production smoke (2026-07-11, real HTTP checks)

| Check | Result |
|---|---|
| `https://labourmarket.ai/` | 200, no `Labma` / `Construction OS` / `Labour Market Operating System` content |
| `https://www.labourmarket.ai/` | 308 → `https://labourmarket.ai/` |
| `https://app.labourmarket.ai/` | 200 |
| `https://app.labourmarket.ai/lt/auth/login` | 200 |
| `https://labourmarket-ai.vercel.app/` | **404 Vercel `DEPLOYMENT_NOT_FOUND`** — old product no longer served, no replacement alias |
| `https://labourmarket.ai/sitemap.xml` | 200, 130 URLs, lt/en/ru/nl/de present, no dashboard/admin/auth URLs |
| Production project `labourmarketai` | HTTP 200, id unchanged, all 4 domains still attached |
| Deleted project lookup | HTTP 404 (confirmed gone) |

Untouched, verified after the change: `labourmarket.ai`,
`www.labourmarket.ai`, `app.labourmarket.ai`, the `labourmarketai`
production project and its env vars, Supabase, production DB, Stripe.

## Rollback

Vercel project deletion is not reversible in place, but the old build is
not lost: the source remains in GitHub `bandymuks1-stack/labourmarket.ai`.
If the old review build were ever needed again, re-import that repo as a
new Vercel project (it would receive a new `*.vercel.app` domain). No
production system depends on the deleted project, so no rollback path is
required for current operations.
