# Future modules — technical specification (P2, after the V2 launch)

Status: **SPECIFICATION ONLY, 2026-11-12.** Nothing here is built, migrated, flagged on or connected.
Owner order: audit, specification and register rows only; no prototype, no production migration and no
external connection without a separate owner approval. Neither module is part of the 2026-11-15 release.

Register rows: [`../FUNCTION_REGISTER.md`](../FUNCTION_REGISTER.md) § "Future modules". IDs carry the
prefix `P` (planned) so the register tools, which count `N.N` rows, keep the 288 readiness figures unchanged.

Target is not status: these modules EXTEND the canonical architecture
([`../../OWNER_TARGET_ARCHITECTURE_V1.md`](../../OWNER_TARGET_ARCHITECTURE_V1.md)); they add no node.
Module A attaches to Skills / Evidence / Qualifications / Recognition (§1.2, §1.10); Module B attaches to
the control layer and distribution surfaces (§1.3, §1.7, §1.8, §1.13).

---

## 0. What already exists (audit of `main`, 2026-11-12) — reuse, never duplicate

| Area | Exists today | Consequence |
|---|---|---|
| Living CV | `lib/journal/professional-experience.ts`; evidence ladder `lib/evidence/evidence-tier.ts` (`self_declared`, `work_journal`, `manager_confirmed`); per-skill state `lib/profile/skill-evidence-state.ts`; potential skills `lib/skills/potential-skills.ts`; tables `worker_skills`, `profile_skill_claims`, `journal_entry_skills`, `worker_documents`, `worker_education` | A result is a new **evidence source** read by the same modules, not a second CV |
| Tests / quizzes | **None.** `training_certification_v1` and `competency_recognitions_v1` state explicitly: no tests, no scoring, no assessment workflow | Module A is new; it must not turn recognition or reviews into scores |
| Training, education, recognition | `training_programs`, `training_assignments`, `training_skill_links`; `education_programs`, `education_cohorts`; `competency_recognitions` (+ record / revoke RPCs) | An assessment can be linked to a programme; formal recognition stays with the assessor authority (§1.10) |
| Consent | `lib/privacy/consent-definitions.ts` (purposes, disclosable fields, versioned text hash); append-only `privacy_consent_events`; `personal_data_disclosures`; per-organization `grant_/withdraw_employer_data_disclosure`; `my_privacy_consent_history` | Disclosure of results = one new purpose and field set in the SAME registry and ledger |
| Taxonomy | ESCO tables (`esco_occupations`, `esco_skills`, `esco_occupation_skills`), own `professions`, `profession_skills` | The test catalog keys on these; no new taxonomy |
| Matching guards | `labour-market-os-human-control.test.ts` (no auto reject / accept), `fit-not-rating.test.ts`, `recognition-is-not-a-score.test.ts` | Module A adds guards of the same kind; it changes none |
| Assistant and actions | `lib/conversation/action-registry.ts` (56 actions, confirmation tiers), HMAC one-time confirmation tokens (`confirmation-token.ts`, `confirmation_spends`), capability layer `lib/capabilities/` shared by chat and MCP | Module B's skills ARE capabilities in this registry; the confirm step is this mechanism |
| AI runtime | `lib/ai/runtime/` (provider chain, `data-egress.ts`, `ai_runs` audit, daily caps) | Skills run through it; no second runtime |
| MCP (inbound) | `/api/mcp`, Supabase OAuth 2.1 server, consent screen, "Connected apps" with revoke; receipts via `record_external_action_receipt_v1`; `audit_logs` | Inbound door exists. Module B is the **outbound** side, which does not exist |
| Outbound connections | **None**: no third-party OAuth, no connector or token tables, no token-encryption helper, no integrations page. `lib/config/outbound-host-policy.ts` allowlists hosts | All of Module B's storage is new and RED |
| Flags | No generic flag system: constant kill switches (`PAYMENTS_ENABLED`), env `*_ENABLED`, catalogue `lib/config/feature-availability.ts`, table `platform_capability_grants` | Both modules use these: env kill switch + catalogue `hidden` + per-organization grant |
| Authority and plans | `lib/company/active-organization.ts`, `organization-authority.ts`; SQL helpers `is_active_org_member`, `manages_organization`; `lib/billing/entitlements*.ts` (`gateFeature`, `resolveEntitlements`) | Access checks compose these; no new role system |
| Agentai OS | Architecture §1.8 / §1.13: one integration contract for ChatGPT, Agentai OS and any authorised agent; rows 10.14–10.16, 10.23 | Agentai OS connects through the existing MCP door, not through a new one |

