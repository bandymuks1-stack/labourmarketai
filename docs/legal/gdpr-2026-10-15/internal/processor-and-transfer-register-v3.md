# Processor, recipient and transfer register — v3

- **Status:** DRAFT v3, 2026-10-15. **Requires lawyer review.**
- **Supersedes:** `docs/legal/subprocessor-register-v2.md` (2026-10-14) for internal use. v2 stays as history.
- **Sources:**
  - Audit A2 (`../audit/02-processors-transfers-cookies-ai.md`), the 2026-10-15 findings.
  - Audit A3 §0.
  - `subprocessor-register-v2.md`.
  - `docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md`.
  - `docs/audits/evidence/final-completion/g1-resend-smtp-state-2026-09-02.md`.
  - Code: `apps/web/lib/env.ts`, `apps/web/middleware.ts`, `.github/workflows/*.yml`.
- **Controller:** UAB „Nonstop Group“ (302676973).

> **LT santrauka.** Atnaujintas tvarkytojų ir gavėjų registras. Jis taiso v2 pagal 2026-10-15 auditą:
> - Resend veikia nuo 2026-09-02 (autentifikacijos laiškai).
> - Gemini asmens duomenų užduotys sustabdytos nuo #2399, o mokamas planas nepatvirtintas.
> - Telegram kintamieji iš tikrųjų vadinasi `OWNER_TELEGRAM_*`. Yra ir `AGENTAI_OS_ALERT_*` tiltas.
> - Įtraukti nauji gavėjai: OpenStreetMap, Hostinger, naršyklių kalbos atpažinimo tiekėjai.
> - GitHub Actions turi prieigą prie produkcijos.
> - Vercel middleware gali veikti už EEE ribų.
>
> Nė vienam tiekėjui nėra įrodytos pasirašytos ar priimtos DPA sąlygos, todėl visur pažymėta „NOT EVIDENCED — owner to obtain“.

## Conventions

- **DPA status.** Only two values may be written as fact:
  - **"signed"** — a signed copy is held;
  - **"accepted online terms"** — there is evidence of acceptance for this account, such as a dashboard screenshot or an e-mail.
  - Neither exists in the repo for any vendor. Every vendor that needs one is therefore **NOT EVIDENCED — owner to obtain**.
  - A vendor's published DPA being "available" is not acceptance.
- **Transfer mechanism.** Only a mechanism that has been evidenced is written. Anything else is **[NOT EVIDENCED]**. Under Art. 46, SCCs must actually be in force through the DPA. Under Art. 45, the DPF covers only a vendor certified on the DPF list.
- **Active.** States the evidence behind it. A production env value cannot be seen from the repo.

## A. Processors and processor-like recipients

### A1. Core platform infrastructure

| # | Vendor | Role (this processing) | Personal data | Active? (evidence) | Location | DPA status | Transfer mechanism |
|---|---|---|---|---|---|---|---|
| P1 | **Supabase Inc.**: database, Auth/GoTrue, Storage, OAuth 2.1 server (MCP grants) | Processor | All platform data. Includes accounts, profiles, CVs, journals, messages, documents, absence data, ledgers, transcripts, telemetry, OAuth grants, backups. | Yes. Project `gorgitwvdzxbnaxhrsrw` (`apps/web/lib/env.ts:40-43`). | eu-west-1 (Ireland). **The region comes from docs, not config.** US parent. | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED]. Any US access by the parent needs SCCs through the DPA. |
| P2 | **Vercel Inc.**: hosting, serverless functions, crons, logs | Processor | Request metadata, IP, auth cookies (JWT incl. e-mail) passing through middleware, function logs | Yes. `vercel.json` `regions: ["dub1"]`; 2 crons. | Functions run in Dublin. **Middleware has no runtime pin** (`apps/web/middleware.ts:398`), so on Next 15 it runs on Vercel's Edge network at the PoP nearest the visitor, which can be outside the EEA. US company. | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED]. Edge processing outside the EEA is an Art. 44 point (G-28). |
| P6 | **GitHub Inc.**: repository, Actions, Issues | **Processor** (corrects v2, which said "not a processor"). Runners can reach all production data through the service-role key. | Production `SUPABASE_SERVICE_ROLE_KEY` is a secret in `ingestion-freshness`, `nav-supply-cadence`, `prod-qa-walk`, `product-monitor` and `sweden-supply-cadence`. `CRON_SECRET` is held for job-alerts. Observed reads: aggregates, `ai_runs` latency/cost, cursors, synthetic QA. Writes: vacancy data. | Yes | GitHub-hosted runners (US) | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED] |

