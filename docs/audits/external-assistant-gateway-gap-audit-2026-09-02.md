# External-assistant gateway & universal human input — gap audit 2026-09-02

**Baseline:** `main = b9749280 = production` · incident record:
`docs/audits/INCIDENT-2026-09-02-external-client-reconnect.md`
**Rule applied:** status is judged by **proven production E2E capability**, not
by merged PR count. Labels: WORKING · PARTIAL · MISSING · BLOCKED ·
OWNER ACTION REQUIRED.

---

## 1. Architecture confirmation (P0 brief §3–§4)

**Canonical ownership holds in the code as deployed.**

```
USER            owns identity, consent, evidence   → auth.users / oauth_consents / journal chain
LABOURMARKET.AI owns domain, workflows, RLS, audit → lib/capabilities/registry.ts + SECDEF RPCs
EXTERNAL CLIENT replaceable adapter                → app/api/mcp/route.ts (≈150 lines, zero domain logic)
```

- `app/api/mcp/route.ts` is an adapter over `lib/capabilities/registry.ts`.
  Identity comes from the ONE resolver (`resolveApiIdentity`) every shared API
  route uses; every tool call runs on the caller's own RLS-scoped client. There
  is **no ChatGPT-specific identity, datastore, or Work Journal**.
- `journal.create_draft` / `journal.confirm` call the transport-neutral
  `createJournalEntryCore` — the **same** append-only, hash-chained write the
  web composer performs. One core, several doors. **CHATGPT_VENDOR_LOCK_IN:
  none.** A user who never opens ChatGPT has every capability in the native
  UI; disconnecting ChatGPT (`revokeGrant`) deletes only that client's
  session and consent, never a domain row.
- The universal pipeline `INPUT → PARSE → STRUCTURE → VALIDATE → RESOLVE
  CONTEXT → DRAFT → REVIEW → CONFIRM → COMMIT → PROVENANCE` exists as the
  draft→confirm capability pair (`lib/capabilities/confirmable.ts`): one-time
  token bound to the exact normalized input, the caller, and a state
  fingerprint; TTL and replay rules inherited from the conversation
  dispatcher. Typed text, native chat, and external assistant already enter
  through it. Voice, CSV/Excel, PDF and bulk manager input do **not** yet.

## 2. Status by area

