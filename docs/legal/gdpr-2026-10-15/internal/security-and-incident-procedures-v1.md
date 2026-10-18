# Security measures and personal-data breach procedure v1

- **Status:** DRAFT v1, 2026-10-15.
- **Review:** requires lawyer review. The notification wording and thresholds are for the controller and its counsel to decide. A Claude or agent session does not decide them.
- **Scope:** GDPR Art. 5(1)(f), 24, 32, 33 and 34.
- **Extends:** `docs/security/incident-response-v1.md` (2026-07-06). It does not replace it.
- **Sources:**
  - Audits A1, A2 and A3.
  - `docs/audits/labourmarketai-security-privacy-data-audit-v1.md` (SEC-12).
  - `docs/audits/labourmarketai-technical-operations-audit-v1.md` (:1552-1556, :1810).
  - `docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md` and `docs/ai/LOCAL_LLM_EVALUATION_2026-10-15.md`.
  - `.github/workflows/*.yml`.
  - Code on `origin/main` as of 2026-10-15.

> **LT santrauka.** Šis dokumentas aprašo saugumo priemones: RLS, `service_role` naudojimą (taip pat GitHub Actions paslaptis), atsargines kopijas ir žurnalus. Jame yra:
> - pažeidimų procedūra pagal BDAR 33 ir 34 str. su 72 valandų laiko juosta;
> - vaidmenys;
> - pažeidimų registro šablonas.
>
> Atsarginių kopijų (PITR) langas ir atkūrimas nėra įrodyti.
>
> ATVIRAS KLAUSIMAS: ar asmeninių žinučių tekstų siuntimas į Gemini iki #2399 (galimai nemokamu planu) yra asmens duomenų saugumo pažeidimas arba neteisėtas tvarkymas, apie kurį reikia pranešti VDAI. Sprendžia savininkas kartu su teisininku. Faktai pateikti 7 skyriuje.

## 1. Access control (Art. 32(1)(b))

| Control | What exists (evidence) | Gap / note |
|---|---|---|
| **Row-Level Security (RLS)** | Fail-closed RLS on personal tables. Worker visibility goes through `can_view_worker()`: consent (`worker_profile_discoverable()`) or an accepted-relationship arm (`legal-basis-matrix-v1.md`). Consent RPCs derive the subject from `auth.uid()` only. There is no admin consent-edit function (guard-tested). | RLS correctness is pinned by guard tests in `apps/web/lib/guards/*`. This pack did not re-audit the policies. |
| **Superadmin / operator** | Superadmin gates fail closed when the role read is unanswered (`apps/web/lib/auth/role-read-honesty.test.ts:190-196`). The privacy request queue is superadmin-only. | MFA: the account page reads MFA factors (`apps/web/app/[locale]/dashboard/account/page.tsx:136-141`). **Whether MFA is enforced for superadmin accounts is NOT EVIDENCED** [OWNER: confirm or enforce]. |
| **`service_role` in the application** | 31 non-test source files under `apps/web/lib` and `apps/web/app` reference the admin / service-role client or key (grep, 2026-10-15). Examples: commercial hand-off dispatch through a SECURITY DEFINER RPC granted to service_role only (`apps/web/lib/commercial/handoff-dispatch.ts:38-43`); cron routes. The service role's table grants have been narrowed in places (same file: "service_role holds no table grant on skills / professions / languages / profiles"). | A full inventory of service-role grants is **not part of this pack** [VERIFY]. Recommendation: one register of every service-role call site and its purpose. |
| **`service_role` in GitHub Actions** | `SUPABASE_SERVICE_ROLE_KEY` is a repository secret used by `ingestion-freshness.yml`, `nav-supply-cadence.yml`, `prod-qa-walk.yml`, `product-monitor.yml` and `sweden-supply-cadence.yml`. `CRON_SECRET` is used by `job-alerts-cadence.yml`. These run on GitHub-hosted (US) runners. Observed reads are aggregates, cursors and synthetic QA. The supply cadences write vacancy data. | GitHub is therefore a processor with full technical access (G-27). Recommendations: replace the key with a narrowly granted role or RPC per workflow; restrict secrets to protected environments and branches; record the rotation dates. |
| **Cron / API authentication** | `authorizeCronRequest` uses a bearer `CRON_SECRET` and fails closed while unset (`apps/web/app/api/cron/job-alerts/route.ts:14-24`). The MCP door uses OAuth 2.1 (Supabase OAuth server) with the caller's RLS. Writes need one-time confirmation tokens (`apps/web/lib/capabilities/confirmable.ts`). | Employer-side MCP grants are not counted or audited per organisation (DPIA S14). |
| **Licensor** | Labour Market AI Sp. z o.o. has no Supabase role, no service key and no admin account (`entity-role-and-data-access-matrix-v1.md`). | Keep it that way. Any change goes through licence §5. |

