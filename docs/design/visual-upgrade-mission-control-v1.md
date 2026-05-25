# Visual upgrade — "Mission Control" direction v1

The owner wants a stronger cinematic, system-level, **mission-control / spaceship** feel. This doc captures the design direction so future visual PRs land in the same target, and identifies which routes give us the highest visual ROI for the lowest implementation risk.

This sprint ships **the direction doc only**. No global UI rewrite. Future visual slices reference this doc as their north-star, and each lands as a single-route, single-purpose PR.

## The target feeling

When a tester opens the dashboard, they should feel: "this is a system. Not a settings page. Not a Notion clone. There is a central core, telemetry, a live view of what's happening — and I'm the operator."

Concrete shorthand for the team:

- **Premium dark surfaces** — deeper blacks (`ink-900` baseline already exists); selective ambient glow rather than flat panels.
- **Stronger hierarchy** — a single hero panel per route that earns the visual weight, surrounded by quieter modules.
- **Module cards, not widgets** — fewer, bigger, richer cards rather than many small ones. Each card has its own micro-identity (eyebrow, big number, supporting line, action).
- **Depth + glow** — selective use of the existing `AmbientGlow` component on key routes, plus card-level glow on hover/focus.
- **Live core indicator** — a central element on the dashboard that feels "alive" (heartbeat, recent activity stream, current pilot state) rather than a static welcome card.
- **System-level typography** — `font-display` for hero numbers / titles; `font-mono` for codes / IDs / timestamps; body text stays sober.
- **Telemetry as a citizen** — the admin pilot-telemetry page should look like a control panel (rows of monospace data, clear status colour, no decorative chrome).

What we explicitly avoid:

- Cartoonish or "gamified" badges.
- Glowing rainbows / acid colours / chromatic-aberration effects.
- Sliding hero carousels.
- Pixel-perfect skeuomorphism (we're not faking buttons on metal panels).
- Heavy custom illustrations until we have a brand system.

## Three to five high-impact routes

Ordered by **visual ROI / risk**:

### 1. `/lt/dashboard/admin/agent-os` and `/lt/dashboard/admin/pilot-telemetry` — Admin Command Center

**Why first:** lowest user-impact (admins only — testers don't see it), highest demo-value, naturally already a "control" surface.

**Direction:**
- Promote the top-row cards into a single hero status panel: "Pilot state · X events today · Y errors · Z language reports". One row, monospace numbers, ambient glow at the panel level.
- Make the agent role cards visually distinct per scope (owner / ops / tester / security / sales) with a subtle left-border accent colour.
- Pilot-telemetry tables: switch to a darker zebra pattern + monospace columns + status colour dots in the result column.

**Implementation risk:** low — admin-only, no flow disruption.

### 2. `/lt/dashboard` (worker dashboard) — central "Mission Control" feel

**Why second:** the route every tester sees first after onboarding. The biggest single win for "this feels like a real product".

**Direction:**
- One central hero card: "Your current pilot state" — what role is active, what's the next safest action, a small live counter from `pilot_events` (e.g. "3 journal entries this week").
- Demote the existing "wow" panel (the v1 onboarding nudge) into a single bordered callout, not a multi-card grid.
- Bigger journal entry preview card with a glow on hover.
- Quieter secondary tiles (profile / drafts / communication) below.

**Implementation risk:** medium — touches the most-visited route. Needs careful before/after screenshots before merging.

### 3. `/lt/dashboard/profile` — the player card

**Why:** the worker's own identity surface. Currently feels HR-formy; should feel like a player card / dossier.

**Direction:**
- Top panel: profile photo placeholder + name + active role + a single big quoted line from `profile_text` (or "(not yet written)").
- Skill chips presented as a roster: max-12 chips, larger size, status-bin colour rim.
- Work history as a vertical timeline with `font-mono` dates.

**Implementation risk:** medium — touches an actively-iterated route (PR #44, #45). Coordinate with that work.

### 4. `/lt/dashboard/communication` — inbox feel

**Why:** the new surface from this sprint. Cheaper to style right the first time than to retrofit later.

**Direction:**
- Three-column layout on desktop: thread list (left, narrow) · selected thread (center, wide) · context panel (right, narrow — participants, last_read, kind chip).
- Mobile: single column, swipe-back from detail.
- Quiet card surfaces; the messages themselves carry the visual weight.

**Implementation risk:** low — surface is brand new in v1, no existing layout to break.

### 5. `/lt/dashboard/company`, `/agency`, `/buyer` — workspace cards

**Why:** the surfaces the owner is most demo-ing to pilot sales prospects.

**Direction:**
- Workspace eyebrow ("COMPANY WORKSPACE") with a subtle horizontal-line accent.
- Pilot disclaimer card as a single bordered note, not a full panel.
- Draft form with section dividers + a single big save CTA + an honest "private" lock icon next to "Saved privately…".
- Future addition: the "Team / roster" compact card from `docs/audit/team-management-gap-audit-v1.md` — natural fit for premium card treatment.

**Implementation risk:** medium — touches three parallel routes; one before/after sweep needed.

## Implementation strategy

**Don't ship a global redesign in one PR.** That breaks tests, breaks muscle memory, and makes regression detection impossible.

Instead, each visual slice ships as:

1. One PR per route.
2. Before/after screenshots in the PR body.
3. Existing guard tests stay green; copy / IDs / data-testids unchanged.
4. No new external dependencies (no design libs — we use what's already in Tailwind config + `card-border` / `font-display` / `AmbientGlow`).

Each PR also updates this doc with what landed + what changed vs the plan.

## See also

- `apps/web/components/decor/ambient-glow.tsx` — existing decorative layer.
- `apps/web/tailwind.config.ts` — colour tokens (`ink-*`, `state-*`, `brand-*`, `text-*`).
- `apps/web/messages/lt.json` — copy lives there; visual changes should NOT need new keys unless the structure genuinely changes.
- `docs/audit/team-management-gap-audit-v1.md` — feeds the company / agency workspace plan.
