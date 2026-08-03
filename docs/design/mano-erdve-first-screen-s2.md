# AI-native visual system S2 — „Mano erdvė" first screen

**Slice:** `feature/ai-native-visual-s2-mano-erdve-first-screen`
**Base:** `origin/main` @ `7fd88e4058b6333733cbf0a1cf5a79e74041e96a`
**Follows:** S1 canonical visual contract (`docs/design/visual-contract-v1.md`), S3 Player Card honesty (#997)

---

## 1. What this slice is

The first screen a signed-in person sees is `/[locale]/dashboard` — one conversation
window. It opened with a greeting and three starter chips and said nothing about
**where the person is**, **what the product already knows about them**, or **what is
worth doing next**.

S2 adds exactly one block above that greeting: **„Mano erdvė"**.

It is **not** a dashboard, **not** a route, **not** a second profile hub, **not** an
onboarding wizard. It is the opening paragraph of the existing chat-first workspace,
and the first real turn of the conversation replaces it.

## 2. Read-only caller map (audited before any edit)

| Component / route | Current responsibility | Reused | Extended | Left unchanged | Reason |
|---|---|:--:|:--:|:--:|---|
| `app/[locale]/dashboard/page.tsx` | Conversation-first home; server-loads booking offers + chat labels, renders `<ConversationChat>` | ✓ | ✓ | | The ONE mount point. Extended with a single server read that resolves the intro model; still renders the conversation as its only surface. |
| `components/app/conversation/chat/conversation-chat.tsx` | The workspace: thread + composer + context panel + the ONE chip dispatcher | ✓ | ✓ | | Accepts `personalIntro` and renders the block inside the thread's opening composition. Its `handleChip` stays the single action dispatcher. |
| `components/app/conversation/chat/conversation-thread.tsx` | The scrolling log; already owns the `isOpening` predicate and centres the opening composition | ✓ | ✓ | | Renders `intro` **only while `isOpening`** — the existing honest local state, so no dismissed-flag persistence is invented. |
| `components/app/conversation/chat/conversation-header.tsx` | The one top bar (identity, workspace chip, search, locale, notifications, avatar) | | | ✓ | Already carries the active workspace. Duplicating it in the intro would be a second switcher. |
| `components/app/conversation/chat/workspace-chip.tsx` | The always-visible active work context + real switching | | | ✓ | The intro **reads** the workspace kind server-side; it never renders a second chip and never switches. |
| `components/app/profile-state-strip.tsx` | Readiness / freshness / today's activity tiles on `/dashboard/profile` | ✓ | ✓ | | **Variant A rejected** (see §3). Migrated onto the S1 `Card` primitive so the strip and the intro share one surface grammar. Behaviour, copy and `data-testid` unchanged. |
| `components/app/worker-readiness-panel.tsx` | Readiness detail on `/dashboard/journal` | | | ✓ | Out of scope; a second copy of it on the home screen is exactly the duplicate this slice forbids. |
| `components/app/worker-readiness-summary.tsx` | Readiness summary on `/dashboard/company` | | | ✓ | Employer-side surface — untouched by a personal-space slice. |
| `components/app/profile-hub-overview.tsx` | The profile hub pillars on `/dashboard/profile` | | | ✓ | The canonical profile hub. The intro links to it; it never becomes a second one. |
| `components/app/worker-setup-journey.tsx` | The `#setup-journey` step list on `/dashboard/profile` | | | ✓ | The intro's `profession` CTA routes to that screen instead of re-implementing the steps. |
| `components/app/worker-player-card.tsx` (S3) | THE canonical Player Card | | | ✓ | Not copied, not mini-cloned, not re-skinned. Reachable exactly as before (`?result=player-card`, `/dashboard/profile`). |
| `lib/player-card/readiness.ts` | `deriveWorkerReadiness` — the ONE readiness model | ✓ | | ✓ | Consumed as-is. The intro derives **nothing**: no count, no fraction, no threshold. |
| `lib/conversation/worker-activity.ts` | `hasWorkerProfile` — the honest "is this account a worker at all" check | ✓ | | ✓ | The same check `loadProfileSummaryForChat` uses to refuse "0 of N" for a company account. |
| `lib/conversation/worker-activity-chips.ts` | `CHIP_FOR_STEP` — which action closes which pillar | ✓ | | ✓ | **Always wins.** The intro's map falls back only for the pillars this map deliberately leaves out. |
| `lib/company/active-organization.ts` | `getWorkspaceContext` — the server-side active workspace | ✓ | | ✓ | The personal-vs-organization decision reads this resolver, not a new one. |
| `lib/config/roles.ts` | `baseIdentityForRole` — worker → `person`, company/agency/customer → `company` | ✓ | | ✓ | The role gate. No new role logic. |
| `lib/auth/session-profile.ts` | The request-cached `profiles` row | ✓ | | ✓ | Supplies the real name; never invents one. |
| `app/[locale]/dashboard/layout.tsx` | Thin chrome; renders no wide navbar on `/dashboard` | | | ✓ | Untouched — the chat still fills the viewport. |

## 3. Variant A vs Variant B

The brief prefers extending `ProfileStateStrip` (Variant A). **Rejected, on evidence:**

1. It is mounted on `/dashboard/profile` only — it is not a chat-first mount point.
2. Its readiness tile targets `#setup-journey`, an anchor that exists **only** on the
   profile page. Mounting it on `/dashboard` would have shipped a dead in-page link.
3. Its three tiles answer *readiness / freshness / today* — a different question from
   "where am I, what is known, what next".

So **Variant B**: a thin `PersonalWorkspaceIntro` that owns no data, holds no readiness
logic, has no route and no fetch of its own. The strip still gained from the slice — it
now uses the S1 `Card` primitive, so both blocks share one surface grammar.

## 4. Architecture

```
app/[locale]/dashboard/page.tsx            (server)
  └─ loadPersonalWorkspaceIntro()          lib/workspace/personal-workspace-intro-server.ts
       ├─ getSessionProfile()              → who (request-cached)
       ├─ getWorkspaceContext(identity)    → personal | organization
       ├─ getWorkerActivity(userId)        → hasWorkerProfile
       ├─ getWorkerPlayerCard()            → the canonical card
       └─ deriveWorkerReadiness(card)      → THE readiness model
            └─ derivePersonalWorkspaceIntro(...)   PURE, lib/workspace/personal-workspace-intro.ts
  └─ <ConversationChat personalIntro={…}>  (client)
       └─ <ConversationThread intro={…}>   renders only while isOpening
            └─ <PersonalWorkspaceIntro onAction={handlePanelChip}>
```

- **Readiness source:** `deriveWorkerReadiness` — unchanged, unduplicated. A guard asserts
  the tree contains exactly one definition of it and that the S2 model contains no
  fraction / percentage / threshold arithmetic.
- **Action source:** the conversation's own `handleChip`. Every CTA is a chip id that
  dispatcher already understands; a guard resolves each one to a real inline-form spec,
  a real `case` in the dispatcher, or a real `page.tsx`.
- **Priority order:** `readiness.pillars` — the same order the Player Card renders and
  the chat's profile summary reports. "Most important missing part" = the first unmet
  pillar. No new scoring model.

### Pillar → action → wording

| Pillar (canonical order) | Action id | Source | LT label |
|---|---|---|---|
| `profession` | `link:/dashboard/profile` | fallback (profession is set on the profile screen) | Pradėti nuo savęs |
| `availability` | `f:worker.save-work-card` | **`CHIP_FOR_STEP`** | Nurodyti, kada galiu dirbti |
| `skills` | `cv` | fallback (skills are recognised from a CV or logged work) | Pridėti įgūdžius |
| `journal` | `logwork` | fallback (a journal entry IS the evidence) | Pridėti patirties įrodymų |
| `evidence` | `logwork` | fallback (same real action) | Pridėti patirties įrodymų |
| `workCard` | `f:worker.save-work-card` | **`CHIP_FOR_STEP`** | Nurodyti, kur galiu dirbti |

One form can close two gaps, so the wording names the gap the person actually has:
unmet `availability` asks *when*, unmet `workCard` asks *where* — the work-card form
holds availability, location, preferred countries and pay.

**Complete profile:** primary becomes *Peržiūrėti mano darbo profilį*
(`link:/dashboard/profile`) and the "papildyti" secondary is dropped entirely — asking
someone to complete a complete profile is the dishonest CTA §8 forbids.

**Secondary rule (deterministic, asserted):** candidates `["profile", "logwork",
"link:/dashboard/profile"]`, minus the primary, first two kept. Never more than two,
never a repeat of the primary.

## 5. Role / workspace behaviour

| State | Result |
|---|---|
| Signed out | nothing (`hidden: signed-out`) — the route already redirects to login |
| Organization workspace active | nothing (`hidden: organization-workspace`) — §9 **Variant A** |
| company / agency / customer identity | nothing (`hidden: not-person-identity`) |
| No worker row on the account | nothing (`hidden: no-worker-profile`) |
| Worker, readiness unreadable | honest one-line degradation, **no CTA, no readiness claim** |
| New worker | nothing claimed as known; one next step (`Pradėti nuo savęs`) |
| Partial worker | met pillars named; the first gap named; one CTA that closes it |
| Complete worker | "everything important is already set"; **no completion CTA** |

The organization check runs **before** the identity check, so a person who is a worker
but is currently acting inside an organization still gets nothing personal here.

## 6. Chat-first boundary

- The block renders **inside** the thread's opening composition, above the greeting.
  The composer stays centred directly under it (the existing `isOpening` layout).
- The first real turn ends `isOpening`, so the block disappears with no new persistence,
  no dismiss flag, no DB column. If a dismissed state had required a new persistence
  model, the brief says not to build one — it did, so we did not.
- No modal, no overlay, no full-screen takeover, no second onboarding wizard.
- The action row and the dimension list both wrap (`flex-wrap`), so 375 px never
  overflows horizontally.

## 7. Honesty

No percentage. No count. No score, rating, ring, OVR, trust score, reputation score or
"AI verified". What is met is **named**; what is missing is **named**; nothing else is
claimed. Every value comes from the canonical readiness model or is absent.

The degraded state says one plain sentence and shows no CTA — never a table name, never
a status code, never a raw read failure.

## 8. Not touched

Migrations, rollbacks, `APPLIED_LEDGER.md`, W6/W9/W10/W11/W12 schema, matching, billing,
Stripe, credits, auth, middleware, env, landing, `/for-workers`, the Player Card's
internals, `mini-draft-card.tsx`, company pages, employer scouting, organization
settings, production data.

---

## 9. Duplicate-PR consolidation (2026-08-03)

Two Draft PRs implemented this same S2 goal off the same base (`7fd88e40`), both
green, neither merged:

| | PR #998 `…-personal-workspace-core` | PR #999 (this PR) |
|---|---|---|
| Component family | `components/app/my-space/` | `components/app/workspace/` |
| Shape | one async **server** component that reads + decides + renders | pure model → server loader → label bag → dumb client view |
| Actions | `<Link>` navigations **out of** the conversation | chip ids dispatched **into** the conversation's own `handleChip` |
| Mount position | below the composer | inside the opening composition, above the greeting |
| Role gate | `activeOrganizationId === null && activeRole === "worker"` | `signedIn` + workspace kind + `baseIdentityForRole` + `hasWorkerProfile`, 4 named hidden reasons |
| i18n | 5 catalogs (`lt/en/ru/nl/de`) added to the **existing** `auth.dashboard.mySpace` namespace | 11 catalogs, new top-level `personalWorkspace` namespace |
| Tests | 1 structural guard | structural + pure-model + DOM render matrix |
| `card-border` ratchet | 327 → 326 (absorbs S3's slack) | 327 → **325** (S3's slack **plus** a real `ProfileStateStrip` → `<Card>` migration) |

**Verdict: KEEP PR #999.** The four decisive facts:

1. **i18n contract.** `lib/i18n/config.ts` states the binding rule: *"new i18n keys
   land in all 11 in the same PR"*. `i18n-lt-en-parity.test.ts` only enforces the 5
   ACTIVE locales, so #998's 5-catalog change is green while leaving 6 catalogs
   without the namespace — green against the guard, short of the doctrine.
2. **Namespace hygiene.** `auth.dashboard.mySpace` is an **orphan** on `main`: no
   component renders it, it survives only because `my-space-human-entry.test.ts`
   asserts its keys. It is the copy of the MyZone surface W3 Package 4 deleted.
   #998 grows a new product surface inside that dead namespace; #999 opens a clean
   `personalWorkspace` one.
3. **Chat-first.** #998's CTAs navigate the person **away** from the conversation;
   #999's dispatch through the conversation's single existing chip handler. One
   action system, and the composer stays the front door.
4. **Role safety.** #998 does not check `hasWorkerProfile`, so a `worker`-role
   account with no worker row renders the "couldn't open your work profile" shell
   instead of nothing. #999 hides it, with the reason named and unit-tested.

### Ported FROM #998

- **The `DASHBOARD_LIKE` route-name ban** — `personal-workspace-intro.test.ts` now
  also asserts `/dashboard/{home,hub,overview,control,main,visual-os,my-space,
  mano-erdve}` does not exist. #999 only scanned for `page.tsx` paths naming the
  feature; #998's list pins the names a later slice would actually reach for.
- **The self-declared honesty line** (`personalWorkspace.unverifiedNote`, all 11
  catalogs). The block names what is "already set"; without this line that reads as
  "checked by us". #998 carried it, #999 did not. It renders in the `intro` state
  only — the degraded state claims nothing, so it has nothing to disclaim.
  Its `data-testid` is `personal-workspace-intro-self-declared`, **not**
  `…-unverified-note`: the render guard bans `/verified/i` anywhere in the markup
  and the substring tripped it. The guard was kept and the name changed.

### NOT ported from #998

- The `<Link>` action model (breaks the chat-first boundary, §6).
- The six-pillar met/unmet checklist (a met-count is one rename away from a score;
  §7 names what is met instead of tallying it).
- Reuse of the `auth.dashboard.mySpace` namespace (reason 2 above).
- The `ResultShell` wrapper — this block is a first screen, not a query result.

`components/app/my-space/` is never created on this branch, so no parallel
component family exists after #998 is closed as superseded.

## 10. Browser proof (2026-08-03) — EXECUTED, authenticated, full matrix

Two rounds. Round 1 (static harness, same day) ran the real component + the real
built CSS without a database while Docker was down; it found the 36px primary-CTA
defect (§10.1). Round 2 — after the Docker Desktop 4.75.0 startup crash was
root-caused (orphaned `dockerInference` socket in `AppData/Local/Docker/run`, the
engine died initializing its Inference manager; a restart + direct WSL distro boot
recovered it) — ran the FULL authenticated proof:

- **local stack**: the repo's canonical `supabase start` (project `labourmarketai`,
  `127.0.0.1:54321`) — no other session's stack existed (verified via `docker ps`
  before starting), no config was patched, the guard was not weakened;