## 2. Data protection by design (Art. 25, 32(1)(a))

| Area | What exists |
|---|---|
| Minimisation | No IP or user agent in the consent ledger. Telemetry metadata allowlist with ≤200-char values and a ≤2 KB total. AI payloads limited to allowed fields. A default-deny AI egress gate (`apps/web/lib/ai/runtime/data-egress.ts`) whose grants are task-scoped and need paid-tier confirmation. |
| Storage | All 6 Storage buckets are private, with short-lived signed URLs. |
| Integrity | Append-only or immutable triggers on 24 tables, and hash chains on journals, assistant messages and evidence. The `migration-safety` CI check flags RLS loosening. |
| Secrets | Guard tests `no-secret-leakage` and `no-provider-secret-leak`. The public repository forbids personal identifiers. `/runtime/auth/` is ignored. |

## 3. Backups and recovery (Art. 32(1)(c))

**What is evidenced:**
- Backups are provider-managed by Supabase (`data-retention-matrix-v1.md`, "Backups" row).

**What is NOT evidenced:**
- the Supabase plan tier and whether PITR is enabled;
- the PITR window or RPO;
- any restore ever performed or rehearsed;
- a DR runbook (SEC-12: "Absence of evidence here is the finding", :673).

**Consequences for erasure:**
- Erased data stays in provider backups until those backups rotate.
- The window is unknown, so the DSR completion notice cannot yet state it.
- After any restore, erasures completed since the backup must be **re-applied**. This needs a list of completed erasure request ids, kept outside the restored database.

**Owner actions:**
1. Confirm the plan and the PITR window.
2. Write `docs/runbooks/disaster-recovery-v1.md`.
3. Rehearse a restore to a branch project and record the RTO.
4. Add the "re-apply erasures after restore" step.

## 4. Logging (Art. 32, 5(2))

| Log | Holds | Retention | Note |
|---|---|---|---|
| `audit_logs` (1,097) | actor id, action, payload | none | **The payload contains subject identifiers** (`display_name`, `profile_id`, `worker_id`, `confirmed_by`, before/after). It must be scrubbed on erasure (G-18). |
| `privacy_consent_events`, `personal_data_disclosures` | consent and disclosure proof | append-only | Admins cannot read the ledger history. |
| `customer_requests.payload.privacy_review_log[]` | DSR review steps | none | Destroyed by the account cascade today (G-16). |
| `ai_runs` (418) | task, provider, model, blocked_reason, excerpt | excerpt redacted at 90 d (applied) | This is the evidence base for the Gemini assessment (§7). **Preserve the rows; do not purge them before the assessment ends.** |
| `pilot_events` (13,376) | telemetry | none | Not a security log. |
| Vercel function logs; Supabase auth/API logs | requests, errors, IP | provider window [NOT EVIDENCED] | There is no error-monitoring SaaS. Console and Vercel logs only. |

**Gaps:**
- no alerting on anomalous reads, for example a bulk MCP tool read by one organisation;
- no record of who accessed `audit_logs` itself.

## 5. Roles in an incident

| Role | Who | Responsibility |
|---|---|---|
| **Incident lead / controller decision-maker** | Director of UAB „Nonstop Group“ (owner) | Declares the incident. Decides on Art. 33 and 34 notification with counsel. Signs notifications. |
| **Legal counsel** | External lawyer [OWNER: name the firm or contact] | Risk assessment and wording. Liaison with VDAI. |
| **Technical lead** | Owner's engineering function. AI coding agents may act under explicit owner instruction. | Containment, evidence preservation, scope queries (counts first, no personal values printed), fix and guard test. |
| **Processors** | Supabase, Vercel, Stripe, Resend, Hostinger, GitHub, Google | Art. 33(2): notify the controller without undue delay. The notification contact address in each vendor account must be the owner's monitored mailbox [OWNER: verify]. |
| **Licensor** | Labour Market AI Sp. z o.o. | Not involved (no access). Informed only if IP or code is involved. |

