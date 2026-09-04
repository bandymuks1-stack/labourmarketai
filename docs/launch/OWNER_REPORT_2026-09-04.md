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
- Not built: Project Field / team movement what-if (§11); reporting export/print by sentence (§19); World Map layers (§18); communication translation (honest "no engine"); reorder gesture and typed-sentence usage counting for My Space.
- Real-user evidence: none today beyond the recruiter's 06:15 sign-in. Everything above is E2E-proven, not real-user-proven.

## Supporting evidence

PRs merged: #1467 #1468 #1469 #1470 #1471 #1472 #1473 #1474 (+ #1476 #1477 #1478 auto-merging; #1475 RED draft). Prod builds walked: `a870427a`, `c448cff7`, `2076d727`, `3b459de7`, `71f93e11`. Guards re-anchored consciously each time; migration-count ratchets untouched on `main` (bumped only inside the RED draft).
