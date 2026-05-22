# TASK — Post-PR26 Work-Identity & Header WOW UX v1

> **Status:** Handoff prepared, **NOT yet executed.** Do not start until the owner
> explicitly instructs. Built on `main` after PR #26 merged (work-identity path is
> functionally complete; this sprint is the premium-UX pass on top of it).

## Goal

Lift the work-identity surfaces and the landing header from "functional but
form-like" to premium WOW, **without** changing data behaviour or adding any
fake real-time / AI / matching / scoring claims. This is a **visual + UX +
copy** sprint on existing, working components.

## Sprint goals (from owner)

1. **Work identity block no longer looks like a raw form / chip list** — it
   should read as a composed, premium identity panel.
2. **Additional directions become premium capability groups** — each direction a
   clear, calm capability card/group, not a bare chip row.
3. **Active editing direction is visually clear** — obvious selected/active
   state for the direction whose skills are being edited (builds on the
   click-to-edit chips + "Editing direction: X" header shipped in PR #26).
4. **CV preview becomes a live worker passport / scouting profile** — the
   `CvPreview` should feel like a premium passport/scouting card, not a plain
   list. (Keep it honest: self-declared until proof-backed; no universal score —
   PRODUCT_CONSTITUTION §10, `docs/CONTEXTUAL_FIT_SIGNALS.md`.)
5. **Landing header language selector redesign** — replace the long technical
   language-code list with a compact premium selector (e.g. globe + current
   language, popover with names/flags), mobile-clean.
6. **Landing ↔ app interior feel more unified** — shared visual language,
   chips, cards, motion (builds on PR #21's journey-rail continuity layer).
7. **Add motion / action feeling without fake real-time claims** — reuse the
   existing reduced-motion-safe motion utilities (`.wow-card`, `.stage-line`,
   `.stage-current`); motion is decorative only, never implies live activity,
   real matching, or real metrics.

## Likely surfaces to touch (investigate first)

- `apps/web/components/app/worker-trade-profile.tsx` — directions + skills panel.
- `apps/web/components/app/cv-preview.tsx` — the passport/scouting treatment.
- `apps/web/components/app/profession-skills-picker.tsx` — calmer skill chips.
- `apps/web/components/marketing/locale-switcher.tsx` (or wherever the header
  language list lives) — compact premium selector.
- `apps/web/app/globals.css` — reuse existing motion utilities; add only
  reduced-motion-safe, decorative animations.
- i18n: `messages/*` — en + lt authored, 8 non-primary locales `[EN]` fallback
  (project convention).

## Absolute non-negotiables

Do not touch: **PR #18**, Supabase migrations, RLS/RPC, production DB schema,
billing, payments, deploy, DNS, env, migration files.

Do not add: fake AI, fake automatic parsing, fake matching, fake verification,
fake scores, fake jobs, fake candidates, fake companies, scoring engine,
matching engine, verification engine, DB/schema changes.

Keep concept visuals governed by `docs/DEMO_TO_REAL_DATA_POLICY.md`; respect the
no-universal-value doctrine (`docs/CONTEXTUAL_FIT_SIGNALS.md`); keep human-first
language (no people-as-commodity framing).

## Guardrails carried from prior sprints

- Skills/directions stay **editable and removal-safe** (PR #26): saving one
  direction must never delete another's skills; already-saved skills always
  remain valid.
- Journal stays **free-text first**; work direction optional (PR #26).
- Self-declared ≠ confirmed: never imply proof-backed status that doesn't exist.
- Mobile must stay clean at 390px.

## Validation expectations (when executed)

typecheck · lint · build · placeholders:check · all locale JSON parse · route
smoke · forbidden-path check · git diff scope verification · gitignored
owner-review artifact under `runtime/review/`.

## Acceptance (when executed)

Work identity reads premium (not a raw form); directions are capability groups
with a clear active state; CV preview feels like a live passport/scouting
profile; header language selector is compact/premium; landing↔app feel unified;
motion present but makes no fake real-time/AI/matching/score claims; mobile
clean; no schema/migration/forbidden-path changes.
