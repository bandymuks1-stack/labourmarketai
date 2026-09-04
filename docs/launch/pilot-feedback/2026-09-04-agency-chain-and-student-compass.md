# Agency chain by sentence + student compass in the chat (2026-09-04)

> Owner Master Execution Contract §10 (agency chain) and §15 (student).
> Three bounded E2E identities on production: the agency `e2e-timing`
> ("E2E Agentūra UAB (testinis subjektas)"), the client `e2e-walker`
> ("E2E Walker UAB"), the worker `e2e-worker2`; the student `e2e-learner`
> (active student of E2E Walker UAB). Never the real user.

## Agency: the full chain, driven by sentences (prod `71f93e11`)

Prerequisites created through the SAME canonical RPCs the pages call (client
accepts + shares; worker accepts the roster invite); the agency's steps are
sentences in the browser.

| Step | Actor | Observed |
|---|---|---|
| "noriu pakviesti klientą e2e-walker-…" | agency (chat) | e-mail rode the sentence → form → "Pakvietimas sukurtas ir laukia kliento patvirtinimo…" — connection `ede90e9e` pending |
| "pakviesk kandidatą e2e-worker2-…" | agency (chat) | "Kvietimas įrašytas. Laiškas nesiunčiamas — …" — roster invitation pending |
| accept connection | client (RPC `accept_agency_client_connection_v1`) | `accepted` |
| "reikia 2 suvirintojų Vilniuje" | client (chat) | demand `b0a48f65` "Suvirintojas" submitted |
| share request | client (RPC `share_request_with_agency_v1`) | share `94bbd63c` active |
| accept roster invite | worker (RPC `accept_company_worker_invitation`) | `linked` |
| greeting | agency | starters **Klientų poreikiai · Reikia darbuotojų · Projektai** (the agency track's next step moved from "invite client" to "client needs" by itself) |
| "parodyk klientų poreikius" | agency (chat) | "Klientų pasidalinti poreikiai: • Suvirintojas" |
| "pasiūlyk kandidatą" | agency (chat) | the ONE shared need picked → form with the real roster ("E2E Worker Two") → "Pasiūlymas įrašytas — klientas jį matys prie savo poreikio ir galės priimti arba atmesti." — offer `f93735c6` status `offered` |
| "kaip sekasi mano pasiūlymams" | agency (chat) | "Jūsų pasiūlymų būsena:" + the row |
| telemetry (agency profile) | | `chat_intent_recognized:client-demand` → `chat_intent_recognized:propose-candidate` → `chat_missing_data_asked:agency.propose-candidate` → `chat_action_attempted` → `chat_action_persisted` → `first_real_action:offer_candidate` → `chat_intent_recognized:proposal-status` |

**Defect found and fixed by this walk (#1473):** before the fix, "pasiūlyk
kandidatą" answered "no client shared a need yet" although the share
existed — the chat adapter filtered shared rows on `status === "active"`, a
value a REQUEST never carries (the share and the connection are already
active inside the RPC). Every shared need had been invisible to the chat
since #1466. Now only `closed` requests are excluded.

Still open: the client's decision by sentence (accept / decline the offer
lives on the client's scouting page; chips exist), and e-mail delivery of
invitations (owner gate).

## Student: the compass answered in the chat (prod `71f93e11`, #1472)

| Step | Observed |
|---|---|
| greeting (linked learner) | learner line present; starters **Mokymosi kompasas · Ieškau darbo · Užfiksuoti darbą** (+ the personal-space profile step) |
| "ką man mokytis?" | one answer with the five parts — becoming · evidence · fits now · missing · next — and the next steps as chat actions ("Pasirinkite darbo kryptį — be jos atranka neveikia.", "Pridėkite įgūdžius, kuriuos jau turite (arba įkelkite CV).") + **Visas kompasas** chip |
| never | the worker fallback; a route-only answer |

Screenshots: `walk-agency-proposal/74-…77-*.png`, `walk-compass/60-compass-answer.png`
(session scratchpad).

## Student: "kur galiu atlikti praktiką?" (prod `287b6fb0`, #1477 → #1479 → follow-up)

**What the first walk found (build `d141ddc2`, #1477 live):** the E2E learner
(`e2e-learner-202609021634@labourmarket.ai`, personal space, LT) typed
*"kur galiu atlikti praktiką?"* and got the **whole board** — every employment
demand as if it were a practice placement. Cause: the World State vocabulary
listed only the opportunity types PRESENT on the board, and no verified
company had declared an internship, so the word was simply unknown.

**Fix (#1479):** the closed `OPPORTUNITY_TYPES` set is always in the
vocabulary, each term `available` only when a demand of that type is visible
to the person — the same rule countries already follow.

**Walk on `287b6fb0` (`walk-internship-prod.cjs`, 32.5 s):**

| Check | Result |
|---|---|
| plain "ieškau darbo" opens the board | yes (20 public ads panel) |
| "kur galiu atlikti praktiką?" understood as an internship question | **yes** — "Supratau „praktika“, bet ten dabar tau nieko nematoma. Matoma: …" |
| whole board leaked under the internship question | **no** (`kind: "answer"` returns before the search) |
| generic fallback | no |

**Second defect found by the same walk:** the "Matoma:" list after an absent
opportunity type named **countries** ("LT, NL"), because the alternatives
were always `facets.countries`. Fixed on `fix/cc/absent-type-alternatives`
(`df4a17b1`): the alternatives come from the SAME dimension the person named
(visible opportunity types, labelled in their own language first; countries
only for an absent country); none on that dimension → the plain "nothing
visible" answer.

**Positive proof still owed:** a board that actually carries an
`internship` demand visible to the learner (the E2E client can declare one
by sentence — `opportunityType` select on the demand form) and the narrowed
result. Not run today: the walk deliberately did not create demand rows on
the shared verified company.
