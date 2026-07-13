# Living CV Contract v1

Status: ACTIVE (canonical-user-journey-living-cv-crm v1)
Date: 2026-07-13

## The loop (what "living CV" means here)

```
CV file / pasted text
  → real extraction (lib/cv/extract.ts — PDF/DOCX/TXT, server-side, 5 MB cap)
  → the user's own words persist (profiles.profile_text, owner-only RLS)
  → deterministic structuring proposal (shared lexicon; + labelled AI
    suggestions ONLY when the owner-gated runtime is live)
  → HUMAN REVIEW — per-chip confirm/discard (nothing becomes a fact without it)
  → confirmed claim persists to BOTH canonical stores:
      profile_skill_claims  (their words — claims-only tier)
      worker_skills         (catalogued row, when the label maps into the
                             shared lexicon AND the worker's own directions)
  → work journal entries link evidence to catalogued skills
    (journal_entry_skills), bumping the tier self_declared → work_journal
  → manager confirmation (confirm_entry_and_verify_skills) is the ONLY
    path to verified=true
  → /cv (Verified CV) reads the SAME canonical tables at read time —
    there is no second CV store
```

## Visible change guarantees

- After a confirmed import/apply, the user sees the honest delta: how many
  confirmations also became catalogued skills (matching + CV visible) and
  how many stay claims-only (outside their directions), plus a direct
  "view updated CV" link (`profile-text-flow-promotion-delta` /
  `profile-text-flow-view-cv`).
- After a journal entry save, the banner links to the profile capabilities
  AND `/cv` (`journal-saved-open-cv`) — the place where the change is visible.

## Hard rules (guard-enforced)

1. AI/rule extractors PROPOSE only; persistence requires explicit user
   confirmation (`living-cv-promotion.test.ts` pins promotion strictly after
   `saveProfileSkillClaimsAction` of confirmed chips).
2. Promotion never writes `verified` and never updates rows — inserts
   missing (worker_id, skill_id) with column defaults only.
3. Outside-direction mappings are SKIPPED and reported, never silently
   stored (same scope guard as the skills API).
4. AI suggestions are labelled ("AI pasiūlymas — patvirtinkite prieš
   įrašant"), reviewable, rejectable, and appear ONLY when
   AI_PROVIDER_MODE=live + AI_API_KEY are set; otherwise the deterministic
   path runs alone with NO fake AI badge.
5. AI receives only the composed text (bio), never contacts/documents.
6. No fabricated experience, dates, employers, or skills — the extractors
   are lexicon passes over the user's own words; the `worker_profile`
   agent's system prompt + zod envelope forbid invention.
7. The single-list review UX is preserved — the dual-bucket grid removed in
   fix/cc/profile-text-skills-unify-flow-v2 must NOT return (owner
   production-smoke decision). Promotion happens at confirm time behind the
   one list, not as a second visible system.

## Tier model (unchanged, one truth)

`self_declared` → (journal evidence link) `work_journal` →
(manager/owner confirmation) `manager_confirmed` / `verified`.
Free-label claims stay a declared tier on the Verified CV; catalogued rows
participate in matching and evidence. Verification provenance guards:
`skill-verification-provenance.test.ts`, `journal-profile-single-path.test.ts`.
