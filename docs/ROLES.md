# Roles

The seven roles from `docs/PROJECT_VISION.md` §7. `profiles.role` is the
DB enum (`worker`, `team_leader`, `company_manager`, `hr_personnel`,
`agency`, `admin`, `customer`). M0 schema (`docs/DATA_MODEL.md`) currently
constrains `role IN ('worker','company','agency','admin')`; `team_leader`,
`hr_personnel` and `customer` are added to the check constraint in **M1**
(documented, applied that milestone).

RLS rationale per role lives in `docs/DATA_MODEL.md` → "RLS". This file is
the product-level description.

| # | Role | LT | EN | Full UX |
|---|------|----|----|---------|
| 1 | `worker` | Darbuotojas | Worker | M1→M2 |
| 2 | `team_leader` | Komandos vadovas / brigadininkas | Team leader | M2 |
| 3 | `company_manager` | Įmonės vadovas | Company manager | M2 |
| 4 | `hr_personnel` | HR / personalo žmogus | HR personnel | M2 |
| 5 | `agency` | Agentūra | Agency | M4 |
| 6 | `admin` | Administratorius | Admin | M1→M4 |
| 7 | `customer` | Klientas / užsakovas | Customer (B2C) | M3 |

### 1. Darbuotojas / Worker
- **LT:** Žmogus su gyvu darbo pasu — profilis, įgūdžiai (5 lygiai),
  darbo žurnalas, dokumentai, prieinamumas.
- **EN:** A person with a living work passport, not a CV.
- **Mato:** savo profilį, atitikimus, žinutes; kas mato jį (matomumo
  valdymas).
- **Permissions:** owns own `workers`/`worker_skills`/`consents`; reads
  own matches/messages. No cross-tenant reads.
- **Full UX:** profile core M1, matching/journal M2.

### 2. Komandos vadovas / Team leader
- **LT:** Brigadininkas — valdo komandą (pirmos klasės objektas),
  patvirtina įgūdžius (level 3), tvarko sprendimų eilę savo komandai.
- **EN:** Runs a first-class team; can manager-confirm skills.
- **Mato:** savo komandą, jos paskyrimus, laukiančius sprendimus.
- **Permissions:** read/write `team_entities` they own; confirm
  `skill_verifications` at `manager` level for team members.
- **Full UX:** M2 (teams + decision queue).

### 3. Įmonės vadovas / Company manager
- **LT:** Įmonės atstovas — kuria projektus ir darbo poreikius, mato
  surikiuotus kandidatus su paaiškinimu, samdo.
- **EN:** Posts demand, sees ranked/explained candidates, hires.
- **Mato:** įmonės projektus, poreikius, kandidatų tinkamumą, decision
  queue.
- **Permissions:** owns `companies`/`projects`/`job_demands`; reads
  matches for own demand.
- **Full UX:** M2.

### 4. HR / personalo žmogus / HR personnel
- **LT:** Personalo žmogus — dokumentų būsenos, atitiktis, darbuotojų
  duomenų tvarkymas įmonėje.
- **EN:** Manages documents/compliance within a company.
- **Mato:** įmonės darbuotojų dokumentus, trūkstamus veiksmus.
- **Permissions:** scoped to employer company; document module focus.
- **Full UX:** M2.

### 5. Agentūra / Agency
- **LT:** Kandidatų paruošimo ir pasiūlymo sistema — valdo rezervą,
  skelbia klientų vardu, kontroliuoja matomumą.
- **EN:** Prepares and offers candidates; manages a managed pool.
- **Mato:** savo rezervą (`agency_workers`), klientų poreikius, paskyrimų
  būsenas.
- **Permissions:** owns `agencies`/`agency_workers`; visibility-gated
  demand.
- **Full UX:** M4.

### 6. Administratorius / Admin
- **LT:** Platformos administratorius — viskas + leads, plans, audit.
- **EN:** Platform admin; sees everything.
- **Mato:** visus duomenis (RLS `is_admin()` bypass branch).
- **Permissions:** full, via `is_admin()` in every RLS policy.
- **Full UX:** M1 (promote), expands through M4.

### 7. Klientas / užsakovas / Customer (B2C)
- **LT:** Užsako paslaugą ir mato, kas ją realiai teikia — B2C sluoksnis
  ant tų pačių darbuotojų duomenų (ADR 0007).
- **EN:** Orders a service and sees who actually provides it.
- **Mato:** savo užsakymus (`service_requests`/`service_bookings`),
  teikėjo profilį/įvertinimą.
- **Permissions:** owns own service requests/bookings; reads public
  provider info.
- **Full UX:** M3.
