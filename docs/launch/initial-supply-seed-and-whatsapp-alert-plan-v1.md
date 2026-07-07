# Initial Supply Seed + Owner WhatsApp Alerts — Plan v1 (gated)

Date: 2026-07-07. Owner-operated. **Docs-only, gated plan.** No code, DB, RLS,
RPC, auth, UI, billing, or provider change is made by this PR. It documents the
source reality and gives an exact, code-ready path for two owner requirements:

1. an internal supply seed path for **up to 50 real companies + at least 100
   real worker profiles** (no fake records); and
2. an **owner WhatsApp alert** to the owner number (server env only; not printed here) when demand appears (starting
   with `/company-need` submissions).

Both parts hit a real external gate (a DB migration that needs owner apply, and
a WhatsApp provider that needs owner setup), so per the goal this ships as the
**properly-gated plan**, not a faked implementation. Everything the owner must
do is listed in §7.

Reference siblings: [`manual-paid-launch-runbook.md`](./manual-paid-launch-runbook.md),
[`concierge-worker-sourcing-pricing-addendum-v1.md`](./concierge-worker-sourcing-pricing-addendum-v1.md),
the public `/company-need` intake + owner queue (PR #681), and
[`../sales/README.md`](../sales/README.md) honesty rules.

---

## 1. Source reality (inspected on main @ current HEAD)

| Question | Finding |
|---|---|
| Company table + internal creation | `public.companies` exists but is **account-bound** (`profile_id` → a registered company user, `verification_status` ladder, admin RPC `admin_set_company_verification`). No path to hold an *external, non-user* company lead. |
| Worker/profile table | Worker supply = `public.profiles` = **auth users**. The admin **candidate-pool** (`/dashboard/admin/candidate-pool`, `loadCandidatePool`) is **read-only** over registered workers — not a seed/write path, and not a home for externally-sourced leads. |
| Existing `leads` table | `public.leads` (0001) exists but is a thin marketing/CRM capture (`source,email,full_name,company_name,country,intent,status,notes`). It has **no** trade/skills/permission/work-proof/source-reliability fields — wrong shape for structured supply seed, and mixing marketing leads with supply would be dishonest. |
| Seed/import convention | Only `pnpm db:fixtures:local` (`apps/web/scripts/db-fixtures-local.ts`) — **local-only** dev fixtures, not a production import path. No production CSV import exists. |
| Notification infra (WhatsApp/Telegram/email/webhook) | **None.** No WhatsApp/Twilio/SMS/email-send/push anywhere. The only "webhook" is the **inbound** Stripe billing webhook. The `/company-need` intake explicitly "sends NOTHING anywhere" by design. The repo currently has **zero outbound message capability**. |
| Env convention | `apps/web/lib/env.ts` — a **Zod-parsed allowlist** (`parsed.data`); new env vars must be added to the schema. Secrets are server-only; `requireServerSecrets()` / `requireSupabaseServiceEnv()` gate access. |
| `/company-need` intake action | `apps/web/lib/staffing/company-need-form-actions.ts` → `submitCompanyNeedAction` → `persistPublicCompanyNeed(...)` (the `submit_company_need_public_v1` RPC). `persist.ok` at line 112 is the exact success signal an alert would hook. |
| Worker "looking for work" / search submit | **No discrete submit event exists.** The market map is **signal-only** (markers only with verified coordinates; no fake markers). There is no anonymous "worker searches for work" or "company searches for people" action analogous to `/company-need`. So only alert **event #1** is implementable today. |
| Relevant guards | `no-secret-leakage.test.ts`, `no-provider-secret-leak.test.ts` (secrets never in client bundle), `no-live-payments.test.ts`, `company-need-public-intake.test.ts`, `chat-visibility-rls.test.ts` (service-role caller inventory), privacy/placeholder guards. |

**Consequence:** both parts are genuinely gated. Part A needs a new internal
table (owner DB apply). Part B needs an owner-provisioned WhatsApp provider +
secrets. Neither can be shipped working today without the owner, and faking
either is explicitly forbidden.

---

## 2. Part A — Initial supply seed path

### 2.1 Why a dedicated internal staging table (Path A3)

The 100 worker + 50 company records are **externally-sourced operator leads**,
not platform accounts. They do not belong in `profiles`/`companies` (auth-bound)
or `leads` (thin marketing shape). The clean, safe home is a **dedicated,
internal-only staging table** — the same pattern already blessed for
`company_need_public_intakes`: RLS enabled, **no anon/authenticated policy**,
read/write via **service role only**, surfaced through a superadmin-gated
operator screen later.

This requires a migration (new table + grants), which is a **human-gated DB
apply** in this repo's governance — so the SQL below is a **design, provided but
NOT applied**. The owner (or a follow-up session, once approved) applies it via
the same manual Supabase MCP path used for `company_need_public_intakes`, never
`db push`.

### 2.2 Seed field templates (safe, no fake data)

Header-only CSV templates ship with this PR (zero data rows = no fake records):

- [`templates/company-seed-template-v1.csv`](./templates/company-seed-template-v1.csv)
- [`templates/worker-seed-template-v1.csv`](./templates/worker-seed-template-v1.csv)

**Company columns:** `company_name, country, city_or_region, company_type,
sector, contact_person, contact_phone, contact_email, website_or_public_source,
preferred_worker_types, countries_of_operation, languages,
document_onboarding_capacity, source, source_reliability, permission_to_contact,
notes, created_by_operator, verification_status`.

**Worker columns:** `profile_type, name_or_label, contact_person, contact_phone,
contact_email_or_messenger, country, city_or_region, profession_trade, skills,
experience_summary, availability_date, preferred_countries, team_size,
language_level, document_status, accommodation_situation, transport_situation,
expected_pay_range_if_known, work_proof, source, source_reliability,
permission_to_store, permission_to_share_with_specific_client,
verification_status, notes`.

Closed-value guidance (validated on import, see §2.4):
- `company_type` ∈ `employer | subcontractor | staffing_partner | construction_company | other`
- `profile_type` ∈ `individual | brigade | company`
- `source_reliability` ∈ `direct_known_contact | referral | public_source | self_declared | unverified`
- `permission_to_contact` / `permission_to_store` / `permission_to_share_with_specific_client` ∈ `yes | no | limited`
- `document_status` / `document_onboarding_capacity` ∈ `known | unknown | needs_checking`
- `verification_status` ∈ `new | contacted | verified | rejected` (**`verified` only after a real human check** — never on import)

### 2.3 Recommended migration design (NOT applied — owner-gated)

```sql
-- GATED DESIGN ONLY — do not apply from a Claude session. Apply manually via
-- Supabase MCP after owner approval, mirroring the company_need_public_intakes
-- governance (RLS on, NO anon/authenticated policy, service-role read/write).

create table if not exists public.supply_company_seed (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  country text not null,
  city_or_region text,
  company_type text,          -- employer|subcontractor|staffing_partner|construction_company|other
  sector text,
  contact_person text,
  contact_phone text,
  contact_email text,
  website_or_public_source text,
  preferred_worker_types text,
  countries_of_operation text,
  languages text,
  document_onboarding_capacity text,   -- known|unknown|needs_checking
  source text not null,
  source_reliability text not null,    -- direct_known_contact|referral|public_source|self_declared|unverified
  permission_to_contact text not null default 'no',  -- yes|no|limited
  notes text,
  created_by_operator text,
  verification_status text not null default 'new'    -- new|contacted|verified|rejected
);

create table if not exists public.supply_worker_seed (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_type text not null,   -- individual|brigade|company
  name_or_label text not null,
  contact_person text,
  contact_phone text,
  contact_email_or_messenger text,
  country text not null,
  city_or_region text,
  profession_trade text not null,
  skills text,
  experience_summary text,
  availability_date text,
  preferred_countries text,
  team_size integer,
  language_level text,
  document_status text,                -- known|unknown|needs_checking
  accommodation_situation text,
  transport_situation text,
  expected_pay_range_if_known text,
  work_proof text,                     -- stored as-claimed; unverified until real check
  source text not null,
  source_reliability text not null,
  permission_to_store text not null default 'no',                 -- yes|no|limited
  permission_to_share_with_specific_client text not null default 'no',
  verification_status text not null default 'new',
  notes text
);

-- Safe-by-default: RLS ON, NO policies -> deny-all for anon + authenticated.
-- Service role bypasses RLS for the internal operator screen (same model as
-- company_need_public_intakes). No public read of private supply, ever.
alter table public.supply_company_seed enable row level security;
alter table public.supply_worker_seed  enable row level security;
```

Rollback (design): `drop table if exists public.supply_company_seed;` and
`drop table if exists public.supply_worker_seed;` — the tables are new, nothing
to restore.

### 2.4 Import flow (code-ready, added only after the tables exist)

A small superadmin-only server action + service-role client (mirroring
`lib/admin/company-need-intakes.ts`): parse the CSV, **validate required fields
+ closed enums**, reject rows missing `source` / permission, and insert. No row
is inserted without `source` and an explicit permission value. `verification_status`
is forced to `new` on import (never `verified`). A capacity guard keeps the first
seed within **≤ 50 company** and **≥ 100 worker** targets without hard-blocking.

### 2.5 Privacy / honesty (hard rules)

- Every seeded record is real: permission-cleared, or contact-limited, or an
  internal-only lead **not shown to any client** yet.
- Private by default — RLS deny-all; only service-role/superadmin reads.
- Never present a worker/company to a client unless permission is clear,
  availability is at least roughly confirmed, source is recorded, unknowns are
  marked.
- `work_proof` is stored **as claimed** and stays **unverified** until a real
  human confirmation. Never label anything "verified" on import.

---

## 3. Part B — Owner WhatsApp alerts (provider-gated)

### 3.1 Reality: no outbound infra → owner must provision a provider

The repo has **zero** outbound message capability, and WhatsApp business-initiated
messages require an owner-owned account, a verified WhatsApp Business number, a
**pre-approved message template** (for messages outside the 24-hour session
window), and API secrets. That is external, owner-only, and partly paid — a hard
gate. This PR therefore **plans** the alert; it does not send anything and does
not claim WhatsApp works.

### 3.2 Provider choice

- **Recommended: Meta WhatsApp Cloud API** — first-tier free volume is generous
  for owner-only alerts; a single approved utility template covers the alert.
  Needs: a Meta app + WhatsApp Business Account (WABA), a verified sender number,
  a permanent access token, and one approved template.
- **Alternative: Twilio WhatsApp** — simpler API, but a paid Twilio account and
  its own WhatsApp sender approval.
- The owner picks one; the helper below is written against Meta Cloud API and is
  swappable.

### 3.3 Env vars (added to the Zod schema when implemented)

| Var | Purpose | Notes |
|---|---|---|
| `OWNER_WHATSAPP_ALERT_TO` | Destination number (the owner number (server env only; not printed here)) | **Server-only.** Never a `NEXT_PUBLIC_` var. If unset → alerting is a no-op. |
| `WHATSAPP_PROVIDER` | `meta` \| `twilio` \| unset | Unset → no-op. |
| `WHATSAPP_ACCESS_TOKEN` | Provider API token (secret) | Server-only secret; never logged. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta sender phone-number id | Meta path. |
| `WHATSAPP_TEMPLATE_NAME` | Approved template name | Meta path. |

**Rule:** the owner phone lives **only** in `OWNER_WHATSAPP_ALERT_TO` (server
env). It is never hardcoded, never in a `NEXT_PUBLIC_` var, never in the client
bundle. The literal the owner number (server env only; not printed here) must not appear anywhere in `apps/web` source
— a guard enforces this (§4).

### 3.4 Server-only best-effort helper (drop-in design)

```ts
// apps/web/lib/notify/owner-whatsapp-alert.ts  (added only when Part B is built)
import "server-only";

/**
 * Best-effort owner WhatsApp alert. Fully gated by env: if the provider/token/
 * destination are not configured, it is a silent no-op (honest: nothing is
 * faked). NEVER throws to the caller — a send failure must not affect the
 * /company-need submission, persistence, or the owner queue.
 */
export async function sendOwnerAlert(text: string): Promise<void> {
  const to = process.env.OWNER_WHATSAPP_ALERT_TO;
  const provider = process.env.WHATSAPP_PROVIDER;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!to || !provider || !token) return; // not configured -> no-op (honest)
  try {
    if (provider === "meta") {
      const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const template = process.env.WHATSAPP_TEMPLATE_NAME;
      if (!id || !template) return;
      await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // Uses an APPROVED template; body params carry the alert text.
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: template, language: { code: "lt" },
            components: [{ type: "body", parameters: [{ type: "text", text }] }] },
        }),
      });
    }
    // twilio branch analogous, behind WHATSAPP_PROVIDER === "twilio"
  } catch {
    // Swallow: best-effort. Optionally log a redacted, secret-free line.
  }
}
```

### 3.5 Wiring point (event #1 only — the sole flow that exists today)

In `apps/web/lib/staffing/company-need-form-actions.ts`, immediately after the
existing `const persisted = persist.ok;` (line ~112), fire best-effort **only on
success**, without awaiting in a way that can affect the response:

```ts
if (persisted) {
  // best-effort, never blocks the submission or persistence
  void sendOwnerAlert(buildCompanyNeedAlert(raw)).catch(() => {});
}
```

`buildCompanyNeedAlert(raw)` shapes a **safe** payload from fields already in the
action (company, country/region, sector, headcount, urgency, start/duration,
contact) — no secrets, no full row dumps. The alert send is **decoupled** from
`persist` and from the returned `CompanyNeedFormState`, so a WhatsApp failure
changes nothing the user or the queue sees.

### 3.6 Message formats (owner-facing, LT / EN)

```
Naujas įmonės poreikis LabourMarket.ai
Įmonė: {company_name}
Kontaktas: {contact_name} {contact_phone_or_email}
Sektorius: {sector}
Šalis/regionas: {country} / {city_or_region}
Kiekis: {headcount}   Skubumas: {urgency}
Pradžia/trukmė: {start_or_date} / {duration}
Queue: {admin_link}
```
```
New LabourMarket.ai company need
Company: {company_name}
Contact: {contact_name} {contact_phone_or_email}
Sector: {sector}   Country/region: {country} / {city_or_region}
Headcount: {headcount}   Urgency: {urgency}
Start/duration: {start_or_date} / {duration}
Open queue: {admin_link}
```

### 3.7 Events #2 (worker looking for work) and #3 (company searching people)

**Do not implement — the flows do not exist today.** There is no anonymous
worker "looking for work" submit and no company "search people" submit event to
hook (the map is signal-only). When/if such a flow is built, add the same
best-effort `sendOwnerAlert(...)` call at that action's success point, reusing
this helper. Tracked as follow-up, not faked.

---

## 4. Guards / tests to add (when the code path is built)

1. **No owner phone in client code** — assert the literal the owner number (server env only; not printed here) (and
   `OWNER_WHATSAPP_ALERT_TO`'s value pattern) never appears in `apps/web`
   non-server source or the built client bundle (extends `no-secret-leakage`).
2. **Helper is server-only** — `owner-whatsapp-alert.ts` imports `server-only`.
3. **Submission survives send failure** — `submitCompanyNeedAction` returns its
   normal state even if `sendOwnerAlert` throws/rejects (it is `void`+`catch`).
4. **Safe payload** — `buildCompanyNeedAlert` emits only the allowlisted fields,
   no secrets, no full row.
5. **Alerts only for real events** — only the `/company-need` success path calls
   the helper; no invented flows.
6. **Seed import requires source + permission** — import rejects rows missing
   `source` or a permission value; `verification_status` forced to `new`.
7. **No fake seed data** — no committed data rows in templates or fixtures.
8. **Destination is env-only** — number is read from env, never hardcoded; new
   env vars registered in the Zod schema and in `no-provider-secret-leak`.

---

## 5. What can be done now (no gate)

- Ship these seed **CSV templates** + this plan (this PR).
- Owner can **start filling the CSVs** from the warm network using the
  concierge sourcing scripts (`concierge-worker-sourcing-pricing-addendum-v1.md`
  §4–§5) — real, permission-cleared records only.

## 6. What is gated

- **Part A insert path** → needs the two staging tables (owner DB apply of the
  §2.3 migration; not applied here).
- **Part B WhatsApp send** → needs an owner-provisioned WhatsApp provider +
  approved template + secrets (§3.2–§3.3).

## 7. Required owner actions (exact)

1. **Decide the supply store:** approve the §2.3 migration, then apply it via
   Supabase MCP (manual, like the intake table) — or say "docs-only for now" and
   the owner keeps seeds in the CSVs until then.
2. **Pick a WhatsApp provider:** Meta WhatsApp Cloud API (recommended) or Twilio.
3. **Provision it:** create the WABA / Twilio sender, verify the sender number,
   get a permanent access token, and **get one utility template approved** for
   the alert.
4. **Provide secrets** (server env only, never client): `OWNER_WHATSAPP_ALERT_TO=<owner number, server env only>`,
   `WHATSAPP_PROVIDER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TEMPLATE_NAME`.
5. Then a follow-up **code PR** implements §2.4 (import) + §3.4–§3.5 (alert) +
   §4 (guards), validated end-to-end against the real provider.

## 8. Validation (this docs-only PR)

- `pnpm placeholders:check`, `pnpm check:i18n-debt`, `pnpm lint` — run and
  reported honestly. Docs/CSV changes do not affect message/placeholder/code
  scanners, so these confirm no regression rather than exercising new behavior.
- No migration is applied. No outbound send exists. No secret is added.

---

## Status of this plan

- Docs-only. No code, DB, RLS, RPC, auth, UI, dashboard, matching, map,
  CV/profile, billing, or provider change.
- No fake companies or workers; templates carry **zero** data rows.
- WhatsApp is **not** claimed to work — it is planned and gated on owner provider
  setup. The owner phone appears only as a destination the owner will place in
  server env, never in shipped client code.