---

## Module A — voluntary competence and work-style assessments

### A.1 Functions

| ID | Function | For whom |
|---|---|---|
| P14.1 | Assessment catalog by profession (knowledge, practical skill, work style), keyed on ESCO / `professions` | worker, job seeker |
| P14.2 | Take a voluntary knowledge assessment; result with method, version and date | worker |
| P14.3 | Practical-skill assessment: a task checked by a named human assessor against a rubric | worker, assessor |
| P14.4 | Work-style self-reflection (descriptive, no score, no ranking, no diagnosis) | worker |
| P14.5 | Result in the Living CV as its own evidence source, never merged with confirmed work | worker |
| P14.6 | Per-employer consent to disclose a chosen result | worker |
| P14.7 | Withdraw consent, hide or delete a result; consent history | worker |
| P14.8 | Employer view of a disclosed result with its limits stated (what it does and does not show) | company, agency |
| P14.9 | Method governance: per-test reliability, bias and accessibility record; publication gate | operator |
| P14.10 | Automated-decision prohibition: results never filter, rank or reject candidates | system |

### A.2 Architecture

- **Two kinds, separated in data and in UI.** `competence` (knowledge, practical) can become evidence for a
  skill. `work_style` is a self-description: no numeric score stored, no comparison between people, never an
  input to matching, fit, search order or shortlists. The split is a column with a check constraint and a guard
  test, not a convention.
- **Evidence, not verification (SEP-3, SEP-6).** A passed knowledge test is a new source
  `assessment_result` shown beside, and below, work-journal and manager-confirmed evidence. It never raises a
  skill to `manager_confirmed` or `verified`, and never creates a `competency_recognitions` row. Only a human
  assessor with authority can do that, through the existing recognition RPC.
- **Reads go through the existing Living CV modules** (`professional-experience.ts`, `skill-evidence-state.ts`).
  No second profile store (decision 0024, 0025).
- **Consent** reuses the registry and ledger: one new purpose `assessment_result_disclosure`, granted per
  organization and per result, versioned text hash, append-only events, withdrawal effective at once. Default:
  private. The employer read path is one SECURITY DEFINER function that checks the live grant on every read.
- **No automated decision.** Results are absent from every matching and search input. A guard test lists the
  matching modules and fails if any imports the assessment read module.
- **Catalog content** is data (versioned test definitions), authored and reviewed by a named human; AI may
  draft items but may not publish them (no fake verification, doctrine §7).

### A.3 Data model (all additive, all RED: new personal-data tables with RLS)

| Table | Purpose | Notes |
|---|---|---|
| `assessment_definitions` | catalog entry: kind, profession / ESCO link, language, method note, status | public read for `published` only |
| `assessment_versions` | immutable versioned content and scoring rule; reliability and bias record | a result always points at a version |
| `assessment_attempts` | one attempt by one person; state, started / finished | owner-only RLS |
| `assessment_results` | outcome: `competence` → level + per-skill breakdown; `work_style` → descriptive text keys only | check constraint: no numeric score when kind = `work_style` |
| `assessment_result_skill_links` | result → `skills` rows it supports | read by skill-evidence-state |
| consent | no new table: new purpose in `privacy_consent_purposes`; events in `privacy_consent_events`; disclosure rows in `personal_data_disclosures` | per organization, per result |

Migrations: one additive migration per stage, each with a rollback file; nothing touches existing tables
except one new row in the consent-purpose registry.

### A.4 Integration points