### A2. AI, payments and e-mail

| # | Vendor | Role (this processing) | Personal data | Active? (evidence) | Location | DPA status | Transfer mechanism |
|---|---|---|---|---|---|---|---|
| P3 | **Google: Gemini API** (`generativelanguage.googleapis.com`) | **Processor only on the paid tier.** On the free tier Google may use content to improve products, so it is not a processor, and personal data must not be sent. **Tier unverified.** | Historically: message bodies ≤8000 chars and typed chat sentences with coarse role. Today: PUBLIC market aggregates only (`explain_market_demand`). | **Partly.** Since #2399 the personal-data grants require `AI_GEMINI_PAID_TIER_CONFIRMED=1`, which is **not set** (`GEMINI_SAFE_OPERATION_2026-10-15.md:11`). 83× `429 … check your plan and billing` (:15). `translate_vacancy` was never granted. **2 `extract_cv` rows on 2026-10-15: verify** (G-09). | Google global; region not pinned | **NOT EVIDENCED — owner to obtain.** Billing proof on the Google project, then the Gemini/Cloud processor terms. | [NOT EVIDENCED]. Historical period: G-02. |
| P4 | **Stripe** (Stripe Payments Europe Ltd, IE, for EEA accounts) | Mixed. Processor for payment services; **independent controller** for its own regulatory, fraud and financial-crime duties. | Account e-mail; `owner_id` / `organization_id` metadata (`lib/billing/metadata-core.ts:29-35`); **billing address (required), VAT/tax id, name** (`lib/billing/providers/stripe-test.ts:166-172`); card data goes direct to Stripe | Yes. 3 customers; 3 live-mode `company_pilot` checkouts (2 open); 0 subscriptions; 0 webhooks. | IE; global group | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED] |
| P5 | **Resend Inc.**: Supabase Auth custom SMTP | Processor (sub-processor of the auth e-mail flow) | Recipient e-mail, confirmation link/token, e-mail content | **Yes, since 2026-09-02** (`g1-resend-smtp-state-2026-09-02.md:5-7`: SMTP `smtp.resend.com`, sender `noreply@labourmarket.ai`). **Corrects v2 §C ("not active").** | Resend is a US company; sending via **Amazon SES eu-west-1** per DNS (same doc :7) | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED] |
| P5a | **Amazon Web Services (SES)**, as Resend's sub-processor | Sub-processor | Same as P5 | Yes (DNS evidence) | eu-west-1 | Covered by the Resend DPA, if one exists: [NOT EVIDENCED] | [NOT EVIDENCED] |
| P5b | Resend / Postmark: app-level transactional e-mail (`lib/email/transactional.ts`; `INVITE_EMAIL_*`) | Would be processor | Invitations, notifications, digest | **Not active.** `email_send_ledger_v1` is empty. | — | Obtain before activation | — |
| P7 | **Hostinger**: mailbox for `info@labourmarket.ai` (published privacy contact) | Processor | Data-subject requests and all correspondence | Yes. Root MX `mx1/mx2.hostinger.com` (g1 evidence :8). | Hostinger group (LT/EU). **Verify** the hosting location. | **NOT EVIDENCED — owner to obtain** | [NOT EVIDENCED] |

### A3. Alert channels and other processors

| # | Vendor | Role (this processing) | Personal data | Active? (evidence) | Location | DPA status | Transfer mechanism |
|---|---|---|---|---|---|---|---|
| P8 | **Telegram**: owner-alert bot | Processor-like channel | B2B company-need contact fields, each capped at 120 chars (`lib/notifications/telegram-owner-alerts.ts:38-52`). Never worker data. | **Unknown.** Off by default. **Env names: `OWNER_TELEGRAM_ALERTS_ENABLED`, `OWNER_TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_CHAT_ID`** (`lib/env.ts:143-145`). This corrects v2, which named `TELEGRAM_BOT_TOKEN`. | Telegram infrastructure (non-EEA) | **NOT EVIDENCED.** Register v2 states that Telegram offers no DPA for bots. Owner to confirm, or stop using the channel for contact data. | [NOT EVIDENCED] |
| P9 | **Agentai OS alert bridge**: owner-run system, the preferred alert path | Recipient / processor-like. It is a separate system run by the owner. **Who operates and hosts it is not evidenced.** | Same fields as P8 | **Unknown.** Env: `AGENTAI_OS_ALERTS_ENABLED`, `AGENTAI_OS_ALERT_ENDPOINT`, `AGENTAI_OS_ALERT_TOKEN` (`lib/env.ts:147-157`). **Missing from v2, the ROPA and the public page.** | [NOT EVIDENCED] | If a different legal entity runs it: **NOT EVIDENCED — owner to obtain.** If UAB „Nonstop Group“ runs it: record it as internal and list its hosting provider. | [NOT EVIDENCED] |
| P10 | **Self-hosted whisper.cpp** (`services/transcribe`; `VOICE_TRANSCRIBE_URL`/`_TOKEN`) | Our own software. **The VM or container host is a processor.** | Audio ≤25 MB, sent browser → service with a single-use token | Doubtful. Memory 2026-10-08 says "no transcription host now". Off unless both env vars are set. | Unknown | Obtain from the host before activation | [NOT EVIDENCED] |

