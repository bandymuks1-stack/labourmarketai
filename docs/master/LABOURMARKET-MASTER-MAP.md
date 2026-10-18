# LABOURMARKET-MASTER-MAP

The one-page map of the whole system: what exists, how it fits together, and where it is fragile.
Companion documents: [FUNCTIONAL-AUDIT](LABOURMARKET-FUNCTIONAL-AUDIT.md) (what really works) ·
[IMPROVEMENT-OPPORTUNITIES](LABOURMARKET-IMPROVEMENT-OPPORTUNITIES.md) (critical review) ·
[EXECUTION-ROADMAP](LABOURMARKET-EXECUTION-ROADMAP.md) (what to do, in which order).

**Public-safe by design.** Production data, security evidence and sensitive infrastructure detail live in
the owner's private annex, never here. **Living document:** it is rewritten when a capability changes
state, and `apps/web/lib/guards/master-map-register-sync.test.ts` fails CI when the register snapshot
below no longer matches the capability register.

> Register snapshot: 111 capabilities — BUILT_AND_USABLE 34 · PARTIAL 69 · BUILT_NOT_CONNECTED 1 · BLOCKED 2 · ARCHITECTURE_ONLY 2 · MISSING 2 · RETIRED 1

Last full audit: 2026-10-18 (main `fb741339a`).

---

## 1. What LabourMarket.ai is

One labour/work graph (28 nodes, `docs/OWNER_TARGET_ARCHITECTURE_V1.md`):

```
REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH → EXECUTION → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION
```

It must never be narrowed into a job board, recruitment site, staffing marketplace, CV builder, timesheet
app, workforce planner, evidence database, qualification platform, booking calendar or chatbot — each is
one edge of the graph (`node .github/scripts/product-truth.mjs`).

## 2. High-level architecture

```mermaid
flowchart LR
  subgraph Clients
    W[Web app — Next.js, 6 locales]
    M[Native app — Expo / React Native]
    A[AI clients — MCP over OAuth]
  end
  subgraph App["apps/web (VPS, Docker, behind Cloudflare)"]
    CHAT[Chat-first control plane<br/>action + intent registries, dispatch, confirmations]
    PAGES[Pages: journal, planning, profile, company doors, market map, admin]
    MCP[/api/mcp — 229 tools/]
    CAPS[lib/capabilities — one authorization spine]
    DOM[Domain modules: journal, projects, demand, market, privacy, billing, …]
  end
  subgraph Data["Supabase (Postgres + Auth + Storage)"]
    RLS[(236 tables, RLS on all)]
    RPC[(SECURITY DEFINER doors)]
    AUTH[Auth + OAuth 2.1 server]
    ST[(6 private buckets)]
  end
  EXT[Integrations: Stripe · job feeds SE/NO · ESCO · AI providers · e-mail · Cloudflare]
  W --> CHAT & PAGES
  M --> MCP
  A --> MCP
  CHAT --> CAPS
  PAGES --> DOM
  MCP --> CAPS --> DOM
  DOM --> RLS & RPC & ST
  W & M & A --> AUTH
  DOM --> EXT
```

### Main user flows

```mermaid
flowchart TD
  P[Person] -->|records work: text, photos, voice*| J[Work Journal]
  J -->|organization confirms| E[Evidence + confirmation state]
  E --> CV[Living CV / Player card / Work in numbers]
  CV -->|consented, anonymous| D[Employer discovery & scouting]
  ORG[Company / agency] -->|demand| DM[Needs, vacancies, team offers]
  DM --> MATCH[Matching + shortlist] --> CT[Contact: anonymous thread → per-company disclosure]
  CT --> BK[Booking / engagement / project assignment]
  BK --> J
  ORG -->|history import| H[Organization history] --> CV
```
`*` voice depends on a transcription host (dormant).

## 3. Modules (apps/web/lib)

