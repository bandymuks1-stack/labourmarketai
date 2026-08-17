# LabourMarket.ai vs Vecticum — capability matrix (2026-08-17)

Vecticum inventory: researched live from vecticum.lt + docs.vecticum.lt on
2026-08-17 (~800 client companies, LT/Baltic HR+DVS+finance-ops SaaS,
eIDAS e-signature via Dokobit/MarkSign, OCR invoices, PWA, €19–€49/mo
public HR plans, quote-based DVS/finance). Vecticum has NO external
labour marketplace, NO worker-side product, NO matching/skills
intelligence, NO meaningful AI beyond invoice OCR.

LM columns: from the 2026-08-17 reality audit of origin/main `9ecd063b`
(evidence in `full-reality-audit-2026-08-17.md`) — statuses are proven
end-to-end classifications, not aspirations.

Legend: ✔ full, ◐ partial, ✖ absent. "LM AFTER" = after this train's
merged slices only (no speculation).

| Capability | Vecticum | LM current | LM after train | LM advantage angle | Evidence (LM) |
|---|---|---|---|---|---|
| Employee card | ✔ deep (personal data, history, docs, equipment) | ◐ worker profile + skills + education/achievements; no org-side employment card | ◐ | Worker OWNS the profile; portable across employers (Vecticum card is employer-owned) | `workers`, `worker_education`, `worker_achievements`, profile routes |
| Organization structure | ✔ tree view, departments, subsidiaries | ◐ organizations + memberships + teams; no dept tree | ◐ | Multi-org marketplace context vs single-company tree | `organizations`, `company_memberships`, `team_details` |
| Recruitment | ✔ candidate DB + pipeline + scoring | ✔ demand → shortlist → booking pipeline + EXTERNAL market of 41,606 live vacancies / 7,669 employers | ✔ | External supply: Vecticum recruits only from its own inbox; LM sees the whole Swedish market + matching | `demand_shortlist`, `booking_requests`, `public_vacancies` |
| Onboarding | ✔ templated task sets, self-service intake | ◐ project readiness checklists only; no employment onboarding templates | ◐ | — (parity gap) | `project_worker_readiness_items` |
| Employee requests | ✔ large typed library + routed approvals | ✖ (only absence + platform help requests) | ✖→◐ (absence is the one typed request) | — (parity gap) | `worker_absences`; no generic request entity |
| Leave / absence | ✔ balances, accrual, calendar, bulk approve | ✔ request→approve/reject→cancel + notifications + manager visibility (A1 fix applied in prod); ✖ balances/accrual | ✔ (minus balances) | Absence links to real project/booking capacity, not just HR record | `worker_absences`, `review_worker_absence_v1`, `notification_events` |
| Timesheets / schedules | ✔ templates, actuals, overtime checks, payroll export | ◐ Work Journal captures actual work (36 prod entries) but no schedule templates / timesheet export | ◐ | Journal is evidence-first (photos, skills, confirmations) — richer than hours-only timesheets | `journal_entries`, `journal_entry_*` |
| Employment contracts | ✔ templates + amendments + termination + e-sign | ✖ (document-type slug only; commercial B2B contracts exist separately) | ✖ | — (parity gap; legal-control doctrine blocks fake contracts) | `contracts` = commercial only |
| Contract register | ✔ two registers + counterparties + expiry reminders | ◐ commercial contracts register (owner-scoped, honest no-signature disclaimer) | ◐ | — | `contracts`, `create_contract_v1` |
| Approval chains | ✔ configurable per category/amount everywhere | ◐ hardcoded per-domain single-actor predicates (absence, booking, docs verify, journal confirm); NO generic engine | ◐ | LM approvals are authority-verified in SQL (RLS+RPC), not config; but no delegation/escalation | audit: "no approval_chain/delegation/escalation anywhere" |
| E-signature | ✔ qualified eIDAS (Dokobit/MarkSign), ADOC | ✖ (explicit honest disclaimer in UI) | ✖ | Honesty: LM never fakes legal signature | `commercial.noSignatureNote` |
| Document management | ✔ versioning, registers, sign-off routing, archive | ◐ worker document metadata registry + verification + expiry derivation; no file storage, no versions | ◐ | Worker-owned docs + consent-gated employer aggregates (privacy-first) | `worker_documents`, `document_types`, RLS |
| Correspondence | ✔ in/out registers, routing, resolutions | ✖ (chat conversations exist, different thing) | ✖ | — | `conversations` ≠ register |
| Acknowledgement | ✔ position-targeted, re-ack on change, audit | ✖ | ✖ | — (parity gap) | zero acknowledgement machinery |
| Tasks | ✔ from any document, deadlines, reminders | ✔ `work_tasks` end-to-end (list+board, RPC-gated, attention signals) | ✔ | Tasks link to projects/workers/marketplace context | `work_tasks`, `/dashboard/tasks` |
| Business trips | ✔ per-diem calc, two-stage approval, receipts | ✖ | ✖ | — (P2 parity gap) | zero trip machinery |
| Expenses | ✔ OCR receipts, cost centers, accounting export | ✔ manual expense records + status + CSV export (no OCR/receipts) | ✔ (manual) | — | `finance_records`, finance page |
| Incoming invoices | ✔ OCR 99.9% claim, routing, ERP export | ◐ manual invoice register + due/overdue + CSV | ◐ | — | `finance_records` record_type invoice_received |
| Procurement | ✔ requisitions, budget control, 3-way link | ✖ | ✖ | — (P2 parity gap) | zero procurement machinery |
| Assets / inventory | ✔ register, issue/return, PPE journal | ✔ full issue→acknowledge→transfer→return lifecycle (no stock counts) | ✔ | Assets tie to projects + workers in one system | `assets`, `asset_assignments`, 5 RPCs |
| Training | ✔ planning, SCORM (Talentator), attendance | ◐ self-declared courses/certificates only | ◐ | Journal→skill evidence loop replaces attendance-based records | `worker_achievements`, honest "no training surface" |
| Testing | ✔ test builder, retakes, auto-trigger after ack | ✖ | ✖ | Skill truth = journal evidence + manager confirmation, not quizzes | — |
| Performance | ✔ goals, competency templates, cycles | ✖ (deliberate: "record count, never a competence score") | ✖ | Evidence-based trust vs subjective ratings | `experience_records` (references) |
| Board decisions | ✔ agendas, voting, protocols, e-sign | ✖ | ✖ | — (P2 parity gap) | nav guard actively excludes it |
| External labour market | ✖ NONE | ✔ 41,606 live Swedish vacancies, 7,669 employers, 21 regions, ESCO 1M labels | ✔ | UNIQUE — Vecticum cannot see outside the company | `public_vacancies`, `esco_*` |
| Worker-side product | ✖ NONE (employee self-service only) | ✔ independent worker accounts, portable CV, journal, consent ledger | ✔ | UNIQUE — network of workers, not employees | `workers`, `journal_entries`, privacy ledgers |
| Matching / skills intelligence | ✖ NONE | ◐ profession/skill taxonomy + demand matching + shortage analysis (label-only v2) | ◐ | UNIQUE category | `esco_*`, matching libs |
| AI-native operations | ✖ (OCR only) | ◐ chat-first workspace + AI provider chain (keyless local adapter) + audited ai_runs | ◐ | UNIQUE — natural-language intake, audited AI runs, cost ledger | `ai_runs`, `usage_cost_events` |
| Privacy / consent | ◐ GDPR framing | ✔ append-only consent + disclosure ledgers, RLS everywhere, advisors 0 RLS-disabled tables | ✔ | Provable GDPR machinery, not just policy text | `privacy_consent_events`, `personal_data_disclosures` |

