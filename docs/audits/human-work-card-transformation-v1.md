# Human Work Card Product Transformation v1 — Sprint Audit (living)

> North star: a person logs in and feels *"Čia yra mano darbo kortelė. Sistema
> mane prisimena. Matau, kas apie mane jau aišku. Matau vieną dalyką, kuris dabar
> labiausiai padidintų mano galimybes. Suprantu, kodėl verta tai padaryti."*

This doc tracks the worker-facing transformation across a sequence of small,
reviewable PRs. Updated as each PR lands.

---

## Product logic (source of truth)

Aš → ką galiu dirbti → kur galiu dirbti → kada galiu pradėti → kiek tikiuosi →
kuo galiu tai įrodyti → **mano darbo kortelė** → **vienas aiškus kitas naudingas
veiksmas**.

**Absolute principle:** every action shown must answer *"why is this useful to
me?"* — improving job suitability, employer trust, rate justification,
availability clarity, location fit, evidence strength, or communication clarity.
If it doesn't, it is hidden, demoted, or moved deeper.

---

## PR log

| PR | Title | State | Merge |
|----|-------|-------|-------|
| #256 | Calm "Mano erdvė" worker entry foundation | ✅ merged | `a0cdfbf` |
| #257 | State-aware "Mano darbo kortelė" (new/returning/stale) + RPC | ✅ merged | `5b1a827` |
| #258 | Employer preview — "Taip jus galėtų matyti darbdavys" | ✅ merged | `27c2fcb` |
| #259 | RPC Execute Hardening v1 (revoke PUBLIC/anon execute) | ✅ merged + applied | `5a8f368` |
| #260 | Profile becomes Work Card Source (benefit-first reframe) | ✅ merged | `8208d4a` |
| #261 | Work Journal becomes "Mano darbo įrodymai" | ✅ merged | `f08471e` |
| #262 | Documents/CV become Evidence Library | ✅ merged | `77fa0a6` |
| #263 | Human navigation / dashboard cleanup | ✅ merged | `abec3cb` |
| #264 | Notifications/messages become "Kas dabar svarbu" | ✅ merged | `fce451a` |
| PR F1* | Multilingual Work Instructions (honest scaffold) | 🔒 DRAFT — security review | — |

\* PR F1 touches private messaging (DB + SECURITY DEFINER RPC). Per the operating
rules it is opened as a **draft, NOT auto-merged, NOT applied to prod** until the
owner's migration/security review passes.

## PR F1 — Multilingual Work Instructions: safety + convenience foundation (this PR)

**This is the first safety-critical AND convenience-critical multilingual project
communication foundation** — not a fake translation product, and not merely a
legal/WADI/posting/documentation feature. In construction and workforce projects,
**a misunderstood instruction can affect health, safety and life**, so every
project needs a multilingual instruction/communication layer for urgent
coordination, safety discussions, task clarification and manager↔worker
communication. Safety and convenience are not opposites: **difficult communication
becomes unsafe communication**, so the channel must be easy to find, easy to
understand, mobile-friendly, original-preserving, translation-honest and
clarification-friendly.

**No translation service exists yet**, so v1 is an honest **original-preserving,
multilingual-ready scaffold** (Option B): the manager writes in their own
language; the worker reads the **original**, which is always the source of truth
and always viewable; a real translation lands in a later reviewed slice.

- **Reuses the secure communication tables** (0021): an instruction is a
  `conversation_messages` row flagged `is_instruction` → the existing
  participant-scoped RLS applies unchanged (no cross-thread/cross-company leak).
- **Additive migration** `20260608150000_work_instructions.sql`: instruction
  columns + a **relationship-gated, owner-scoped SECURITY DEFINER**
  `send_work_instruction` RPC. Revoked from PUBLIC/anon; granted to
  `authenticated` only. Reversible. The original `body` is never overwritten.
- **Manager** `/dashboard/instructions`: "Nurodymas darbuotojui" composer (pick a
  managed worker, write in own language, send). **Worker**: "Mano nurodymai" —
  original preserved + honest *"Vertimas dar neparuoštas. Rodomas originalas."* +
  "Rodyti originalą" + low-friction **"Paprašyti patikslinti"** (a real reply in
  the thread). A foundation note states the safety + convenience purpose.
- No fake translation / delivered-read / AI understanding / demo data.
- Guards: `work-instructions-migration` + `work-instructions-integrity`.