- **fixtures**: `pnpm db:fixtures:local` — the three synthetic `@local.test`
  accounts only; every extra state (organization membership, customer role,
  removed worker row, completed pillars) was created as a temporary local row and
  **reverted in a `finally`**, with post-run row-count checks proving zero residue;
- **driver**: Playwright Chromium against `pnpm dev` on a dedicated port (3300,
  `.claude/launch.json` entry `s2-proof`), logging in through the real login form.

| # | State / property | Result | Evidence |
|---|---|---|---|
| 1 | worker + personal → intro VISIBLE | ✅ | `01-worker-partial-desktop-1440.png` |
| 2 | partial worker → names known + ONE next action | ✅ | same shot; "Svarbiausia dabar: Prieinamumas nurodytas" |
| 3 | complete worker → complete message, NO completion CTA, no gap line | ✅ | `02-worker-complete-desktop-1440.png` (pillars completed via temp local rows, restored) |
| 4 | readiness error → plain text, no CTA | ⚠ render-level only | `personal-workspace-intro-render.test.ts`; a live read failure cannot be triggered without breaking the local stack mid-request |
| 5 | company-only → hidden | ✅ | `04-company-only.png` |
| 6 | agency-only → hidden | ✅ | `05-agency-only.png` |
| 7 | customer → hidden | ✅ | temp `active_role='customer'` flip, restored |
| 8 | worker + ORGANIZATION workspace → hidden | ✅ | `06-organization-context.png`; temp `viewer` engagement + org pointer, both removed |
| 9 | worker role, NO workers row → hidden, no error text | ✅ | workers row parked on a synthetic profile, restored |
| 10 | signed out → hidden (redirect to login) | ✅ | — |
| 11 | composer visible in-viewport, opening state, 1440 | ✅ | y=741, h=52 in a 900px viewport |
| 12 | composer still reachable after the first turn | ✅ | `09-after-first-turn.png` |
| 13 | desktop 1440 — no horizontal overflow | ✅ | measured |
| 14 | mobile 375 — no horizontal overflow | ✅ | `03-worker-mobile-375-fixed.png` |
| 15 | short viewport — opening top reachable | ✅ **after a fix — §10.2** | introTop 106 ≥ scrollerTop 65 at scrollTop 0; full 956px scrollable |
| 16 | keyboard focus → visible 2px ring | ✅ | `07-keyboard-focus.png` |
| 17 | primary CTA ≥ 44px | ✅ | 44px measured live |
| 18 | no raw DB text / technical state | ✅ | page text scanned in every state |
| 19 | no console errors | ✅ | only Chrome's CSP report-only notice (not an app error) |
| 20 | **first REAL chat turn removes the intro** | ✅ | `08-before` → `09-after`; `data-opening` true → unset |
| 21 | intro stays gone for further turns of the same conversation | ✅ | second turn sent, still absent |
| 22 | no new dismiss persistence | ✅ | reload = new conversation (thread is not persisted), intro correctly returns there; within a conversation nothing is stored |

