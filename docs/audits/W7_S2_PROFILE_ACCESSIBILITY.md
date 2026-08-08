# W7-S2 — PROFILE ACCESSIBILITY & TOUCH ERGONOMICS

Presentation and interaction only. **No business semantics, stored values,
defaults, write path, permission model, availability doctrine or profile
architecture changed. No migration.**

## 1. Starting state

| | |
|---|---|
| Starting `origin/main` | `5d6113009722d7afb2a12e415f05decaed7b32d3` (fetched and verified) |
| Worktree | `C:/Users/Mano/Documents/lm-w7-s2` — new, isolated, own `node_modules`, own dev server `:3480`, own `.env.local` → local stack `127.0.0.1:54321` |
| Branch | `fix/cc/w7-s2-profile-accessibility-v1` |
| Local DB | 190/190 migrations, dev fixtures. The v2 preference columns ARE applied locally, so all 10 tri-state groups and the licence chips were exercised |
| Evidence | `docs/audits/evidence/w7-s2-profile-accessibility/` — 6 screenshots + 4 measurement JSONs |
| Tools | `scripts/w7-s2-a11y-audit.mjs`, `scripts/w7-s2-keyboard-proof.mjs`, `scripts/w7-s2-page-wide.mjs` (all loopback-only) |

## 3. Scope

`apps/web/components/app/worker-availability-prefs-form.tsx` — plus a one-line
optional `id` prop on `components/ui/Label.tsx` so a composite control can point
`aria-labelledby` at its visible label.

## 4. BEFORE input inventory — and a correction to the audit's headline

The audit's "34 unlabelled inputs on `/dashboard/profile`" was **not** used as
given. Re-measured in the browser it does not describe an accessibility defect:

| measured, whole page | value |
|---|---|
| `input`/`textarea`/`select` elements | 51 |
| — of which `type="hidden"` | **32** |
| — perceivable | 19 |
| unlabelled **including hidden** | **34** ← the audit's number |
| unlabelled **perceivable** | **2** |

`input[type=hidden]` is not focusable, not rendered and not exposed to
assistive technology; it carries form state. Counting 32 of them as
"unlabelled inputs" overstated the debt by 16×. **The honest page-wide figure
is 2**, and neither is in this component — they are the external-profile URL
field and the CV file input (§14).

Scoped to `worker-availability-prefs-form`:

| measured, this component | BEFORE |
|---|---|
| `input`/`textarea`/`select` | 19 (17 hidden, 2 perceivable) |
| **unlabelled perceivable inputs** | **0** |
| **unnamed controls in the ARIA tree** | **0** |
| controls in the ARIA tree | 52 — 10 `radiogroup`, 30 `radio`, 8 `button`, 2 `group`, 1 `spinbutton`, 1 `textbox` |

So the naming was already correct. **The real defects were elsewhere**, and the
brief's stated target ("0 unlabelled inputs") was already met before this slice
began. What was actually broken:

1. **The radiogroup contract was announced but not kept.** Ten
   `role="radiogroup"`s, each with **three tabbable radios** — 30 tab stops
   where the ARIA pattern specifies 10 — and **no arrow-key handling at all**.
   A screen reader tells the user "radio group, use arrow keys"; the arrows did
   nothing, and a keyboard user pressed Tab three times per preference.
2. **Touch targets.**
3. **Selection encoded by colour alone.**

## 5. BEFORE touch-target inventory

| control | size @1440 | size @375 | count |
|---|---|---|---|
| tri-state options | 214×**32** / 208×**32** | 100×**32** / 88×**32** | 30 |
| licence chips | — | 34–42 × **30** | 5 |
| save button | — | 192×**36** | 1 |
| **sub-44px total** | **36 of 40** | **36 of 40** | |

## 6. Changes