**Rule:** an agent session may contain, assess and draft. It must never send a notification to VDAI or to data subjects, and it must never classify an incident as "not notifiable" on its own.

## 6. Breach procedure: Art. 33 and 34 timeline

The clock (T0) is the moment the controller becomes **aware**: reasonably certain that a security incident has compromised personal data (EDPB Guidelines 9/2022).

| Time | Step | Output |
|---|---|---|
| T0 | Anyone detects or receives a report through any channel: a user, a processor notice, a guard test failure, an ai_runs anomaly, a researcher, or info@labourmarket.ai. They tell the incident lead immediately. | An entry in the breach register (§8), "under assessment", with T0 recorded. |
| T0 → +4 h | **Contain.** Rotate the affected secret (Supabase or Vercel env, GitHub secrets). Revoke sessions (`auth.admin.signOut`) or OAuth grants. Disable the feature through its flag. Revoke the egress grant (`data-egress.ts`) or unset the env flag. **Preserve evidence**: export the relevant `ai_runs`, `audit_logs` and provider logs to the owner's private store. | A timeline in the incident record. |
| +4 h → +24 h | **Assess.** Answer: what data, whose, how many (counts), since when, which recipient, whether the data was encrypted or pseudonymised, and whether recovery is possible. Classify the breach as confidentiality, integrity or availability. Apply the risk test: no risk / risk / high risk. | A risk assessment, with the lawyer involved. |
| ≤ +72 h | **Art. 33 notification to VDAI** unless the breach is *unlikely to result in a risk*. Contents (Art. 33(3)): nature, categories and approximate numbers of subjects and records, contact point, likely consequences, measures taken and proposed. Information may be given in phases (Art. 33(4)). If late, state the reasons for the delay. Channel: VDAI's published breach-notification form or procedure [LAWYER: confirm current channel]. | A notification copy in the owner's private store. |
| without undue delay | **Art. 34 communication to data subjects** if there is a *high risk*. Use clear, plain language in their locale, covering Art. 34(2) content. Exceptions under Art. 34(3): encryption or similar, subsequent measures, or disproportionate effort (then a public communication instead). | Message copies. Delivery is limited by the e-mail channel available, because app transactional e-mail is inactive. |
| +7 days | **Review.** Root-cause fix plus a guard test. Update this document. | A closed register entry. |
| always | **Art. 33(5): document every breach**, including those not notified, with facts, effects and remedial action. | The breach register. |

**Processor-side incidents.** When a processor notifies us, our T0 is the time we receive its notice. Vendor DPAs are not evidenced (G-07), so their notification commitments are unknown.

## 7. OPEN ITEM: Gemini historical processing [OWNER + LAWYER DECISION]

**Question.** Was sending personal message text and chat sentences to the Gemini API before PR #2399 a **personal data breach** under Art. 4(12), or **unlawful processing** (missing Art. 28 contract, possibly an Art. 44 transfer without a mechanism)? Does it require an Art. 33 notification and, if high risk, an Art. 34 communication?

**Facts (as recorded in the repo, 2026-10-15):**

1. **Live calls.** Live Gemini calls ran from **2026-08-28** (`subprocessor-register-v2.md`, Gemini row).
2. **Owner grants.** The owner granted egress for `propose_conversation_intent` on 2026-09-05 and `translate_message` on 2026-09-17, both described in code comments as "paid tier" (`apps/web/lib/ai/runtime/data-egress.ts:124-172`).
   - The comment "actual costs billed since 2026-08-28" is an assertion, not billing proof. The platform's own cost rows (`usage_cost_events`, 382) are computed from a price table (`model-registry.ts`) and do not prove that Google billed anything.
3. **Volume — measured on production 2026-10-15 by calls that actually reached Gemini** (`ai_runs` rows with `input_tokens > 0`; the `data_categories_sent` column records the INTENDED categories even when the egress gate refused, so counting rows overstates egress):
   - `translate_message`: **145** calls with tokens (139 with output), 2026-09-28 → 2026-10-09 (236 rows attempted).
   - `propose_conversation_intent`: **79** calls with tokens, 2026-09-05 → **2026-10-14 21:28 UTC** (last real send; 86 rows attempted).
   - `translate_vacancy` 13 and `extract_cv` 2: **0** calls reached the vendor (refused by the egress gate; the two `extract_cv` rows of 2026-10-15 show `vendor call failed: … data egress gate … PERSONAL`, latency 0–1 ms, no tokens).
   - Since PR #2399 (merged 2026-10-15 05:02 UTC) no personal-data call has reached Gemini.
