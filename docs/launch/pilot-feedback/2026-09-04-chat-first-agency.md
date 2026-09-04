# Pilot friction — REAL recruiter, chat-first failure (2026-09-04)

> Real-user evidence stays separate from agent probes. The sentence below was
> typed by the real recruiter account on production; everything the agent did
> afterwards was done with code, tests and a bounded synthetic identity.

## What the real user saw

In the agency workspace ("Labour market ai Sp. z o.o", admin) the user typed:

> noriu pakviesti klientą

LabourMarket.ai answered with the generic worker fallback ("Galiu padėti su CV,
profiliu ir darbo pasiūlymais. Ką norėtum daryti?") and the employer starter
chips ("Reikia darbuotojų", "Kandidatai", "Projektai"). No client invitation
was created. This happened **before first recruiter value** and is recorded as
real pilot friction (P0, chat-first doctrine).

## Root cause (three layers, all in the shared routing/execution path)

1. **Router had no agency vocabulary.** `lib/conversation/intent-router.ts`
   classified the sentence as `unknown`; the canonical actions
   (`agency.invite-client`, `agency.propose-candidate`) existed in the action
   registry but no sentence could reach them and no inline form existed for
   them.
2. **Fallback ignored the context.** `labels.fallback` was one worker-language
   string for every identity; the chips were already company-aware, the text
   was not.
3. **Agency actions were gated on the legacy `agency` role.** A Direction A
   agency is a company of type `staffing_agency` and holds the `company` role
   only, so even a routed sentence would have been refused as
   `not_authorized` by the conversation dispatcher. The invite schema also
   demanded a company id the chat never knows.

## The shared fix (one PR, GREEN)

- Router: five agency intents (`invite-client`, `invite-candidate`,
  `client-demand`, `propose-candidate`, `proposal-status`) and three
  student/institution route intents (`learning-compass`, `invite-student`,
  `programmes`) in the five routed locales (LT/EN/RU/NL/DE), diacritic-folded;
  internship/apprenticeship stems added to `opportunities` (same board, same
  engine).
- Registry: rows + handlers; the agency writes open the ONE inline form over
  the ONE dispatcher; the reads run a new agency bridge read adapter
  (`lib/conversation/agency-workspace.ts`) over the same canonical reads the
  company page renders.
- Authorization: `agency.*` actions accept `company` (the real authority stays
  in SQL: `owns_company` + the staffing_agency check in each RPC). New
  `company.invite-worker` action (roster invitation by sentence). The invite
  executor resolves the ACTIVE workspace's company (M-P0-3) when the chat
  supplies none.
- Context: the dashboard resolves `agencyWorkspace` server-side; the chat's
  starters and its not-understood answer follow identity + workspace
  (worker / employer / agency / education).
- Missing data: the sentence's e-mail pre-fills the field; otherwise ONE
  question ("Kokiu el. paštu pakviesti klientą?"), then the review/confirm
  step of the same form. Readback states the REAL state ("laukia kliento
  patvirtinimo"); roster invitations state honestly that no e-mail is sent.
- Telemetry (existing pipe, bounded scalars): `chat_intent_recognized` /
  `chat_intent_unrecognized` (step = intent id), `chat_missing_data_asked`,
  `chat_action_attempted` / `chat_action_persisted` (server-side in the one
  dispatcher, step = action id). `first_real_action` already fires on the
  bridge writes; a new roster invitation now emits it too.

## Actor coverage after the fix (honest)

| Actor | Executable in chat | Answered in chat (read) | Route chip only | Missing |
|---|---|---|---|---|
| Worker | log work, CV import, profile forms, express interest / booking response | find work / opportunities, skill gap, journal, player card, engagements | — | — |
| Employer | create demand, confirm/close/reopen, shortlist, contact, propose booking, assign, invite worker | candidates (scouting in panel), projects, interest inbox | company hub | — |
| Agency | invite client, invite candidate, propose candidate | client demand, proposal status | — | — |
| Student | (worker set) | opportunities incl. internships, skill gap | Learning Compass | executable compass actions |
| Institution | — | — | invite learner, programmes & cohorts | create programme / cohort / assign learner by sentence (needs the education commands wired as executors — follow-up slice) |

## Navigation-instead-of-conversation review (#1460–#1465)

- #1460 (invite deep link pre-set to "Studentas", programme form open,
  workspace door after setup): the learner invitation and programme creation
  are still page actions; the chat now routes to them by sentence and the
  executor wiring is the recorded follow-up.
- #1463 / #1465 (setup form completes the shell, governed company edited):
  company identity is a legal-fact form; stays a form, reachable by
  "sukurk įmonę" (unchanged).
- Agency bridge (#859 UI): invite client / propose candidate were
  dashboard-only — now chat-first (this PR).

## Production verification (E2E agency identity, not the real user)

Deployed as #1466 → `00f3749a` (07:2x UTC). Bounded synthetic agency identity
(`e2e-timing-…`, owner of "E2E Agentūra UAB (testinis subjektas)"), Chromium
390 px against production:

| Step | Observed |
|---|---|
| greeting | agency starters: "Pakviesti klientą", "Klientų poreikiai", "Pasiūlymų būsena" |
| typed "noriu pakviesti klientą" | "Gerai. Kokiu el. paštu pakviesti klientą?" + the one-field form (1.5 s after send); no worker fallback |
| e-mail → Tęsti → Išsaugoti | "Pakvietimas sukurtas ir laukia kliento patvirtinimo…" (3.2 s from the sentence) |
| DB | `agency_client_connections` row `c528bdd6…`, status `pending`, agency = the E2E agency |
| telemetry (one profile, same minute) | `chat_intent_recognized{step: invite-client, role_context: agency}` → `chat_missing_data_asked` → `chat_action_attempted` → `first_real_action{surface: agency_bridge}` → `chat_action_persisted` |
| "kaip sekasi mano pasiūlymams" | answered in the chat (no proposals yet), no fallback |
| "parodyk klientų poreikius" | answered in the chat (no shared requests yet), no fallback |
| "blablabla xyz" | the AGENCY fallback ("Galiu pakviesti klientą ar kandidatą…"), never worker copy; `chat_intent_unrecognized` recorded |

Residue: one labelled E2E connection (`e2e-chat-client-2026-09-04@labourmarket.ai`, pending) on the E2E agency.

The real account made no chat action yet after the fix (0 connections on
"Labour market ai Sp. z o.o"); REAL_RECRUITER_USED_PRODUCT stays FALSE until it does.
