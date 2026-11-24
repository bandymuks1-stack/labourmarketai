# Mano erdvė — Human Entry Direction (v1)

**Slice:** `my-space-human-entry-v1`
**Branch:** `feat/cc/my-space-human-entry-v1`
**Scope:** the authenticated **worker** entry (`/dashboard` overview, worker role).
**Type:** product-logic correction (not a beauty redesign).

> Goal: a logged-in person should feel they enter **their own space**, not a
> management system. The platform quietly turns self-expression into work
> readiness, CV, documents and opportunities — it never asks the person to
> "fill in a system".

---

## 1. What was making the product feel heavy

The worker overview had grown into an **admin cockpit**: roughly twelve stacked
surfaces, most of them system- or module-shaped rather than human-shaped.

Before this slice, a logged-in worker saw, top to bottom:

1. Role chip with a "live" dot + greeting (`Header`)
2. `CurrentSpaceHeader` (space name + purpose + My-spaces link)
3. `DashboardNextAction` (the one good, honest CTA)
4. `WorkerInvitationsCard`
5. A lone profession mono-label line (`MŪRININKAS`)
6. `StartingPoint` banner — platform wording ("Vėliau galėsite pridėti daugiau
   veiklų, rolių, įmonių, komandų, projektų ar galimybių")
7. `DashboardFirstUsePanel` — a 5-step educational panel, shown **always**
   (full or compact), even after the person was clearly past first use
8. `JourneyRail` — a desktop-style numbered **stepper** (Tapatybė → Įrodymai →
   Galimybės) + a "these steps show progress" helper line
9. Two "canonical" cards with cockpit eyebrows + signal dots ("JŪSŲ DARBO
   PULTAS / Tapatybė", "Įrodymai")
10. **Activity-setup card** — "Pradėti agentūros, įmonės arba pirkėjo veiklą"
    (a role/module-first surface that is **not** a person's next natural step)
11. A dashed **"addMore"** handle — "Pridėkite dar vieną būdą naudotis
    labourmarket.ai… Įmonės, agentūros ir pirkėjo erdvės dar ruošiamos"

The result reads as *software to be operated*: steppers, modules, "pultas"
(cockpit) language, progress legends, and two separate doorways into "other
ways to use the platform" — before the person has even expressed who they are.

It was **honest** (no fake data, no fake AI — those guards were already strong),
but it was **organised around the system**, not around the human path:

> Aš → ką moku → ką noriu veikti → kada galiu → kur galiu → kiek tikiuosi →
> kuo įrodau → kokios galimybės.

---

## 2. What was removed or hidden (worker entry)

Removed from the worker render path (kept only where they genuinely belong):

- **`StartingPoint` banner** — platform "you can later add roles/companies/teams"
  copy. *(The const still serves the company/org cockpit, where management
  language is appropriate.)*
- **`JourneyRail` stepper + progress helper** — the numbered cockpit stepper is
  no longer shown to the person. *(The component + the company-cockpit usage
  remain; the worker's real progress is now expressed calmly in "Aš dabar".)*
- **Lone profession mono-line** — folded into the "Aš dabar" snapshot.
- **The two cockpit "canonical" cards** — replaced with two calm, human-framed
  cards (see below). No more "DARBO PULTAS" eyebrows / signal dots.
- **Activity-setup card** (`Pradėti agentūros / įmonės / pirkėjo veiklą`) — a
  role/module-first surface. **Removed from the worker entry.** The route still
  exists and is reached from `/dashboard/account → "Mano erdvės"`; nothing was
  deleted, only moved off the person's calm first screen.
- **The dashed "addMore / Peržiūrėti vaidmenis" handle** — replaced by a single
  quiet "Kitos mano erdvės" handle.
- **Always-on first-use panel** — now shown **only** during true first use (no
  profession or no entries yet), then it disappears. It no longer nags a
  settled person.

No user functionality was removed. Profile/CV, journal, documents, invitations,
company/agency/admin logic are untouched.

---

## 3. What was changed / added

A new calm orientation surface — **"Mano erdvė"** — now opens the worker entry.

**New component:** `components/app/my-space-now.tsx` — the **"Aš dabar"** card.
It answers, at a glance and in human terms:

| Human question        | Surface (real data only)                          |
|-----------------------|---------------------------------------------------|
| Kas aš esu?           | greeting + "tai jūsų erdvė" intro                 |
| Ką dirbu?             | profession (or "Profesija dar nenurodyta")        |
| Ką moku?              | "Įgūdžių: {n}" (or "Įgūdžių dar nepridėjote")     |
| Kuo įrodau?           | "Darbo įrašų: {n}" (or "Įrodymų dar nėra")        |
| (honesty)             | "Tai, ką pasakojate apie save. Dar ne patvirtinta žmogaus — ir tai normalu." |

Every value is a **real count** already read on the dashboard. Empty states say
so plainly; nothing is fabricated and there is no fake "verified" claim.

**New worker entry composition (calm, ≤ 6 elements):**

1. `CurrentSpaceHeader` — space identity ("Asmeninis profilis") + the calm
   "Mano erdvės" doorway.
2. **"Aš dabar"** summary (`MySpaceNow`).
3. **One** clear next step (`DashboardNextAction` — the single gradient CTA).
4. `WorkerInvitationsCard` — self-hiding; only appears when a real invitation
   exists.
5. First-use guidance (`DashboardFirstUsePanel`) — **only** during first use.
6. The person's own surfaces in human words:
   - **"Mano veiklos ir įgūdžiai"** → `/dashboard/profile`
   - **"Mano įrodymai"** → `/dashboard/journal` *(shown only once real evidence
     exists; otherwise the first entry is already the next step)*
7. A single quiet **"Kitos mano erdvės"** handle → `/dashboard/account`.

**Copy** (LT + EN), under `auth.dashboard.mySpace`, is warm and first-person
("Ką dirbu / Ką moku / Kuo įrodau", "Pradėkite nuo savęs") with no bureaucratic
or internal-system wording.

---

## 4. Remaining heavy surfaces (intentionally out of scope for v1)

- **Company / agency / customer overview** is still an "operating cockpit"
  (journey rail, cinematic lanes, demand read-back). This is a **management
  context**, where some operational language is acceptable — but it is the next
  candidate for the same calming pass. *Left unchanged this slice to keep the
  change bounded and safe.*
- **The human path is only partially expressible today.** `kada galiu`
  (availability), `kur galiu` (location/mobility) and `kiek tikiuosi` (expected
  rate) are **not yet persisted**, so they are deliberately **not** shown — we
  do not invent inputs that don't save. They belong to the next slice.
- **`Mano galimybės`** (opportunities) is intentionally **absent**: the system
  has no real matching, so showing it would be a fake/planned surface. It will
  appear only when there is real information behind it.
- **Profile page** (`/dashboard/profile`) is already honest and reasonably calm
  (text-first flow + capability section). It was not restructured here; a later
  slice can align its eyebrows with the "Mano erdvė" voice.

---

## 5. Next recommended slice (`my-space-human-entry-v2`)

1. **Persist the missing human-path fields** (availability `kada`, location/mobility
   `kur`, expected rate `kiek`) as real, owner-only profile fields, and surface
   them inside "Aš dabar" — turning the snapshot into the full human path.
2. **Calm the company/agency overview** with the same principles (one summary,
   one next step, fewer cockpit surfaces) without losing real review/ops logic.
3. **Introduce `Mano galimybės`** *only* once there is genuine signal to show
   (real demand the person matches), clearly labelled and never fabricated.
4. Align the **profile page** eyebrows/voice with "Mano erdvė".

---

## 6. Guards / tests

- **New:** `lib/guards/my-space-human-entry.test.ts` — pins: the worker entry
  mounts the calm "Aš dabar" summary; the role/module activity-setup link is not
  on the worker entry; the profile/CV CTA is gated to the **incomplete** state
  only (no duplicate "fill your profile" nag); **no standalone "Įgūdžių
  patvirtinimai" / "Skill verifications" card** on the dashboard or profile;
  the "Mano erdvė" copy is present in LT + EN, human, and free of
  bureaucratic/internal-system and demo/fake/sample wording.
- **Updated:** `lib/guards/activity-setup-i18n.test.ts` — no longer asserts the
  activity-setup link is mounted on the dashboard (that surface was removed for
  product reasons); keeps localization-coverage + no-hardcoded-LT +
  no-internal-DB-text checks.
- All pre-existing safety guards stay green (CTA honesty, evidence/confirmation
  honesty, single-primary-CTA, room separation, mobile-first polish, i18n
  parity, no-fake-outcome, …): **146 test files, 2230 tests passing.**

---

## 7. Validation

| Check                          | Result |
|--------------------------------|--------|
| `pnpm -F web typecheck`        | ✅ pass |
| `pnpm -F web lint`             | ✅ pass (1 pre-existing unrelated warning) |
| `pnpm -F web test`             | ✅ 146 files / 2230 tests pass |
| `pnpm -F web build`            | ✅ pass |

**No** billing / payment / checkout changes. **No** schema / DB migration.
**No** env / secret changes. **No** fake / demo / sample data. **No** merge,
**no** deploy.

---

## 8. Visual review

Screenshots of the new worker entry (rendered from the real components via a
temporary, dev-only preview route that was removed before commit — the
authenticated dashboard requires a Supabase session, and this environment has
no local stack and no test worker; production must not be touched):

- Desktop (LT): `docs/audits/screenshots/my-space-desktop-lt.png`
- Desktop (EN): `docs/audits/screenshots/my-space-desktop-en.png`
- Mobile (LT): `docs/audits/screenshots/my-space-mobile-lt.png`

Each shows both states side by side: an **established** worker (real
profession / skills / entries → "Mano įrodymai" present) and a **first-use**
worker (honest empty states → "Pradėkite nuo savęs" guidance, no evidence card).
