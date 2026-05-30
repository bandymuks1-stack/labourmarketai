# TASK 06 — The "Living Labour Market" Design System (token-first)
**For:** Claude Code (executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**Where it fits:** `docs/PROJECT_ROADMAP.md` — a cross-cutting quality pass while DI lines up the first pilot client. Not a new feature; a coherent visual upgrade of the existing internal product.
**Branch:** `feat/cc/design-system-living-arena` · **Tier:** likely 🟢 (UI/tokens/components, no schema/RLS) → flows through the auto-merge envelope. Use the **frontend-design** skill.

> Direction toward a goal, not a boundary. The "likely surfaces" are a floor, not a ceiling. Firm lines = the Guardrails (token-first, no hard-coded values, theme-swappable, accessible, no fake data). Go broad — make the whole internal product feel alive and premium.

## THE VISION (DI's words, made concrete)
The internal product must feel like **a living labour market you watch in real time** — part **spaceship command bridge**, part **live sports arena**, part **map/board**. Not a static SaaS dashboard: things are *happening* — work being logged, skills being confirmed, proofs lighting up, demand pulsing. The user should feel they're monitoring a living system, not filling forms. Existing pieces already speak this language (FIFA-style PlayerCard, DraftBoard, MarketPulse/Bloomberg grid, JourneyTimeline) — this slice makes the WHOLE internal product live up to that, consistently, and fixes the current problem: buttons, forms, and cards look cheap and inconsistent.

Energy references: a mission-control bridge (calm dark surfaces, glowing live readouts, status lights), a sports broadcast (player cards, live tickers, score/standing boards, "now playing"), a strategy map/board (positions, movements, a field of play). Verified proof should feel like a goal being scored — a real, earned, satisfying moment.

## THE HARD REQUIREMENT — TOKEN-FIRST, THEME-SWAPPABLE
**Everything visual flows through design tokens.** No hard-coded colors, spacing, radii, shadows, fonts, or motion values anywhere in components. A single token layer defines the system; components consume only tokens. Consequences that MUST hold:
- Today: a polished **dark** "Industrial Intelligence" theme (safety orange / cyan signal / amber accents — the existing palette, done well).
- Future: a **light** theme must be achievable by swapping the token values ONLY — zero component edits. Build the light theme's token slots now (even if dark ships first) so the swap is real, not aspirational.
- Any future rebrand/recolor changes tokens in one place and the whole product follows. This is the non-negotiable architecture — DI explicitly wants to change everything easily later.

## HOW IT FITS THE WHOLE
This is what makes the product sellable and trustworthy-feeling to the first pilot company. A premium, alive, consistent surface signals a serious platform; the token architecture means visual evolution (light mode, per-market theming, rebrands) never requires rework. It directly serves "the right person, right work, right time — and WHY" by making the WHY *visible and alive*.

## READING ORDER
`docs/PROJECT_ROADMAP.md` → `PROJECT_VISION.md` → existing components (PlayerCard, DraftBoard, MarketPulse, JourneyTimeline) and current token/Tailwind config → `PLATFORM_DOCTRINE.md` → this file.

## GUARDRAILS (firm — never cross)
- **Token-first, zero hard-coded visual values** in components. One source of truth; dark theme now, light theme token-slots ready, swappable with no component changes.
- **No fake/sample/demo data** — the "live" feeling comes from REAL data and honest empty states that still look alive (a calm "no signal yet" arena, not a broken screen). Empty ≠ ugly.
- **Accessibility holds:** real contrast ratios, focus states, keyboard nav, readable type — "glowing dark" must never sacrifice legibility (a real pain point now).
- **Mobile-first** where the work happens (field workers on phones) — the arena must work in portrait, not just desktop.
- **i18n intact** (10 locales) — components must not break with longer DE/NL/PL strings.
- **Behavior unchanged** — this is presentation over the existing live RPCs/flows; no logic, schema, or RLS changes (if any are truly needed, that's RED → stop).

## DIRECTION (a sketch — floor, not ceiling)
You'll likely: establish the token layer (color/spacing/radius/shadow/typography/motion/elevation) with dark + light value sets; rebuild the cheap-feeling primitives first (buttons, inputs, forms, cards, badges, tabs, modals, toasts) as premium token-driven components; then bring the key surfaces up to the "living arena" language — onboarding (an inviting first launch), dashboards (a command bridge with live readouts per role), the Work Journal + confirm flow (the core, made satisfying — logging feels quick, confirmation feels like scoring), the profile + verified badge (the trophy/player-card moment a client will see). Lean into motion/feedback that signals "alive" (subtle, performant, accessible — not gaudy). Reuse and elevate the existing sports/Bloomberg components rather than replacing their concept. If anything else is needed to make the whole internal product feel like one premium living system, do it.

## DEFINITION OF DONE (outcome, not steps)
- The internal product feels like a single, premium, *alive* system — command-bridge / arena / live-board energy throughout — not a cheap form app.
- Buttons, forms, cards, badges and all primitives look and feel high-quality and consistent everywhere.
- 100% token-driven: switching dark→light is a token swap with zero component edits (prove it with a working light-theme toggle or a documented swap).
- Real data and honest, good-looking empty states; accessible (contrast/focus/keyboard) and mobile-first; i18n unbroken.
- The verified-proof moment feels earned and satisfying — the emotional core a pilot client will remember.

Deliver a draft PR (auto-merges if GREEN) + a short visual walkthrough of the upgraded primitives and the key surfaces, and a note proving the dark↔light token swap works.

## NOTE FROM DI / CHAT CLAUDE
DI will provide screenshots of the current internal screens; treat them as the "before" to fix. If screenshots aren't attached yet, proceed from the existing components and current routes, and flag any surface you couldn't assess. Start with the token layer + primitives (the "cheap components" pain), since everything else builds on them.

---

## CURRENT-STATE FINDINGS (from DI's screenshots — the concrete "before" to fix)
Reviewed: dashboard, profile, journal, account. The direction (dark theme) is fine; the *execution* is thin and reads as an empty document, not a living system. Specific problems to fix (these are the felt "cheap" pain — address them as part of the goal, not as a rigid checklist):

1. **THE core problem — everything is dead-static, like a year-2000 web page.** (Note: the empty side margins in the screenshots were a 30% browser-zoom artifact — at 100% the layout fits the screen fine. Do NOT chase "wasted canvas"; that is not the issue.) The real issue: nothing moves, nothing feels live, nothing signals "this is happening now." It reads as a flat stack of static boxes. This is the heart of the whole task — the product must feel ALIVE: a command bridge with live readouts, an arena where things are in motion, a board you watch update. Motion, liveness, and real-time feedback are the goal, not a nice-to-have.
2. **Box-in-box monotony, no hierarchy.** Everything is the same grey card with the same spacing; the eye has nowhere to land. Establish real visual hierarchy (primary live zone vs secondary panels), varied elevation/density via tokens, a clear focal point per screen.
3. **Low-contrast, small, washed-out type.** Grey-on-black body text is hard to read and looks unfinished — an accessibility AND polish failure. Fix the type scale and contrast in the token layer.
4. **Cheap primitives.** Thin buttons; small dull status badges (PATVIRTINTA / PATIKTA) that should feel like a scored point; flat form fields. Rebuild these first.
5. **The journal feed is flat.** It should feel like a live activity stream / match ticker — confirmed entries lighting up as verified proof. Make the verified state a satisfying, glowing "goal scored" moment.
6. **🔴 REAL BUG (not design) — fix it in this pass:** the account screen renders the raw slug **`auth.signup.role.admin`** instead of a translated role label. A user must never see a raw i18n key. Find any such unlocalized slugs across the internal screens and fix them (plain-language role names in all 10 locales). Flag if it's broader than one string.
7. **Onboarding/dashboard first impression** (the "Pradėkite savo veiklos erdvę" screen) should feel like powering up a console, not reading a form — this is the first thing a pilot client sees.

Start with the token layer + primitives + the wasted-canvas layout, since every screen suffers from those. Then bring each surface up to the living-arena language. The raw-slug bug (#6) should be fixed regardless of how far the visual work gets.

---

## WHAT "ALIVE" MEANS (the heart of this task — clarified by DI)
DI's #1 complaint is that the product is **dead-static like a year-2000 page.** The visual upgrade (tokens, primitives, contrast, hierarchy) matters, but it is in service of making the product feel LIVE. Liveness is the goal — chase it deliberately, broadly, and tastefully (performant + accessible, never gaudy or distracting). Likely ways to bring it alive (a floor, not a ceiling — use judgment):

- **Real-time pulse.** The product should feel like it's monitoring a living market: data that updates, subtle ambient motion, live status indicators (online/active, "in review", "just verified"), a sense that things are happening even when the user is idle. Use real data + Supabase realtime where it fits; honest calm "standby" states when there's nothing yet (an idle bridge, not a broken one).
- **Motion as feedback, not decoration.** Meaningful transitions: numbers tick up, a skill *animates* into its verified state, a journal entry slides into the feed, a confirmation lands like a scored point (a satisfying, earned micro-moment — light/glow/count). Entrance/state-change/hover/press all have considered motion via motion tokens.
- **The journal feed as a live ticker.** Not a static list — an activity stream that feels current, with confirmed entries lighting up. Think match ticker / mission log.
- **Command-bridge dashboards.** Live readouts and gauges per role (counts of verified proofs, pending reviews, active engagements) that feel like instruments on a console, updating — not flat stat boxes.
- **Arena energy for the proof moment.** Verifying a skill is the emotional core — make it feel like scoring: animation, glow, a count that climbs, maybe a brief celebratory beat. This is what a pilot client will remember.
- **Depth & life in surfaces.** Subtle gradients, glows, layered elevation, "signal" accents (the cyan/amber) used as live indicators — so even static moments feel like a powered-on system, not paper.

All of the above must be **token-driven** (including motion/timing/easing tokens) so it stays swappable and consistent, and must respect `prefers-reduced-motion` for accessibility. Performance first — liveness must never make it janky.

**Re-prioritized order:** tokens + primitives (incl. motion tokens) → bring the dashboards and the journal feed alive (the most-felt static surfaces) → the verified-proof "scored" moment → the rest. The dead-static feeling is the thing to kill first.
