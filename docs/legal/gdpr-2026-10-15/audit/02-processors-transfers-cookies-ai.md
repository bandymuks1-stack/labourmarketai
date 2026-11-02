# LabourMarket.ai — third-party data flows, storage, and ADM audit (GDPR documentation input)

- **Date:** 2026-10-15
- **Checkout:** `recursing-morse-a88402`, detached at origin/main `063f864fb`. Read-only: nothing was edited or committed.
- **Method:** I read code and config, plus repo docs where code cannot show a production env value. Env var **names** only; no secret values were read.
- **Production env values are not visible from the repo.** Where "active in production" depends on an env value, the status below says where that claim comes from: a repo doc, owner evidence, or "not evidenced".
- **Paths:** relative to the repo root unless noted. `web/` = `apps/web/`. Message-catalog lines are given for `web/messages/en.json`. `lt.json` has the same strings at the same line numbers (spot-checked at 5684, 5726, 5756, 5824, 5825).

---

## 1. External services and processors

### 1.1 Summary table

| # | Service | Purpose | Personal data sent | Active in prod? (evidence) | Role (working) | Location / transfer | Transfer mechanism evidenced in repo? |
|---|---|---|---|---|---|---|---|
| 1 | **Supabase** (DB, Auth/GoTrue, Storage, OAuth 2.1 server for MCP) | All persistence, sign-in, files, OAuth grants for ChatGPT/Claude | Everything: accounts, profiles, CVs, journals, messages, documents, absence, ledgers, transcripts, pilot_events telemetry | Yes. `web/lib/env.ts:40-43` (project URL default) | Processor | eu-west-1 per register v2:22. The repo only shows the project ref; the region is asserted in docs, not config. US parent. | **Not evidenced.** Register says DPA "VERIFY" (v2:22, v2:51) |
| 2 | **Vercel** | Hosting, serverless functions, middleware, crons, logs | Request metadata, IP, auth cookies (JWT incl. email) passing through middleware, server logs (MCP logs are designed id-free, `web/app/api/mcp/route.ts` header comment) | Yes. `vercel.json` `regions: ["dub1"]`, crons `weekly-digest`, `commercial-handoffs` | Processor | Functions in Dublin. **Middleware has no `runtime` override** (`web/middleware.ts:398` config only), so on Next 15 it runs on Vercel's Edge network at the PoP nearest the visitor, which can be outside the EEA. US company. | **Not evidenced** (v2:23 "DPA accepted" is a VERIFY item) |
| 3 | **Google Gemini API** (`generativelanguage.googleapis.com`) | `translate_message`, `propose_conversation_intent` (personal free text); `explain_market_demand` (PUBLIC aggregates) | Message body ≤8000 chars + locales; one typed chat sentence + locale + coarse role ("identity") + intent catalogue (`web/lib/ai/runtime/task-routing.ts:339,420`) | Yes. Live calls since 2026-08-28 (register v2:6). In the last 30 days: 236 translations and 33 intent calls (`docs/ai/LOCAL_LLM_EVALUATION_2026-10-15.md` §2.3). **Since #2399, the two personal-data grants only apply while `AI_GEMINI_PAID_TIER_CONFIRMED=1` is set, and that variable is NOT set** (`docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md:11`). So today only PUBLIC `explain_market_demand` runs. | Processor **only if** on the paid tier. On the free tier Google uses content to improve its products, so it is not a processor. **Tier unverified:** 83× `429 RESOURCE_EXHAUSTED … check your plan and billing` (same doc :15) | Google global infra; region not pinned | **Not evidenced.** DPA / paid tier are owner VERIFY items |
| 4 | **Stripe** | Organisation subscription checkout, customer portal, Stripe Tax | Account email (`customers.create` email + `owner_id` UUID metadata, `web/lib/billing/providers/stripe-test.ts:197-203`, `web/lib/billing/metadata-core.ts:29-35`). Checkout collects **billing address (required), tax/VAT id, name** (`stripe-test.ts:166-172`), card data (direct to Stripe). Org id and plan in metadata. | Yes. `billing_customers` rows exist (register v2:7); owner memory notes live-mode customers. Worker Plus and Agency plans are deferred (`web/lib/billing/plans.ts:39`). | Mixed: processor plus independent controller (register v2:25) | Stripe Payments Europe (IE), global group | **Not evidenced** (VERIFY) |
| 5 | **Resend** (Supabase Auth custom SMTP), routed via Amazon SES eu-west-1 | Sign-up confirmation and auth e-mails from `noreply@labourmarket.ai` | Recipient email address, confirmation link/token, e-mail content | **Yes, since 2026-09-02:** `docs/audits/evidence/final-completion/g1-resend-smtp-state-2026-09-02.md:5` ("Supabase Custom SMTP ENABLED: smtp.resend.com … sender noreply@labourmarket.ai") | Processor (sub-processor of the auth flow) | Resend Inc. is a US company; sending is SES eu-west-1 per DNS (same doc :7) | **Not evidenced** |
| 5b | Resend / Postmark, app-level transactional (`web/lib/email/transactional.ts:104,118`; env `INVITE_EMAIL_PROVIDER/API_KEY/FROM`) | Invitations, notification e-mails, weekly digest | Recipient email, subject, body | **Not active.** `email_send_ledger_v1` is empty (register v2:44); repo docs say the env is unset | Would be processor | — | — |
| 6 | **Hostinger** (mailbox) | Inbound mail for `info@labourmarket.ai`, the published privacy contact (`en.json` privacy "Privacy contact") | Data-subject requests and any correspondence | Yes. Root MX `mx1/mx2.hostinger.com` (g1 evidence :8) | Processor | Hostinger (LT/EU), but this needs verifying | **Not evidenced** |
| 7 | **Google OAuth** (via Supabase) | "Continue with Google" | Google returns openid/email/profile: email, name, picture URL, Google subject id. Supabase stores these in `auth.users.raw_user_meta_data`. **No custom scopes are requested:** `signInWithOAuth({ provider, options:{ redirectTo } })`, `web/components/app/google-button.tsx:221-225`, so Supabase defaults apply | Yes. Only Google is enabled. LinkedIn (`linkedin_oidc`) and Facebook are coded but disabled (`web/lib/auth/enabled-providers-core.ts:31-35`, prod truth 2026-08-31) | Independent controller | Google | n/a (the user's own relationship with Google) |
| 8 | **OpenStreetMap Foundation tile servers** (`tile.openstreetmap.org`) | Market-map base tiles | **Viewer IP, User-Agent, Referer, map viewport/area** (the browser fetches tiles directly) | Yes, wherever the map renders: `web/components/app/market-map/leaflet-engine.ts:24` (dashboard market map, focus landing) | Independent recipient or processor-like, depending on analysis. OSMF has a tile usage policy, not a DPA | OSMF is in the UK (adequacy decision exists) | **Not evidenced / not documented anywhere** |
| 9 | **Telegram**, either direct or via the **Agentai OS bridge** | Owner alert on a persisted `/company-need` intake | Company name, **contact** (a B2B contact person), sector, country, city, headcount, dates, languages, source path; each capped at 120 chars (`web/lib/notifications/telegram-owner-alerts.ts:38-52`) | Unknown. Off by default. Env: **`OWNER_TELEGRAM_ALERTS_ENABLED` + `OWNER_TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_CHAT_ID`**, or the preferred path **`AGENTAI_OS_ALERTS_ENABLED` + `AGENTAI_OS_ALERT_ENDPOINT` + `AGENTAI_OS_ALERT_TOKEN`** (`web/lib/env.ts:143-157`) | Processor-like channel. Agentai OS is a separate owner-run system; its hosting is not evidenced | Telegram infra (non-EEA) | **None** (Telegram offers no DPA) |
| 10 | **Browser speech vendors** (Web Speech API: Google for Chrome, Apple for Safari) | Dictation in the command finder | The user's audio, sent by the browser to the vendor | Yes, opt-in per browser. `web/components/app/command-finder.tsx:107-121`, disclosure `commandFinder.voiceConsentText` | The browser vendor is an independent controller. The platform starts the flow but does not transmit the audio itself | Vendor infra | n/a. Disclosed in context; **not in the privacy policy** |
| 11 | **Self-hosted whisper.cpp** (`services/transcribe`, env `VOICE_TRANSCRIBE_URL`, `VOICE_TRANSCRIBE_TOKEN`) | Voice Work Journal speech-to-text | Audio ≤25 MB, sent from the browser straight to the service with a single-use token (`web/next.config.ts:72-80`, `services/transcribe/README.md`) | Doubtful. Memory 2026-10-08 says "no transcription host now". It is off unless both env vars are set | Our own infrastructure, **but whoever hosts the VM/container is a processor**. That host is not evidenced | Unknown | Unknown |
| 12 | **Self-hosted LibreTranslate** (`services/translate`), local OpenAI-compatible LLM (`AI_LOCAL_*`) | Translation / LLM without egress | — | **Not deployed** (GEMINI_SAFE_OPERATION §3; `LOCAL_LLM_EVALUATION` §3.2) | — | — | — |
| 13 | Anthropic, OpenAI, xAI, DeepL, Cloudflare Workers AI, LibreTranslate-cloud | Registered AI adapters (`web/lib/ai/runtime/providers/*.ts`) | — | **Not active.** 0 production runs (register v2:42-43). Each provider is double-gated by an enable flag plus a key (`web/lib/env.ts:98-119`). Even if one were enabled, the egress gate would let it receive only PUBLIC data, because the grant table names only Gemini (`web/lib/ai/runtime/data-egress.ts:130-173`) | — | — | — |
| 14 | **MCP / ChatGPT / Claude connector** (`web/app/api/mcp/route.ts`, OAuth via Supabase OAuth server, `web/app/.well-known/oauth-protected-resource`) | The person's own AI assistant calls ~92 capability tools (229 per memory) under the caller's RLS | **Whatever the caller is allowed to read**, including **other people's data** when the caller is an employer or manager: `candidate.search` (`web/lib/capabilities/marketplace-capabilities.ts:69`), `roster.list` (`employer-operations-capabilities.ts:366`), `absence.review`, journal review queue (`domain-action-capabilities.ts:630-652`), `people.ingest.*`, `shortlist.get`, `evidence.people.list`. Inbound: ChatGPT file download URLs fetched server-side (`web/lib/organization-evidence/fetch-source-file.ts`) | Yes. Memory: prod 229 tools, ChatGPT connector live | Assistant provider = independent controller (or the organisation's own processor). **Where an employer connects it, the data subjects whose data flows (workers) did not choose that recipient.** | OpenAI / Anthropic (US) | n/a for the platform, but see discrepancy D4 |
| 15 | **Arbetsförmedlingen JobTech** (SE), **NAV pam-stilling-feed** (NO) | Inbound public vacancies | Inbound, not outbound. Employer name and org number (a sole trader's number is personal data) and **free-text descriptions that can contain named contact persons, e-mails and phones**. The SE parser stores the description (`web/lib/vacancy-sources/providers/arbetsformedlingen-parse.ts:205-249`). NAV `contactList` is **never read or stored** (`nav-parse.ts:22-23`) | SE: yes (cadence workflow). NO: live since 10-08 per memory (`.github/workflows/nav-supply-cadence.yml`) | The platform becomes controller of what it stores (Art. 14 duties); the agencies are sources | Inbound from SE/NO (EEA) | n/a |
| 16 | **GitHub** (repo, Actions, Issues) | Code, CI, scheduled jobs | CI holds `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `CRON_SECRET`, `VACANCY_SOURCE_NAV_API_TOKEN`, and `SUPABASE_DB_URL` (optional). **What CI actually reads from prod:** aggregate metrics RPC, `ai_runs` latency/cost columns, `vacancy_import_cursors` (`web/lib/ops/product-metrics.ts:166-199`, `.github/workflows/ingestion-freshness.yml:65-74`). Prod-QA walk uses synthetic identities (`prod-qa-walk.yml:64-65`). Supply cadences **write** vacancy data to prod from GitHub-hosted runners. `product-monitor.yml` opens Issues containing aggregate readings only | Yes | Processor. Its runners can technically reach all production data through the service-role key | US (GitHub-hosted runners) | **Not evidenced** |
| 17 | IndexNow (`api.indexnow.org`) | Search-engine ping | Public URLs only | **Dormant:** `submitIndexNow` has no caller (`web/lib/answer-engine/indexnow.ts`; grep finds no importer); needs `INDEXNOW_KEY` | — | — | — |
| 18 | Eurostat, Statistics Lithuania, data.europa.eu, ESCO | Inbound reference statistics | None | Yes | — | — | — |
| 19 | Waze (`waze.com/ul`) | Outbound link only, on the user's click (`web/lib/maps/waze.ts:30-32`) | Destination lat/lng in the URL, sent only when the user clicks | Yes | Independent | — | n/a |
| 20 | Google Fonts | `next/font/google` (`web/app/[locale]/layout.tsx:2`) | None. Fonts are self-hosted at build time, so there is no runtime call to Google | — | — | — | — |

**Not present anywhere in code or dependencies:**
- Sentry or any error-monitoring SaaS;
- PostHog, Google Analytics, Vercel Analytics or Speed Insights, Hotjar or any session replay;
- Mapbox, Google Maps or any geocoding API;
- push-notification vendors;
- mobile analytics (`apps/mobile/package.json` has only Expo core modules and supabase-js).

**Error monitoring today:** Vercel function logs and console output only.

### 1.2 The AI runtime in detail: what may leave, and to whom

**Configuration.**
- The runtime is off unless `AI_PROVIDER_MODE` is `mock` or `live` (`web/lib/ai/runtime/config-core.ts:292-299`).
- A cloud provider additionally needs its key (`config-core.ts:316-321`).

**Egress gate** (`web/lib/ai/runtime/data-egress.ts`).
- The rule is default-deny: an external provider receives `PUBLIC` data only, unless a grant row says otherwise (:221-224).
- A `local` locality is unrestricted (:218).
- A free tier is capped at `LOW_RISK_PROJECT_DATA` whatever a grant says (:184-185, :226-233).
- The gate runs in the chain's **first pass**, so a provider it removes can never be reached as a fallback (:54-61).

**Grants.** There are exactly two, both for Gemini, both task-scoped, and both `requiresPaidTierConfirmation: true`:
- `propose_conversation_intent` (:131-151);
- `translate_message` (:152-172).

**Task sensitivity** (`web/lib/ai/runtime/data-sensitivity.ts:105-171`):
- `PUBLIC`: `explain_market_demand` only. It is the only task an ungranted external provider can run.
- `PERSONAL`: `extract_cv`, `normalize_work_scope`, `explain_match`, `draft_follow_up`, `normalize_external_profile`. These are refused for every cloud provider. They would run only on a local model, which is not deployed, so **they do not run at all today**.
- `SENSITIVE_FREE_TEXT`: `translate_message`, `propose_conversation_intent`, `translate_vacancy`. **`translate_vacancy` has no grant, so it is refused for Gemini** (:162-170).

**Is the gate bypassed anywhere?**
- Only the provider adapters and `run-core.ts` import an LLM SDK or vendor URL.
- The one exception is `web/scripts/hero/generate-living-worker-hero.mjs`, an owner-run image-generation script with no user data.
- No other direct LLM call exists.

**Gemini free-tier risk.**
- From 2026-08-28 until #2399, real message text and chat sentences were sent to Gemini without proof that billing was enabled.
- The 429 "check your plan and billing" errors are consistent with a free-tier key. If the key was free-tier, Google was not acting as a processor for that content.
- This is the single largest compliance exposure found. It is historical, and it is currently contained by the paid-tier flag.

---

## 2. Cookies and browser storage

### 2.1 Cookies

| Name | Set by | Lifetime | Purpose | Class | Listed on `/legal/cookies`? |
|---|---|---|---|---|---|
| `sb-<ref>-auth-token` (chunked `.0`, `.1`, …) | Supabase SSR (`web/lib/supabase/server.ts:36`, `web/middleware.ts:337`) | Session refresh | Sign-in session | Strictly necessary | Yes, as a generic "Sign-in cookies" item (`en.json:5743`) |
| `sb-<ref>-auth-token-code-verifier` | Supabase PKCE OAuth flow | Short | OAuth PKCE | Strictly necessary | Covered by the generic item |
| `NEXT_LOCALE` | next-intl (`web/lib/i18n/routing.ts:16-24`, maxAge 1 year); auth callback (`web/app/[locale]/auth/callback/route.ts:265`) | 1 year | Language | Functional / preference (arguably necessary as user-requested) | Yes (`en.json:5747`), but the lifetime is not stated |
| `lm_hide_admin_ui` | `web/lib/auth/admin-ui-actions.ts:17` | — | Admin display preference | Preference | Yes (`en.json:5751`) |
| **`lm_active_workspace`** (httpOnly, user-bound) | `web/lib/company/organization-actions.ts:93,119`; name defined at `web/lib/company/active-organization.ts:65` | — | Active workspace pointer | Strictly necessary | **No** |
| **`lm_tz`** | `web/components/app/viewer-time-zone.tsx:28` (`max-age=31536000`) | 1 year | The viewer's IANA time zone, for local-day rendering | Functional | **No** |

### 2.2 localStorage

The cookie page mentions **only `theme`**.

| Key | Where | What it holds | Class |
|---|---|---|---|
| `theme` | `web/components/ui/ThemeToggle.tsx:33`, `web/app/[locale]/layout.tsx:167` | Light or dark | Preference (listed) |
| **`lm.attr.first`** | `web/lib/telemetry/attribution.ts:25,136` | First-touch `utm_*`, referrer host, landing path. Also copied into `auth.users.raw_user_meta_data` at signup (`web/lib/telemetry/first-touch-user-metadata.ts`) | **Analytics / marketing attribution** |
| **`lm.funnel.last_seen_day`** | `web/components/app/session-telemetry.tsx:77-82` | Last active day (DAU counting) | **Analytics** |
| **`lm.funnel.signup_pending`** | `web/lib/telemetry/task.ts:234,252` | Signup funnel marker | Analytics |
| `lm.search-location.v1` | `web/lib/location/location-store.ts:10` | The user's chosen search location (may be precise) | Functional (personal data) |
| `lm.opportunities.recentlyViewed.v1` | `web/lib/opportunities/recently-viewed.ts:15` | Recently viewed jobs | Functional |
| `lm.commandFinder.recentCommandIds` | `web/components/app/command-finder.tsx:50` | Recent commands | Functional |
| `lmai:command-finder-speech-consent:v1` | `command-finder.tsx:117` | Dictation disclosure accepted | Necessary (consent record) |
| `lm.communication.writeLanguage` | `web/components/app/communication-composer.tsx:65` | Composer language | Preference |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | `web/components/app/conversation/chat/conversation-chat.tsx:748-749` | Per-feature usage counts for pin suggestions | Functional (behavioural) |
| `lm.professionRecoveryPrompt.v1.dismissed` | `web/components/app/profession-recovery-prompt.tsx:54` | Prompt dismissed | Preference |
| `lm.work-card-checks.kept` | `web/components/app/work-card-plausibility-note.tsx:23` | Kept checks | Preference |
| `lm.employerVisibilityAsk.v1` | `web/lib/privacy/employer-visibility.ts:90` | Outcome of the visibility prompt | Preference |
| `lmai:voice-speech-language` | `web/lib/voice/capture-model.ts:291` | Dictation language | Preference |

### 2.3 sessionStorage

| Key | Where | What it holds | Class |
|---|---|---|---|
| **`lm.pilot.session`** | `web/lib/telemetry/task.ts:32,48` | Random telemetry session id, sent with every `pilot_events` row | **Analytics** |
| `lm.funnel.*` (`landing_fired`, `login_succeeded`, `<event><surface>`) | `web/components/app/marketing-funnel-beacon.tsx:26`, `session-telemetry.tsx:45`, `telemetry-view.tsx:62` | Dedup flags for funnel events | Analytics |
| `lm.oauth.trace` | `web/lib/auth/oauth-trace.ts:26` | OAuth trace id | Necessary / diagnostic |
| `lm-chunk-reload` | `web/app/[locale]/error.tsx:60` | Reload guard | Necessary |
| `lm.chat.continueAfterSwitch` | `conversation-chat.tsx:848,2384` | **Up to 500 chars of the typed sentence**, for one-shot resume | Functional (personal content) |
| `lmai:voice-transcript-draft` | `web/lib/voice/constants.ts:24` | **Transcript draft text** | Functional (personal content) |

### 2.4 Consent banner

- **None exists.** No banner or CMP component was found (searched for cookie banner/consent/CookieNotice).
- Telemetry is **not gated** by any consent, Do-Not-Track or GPC check (searched `web/lib/telemetry/*`, `session-telemetry.tsx`, `telemetry-view.tsx`, `marketing-funnel-beacon.tsx`).

**What the telemetry pipeline does.** It is first-party, not a third party, but it is analytics:
- Client events go to the server action `web/lib/telemetry/actions.ts`, which inserts into `public.pilot_events` with server-derived **`profile_id`** (:28-29), a session id, route and locale.
- First-touch UTM data is written into the user's auth metadata.
- There is an admin telemetry viewer at `web/app/[locale]/dashboard/admin/telemetry/page.tsx`.

**Why this matters.** Under ePrivacy Art. 5(3) (transposed in the LT Law on Electronic Communications Art. 61(3)), storing or reading `lm.attr.first`, `lm.funnel.last_seen_day`, `lm.pilot.session` and the funnel flags is **not strictly necessary**. That needs consent, or at minimum a lawyer's view on an analytics exemption. No consent exists today.

### 2.5 Cookie page compared with reality

- `web/app/[locale]/(marketing)/legal/cookies/page.tsx:10-17`: the doc comment says the page is a "FACTUAL list … derived from source". It is incomplete:
  - it omits `lm_active_workspace` and `lm_tz`;
  - it omits ~20 storage keys;
  - its note says theme is the only local-storage item (`en.json:5755`).
- `en.json:5756` `noTracking`: "There are no analytics, advertising or third-party tracking cookies". This is literally true for *cookies*, but analytics identifiers are kept in local/session storage, so the page misleads by omission.
- Lifetimes are not stated for any item (`NEXT_LOCALE` and `lm_tz` last 1 year).

---

## 3. Discrepancies against the registers and the public pages

Severity scale:
- **H** = a public statement that is false, or an undisclosed processor/transfer of personal data;
- **M** = an incomplete or stale record;
- **L** = cosmetic or hygiene.

| ID | Sev | Where | Statement | Reality (evidence) |
|---|---|---|---|---|
| D1 | **H** | `en.json:5726` (privacy, AI section) and `en.json:5824` (public subprocessor list); same lines in `lt.json` | Gemini is used for "translating messages **and job ads**" and for chat-sentence suggestions | **Job ads:** `translate_vacancy` has **no egress grant** and is refused for Gemini (`data-sensitivity.ts:162-170`; `data-egress.ts:130-173` grants only `translate_message` and `propose_conversation_intent`). **Messages and sentences:** refused since #2399 while `AI_GEMINI_PAID_TIER_CONFIRMED` is unset (`data-egress.ts:200-205`; GEMINI_SAFE_OPERATION:11). Only PUBLIC market explanations reach Gemini today. The pages also never say the tier, or Google's processor status, is unverified. |
| D2 | **H** | Gemini, historical | Register v2:24 treats the tier as an open question | Personal free text (236 translations and 33 sentences in 30 days, LOCAL_LLM_EVALUATION §2.3) went to a key with free-tier symptoms (83× 429 "check your plan and billing"). If it was free tier, this was disclosure to a non-processor. Needs an owner/lawyer breach-assessment decision; the register's "VERIFY" understates it. |
| D3 | **H** | `en.json:5826` ("No other **email**, AI, translation or payment provider is active"); register v2 §A has no Resend row; v2:44-46 says Resend is "not active" and calls Supabase Auth SMTP "VERIFY" | — | **Resend is the live Supabase Auth custom SMTP since 2026-09-02** (`docs/audits/evidence/final-completion/g1-resend-smtp-state-2026-09-02.md:5-7`). Every sign-up e-mail address goes to Resend (US) and Amazon SES. The VERIFY item was already answered inside the repo. |
| D4 | **H** | Register v2:33 (MCP assistants = "recipient chosen by the **data subject**"); `en.json:5727` ("the assistant then acts only with your own permissions") | — | When an **employer or manager** connects ChatGPT or Claude, tools return **other people's** data: candidate search results, roster, absence requests (possibly health-related reasons), the journal review queue, people ingest, shortlists (`marketplace-capabilities.ts:69`, `employer-operations-capabilities.ts:366`, `domain-action-capabilities.ts:630-652`). Those workers chose nothing. A controller and recipient analysis is needed: the employer as controller instructing the transfer, or the platform disclosing to the employer's processor. Notice to workers is needed too. Neither the register nor the privacy page covers it. |
| D5 | **H** | `en.json:5684` ("does not use third-party advertising **or analytics trackers** and **does not build behavioural profiles**"); `en.json:5790` ("no … analytics trackers … **no behavioural scoring**"); `en.json:5756` | — | First-party analytics exists, tied to `profile_id` (`web/lib/telemetry/actions.ts:28`): funnel events, DAU marker, UTM first-touch attribution in localStorage and in auth metadata, per-feature usage counters. "Third-party" is technically true, but "does not build behavioural profiles" is doubtful. No consent mechanism exists for the non-essential storage (§2.4). The privacy policy does not list telemetry as a data category or purpose (`en.json:5670-5675` lists account, content, company, messages, consent and "technical data … sign-in cookies"). |
| D6 | **H** | ROPA v1 `docs/legal/processing-activities-register-v1.md:25-26` ("Automated decision-making incl. profiling: **none in production** (matching is human-operated); a DPIA is required before any automated matching ships") | — | Automated matching **ships**: `web/lib/scouting/auto-match.ts` runs deterministic match-v1 over employer-discoverable workers every time a need is published, reopened or confirmed. Candidate search ranks workers, job alerts match workers to vacancies (`.github/workflows/job-alerts-cadence.yml`), and the new-job-matches badge does the same. This is profiling (Art. 4(4)), though not a solely automated decision (see §4). The DPIA trigger in `privacy-risk-and-dpia-screening-v1.md:66-68` appears to have been passed without a DPIA in the repo. |
| D7 | M | ROPA v1 (whole file, dated 2026-07-11) | 10 activities | **Missing activities:** AI processing (Gemini: translation, intent); first-party analytics/telemetry; billing (Stripe); MCP/external assistant access; public vacancy ingestion (Art. 14: employer names, contact persons in ad text); voice transcription; assistant chat transcripts (`web/app/api/assistant/transcript/route.ts`); job alerts and notifications; auth e-mail (Resend); map tiles (OSM). The recipients columns name only Supabase, Google OAuth and Telegram. |
| D8 | M | Register v2:27 | Telegram is "active only if **`TELEGRAM_BOT_TOKEN`** is set" | The actual env names are `OWNER_TELEGRAM_ALERTS_ENABLED`, `OWNER_TELEGRAM_BOT_TOKEN` and `OWNER_TELEGRAM_CHAT_ID` (`web/lib/env.ts:143-145`). The **preferred** path is the **Agentai OS bridge** (`AGENTAI_OS_ALERTS_ENABLED`, `AGENTAI_OS_ALERT_ENDPOINT`, `AGENTAI_OS_ALERT_TOKEN`, `env.ts:147-157`), a further recipient that is **missing from the register, the ROPA and the public page**. The owner's check, as worded, would look for the wrong variable. |
| D9 | M | Register v2 and the public list `en.json:5821-5826` | — | **OpenStreetMap tile servers** are missing: the browser sends IP and viewport to `tile.openstreetmap.org` (`leaflet-engine.ts:24`). Also missing: **Hostinger** (privacy-contact mailbox, g1 evidence :8); **browser speech vendors** (command-finder dictation; disclosed in context only); the **whisper host**, if deployed. |
| D10 | M | `en.json:5825` and `en.json:5656` | "no subscription is active today"; privacy intro: "as it works today, **before payments are active**" | Live Stripe customers exist (register v2:7; owner memory: "prod Stripe LIVE customers"). Live mode is reachable behind `STRIPE_LIVE_ACTIVATION` (`env.ts:75-79`). The statement is at least stale-prone, and whether any subscription exists needs checking against production. Register v2:25 lists "name/e-mail, payment metadata" but omits the **required billing address, VAT/tax id, Stripe Tax computation** and **`owner_id` / `organization_id` metadata** (`stripe-test.ts:166-172`, `metadata-core.ts:29-35`). |
| D11 | M | Register v2:23 ("Production functions run in `dub1`") | — | True for functions (`vercel.json` `regions`). But middleware has no runtime pin (`web/middleware.ts:398`), so it runs on Vercel's global Edge network and handles auth cookies (JWT with email) at non-EEA PoPs. The public page says only "application hosting and content delivery" (`en.json:5822`) and makes no transfer statement. |
| D12 | M | Cookie page (`cookies/page.tsx:10-17`; `en.json:5743-5756`) | "Factual list … derived from source" | Missing `lm_active_workspace`, `lm_tz`, and every local/session-storage key except `theme` (§2.1-2.3). No lifetimes. No consent banner, although analytics storage is used. |
| D13 | M | Register v2:34 (public employment services are "Sources … not recipients") | — | Correct as far as it goes, but the platform **stores** third-party personal data from them: employer name and org number (sole traders), and SE free-text descriptions that may name contact persons (`arbetsformedlingen-parse.ts:205-249`). That needs a ROPA row and Art. 14 handling. NAV correctly drops `contactList` (`nav-parse.ts:22-23`). |
| D14 | M | Privacy page (`en.json` `legal.privacy`) | — | There is no section on profiling or automated decisions, legal bases per purpose, international transfers, or recipient categories beyond the data-protection page list. Retention is "pending" (`en.json` `pendingItems`). |
| D15 | L | `en.json:5823` ("GitHub — … No user data is stored there") | — | No PD is stored, but GitHub Actions holds the production **service-role key** and US-hosted runners **write** to the prod DB (supply cadences). Observed reads are aggregates, cursors and synthetic QA only. GitHub is a processor with full technical access, which the register's "not a processor" row (v2:35) contradicts. |
| D16 | L | `web/next.config.ts:83-95` | CSP (Report-Only) still allowlists `accounts.google.com` for script, frame and connect | Google Identity Services was removed (`web/lib/env.ts:160-166`). This is a stale allowance, not a data flow. |
| D17 | L | `en.json:5839` / dataProtection pending | "Signed data-processing agreements … pending" | Consistent with the repo: **no DPA, SCC or DPF evidence for any vendor**. Every "Transfer basis" cell in register v2 is assertion, not evidence. |
| D18 | L | Register v2:26 (Google OAuth: "Name and e-mail") | — | Supabase's default Google scopes also return the profile picture URL and Google subject id, stored in `auth.users.raw_user_meta_data`. No extra scopes are requested (`google-button.tsx:221-225`). |
| D19 | L | Register v2 §C | — | Missing dormant adapters: IndexNow (`web/lib/answer-engine/indexnow.ts`), LinkedIn (`linkedin_oidc`) and Facebook OAuth (coded, disabled), self-hosted LibreTranslate and the local LLM (`services/translate`, `AI_LOCAL_*`). |

**What the register and pages get right** (worth keeping):
- Supabase is in the EU region.
- Stripe is a mixed processor/controller.
- Google OAuth is an independent controller.
- Gemini's tier dependency is flagged.
- Anthropic, OpenAI, xAI, DeepL and Cloudflare are correctly listed as inactive.
- The NAV contact-data exclusion holds.
- The consent separation (visibility vs. disclosure) matches the RLS and consent design.

---

## 4. Automated decision-making and profiling (Art. 22 / Art. 4(4))

| Mechanism | Automated? | Effect | Human in the loop / enforcement |
|---|---|---|---|
| **Auto-match on demand publish** (`web/lib/scouting/auto-match.ts`, `auto-match-receipt.ts`) | Yes, deterministic match-v1, runs with no human trigger | Ranks employer-discoverable workers for a need. Only counts and anonymised references are stored on the receipt; **no message, invitation or notification is sent** (`auto-match-receipt.ts:6-14`) | The employer decides whether to contact anyone. Only workers who opted into visibility are in the pool (consent `profile_discoverability`). **Profiling: yes. A solely automated decision with legal or similarly significant effect: no.** |
| Candidate search / scouting ranking (`candidate.search`, scouting page), staffing fit (`web/lib/staffing/match-preview.ts:10-31`) | Yes (ordering and "fit" dimension counts; explicitly not an AI score) | Determines who an employer *sees first*. This can significantly affect access to work | No auto-reject exists anywhere (searched auto-reject, auto_decline, risk_score, fit_score). The employer makes every selection. Contact data and CV are released only through per-company worker consent (disclosure ledger). |
| Job alerts / new-job matches (`.github/workflows/job-alerts-cadence.yml`, spine badge) | Yes | Recommendations to the worker | Informational; no decision taken about the worker |
| Living CV inference (decision 0023; direct, indirect and potential capabilities) | Yes (deterministic) | Inferred capability labels on the person's own record | Evidence states are kept apart (recorded / declared / potential / confirmed / certified). The AI contract says nothing is saved as a fact without confirmation (`docs/product/human-reviewed-ai-assistance-contract-v1.md` rules 1 and 4; privacy `en.json:5726`). **Open question:** whether inferred "potential" capabilities feed match-v1 ranking that employers see. This was not verified and needs checking for the DPIA. |
| AI suggestions (CV structuring, journal normalisation, match explanation, follow-ups) | Would be. **None run today:** they are PERSONAL tasks, refused for every cloud provider, and no local model is deployed | — | Contract rule 4: "AI can never verify a skill, … accept/reject a candidate, contact anyone". Writes go through one-time confirmation tokens (`web/lib/capabilities/confirmable.ts`), also on the MCP door. |
| Gemini intent proposal | Yes, when granted | Proposes ONE existing intent id. Every action with consequences still needs a confirmation | Confirmation token (`confirmable.ts`) |
| Admin risk agent (`web/lib/ai/registry/agents/admin-risk.ts:1-7`) | Registered | Builds a review queue | "NEVER auto-rejects or bans anyone"; an admin decides. Company verification is "a manual human decision" (`en.json:3074`) |
| `trust_score` columns (`supabase/migrations/0001_initial_schema.sql:59,111`; `0013…:43`) | **Dormant.** Default 0, never computed, protected from user writes (`web/lib/worker/work-card-core.ts:19-20`) | — | If anyone ever computes it, it becomes scoring and needs a DPIA plus a public notice (and the "no behavioural scoring" claim at `en.json:5790` would become false) |

**Conclusion.**
- No solely automated decision with legal or similarly significant effect was found. Every selection, contact, approval, verification and rejection is made by a human, and that is enforced by confirmation tokens, consent-gated pools and the AI contract.
- There **is** automated profiling (ranking and matching) of job-seekers that affects access to employment. That is a likely DPIA trigger (EDPB/WP248 criteria: evaluation or scoring, plus vulnerable data subjects or employment).
- The ROPA's "none in production" (D6) is stale, and the public privacy page has no profiling notice (D14).

---

## 5. Owner/lawyer action list (derived)

1. **Gemini:**
   - verify billing on the project behind `GEMINI_API_KEY`;
   - assess the 2026-08-28 to 2026-10-15 period;
   - fix `en.json:5726` and `:5824`, which name job-ad translation (never granted) and messages (currently off).
2. **Resend:** add it to register §A and the public list. Correct `en.json:5826`.
3. **MCP third-party data:** do a controller/recipient analysis and give workers notice. Consider limiting which tools employer-side assistants get (absence and journal content).
4. **Analytics:**
   - decide between a consent banner and dropping non-essential storage (`lm.attr.first`, `lm.funnel.*`, `lm.pilot.session`);
   - correct the "no analytics / no behavioural profiles" copy;
   - add telemetry to the privacy categories and the ROPA.
5. **ROPA v2:** add the activities in D7. Correct the ADM statement. Run the DPIA for auto-match and candidate ranking.
6. **Cookie page:** list every cookie and storage key with its lifetime.
7. **Register v2:**
   - fix the Telegram env names and add the Agentai OS bridge;
   - add OSM tiles, Hostinger, browser speech vendors and the whisper host;
   - add the Stripe data fields (address, VAT id);
   - add the Vercel edge-middleware note;
   - reconsider GitHub's role.
8. **DPAs, SCCs and DPF:** none is evidenced in the repo for any vendor. Collect them before stating any transfer basis publicly.
