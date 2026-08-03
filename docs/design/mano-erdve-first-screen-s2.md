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
