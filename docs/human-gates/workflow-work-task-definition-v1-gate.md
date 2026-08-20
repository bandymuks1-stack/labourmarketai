# HUMAN GATE — chain step B: let an organization AUTHOR a work_task approval flow

Migration: `supabase/migrations/20260820070000_workflow_work_task_definition_v1.sql`
Rollback:  `supabase/rollbacks/20260820070000_workflow_work_task_definition_v1.down.sql`
Proof:     `scripts/db-proof/work-task-approval-chain.sql`

## OWNER DECISION — GIVEN 2026-08-20 ("SLICE B — CREATE THE MINIMUM REAL WORK_TASK APPROVAL FLOW")

The owner approved creating **one** minimal canonical `work_task` approval
flow, reusing the existing Workflow & Approval Engine, sufficient to prove the
already-applied chain step B end to end, with these explicit conditions:

- reuse the canonical engine;
- do **not** create another approval table, an `approval_status` column on
  `work_tasks`, another workflow engine, automatic approval, or fake production
  approval evidence;
- if choosing a universal default approver would require inventing
  organizational authority, **do not guess** — make approver selection
  explicit/configurable instead.

This migration is the **minimum required for that flow to be creatable at all**.
Without it the capability does not exist in any form.

State: `SLICE_B_APPROVED_MIGRATION_IS_THE_MINIMUM_MEANS`

### Why this is inside the slice B approval, not a new gate

The owner's stop condition is "a new RED/human gate **not covered by this
approval**". This one is covered: it is the literal subject of the approval —
without it, `create_workflow_definition_v1` rejects every `work_task` flow and
no minimal approval flow can be created by anyone. It is recorded here rather
than assumed, so the decision can be reviewed or reversed.

## The defect, and how it was found

`20260819210000` (merged as #1213, applied to production) widened the
`context_entity_type` CHECK constraints on `workflow_definitions` and
`workflow_instances` to accept `'work_task'`. That was necessary and **not
sufficient**: `create_workflow_definition_v1` carries its **own** hardcoded
allowlist, and it was not widened with them.

The result was a route with no on-ramp. The engine accepted the context, the
table accepted the row, the server action validated the value, all 11 locales
carried the label — and the only command that can create a definition returned
`'invalid'`. Production still shows **16 workflow definitions and 0 instances**.

**Nothing static could see this.** Schema was right, guards passed, types were
right. It surfaced only by executing the whole chain against production inside
a transaction that was rolled back: steps 1–7 passed, **step 8 returned
`invalid`**.

There were, in the end, **three** separate lists of context types: the table
CHECK constraints, the TypeScript vocabulary + the authoring form's own
hardcoded copy, and this RPC allowlist. The first was widened in #1213, the
second in #1216, this is the third.

## What it changes, exactly

**One value, `'work_task'`, added to one allowlist.** A strict superset: every
context authorable before is still authorable with identical validation.

Verified rather than asserted: the function body shipped by `20260817130000`
and the body **currently deployed in production** are byte-identical after
normalisation (comments and whitespace stripped) —
`f203d8d2a9da0702a7a8c2bc1706ce86b4378a072b938066197ac9970021843a`, 4202
characters, both. So no hotfix is being silently reverted, and `diff` of the
repo source against this migration's copy shows **exactly one hunk**.

Untouched: the authorisation check (`membership_actor_role_v1` must return
`owner` or `admin`), the slug rule, the step validation, the approver-rule
vocabulary, the 50-definition cap, the duplicate-slug guard, the signature, and
the grants (`{postgres=X, authenticated=X}`; `anon` has none — confirmed
against production's `proacl` before writing the re-assertion).

## Safety class

RED **only** because it replaces the body of an existing `SECURITY DEFINER`
function. ZERO tables, columns, policies, grants, triggers or indexes created,
dropped or modified. ZERO DML at apply time.

## What it deliberately does NOT do

It does **not** seed a `work_task` template into the default pack. Seeding one
would choose an approver for every organization on the platform without anyone
deciding it — precisely the invented organizational authority the owner ruled
out. Organizations author their own flow and name their own approver; PR #1216
adds the on-ramp in the UI and a guard pins the default pack at exactly eight
entries with no `work_task`.

## Identity gate before apply

- migration sha256 `d254ceb79e8baba662d5938742c1df89c98cb224fc77ece563518170a38af3aa`;
- rollback sha256 `8287abe94057fa80b9dba9548e608f81b240ff3dcc863d4c91bbb3458a503f79`;
- comment-stripped EXECUTABLE sha256
  `89935025d4f809d59dd8c3a4931f7e1343021cf0ab4267fe6f8ab76d4be292f1`;
- production target verified: `gorgitwvdzxbnaxhrsrw` / labourmarket.ai /
  eu-west-1 / `ACTIVE_HEALTHY`;
- deployed body == repo body before the change (hash above).

## Proof — the complete chain, 24/24, against production

`scripts/db-proof/work-task-approval-chain.sql` runs the whole chain against
the real database inside `begin … rollback`:

> task → work journal → evidence link → hours → task attribution → done →
> send for approval → the named human approves → durable history

| | |
|---|---|
| Task created through `create_work_task_v1` | ✅ |
| Journal entry through `create_journal_entry_full`, 8 h of real work | ✅ |
| Evidence linked through `link_journal_entry_to_task_v1` | ✅ |
| Hours derived **once**, one line, no fan-out | ✅ 8.00 |
| Attributed to the task, real title, `linkCount 1` | ✅ |
| Provenance survives (`derivedFrom`, `metricSource`, `metricId`) | ✅ |
| Task marked done | ✅ |
| **work_task definition authored** — fails without this migration | ✅ |
| Version published; the **named** approver resolves to a real slot | ✅ |
| Sent for approval **on the task itself** | ✅ |
| Human decides; instance becomes `approved` | ✅ |
| Durable history appended (2 → 4 transitions) | ✅ |
| The record names **who** decided and **why** | ✅ |
| Approval did **not** mutate the journal | ✅ |
| Withdrawal is a **record** — row kept, reason kept | ✅ |
| Hours **survive** the withdrawal, still counted once | ✅ 8.00 |
| Attribution correctly drops after withdrawal | ✅ |
| The approval decision and its ledger survive the withdrawal | ✅ |
| anon can execute neither function; no anon write grant on the link table | ✅ |

**No synthetic production truth remained.** Recounted after the rollback:
`work_tasks` 0, `journal_entry_tasks` 0, `workflow_instances` 0,
`workflow_transitions` 0, `work_task` definitions 0, proof organizations 0,
`journal_entries` back at 36, `workflow_definitions` back at 16.

## Rollback

Restores the `20260817130000` allowlist verbatim. It **refuses** while any
`work_task` definition exists: removing the value would not delete those rows
(the table CHECK widened by `20260819210000` still accepts them) but would leave
a live approval flow its own organization could never recreate or edit.
Orphaning a live flow is a data decision for the owner, not something a
rollback does silently. Retire the definitions first
(`set_workflow_definition_active_v1`), then run it.

## Apply procedure (binding)

Supabase MCP `apply_migration` against `gorgitwvdzxbnaxhrsrw`, name
`workflow_work_task_definition_v1`, body = the migration file with the
`begin;` / `commit;` wrapper stripped. **Never** `supabase db push`.
