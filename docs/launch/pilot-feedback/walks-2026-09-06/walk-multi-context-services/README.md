# Walk — one identity, many contexts; the services loop (window 6, lane G)

Production build walked: `ca96605b` (2026-09-06, before the fixes on
`fix/cc/w6-multi-context-services`). Script: `../walk-multi-context-services-prod.cjs`
(`EXPECT_BUILD=<sha> node …`). Log: `walk-ca96605b-prefix.log`. Screenshots `01`–`12`.

Identities (bounded E2E, never real people): PERSON `e2e-spine-person-…` (personal
space only), COMPANY `e2e-walker-…` (owner of "E2E Walker UAB"; the SAME identity is
also a person). Controlled fixture: ONE offering "Buhalterijos paslaugos" by the PERSON,
ONE request by the COMPANY — both removed through the product (delete cascades the
request); the PERSON's `service_offering_requests_seen` row (no delete policy for the
user) swept with `execute_sql`; the walker's `seen_at` restored. Global counts after =
before (offerings 2, requests 1, seen 4). The `service_role` key holds no table grants
in production, so every readback in the script is the identity's OWN RLS-scoped view.

## Coexistence matrix (context × action)

| Context | Action | Result | Evidence |
|---|---|---|---|
| COMPANY | "siūlau buhalterijos paslaugas" | works → services door | log A2/A3 |
| COMPANY | "galiu kirpti plaukus" | works → "Jūsų teigimu: kirpti plaukus" + services door | log |
| COMPANY | "remontuoju automobilius" | **not understood** ("Nesu tikras, ar kažką siūlote…") — structurer gap (other lane) | log |
| COMPANY | "reikia santechniko" | works → the employer need form (headcount) — hiring, not buying | `02-company-sentences.png` |
| COMPANY | "reikia buhalterio paslaugų" | works → the employer need form (hiring path; the service-request door is not offered) — routing inconsistency vs "korepetitoriaus" | log |
| COMPANY | "reikia korepetitoriaus" | works → "Rasti paslaugą" (service-request door) | log |
| COMPANY | "ką man daryti toliau?" | works → the company queue (student invitation, booking reply, review queue) — no person ladder | log A5 |
| COMPANY | "ieškau darbo" | **leaks** — the person's job board is answered in the company context ("Skydelyje yra 5 viešų darbo skelbimų…", tu-form) while the side panel says "Šis rezultatas nepasiekiamas dabartiniame kontekste" | `02-company-sentences.png` |
| COMPANY | home panel "Artimiausias terminas" | **raw e-mail as label** `e2e-chat-student-…@labourmarket.ai — 2026-09-18` (G-H1) | `01-company-home-panel.png` |
| chip | company → personal → company | works; chip + greeting follow ("Veikiate „E2E Walker UAB“ vardu"); durable pointer restored; no second account | log B1–B6, `03`, `04` |
| PERSON (walker) | "ką man daryti toliau?" | works → the PERSON's ladder (3 iš 6) | `03-walker-personal-space.png` |
| PERSON (walker) | home panel | **context bleed** — the company's student invitation shows as the person's "nearest deadline" in the PERSONAL space (sent invitations are inviter-scoped, not workspace-scoped) | `03-walker-personal-space.png` |
| PERSON | /dashboard/services create + activate (390 px) | works, one tap to ACTIVE | `06-person-offering-active-390.png` |
| COMPANY | /dashboard/service-requests discover + request (390 px) | works; row carries no id/e-mail | `07`, `08` |
| PERSON | incoming request → accept (390 px) | works; requester by NAME ("E2E Walker") — note: the request made in the COMPANY context is attributed to the person, not the organisation (the request model has no org column) | `09`, `10` |
| COMPANY | readback of the answer | works: "Priimta · Atsakyta 2026-09-06 · Parašyti žinutę" | `11-company-accepted-390.png` |
| both | dead ends | none on the two pages (cross-links + connections bridge); the provider could not write a note with the decision; empty lists said only "nothing here"; on 390 px the requester name truncates behind the two buttons | `09` |

## Fixed on the branch (verified by guards; prod proof after merge with the same script)
- G-H1: `projectSentInvitationItem` never projects the e-mail; the work-context panel
  renders `Kvietimas (Laukiama) — 2026-09-18` for a label-less deadline.
- G-E1: bounded discovery (`limit 100`) + country (exact, server) / category (in-memory) filter.
- Provider response note (the RPC's `p_note`, previously unreachable from the screen).
- Honest empty states (why + next real step; no notification promise); provider inbox
  empty state derived from the caller's own active-offering count; 390 px stacking.
