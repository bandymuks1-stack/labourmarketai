# The institution acts by sentence (2026-09-04)

> Owner Master Execution Contract §15 — a real education institution is
> waiting. Verification used the bounded E2E identity `e2e-walker` acting for
> "E2E Walker UAB" (organization `a996113c`, capability `training_provider`);
> never a real institution. E2E residue stays labelled "(testinis)".

## Measured before (#1470)

The institution's commands (programme, cohort, learner assignment, learner
invitation) existed only as page forms on the company hub and the network
panel. "Sukurk programą" and "pakviesk studentą" answered with route chips.

## The fix (#1470, GREEN, prod `3b459de7`)

Four registered actions (`company.create-programme` / `create-cohort` /
`assign-learner` / `invite-learner`) over the SAME server actions the page
forms call and the SAME invitation layer the network panel uses
(`join_organization` + relationship `student`); the read adapter over
`readInstitutionPrograms`; forms built per turn from real programmes,
cohorts and accepted learners; `first_real_action` emitted server-side.

## Production verification (E2E identity, 390 px, `3b459de7`)

| Step | Observed |
|---|---|
| greeting | "Veikiate „E2E Walker UAB“ vardu. Čia galiu padėti su studentais, programomis ir grupėmis, darbuotojų poreikiais, kandidatais, projektais ir komanda." — starters **Programos ir grupės · Reikia darbuotojų · Projektai** (education first, the employer capability intact) |
| "parodyk programas" | answered in the chat (list / honest empty) |
| "sukurk programą" → name → Tęsti → Išsaugoti | "Programa sukurta. Dabar galite sukurti grupę arba pakviesti studentus." — row `education_programs 8b8cae97` "E2E Pastolininkų kursas (testinis)" |
| "sukurk grupę" (the only programme picked automatically) → name → save | row `education_cohorts 41f1234e` "2026 ruduo (testinė)" |
| "pakviesk studentą" | "Gerai. Kokiu el. paštu pakviesti studentą?" → e-mail → save → **"Pakvietimas sukurtas, bet el. laiškas nesiunčiamas — pasidalinkite nuoroda iš tinklo skilties."** (truthful: `INVITE_EMAIL_*` is not configured in production) — row `invitations 0be96a8f` (`join_organization`, `student`, pending) |
| "priskirk studentą grupei" | the assignment form opened with the REAL cohort and the organization's accepted learners |
| "parodyk programas" again | "• E2E Pastolininkų kursas (testinis) — grupių: 1 · rinkos paklausa: …" |
| telemetry (one profile) | `chat_intent_recognized:programmes` → `chat_action_attempted:company.create-programme` → `first_real_action:programme_created` → `chat_action_persisted` · the same chain for `cohort_created` · `chat_intent_recognized:invite-student` → `chat_missing_data_asked:company.invite-learner` → `chat_action_attempted` → `chat_action_persisted` → `first_real_action:learner_invited` |

Probe note: the walker profile had `active_organization_id = null` and two
companies (an old shell-company residue) — the resolver picked the shell, so
the first pass saw a plain employer. Set to the training-provider organization
for the probe; the real institution goes through setup and has one. The
shell-company class itself was fixed in #1463.

## What a real institution can now do

Sign in → the workspace names the institution and its capabilities → type
"sukurk programą", "sukurk grupę", "pakviesk studentą", "priskirk studentą
grupei", "parodyk programas" → real rows, readback in words, next chips.
Still open: learner invitations are stored, not e-mailed (owner gate: the
transactional e-mail provider); `institution_learner_outcomes_v1` has no
caller; REAL_EDUCATION_INSTITUTION_USED_PRODUCT stays FALSE until a real
institution does it.
