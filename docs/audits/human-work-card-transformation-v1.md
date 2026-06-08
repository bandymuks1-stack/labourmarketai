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
| PR C* | Work Journal becomes "Mano darbo įrodymai" | ▶ this PR | — |

\* number assigned on open.

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

## What remains heavy (next PRs)

- **Documents/CV** → **PR D**: reframe as an evidence library that strengthens the
  card.
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