Screenshots (all synthetic data, "Dev Worker" fixture): `docs/audits/evidence/visual-s2-mano-erdve/`.

### 10.1 Defect №1 — found by the static round

`size="sm"` on the primary CTA rendered a **36px** box beside **44px** pills — the
most important action was the hardest to hit. Fixed to the default `md` (44px);
pinned by `the PRIMARY action is never a smaller target than the pills beside it`.

### 10.2 Defect №2 — found ONLY by the authenticated round

At 375×640 the opening composition (956px of content in a 520px scroller) had its
top 112px **unreachable by any scroll**. The `my-auto` fix was present and correct —
but the scroller itself still carried `justify-center` while opening, and
`justify-content: center` on a scroll container positions overflow ABOVE the
scrollable region. The static harness could not see this because it renders the
block alone, not inside the real thread scroller.

Fix: `justify-center` removed from the thread scroller (`my-auto` on the inner
block is the sole centring mechanism — it centres when content fits, measured
242px/242px gaps at 1440×1200, and collapses to 0 when it does not). The
`ux-2-0-composition.test.ts` guard, which pinned the literal `justify-center`, now
pins the SAFE idiom instead and forbids the class from returning to the scroller.
Re-measured after the fix: top reachable (106 ≥ 65), full content scrollable,
centring preserved.