| Area | Status | Evidence (production unless noted) |
|---|---|---|
| **Auth** (web, password + Google) | WORKING | 36 users; Google returning-user live 2026-08-31; PKCE same-tab |
| **External client auth** | PARTIAL → fix pending | OAuth 2.1 + DCR + consent + token exchange proven 2026-08-30; **regressed by global-scope logout**; fix is RED-class, awaiting owner merge; reconnect needed once |
| Worker profile | WORKING | `profile.get` proven via real ChatGPT 2026-08-30 11:44 UTC; native profile pages live |
| Living CV | PARTIAL | `living_cv.skills.get` exposed; EU export live; evidence graph direction only |
| **Work Journal** | WORKING | native + ChatGPT write proven 2026-08-30 13:16 (entry 5e7557f9…, chain intact); read-back via `journal.list` |
| Evidence (journal chain, confirmations, photos) | WORKING (self) / PARTIAL (cross-actor) | hash chain live; cross-actor confirm loop proven; photo evidence bucket 8 objects |
| Credentials (issuer / expiry / validity vs history) | PARTIAL | `worker_documents` has type/valid_from/valid_until/status; **0 rows**; no separate current-validity state object; provenance via `register_document_file_v1` sha256 — never exercised |
| Historical imports | MISSING (proven) | `document_files` 0, `document-files` bucket 0 objects; XLSX ingestion merged (#1394) but **no production artefact, no E2E** |
| Excel / CSV | PARTIAL | parser + timesheet mapping code exists; no dry-run/row-report/duplicate-detection/import-receipt loop proven; see §3 |
| Reports / export | PARTIAL | timesheet approval chain proven (G-04, 13/13, rolled back); original-format regeneration **not evidenced** |
| Employer | WORKING | 12/12 employer E2E; demand intake live |
| Employer needs | WORKING | `customer_requests` canonical; NL→demand live; headcount defect in non-English (#1303) |
| Matching | WORKING | slug-keyed engine + inverted worker board live |
| Projects | PARTIAL | 6 projects all `draft`; lifecycle spec needs a dedicated stack |
| Teams | PARTIAL | memberships + roles live; team objects thin |
| Workforce planning | PARTIAL | absence scheduling view (preserved), planning zone; no proven loop |
| Messaging | PARTIAL | conversation shell + chat-first dashboard live; notifications emitter gaps (1 of 5 signals never delivered live) |
| Social integrations | BLOCKED (owner) | Google only; LinkedIn/FB runtime-gated; brand/domain gate = owner package 0011 |
| Direct contractor discovery | WORKING | booking → engagement → assignment proven (G-01 pass 1 stages 1–6) |
| Students | PARTIAL | learner ↔ institution link live (#1301); student loop 6/6 on prod build |
| Educational institutions | PARTIAL | `training_provider` capability; first institution + worker chain proven; employer side unproven |
| Learning evidence | PARTIAL | journal entries as learning evidence proven for a student; credentials chain not closed |
| Migration / mobility | PARTIAL | 5 routed locales; work-abroad fields; nothing proven end to end |
| AI | WORKING (narrow) | 5 wired agents; `explain_market_demand` proven live; env-gated |
| **Vendor-neutral routing** | PARTIAL | provider is env-selected, no provider-specific business logic found in capabilities; **no capability/quality/privacy/latency/cost request model** — Agentai OS is the intended authority (see §4) |
| Billing | BLOCKED (owner) | Stripe paid chain defects fixed; payments OFF; RED class verbatim |
| Marketplace / services | PARTIAL | request loop live; 0 E2E specs |
| Languages | WORKING (5) / PARTIAL (26 target) | LANGUAGE_MATRIX canonical; shells deliberately unrouted |
| GDPR / privacy | PARTIAL | RLS everywhere, learner least-privilege, anon-secdef gate; **no connected-apps page to see/revoke external clients**; `profiles.email` capture HIGH finding open |
| Autonomous operations | PARTIAL | auto-merge envelope live; prod migration autonomy policy; no self-healing |
| **Monitoring / reliability** | PARTIAL → improved by this slice | `external_client.auth` / `external_client.tool` JSON events added (privacy-safe); no dashboard/alert yet; connector regression was owner-discovered |

## 3. Excel / historical timesheet ingestion — readiness (§7)

**Readiness: architecture present, loop unproven.** What exists:
`register_document_file_v1(scope, parent, storage_path, filename, mime, size,
sha256)` (provenance), org-document lifecycle with approval
(`submit_org_document_for_approval_v1` → workflow), retention, download
audit; XLSX parsing (#1394). What is **missing for a safe large import**:
schema detection + mapping preview surface, row-level validation report,
duplicate/conflict detection keyed on (worker, date, object), idempotency key
per import session (`import_session_id` threading exists in code — #1112),
rollback strategy, import receipt object. **The owner's split case (8 h Object
01 + 2 h Object 05 = 10 h) is already satisfiable at the canonical layer**
(proven twice: G-01, G-04) — the gap is the file → mapping → preview → commit
front half, not the allocation model. The storage `FILE` stage cannot be
proven by the rollback harness (object storage is not transactional).

## 4. Agentai OS boundary (§11)

No second provider registry was created here. LabourMarket.ai's AI routes are
env-gated per provider; there is **no capability-request model** (quality /
privacy / latency / cost) and no call into Agentai OS. Recommendation stays:
express AI needs as capability requests and let Agentai OS own provider
selection. **Not built in this slice** — it is outside the P0 and would be a
new cross-repo contract.

## 5. Multi-person input (§6) — readiness

`work_hour_allocations` carries `worker_id`, `entered_by`, `source`
(`manual` today) — so SELF-REPORTED vs MANAGER-REPORTED is representable by
`entered_by ≠ worker` + `source`. **Missing:** a bulk NL intake ("Ramūnui 8 h,
Pijui 7 h…") that fans out to per-person drafts with a manager-authority check
and one audit trail; the `IMPORTED` / `SYSTEM-DERIVED` / `VERIFIED` source
values are not yet a closed vocabulary in the schema. Readiness: PARTIAL.

## 6. Students & institutions (§9) — kept on the roadmap

Chain status: LEARNING (institution capability ✓) → LEARNING EVIDENCE (journal
✓) → SKILLS (recognition ✓) → CREDENTIALS (PARTIAL) → PRACTICE/INTERNSHIP
(MISSING as a typed relationship) → WORK JOURNAL (✓) → VERIFIED EXPERIENCE
(cross-actor confirm ✓) → FIRST JOB (matching ✓) → CONTINUING IDENTITY (✓).
Two typed gaps, no separate platform needed.

## 7. Idempotency (§13) — WORKING, proven

Real-client replay 2026-08-30: second `journal_confirm` with the same token →
`confirmation_rejected (stale_state)`, count stayed 19. Mechanism:
`lib/capabilities/confirmable.ts` — token bound to input hash + caller + chain
fingerprint; the chain head moves on commit, so the same token cannot commit
twice. The contract runner re-asserts it on every run (`DUPLICATE_CONFIRM`).

## 8. Owner actions (§18) — exactly these

1. Approve/merge the RED draft PR (auth-core).
2. Reconnect the connector once in ChatGPT after deploy (OAuth consent).
3. (Unchanged, pre-existing) add read-only `SUPABASE_DB_URL` to arm the live
   secdef + migration-parity gates; Google brand/domain package 0011.

Everything else in this slice was done without owner involvement.