| Layer | Modules | Notes |
|---|---|---|
| Control plane | `conversation/*` (action registry 58 actions, intent registry, dispatch, confirmation tokens), `capabilities/*` (229 MCP tools), `mcp/*` | One spine for chat, pages and agents |
| Person | `journal/*`, `profile/*`, `cv`, `player-card/*`, `worker/*`, `evidence/*`, `trust/*`, `skills/*` | `journal/professional-experience.ts` is the one history (decision 0025) |
| Organization | `company/*`, `organizations/*`, `projects/*`, `planning/*`, `tasks/*`, `work-hours/*`, `timesheets/*`, `organization-evidence/*`, `organization-people/*` | Workspace resolved server-side |
| Market | `demand/*`, `market/*` (match-v1), `scouting/*`, `marketplace/*`, `booking/*`, `services/*`, `market-map/*`, `vacancy-*` | Anonymous discovery; identity by disclosure |
| Trust & privacy | `privacy/*` (consents, disclosures, export, erasure plan), `visibility/*`, `security/*`, `limits/*` | Consent registry is hashed and versioned |
| Commercial | `billing/*` (plans, entitlements, Stripe), `lmc/*` | Charging not armed |
| Education | `education/*`, recognitions | RPL structure deferred |
| Platform | `i18n/*`, `seo/*`, `ai/*` (runtime, egress guard), `notifications/*`, `email/*`, `guards/*` (hundreds of architecture tests), `product-gate/*` | |

## 4. Data, access and consent boundaries

- **236 tables, row-level security on every one.** Writes go through owner-scoped policies or
  SECURITY DEFINER functions that re-check authority (`manages_organization`, `can_manage_project`,
  `can_view_worker`, `owns_worker`). Anonymous callers reach only an explicit allowlist.
- **Identity vs discovery.** A worker found through the employer-visibility consent is anonymous; their
  identity reaches one organization only through the worker's own per-organization disclosure
  (decision 0027, PROPOSED with RED #2477).
- **Consents** (`lib/privacy/consent-definitions.ts`): `profile_discoverability`, `employer_data_disclosure`,
  `partner_supply_representation` — each versioned and hash-pinned in the database.
- **Migrations:** 401 files in the repo (35 legacy-numbered, the rest timestamped), each with a rollback;
  risky ones are human-gated (`.github/scripts/migration-safety.mjs`). Production applies happen only via
  the Supabase MCP tool after owner approval — never `db push` (the ledger and file names differ).
- **Auth:** e-mail + Google live; LinkedIn and Facebook switched off; the same Auth service is the OAuth
  server for MCP clients.

## 5. Delivery and operations

| Step | How |
|---|---|
| Change | PR → Quality Gates (typecheck, lint, build, unit tests incl. guards) + migration-safety + e2e smoke + CodeQL |
| Merge | GREEN class: auto-merge (squash). RED class: draft + `needs-human-gate`, owner approval |
| Deploy | `deploy-vps.yml` after Quality Gates passes on `main` → VPS (Docker) with health-gated rollback |
| Database | migrations applied separately by the owner-approved MCP step |
| Production proof | `prod-qa-walk.yml`: synthetic cast walks real production (budget 12 runs / 24 h) |
| Scheduled jobs | VPS cron (digest, job alerts, handoffs) + GitHub cadences (vacancy feeds, retention, health probe) |
| Mobile | `android.yml`, `ios.yml`, `mobile.yml` (builds and emulator journeys; store signing is owner-only) |

## 6. Single points of failure (summary)

One application host; one database project on a free tier (no point-in-time restore); one complete copy
of runtime secrets; GitHub as CI, deploy, scheduler and alert channel at once; many owner-only actions
(DNS, Stripe, stores, secrets, RED approvals); one person plus agents. Details and mitigations: roadmap
P0/P1 and the private annex.

## 7. Blast-radius modules (a change here can break many features)

`can_view_worker` / `caller_has_worker_relation_v1` · `manages_organization` · `lib/conversation/dispatch.ts`
· `lib/capabilities/registry.ts` · `lib/billing/entitlements*` · `lib/journal/professional-experience.ts` ·
`lib/company/active-organization.ts` / `getWorkspaceContext` · `lib/privacy/consent-definitions.ts` (hash pins)
· `lib/market/match-subject.ts` · `components/app/conversation/chat/conversation-chat.tsx` (≈8.3k lines) ·
`lib/i18n/*` · `middleware.ts` · `app/[locale]/dashboard/layout.tsx` (role gates) · migration guards with
pinned counts. Every one of them is covered by guards; change them only with the canonical §12 review.

## 8. How to keep this map true

1. When a capability changes state, update `apps/web/lib/product-gate/capability-register.ts` and the
   snapshot line at the top of this file in the same PR (the sync guard enforces it).
2. When a production walk proves or breaks a feature, update the FUNCTIONAL-AUDIT row and its evidence.
3. When the owner decides, move the item in the EXECUTION-ROADMAP and record the decision under `docs/DECISIONS/`.