> ⚠️ **Permission scope (roster-scoped v1 ONLY):** a manager/admin may instruct a
> worker only when an **ACTIVE** `company_workers`/`agency_workers` row links that
> worker to a company/agency the manager owns. **Future project/object/site-scoped
> permissions are required before this can be used as precise on-site task
> control** — roster-level scope is broader than a single site/assignment.

**Migration APPLIED to prod** (`gorgitwvdzxbnaxhrsrw`, after owner SQL/security
review): 6 instruction columns present; `send_work_instruction` is **SECURITY
DEFINER** with **`search_path=public`**, **EXECUTE granted to `authenticated`
only** (`anon=false`, `public=false`); `conversation_messages` RLS **unchanged**
(SELECT = participant/admin, INSERT = author=self AND participant — no loosening);
original body never overwritten. `pnpm db:types` regenerated via Supabase MCP.

## PR F2 — Surface instructions in "Kas dabar svarbu / Mano pranešimai"

Real **new (unread)** work instructions now appear as **"Reikia jūsų dėmesio"** at
the top of "Mano pranešimai" (`/dashboard/communication`) — so an urgent
instruction is not hidden on a separate page. Mobile-friendly, one-tap
**"Peržiūrėti nurodymą"** → the full instruction + original + clarification.

- `listAttentionInstructions()` returns instructions addressed to the user whose
  `created_at` is newer than their `last_read_at` for that conversation (real
  unread data — RLS-scoped). **No DB change** (reuses F1 tables + 0021 RLS).
- `<AttentionInstructions>` renders **nothing** when there is nothing to attend to
  — honest empty state, **no fake count / urgency / "someone needs you"**. The
  snippet is the **original** text (translation not ready yet), never a fake
  translation.
- Guard `instructions-attention-framing.test.ts` pins the surfacing, the
  null-when-empty honesty, real `last_read_at` driving, original-not-fake-translation,
  and calm LT/EN copy.


**Hardening applied to prod** (`20260608140000`): `save_worker_card` /
`confirm_worker_card` now `public_exec=false`, `anon_exec=false`,
`auth_exec=true` — the "Public Can Execute SECURITY DEFINER Function" advisor is
cleared; RPC bodies untouched.

**Migration applied to prod** (`gorgitwvdzxbnaxhrsrw`): `worker_work_card`
(add `workers.work_card_confirmed_at` + `save_worker_card` / `confirm_worker_card`
owner-scoped SECURITY DEFINER RPCs). Verified: column present, both RPCs
SECURITY DEFINER, execute granted to `authenticated`, **no direct UPDATE on
`workers` for `authenticated`**. Main auto-deploys via Vercel (triggered by each
merge; no manual deploy run).

---

## What became simpler / clearer

- **PR #256/#257:** the worker entry stopped being an admin cockpit (stepper
  rail, platform banners, role/module activity-setup, always-on first-use panel)
  and became one calm **work card** with greeting → "Kas jau aišku" / "Ko dar
  trūksta" → **one** next action + **why it helps** → small stale confirmation.
- **State awareness:** a returning user is **never re-asked** a saved dimension.
  Only the first unmet dimension is the next action.
- **PR #258 (employer preview):** the worker can see **"Taip jus galėtų matyti
  darbdavys"** — a read-only mirror of their own saved data — making the value of
  completing each field tangible.

## What was hidden / demoted

