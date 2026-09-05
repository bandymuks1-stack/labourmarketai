# The Living World of Work — art direction & production pipeline

Status: **PHASE 2 complete. PHASE 3 blocked on an owner decision.**
Author: Claude Code, acting as technical director (not as the artist).
Date: 2026-08-19.

This document exists because the owner rejected two of my visual attempts and was
right both times. The second rejection named the real cause correctly: the
problem was never the layout or the iteration count. It was the **production
method**. Hand-authored SVG geometry produces a developer's diagram no matter how
many times a developer refines it. So this document does two things and
deliberately does not do a third:

1. **PHASE 2** — reports what visual production capability actually exists in
   this environment. Verified, not assumed.
2. **PHASE 1** — specifies the art direction precisely enough that whichever
   pipeline the owner chooses can execute it without me re-deriving it.
3. It does **not** contain another SVG scene. The owner asked me to stop
   producing and start directing. This is me doing that.

---

## 1. PHASE 2 — capability audit (verified)

I checked each of these rather than reasoning about what "should" be available.

| Capability | State | How it was verified |
|---|---|---|
| Image generation tool in my toolset | **Absent** | `ToolSearch` for image/diffusion/render/photorealistic returned only unrelated tools (Airtable, Cloudflare, Drive, plugin search) across two independent queries |
| Raster/vector rasterisation libs (`sharp`, `satori`, `@resvg/resvg-js`, `canvas`) | **Absent** | probed `node_modules` and `apps/web/node_modules` — none present |
| 3D runtime (`three`, `@react-three/fiber`, `babylon`, `ogl`, `pixi`) | **Absent** | same probe; the only animation dep in `apps/web/package.json` is `framer-motion` |
| External image-gen API credentials | **Absent** | environment carries no `OPENAI` / `GEMINI` / `STABILITY` / `REPLICATE` / `FAL` / `HUGGING*` key; the only matching var is `ANTHROPIC_BASE_URL` (the agent proxy) |
| Project AI runtime, image modality | **Not modelled at all** | no occurrence of `image`, `vision`, `modality` or `multimodal` anywhere in `apps/web/lib/ai/runtime/*.ts` — it is a text-completion runtime |
| Project AI egress | **Closed by design** | `AI_EGRESS_GRANTS` is empty and `data-sensitivity.ts` records that **no task is classed `PUBLIC` today**; AI activation is PARKED by owner decision 4 |
| Existing licensed-asset pipeline | **None** | `apps/web/public` is **24 KB** in total and contains no raster art. The project has never shipped a photographic or illustrated asset |
| Rendering capability I do have | Chromium 1194 + `@playwright/test` | `/opt/pw-browsers/chromium` present; this renders HTML / CSS / SVG / WebGL and nothing else |

### What this means, stated plainly

**I cannot produce the frames PHASE 3 asks for.** Not "it would be hard" —
the capability does not exist in this environment. Everything I can render is
authored by me in markup and rasterised by a browser, which is precisely the
class of output that was just rejected. Producing another one would be me
ignoring the owner's instruction in order to look productive.

One nuance worth stating because it changes the decision: **the AI DATA BOUNDARY
is not what blocks this.** An art-direction prompt describing a construction site
at dusk contains no worker, company, project or Work Journal data — it is
genuinely `PUBLIC`-class content. The boundary would not be violated by an image
generation call. What blocks it is narrower and purely mechanical: **there is no
key and no tool.** Adding a key is a new secret, which is RED class under
`CLAUDE.md` → Merge model, and therefore the owner's decision, not mine.

I am recording this as an **OWNER_GATED** blocker and parking the branch, per the
standing loop rule.

### Options I considered and rejected as technical director

- **Install `three` and build the world procedurally in WebGL.** This is
  permitted (an npm dependency is not a "model download") and it would genuinely
  add real perspective, depth, shadow and atmospheric fog. I am not recommending
  it, for one honest reason: without models, textures and HDRIs, a procedural
  three.js scene is *geometry I authored*, in grey. It is the same failure mode
  in a heavier runtime — which is also exactly what the owner warned against
  ("don't add a heavy runtime merely for novelty"). Low-poly diorama is a
  legitimate art direction, but it is a *different* art direction from the
  cinematic one specified, and it should be chosen deliberately, not arrived at
  because it was the only thing I could reach.
- **Download an asset pack / install Blender.** Contradicts the standing "no
  unnecessary installations or downloads" rule, and carries licensing decisions
  that are the owner's.
- **Ship the SVG prototypes as "good enough".** Rejected twice. Correctly.

---

## 2. Pipeline options — the owner decision

Ordered by quality-per-effort as I judge it.

### Option 1 — Image generation, owner-held key *(my recommendation)*
A single owner-provided key (OpenAI `gpt-image`, Google Imagen, fal, or
Replicate) used **only** for landing art direction, with an explicit
`PUBLIC`-ceiling egress grant recorded in `data-egress.ts`.

- **Quality:** highest reachable without a human artist. This is the only path
  that produces genuinely cinematic material surfaces and light.
- **Speed:** three A/B/C frames within one working session.
- **Cost:** a few euro of API credit for the exploration.
- **Risk:** a new secret → RED class → draft PR + `needs-human-gate`. Licensing
  must be checked per provider for commercial use (OpenAI and Google both grant
  commercial rights to outputs today; this must be re-verified at the time, not
  taken from this document).
- **Data boundary:** untouched. Prompts carry no private data, and the grant
  ceiling stays at `PUBLIC` so the gate cannot widen as a side effect.

### Option 2 — Licensed asset kitbash + compositing
Purchase cinematic stock or a 3D kitbash and composite a bespoke scene.

