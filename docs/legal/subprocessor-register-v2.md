# Vendor / Subprocessor Register — v2 (2026-10-14)

Supersedes v1 (2026-07-11), which is kept below as history. **Controller:** UAB „Nonstop Group“ (302676973, Lithuania).

**Why v2.** v1's own rule says a vendor that touches personal data is added here BEFORE go-live. Two vendors went live without that:
- **Google Gemini API** (AI) — production `ai_runs` show live calls since 2026-08-28;
- **Stripe** — `billing_customers` holds customer records.

The public data-protection page claimed neither was active; that was corrected in #2372.

**Method.** Every row separates three things:
- **FACT** — read from production or the code on 2026-10-14;
- **ROLE** — the vendor's GDPR role for THIS processing, from the vendor's own published terms, named per vendor and not assumed to be the same for all;
- **VERIFY** — what only the owner (account holder) can confirm.

Nothing here is a legal conclusion. The lawyer gate stays.

## A. Vendors that process platform personal data

| # | Vendor | What it does here (FACT) | Personal data | Where | ROLE for this processing | Transfer basis | VERIFY (owner) |
|---|---|---|---|---|---|---|---|
| 1 | **Supabase Inc.** | Database, auth, file storage. Production project in `eu-west-1`. | All platform data: accounts, profiles, journals, messages, documents, ledgers, transcripts | Ireland (eu-west-1) for data at rest; US parent for support/operations | **Processor** (Supabase DPA) | EU hosting; any US access by the parent is covered by Supabase's DPA/SCCs | DPA accepted for this organisation's account |
| 2 | **Vercel Inc.** | Web hosting and serverless functions. Production functions run in `dub1` (`/api/health` region). Request logs. | Request metadata; server logs may carry user ids and paths | Dublin execution; US company | **Processor** (Vercel DPA) | US company → SCCs and/or EU-US Data Privacy Framework per Vercel's DPA | DPA accepted; log retention window |
| 3 | **Google LLC / Google Ireland — Gemini API** | Live tasks:<br>• `translate_message` — the text of chat messages;<br>• `propose_conversation_intent` — the typed sentence plus coarse identity;<br>• `explain_market_demand` — aggregate public market data;<br>• `translate_vacancy` — refused by the egress gate for personal data. | Message text and typed sentences — free text that may contain personal data | Google infrastructure; region not pinned by the API | **Depends on the Gemini API tier — NOT VERIFIED.**<br>• **Paid tier** (billing enabled): Google acts as a **processor** under its Gemini API / Cloud data-processing terms and does not use prompts to improve products.<br>• **Unpaid (free) tier**: Google's terms allow it to use submitted content to improve its products, so it is **not a processor** for that data and personal data should not be sent.<br>Production shows `429 RESOURCE_EXHAUSTED … check your plan and billing details`, which is consistent with a quota-limited key but does not prove the tier. | Paid: Google DPA + SCCs/DPF.<br>Free: none adequate for personal data. | **P0 owner check:** is billing enabled on the Google project that issued the production `GEMINI_API_KEY`?<br>• If not, enable it, or switch Gemini off for personal-data tasks (revoke the two egress grants in `lib/ai/runtime/data-egress.ts`) until it is. |
| 4 | **Stripe** (Stripe Payments Europe Ltd., Ireland, for EEA accounts) | Checkout and billing for organisations: customer records exist; no subscription is active. | Organisation billing contact (name/e-mail), payment metadata; card data goes to Stripe directly, never to the platform | Ireland; global group | **Mixed**, per Stripe's DPA:<br>• **processor** for the payment services it performs for the platform;<br>• **independent controller** for its own regulatory, fraud-prevention and financial-crime obligations.<br>NOT "just a processor". | Stripe DPA (SCCs for intra-group transfers) | DPA accepted in the Stripe dashboard; live mode intended |
| 5 | **Google — OAuth sign-in** | "Continue with Google" on the web (Google is the only provider enabled, 2026-08-31). | Name and e-mail that Google returns at sign-in | Google | **Independent controller** of the person's Google account. The platform receives the data as controller; Google is not our processor for sign-in. | n/a (the person's own relationship with Google) | — |
| 6 | **Telegram** (owner-alert bot) | Code present (`lib/notifications/telegram-owner-alerts.ts`), active only if `TELEGRAM_BOT_TOKEN` is set in production. Sends company-need intake alerts to the operator. | B2B contact fields of a company need, capped; never worker data (enforced in code) | Telegram infrastructure | **Processor-like channel** — Telegram offers no GDPR DPA for bots, so treat it as a risk | No adequacy mechanism documented | Is `TELEGRAM_BOT_TOKEN` set in production? If yes: decide whether B2B contact data may keep using this channel |