Living CV screen (new "Assessments" evidence group); learning compass (11.3) may suggest an assessment;
training programmes (11.8) may link one; employer candidate view shows a disclosed result with the consent
date; assistant actions `worker.start-assessment`, `worker.share-assessment-result_prepare/_confirm`,
`worker.withdraw-assessment-share_prepare/_confirm` in the existing registry; MCP inherits them.

### A.5 Risks

| Risk | Treatment |
|---|---|
| **EU AI Act**: AI used to evaluate candidates or make employment decisions is high-risk (Annex III, employment) | Phase 1 has no AI scoring and no decision use; any AI scoring or use in selection needs the separate legal review first. Emotion inference is out of scope permanently |
| **GDPR**: profiling, Art. 22 automated decisions, special categories (a psychological test can reveal health data), purpose limitation | DPIA before the first real user; explicit consent per disclosure; no automated decision; work-style content reviewed so it cannot amount to a health or personality diagnosis; retention and deletion rule; data minimised in the employer view |
| **Validity and reliability**: an unvalidated test misleads both sides | Every published version carries its method record; "self-check, not validated" label until a competent reviewer signs the method; practical skills need a human assessor |
| **Bias and discrimination** (language, age, disability, origin) | Items reviewed per language; accessibility WCAG 2.1 AA, no time pressure by default, screen-reader path; adverse-impact check before any employer-facing use |
| **Coercion**: an employer demanding results | Voluntary by design: no employer-initiated test request in Phase 1; absence of a result is shown as nothing, never as a negative (SEP-7: unknown ≠ zero) |
| **Cheating / identity** | Result labelled unproctored; never presented as certified |
| **Reduction risk** (qualification platform, CV builder) | Assessment is one evidence source among several; never a gate to visibility or to applying |

### A.6 Minimum isolated prototype (needs owner approval before any code)

One profession, one language, one knowledge self-check of about 15 items; result visible only to the person
in the Living CV behind an env kill switch and a per-profile grant; no employer view, no consent flow, no
work-style part. Local and CI database only.

### A.7 Tests and acceptance

- RLS: another user and another organization read nothing; an employer reads a result only with a live grant;
  withdrawal removes access on the next read (PG16 proof + e2e).
- Guard: no matching, search or shortlist module imports assessment data; `work_style` rows cannot hold a score.
- Guard: no copy says "verified", "certified" or ranks people by a test.
- Consent history shows grant and withdrawal with text version.
- Accessibility: keyboard and screen-reader pass; Lighthouse a11y ≥ 95; LT / EN / SV parity.
- Before use in real selection: signed legal, methodological and security review (owner gate).

### A.8 Scope estimate (relative, not dates)

| Stage | Content | Size |
|---|---|---|
| A-1 | catalog + knowledge self-check, private result in Living CV | M (2 RED migrations, about 6–8 PRs) |
| A-2 | per-employer disclosure, withdrawal, employer view | M (RED) |
| A-3 | practical assessment with human assessor | L (depends on assessor authority, §1.10 / ARCH-2) |
| A-4 | work-style self-reflection | S–M, only after the methodological and legal review |

Dependencies: 2.12–2.16 (skills, evidence ladder), 2.35 and the consent ledger (9.x), 11.3, 11.8, 11.10
(assessor authority), language parity (8.x).

---

## Module B — AI connections and skills

### B.1 Functions

| ID | Function | For whom |
|---|---|---|
| P15.1 | Connections page: personal and organization connections, state, last use, disconnect | user, org owner / admin |
| P15.2 | Connect an external account by OAuth 2.0 authorization code + PKCE, minimal scopes | user, org admin |
| P15.3 | Google Workspace connector (calendar read first; mail draft, files later) | user, company |
| P15.4 | Microsoft 365 connector (same order) | user, company |
| P15.5 | Generic connector contract for other business systems (API key or OAuth; outbound MCP client later) | company |
| P15.6 | Encrypted token vault with rotation and revocation | system |
| P15.7 | Assistant skill catalog: which skills exist, what each may read and do, which connection it needs | user, org admin |
| P15.8 | Skill access by user, organization, role and plan | org admin |
| P15.9 | Confirmation before every external write (send mail, create event, change a record) | user |
| P15.10 | Connection and action audit log, visible to the user and the organization admin | user, org admin |
| P15.11 | Organization policy: allowed connectors, allowed skills, disable all | org owner / admin |
| P15.12 | Error handling: expired or revoked token, provider limits, partial failure; honest state | user |
| P15.13 | Agentai OS attachment through the existing integration contract | operator |