## Reading

Vecticum wins today on: internal HR administration depth (contracts,
requests, acknowledgement, approval configurability, e-signature,
OCR finance ops, trips, procurement, testing, performance, board module).

LabourMarket.ai wins on categories Vecticum does not have at all:
external market supply (41,606 live vacancies / 7,669 employers), the
worker-owned portable profile + Work Journal evidence loop, matching +
skills intelligence (ESCO, 1M labels), AI-native chat workspace with
audited runs, and provable privacy machinery.

LM must NOT copy Vecticum 1:1. The parity gaps worth closing first are
the ones that reuse existing engines (approval predicates, notification
spine, document registry, work_tasks): generic employee requests, document
acknowledgement, contract lifecycle honesty (register + amendments as
records, never fake legal signatures), leave balances. Trips, procurement,
testing, board decisions are P2 and only as thin modules on shared engines.

## Value coverage model (0–5 per category, explicit weights)

Scoring rule: 5 = deep, configurable, proven in production; 4 = solid
end-to-end; 3 = usable core; 2 = partial/registry-level; 1 = fragments;
0 = absent. LM scores come from the 2026-08-17 reality audit (proven
statuses only). "LM after train" counts ONLY slices merged in this train
(doc-verification chain wiring, AI authz hardening, public-claim
invariant) — not roadmap.

