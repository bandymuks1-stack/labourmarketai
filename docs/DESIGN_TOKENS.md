# Design Tokens — token-first, theme-swappable (TASK 06)

> The whole internal product is driven by one token layer. Components never
> hard-code a colour, radius, shadow, font, or motion value — they consume token
> classes only. Changing the look (light theme, per-market theming, a rebrand) is
> a **token swap with zero component edits**. This is binding.

## Where the tokens live
| Token | Source | Consumed as |
|---|---|---|
| Colour | `apps/web/tokens/colors.ts` → `rgb(var(--c-*) / <alpha-value>)` | `bg-ink-800`, `text-text-primary`, `bg-state-success/10`, … |
| Channels (dark/light values) | `apps/web/app/globals.css` (`:root` + `[data-theme="light"]`) | the CSS variables the colour tokens point at |
| Radius / shadow / gradient / typography | `tokens/{radii,shadows,gradients,typography}.ts` | `rounded-*`, `shadow-card`, `bg-gradient-*`, `font-display` |
| **Motion** | `tokens/motion.ts` → `var(--motion-*)` (defined in `globals.css`) | `duration-fast`, `ease-spring`, and the named utilities `.verified-pop` / `.rise-in` / `.live-dot` |

`tailwind-preset.ts` is the ONLY place tokens map into Tailwind. `tokens/index.ts` is the single export.

## How theme-swap works (the architecture)
Colours are stored as **RGB channel triplets** (`"R G B"`) in CSS variables, and each token resolves to `rgb(var(--c-name) / <alpha-value>)`. Because the *class names* never change, swapping a theme only changes the variables:

- **Dark** (default) = `:root` channels in `globals.css`.
- **Light** = `:root[data-theme="light"]` channels (slots are built and live now).
- A **rebrand / per-market theme** = add another `[data-theme="…"]` block (or overwrite `:root`). No component touches.

The channel form is what preserves Tailwind opacity modifiers (`/10`, `/40`) across themes — a plain `var(--x)` full-colour would break them.

### Proving the swap
`components/ui/ThemeToggle.tsx` (mounted on **Account → Appearance**) flips `document.documentElement.dataset.theme` between `dark` and `light`. Every component re-themes instantly because they all read the channel tokens. A no-flash bootstrap in `app/[locale]/layout.tsx` applies the saved theme before paint. Pinned by `lib/guards/design-tokens.test.ts`.

## Motion (the "living arena" feel)
Timing/easing have one source (`--motion-instant|fast|base|slow`, `--motion-ease-out|spring`). Named, token-driven, GPU-friendly utilities:
- `.verified-pop` — the **scored moment**: a declared skill becoming a verified Work Proof pops + glows (spring easing, `state-success` glow that swaps with the theme). On the profile verified badge and the manager confirm result.
- `.rise-in` — feed items / panels entering.
- Existing `.live-dot`, `.ticker-track`, `.map-marker`, `.stage-*` — live ambience.

**Every** animation is disabled under `@media (prefers-reduced-motion: reduce)`. Accessibility and performance come first — liveness must never be gaudy or janky.

## Rules (binding)
1. No raw hex / px / ms / cubic-bezier in components. Use token classes.
2. New colours: add a channel var (dark + light) in `globals.css` and a token in `colors.ts`.
3. New motion: add a `--motion-*` var + a `tokens/motion.ts` entry; gate any animation under `prefers-reduced-motion`.
4. Never render a raw i18n key (e.g. a role slug) — every label resolves in all 10 locales.

## Status / follow-ups (not blockers)
- Dark theme ships polished; light theme **slots are real and swappable** today — the light *values* are a sensible first pass and are tunable per token (they're just variables).
- Decorative raw-`rgba()` accents inside a few `globals.css` keyframes/gradients (card-border sheen, some glows) are dark-tuned; refine for light in a follow-up. Semantic surfaces/text/state all swap.
- Broader primitive elevation (buttons/inputs/forms/cards/tabs/modals/toasts) and bringing every surface fully up to the arena language is the next design slice; this PR lands the **token + motion + theme-swap foundation**, the **scored moment**, and the **raw-slug fix**.
