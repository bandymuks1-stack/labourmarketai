# W11 — Project operating system: current truth

**Date:** 2026-08-07 · **Base:** `main` at `162cacb3` (after F7 / #1068)
**Method:** every capability traced from route → reader → migration → ledger.
No capability is classified from a code comment alone; two of the findings below
exist *because* a code comment disagreed with the ledger.

---

## 1. Classification

| # | Capability | State | Evidence |
|---|---|---|---|
| 1 | **Projects** (create, list, detail, status) | `SHIPPED_AND_REACHABLE` | `/dashboard/projects` list + `[id]` stadium + the chat-first `project` result (`dataReadiness: "real"`). Create proven; lifecycle transitions derived from the shared `nextStatuses` matrix |
| 2 | **Operations centre** | `SHIPPED_AND_REACHABLE` | `/dashboard/projects/[id]/operations`. **Was `SHIPPED_BUT_HIDDEN` until #1068** — see §2 |
| 3 | **Stages** | `SHIPPED_AND_REACHABLE` | `listProjectStages` → `ProjectStagesPanel`. `20260718140000_project_operations_stages` **APPLIED** (ledger row 857) |
| 4 | **Gantt** | `SHIPPED_AND_REACHABLE` | `buildStageGantt` → `ProjectStageGantt`, pure over the applied stage rows. Degrades to `{ hasTimeline: false }` — no fake timeline |
| 5 | **Budgets / economics** | `SHIPPED_AND_REACHABLE` | `getProjectEconomics` → `ProjectEconomicsPanel`. `20260718160000_project_budgets` **APPLIED** (row 861) |
| 6 | **Quality / defects** | `SHIPPED_AND_REACHABLE` | `getProjectDefects` → `ProjectDefectsPanel`. `20260718200000_delivery_quality` **APPLIED** (row 869) |
| 7 | **Logistics / assets** | `SHIPPED_AND_REACHABLE` | `getProjectAssets` on the operations page. `20260718170000_assets_logistics` + `20260718180000_assets_rls_recursion_fix` **APPLIED** (row 863) |
| 8 | **Tasks** | `SHIPPED_AND_REACHABLE` | `openProjectTasks` on the operations page; `/dashboard/tasks` module. `20260711210000_work_tasks_v1` **APPLIED 2026-07-11** (row 828) — see §3, a stale comment says otherwise |
| 9 | **Assignment** | `SHIPPED_AND_REACHABLE` | `ProjectAssignmentManager` on the list; `company.assign-worker` from the chat result, gated on the server's `canManage` |
| 10 | **Documents** | `PARTIAL` | Real per-worker document signals roll up into the operations board (`docsMissing` / `docsChecked` chips on the stadium; readiness items on the centre). There is **no project-level document library** — the `/dashboard/documents` surface is worker-scoped |
| 11 | **Handover passport** | `SHIPPED_AND_REACHABLE` **(corrected 2026-08-07)** | `20260705230000_project_handover_passport` is **APPLIED** — prod ledger version `20260705092111`, and `project_handover_entries` exists with **1 row**. Verified read-only against production. See §4 for what the earlier `SCHEMA_ONLY` call got wrong |
| 12 | **Completion** | `PARTIAL` | The control exists and is real: `setProjectStatusAction` → `completed` behind an explicit confirmation that states what becomes true, and it reports the **server's real count** of ended assignments. **Never run by a real user in production** — prod holds 5 projects, all `draft` |

**No capability is `NOT_IMPLEMENTED`.** The honest summary of W11 is not "half
built": it is **built, applied, and reachable — with one production proof
outstanding, one library absent, and one gated schema.**

---

## 2. F7 — closed, and the framing it corrects

The matrix carried W11 as PARTIAL on *"operations page reachable only by deep
link"*. The route was never missing and never unguarded; it has shipped since
control room PR G. What was missing was a way to **arrive**:

1. the chat-first `project` result let a manager pick a project, then offered
   ONE exit — to `/dashboard/projects`, the **list** — dropping the identity
   just chosen;
2. the stadium's own link was the **last** element on a page rendering seven
   sections above it (~1340px desktop / ~1790px mobile).

Both closed in **#1068**. The detail exit is now project-scoped and picks its
surface by the server's `canManage`; the stadium link moved into the header
(measured 207px / 223px, above the fold at 1440 and 375). Browser-proven 24/24,
no URL typed in the proof, click **and** keyboard.

**Not claimed:** a two-organization cross-org proof. The local fixture holds one
company with projects, so it was unavailable; cross-org isolation rests on the
existing server guards.

---

## 3. Finding — a stale comment makes a live capability look dead

`lib/notifications/spine-signals.ts` still says the task-attention count is
*"0 while the work_tasks migration is unapplied (control room PR D)"*.

`20260711210000_work_tasks_v1` was **APPLIED on 2026-07-11**. A reader trusting
the comment would classify tasks as `SCHEMA_ONLY`; they are
`SHIPPED_AND_REACHABLE`. Recorded in the W13 baseline as **W13-0b** (comment
only, no behaviour change).

---

## 4. CORRECTED 2026-08-07 — the handover passport is applied, and the ledger sweep happened

**What this section said before:** that `20260705230000_project_handover_passport`
appeared nowhere in `APPLIED_LEDGER.md`, that ledger silence therefore meant
UNKNOWN, and that `SCHEMA_ONLY` was the conservative call pending a production
read.

**The production read has now been done** (read-only, `list_migrations` +
`to_regclass` + row count), and it overturns the classification:

* prod ledger version `20260705092111`, name `20260705230000_project_handover_passport`;
* `project_handover_entries` **exists** and holds **1 row**.

The migration is **applied and exercised**. Capability 11 moves to
`SHIPPED_AND_REACHABLE`.

**What the original call got wrong, and it is worth naming precisely:** it
treated "no row in the applied table" as "no information", when the ledger
*already carried* a `⚠️ DRIFT NOTICE 2026-08-01` documenting a 26-migration
window in which applies happened without rows — and
`20260705230000_project_handover_passport` is **one of the 26 named there**. The
information existed; the audit looked in the table and not at the notice above
it. The lesson is not "read production sooner" (though that too) but *read the
whole ledger, including its exception notices, before calling a state unknown.*

The suggested sweep was carried out the same day:
`docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md` reconciles all 190
repo migrations against all 187 production rows. It confirms both this migration
and `20260627181500_service_requests_seen` as **APPLIED**, and finds three
genuinely new unrecorded applies plus one migration whose gate state needs owner
review.

---

## 5. What remains, honestly

| Item | Kind | Blocked on |
|---|---|---|
| Production completion proof | **proof, not code** | a real user running a project to `completed` in production |
| Dismissed-manager rights consuming the applied membership authority | code | none known — safe, unaudited here |
| Project-level document library (#10) | product decision | is it a W11 capability at all, or W7's? |
| Handover passport ledger state (#11, §4) | bookkeeping | a production read |
| `work_tasks` stale comment (§3) | comment | none — safe |

**No safe app slice was found that is both material and unblocked**, which is
why this train did not implement further W11 code after F7. The remaining items
are a production proof, a product decision, a bookkeeping read, and one
comment — not features.

---

## 6. What this audit deliberately does not say

- It does **not** claim the applied migrations have production *rows*. Prod holds
  5 projects, all `draft`; stages, budgets, defects and assets are applied
  schema whose real-usage volume is untested.
- It does **not** re-audit RLS. Each capability's isolation has its own guards;
  this pass traced reachability and applied state only.
