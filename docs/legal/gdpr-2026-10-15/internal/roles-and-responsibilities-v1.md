# Roles and responsibilities — controller, processor and joint-controller analysis, v1

**Status.** DRAFT v1, 2026-10-15. **Requires lawyer review.** The roles below are working
positions. None of them is a legal conclusion.

**Scope.** GDPR Art. 4(7)/(8), 24, 26, 28 and 29; EDPB Guidelines 07/2020 on the concepts of
controller and processor.

**Sources.**
- `corporate-identity-source-of-truth-v1.md`
- `entity-role-and-data-access-matrix-v1.md`
- intercompany licence §5 (as referenced in those documents)
- audit A3 §3, §4, §7
- audit A2 D4
- audit A1 §3.3
- `legal-basis-matrix-v1.md`
- `apps/web/lib/commercial/handoff-dispatch.ts`
- `docs/DECISIONS/0020-…` (as cited in A3)

> **LT santrauka.** Šiame dokumente aprašyta, kas kokį vaidmenį atlieka tvarkant duomenis.
>
> - **UAB „Nonstop Group“** yra platformos operatorius ir duomenų valdytojas.
> - **Labour Market AI Sp. z o.o.** yra tik intelektinės nuosavybės licenciaras. Ji neturi prieigos prie duomenų ir nėra nei valdytoja, nei tvarkytoja.
> - **Organizacijos** (darbdaviai, agentūros) yra valdytojos savo darbuotojų įrašų: įkeltos istorijos, darbo laiko, nebuvimų. Šiems įrašams platforma veikia kaip tvarkytoja, tačiau DPA (BDAR 28 str. sutarties) kol kas nėra. Kai platforma tuos įrašus susieja ir iš jų daro išvadas, ji yra savarankiška valdytoja. Ar dėl bendrų įrodymų įrašų esama bendro valdymo (26 str.), turi nuspręsti teisininkas.
> - **Darbdavys, prijungęs AI asistentą,** yra valdytojas to duomenų perdavimo savo AI tiekėjui.
> - **Nonstop Group** turi dvigubą vaidmenį: ji yra ir platformos valdytoja, ir įdarbinimo verslas, gaunantis darbuotojų perdavimus. Tai naujas tikslas tame pačiame juridiniame asmenyje, todėl reikia sutikimo ir skaidrios informacijos.
>
> Dokumento pabaigoje pateikta lentelė, kas atsako į kokius prašymus.

## 1. Parties

| Party | Legal facts | Working GDPR role |
|---|---|---|
| **UAB „Nonstop Group“** (LT, 302676973) | Platform operator, seller, contracting party, invoice issuer and IP licensee (owner-directed role, `corporate-identity-source-of-truth-v1.md` §2–3). | **Controller** of the platform's own processing (§2). **Processor** for organisation records (§3). **Controller in a second business** — staffing (§6). |
| **Labour Market AI Sp. z o.o.** (PL, KRS 0001218752) | IP owner and licensor (§1). Holds no Supabase role, no service key and no admin account (`entity-role-and-data-access-matrix-v1.md`). | **Neither controller nor processor.** If it ever needs access, the licence §5 gate applies first: role determination, an Art. 28 DPA, least privilege, an access audit, a privacy-policy update and a security assessment. |
| **Organisations using the platform** — employers, agencies, schools and project owners | Customers of UAB „Nonstop Group“. Platform Terms currently contain no data-protection clause and no DPA (G-14). | Depends on the activity (§3–§5). |
| **Individual users** — workers, managers, learners, providers | Account holders. | Data subjects. A manager or confirmer acts *for* their organisation (§4). |
| **Processors** | See `processor-and-transfer-register-v3.md`. | Processors or sub-processors of UAB „Nonstop Group“. |

## 2. UAB „Nonstop Group“ as controller

UAB „Nonstop Group“ decides the purposes and means of the following:

- accounts and authentication;
- the worker profile and Living CV, including inference (decision 0023);
- the work journal as the worker's own record;
- discovery and disclosure consent;
- auto-match and ranking;
- job alerts;
- messaging and translation;
- the in-product assistant and its transcripts;
- the MCP connector as a product door;
- telemetry;
- vacancy ingestion;
- company-need intake and owner alerts;
- billing;
- the consent and disclosure ledgers;
- data-subject requests;
- security logs;
- backups.

It also decides the **linking** of organisation-supplied records to accounts, and every
**platform-derived** signal computed from those records, such as competency signals and link
proposals.

