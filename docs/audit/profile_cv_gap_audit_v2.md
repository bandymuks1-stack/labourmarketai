# Profile / CV — gap audit v2

What works on `/lt/dashboard/profile` today vs what a real tester actually needs in order to leave with a useful profile.

## What's live (post PR #44 + #45 + intervening polish)

- **Free-text composer** (`ProfileTextFirstFlow`) — worker writes a paragraph, the parser surfaces skill suggestions from `profile-skill-claims-actions`.
- **Skill confirmation chips** — each suggestion → pending / confirmed / saved state. Confirmed claims persist in `profile_skill_claims` (owner-only RLS, no employer visibility).
- **Capability profile section** — surfaces the saved claims back as the worker's "capability card".
- **Worker trade profile slot** (catalogued picker) — only mounts when the worker has a `workers` row; pure company / agency / customer accounts see only the self-declared composer + chips.
- **CV preview** — passive render of profile state.

## What this audit changes

This PR (B) ships ONE additive, read-only `ProfileCvClarityCard` mounted above the existing composer. Five-step list:

1. **Apie mane / patirtis** — narrative composer.
2. **Įgūdžiai** — self-declared chips.
3. **Darbo žurnalas** — work-journal link.
4. **Kas paties nurodyta** — these are self-declared; what's saved is honest, but not externally confirmed yet.
5. **Kas laukia įrodymų / išorinio patvirtinimo** — what the future external-confirmation backbone (PR #18, draft) will eventually add.

The card does NOT:
- Show a fake "completion percentage" or progress bar.
- Imply that any chip is "verified".
- Suggest that hitting a target lights up matching / search visibility.
- Mention features that don't exist.

## What's still missing (deferred)

| Gap | Plan |
|---|---|
| External confirmation status per claim | Lives in PR #18 backbone (draft, untouched). Card already names it. |
| Public CV / share-link surface | Out of scope until external confirmation lands. |
| Profile photo / avatar | Deferred — needs storage / moderation policy first. |
| Multi-language profile body (LT + EN side by side) | Deferred — current shape is single-locale per profile. |
| Per-claim source attribution (manual vs from narrative vs from journal) | Schema supports it (`profile_skill_claims.source`); UI surface deferred to a focused PR. |
| Resume export (PDF) | Deferred — would need a serializer + branded template + i18n. |

## What this audit explicitly does NOT recommend

- **A gamified "Profile strength: 87%" bar.** Doctrine forbids fake achievement signals.
- **An "AI completeness check".** Doctrine §7: no fake AI.
- **An employer-facing public CV.** RLS keeps self-declared claims owner-only; PR #18 is the prerequisite for sharing any of this externally.
- **Auto-promotion of a `profile_skill_claims` row to `worker_skills`.** Different RLS scopes; intentional split (worker_skills is employer-readable, claims aren't).

## Refs

- `apps/web/app/[locale]/dashboard/profile/page.tsx`
- `apps/web/components/app/profile-text-first-flow.tsx`
- `apps/web/components/app/profile-cv-clarity-card.tsx` (this PR)
- `apps/web/lib/profile/profile-skill-claims-actions.ts`
- `supabase/migrations/0015_profile_skill_claims.sql`
- `docs/policies/journal-evidence-and-correction-policy-v1.md` — adjacent doctrine.
