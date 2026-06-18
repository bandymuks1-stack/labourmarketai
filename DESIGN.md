# Labour Market AI DESIGN.md

Plain-text design system for AI agents and UI builders working on Labour Market AI.

This file defines how the product should look and feel. It follows the DESIGN.md convention: a markdown design system that agents can read before generating or changing UI.

The output must be original to Labour Market AI. Do not copy external products, brand names, screenshots, layouts, or competitor terminology. Use the structure and discipline of modern DESIGN.md files, but create a Labour Market AI visual system around real labour identity, skills, evidence, availability, projects, teams, and market signals.

---

## 1. Visual Theme & Atmosphere

### Core atmosphere

Labour Market AI is a living labour intelligence platform. The interface must feel like a premium work passport, a scouting room, and a market control centre in one coherent system.

The design mood is:

- dark-first, precise, and high-contrast for dashboards;
- clean, bright, and readable for forms and onboarding;
- card-driven, data-aware, and profile-centred;
- practical, not decorative;
- premium, but not fake luxury;
- active, but not noisy;
- human, not abstract AI theatre.

### Product metaphor

The user is not filling a form. The user is building a living professional identity.

The profile is the centre of the product:

- identity;
- skills;
- CV and documents;
- work journal;
- evidence;
- availability;
- location and market preferences;
- projects;
- confirmations;
- opportunity context.

The interface should make the user feel:

> My daily work becomes visible value.

### Visual energy

Use a mix of:

- sports scouting card energy;
- serious labour operations dashboard;
- digital passport / verified record system;
- tactical project map;
- premium SaaS control surface.

The design must never look like a generic job board, a simple HR form, a fake AI demo, or a static CV website.

### Density

Use medium-to-high information density only where it helps decision-making. Dashboards may be dense; onboarding must stay calm and focused. Mobile screens must show one clear primary action per view.

---

## 2. Color Palette & Roles

Use semantic colours consistently. Colours must communicate status, evidence, and action. Do not use random gradients or decorative colour noise.

| Token | Hex | Role |
|---|---:|---|
| `lm-ink` | `#07111F` | Primary dark canvas, dashboard shell, hero background |
| `lm-void` | `#030712` | Deepest background, cinematic sections, map shell |
| `lm-panel` | `#0F172A` | Main dark card surface |
| `lm-panel-soft` | `#172033` | Secondary dark surface, nested panels |
| `lm-line` | `#263348` | Borders, dividers, card outlines on dark |
| `lm-paper` | `#F8FAFC` | Main light page background |
| `lm-card` | `#FFFFFF` | Light cards, forms, profile editing |
| `lm-muted` | `#94A3B8` | Secondary text on dark |
| `lm-text` | `#E5EDF8` | Primary text on dark |
| `lm-text-dark` | `#111827` | Primary text on light |
| `lm-cyan` | `#22D3EE` | Active labour signal, digital profile activity |
| `lm-blue` | `#2563EB` | Primary action, links, navigation active state |
| `lm-emerald` | `#10B981` | Confirmed progress, verified/confirmed evidence |
| `lm-amber` | `#F59E0B` | Attention, trust highlight, incomplete but important |
| `lm-gold` | `#D6A84F` | Premium trust accent, confirmed work passport moments only |
| `lm-red` | `#EF4444` | Error, blocker, dangerous or required action |
| `lm-purple` | `#8B5CF6` | AI-assisted suggestion accent, never verification |

### Colour rules

- Use blue for primary actions and route focus.
- Use cyan for live profile/activity signals.
- Use emerald only when something is real, confirmed, completed, or positive.
- Use amber when the user needs to complete missing information.
- Use gold sparingly for high-trust or premium identity moments.
- Use purple only for AI-assisted suggestions; never use it to imply verified truth.
- Use red only for blocking problems, errors, or privacy/safety warnings.

### Gradient rules

Gradients are allowed only as subtle atmospheric layers:

- dark navy to near-black dashboard background;
- cyan/blue profile activity glow;
- amber/gold trust highlight on confirmed cards.

Do not use rainbow gradients or random decorative blobs.

---

## 3. Typography Rules

Typography must feel precise, modern, and easy to scan.

### Font direction

Use the current app font stack unless a product-wide font decision exists. The design should support:

- strong sans-serif UI typography;
- tabular numbers for metrics and readiness counts;
- optional monospace accents for system, evidence, and data labels.

### Type scale

| Role | Size | Weight | Usage |
|---|---:|---:|---|
| Display | 56-72px desktop / 40-48px mobile | 700-800 | Landing hero only |
| Page H1 | 36-48px desktop / 28-36px mobile | 700 | Dashboard and major product pages |
| Section H2 | 24-32px | 650-750 | Major cards and sections |
| Card title | 18-22px | 650-750 | Profile, opportunity, map, work journal cards |
| Body | 15-17px | 400-500 | Normal explanatory text |
| Small metadata | 12-14px | 500-650 | Status labels, dates, evidence labels |
| Micro label | 10-12px | 650-750 | Pills, badges, uppercase state labels |

