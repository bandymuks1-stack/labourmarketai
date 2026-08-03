# Visual Contract v1 — AI-native visual system S1

Status: canonical. Guard: `apps/web/lib/guards/visual-contract-v1.test.ts`.
Scope: the visual component contract only — no product-domain behavior lives
here. Doctrine (`docs/PLATFORM_DOCTRINE.md`) wins on any conflict.

## 1. Product feeling

Every surface aims at the same register:

- **premium** — restrained European business product, not a neon "AI" UI;
- **calm** — one accent, quiet glows, motion is a whisper (the one spring is
  `ua-confirmed`);
- **warm** — human copy, honest empty states, no admin-table coldness;
- **modern** — token-driven dark/light, soft radii ladder, live typography;
- **human-first** — 44px touch targets, plain language, no technical state
  labels in user-facing UI;
- **AI-native without AI theatre** — the conversation and Context Panel are
  the product's spine; nothing claims intelligence it does not have
  (doctrine §7: no fake AI, no fake verification).

## 2. Canonical primitives

| Primitive | File | Contract |
|---|---|---|
| Card | `apps/web/components/ui/Card.tsx` | THE surface. One border/radius/elevation grammar (`card-border`, 18px). Variants: standard, interactive, selected, muted, elevated, empty, error, disabled; `compact` for dense lists. Interactive cards light a `focus-within` ring for the real control inside them. |
| Button | `apps/web/components/ui/Button.tsx` | Variants primary / secondary / ghost / **pill**. Pill is the canonical quiet action (44px min target); `pillLinkClassName` shares the exact grammar with `<Link>`/`<a>` CTAs. Honest `loading` (spinner + `aria-busy` + disabled). |
| Badge | `apps/web/components/ui/Badge.tsx` | Quiet mono/uppercase meta label. Tones: brand, live, warning, muted, neutral, informative, positive, critical, preview, disputed. States real persisted facts only. |
| StatusChip | `apps/web/components/app/status-chip.tsx` | (pre-existing, audit PR8) THE filled status pill — semantic tokens only, never clickable. |
| ResultShell | `apps/web/components/ui/ResultShell.tsx` | Presentation frame for async result surfaces: idle, loading, error, blocked, unavailable, empty, partial, ready. The caller owns the state machine and the truth of `ready`; the shell owns only the look. Content renders for ready/partial only. |
| EmptyState | `apps/web/components/app/empty-state.tsx` | (pre-existing) honest "nothing here yet": title / why / next / ONE real CTA. |
| Loading / skeleton | `ResultShell` skeleton + `ButtonSpinner` idiom | `animate-pulse` blocks and border-spinners, always `motion-reduce:animate-none`, always `aria-busy` on the busy region. |
| Focus states | all interactive primitives | `focus-visible:ring-2 focus-visible:ring-brand-blue` (ring, not outline); containers use `focus-within` to echo the inner control's focus. |
| Z-index scale | `apps/web/tokens/zindex.ts` | base 0 · sticky 10 · dropdown 20 · composer 30 · sheet 40 · overlay 50 · modal 60 · toast 70 → `z-base` … `z-toast`. New layers get a named entry, never a raw `z-[…]`. |

Tokens stay the single source: `apps/web/tokens/` (colors, gradients, motion,
typography, radii, shadows, **zindex**) wired exclusively through
`tailwind-preset.ts`.

## 3. Rules

1. **One visual grammar.** A card is `Card` (or, until migrated, the existing
   `card-border` class); a status pill is `StatusChip`; a meta label is
   `Badge`; a quiet action is the pill Button. No parallel systems.
2. **No raw one-off cards on new product surfaces.** New work imports the
   primitives; the guard ratchets raw `card-border` and pill strings so the
   count can only shrink.
3. **No fake AI claims.** Nothing is labeled AI-verified, AI-scored or
   AI-matched unless a real, shipped mechanism did exactly that (doctrine §7).
4. **No meaningless numeric scores.** No score rings, gauges or meters on new
   surfaces; the one pre-existing score visual is grandfathered and gated.
5. **No trust/reputation score.** Trust renders as the quiet gold `trust-ring`
   on really-confirmed things only — never as a number or tier ladder.
6. **No technical state labels in user UI.** `ResultShell` exposes its status
   as `data-status` for tests; users read human copy, not enum values.
7. **No duplicate dashboard or profile hub.** The workspace + Context Panel is
   the home of results (W3 Package 4 killed the second dashboard — it stays
   dead).
8. **No generic admin-first appearance.** Tables of raw rows, dense filter
   bars and enum badges are not the default; cards, plain language and one
   primary action per surface are.

## 4. Migration policy

- Existing surfaces migrate **gradually**, slice by slice, whenever a file is
  touched for other reasons or a dedicated migration slice runs. **No big-bang
  rewrite.**
- Every future slice **must** use the canonical primitives for new UI.
- Raw styling counts **must not increase** — the guard baselines
  (`card-border` 327, pill strings 10, arbitrary `z-[n]` 4 at S1) only go
  down. A slice that migrates call sites lowers the baseline in the same PR.
- S1 migrated one representative call site (the result-body fallback pill) to
  prove the contract; the ~170 `card-border` files and the remaining pill
  sites are future slices.
- Layout-sensitive surfaces (chat composer, mobile sheet, ContextPanel,
  global navigation, dialogs) migrate only in dedicated, visually verified
  slices — never as a drive-by.