| file | change |
|---|---|
| `worker-availability-prefs-form.tsx` | roving tabindex + arrow/Home/End on all 10 tri-state groups; `aria-labelledby` → the visible label; `min-h-11` on options, `min-h-11 min-w-11` on chips, `min-h-11` on save; a non-colour selected mark; licence chips named with their category |
| `components/ui/Label.tsx` | optional `id` prop (additive; every existing call site unaffected) |
| `lib/guards/w7-s2-prefs-form-accessibility.test.ts` | **new** — 16 assertions |
| `scripts/w7-s2-{a11y-audit,keyboard-proof,page-wide}.mjs` | **new** — measurement tooling |

Two judgement calls worth stating:

- **The 44px floor is applied at the call site, not to the shared `Button`
  `sm` size.** Resizing that would change every small button in the app — a
  visual-system decision this slice has no mandate for. Guard-pinned.
- **The selected mark is absolutely positioned.** Inline, the check stole
  ~14px from a segment only 88px wide inside the v2 fieldset at 375 and
  truncated the longest option to "**Nenuro…**". Caught in the browser, fixed,
  and pinned by a guard so it cannot come back.

## 7. Semantic grouping model

| control | role | why |
|---|---|---|
| tri-state preference | `radiogroup` of 3 `radio`s, one tab stop, arrows select | one choice from three; "not stated" is a real answer, never a collapsed "no" |
| licence categories | named `group` of `aria-pressed` toggle buttons | **independent** toggles, not one-of-N. Toggle buttons answer Space and Enter natively and each is legitimately its own tab stop |
| max trip days / note | native `input`/`textarea` inside a wrapping `<label>` | unchanged — already correct |
| contract type / pay basis | existing `DarkListbox` | unchanged |

Native semantics were kept wherever they already existed; nothing accessible
was replaced with a custom abstraction for styling.

## 8. Accessible-name proof

Two independent methods, as required.

**A — DOM assertions** (`w7-s2-a11y-audit.mjs`): 0 unlabelled perceivable
inputs, before and after.

**B — automated scan**: Playwright's `ariaSnapshot()`, which uses its own
accessible-name engine (the same one behind `getByRole(role, { name })`).
`page.accessibility` was removed in Playwright 1.60 and **axe is not a project
dependency — none was added**, per §6 of the brief.

| | BEFORE | AFTER |
|---|---|---|
| controls in the ARIA tree | 52 | **52** |
| **unnamed controls** | **0** | **0** |

Every licence chip now carries its category in its name — `button
"Vairuotojo pažymėjimo kategorijos: B" [pressed]`. Verbose inside the group,
but correct where it matters: in a screen reader's button rotor the group name
is **not** announced, and five buttons called "B, BE, C, CE, D" would be
meaningless there.

## 9. Keyboard proof — 19/19 at 1440 AND 375

- every radiogroup exposes **exactly one** tab stop — `[1,1,1,1,1,1,1,1,1,1]`
  (was `[3,3,3,3,3,3,3,3,3,3]`);
- `ArrowRight` / `ArrowLeft` / `Home` / `End` all move the selection, and focus
  follows it (otherwise the roving tabindex strands the user on a control that
  is no longer tabbable);
- focus ring visible under real `:focus-visible` — proven with key presses, not
  programmatic focus;
- `Space` toggles a licence chip, `Enter` toggles it back;
- Tab order follows DOM order, no traps and no jumps backwards.

## 10. Mobile proof

| | BEFORE | AFTER |
|---|---|---|
| sub-44px controls in the component | **36 of 40** | **0 of 40** |
| horizontal overflow | none | none |
| clipped controls | — | **0** |

At 375 the licence chips are now 44×44 and fit on one row; every tri-state
option renders its full label.

## 11. Persistence and business-invariant proof

Proven by interaction, not by reading the code:

- the hidden input carries the business value (`yes`) after a keyboard-driven
  selection;
- save reports success through the existing server action;
- **the choice survives a full page reload**;
- the form is then reset to its fixture state so the run is repeatable.

Pinned by the guard: the three tri-state values and their order, the five
licence categories, all nine submitted field names, the single
`saveWorkerAvailabilityPrefsAction` writer, no client-side DB access, and the
honest not-stated / needs-migration / v2-gating states.

**No migration.** No schema change was needed and none is included.

## 12. BEFORE → AFTER

### Scoped to the component

