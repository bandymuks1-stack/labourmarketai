# Journal → Skill Evidence Linkage v1 — Audit + Integration

**Date:** 2026-06-02
**Branch:** `feat/cc/journal-skill-evidence-linkage-v1`
**Builds on:** PR #225 (Profile/CV/Evidence hub). Canonical surface stays `/dashboard/profile`.
**Principle:** evidence-support layer, **not** verification. Skills can be self-declared, supported by work entries, or not yet supported — never "verified/confirmed" unless a real human/document flow already exists.

---

## 1. Data-model audit (existing reality)

| Element | Finding |
|---|---|
| `worker_skills.source` | enum `self_declared` \| `work_journal` \| `manager_confirmed` (CHECK, migration 0010). Already read into `skillDots` on the profile page. |
| `worker_skills.verified` | boolean; set true by the real manager-confirm flow. |
| Confirm flow | `confirm_entry_and_verify_skills(entry, skill_ids[])` RPC sets `source='manager_confirmed', verified=true` on the worker's skills — a real human confirmation tied to a journal entry. |
| Journal entry ↔ skill relation | **No** direct join table / skills column. Only an indirect, noisy jsonb (`journal_entry_confirmations.confirmation_scope.skills_confirmed`). |
| Per-entry support count | **NOT safely available** without a new join table / denormalized count. |

### Migration decision: **none** (reported, as required)
A trustworthy *count of journal entries per skill* would need a new junction table or a denormalized counter — a schema migration. Per the task ("if a migration seems necessary, stop and report why before implementing"), **I did not add one.** Instead v1 uses the **already-stored per-skill provenance** (`source`/`verified`) — a durable, honest signal that needs no DB change. The "count of supporting entries" is deferred until a real entry↔skill relation exists.

## 2. What v1 adds (no migration, no fake data)

- **`lib/profile/skill-evidence.ts`** — pure derivation:
  - `isSkillSupportedByWork(s)` → a skill is *supported by work entries* when `source ∈ {work_journal, manager_confirmed}` or `verified` (under-states; never over-states).
  - `deriveSkillEvidence(workerSkills, claimCount)` → `{ declared, supported, unsupported }`. Free-label self-declared claims are always counted as unsupported (no journal path).
- **Hub skills/evidence surface** (`ProfileHubOverview`, workers only): a new block under the pillars:
  - intro: *"Įgūdžiai stipresni, kai juos paremia darbo įrašai." / "Skills are stronger when backed by real work entries."*
  - *"Paremta darbo įrašais: {supported} iš {declared}" / "Supported by work entries: {supported} of {declared}"*
  - when unsupported > 0: *"Dar nėra darbo įrašų, kurie paremtų šiuos įgūdžius." / "No work entries support these skills yet."* — and the existing **Work journal →** link to `/dashboard/journal` provides the path.
  - The hub-level *"Not yet human-verified or document-verified"* disclaimer stays.
- **Profile page** derives `skillEvidence` from the already-fetched `skillDots` + claim count and passes it to the hub. No new reads, no new route.

## 3. Honesty boundary
"Supported by work entries" is strictly an evidence signal. It never says verified/confirmed/approved/certified/guaranteed. The only real verification wording (`✓ Verified` for `manager_confirmed`) lives in the per-skill `cv-engagement-cards` badge, unchanged — a real human flow. Guard scans block any verify/confirm token leaking into the evidence copy.

## 4. Deferred
- Real per-entry support **count** (needs a journal-entry↔skill relation = migration).
- Auto-promoting a `self_declared` skill to `work_journal` when an entry references it (needs the same relation + an extraction step). v1 honestly reports support from confirmed provenance only.

## 5. Guard coverage
`profile-cv-evidence-hub.test.ts` extended: profile page derives+passes `skillEvidence`; hub renders the evidence block (`evidence.intro/supported/noneYet`, `profile-hub-skill-evidence`) and keeps the journal link; the derivation helper exists; LT+EN evidence copy is non-empty, journal-backing-worded, and **free of verify/confirm tokens**. New unit test `lib/profile/skill-evidence.test.ts` (7 cases) pins the support derivation (self-declared excluded, claims unsupported, no negative counts).

## 6. Visual evidence
Dashboard is auth-gated (routes 307; no session/credentials here) → authenticated screenshots not possible. Build confirms `/lt` + `/en` `/dashboard/profile` compile; guard+unit tests confirm wiring. Final authenticated visual verdict remains owner-side.
