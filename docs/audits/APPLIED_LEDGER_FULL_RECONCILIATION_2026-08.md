# APPLIED_LEDGER — full reconciliation, 2026-08-07

**Base:** `main` @ `81981810` · **Production:** `gorgitwvdzxbnaxhrsrw`
**Method:** read-only. `list_migrations` + `information_schema` / `to_regclass`
existence probes + row counts. **Zero writes, zero applies, zero DDL.**
**Inputs:** 190 repo migration files × 187 production ledger rows ×
`docs/APPLIED_LEDGER.md` (applied half + Deferred list).

---

## 0. Headline

The previous train reported two migrations as *"in neither canonical list, state
UNKNOWN"*. **Production settles both, and both were wrong in the safe direction:**

| Migration | Prior claim | **Production truth** |
|---|---|---|
| `20260627181500_service_requests_seen` | "state unknown" | **APPLIED.** `service_offering_requests_seen` exists, **2 rows** |
| `20260705230000_project_handover_passport` | "SCHEMA_ONLY, unknown" | **APPLIED.** `project_handover_entries` exists, **1 row** |

Both are corrected in-place in this train (§6). The W11 audit's `SCHEMA_ONLY`
classification of the handover passport is **withdrawn**.

The reconciliation also found **two migrations applied after the 2026-08-01 drift
notice and recorded nowhere**, one of them a security migration.

**A third candidate was a false positive of this audit's own method, and it is
the most instructive result here** — see §3.1. The lesson generalises: the
ledger records some applied migrations *inside its "Deferred (NOT applied)"
list*, so any check that reads only the applied half will report them as drift.

---

## 1. Classification totals

| Class | Count | Notes |
|---|---|---|
| **A — APPLIED_AND_RECORDED** | 96 | includes ≥1 false positive, see §4 |
| **B — APPLIED_NOT_RECORDED** | 85 raw → **2 actionable** | stratified in §2 — 63 pre-coverage, 19 already covered by the drift notice, 1 false positive (§3.1) |
| **C — DEFERRED** | 7 | all probed absent in production ✔ |
| **D — SUPERSEDED** | 1 | §4.1 — a repo file applied as three production rows |
| **E — NEVER_APPLIED** | 1 | §3 — and in *neither* list |
| **F — NAME_VERSION_DRIFT** | 187 (all) | **expected and documented**, not a defect — see §5 |
| **G — UNKNOWN_NEEDS_OWNER_REVIEW** | 0 | §3.1 — the one candidate resolved to a false positive of this audit's own method |

---

## 2. The 85 "applied but not recorded", stratified

Raw counts mislead here. Split by era against the ledger's own 2026-08-01 drift
notice (which documents a 26-migration window `20260702130000` →
`20260720190000`):

| Era | Count | Verdict |
|---|---|---|
| **Before the drift window** (< `20260702130000`) | **63** | The pre-MCP / early baseline. The ledger never claimed these — but it also never says where its coverage *starts*, which is why "absent" has been uninterpretable. See §7 |
| **Inside the documented 26-window** | **19** | Already accounted for **as a class** by the drift notice. 7 of the original 26 have since been written up; these 19 are the remainder the notice says still need apply-context reconstruction. **No surprise, no new finding** |
| **After the notice** (> `20260720190000`) | **3 raw → 2 real** | ⚠️ **NEW. Unaccounted for by any notice.** The third was this audit's own false positive (§3.1) |

### 2.1 The two genuinely new ones

| Migration | Prod version | Production evidence | Gate state in the file |
|---|---|---|---|
| `20260727120000_secdef_public_grant_hygiene_v1` | `20260727125759` | applied — revokes implicit `PUBLIC EXECUTE` on three SECDEF functions | `@human-gate-approved` present ✔ |
| `20260727180000_journal_entry_skill_provenance_v1` | `20260727183554` | `journal_entry_skills.provenance` (text) **exists** | no draft header ✔ |

Both are unambiguously fine and simply needed ledger rows, now written.