| metric | BEFORE | AFTER |
|---|---|---|
| interactive controls | 40 | 40 |
| **sub-44px controls** | **36** | **0** |
| unlabelled perceivable inputs | 0 | **0** |
| unnamed ARIA controls | 0 | **0** |
| tabbable radios per group | **3** | **1** |
| arrow-key support | none | Arrow / Home / End |
| selection cue | colour only | colour **+ check mark** |

### Whole `/dashboard/profile`

| metric | BEFORE | AFTER |
|---|---|---|
| sub-44px @1440 | **71** | **35** |
| sub-44px @375 | **70** | **34** |
| — inside this component | 36 | **0** |
| — elsewhere | 35 / 34 | 35 / 34 (untouched) |
| unlabelled perceivable inputs | 2 | 2 (both outside this component) |

## 13. Simplicity scorecard delta

Only the dimensions this slice can honestly move, same rubric, same 0–3 scale.

| dimension | BEFORE | AFTER | why |
|---|---|---|---|
| immediate clarity | 2 | 2 | unchanged |
| navigation | 2 | **3** | the form went from 30 tab stops to 10 with working arrow keys; keyboard navigation of the longest editor on the page is now correct |
| action clarity | 2 | 2 | unchanged — the labels and options were already plain |
| visual hierarchy | 2 | 2 | unchanged |
| AI discoverability | 2 | 2 | unchanged |
| mobile | 1 | **2** | every control in the biggest editor now meets 44px; nothing clipped, nothing truncated |
| error recovery | 2 | 2 | unchanged |
| **average** | **1.86** | **2.14** | **NEEDS_POLISH** (not PASS) |

**PROFILE does not reach PASS**, and this slice does not claim it does. 34
sub-44px targets remain elsewhere on the page and the surface is still ~9
mobile folds.

## 14. Remaining W7 accessibility debt

| id | debt | where |
|---|---|---|
| A-1 | **2 unlabelled perceivable inputs** — `INPUT:url` (external profiles) and `INPUT:file` (CV upload) | `external-profiles-section.tsx`, the CV import panel |
| A-2 | **34–35 sub-44px targets** across ~12 other components: header action links (26px), add/open buttons (36px), `external-profiles-import-link` (16px), `capability-profile-manual-add-button` (38px), experience date inputs (34px), locale + notification buttons (30/36px) | page-wide |
| A-3 | **Copy: person mismatch.** v1 preferences are first-person (`Galiu persikelti dėl darbo`, `Turiu nuosavą transportą`); v2 are third-person (`Gali dirbti naktinėmis pamainomis`, `Turi nuosavą automobilį`). A worker filling their own form reads the v2 labels as being about someone else. Keys: `workerPrefs.v2.{nightShifts,weekendShifts,overtime,ownVehicle,ownTools}`. **Deliberately not changed here** — it is grammatical consistency rather than a comprehension blocker, and a copy change requires parity across every active locale, which §7 warns against expanding into |
| A-4 | The licence chip's accessible name repeats the group label. Correct in a rotor, verbose in context. A dedicated short form (`"B kategorija"`) would need new i18n keys |

## 15. Next slice recommendation

**W7-S4** — move the two misplaced profile sections (`#managed-companies` →
`/dashboard/company`, `MessageButton` → `/dashboard/communication`). Pure
moves, no behaviour change, no migration, and the page is now short enough
(W7-S1) and flat enough (W7-S3) for the moves to be legible.

Take **A-1** with it if convenient — the external-profile URL and CV file
inputs are two `aria-label`s and sit in components W7-S4 is already near.

## Verdict

**`W7_S2_PROFILE_ACCESSIBILITY_KEYBOARD_AND_TOUCH_FIXED_NAMING_ALREADY_CORRECT`**

Sub-44px targets in the component 36 → 0; tabbable radios per group 3 → 1 with
full arrow-key support; selection no longer colour-only; naming was already
correct and is now guard-pinned. Page-wide sub-44px 71 → 35. Business
behaviour identical and persistence proven by a real save-and-reload. PROFILE
simplicity 1.86 → 2.14, still NEEDS_POLISH.