## B. Independent controllers and other recipients (not our processors)

### B1. Recipients that receive data from the platform or the user's browser

| # | Recipient | Why not a processor | Data | Active? | Location / transfer | Contract / terms status |
|---|---|---|---|---|---|---|
| R1 | **Google: OAuth sign-in** | Google is an independent controller of the person's Google account. | Returns e-mail, name, **picture URL, Google subject id** (default scopes; `components/app/google-button.tsx:221-225`). Stored in `auth.users.raw_user_meta_data`. | Yes. Only Google is enabled (`lib/auth/enabled-providers-core.ts:31-35`). | The person's own relationship with Google | n/a |
| R2 | **OpenStreetMap Foundation tile servers** (`tile.openstreetmap.org`) | The browser fetches tiles directly. OSMF sets a tile usage policy, not a DPA. Treat it as an independent recipient [LAWYER]. | **Viewer IP, User-Agent, Referer, map viewport** | Yes, wherever the market map renders (`components/app/market-map/leaflet-engine.ts:24`) | OSMF is in the UK (UK adequacy decision). Not documented anywhere. | Tile usage policy only. **Not in the privacy policy** (G-31). |
| R3 | **Browser speech vendors** (Web Speech API: Google for Chrome, Apple for Safari, others per browser) | The browser sends audio to its vendor under the user's agreement with that vendor. The platform starts the flow but does not transmit the audio itself. | The user's audio | Yes, opt-in per use (`components/app/command-finder.tsx:107-121`, `commandFinder.voiceConsentText`) | Vendor infrastructure | n/a. **In-context notice only, not in the privacy policy.** |
| R4 | **MCP AI assistants** (OpenAI ChatGPT, Anthropic Claude, other OAuth clients) | **Correction to v2 §B.** For a person's own data, the assistant is a recipient the person chose. **When an employer or manager connects one, the tools return other people's data**: candidate search, roster, absence review, journal review queue, shortlist, people ingest. The workers did not choose that recipient. The employer is likely the controller of that onward transfer [LAWYER] (`roles-and-responsibilities-v1.md` §5). | Whatever the caller may read under RLS | Yes. Prod 229 tools (memory). **The number of employer-side grants is not measured.** | US providers. For employer use: the employer's Art. 44 transfer. The platform's transparency duty remains. | Platform Terms do not yet bind employers (G-03, G-14) |
| R5 | **UAB „Nonstop Group“ staffing operation**: the receiving door at `nonstopgroup.eu`, for commercial hand-offs | **Same legal entity as the controller.** This is not a transfer to a third party but a **new purpose**, which needs consent and notice (roles doc §6). | Pseudonymous worker refs, professional facts, vacancy/employer refs, consent version | Queue exists (2 rows). Dispatch is inert unless `NONSTOP_HANDOFF_ENDPOINT`/`_TOKEN` are set. **Prod value not evidenced.** | Hosting of the receiving system [NOT EVIDENCED] | Internal. Its own privacy notice on nonstopgroup.eu is [NOT EVIDENCED]. |
| R6 | Registered employers and agencies (discovery, disclosure, relationships) | They become independent controllers of what they see or receive | See matrix M09–M11 | Yes | EEA mostly. Non-EEA employers are possible [NOT ASSESSED]. | Platform Terms: no organisation data-protection clause yet (G-14) |

### B2. Sources and parties with no access

| # | Recipient | Why not a processor | Data | Active? | Location / transfer | Contract / terms status |
|---|---|---|---|---|---|---|
| R7 | Arbetsförmedlingen JobTech (SE), NAV pam-stilling-feed (NO) | **Sources** (inbound), not recipients. The platform becomes controller of what it stores (Art. 14). | Inbound: employer name, org number, ad text with contact persons. NAV `contactList` is never read (`nav-parse.ts:22-23`). | Yes | EEA | Open-data licences |
| R8 | Labour Market AI Sp. z o.o. | IP licensor. No access (licence §5). | None | — | PL | Intercompany licence §5 |
| R9 | Waze (outbound link, `lib/maps/waze.ts:30-32`) | The user clicks a link. | Destination lat/lng in the URL | Yes | — | n/a |

