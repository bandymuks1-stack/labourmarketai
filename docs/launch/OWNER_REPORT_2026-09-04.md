# OWNER REPORT — 2026-09-04 autonomous train (contract §36 format)

> Written for the owner's return. Every "can now do" below was proven on
> production with bounded E2E identities (never the real user); the proofs
> with screenshots and DB rows are in `docs/launch/pilot-feedback/2026-09-04-*.md`.
> State table: `RESUME_CHECKPOINT_2026-09-04.md`. Contract: `docs/ARCHITECTURE.md` §5.5.

## What a real WORKER can now do

ENTRY: sign in → the conversation. REQUEST: "noriu darbo" / "ko man trūksta?" / "kas baigia galioti?" / "kokių dokumentų man reikia?" / "kur galiu atlikti praktiką?" (PR).
ACTION: the 3-best board; the skills gap now continues to the DOCUMENT gap (what is required in the countries you named, what expires, who issues it) with the closing-step chips; if no country is stated the product asks where you want to work instead of guessing.
PERSISTED / DEPENDENT STATE: own documents and work card; nothing invented.
NEXT ACTION: documents centre (add / renew), work card (where to work), log work.
Still missing: a training suggestion for a skills gap (needs a public programme projection — owner decision); country names in the nominative.

## What a real EMPLOYER can now do

ENTRY → REQUEST: "Reikia 12 pastolininkų Roterdame nuo spalio 5 iki spalio 20."
ACTION: ONE prefilled form — Pastolininkas · Rotterdam, Nyderlandai · 12 · start 2026-10-05 · end 2026-10-20 (end in PR) — confirm.
PERSISTED: `customer_requests` row with `role_or_work_type=scaffolder`, `country=NL`, `team_size=12`, `structured_v2.time.start_earliest` (+ `end_date`). Five construction trades added (scaffolder, concrete worker, plasterer, steel fixer, insulation worker).
DEPENDENT STATE: the demand is on the worker board with its type/date; candidates answer in the chat.
NEXT: candidates → contact / booking. Still missing: the site as a project object.

## What a real AGENCY can now do (the real account "Labour market ai Sp. z o.o")

