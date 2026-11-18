# 0027 — Worker identity: one API access policy (PROPOSED, awaiting owner approval, 2026-10-18)

Status: **PROPOSED.** It becomes binding when the owner approves migration
`20261018160000_worker_identity_split_v1` (RED). Until then the rule below is the target, and the
current production policy is the one described under "Before".

## Owner direction (2026-10-18)
Profiles are anonymous by default. Employers see professional data only. A worker's name, contacts,
photos and links to other profiles reach one organization only with the worker's own permission for
that organization. A paid or VIP plan never opens identity. Owners keep seeing their own data, and
organizations keep legitimate access to people they work with and to their project history.

## The policy: who may read what about a worker

| Reader | Raw `workers` row (incl. name, free text) | Professional projection | Identity (name, contacts, links) |
|---|---|---|---|
| The worker | yes | yes | yes (own) |
| Platform admin | yes | yes | yes |
| An organization with a **working relationship** (roster, engagement whose relationship type grants worker visibility, project assignment, agency roster, booking engagement) | yes | yes | yes, as today |
| An employer who **found** the worker through `profile_discoverability` | **no** | yes: experience, countries, availability, pay, engagement form, work conditions (the fields the consent preview lists) | **only** through the worker's per-organization `employer_data_disclosure` grant |
| An employer with a paid plan or an owner-granted VIP status | same as the row above; plans change view limits, never identity | same | same |
| Anyone else (signed in) | no | no | no |
| Anonymous | no | no | no |

Mechanics:
- `workers_select` = `caller_has_worker_relation_v1(id)`: `can_view_worker` without its
  discoverability branch, the same audience as `worker_recognitions_for_viewer_v1` (owner decision
  2026-10-08).
- Discovery reads only `list_discoverable_worker_profiles_v1` (by id) and
  `list_discoverable_worker_ids_v1` (by country). Neither returns a name or free text. A synthetic-
  fixture flag is computed in SQL, so QA fixtures stay out of real scouting without a name.
- `can_view_worker` itself is unchanged: `worker_skills`, `worker_professions`, `worker_languages`
  (professional data inside the consent) and the definer doors that use it (contact ask, booking,
  profile-view gate) keep working.
- Identity for a found worker: `employer_data_disclosure` (per organization, per need, versioned,
  withdrawable). The applicant-identity door (`applicant_identity_v1`) stays: a worker who applied to
  that organization's own demand chose that organization.

## Indirect paths closed (independent review, 2026-10-18)
- **Conversation names.** `conversation_counterpart_identities` returned the other participant's full
  name in any direct thread. In a CANDIDATE thread (one an employer opened from scouting or a demand
  interest) the candidate's name now comes back to the other side only with a working relationship or
  the candidate's live per-organization disclosure that includes `full_name`; otherwise the anonymous
  label. Every other thread (colleagues, own employer, buyer and provider, support, worker-initiated)
  keeps its names. Owner rule (2026-10-18): an employer may find, shortlist, make an offer and talk with
  a worker anonymously; starting a thread, sending a message or shortlisting never becomes consent.