*Note on the security one:* it revokes the implicit `PUBLIC EXECUTE` left on
three SECDEF functions. It does **not** touch schema-level `CREATE`, which is a
separate, still-unapplied owner-gated item (#879). Production still has `anon`
holding `CREATE` on schema `public` — verified 2026-08-07, unchanged by this
migration and not its job. Recorded so the two are never conflated.

---

## 3. E — never applied, and in neither list

**`20260717130000_open_markets_countries_draft_v1.sql`**

A `DRAFT — needs-human-gate — DO NOT APPLY` file (six new market countries:
GE/BE/FR/ES/AT/CH). It is absent from production **and** absent from the
Deferred list. Its own header warns that *"the static migration-safety gate may
classify it GREEN"* because it contains only additive inserts.

So a reader consulting the Deferred inventory would not learn this file exists.
That is the accounting gap in the *other* direction from the drift notice.
**Classified E, not a defect in production — a defect in the inventory.**

### 3.1 The false positive — and why it is the most useful result here

**`20260723180000_agency_real_client_bridge_v1` was initially reported by this
audit as "applied in production, recorded nowhere, and its file says the owner
never approved it". That was WRONG, and the error was this audit's own.**

The record exists and is exhaustive. It lives in the **Deferred (committed/known,
NOT applied)** bullet for that migration, and states:

> `PRODUCTION APPLIED 2026-07-23 (owner gate OWNER_GATE_APPROVED_FOR_PR_860)`

…together with prod version `20260723155658`, both file SHA-256s, the
`company_workers` dependency resolution, full post-apply verification (3 tables,
11 SECDEF functions, RLS fail-closed, advisor 0 ERROR) and a production
two-subject E2E with 17 negative authz tests.

The `DRAFT — DO NOT APPLY` header is unedited **on purpose**: changing it would
alter the owner-pinned approved SHA, so migration-safety stays RED by design and
PR #860 stays DRAFT on purpose. Nothing is unresolved and no owner action is
needed.

**Why the audit got it wrong:** the reconciler split `APPLIED_LEDGER.md` at the
`## Deferred` heading and searched only the applied half. A migration recorded as
applied *inside the Deferred list* is invisible to that method.

**This is the real systemic finding, and it is worse than a missing row.** The
ledger currently stores at least one applied migration under a heading that says
"NOT applied", which means:

- every name-based check over the applied half under-reports;
- a reader scanning headings gets the opposite of the truth;
- and the error is silent in both directions.

Fixing the *placement* (not the content) is the highest-value follow-up: either
promote such entries to an APPLIED section, or rename the heading to something
like "Deferred / gated — including applied-under-gate". Left as an owner call
because it restructures a governance document; a placement note was added in
this train so the next reader is not caught by it.

---

## 4. Duplicate names — a live false-positive generator

**`company_memberships_v1` exists twice in `supabase/migrations/`:**

| File | Lines | State |
|---|---|---|
| `20260714210000_company_memberships_v1.sql` | 164 | `DRAFT — needs-human-gate — DO NOT APPLY`. **Never applied** |
| `20260806090000_company_memberships_v1.sql` | 236 | `@human-gate-approved`, M-P0-4. **APPLIED** (prod `20260805195716`) |

Because the ledger's matching rule is *"match on `name`, never on `version`"*
(§5), the applied row makes the **never-applied draft read as applied** to any
name-based check — including the first pass of this audit's own reconciler.

That is a real hazard, not a cosmetic one: the whole ledger discipline rests on
name matching, and a duplicated name silently defeats it.

**Recommended (not done here — it touches a gated draft file):** rename the
unapplied draft to a distinct slug, or fold it into the Deferred list with an
explicit "superseded by `20260806090000`" note.

### 4.1 D — one repo file, three production rows

`20260612091000_journal_entry_photos.sql` is recorded as applied, but production
holds **three** rows instead: `journal_entry_photos_table`,
`journal_entry_photos_rpc`, `journal_entry_photos_storage`. The file was
decomposed at apply time.

Related orphan production rows with no repo file at all:

| Prod row | Explanation |
|---|---|
| `journal_entry_photos_{table,rpc,storage}` | the split above |
| `conversation_message_language` (×2: `20260610204051`, `20260611064355`) | **applied twice** under the same name |
| `conversation_message_language_check` | follow-up, no repo file |
| `20260705240000_agency_legacy_retype` | named in the ledger prose ✔, no repo file |
| `company_memberships_v1_trigger_fn_revoke` | named in the ledger prose ✔, no repo file |

None of these is a production risk. All are accounting artefacts, and they are
why a naive file-count vs row-count comparison (190 vs 187) never balances.

---

## 5. F — version drift is expected, not a finding

Every MCP-applied migration has `prod.version ≠ file timestamp`, because
`apply_migration` stamps its own apply-time value. The ledger documents this at
the top of the file and instructs matching on `name`.

**Checked and confirmed:** for every production row whose `name` carries a
timestamp prefix, that prefix matches the repo filename exactly — **zero real
name drift**. The drift is confined to `version`, exactly as documented.

---

## 6. Corrections this reconciliation makes to earlier docs

| Doc | Was | Now |
|---|---|---|
| `W11_PROJECT_OPERATING_SYSTEM_CURRENT_TRUTH.md` | handover passport `SCHEMA_ONLY`, ledger silent ⇒ "state UNKNOWN" | **`SHIPPED_AND_REACHABLE`** — applied, 1 production row |
| `W13_COMMUNICATION_ATTENTION_BASELINE.md` §5.1 | `20260627181500` "no ledger entry either way" ⇒ unknown | **APPLIED**, 2 production rows — the `service-request-responses` seen model is live |
| `W13_…BASELINE.md` §2.7 / `spine-signals.ts` | comment says `work_tasks` unapplied | **APPLIED** 2026-07-11 — and `work_tasks` has **0 rows**, so the signal is a live count that is legitimately zero |

---

## 7. The systemic finding

The ledger has **no declared coverage start**. It records manual MCP applies,
but never states from which date it claims completeness. Consequently:

- absence of a row means *"drifted"* for anything after ~2026-07,
- and *"probably out of scope"* for anything before,
- with **no line separating the two** — which is exactly why two migrations
  spent a full audit cycle classified as UNKNOWN when production could have
  answered in one query.

**Recommendation (docs-only, safe):** state the coverage boundary at the top of
`APPLIED_LEDGER.md`, and record the three §2.1 migrations. Both are done in this
train. The 63 pre-window and 19 in-window entries are left as the drift notice
already frames them — writing 82 rows without apply context would fake the
precision the ledger exists to provide.

---

## 8. Owner decisions this raises

1. **Ledger placement (§3.1)** — at least one APPLIED migration is recorded
   inside the `## Deferred (committed/known, NOT applied)` list. Promote such
   entries to an applied section, or rename the heading. This is the finding
   most likely to mislead the next reader, and it restructures a governance
   document, so it is the owner's call.
2. **Duplicate `company_memberships_v1` (§4)** — rename the unapplied draft or
   list it as superseded.
3. **`20260717130000_open_markets_countries_draft_v1` (§3)** — add to Deferred,
   or apply, or delete. Today it is invisible to both inventories.
4. Whether to reconstruct apply context for the 19 + 63 historical entries at
   all, or to declare a coverage boundary and stop.

## 9. Explicitly not done

No migration applied. No DDL. No business row read beyond counts and
`information_schema`. No gate marker added or removed. No draft file edited.