## C. Configured or dormant: not active (no personal data today)

Rule: add a vendor to §A before it is activated.

| Vendor | Evidence it is inactive |
|---|---|
| Anthropic, OpenAI, xAI, DeepL, Cloudflare Workers AI, LibreTranslate-cloud (AI adapters) | 0 production runs. Each is double-gated by an enable flag and a key (`lib/env.ts:98-119`). The egress gate would allow PUBLIC data only, because the grants name only Gemini (`lib/ai/runtime/data-egress.ts:124-172`). |
| Self-hosted LibreTranslate, local OpenAI-compatible LLM (`AI_LOCAL_*`) | Not deployed (`LOCAL_LLM_EVALUATION_2026-10-15.md` §3) |
| LinkedIn (`linkedin_oidc`), Facebook OAuth | Coded but disabled (`enabled-providers-core.ts`) |
| IndexNow (`api.indexnow.org`) | `submitIndexNow` has no caller. Public URLs only. |
| Google Fonts | Self-hosted at build time. No runtime call. |
| Sentry, PostHog, GA, Vercel Analytics, Hotjar, Mapbox, Google Maps, push vendors | **Not present** in code or dependencies (A2 §1.1) |
| Accounting software provider (referenced in the entity matrix) | Not evidenced in the repo. Add it when one is used. |
| Mobile app stores (Apple, Google), if the apps are released | **Not assessed** in this pack |

## D. Corrections to v2 (change log)

| v2 statement | v3 correction | Evidence |
|---|---|---|
| §C: Resend "not active"; Supabase Auth SMTP "VERIFY" | **Resend is live as Auth SMTP since 2026-09-02** (P5, P5a) | g1 evidence :5-7 |
| Row 3: Gemini live tasks include translate_message and intent | **Suspended since #2399** (flag unset). Only PUBLIC runs. Historical exposure is open (G-02). | GEMINI_SAFE_OPERATION :11 |
| Row 6: "active only if `TELEGRAM_BOT_TOKEN` is set" | Variables are `OWNER_TELEGRAM_ALERTS_ENABLED/_BOT_TOKEN/_CHAT_ID`. **Preferred path: Agentai OS bridge** (P9). | `lib/env.ts:143-157` |
| Row 2: "Production functions run in `dub1`" | True for functions. **Middleware runs on the Vercel Edge network**, possibly outside the EEA. | `middleware.ts:398` |
| §B: GitHub "No production personal data" | **Processor with full technical access** (service-role key in 5 workflows) | `.github/workflows/*.yml` |
| §B: MCP assistants "recipient chosen by the data subject" | Not true for employer-connected assistants (R4) | A2 D4 |
| Row 4: Stripe data "name/e-mail, payment metadata" | Adds the required billing address, VAT id, Stripe Tax and owner/org metadata | `stripe-test.ts:166-172` |
| Row 5: Google OAuth "name and e-mail" | Adds picture URL and subject id | `google-button.tsx:221-225` |
| (missing) | Adds OSMF (R2), Hostinger (P7), browser speech vendors (R3), whisper host (P10), Nonstop staffing purpose (R5) | A2 rows 6, 8, 10, 11 |

## E. Owner actions (vendor-contract)

1. **Gemini.**
   - Prove the tier: open the billing page of the Google project behind `GEMINI_API_KEY`.
   - Accept or record the processor terms.
   - Only then may `AI_GEMINI_PAID_TIER_CONFIRMED=1` be considered. That is an owner decision, and it is a paid service.
2. **DPAs.** Obtain and store evidence of signature or online acceptance for Supabase, Vercel, Stripe, Resend, Hostinger and GitHub. Record the date and the account each applies to.
3. **Transfers.** For each US vendor, record which mechanism applies (DPF certification or SCCs in the DPA) with evidence. Until then the public page must not state a transfer basis.
4. **Telegram and Agentai OS.**
   - Confirm whether either channel is enabled in production.
   - If enabled, identify who operates and hosts Agentai OS, and decide whether B2B contact data may keep using these channels.
5. **Vercel Edge.** Decide whether to pin middleware to the Node runtime in `dub1` (Engineering), or document the edge transfer (Lawyer).
6. **GitHub.** Reduce secret scope, for example to a narrowly granted role instead of `service_role`, or document GitHub as a processor with a DPA.
7. **Storage of evidence.** Keep the DPA copies and acceptance evidence in the owner's private document store, **not** in this public repository.