ENTRY: the greeting names the organization and ALL its capabilities ("Veikiate „…“ vardu. Čia galiu padėti su klientais ir pasiūlymais jiems, darbuotojų poreikiais, kandidatais, projektais…") and offers a MIX of next steps — not three agency chips. Expected for the real account: Pakviesti klientą · Kandidatai · Projektai.
REQUEST → ACTION → PERSISTED (all by sentence, proven end to end with three E2E identities): "noriu pakviesti klientą <e-mail>" → pending connection; client accepts + shares a need; "pakviesk kandidatą <e-mail>" → roster invitation; worker joins; "parodyk klientų poreikius" lists the shared need; "pasiūlyk kandidatą" → offer `offered`; "kaip sekasi mano pasiūlymams" → status. Telemetry chain incl. `first_real_action:offer_candidate`.
DEPENDENT STATE: the greeting's next step moves by itself (invite client → client needs → proposal status); the opening brief names offers awaiting the client's decision, shared needs without an offer, clients not yet confirmed.
DEFECT FOUND BY THE PROD WALK AND FIXED (#1473): since #1466 every shared client need was invisible to the chat (the adapter filtered on a status a request never has).
REAL_RECRUITER_USED_PRODUCT = FALSE — the real account has not typed a sentence since 06:15 UTC. Its next step is still one sentence.

## What a real STUDENT can now do

ENTRY: sign in as a linked learner → greeting acknowledges the institution; starters: Mokymosi kompasas · Ieškau darbo · Užfiksuoti darbą.
REQUEST: "ką man mokytis?" / "mano kompasas".
ACTION: one answer — becoming · evidence · fits now · missing · next steps as chat actions (choose direction, add skills / CV, log work, set availability, look at jobs) + the full compass one chip away.
PERSISTED / DEPENDENT: reads the same canonical compass the profile renders. "kur galiu atlikti praktiką?" narrows the board to internships (PR #1477).

## What a real EDUCATION INSTITUTION can now do

ENTRY: sign in as an organization holding the training capability → "Veikiate „…“ vardu. Čia galiu padėti su studentais, programomis ir grupėmis…" → starters Programos ir grupės · Reikia darbuotojų · Projektai.
REQUEST → ACTION → PERSISTED (proven): "sukurk programą" → programme row; "sukurk grupę" → cohort row (the only programme picked automatically); "pakviesk studentą" → ONE question (e-mail) → invitation row (relationship student) with the truthful readback "created, e-mail not sent"; "priskirk studentą grupei" → form from the real cohorts and accepted learners; "parodyk programas" → the list with cohort counts and market demand.
DEPENDENT STATE: opening brief names pending learner invitations; `first_real_action` emitted for programme / cohort / invitation.
REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE — no real institution has signed in yet. It needs no manual.

## What a real COMPANY / PROJECT OPERATOR can now do

The company greeting is capability-derived (employer + operations + agency + education tracks, ≤3 chips, a mix); "projektai" answers in the chat; My Space (pinned references above the conversation, the ask after repeated use, unpin) ships as code — its table waits for the owner's apply sentence. Project Field / what-if movement (contract §11) is NOT built.

## Honest remainder

- Owner gates (consolidated, do not re-ask): **"Apply My Space 2026-09-04"** (#1475, one reference table — RED only because of the static grant rule); **transactional e-mail** (`INVITE_EMAIL_PROVIDER/API_KEY/FROM` — every invitation is stored, not sent, and the chat says so); **public programme projection** (privacy decision) for "who can help" on a skills gap.
- Found tonight: on a PHONE the chips a panel action posts into the thread sat under the open bottom sheet — fixed (#1493, the sheet yields to the question); the project panel showed "Priskirta 0" beside "Priskirta projektui." — fixed (#1492, prod-proven `8aac9ab9`). Owner hold (v4): journal review per engagement cannot be enabled by anyone, so the employer's review stage waits for the owner.
- Not built: Project Field / team movement what-if (§11); reporting export/print by sentence (§19); World Map layers (§18); communication translation (honest "no engine"); reorder gesture and typed-sentence usage counting for My Space.
- Real-user evidence: none today beyond the recruiter's 06:15 sign-in. Everything above is E2E-proven, not real-user-proven.

## Evening additions (2026-09-04, after the owner's "never idle on CI" correction)

All E2E-proven on production unless marked PR. ENTRY → REQUEST → ACTION → PERSISTED → DEPENDENT STATE → NEXT.

- **Employer** — "sukurk projektą Roterdame" → the ONE form pre-filled with the city → `projects` row for the company (`f307e574`, row deleted after) → the new project opens in the panel with its (empty) roster and assignment controls (#1486) → NEXT: assign people there. Attention: "N kandidatai laukia jūsų atsakymo" (pending interest) and "N agentūrų pasiūlymai laukia jūsų sprendimo" (#1485/#1487).
- **Client of an agency** — greeting "1 agentūros pasiūlymas laukia jūsų sprendimo" → "kokius kandidatus pasiūlė agentūra?" → "• Suvirintojas — E2E Agentūra UAB" with accept / decline chips → decline (token-confirmed `company.respond-offer`) → offer `f93735c6` `declined` (`6fc477d9`); accept would propose the canonical booking to the worker.
- **Worker** — greeting "Trūksta 6 dokumentų jūsų šalims" + "Mano dokumentai" chip (`6fc477d9`; an EXPIRING document sits above matches as a deadline). "turiu naują A1 pažymą iki 2027-03-31" → the one form pre-filled (type, valid-until) over the canonical document upsert → readiness re-answers (**#1488, PR**). My Space counts typed sentences like chip clicks (#1480); "Į priekį" reorder (#1482).
- **Student** — "kur galiu atlikti praktiką?" → honest "Supratau „praktika“, bet ten dabar tau nieko nematoma. Matoma: …" listing what IS visible on the SAME dimension (`287b6fb0`, #1479/#1481); never the whole board again.
- **Education institution** — the learners section reports OUTCOMES from real state through `institution_learner_outcomes_v1` (its first caller); below 5 learners the suppression is SAID: "Rezultatai rodomi, kai prisijungę bent 5 besimokantieji (dabar 1)" (`d543867d`, #1484).

Honest remainder added tonight: the positive internship proof needs a demand from a VERIFIED company visible to a worker — no E2E company is verified and verifying one would show test demands to real workers (**owner decision**); the document FILE still goes through the documents centre; institution outcomes above the floor are unproven (no institution has 5 learners); the real recruiter has not acted since 06:15 UTC.

## Journey status (unit of success = the journey, not the rung; 2026-09-04 late)

Legend: **P** = prod-proven with an E2E identity today or earlier; **S** = shipped, unproven on prod today; **G** = owner-gated; **—** = not built.

| Journey | Stages | Status |
|---|---|---|
| WORKER | needs work → understood (profile/CV import, work card) → identity/evidence/readiness usable (documents gap, expiring/missing attention, document recorded by sentence) → real opportunities (board, World State, honest absent values) → WHY they fit (explained matches) → gaps actionable (skill-gap → documents; compass) → expresses interest → employer responds (contacted → attention line #1489) → sees WHAT CHANGED (board statuses, brief) → communication (messages in chat) → documents completed → progression (booking → engagement → project assignment) → work/evidence back to identity (journal → verified CV sheet by sentence) | P for every stage (progression to work: booking accepted in the chat → engagement; a document recorded by sentence with its written expiry, #1488/#1491; the verified CV SHEET by sentence, #1490; "mano projektai" lists the worker's own assignments, #1499 PR) except: the document FILE (documents centre, S); interest→contact by a REAL employer (G: no real employer yet) |
| EMPLOYER | need people → demand by sentence (city, headcount, start, end) → matching (candidates panel) → people/team (contact, shortlist, propose booking) → decision (worker responds) → assignment (project by sentence, people assigned in the panel) → work/result (journal reviews, figures by sentence) | P: demand, project, assignment controls, attention (candidates waiting, agency offers waiting); S: contact/proposal via the chat panel today (chain proven earlier, #857/G-04); G: none |
| AGENCY | client demand (invite client → share) → supply (roster) → proposal by sentence → client decision by sentence (accept → canonical booking) → placement (worker accepts → engagement) → result | P end-to-end (late 2026-09-04): invite, share, propose, offer status, client DECLINE and ACCEPT → canonical booking → the worker's acceptance in the chat → engagement `c61f1187` active; G: e-mail delivery to real clients |
| PROJECT | create by sentence → structure (stages/dates in the panel) → people/team (assign) → work (journal with project context) → readiness (project centre) → progress → evidence → report (org figures by sentence; reports/evidence page) | P (2026-09-04/05): create by sentence → people (assignment `80883119`; "kas laisvas šią savaitę?" answers capacity, #1498) → work (the worker's chat log carries `project_id`; a work package by sentence, `work_tasks 712182db`, #1497) → what is happening (the panel's PULSE from the operations centre's reads, #1495: entries today · evidence · open/overdue tasks · readiness · next) → progress (a stage moved to a real status by sentence or from the stage row, #1500 PR) → evidence on the CV sheet · the visual Project Field (operations page + centre) walked · figures by sentence. G: employer REVIEW of the work — `journal_review_enabled` is an owner HOLD (v4); —: Project Field what-if movement (§11) |
| EDUCATION | institution → programme/cohort/learner by sentence → capability (compass, transversal capabilities) → market need (internships as an opportunity type, honest absence) → internship/work → evidence (journal as a learner) → outcome (learner outcomes block, suppression said) | P: institution chain, compass, honest absent internship, outcomes below the floor; G: a VISIBLE internship needs a verified company (owner decision), outcomes above 5 learners (no such institution yet); e-mail delivery |

## Supporting evidence

PRs merged: #1467–#1474, #1476–#1487 (#1488 open with auto-merge; #1475 RED draft). Prod builds walked: `a870427a`, `c448cff7`, `2076d727`, `3b459de7`, `71f93e11`. Guards re-anchored consciously each time; migration-count ratchets untouched on `main` (bumped only inside the RED draft).