| Category | Weight | Vecticum | LM current | LM after train |
|---|---:|---:|---:|---:|
| HR operations (requests, leave, lifecycle, timesheets) | 13 | 5 | 1.5 | 1.5 |
| Document management (files, ack, versions, sign-off) | 8 | 5 | 1.5 | 2.0 |
| Contracts & legal register | 7 | 5 | 2.0 | 2.0 |
| Workforce scheduling & planning | 8 | 4 | 2.5 | 2.5 |
| Recruitment | 6 | 4 | 4.0 | 4.0 |
| External labour market supply | 12 | 0 | 5.0 | 5.0 |
| Worker-side product & network effects | 9 | 0 | 4.5 | 4.5 |
| Matching & skills intelligence | 10 | 0 | 3.5 | 3.5 |
| Work Journal & work evidence | 8 | 1 | 4.5 | 4.5 |
| Project / object operations | 6 | 2 | 3.5 | 3.5 |
| AI-native operations | 7 | 0.5 | 2.0 | 2.5 |
| Financial operations (expenses, invoices, procurement) | 5 | 5 | 2.0 | 2.0 |
| Assets | 2 | 4 | 4.0 | 4.0 |
| Privacy / compliance provability | 4 | 2.5 | 5.0 | 5.0 |
| **Weighted score (Σw·s / Σw·5)** | 105 | **50.0%** | **63.6%** | **65.0%** |

Unique-capability advantage (categories where the other scores 0):
- LM-only: external market supply (12), worker-side network (9),
  matching/skills intelligence (10) — 31 weight points Vecticum cannot
  reach without becoming a different company.
- Vecticum-only: none at weight level (its strengths are depth, not
  category exclusivity) — every Vecticum category is reachable for LM by
  thin modules on existing engines.

Remaining parity gaps by priority (P0→P2, engine-reuse mandated):
1. P0 Workflow & Approval engine (generalize the existing predicate+RPC
   pattern: request → reviewer(s) → decision → audit) — unlocks employee
   requests, doc acknowledgement, contract approval, expense approval.
2. P0 Document file layer (storage bucket + versions on the existing
   worker_documents/document_types registry) + acknowledgement.
3. P1 Employment records (positions/terms) consolidated ONTO
   engagement_contexts — not a 4th model; amendments as append-only events
   (legal-control doctrine: never presented as signed legal contracts).
4. P1 Timesheet = derived view over journal_entry_work_items hours +
   approval via the engine (no new hours store).
5. P1 Leave balances (accrual model on worker_absences).
6. P2 Trips/procurement/board decisions/testing — thin modules only.