**Consequence.** For all of these processing operations UAB „Nonstop Group“ answers data-subject
requests, carries the Art. 13 and 14 duties, and is the party a breach notification would come
from.

## 3. Organisations: controller for their own records, with the platform as processor

| Organisation activity | Who decides purpose and means | Working role of the organisation | Working role of the platform | Contract needed |
|---|---|---|---|---|
| Uploading or importing staff and ex-staff **work history** (`organization_people`, `organization_evidence_records`). 41 of 43 people have no account. | The organisation decides to record its people's past work. The platform designed the means. | **Controller** of its own records. It needs its own legal basis and owes the Art. 14 notice for data it supplies. | **Processor** for storing and displaying the organisation's records. **Independent controller** for linking, claim proposals and inference. | **Art. 28 DPA** in the organisation Terms, plus an import attestation (legal basis, notice given). **Neither exists** (G-05). |
| Roster, projects, assignments, timesheets, work-hour allocations, absences (including reasons), work plans, OHS acknowledgements, training, performance reviews | The organisation (employer duties). | **Controller.** These are its employment records. For a health-related absence reason it needs an Art. 9(2)(b) condition. | **Processor.** | Art. 28 DPA (missing). |
| Viewing discoverable profiles or receiving a disclosure | The organisation, for its own recruiting. | **Independent controller** of what it sees or receives. | Controller of the disclosure (consent basis). | Terms clause on recipients' duties (missing). |
| Running a booking or engagement | Both sides, for their own contract. | **Independent controller** of its copy. | Controller of the platform record. | Terms. |

**Joint controllership (Art. 26) — open question [LAWYER].** Organisation evidence about a person
does three things at once:

- it is attested by the organisation;
- it is shown to managers of **party organisations** named on the record
  (`20260907114500_…import_v1.sql:734-751`);
- it feeds that person's Living CV once claimed.

That combination is arguably a **jointly determined purpose**: making verified work history
portable. If the lawyer finds joint control, an Art. 26 arrangement must allocate:

- who gives the Art. 14 notice;
- who answers requests;
- the essence of the arrangement, made available to the data subjects.

Recommended working position until the lawyer decides:

- the platform is **processor** for the organisation's own record;
- the platform is **independent controller** for cross-organisation display and the Living CV use;
- if the regulator or lawyer finds joint controllership, it is accepted and documented.

## 4. Managers confirming entries, and second-party confirmations

**A confirmation is personal data of both people.** When a manager confirms or attests a worker's
journal entry or evidence record:

- the worker is the subject of the fact;
- the confirmer's identity and act are personal data of the confirmer.

**Who is responsible for the confirmation.** The confirmer acts **for their organisation**, which
is controller of the attestation as an organisational record. The platform processes the
confirmation as controller for the worker's evidence value, on Art. 6(1)(f) grounds — the worker's
interest in verifiable history.

**Requests from the confirmer.**
- Access and rectification: the platform answers.
- Erasure: the confirmation is kept RETAIN-pseudonymised (labelled "verifier erased"). The basis
  is the worker's legitimate interest, Art. 17(3) [LAWYER]. The confirmer must be told this.
  Today it is undisclosed (G-32).

**Requests from the worker.**
- The worker cannot dispute a confirmation; they can only add a correction (G-32).
- The worker can contest organisation evidence once their account is linked (`dispute-actions.ts`).

**Auto-confirmation.** `apply_learning_auto_confirmation` writes a confirmation under an
organisation policy. The organisation is controller of that policy and its outcome, so the worker
must be told (DPIA S10).

## 5. Employers connecting AI assistants (MCP)

**Facts.**
- An employer or manager authorises ChatGPT, Claude or another assistant through OAuth.
- Tools then return what that employer may read: candidates, roster, absence review, the journal
  review queue, shortlists and imported people (A2 D4).
- The data leaves the platform for the AI provider, which is in the US.

**Working analysis [LAWYER].**
- **The employer** decides to send the data it lawfully holds to its own AI tool. It is the
  **controller of that onward transfer**. The AI provider is the employer's processor, or an
  independent controller under the provider's consumer terms. The employer carries Art. 28, Art. 44
  and Art. 9 duties for that use.
- **The platform** remains controller of the MCP door and the access grant. It must:
  - **limit** what the door returns: no absence reasons or journal free text by default (DPIA S11);
  - **bind** employers contractually, with a Terms clause warranting a DPA and transfer mechanism
    with their AI provider (DPIA S12);
  - **inform workers** that organisations may operate the platform through AI assistants
    (DPIA S13).