### Copy style

Text should be short, direct, and actionable.

Good examples:

- Create profile
- Upload CV
- Add today’s work
- Update availability
- Add evidence
- Review suggested skills
- Complete missing profile signals

Avoid vague examples:

- Explore
- Learn more
- Discover AI
- Start journey
- Continue
- Open details

---

## 4. Component Stylings

### Buttons

#### Primary button

Use for the single most important action on the screen.

Style:

- background: `lm-blue` or blue-to-cyan gradient;
- text: white;
- radius: 12-16px;
- height: 44-52px;
- weight: 650;
- subtle shadow or glow on dark surfaces.

Examples:

- Create profile
- Upload CV
- Add today’s work
- Complete profile
- View market map

#### Secondary button

Use for supporting actions.

Style:

- transparent or soft panel background;
- 1px border using `lm-line`;
- text uses primary readable colour;
- same radius as primary.

#### Disabled button

Disabled actions must explain why they are disabled. Never leave a dead CTA.

### Cards

Cards are the main visual language.

#### Profile card

A premium card showing identity, profession, readiness, skills, evidence, and next action.

Must include, where data exists:

- avatar or initials;
- name;
- professional headline;
- availability;
- top skills;
- evidence state;
- readiness count based on real profile signals;
- latest useful activity;
- next best action.

Do not fabricate ratings or scores.

#### Work passport card

The strongest profile surface. It should feel like a valuable record, not a form summary.

Recommended styling:

- dark premium surface;
- subtle grid or map texture;
- cyan activity line;
- gold/emerald only for confirmed trust signals;
- clear completion state.

#### Skill evidence card

Show one skill or skill group with evidence level.

Evidence levels must be visually distinct:

- self-declared: neutral outline;
- CV/document-supported: blue/cyan outline;
- work-journal-supported: cyan active signal;
- confirmed by manager/client/company: emerald/gold trust signal.

#### Opportunity fit card

Show fit context, not magic ranking:

- required skills;
- location/work area;
- availability fit;
- evidence basis;
- missing information;
- next action.

No unexplained global score.

#### Market map card

Show private owner map context:

- visible area;
- signals available;
- missing data;
- exact vs approximate location;
- consent/visibility state;
- navigation availability only when allowed.

Never show fake markers.

### Inputs

Inputs must be large and mobile-friendly.

- minimum height: 44px;
- radius: 12px;
- border: visible in both light and dark modes;
- focus: blue/cyan ring;
- helper text: practical and short;
- errors: red with concrete fix instruction.

### Badges and pills

Badges should communicate status:

- `Self-declared`
- `CV-supported`
- `Journal-supported`
- `Confirmed`
- `Needs review`
- `Missing evidence`
- `Available`
- `Unavailable`
- `Approximate location`
- `Exact destination allowed`

Badges must not overpromise verification.

### Navigation

Navigation should be capability-aware and profile-centred.

Primary product areas:

- Profile
- CV / Documents
- Skills
- Work Journal
- Market Map
- Opportunities / Requests
- Company / Team context where applicable

Avoid duplicate pages and duplicate navigation paths that lead to similar screens with different names.

---

## 5. Layout Principles

### Grid

Use a responsive 12-column desktop grid and simple stacked mobile layouts.

Desktop:

- max content width: 1180-1320px;
- dashboard pages may use wider shells when map or operational panels need space;
- use 24-32px gaps between major columns;
- use 16-20px gaps inside card clusters.

Tablet:

- two-column where useful;
- collapse dense dashboards into priority groups.

Mobile:

- one-column;
- one primary action visible without searching;
- sticky bottom action allowed for profile completion, CV upload, or daily work update.

### Page pattern

Most product pages should follow this order:

1. Page title and practical subtitle.
2. Primary action.
3. Current state summary.
4. Main content cards.
5. Missing signals or next action.
6. Secondary details.

### Landing page pattern

Landing must explain that Labour Market AI supports both local and international work. Do not frame it only as work abroad.

Hero should include:

- strong headline;
- clear profile value message;
- CTA to create profile;
- visual of a living profile/work passport;
- skill/evidence/availability signals;
- market or opportunity layer.

Recommended hero message:

> Not just a CV. A living work passport.

Supporting text:

> Create your Labour Market AI profile, import your CV, add skills, update daily work, and make your real experience easier to understand for local and international opportunities.

### Dashboard pattern

Dashboard must immediately answer:

- Who am I here as?
- What is my profile state?
- What should I do today?
- What information is missing?
- What real opportunity, request, or market signal can I act on?

Do not show a sparse page with a dead card.

---

## 6. Depth & Elevation

Depth should create hierarchy, not decoration.

### Surface levels

| Level | Use | Styling |
|---|---|---|
| Level 0 | App background | `lm-ink` or `lm-paper` |
| Level 1 | Main page section | flat or very subtle contrast |
| Level 2 | Standard card | border + soft shadow |
| Level 3 | Important card | stronger border, glow, or accent line |
| Level 4 | Modal/drawer | overlay, strong shadow, clear focus |

