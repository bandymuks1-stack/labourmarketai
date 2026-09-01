# MOBILE PARITY AUDIT — 2026-09-01

Mission §10 (MOBILE PARITY). Audit-first pass over `apps/mobile` and
`packages/client-core`, plus the code changes that could be closed safely in
the same slice.

**Scope of this document.** What the mobile client actually does today, what
the web client has that it does not, what is blocked and by whom, and what
was closed here. It is written to be falsifiable: every claim names a file,
and everything I could not verify is marked unverified rather than rounded up.

---

## 0. HOW TO READ THE STATE COLUMN

Three words, and the difference between them is the point of this audit.

| word | means |
|---|---|
| **LIVE** | The code exists AND has been exercised against a real backend by a named prior proof. |
| **BUILT-UNPROVEN** | The code exists, typechecks, and bundles to Hermes bytecode. Nobody has watched it work against a real backend. |
| **ABSENT** | There is no code. |

The distinction is not pedantry. Every automated proof this repository holds
for mobile — `.github/workflows/mobile.yml`, `.github/workflows/ios.yml` —
runs against **placeholder configuration** (`https://example.supabase.co`,
`https://example.invalid`). CI has never signed anyone in, and by design never
will; it is secret-free. So CI green means "it compiles and the failure path
renders", never "the feature works".

The authenticated runtime proofs that DO exist are the ones recorded outside
CI: Android runtime on an emulator against the production backend, and the
iOS runtime journey. I did not re-run either in this slice, and I have not
converted them into proof of anything they did not cover.

---

## 1. PARITY INVENTORY