## 11. i18n status of the `personalWorkspace` namespace

The namespace lands in **all 11 catalogs in this PR**, per the binding rule in
`lib/i18n/config.ts` ("new i18n keys land in all 11 in the same PR"). No `[EN]` marker
and no empty value is introduced, so the i18n debt ratchet is unchanged
(`check:i18n-debt` → `da=1301, de=0, nl=0, ru=0`, all within baseline).

The enforced guard (`i18n-lt-en-parity.test.ts`) covers only the 5 ACTIVE locales;
`personal-workspace-intro.test.ts` additionally asserts identical keys across **all 11**,
so this namespace cannot drift even in the catalogs routing does not emit.

| Locale | Routing | Catalog status for this namespace | Review status |
|---|---|---|---|
| `lt` | ACTIVE (default) | full | **Tier 1 — human-verified.** Product terms pinned by guard (`Mano erdvė`, `Mano darbo profilis`, `Darbo pasiruošimas`) |
| `en` | ACTIVE | full | **Tier 1 — human-verified** (source language) |
| `ru` | ACTIVE | full | Tier 2 — **needs native review** (§7.4) |
| `nl` | ACTIVE | full | Tier 2 — **needs native review** (§7.4) |
| `de` | ACTIVE | full | Tier 2 — **needs native review** (§7.4) |
| `pl` `sv` `da` `no` `et` `lv` | NOT active — no routes prerender, the URL resolver rejects the code, the selector hides it | full for THIS namespace (the catalogs remain partial overall: ~4 046 lines vs ~11 755) | **needs native review** before that locale is ever promoted to active |

