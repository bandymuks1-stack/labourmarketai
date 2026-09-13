# LABOURMARKET.AI — TARGET WORKER MOBILE INFORMATION ARCHITECTURE (2026-09-13)

Status: **TARGET — owner direction 2026-09-13 ("CRITICAL PRODUCT-DIRECTION
CORRECTION")**, applied inside the #1724 continuation. Additive to
`00-FROZEN-DESIGN-CONTRACT.md` (§1.5: no destructive change to existing
surfaces; §2.1 conversation on demand; §2.3 ŠIANDIEN · PASAULIS · PAKLAUSK as
the mobile V1 hypothesis) and to `00-GALUTINE-DIZAINO-SISTEMA.md` (§A no
card soup, provenance as material; §E mobile; §M evidence classes; §P time
language; §T 1M rules). Where this document and the frozen contract differ,
the frozen contract wins; this document only decides *what a worker sees
where* on a phone.

Owner acceptance rule that this document exists to satisfy:

> LEGACY UI PRESERVED BY INERTIA = FAIL. A technically correct backend shown
> through the same rejected collection of old popup cards = FAIL.

"Reuse canonical existing structures" applies to **data, logic, security and
readers** — never to the human-facing composition.

---

## 1. The one loop the phone must carry

REAL WORK → JOURNAL → TIME / OUTPUT / CONTEXT → EVIDENCE → SKILL ATTRIBUTION
→ SKILL PRACTICE STATISTICS → LIVING CV → GROWTH → MATCHING → NEW WORK.

Every destination below is one station of that loop, reached in at most two
taps from the tab bar, and every figure on every station comes from the same
readers (`loadWorkIntelligence`, `buildVerifiedCv`, `presentSkills`,
`deriveFitBand`, `deriveGrowthReading`). One product, one truth.

## 2. Tab bar (3 tabs, frozen contract §2.3)

| Tab | Destination | What it is |
|---|---|---|
| **ŠIANDIEN** | `/dashboard` (worker) | The person's *now*: one primary next action, today's recorded work, what still needs a figure or a photo, one growth sentence, one opportunity sentence. A page, not a stack of cards. |
| **PASAULIS** | `/dashboard/opportunities` (+ market map) | Discovery **and** matching, kept apart by fit band: STRONG · POSSIBLE · DISCOVERED-NOT-ASSESSED · MISSING REQUIREMENT · CONFLICT, each with its WHY. Never titled "Man tinkantys darbai" while it holds unassessed rows. |
| **PAKLAUSK** | conversation (on demand) | The assistant as a first-class *control* surface: log work, ask for the uploaded photo, ask "kokie įgūdžiai užima didžiausią mano veiklos dalį", open any station. Results are short readbacks that *link to* the stable station; they are not the station. |

Secondary (reachable from ŠIANDIEN and from PAKLAUSK, one tap):

| Station | Route | Content |
|---|---|---|
| **Mano darbas** (journal) | `/dashboard/journal` | Recording (extremely simple: what · where · how long · photo → readback → confirm), the entry list, corrections. |
| **Mano veikla skaičiais** (Work in Numbers) | `/dashboard/journal#work-in-numbers` → own page in the next slice | Answers "kokie įgūdžiai užima didžiausią mano veiklos dalį?" first: share bars per skill (measured hours, %, entries, first/last, contexts, outputs, confirmation share, trend), period selector, plausibility checks, organization records shown *beside* — never summed. |
| **Profesinis profilis / Living CV** | `/dashboard/profile`, `/cv` | Strength and magnitude visible: tier order (confirmed → work-supported → declared → self-stated), chip size by magnitude, hours · share · entries per skill, professional facts under the person's own words, work history with description / project / recorded hours. |
| **Augimas** | inside Work in Numbers → own section | CORE STRENGTH · GROWING · UNDERUSED · SELF-STATED-NOT-EVIDENCED · ADJACENT OPPORTUNITY · FORMAL QUALIFICATION GAP, each with its WHY in figures. No score, no rank. |

## 3. Overlay rules

- **Persistent information has a stable destination.** Anything a person will
  come back to (today's work, figures, CV, opportunities, growth) is a page
  in §2. It is never *only* reachable through a floating card or a sheet.
- **Overlays are temporary.** A bottom sheet or panel may show *one entity in
  detail* (an entry, a vacancy, a photo) or *one confirmation* (a readback
  before saving) and closes back to the page it came from. It never becomes
  the place where information lives.
- **Conversation results are readbacks.** A chat result is a compact answer
  plus a link to its station. It is not a second rendering of the station.

## 4. Legacy surfaces — classification

`existing implementation` is not a reason to keep a surface. KEEP means the
composition survives the correction on its merits.

| Surface | File(s) | Verdict | Why / what replaces it |
|---|---|---|---|
| Worker dashboard shell (`/dashboard`) — chat-first column with results stacked as cards | `app/[locale]/dashboard/page.tsx`, `components/app/workspace/*` | **REDESIGN** | Becomes ŠIANDIEN: one primary action, today's work, open items, one growth line, one opportunity line. Chat stays reachable (PAKLAUSK), not dominant (§2.1). |
| Opening intro card ("personal workspace intro") | `components/app/workspace/personal-workspace-intro.tsx` | **REPLACE** | Replaced by the ŠIANDIEN header (name · profession · today's state). No welcome card. |
| Page quick-nav strip | `components/app/page-quick-nav.tsx` | **REMOVE** (worker) | The 3-tab bar + station links carry navigation; a second nav strip is card soup. |
| Context Panel catch-all sheet ("Tavo darbas dabar", results panel) | `components/app/world-state/context-panel.tsx`, `lib/conversation/result-registry.ts` | **REPLACE** | Persistent content moves to ŠIANDIEN / stations; the panel survives only as a *temporary entity/confirmation* sheet. Chrome title must follow the result's own state (discovery-only ≠ "Man tinkantys darbai"). |
| "Man tinkantys darbai" overlay result | `components/app/workspace/opportunities-result.tsx` (+ registry title) | **REPLACE** | Short inline readback with band counts → `/dashboard/opportunities` as the destination with bands and WHY (lane D landed the bands inside the result; the destination page is the next slice). |
| Player-card result (work card editor inside a chat result) | `components/app/workspace/player-card-result.tsx`, `work-card-editor.tsx` | **MERGE** | The editor (availability · location · pay, with plausibility notes) becomes part of the Profesinis profilis station; the chat keeps a readback + link. |
| Journal page (1,662 lines: composer, list, work-intelligence, gallery, corrections in one scroll) | `app/[locale]/dashboard/journal/page.tsx` | **REDESIGN** | Split into *Mano darbas* (record + list) and *Mano veikla skaičiais* (figures) — same readers, two destinations. |
| Full journal composer (2,761 lines) | `components/app/journal-entry-composer.tsx` | **REMOVE** from the worker's default path | The compact text-first recording with readback + confirm is the recording surface; the full composer stays only as the *edit* surface for an existing entry until parity is proven (§1.5). |
| Work-intelligence block inside the journal page | `components/app/journal-work-intelligence.tsx` | **REDESIGN** | Becomes the Work in Numbers station: dominant-skill answer first, share bars, period selector; growth kinds (lane D) live here. |
| Capability profile section / CV page skill chips | `components/app/capability-profile-section.tsx`, `app/[locale]/cv/page.tsx` | **KEEP (as corrected)** | Lane A: one presentation, folded variants, magnitude, tier order, hours · share · entries, facts line, history depth. Visual pass (chip weight, spacing) in the UX slice. |
| Bottom navigation primitive | `components/app/bottom-nav.tsx` | **KEEP → reuse** | The 3-tab worker bar is built on it; no new nav primitive. |
| Gallery page | `app/[locale]/dashboard/gallery` | **KEEP** | Stable destination for photos; chat photo readback (lane C) links here. |
| Dead copy `auth.dashboard.jobsCard` | `messages/*.json` | **REMOVE** | Unreferenced legacy card copy. |
| Organization surfaces (company hub, planning, timesheets) | `app/[locale]/dashboard/company/*` | **KEEP (out of scope)** | Owner: no unrelated redesign. They reuse the same readers for team roll-ups (`N × loadWorkIntelligence`), never a second ledger. |

## 5. Premium = the following, measurable

1. **Clarity:** one primary action per screen; secondary actions are text
   links, not buttons; no two surfaces show the same figure with different
   framing.
2. **Low cognitive load:** ≤ 3 first-level items per screen above the fold on
   a 390 px viewport; progressive disclosure below.
3. **Typography and spacing:** the token scale in `tokens/*`, black + gold
   system (`visual-system-black-gold` guard); no ad-hoc sizes.
4. **Purposeful motion:** sheet open/close and readback confirmation only;
   nothing decorative.
5. **Contextual AI:** the assistant proposes (Gemini proposer, deterministic
   router first); the person confirms; every figure it shows is a reader's
   figure, never a model's.
6. **Provenance as material (§M):** SELF_DECLARED dashed · EVIDENCE_SUPPORTED
   cyan · EMPLOYER_CONFIRMED gold · SYSTEM_DERIVED dotted, plus the textual
   equivalent on every chip and figure.
7. **Honesty vocabulary:** UNKNOWN ≠ ZERO ≠ FAILED ≠ NOT_MEASURED and
   SELF-STATED ≠ DERIVED ≠ EVIDENCED ≠ VERIFIED are visible states, never
   collapsed into an empty cell.

## 6. Journey — before / after

**Before (production, owner walk of #1689):** open dashboard → intro card →
chat → "Tavo darbas dabar" sheet → journal page (composer + list + numbers +
gallery in one scroll) → skills as a duplicated tag bag → CV with "150–500
EUR/month" printed as fact → "Man tinkantys darbai" overlay holding
unassessed ads → no place that answers "kokie įgūdžiai užima didžiausią mano
veiklos dalį".

**After (target):** ŠIANDIEN (next action · today's work · open items · one
growth line · one opportunity line) → *Mano darbas* (record in one screen,
readback, confirm) → *Mano veikla skaičiais* (dominant skill first, shares,
period, checks, growth kinds with WHY) → Profesinis profilis / CV (one skill
presentation with magnitude and hours, facts under own words, history depth,
plausibility notes on private figures) → PASAULIS (bands with WHY; discovery
never labelled as fit) → PAKLAUSK for any of it by sentence.

## 7. Guards that encode the legacy composition (update deliberately, never silently)

`worker-nav-human-labels`, `dashboard-chain-reachability`,
`my-space-human-entry`, `w3-row21-myzone`, `w3-context-panel`,
`mobile-first-room-polish`, `wagon4-setup-journey`, `e2e-testid-orphans`,
`first-sentences`, `conversation-canonical-delegation`. Each change to one of
these is a line in the receipt saying which legacy expectation was retired and
which new one pins the target composition.

## 8. Desktop

Desktop expands the same architecture: the tab bar becomes a left rail with
the same three roots and the same stations; a station may show two columns
(figure + detail) instead of a sheet. No desktop-only surface.

## 9. Not in scope

Brand and logo (no recreation); organization-side redesign; any migration,
RLS or auth change (none is required by this IA).