- **The worker** did not choose this recipient. Register v2 said otherwise; v3 corrects it.

## 6. Nonstop Group's dual role — staffing recipient of worker hand-offs

**Facts.**
- `commercial_handoffs` (2 rows) carry a worker's expressed vacancy interest. The envelope holds
  pseudonymous refs, profession, skills, languages, availability and country, plus the vacancy,
  the employer and the consent version.
- The dispatcher sends it to Nonstop's receiving door at `nonstopgroup.eu`
  (`handoff-dispatch.ts:13-44`). Dispatch is inert unless the endpoint and token env are set; the
  production state is not evidenced.
- A related consent purpose, `partner_supply_representation`, has 3 grants and 1 withdrawal.

**Analysis.**
- The sender and the receiver are **the same legal entity**, so there is no third-party disclosure.
- There is, however, a **new purpose**: offering the worker staffing services. That purpose differs
  from operating a neutral platform.
- Under Art. 5(1)(b) and 6(4), the new purpose rests on **consent** (`proposition_consent` /
  `partner_supply_representation`). It also needs:
  - **transparency** — the privacy policy must name this purpose and the staffing business (G-11);
  - **internal separation** — staffing staff must not gain platform-wide access through the hand-off;
    they receive only the consented envelope;
  - **the staffing business's own privacy notice**, covering what it does after receipt
    (not evidenced).
- **Conflict-of-interest risk.** The platform operator also competes as a staffing provider for the
  same vacancies. The neutrality of ranking (DPIA K2) should be documented: auto-match and ranking
  do not favour hand-off candidates [VERIFY].

**Requests.**
- The platform answers for the platform copy.
- The staffing operation answers for data it holds after a hand-off.
- Both sit in the same controller. One request covers both, so a reply must cover both copies.

## 7. Who answers which request

| Request about … | First recipient | Who decides and executes | Notes |
|---|---|---|---|
| Own account, profile, Living CV, journal, messages, transcripts, telemetry, AI logs, consent | UAB „Nonstop Group“ (in-app or info@labourmarket.ai) | UAB „Nonstop Group“ | `data-subject-request-procedure-v1.md` |
| An organisation's record about the person (imported history, timesheets, absences, reviews) | Whoever receives it | **The organisation (controller).** The platform assists as processor and forwards within 1 week. | The person is told who the controller is. Platform-derived signals are handled by the platform directly. |
| Data an employer received through discovery or disclosure, or holds in its own systems | The employer | The employer (independent controller) | The platform tells the person who received data (Art. 15(1)(c), 19). |
| Data an employer passed to its AI assistant | The employer | The employer | The platform can say which tools the employer's assistant may call. |
| Worker hand-off data at the staffing business | UAB „Nonstop Group“ | UAB „Nonstop Group“ (same controller) | Covers both copies. |
| Vacancy contact person in an advert | UAB „Nonstop Group“ | UAB „Nonstop Group“ (controller of its stored copy). The source agency handles its own copy. | Redact the stored description. |
| B2B contact in an intake or owner alert | UAB „Nonstop Group“ | UAB „Nonstop Group“ | Telegram and Agentai OS copies are deleted manually. |
| Confirmer's own data on a confirmation | UAB „Nonstop Group“ | UAB „Nonstop Group“, with notice to the organisation | RETAIN-pseudonymised by default [LAWYER]. |
| Anything addressed to Labour Market AI Sp. z o.o. | Forward to UAB „Nonstop Group“ | UAB „Nonstop Group“ | The licensor has no data. |
| Payment data at Stripe | UAB „Nonstop Group“ for the platform copy | Stripe for its own controller processing | — |

## 8. Contracts to put in place

These are open items for the owner and the lawyer.

1. **Organisation Terms with an Art. 28 DPA annex.**
   - Covers the processor role for organisation records.
   - Includes an import attestation: legal basis, and Art. 14 notice given or Art. 14(5) ground.
   - Includes duties for AI-assistant use.
   - Includes the recipient duties for disclosed candidates.
2. **Art. 26 arrangement**, if the lawyer finds joint controllership for shared evidence.
3. **Internal record of the staffing purpose**, including the access separation.
4. **Licence §5** — confirm it still states "no access", which is unchanged.
5. **Processor DPAs** — see register v3 §E.