### B.2 Architecture

- **A skill is a capability.** Skills are entries in `lib/capabilities/registry.ts` with extra metadata
  (required connector, required scopes, confirmation tier, plan key). Chat, MCP and Agentai OS see the same
  list. No second catalog, no second action system (decision 0017, §1.8).
- **Two owners of a connection, never mixed.** `user` connections belong to one person and act only for that
  person. `organization` connections belong to the organization, are created only by owner / admin, and are
  used only inside the server-resolved active workspace. A person's private connection is never visible to or
  usable by their employer.
- **Token handling.** Tokens never reach the browser or the model. Stored encrypted (envelope encryption, key
  from the secret store, key id per row for rotation); refresh on the server; the table has no client grant at
  all: access only through SECURITY DEFINER functions called by the server connector module. Least scope:
  start read-only, request a write scope only when the user enables a skill that needs it (incremental consent).
- **Confirmation** uses the existing one-time HMAC token bound to action, input hash, user and state. Every
  external write is `important_write` or `strong_irreversible`: the user sees the exact recipient, content and
  target before confirming. No autonomous sending in any plan (owner rule: no autonomous commercial
  correspondence).
- **Prompt-injection boundary.** Content fetched from a connector (mail, documents, calendar text) is DATA.
  It is passed to the model marked as untrusted, it can never select a tool, widen a scope or satisfy a
  confirmation; a write proposed in a turn that read external content always needs the human confirm; no
  chaining of read-external → write-external without it.
- **Egress** goes through `lib/ai/runtime/data-egress.ts` and `outbound-host-policy.ts`: per-connector host
  allowlist; connector data is not sent to an AI provider unless the organization policy allows that provider.
- **Tenant isolation.** Every row carries owner kind + owner id; RLS and the definer functions resolve the
  workspace on the server; cache keys and logs carry the organization; no cross-organization read path exists.
- **Audit** reuses `audit_logs` and the external-action receipt, channel `assistant_connector`: who, which
  organization, which connector, which skill, what object, result. Content is not logged, only references.
- **Agentai OS** attaches as an authorised client of the existing MCP door (§1.13 DELEGATE / PROVIDER); it
  gets no direct token access and no separate skill list. Open decisions AGENT-1…4 and X-2 (MCP scopes,
  row 10.4) stay the owner's.
- **Flags.** Env kill switch `CONNECTORS_ENABLED` (default off), per-connector switch, catalogue entry
  `hidden`, per-organization grant in `platform_capability_grants`, plan key through `gateFeature`.

### B.3 Data model (all additive, all RED: credentials, auth-adjacent, RLS)

| Table | Purpose | Notes |
|---|---|---|
| `connector_definitions` | catalog: provider, auth type, allowed scopes, hosts | code-seeded, read-only |
| `connections` | owner kind (`user` / `organization`), owner id, provider, granted scopes, state, created by | RLS: own, or governed organization |
| `connection_secrets` | encrypted access / refresh token, key id, expiry | no client grants; definer-only |
| `connection_oauth_states` | PKCE verifier and state, single use, minutes of life | security item: short life is correct here, the 12-month internal rule does not apply |
| `organization_connector_policies` | allowed connectors, skills and AI providers per organization | owner / admin write |
| `skill_grants` | skill enabled for a user, role or organization | resolved together with the plan |
| audit | no new table: `audit_logs` + receipt RPC with a new channel | — |

### B.4 Integration points

Account page "Connected apps" (inbound) gains a sibling "Connections" (outbound); organization settings gain
the policy screen; assistant uses skills through the capability registry; calendar (internal projection) may
show external busy time as read-only derived data (SEP-1, never stored as fact); billing entitlement keys;
`/admin/agent-os` lists connector skills.

### B.5 Risks

