# Imagery Prompts — Worker Portraits

The agent cannot generate images. Until the founder produces the final
assets, the PlayerCards and hero use the abstract silhouette
`public/placeholders/worker-portrait.svg` (registered + visibly marked via
the placeholder system). Replace each via `pnpm placeholders:promote
workers.featured.<n>` once real, consented imagery exists.

## Shared style (apply to every portrait)

> Cinematic editorial portrait of a construction professional, chest-up,
> looking slightly off-camera. Strong **blue rim light** along one side of
> the face and hard hat. Background: out-of-focus night city skyline with
> cool blue/teal bokeh, deep near-black (#06070D) tone. Photoreal, shallow
> depth of field, 85mm look, high dynamic range, dignified and competent —
> never stocky or staged. No logos, no text. Square crop, 1024×1024,
> subject centred for a 96×96 circular mask.

Output: WebP, ≤120 KB each, sRGB. File names:
`worker-1.webp`, `worker-2.webp`, `worker-3.webp` in
`apps/web/public/placeholders/`.

## Per worker

**workers.featured.1 — gold (NL, steel-fixing foreman)**
> …mid-40s steel-fixing foreman, weathered confident face, hi-vis orange
> over a navy thermal, scuffed white hard hat, faint rebar bokeh behind.
> Blue rim light from camera-left.

**workers.featured.2 — silver (DE, site manager)**
> …late-30s site manager, sharp focused expression, charcoal softshell
> with subtle hi-vis piping, grey hard hat, tablet barely visible at the
> edge. Blue rim light from camera-right.

**workers.featured.3 — bronze (LT, electrician)**
> …early-30s electrician, calm approachable look, hi-vis yellow vest over
> a grey hoodie, blue hard hat, faint cable-reel bokeh. Soft blue rim
> light, slightly warmer key.

## Consent

These are real-person depictions. Before promotion, written consent (model
release) must be recorded in `docs/CONSENT_LOG.md` per the governance rules
— a generated likeness still needs a documented usage right.