- **Profile id.** The projection carries no profile id (it joins to public business records). Server
  flows use context-bound doors: `candidate_profile_for_contact_v1` (a worker shortlisted on, or
  interested in, the caller's own demand), `my_direct_conversations_with_workers_v1`,
  `employer_disclosure_granted_v1`.
- **Exact timestamps** are replaced by a week bucket; the synthetic-fixture flag reads name + headline
  inside SQL.

## Legitimate organization contexts kept
The relationship predicate also admits a delegated manager of the organization behind a company or
agency roster, and an accepted booking of the organization — contexts the old predicate only reached
through the discoverability branch for discoverable workers.

## Plan limit (with 20261018150000)
The discovery projection is two-tier once 20261018150000 is applied: the card tier (experience,
countries, availability, activity week) for search; the detail tier (pay, start date, engagement form,
work conditions) only after a counted view, or for an organization without a fixed limit. Profession,
skills and languages stay search data (`can_view_worker`). Apply order: 20261018160000, then
20261018150000 (it refuses to run first); roll back in reverse.

## Read sites (162 in apps/web, classified 2026-10-18)
OWNER 79 · ORG-LEGIT 47 · DISCOVERY 12 · WORK-JOURNAL 10 · ADMIN 10 · INTERNAL 4 · PUBLIC 0.
The 12 discovery sites move to the projection (person page, scouting Stage 1 + 2 + preferences, MCP
shortlist, contact-interested-worker, request-worker-conversation, pipeline facts, contact-request
states). The other 150 read own / related / admin / service rows and are unchanged. Bookings: an
ACCEPTED booking is a working relationship (the worker accepted the work), so the booking owner and the
organization's managers keep the row — including after the engagement ends — as work history (owner
rule: legitimate access to project history is preserved). Owner decision to confirm: whether an
accepted booking should stop counting after its end date.

Known residuals (documented, owner decisions): profession, skills and languages remain search data via
`can_view_worker`; each organization has its own free quota; a thread co-participant can read the other
participant's pseudonymous profile id (the existing messaging model) — it only links to a person's
public business record if that person also publishes one.

## Consent text
The shown consent text (`profile_discoverability` 2026-07-11.v2) never named the name; it points to
"the professional information clearly listed in the preview". The preview now lists exactly the
projection's fields and shows the anonymous label instead of the name, so the v2 grants stay valid
and nobody loses visibility. Optional, owner decision: a v3 wording that says it in so many words
(it would need a version bump and either re-consent or an explicit "v2 still valid" rule):

- lt — invisibleData: "Jūsų vardas, nuotrauka, telefono numeris, el. pašto adresas, nuorodos į kitus
  profilius, pilnas CV, tikslus adresas ir privatūs dokumentai nebus perduoti be atskiro jūsų
  patvirtinimo. Iki tol įmonės jus mato tik anonimiškai."
- en — "Your name, photo, phone number, email address, links to other profiles, full CV, exact address
  and private documents will not be shared without your separate confirmation. Until then companies
  see you only anonymously."
- ru — "Ваше имя, фото, номер телефона, адрес электронной почты, ссылки на другие профили, полное CV,
  точный адрес и личные документы не будут переданы без вашего отдельного подтверждения. До этого
  компании видят вас только анонимно."
- nl — "Uw naam, foto, telefoonnummer, e-mailadres, links naar andere profielen, volledige cv, exacte
  adres en privédocumenten worden niet gedeeld zonder uw afzonderlijke bevestiging. Tot dan zien
  bedrijven u alleen anoniem."
- de — "Ihr Name, Foto, Ihre Telefonnummer, E-Mail-Adresse, Links zu anderen Profilen, Ihr
  vollständiger Lebenslauf, Ihre genaue Adresse und private Dokumente werden ohne Ihre gesonderte
  Bestätigung nicht weitergegeben. Bis dahin sehen Unternehmen Sie nur anonym."
- pl — "Twoje imię i nazwisko, zdjęcie, numer telefonu, adres e-mail, linki do innych profili, pełne
  CV, dokładny adres i prywatne dokumenty nie będą udostępniane bez Twojego odrębnego potwierdzenia.
  Do tego czasu firmy widzą Cię tylko anonimowo."

## Regression tests
`lib/guards/worker-identity-split.test.ts` (database half + app half), `lib/guards/consent-ux-honesty.test.ts`
(the preview lists the projection, never a name), `lib/guards/person-page-name-consent.test.ts`
(the person page names a person only with a working relationship). The migration was exercised on a
local PostgreSQL 16 cluster with synthetic rows: an unrelated employer reads no row and gets the
projection without a name; a related employer keeps the row; a student enrolment does not open the
row; an ordinary account and an anonymous caller get nothing; the rollback restores the previous state.
