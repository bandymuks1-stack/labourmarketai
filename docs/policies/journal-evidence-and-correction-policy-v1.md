# Journal evidence & correction policy — v1

The work journal is the **central evidence object** of the product (PLATFORM_DOCTRINE §3 — append-only). This policy describes when entries can be changed, when they create a correction request instead, and what stays immutable.

The technical contract is enforced by migration `0018_journal_correction_lifecycle.sql` + the two RPCs `public.journal_entry_soft_delete` + `public.journal_entry_supersede`. This doc explains it in plain language.

## Three states

Every journal entry is in one of three states:

1. **Unconfirmed** — no external party has confirmed it. `journal_entry_confirmations` table has zero rows for `entry_id = this`.
2. **Externally confirmed** — at least one confirmation row exists. The manager / client confirmation backbone (PR #18, draft) is the source of these rows; no entries are confirmed in v1.
3. **Soft-deleted** — `deleted_at` is set. Hidden from the worker's `Įrašai` list but the row survives.

## What each role can do

| Action | Unconfirmed | Confirmed | Soft-deleted |
|---|---|---|---|
| Worker views entry | yes | yes | no (filtered out of list) |
| Worker edits entry (= supersedes via RPC) | yes — transparent replace (`superseded_by` set on old; new row appears in list) | yes — creates a correction request (`correction_of` set on new; old stays visible) | no |
| Worker soft-deletes | yes — RPC sets `deleted_at` | **no — RPC rejects with `already_confirmed_use_correction_request`** | idempotent (re-deleting is a no-op) |
| Worker hard-deletes (DROP the row) | no — RLS denies UPDATE/DELETE without policy | no | no |
| Admin views entry | yes (RLS allows for incident review) | yes | yes |

## Why supersede instead of update

`journal_entries` has no UPDATE policy (default-deny). Content fields (`original_text`, `hash_self`, `worker_id`, `engagement_context_id`, `original_language`) are immutable once written. Editing creates a **new row** that points at the old:

- Pre-confirmation: `old.superseded_by = new.id`. The entries list filters out rows with `superseded_by IS NOT NULL` so the worker sees a clean current view; the version chain is queryable via that link.
- Post-confirmation: `new.correction_of = old.id`. Both rows are visible. The worker (and eventually their manager) sees the original + the correction request side by side.

This is what makes "edit" honest: nothing is ever silently overwritten. The supersede / correction chain is the audit trail.

## Hash chain

Every entry stores `hash_prev` (previous entry's `hash_self`) and `hash_self` (sha256 of `worker_id | engagement | original_text | locale | hash_prev | created_at`). This chain is a tamper-evidence signal — a future audit can verify no entry was reordered or inserted retroactively. The chain re-attaches across supersede / correction operations (new entry's `hash_prev` = current chain head, not the entry it superseded — so the chain reflects insert order, not edit order).

## What the worker sees

In v1 (no external confirmations exist yet):

- Every saved entry shows **Edit entry** + **Delete entry** controls.
- Edit reopens the composer prefilled, with a blue banner explaining the supersede semantics.
- Delete asks for confirmation, sets `deleted_at`, entry disappears from list.
- Soft-deleted entries can be inspected via direct DB query (admin only).

Once PR #18 ships the manager-confirmation backbone, entries that pick up a confirmation will:

- Lose the **Delete** button (replaced by the "Įrašas patvirtintas — vietoje pašalinimo siųskite pataisymo prašymą" copy already shipped in PR #63).
- Keep **Edit** — but the save now creates a correction-request row instead of transparently replacing.

## What is NEVER changed

- The original `original_text` of any entry, in any state.
- The original `hash_self` of any entry.
- The original `created_at` of any entry.
- The set of confirmation rows attached to an entry. (Append-only; corrections add new rows.)

## Worker-side trust

The worker is told all of this in:

- The composer's edit-mode banner ("Redaguojate jau išsaugotą įrašą… senas variantas bus pakeistas").
- The delete confirmation prompt ("soft-delete — įrašas nedingsta iš istorijos, tik nebematomas sąraše").
- The post-confirmation deleteBlocked copy ("Įrašas patvirtintas — vietoje pašalinimo siųskite pataisymo prašymą").

These strings live in `messages/{lt,en}/journal.json`.

## Admin-side trust

Admins can read the full chain (`superseded_by` + `correction_of` joins) via the `is_admin()` RLS on `journal_entries`. There is no admin-only "delete entry" surface in v1 — that's a deliberate restraint until a written deletion-policy ladder exists.

## See also

- `supabase/migrations/0018_journal_correction_lifecycle.sql`
- `apps/web/lib/journal/actions.ts` — `softDeleteJournalEntry`, `supersedeJournalEntry`, error-code mapping.
- `apps/web/components/app/journal-entry-row.tsx` — delete + edit UI controls.
- `apps/web/components/app/journal-entry-composer.tsx` — supersede submit path.
- `docs/policies/risk-monitoring-and-fraud-response-v1.md` — incident response on suspicious editing patterns.
