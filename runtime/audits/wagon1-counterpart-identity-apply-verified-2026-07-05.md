# Wagon 1 — counterpart identity production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 1 pending production migration."
Applied: `20260705170000_conversation_counterpart_identity` via Supabase MCP
`apply_migration` ONLY (no db push; no other migration touched; no code changed).
Ledger entry present.

Read-only verification (all 8 required points):
1. RPC exists: `conversation_counterpart_identities(uuid[])` ✅
2. SECURITY DEFINER with pinned `search_path=public` ✅
3. public/anon EXECUTE revoked (`has_function_privilege('anon') = false`) ✅
4. authenticated EXECUTE granted — only intended grantee ✅
5. Caller membership enforced: non-participant JWT → 0 rows; anonymous → 0 rows ✅
6. Permitted 2-person unrevoked direct thread → exactly 1 counterpart row for a
   participant JWT ✅
7. Projection is structurally `(conversation_id uuid, display_name text)` — no
   phone/email/contact/profile fields can be exposed ✅
8. App path: `readCounterpartIdentities()` (merged in #608, deployed via standing
   auto-deploy of 25a7d9f) now receives real names for permitted direct threads —
   the restricted chip remains only where permission is absent, by design ✅

TRAIN REPORT UPDATE: product-tree branch 20 (messages/contact permission/counterpart
identity) — counterpart identity production apply = VERIFIED. Remaining branch-20
residue: §8.2 abuse caps (wagon 2, in progress at time of writing).