4. **Billing signal.** Between 2026-10-01 and 2026-10-09 there were **83 errors** of the form `429 RESOURCE_EXHAUSTED … check your plan and billing details` (`docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md:15`). These are consistent with free-tier limits but are not proof.
5. **Payload.** Message body ≤8000 characters, plus source language, target locale and fixed context. No ids, names or attachments. Chat sentences carry a coarse role. Message text is unbounded human text and may name third parties.
6. **Containment.** PR #2399 is merged and live. Both personal-data grants now require `AI_GEMINI_PAID_TIER_CONFIRMED=1`, which is unset, so only PUBLIC `explain_market_demand` runs.
7. **Conflict resolved (2026-10-15).** The two `extract_cv` rows were refused by the egress gate before any vendor call (see 3). No CV or bio text was sent.
8. **Gemini free-tier terms.** Content may be used to improve Google's products and may be read by human reviewers. On the paid tier Google acts under its processor terms (`GEMINI_SAFE_OPERATION` §2; verify against the current terms).

**Assessment path:**

1. **Establish the tier.**
   - The owner opens Google Cloud → the project behind the production `GEMINI_API_KEY` → Billing.
   - Record whether billing was enabled and from which date. Keep a screenshot in the private store.
   - **If billing was enabled for the whole period** and the paid terms with the processor DPA applied, Google was a processor. The issue then reduces to the missing evidence of DPA acceptance and an undocumented transfer basis (G-07). That is not a breach.
2. **If any part of the period ran on the free tier:**
   - Google received personal data as a **non-processor**. Characterisation [LAWYER]:
     - (a) unauthorised disclosure, which is a breach under Art. 4(12) even though the act was deliberate, because the recipient was not authorised as a processor;
     - (b) unlawful processing without Art. 28 terms, assessed under Art. 5 and 6 rather than Art. 33.
   - Many supervisory authorities treat disclosure to an unauthorised recipient as a confidentiality breach.
   - Risk factors:
     - free-text work messages between colleagues, low to moderate sensitivity, but unbounded;
     - a limited number of subjects (the participants of translated conversations, measurable from `ai_runs` and `conversation_messages` by count);
     - no ids or names sent, though content may identify people;
     - possible human review and training use by Google;
     - no recall possible.
   - Decide **risk / no risk / high risk** and notify accordingly.
3. **Awareness date (T0)** [LAWYER].
   - Candidates are 2026-10-14 (register v2 flagged the tier as a P0 VERIFY) or 2026-10-15 (this audit compiled the 429 evidence).
   - Facts point to *possible* awareness. EDPB allows a short investigation period before T0 if it is pursued promptly.
   - **Recommendation:** open a register entry today with T0 = 2026-10-15 "under assessment", and do step 1 at once.
4. **In all cases.**
   - Record the outcome in the breach register (Art. 33(5)).
   - Correct the public AI disclosure (G-09).
   - Do not re-enable the grants until the tier and the DPA are evidenced and a DPIA addendum exists (DPIA §9).
   - Consider asking Google to delete the logged content, if its terms provide a mechanism [OWNER].

**Decision record (to be filled in):** tier finding · characterisation · risk level · notify VDAI yes/no (date) · inform subjects yes/no · decided by · counsel · date.

## 8. Breach register: template

Keep the breach register **outside this public repository**, in the owner's private document store. Do not put it under `runtime/` either: the repo convention force-adds files there (`.gitignore:26-36`). Entries must not contain personal values. Use counts and request or incident ids.

| Field | Content |
|---|---|
| Incident id | `INC-YYYY-NNN` |
| T0 (awareness) | date and time, and how it was learned |
| Detected by / channel | |
| Description | what happened (facts only) |
| Breach type | confidentiality / integrity / availability |
| Data categories | per matrix ids (M01…) |
| Subjects affected | count (approximate); categories |
| Records affected | count |
| Processor involved | register v3 id |
| Containment actions | with timestamps |
| Risk assessment | none / risk / high; reasoning; counsel |
| Art. 33 notified? | yes (date, reference) / no (reason) |
| Art. 34 communicated? | yes (date, channel) / no (reason, Art. 34(3) ground) |
| Root cause | |
| Remediation / guard test | PR number |
| Closed | date, by |

**First entry to create:** `INC-2026-001`, Gemini historical processing (§7), status *under assessment*.