| Risk | Treatment |
|---|---|
| Prompt injection through mail or documents | B.2 boundary; red-team test set in CI; human confirm on every external write |
| Excessive scopes | read-only first; incremental consent; scope list shown in plain language; periodic unused-scope report |
| Token theft or leak | encryption at rest, no client grants, no tokens in logs or model context, rotation, immediate revoke at the provider on disconnect |
| Cross-organization leak | server-resolved workspace, RLS, isolation tests with two organizations in CI |
| Unauthorised automatic action | no autonomous external writes; one-time confirmation; rate limits; organization kill switch |
| Offboarding | removing a member disables their use of organization connections at once; organization connections belong to the organization, not to the person who created them |
| Provider verification | Google restricted scopes (mail, files) need app verification and a security assessment; Microsoft needs publisher verification and often tenant admin consent — external lead time and cost, owner decisions |
| GDPR | the platform becomes a processor of connected mailbox / calendar data: DPA, records of processing, sub-processor list, retention = no content stored beyond the request |
| Reduction risk (AI chatbot) | skills act on the graph and on the user's tools; the conversation stays one surface |

### B.6 Minimum isolated prototype (needs owner approval before any code)

One connector, one read-only skill: a personal Google Calendar connection (scope: calendar read-only) with
"show my external busy time next to my LabourMarket calendar". Test Google project, synthetic account, local
and CI only, kill switch off in production. No mail, no writes, no organization connections.

### B.7 Tests and acceptance

- OAuth: state and PKCE single use; replay and mix-up refused; token never in a response, log or model prompt.
- Isolation: two organizations and two users; no read of another owner's connection by any path (PG16 + e2e).
- Revocation: disconnect removes the secret, revokes at the provider, and the next call fails honestly.
- Confirmation: an external write without a spent one-time token is refused; a changed payload voids the token.
- Injection suite: fetched content containing instructions causes no tool call and no scope change.
- Policy: a disabled connector or skill is unavailable in chat, MCP and Agentai OS alike.
- Plan gating through `gateFeature`; nothing presented as available while hidden.
- Independent security review (RED lane) on every stage; penetration test before any write scope in production.

### B.8 Scope estimate (relative, not dates)

| Stage | Content | Size |
|---|---|---|
| B-1 | vault, connection model, connections page, one read-only connector | L (3 RED migrations, about 10–12 PRs, security review) |
| B-2 | skill metadata, grants, organization policy, audit view | M |
| B-3 | first write skill with confirmation (calendar event or mail DRAFT, not send) | M, after penetration test |
| B-4 | Microsoft 365, generic contract, send-mail skill | L, provider verification lead time |
| B-5 | Agentai OS attachment | M, after AGENT-1…4 and X-2 |

Dependencies: 10.1–10.4 (MCP, scopes), 10.6 (AI runtime keys — today BLOCKED), 10.17 (receipts), 7.x plan
matrix (owner decision), 9.x audit and privacy, 3.x roles, the secret store.

---

## Order after the V2 launch

1. V2 stable in production; real-user test done. Nothing below starts before that.
2. B-1 design review and A-1 design review by the RED security lane (documents only).
3. A-1 (smaller, no external party, no credentials) — first to build, behind a kill switch.
4. B-1 with one read-only connector in a test project.
5. A-2, then B-2 and B-3.
6. A-3 / A-4 and B-4 / B-5 only after their named reviews and owner decisions.

## Owner approvals this specification will need (none is requested now)

| # | Decision | Blocks |
|---|---|---|
| 1 | Approve building any prototype (A.6, B.6) | all code |
| 2 | Legal + methodological + security review before assessments are used in real selection; who performs it | A-2 employer view in production |
| 3 | Whether work-style self-reflection is offered at all, and who signs its method | A-4 |
| 4 | Each real external connection: provider, scopes, test vs production project | B-1 onward |
| 5 | Provider verification cost and the legal entity named on consent screens (Google, Microsoft) | B-3, B-4 |
| 6 | Plan placement of both modules (FREE / PREMIUM) | gating |
| 7 | Every RED migration and its production apply, as usual | each stage |
| 8 | Agentai OS scope: AGENT-1…4 and X-2 | B-5 |