Nothing here promotes a locale: `activeLocales` is untouched. The six non-active
catalogs still get the namespace so that promoting one later is a one-row change in
`config.ts` rather than a copy-hunt — which is exactly what §2.5 asks for.

**Owner action:** RU / NL / DE wording is AI-seeded and should get a native pass before
this block is considered launch-final in those markets. LT and EN are ready as shipped.

## 12. RU / NL / DE copy review (2026-08-03) — `COPY_REVIEW_PENDING`

Scope: the new `personalWorkspace` namespace only. No other namespace was touched.

### What was verified mechanically (evidence, not opinion)

| Check | RU | NL | DE |
|---|---|---|---|
| `[EN]` markers / empty values | none | none | none |
| Key parity with LT across all 11 catalogs | ✅ | ✅ | ✅ |
| No score / % / rating / verification claim | ✅ | ✅ | ✅ |
| No technical state leaked (`needs_migration`, SQLSTATE, table names) | ✅ | ✅ | ✅ |
| **Register matches the surface it renders on** | formal `вы` — `conversation.*` is 25 formal : 1 informal ✅ | informal `je` — `conversation.*` is 79 : 5 ✅ | informal `du` — `conversation.*` is 74 : 7 ✅ |

The register check matters: DE looks informal against the **whole** catalog (Sie 1318 : du 234),
which would read as a mismatch. It is not — the formal mass sits in `auth` (Sie 132 : du 7)
and the employer/admin namespaces, while the conversation-first worker surfaces
(`conversation` 74:7, `workspace` 59:0, `todayScreen` 9:0) are deliberately `du`.
S2 renders inside `conversation`, so `du` is the correct register there.