### Shadow rules

Dark surfaces:

- use border and glow more than heavy black shadows;
- blue/cyan glow only for active digital state;
- gold glow only for confirmed trust moments.

Light surfaces:

- use soft neutral shadows;
- avoid heavy drop shadows;
- preserve readability.

### Motion rules

Motion should be subtle and purposeful:

- hover lift on cards;
- focus ring transitions;
- progress updates;
- map panel transitions;
- drawer open/close.

Avoid constant animation, fake activity, or distracting movement.

---

## 7. Do's and Don'ts

### Do

- Make profile creation feel valuable.
- Make daily updates feel useful.
- Show what is real, missing, suggested, or confirmed.
- Connect CV import to profile and skills.
- Connect work journal entries to skill evidence.
- Make market map states honest.
- Show exact vs approximate location clearly.
- Use cards, badges, evidence tiers, and readiness counts.
- Make all main flows work on mobile.
- Keep CTAs concrete.
- Support both local and international work.
- Treat a person as one identity with multiple capabilities.
- Treat a company as a legal/organisational entity, not as a person.

### Don't

- Do not create fake workers, fake companies, fake demand, fake reviews, fake maps, or fake coordinates.
- Do not use global scores without clear basis.
- Do not imply AI has verified something without evidence.
- Do not say AI guarantees work.
- Do not hide CV upload/import.
- Do not leave dead cards or vague CTAs.
- Do not design only for desktop.
- Do not frame the platform only as work abroad.
- Do not copy external product names, layouts, or brand systems.
- Do not make confirmed and unconfirmed information look the same.

---

## 8. Responsive Behavior

### Breakpoints

| Range | Behavior |
|---|---|
| `< 480px` | Single-column mobile, large touch targets, sticky primary action allowed |
| `480-767px` | Mobile-large, stacked cards, compact metadata |
| `768-1023px` | Tablet, two-column cards where useful |
| `1024-1279px` | Desktop, standard dashboard grid |
| `1280px+` | Wide dashboard, map + side panels allowed |

### Mobile rules

- Minimum tap target: 44px.
- Avoid dense tables; use stacked cards.
- Put the primary action above the fold.
- Do not hide profile completion behind menus.
- CV upload/import must be easy to find.
- Work journal daily update must be quick.
- Market map must show a useful fallback if map config or real data is missing.

### Map responsiveness

On mobile:

- map above, cards below; or map as focused mode with bottom sheet;
- bottom sheet shows selected signal details;
- navigation button appears only when privacy rules permit;
- empty/config states must be visible and honest.

---

## 9. Agent Prompt Guide

### Before changing UI

Read this file first. Then inspect the existing route/component. Do not introduce external product names or copied visual systems.

### Design direction prompt

Use this product direction:

> Build a premium, mobile-first Labour Market AI interface where the profile is a living work passport. Use card-driven scouting energy, clear skill evidence tiers, honest readiness states, practical CTAs, and real-data-only market/map logic. The UI must make daily work updates, CV import, skills, availability, and confirmations feel valuable.

### Quick colour reference

- Background: `#07111F`, `#030712`
- Card dark: `#0F172A`, `#172033`
- Light surface: `#F8FAFC`, `#FFFFFF`
- Primary action: `#2563EB`
- Active signal: `#22D3EE`
- Confirmed: `#10B981`
- Attention: `#F59E0B`
- Trust accent: `#D6A84F`
- Error: `#EF4444`
- AI suggestion only: `#8B5CF6`

### Component prompt

When generating a screen, include:

- one clear page title;
- one primary action;
- current profile/state summary;
- meaningful cards with real or honest-empty data;
- evidence/confirmation distinction;
- mobile layout;
- no fake data;
- no vague CTA.

### Landing prompt

Create a landing page that presents Labour Market AI as a living labour profile and market intelligence platform for local and international work. The hero should show a work passport/profile card, skill evidence, availability, daily work progress, and market/opportunity signals. Avoid job-board clichés and fake AI claims.

### Dashboard prompt

Create a dashboard that answers: profile state, today’s best action, missing signals, latest activity, and relevant market/opportunity context. Use a premium scouting/control-room feel with clear cards and concrete CTAs.

### Profile prompt

Create a profile page that feels like a valuable work passport. Show identity, profession, skills, CV/documents, availability, work journal evidence, confirmations, and next best action. Distinguish self-declared, supported, and confirmed information.

### Market map prompt

Create a private market map surface that uses real data only. Show honest empty/config states, approximate vs exact location rules, visible signals, and navigation only where privacy permits. Never render fake markers or fake demand.

---

## Final Quality Gate

Before accepting a UI change, check:

1. Does it look like a premium labour intelligence product?
2. Does it make the living profile more valuable?
3. Does it help the user act today?
4. Does it distinguish missing, suggested, supported, and confirmed data?
5. Does it avoid fake AI claims?
6. Does it avoid fake map/data/activity?
7. Does it work on mobile?
8. Does it avoid dead CTAs?
9. Does it support local and international work?
10. Does it feel original to Labour Market AI?