## B. Recipients that are NOT our processors (listed so nobody mislabels them)

| Recipient | Why it is not a processor |
|---|---|
| **ChatGPT (OpenAI) / Claude (Anthropic) / other MCP assistants** | The **person** connects their own assistant through OAuth consent and can revoke it; data flows at their request. The assistant's provider processes it under the person's own agreement with that provider → **independent controller / recipient chosen by the data subject**. The privacy policy says so (#2372). |
| **Public employment services** (NAV Norway, Arbetsförmedlingen Sweden) | **Sources** of public vacancy data (inbound, under their open-data licences), not recipients of platform data. |
| **GitHub** | Source code and CI. No production personal data. Production QA walks use synthetic identities only, and the public repo forbids personal identifiers. |
| **Labour Market AI Sp. z o.o.** | IP licensor. No routine access (intercompany licence §5). |

## C. Configured in code, NOT active in production (FACT 2026-10-14)

| Vendor | Evidence it is inactive | Rule if activated |
|---|---|---|
| Anthropic API (internal AI) | 0 production `ai_runs` | add to §A first |
| OpenAI API, xAI, DeepL, LibreTranslate, Cloudflare AI | 0 production runs; DeepL "when configured" never taken | add to §A first |
| Resend / Postmark (transactional e-mail) | `email_send_ledger_v1` is empty | add to §A first |

Supabase Auth's own sign-in e-mails are part of row 1 unless a custom SMTP provider is configured. **VERIFY** in Supabase → Auth → SMTP.

## D. Owner actions, in order

1. **Gemini tier** (row 3) — confirm billing is enabled, or switch Gemini off for personal-data tasks. Until confirmed, this register cannot call Google a processor.
2. Accept or confirm the DPAs for Supabase, Vercel and Stripe in their dashboards.
3. Telegram: confirm whether it is active; if so, decide whether to keep it.
4. Lawyer: review roles and transfer bases; then update the public list (`legal.dataProtection`) from this register.

---

*(v1 2026-07-11 is preserved below unchanged as history.)*

## (history) Vendor / Subprocessor Register — v1 (2026-07-11)

Controller: UAB „Nonstop Group“ (302676973, Lithuania). Register of
processors/subprocessors that touch platform personal data, plus vendors
that do NOT. DPA status honestly marked — VERIFY items are owner actions.

| # | Vendor | Service | Personal data touched | Region | Role | DPA / terms status |
|---|---|---|---|---|---|---|
| 1 | Supabase (Supabase Inc.) | database, auth, storage (project gorgitwvdzxbnaxhrsrw) | all platform data (profiles, CVs refs, journals, ledgers) | eu-west-1 (Ireland) | processor | Supabase standard DPA available — **VERIFY: accepted/on file for this account** |
| 2 | Vercel Inc. | web hosting, serverless functions, logs | request metadata, server logs (may contain user ids) | EU edge + US company | processor | Vercel standard DPA — **VERIFY: accepted/on file** |
| 3 | Google (OAuth) | sign-in identity provider | email, name at sign-in | EU/US | independent controller for its own service + processor aspects | Google terms — **VERIFY scope** |
| 4 | Telegram (owner-alert bot) | operator notification channel | company-need intake fields (B2B contact data, capped/clipped); NO worker personal data | Telegram infra | processor-like channel to the operator | **VERIFY: acceptable for B2B contact data; keep worker data out (enforced in code)** |
| 5 | Anthropic (Claude API, if/when AI features run server-side) | AI processing | currently NONE in production flows with personal data | EU/US | — | add BEFORE any personal data flows |
| — | Labour Market AI Sp. z o.o. | IP licensor | **NONE — no routine access (by design + licence §5)** | PL | neither controller nor processor | intercompany licence §5 |

Rules: adding any vendor that touches personal data requires updating this
register, the Privacy Policy recipients section, and (if outside the EEA)
a transfer-mechanism check BEFORE go-live. International transfers today:
Vercel (US parent) and Google — **VERIFY SCC/adequacy coverage with the DPA
paperwork** before stating "no third-country transfers" publicly; the
Privacy Policy currently names recipient categories without asserting a
transfer-free guarantee.