### Canonical terminology — already satisfied via the shared namespace

The nouns this review asks about are rendered by the block, but they come from the
**existing** `playerCard.readinessSteps.pillar` namespace, not from new S2 strings — so
S2 introduces no competing vocabulary:

| Concept | RU | NL | DE |
|---|---|---|---|
| availability | Доступность указана | **Beschikbaarheid** ingesteld | **Verfügbarkeit** festgelegt |
| skills | Навыки добавлены | Vaardigheden toegevoegd | Fähigkeiten hinzugefügt |
| evidence | Навыки подкреплены работой | Vaardigheden **onderbouwd** door werk | Durch Arbeit **belegte** Fähigkeiten |
| work profile | Мой рабочий профиль | Mijn **werkprofiel** ✓ matches `marketRecognition` | Mein **Arbeitsprofil** ✓ matches `marketRecognition` |

S2's own `dimension.*` strings are deliberately **first-person plain language**
("Wann ich arbeiten kann", not "Verfügbarkeit"), mirroring the LT source
("Kada galiu dirbti"). That is the product voice, not a missing term.

### Findings for owner decision — NOT changed, per the "don't guess" rule

| # | Sev | Locale | String | Issue | Suggested |
|---|---|---|---|---|---|
| 1 | **HIGH** | DE | `readiness.label` = "Arbeitsbereitschaft" | In German labour law **Arbeitsbereitschaft is a defined category of paid standby/on-call working time**, not "how complete is your profile". A German construction worker may read this as a shift type. | "Startklar für Arbeit" / "Bereit für Arbeit" |
| 2 | MED | NL | `readiness.label` = "Werkgereedheid" | Bureaucratic HR compound; not how a NL bouwvakker speaks. | "Klaar om te werken" / "Werkklaar" |
| 3 | MED | NL | `dimension.whatPayIExpect` = "Welke beloning ik verwacht" | "beloning" is HR-register (reward/compensation); the catalog's own field term is "Salaris". | "Wat ik wil verdienen" |
| 4 | LOW | RU | `title` = "Моё пространство" | A calque of "My space". The established RU product term for a personal area is "Личный кабинет" — but that implies exactly the account-page/dashboard this block is deliberately **not**. Likely correct as-is; owner call. | keep, or "Моё рабочее пространство" |
| 5 | LOW | DE | `title` = "Mein Bereich" | Neutral and safe. "Mein Arbeitsbereich" would collide with "workspace". | keep |

Items 1–3 are wording judgements about markets I cannot verify natively, so **nothing was
rewritten on a guess**. They are a concrete package for a native pass.

### Status

- **LT** — Tier 1, human-verified, product terms pinned by guard. **Release-ready.**
- **EN** — Tier 1, source language. **Release-ready.**
- **RU / NL / DE** — mechanically clean, register-correct, terminology-consistent, but
  **`COPY_REVIEW_PENDING`** on findings 1–3 above. This PR does **not** claim these
  markets are native-reviewed.
- `pl sv da no et lv` — non-active locales, namespace pre-filled, native review owed
  before any promotion to `activeLocales`.
