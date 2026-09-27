# Black + Metallic Gold visual system — CHECKPOINTED ON A DRAFT PR

Untracked working note (deliberately not committed). Delete it when the PR merges.

## Checkpoint

- Branch `feat/cc/black-gold-visual-system`
- `b2e47cbf` feat(design): black + metallic gold visual system across the product
- `6a3137ed` fix(guards): drop the incomplete comment stripper CodeQL flagged
- **Draft PR #1683** — https://github.com/bandymuks1-stack/labourmarketai/pull/1683
- CI: **all checks pass** (quality, migration-safety, e2e-smoke, mobile,
  CodeQL / Analyze). Mergeable: CLEAN.
- **NOT merged. NOT deployed.** `main` is at `c189dd4e`, which is the owner's own
  docs-only PR #1682 — nothing of this work is on `main`.

## Scope

118 files: 7 added, 1 deleted, 110 modified.
**Zero** migrations, SQL, RLS, grants, authorization, evidence semantics or
business logic. Visual only.

## Owner decision recorded (2026-09-09)

Three colour roles, kept distinct so EVIDENCE ≠ VERIFICATION holds:

- **gold `#D4AF37`** — brand / primary action
- **cyan** — evidence-supported
- **verification green** — verified / confirmed (`--c-trust-accent`)

147 `brand-cyan` usages were kept for that reason; only 88 decorative ones were
recoloured.

## The one CI finding

CodeQL raised one new HIGH alert (`js/incomplete-multi-character-sanitization`)
on the comment stripper inside the new guard — a test-only helper reading local
files, so not exploitable, but real as a pattern. Fixed at the root in
`6a3137ed`: the asset provenance notes no longer quote the source hex, so no
sanitising is needed and the guard became stricter. CodeQL now passes.

## Intentional exceptions

- Google sign-in button stays white (Google brand terms) — the only light
  surface on any user-facing product surface.
- `brand-cyan` on evidence surfaces.
- Map ocean reads blue-ish — inverted OSM raster (cartography), not brand.

## Environment

- `apps/web/.next` was rebuilt with the NORMAL environment and inlines
  `https://gorgitwvdzxbnaxhrsrw.supabase.co`.
- Local Supabase (Docker) still running on 54321/54322; safe to stop.
- `apps/web/tests/e2e/.storage-state*.json` — local fixture sessions, gitignored.

## HUMAN_UI_PROVEN: NO

No owner session was minted or used. Production was never written to. The
owner's manual production walkthrough remains the outstanding gate.