- **Quality:** high, and fully licence-clean if bought properly.
- **Speed:** slow. Requires tooling this container does not have.
- **Risk:** the owner-rejected "stock-photo collage" outcome is a real failure
  mode here unless a single coherent scene is composed, not assembled.

### Option 3 — Commission an illustrator / environment artist
- **Quality:** highest possible, and uniquely ownable.
- **Speed:** weeks.
- **Cost:** the real one.
- **Note:** §3 below is written so it can be handed to an artist verbatim.

### Option 4 — Procedural WebGL diorama, built in-house
- **Quality:** materially above the rejected SVG, materially below cinematic.
- Choose this only as a deliberate stylistic decision, never as a fallback.

**Nothing proceeds to PHASE 3 until the owner picks one.** The landing freeze
baseline remains untouched, as instructed.

---

## 3. PHASE 1 — the art direction specification

This is the part that survives regardless of pipeline. It is written to be usable
as an image-generation prompt, a 3D scene brief, or an artist commission.

### The invariant test
> Remove every word and the LabourMarket.ai logo. If the image alone does not
> immediately say *"a living world of work"*, it is rejected before it is shown.

### Canonical direction
One **continuous, believable European working world** — not seven scenes, not
seven cards, not seven stripes. A single place, seen at once, in which work is
visibly happening.

**Must have**
- Real spatial depth and architectural scale; a genuine horizon.
- Recognisable workplaces: construction, logistics/warehouse, manufacturing or
  workshop, kitchen/hospitality, care/health, office/professional, and something
  distant — city edge, greenhouse, infrastructure.
- **People visibly inhabiting and working inside these spaces**, at a scale where
  posture and activity read, not as silhouetted stick figures.
- Material surfaces: concrete, steel, glass, timber, painted metal, worn asphalt.
- Cinematic lighting with one coherent light source. Dusk or early morning:
  warm interior light against a cool exterior sky.
- Atmospheric perspective — distance visibly loses contrast.
- A clear visual hierarchy: one focal region, a mid-ground, a receding distance.

**Must not be**
- An SVG diagram, schematic, stick figures, or flat geometric buildings.
- A SaaS network illustration, dashboard, infographic, or screenshot hero.
- Seven separate cards or scenes.
- Generic AI blue/purple gradient identity, glassmorphism, abstract particles,
  floating dashboard cards, a 3D globe, or a template-marketplace aesthetic.

**Reference register:** premium cinematic architectural visualisation; a
miniature living world; a high-end game environment. The labour market itself is
the hero — not the product, not the UI.

### Composition constraints that come from the product, not from taste
- Desktop is ~1440px wide; the frame must survive a headline and two CTAs
  overlaid on it, so it needs a **quiet region** in the upper-left third with low
  contrast and no critical detail.
- Mobile (~390px) is a **separate portrait composition**, not a crop. Its focal
  workplace should be nearer and larger; the distant city may be dropped entirely.
- Budgets: ~2.5 MB desktop hero, ~900 KB mobile. This is the reason the final
  asset is likely AVIF/WebP at two art-directed sizes rather than one huge image.
- Text contrast must still meet WCAG AA over whatever region the copy occupies.
  The art direction is subordinate to that, not the reverse.

### The three directions to render (A / B / C)

**A — CINEMATIC LIVING SECTION.**
A vertical cross-section through the working world, as if one clean cut were made
through a European working district and we are looking straight into it: below
grade infrastructure, ground-level construction and logistics, workshop and
kitchen floors above, care and office floors above those, city and sky at the
top. Every stratum is lit from inside and populated. The cut is architectural and
believable — a section drawing rendered as a photograph, not an exploded diagram.
*Strength:* it says "the whole of work, at once" better than anything else.
*Risk:* the closest of the three to reading as an infographic; the render must be
unmistakably photographic.

**B — LIVING EUROPEAN WORK CITY.**
An elevated three-quarter view over a real-feeling European working city at dusk:
a construction crane over a half-finished frame, a logistics yard with trucks at
the docks, a lit workshop, restaurant windows, a clinic, an office floor, and the
city receding into haze. Streets and yards connect them physically. Roughly the
scale of a detailed miniature — close enough that individual workers read.
*Strength:* the most immediately believable and the least likely to be mistaken
for a diagram. *Risk:* generic city imagery; the *work* must dominate, not the
skyline.

**C — INFINITE WORK WORLD.**
A ground-level or near-ground view down a continuous working landscape that
recedes without a visible end — workplaces chained one behind another into
atmospheric haze, each fully lit and occupied, the horizon never resolving.
*Strength:* the strongest emotional claim — work has no edge, and there is always
another opportunity further in. *Risk:* the hardest to keep legible; without a
strong focal anchor in the near third it becomes atmosphere with no subject.

### Rendering plan once a pipeline is chosen
1. Desktop-first: render A, B and C at 1440×900 or wider.
2. Apply the invariant test to each. Reject and re-render before showing.
3. Present all three to the owner with screenshots. **Do not build all three.**
4. Only after the owner selects one: build that direction into the product, add
   controlled motion, parallax and live opportunity signals from real
   LabourMarket data, and compose the mobile frame separately.
5. Accessibility, performance budgets, product semantics, CTAs, auth, `/jobs`,
   signup, locale routing, SEO and RLS behaviour all stay exactly as they are.
6. The landing freeze baseline is regenerated **only** after explicit owner
   approval of the selected final visual.

---

## 4. What is parked

- `feat/cc/living-world-visual` holds the rejected abstract `WorldField` (mounted
  nowhere, so it ships no visual change) and the rejected SVG prototypes. They
  are kept as a record of what was ruled out, not as candidates.
- `apps/web/components/marketing/page-hero.tsx` is unchanged from `main`.
- The landing freeze baseline is untouched.