| capability | state | evidence / file refs |
|---|---|---|
| **Navigation** | **LIVE** | `app/_layout.tsx` (root providers), `app/(shell)/_layout.tsx` (4 tabs: Today / Work journal / Profile / Settings), `app/index.tsx` (four-state entry gate). The shell re-checks auth so a deep link cannot bypass the gate. Rendering proven by the iOS Maestro journey (`apps/mobile/.maestro/auth-failure-journey.yaml`) and prior emulator runs. |
| **Responsive & small-screen layout** | **BUILT-UNPROVEN** | `src/ui/theme.ts` (48pt minimum touch target — above both platforms' 44pt floor), `src/ui/primitives.tsx` (every control carries `minHeight: theme.minTouchTarget`), `SafeAreaProvider` + per-screen `SafeAreaView edges`, `KeyboardAvoidingView` on the credentials form. Every screen is a `ScrollView`, so no content is unreachable at any height. **Unverified:** behaviour at large OS font scales, tablet width, and landscape (`orientation: "portrait"` in `app.json` means landscape is not a case). See defect **D-4**. |
| **Password auth — sign-in / sign-up / sign-out** | **LIVE** | `src/auth-context.tsx`, `src/screens/credentials-form.tsx`, `src/supabase.ts`. Same Supabase auth server as web; no second auth model. Failures are kept apart (`rejected` vs `unreachable` vs `confirmation_required` vs `not_configured`) — the honest-failure path is the one thing CI *does* prove, via the iOS journey's `auth-failure` assertion. |
| **Password auth — session persistence** | **LIVE at launch; DEFECT in-session (closed here)** | `packages/client-core/src/session.ts` (four states, `unavailable` ≠ `signed_out`), `src/secure-session-store.ts` (OS keychain, never AsyncStorage). The launch path renews correctly. Nothing renewed the token **after** launch — defect **D-1**, closed in this slice. |
| **Password reset** | **ABSENT** | No "forgot password" anywhere in `src/screens/credentials-form.tsx`. A person who forgets their password has no route back inside the app. Needs an auth-server email send — deliberately not attempted here. |
| **Profile** | **BUILT-UNPROVEN** | `app/(shell)/profile.tsx` — reads `profile.get` and `living_cv.skills.get` through `/api/mcp`. Skills render their recorded verification state in words; an unverified skill cannot look verified (doctrine §7). Read-only: no edit path. |
| **Work journal — read** | **BUILT-UNPROVEN** | `app/(shell)/journal.tsx` + `src/screens/journal-entries.tsx`, via `journal.list` (limit 20). `app/(shell)/today.tsx` shows the most recent 5. Date comes from the server's `work_date` metric, falling back to `createdAt` — nothing computed on the device. |
| **Work journal — write** | **ABSENT** | `journal.create_draft` and `journal.confirm` exist and are exposed in `apps/web/lib/capabilities/registry.ts`, and `journal.create_draft` even resolves the engagement context itself when omitted. The mobile client calls neither. This is the single largest closable gap. |
| **Opportunities** | **ABSENT** | Web: `apps/web/app/[locale]/dashboard/opportunities`. Server-side there is `interest.express_draft` / `interest.express_confirm`, but **no capability lists opportunities** — the board read is not on the canonical capability surface, so mobile cannot reach it without a new backend capability. |
| **Notifications** | **ABSENT** | Web spine at `apps/web/lib/notifications/` (`spine.ts`, `events.ts`, `notification-preferences.ts`); surfaces at `dashboard/inbox`, `dashboard/activity`. No capability exposes it, and no push vendor is wired on mobile (deliberate — `docs/MOBILE_ARCHITECTURE.md` §6 lists push as not started). |
| **Hours** | **ABSENT** | Web: `apps/web/app/[locale]/dashboard/hours`. The canonical operational model (`work_hour_allocations`) was applied to production 2026-08-31, but **no capability exposes it**, and `docs/MOBILE_ARCHITECTURE.md` §7.1 records an unresolved double-counting reconciliation between allocation rows and journal-derived work time. Mobile hours entry is blocked on that slice, not on mobile code. |
| **Projects** | **ABSENT** | Web: `dashboard/projects`, `dashboard/company/projects`. No capability. |
| **Documents** | **ABSENT** | Web: `dashboard/documents`, `apps/web/app/api/documents/file`. No capability, and no file-picker/upload dependency in `apps/mobile/package.json`. |
| **Context switching** | **SHELL ONLY, and says so** | `src/context-provider.tsx` returns `holdings: { status: "unknown" }`; `app/(shell)/settings.tsx` renders "We cannot list your contexts yet". This is honest, not broken — see §4. |
| **Language** | **LIVE** | `src/i18n/locale-context.tsx`, `src/i18n/messages.ts`. Device language by default; the five active locales offered; AI-seeded ones labelled preview (doctrine §7.4). Catalogue parity is **compiler-enforced** — `MessageKey` derives from English and every other locale is `Record<MessageKey, string>`. |
| **Offline / degraded states** | **PARTIAL → improved here** | See §3. |
| **Deep links** | **PARTIAL → improved here** | See §3. |

---

## 2. WHAT `packages/client-core` ACTUALLY SHARES

Five modules, zero runtime dependencies, no framework imports — pinned by
`apps/web/lib/guards/client-core-vocabulary-mirror.test.ts`, which runs inside
the **required** merge gate.

| module | what it shares |
|---|---|
| `session.ts` | The auth **state machine**: four states, expiry with skew, `bearerTokenFor`. Storage-shaped, never permission-shaped. |
| `transport.ts` | `callDomain` (bearer REST) and `callCapability` (JSON-RPC `tools/call` at `/api/mcp`), plus the failure vocabulary that keeps "we could not ask" apart from "you may not". |
| `config.ts` | Public-config validation, including `looksPrivileged` — an RLS-bypassing key is refused, so a secret cannot ship in a device bundle. |
| `locales.ts` | The locale set, mirrored from `apps/web/lib/i18n/config.ts` and guarded. |
| `actor-context.ts` | Participation modes, mirrored from `LIVE_ROLE_IDS` and guarded. Selection rules for "one person, many contexts". |

**What it does NOT share, and this is the parity story.** No domain logic at
all — not matching, not evidence derivation, not entitlements. That is
deliberate (`packages/client-core/src/index.ts` says so in as many words): the
domain lives server-side and both clients reach it identically.

**So the answer to "does mobile read the same canonical state?" is yes, for
what it reads.** Every product read in the mobile app goes through
`src/domain.ts` → `callCapability` → `/api/mcp` → `runCapability` → the same
handler the web app runs, as the caller, under the caller's own RLS. There is
no second query path: `src/supabase.ts` authenticates and is forbidden from
reading tables. ONE canonical state holds.

**The parity gap is coverage, not divergence.** Twelve capabilities are
registered (`apps/web/lib/capabilities/registry.ts`); mobile consumes three,
all reads:

| capability | kind | mobile |
|---|---|---|
| `profile.get` | read | ✅ used |
| `journal.list` | read | ✅ used |
| `living_cv.skills.get` | read | ✅ used |
| `journal.create_draft` / `journal.confirm` | draft → confirm | ❌ |
| `interest.express_draft` / `interest.express_confirm` | draft → confirm | ❌ |
| `work_card.save_draft` / `work_card.save_confirm` | draft → confirm | ❌ |
| `demand.create_draft` / `demand.create_confirm` | draft → confirm | ❌ |
| `context.switch` | execute | ❌ |

Mobile is **read-only today**. Nine write capabilities are already live behind
the same seam and are reachable with no backend work whatsoever.

---

## 3. WHAT THE MOBILE CI WORKFLOW ACTUALLY VERIFIES

`.github/workflows/mobile.yml`, on every push to `main` and every pull request
(no path filter, deliberately):

1. `pnpm -F @labourmarket/client-core typecheck`
2. `pnpm -F @labourmarket/client-core test` — the auth state machine, config
   refusals, transport contract, locale resolution, context selection
3. `pnpm -F mobile typecheck`
4. Android bundle — a real Metro→Hermes `.hbc`, the exact JavaScript artifact
   a release ships
5. iOS bundle — the JavaScript half only

`.github/workflows/ios.yml` (macOS, path-filtered) additionally compiles and
links the native iOS app, launches it on a simulator, and runs one Maestro
journey asserting that the auth screen renders, a sign-in attempt runs, the
failure surfaces (`testID="auth-failure"`), and the app survives it.

**Neither workflow is a required check.** Both headers say so. A red Mobile
run does not block a merge until the owner adds it to branch protection.

**What no workflow verifies:** any authenticated screen, any capability read,
any Android native build (the Android proof is recorded from a local/emulator
run, not this repo's CI), push, deep links, or store readiness.

---

## 4. HONESTY DEFECTS FOUND

I looked specifically for screens claiming data they cannot have, fake states,
and unmarked placeholder content.

**The good news, stated plainly: there is no fabricated data anywhere in this
client.** No sample entries, no seeded roles, no empty list standing in for a
failed read. `CapabilityGate` (`src/screens/capability-gate.tsx`) structurally
prevents the last one — only a *loaded* answer can reach the children, so
"nothing recorded yet" can only be said about a real empty list. The
`context-provider.tsx` decision to report `unknown` rather than seed
`["worker"]` is the single best instance of the doctrine in the codebase.

What I did find were **stale and overclaiming comments** — three of them, all
in the class the mirror guard already names ("a stale refusal is as dishonest
as a fake success"):

| # | defect | status |
|---|---|---|
| **H-1** | `src/supabase.ts` claimed product reads "currently and honestly refuse". They have not refused since the bearer seam (#1331); three reads are live. A future reader would have trusted a false statement about the system's own capability. | **fixed here** |
| **H-2** | `src/supabase.ts` claimed an auth callback "arrives as a deep link, handled explicitly". **No deep-link callback handler exists** — `expo-linking` is a declared dependency and is imported nowhere in the app. The comment describes a mechanism that is not there, in the auth area. | **fixed here** (comment now states the truth and names why it stays false) |
| **H-3** | `app/(shell)/_layout.tsx` says tab labels "must not truncate at the largest accessibility text size". The code sets only `fontSize`; React Native scales that with the OS setting, so four labels including "Work journal" will truncate at large scales. The comment asserts a property the code does not establish. | **recorded, not fixed** — the honest fixes (icons, or shorter labels) are product decisions, and disabling font scaling would be an accessibility regression, not a fix. See **D-4**. |

---

## 5. RANKED GAP LIST

Effort: **S** ≤ ~½ day, **M** ~1–2 days, **L** > 2 days or needs a backend slice.

| rank | gap | value | effort | blocked by |
|---|---|---|---|---|
| **D-1** | **Session never renewed after launch.** `supabase-js` is configured `autoRefreshToken: false` (correctly — two session writers would drift), and nothing else renewed the token. After one token lifetime every capability read failed with "please sign in again", `state` never changed so the shell never redirected, and the only cure was killing the app. A session ending in silence. | very high | S | — **CLOSED HERE** |
| **D-2** | **Unknown deep link had no destination.** The `labourmarketai://` scheme is registered and most platform links are web links for routes this client does not have. Unmatched routes fell through to expo-router's built-in screen: English regardless of language, off-theme, worded for a developer. | high | S | — **CLOSED HERE** |
| **D-3** | **No error boundary.** A render fault unmounted the whole tree — a blank screen on a release build, with no words and no way out. | high | S | — **CLOSED HERE** |
| **D-4** | Tab labels truncate at large OS font scales; H-3's comment overclaims. Real fix is tab icons (there are none) or shorter labels. | medium | S–M | product decision (label/icon design) |
| **D-5** | **Work journal is read-only.** `journal.create_draft` → `journal.confirm` are live, exposed, and resolve the engagement context themselves. A worker can read their journal on a phone but not add to it — which inverts the actual use case (the phone is where the work happens). | very high | M | nothing. This is the next slice. |
| **D-6** | **Context holdings not read.** Settings honestly says it cannot list contexts. | medium | M | see §6 — needs care, do not improvise |
| **D-7** | Work card (`work_card.save_*`), employer demand (`demand.create_*`), interest (`interest.express_*`) unreachable from mobile. | medium | M each | nothing backend-side |
| **D-8** | No password reset in-app. | medium | S | requires an auth-server email send |
| **D-9** | Opportunities, notifications, projects, documents have **no capability at all** — the gap is server-side surface, not mobile code. | high (product) | L | a backend capability slice per area |
| **D-10** | Hours entry. | high (product) | L | the allocation-vs-journal double-counting reconciliation, `docs/MOBILE_ARCHITECTURE.md` §7.1 |
| **D-11** | Mobile CI is not a required check. A red Mobile run merges today. | medium | S | owner (branch protection setting) |

---

## 6. A NOTE ON D-6, BECAUSE THE OBVIOUS FIX IS A TRAP

`docs/MOBILE_ARCHITECTURE.md` §6 and `src/context-provider.tsx` both suggest
wiring holdings "via `context.switch`'s choice flow". That flow does return the
caller's own labelled workspace memberships — but it returns them from an
`execute` capability whose matching branch **performs a real write** (it moves
the durable active-workspace pointer). Enumerating by deliberately sending a
value expected not to match is a probe, and a probe that switches the person's
workspace if the guess ever collides is not a read.

Wiring D-6 should either add a dedicated read capability server-side, or be
done with an argument proven unable to match — and proven against a real
account, which needs credentials this slice does not have. I did not attempt
it. Recording the trap is more valuable than a plausible-looking wire.

---

## 7. BLOCKED_OWNER

| item | why | who unblocks |
|---|---|---|
| **Social OAuth on mobile (package 0011)** | Google's consent screen shows the Supabase host rather than LabourMarket.ai; the fix is a custom auth domain plus Google branding review. Untouched here by instruction. Mobile auth is **password-only** and this audit claims no authenticated social-OAuth mobile proof. | owner |
| **Authenticated runtime proof of the mobile capability reads** | Needs a real account against production. CI is secret-free by design and cannot do it. | owner (or a session-holding run) |
| **Runtime proof of the D-1 renewal path** | Watching a token actually expire and renew needs a signed-in session against the real auth server. See §8. | owner |
| **Mobile CI as a required check (D-11)** | Branch-protection setting. | owner |
| **Store submission, signing, push vendors** | Never started; deliberate. | owner |

---

## 8. WHAT WAS CLOSED IN THIS SLICE — AND EXACTLY HOW FAR IT IS PROVEN

### D-1 — the session renews itself

- `packages/client-core/src/session.ts`: new pure `millisecondsUntilRefresh`
  (+ `MAX_REFRESH_DELAY_MS`), sharing the existing `EXPIRY_SKEW_SECONDS` so a
  renewal is always due *before* a token would be refused. Four new unit tests
  in `session.test.ts`, including the cap that stops an absurd `expiresAt`
  overflowing a 32-bit timer into a spin.
- `apps/mobile/src/auth-context.tsx`: a `refresh` that is deliberately **not**
  `load()` — a renewal that could not reach the auth server changes nothing
  (the screens show their own "no connection"), while a refusal the server
  actually made ends the session. Two triggers: a timer for an app left open,
  and `AppState` foregrounding for a phone that slept through the timer.

**Proven:** `client-core` typecheck + 64 unit tests, mobile typecheck, Android
Metro→Hermes bundle (3.4 MB `.hbc`).
**NOT proven:** a real token expiring and renewing against the auth server.
That needs credentials. The scheduling arithmetic is unit-tested; the round
trip is not.

### D-2 — `app/+not-found.tsx`

The app's own words, in the app's own language, for a link that leads nowhere:
it may be a website link, or out of date, and nothing was sent. The way back
goes through the entry gate rather than a guessed tab, so a signed-out person
is not dropped on a screen that can only refuse them.

**Proven at runtime** (Expo web target, placeholder configuration, device
language Lithuanian): `/does-not-exist` renders "Tokio ekrano šioje
programėlėje nėra" with the app's copy and theme instead of expo-router's
built-in English unmatched screen, and the button lands on the sign-in screen
via the entry gate as designed. Not proven on a device — same code path, but
that is a device claim I am not making.

### D-3 — `ErrorBoundary` in `app/_layout.tsx` + `src/screens/crash.tsx`

A render fault now resolves to a screen saying it is the app's fault, nothing
was sent, and here is how to continue. It renders **above** `LocaleProvider`
by construction, so it resolves the device language through the same shared
function the provider uses; for someone whose phone and preference disagree
this is the wrong one of their two languages, which is better than English for
everyone and far better than a blank screen for anyone. It shows no error
text — `misconfigured.tsx` already states that rule.

**Proven at runtime** (same target): a throw temporarily injected into
`app/index.tsx` produced the crash screen in Lithuanian, with React reporting
"the error boundary you provided, Try" — i.e. the boundary, not a blank tree.
The injected throw was reverted and the app verified booting normally
afterwards.

### H-1, H-2 — stale comments corrected in `src/supabase.ts`

### i18n

All five active locales (en, lt, ru, nl, de) carry every new key. Compiler-
enforced; there is no half-translated state to find.

---

## 9. WHAT I DID NOT DO, AND WHY

- **No new capability, RPC, migration, or secret.** Every gap that needed one
  is recorded above instead.
- **No native Android or iOS build.** CI covers both. Nothing in this diff
  touches native configuration, dependencies, or `app.json`.
- **No context-holdings wiring** — §6.
- **Nothing near package 0011.** No auth domain, no branding, no DNS, no
  Vercel auth-origin configuration.