- Stepper rail, "starting point" platform banner, role/module activity-setup
  card, dashed "addMore" handle (PR #256).
- Always-on first-use panel → only during genuine first use (PR #257).
- Worker `DashboardNextAction` → replaced by the single work-card next action.

## What real function was added

- **Persisted work-card fields** (availability / location / pay) via owner-scoped
  RPCs; fast inline editing; partial saves.
- **Stale confirmation** ("Ar tai vis dar galioja?" → Taip / Pakeisti), 90-day
  window; never restarts onboarding.
- **One-best-next-action engine** (`lib/worker/work-card-state.ts`) — exactly one
  primary action with benefit copy, chosen from missing/weak data.
- **Employer preview** (read-only, real data only, no fake match/score/visibility).

## What user benefit each action explains

- work → *"Tai padeda suprasti, kokiam darbui jus galima siūlyti."*
- availability / location → *"Tai padeda nerodyti jums netinkamų pasiūlymų."*
- pay → *"Tai padeda pagrįsti jūsų pageidaujamą tarifą."*
- evidence → *"Įrodymai didina pasitikėjimą, bet galite juos pridėti vėliau."*
- complete → *"Jūsų darbo kortelė pilna — toliau ją stiprina darbo įrašai."*

---

## PR B — Profile becomes Work Card Source (this PR)

- Reframed `profileHub` + profile page subtitle to **"Mano darbo kortelės
  šaltinis"**, benefit-first: eyebrow names the work card; lead is *"Štai ką apie
  jus jau žinome."*; explainer states the **employer** benefit (*"Tai padeda
  darbdaviui greičiau suprasti, kokiam darbui tinkate."*).
- CTAs reframed off form-language: "Papildyti profilį" → **"Pridėti, ko trūksta"**;
  "Pildyti darbo žurnalą" → **"Pridėti darbo įrodymą"**; journal link → "Mano
  darbo įrodymai". No completion nagging, no percentage, no module wording.
- Kept the already-consolidated structure (one primary CTA, single not-verified
  negation, no standalone skill-verification card — those were removed in the
  prior P0 rescue) and all real editing/CV/skills functionality.
- New guard `profile-work-card-source.test.ts` pins the framing + anti-nagging +
  one-primary-CTA + no-skill-verification-card invariants.

## PR C — Work Journal becomes "Mano darbo įrodymai" (this PR)

- Worker-facing journal reframed from a diary/module to an **evidence path**:
  `navTitle` "Mano dienoraštis" → **"Mano darbo įrodymai"**; new subtitle
  *"Įrašai parodo, ką realiai dirbote, ir sustiprina jūsų darbo kortelę."*;
  composer prompt "Ką šiandien nuveikei?" → **"Ką šiandien parodote apie savo
  darbą?"**; empty state "Pradėkite darbo žurnalą" → "Pradėkite kurti darbo
  įrodymus".
- **Work-card connection** is explicit: a benefit line above the composer —
  *"Šis įrašas sustiprina jūsų darbo kortelę."* + the honest, affirmatively-phrased
  *"Patvirtinti gali tik žmogus — vadovas ar klientas."* (no "automatic
  verification" phrasing — that trips the honesty guards even as a negation).
- Removed diary/module wording from the worker-facing copy (no "dienoraštis",
  no "žurnalas atsidarys"). Structure, autosave/draft safety, entry creation,
  project context, entry list/history, confirmation/honesty rules all unchanged.
- New guard `journal-evidence-framing.test.ts` pins the evidence + work-card
  framing, the no-heavy-wording rule, the honest benefit line, and one-CTA.

## PR D — Documents/CV become Evidence Library (this PR)

- **Reality check:** there is **no active worker document storage** — CV file
  upload is an explicit M1/M2 **scaffold** (`CvImportUpload` stores nothing;
  `CvInputPanel` upload is "coming soon"). The only real worker CV is the pasted
  **text** → `profiles.profile_text`. So PR D is an **honest copy reframe** of the
  existing CV surface — **not** a new (fake) file cabinet.
- Reframed `structuring.cv` (`CvInputPanel`) from "Įkelti arba įklijuoti CV"
  file-admin into evidence-library framing: title **"CV — pirmasis jūsų
  įrodymas"**; helper leads with the work-card benefit + privacy; file upload is
  honestly **"Įrodymų biblioteka … dar ruošiama"** (no fake upload).
- Added a **benefit-by-type** list + **privacy note** in the panel:
  CV→experience, certificates→trust, photos/files→real work, references→reliability,
  ID/legal→only when needed; *"Jūsų dokumentai privatūs. Jie nerodomi darbdaviui
  ar klientui be aiškaus pagrindo."*
- Light touch on `skills.import*` prompt (benefit-first), keeping the honest
  "not saved" lines. **No storage/access/DB change**; the real CV-text path is
  unchanged; no fake verification / employer visibility / score.
- New guard `evidence-library-framing.test.ts` pins the framing, benefit-by-type,
  explicit privacy, no admin/file-cabinet wording, and one primary CTA.

## PR E — Human navigation / dashboard cleanup (this PR)

- **Humanized the primary nav** (desktop tabs + mobile bottom nav, sourced from
  `lib/config/navigation`): "Apžvalga" → **"Mano erdvė"**, "Profilis" → **"Darbo
  kortelė"**, "Žurnalas" → **"Įrodymai"**, account stays **"Mano paskyra"** (LT+EN).
  No dashboard/cockpit/module wording in worker nav.
- **Removed duplicate doors** from the worker dashboard: the two cards
  ("Mano veiklos ir įgūdžiai" → profile, "Mano įrodymai" → journal) and the bottom
  "Kitos mano erdvės" account handle — all now covered by the primary nav tabs +
  the `CurrentSpaceHeader` "Mano erdvės" link + the `AccountMenu`. The dashboard
  is now: space header → work card → invitations → first-use guidance. No card wall.
- **One primary CTA** preserved (the work card's next action); the dashboard page
  carries no inline gradient CTA.
- All routes stay reachable (nav tabs + AccountMenu). Company/agency/admin
  untouched. No fake evidence/visibility/verification.
- Updated `room-based-account-spaces` guard (account doorway is now the
  current-space header + nav tab, not a duplicate page handle); new guard
  `worker-nav-human-labels.test.ts` pins human labels + route reachability +
  no-duplicate-door + one-CTA.

## PR F — Notifications/messages become "Kas dabar svarbu" (this PR)

- **Reality check:** there is no notifications table yet, so the header bell is an
  empty state; `/dashboard/communication` holds REAL messages. So PR F is an
  honest framing reframe — no fake notifications, no fake priority groups.
- **Header bell** (`auth.notifications`): "Pranešimai" → **"Mano pranešimai"**;
  empty state "Pranešimų dar nėra / …kai sistema augs" → calm
  *"Šiuo metu nieko nereikia daryti." / "Jei atsiras svarbus prašymas ar žinutė,
  matysite tai čia."*
- **Messages page** (`communication`): "Pokalbiai" → **"Mano pranešimai"**;
  subtitle → *"Kas dabar svarbu ir į ką verta atsakyti…"*; the honest "not
  real-time / no fake read receipts" note demoted from a **warning banner** to a
  calm muted line; empty state reassuring (*"…matysite tai čia"*).
- No fake urgency / matches / employer-interest / "someone viewed you"; no admin
  inbox / module / pipeline wording. Privacy footnote kept. Shared page → the
  first-person framing works for all roles; **company/admin comms unchanged**
  (copy only, no logic/RLS change).
- New guard `worker-notifications-framing.test.ts` pins the framing, calm empty
  states, no-fake-signal, no-admin-inbox-wording, and the muted (non-warning) note.
- **"Mano pranešimai" was NOT added as a 5th nav tab** — the mobile bottom nav
  already carries 4, and a 5th would crowd + needs a feature-catalogue change.
  Messages stay reachable via the header bell + `MessageButton` + direct route.
  (Promoting to a tab can be revisited later if the catalogue is widened.)

## What remains heavy (next PRs)

- **Worker document file storage** is genuinely not built yet (scaffold). A real
  evidence-file feature (private storage + owner-only access) is a future,
  security-reviewed slice — not bundled here to avoid a fake/unsafe surface.
- **Navigation** → **PR E**: human nav (Mano erdvė / darbo kortelė / įrodymai /
  pranešimai / paskyra); remove duplicate doors; merge stacked headers.
- **Notifications/tasks** → **PR F**: "what matters now", not admin inbox noise.
- **Company/agency** → **PR G**: calming pass *after* the worker path is coherent.

---

## Pending hardening (needs owner-authorized apply)

The `save_worker_card` / `confirm_worker_card` RPCs are safe (they raise
`Not authenticated` when `auth.uid()` is null, so anon calls touch no data —
matching the 17 existing SECURITY DEFINER functions). A Supabase advisor still
flags the default PUBLIC EXECUTE grant ("Public Can Execute SECURITY DEFINER
Function"). Recommended defence-in-depth (apply when authorized — the Claude Code
prod classifier correctly blocked an un-reviewed agent follow-up):

```sql
revoke execute on function public.save_worker_card(text, date, text, text[], int, int) from public, anon;
revoke execute on function public.confirm_worker_card() from public, anon;
-- (the explicit grant to authenticated already exists)
```

This is a known low-priority item, not a data-access vulnerability.

---

## What needs user testing

See `docs/testing/human-work-card-user-test-v1.md`. Key questions: does a new
user reach first value in 1–2 min? Does a returning login feel like the system
remembers them (not "fill it again")? Is "why this helps me" understood?
