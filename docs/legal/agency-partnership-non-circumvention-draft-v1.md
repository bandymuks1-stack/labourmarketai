# Agency cooperation: non-circumvention and disputes (DRAFT)

> **DRAFT FOR THE OWNER AND A LAWYER. NOT PRODUCT TEXT.**
> Nothing here is shown to users, accepted by users, or enforced by the platform. No product legal
> text, consent copy or terms of service are changed by this document. The platform calculates no
> penalty and no damages. Every clause below needs legal review before any use.

Status: draft v1, 2026-11-19. Context: register 4.30, agency-to-agency cooperation (PR #3353,
migration `20261118100000_agency_partnerships_commissions_v1`, not applied). Follows decision 0033
(proposed in its own PR):
- the client deals only with its direct partner;
- each party answers to its own direct customer for its own obligations and for the partners it uses;
- the other chain members' identities and commercial terms are not disclosed, except where the law
  requires it;
- the whole chain is kept for internal audit.

## 1. The parties and what each sees

| Party | Role in a cooperation | Sees |
|---|---|---|
| Client (employer) | shares its own need with its own agency | only its own agency (the **lead**), which presents every candidate and answers for it. Never the partner's name or id, on any surface. |
| Lead agency | the client's agency; passes the need to a partner | its client, its partner, and its partner's candidates by status (no worker identity before a booking) |
| Partner agency | offers a worker from its own roster on the passed need | the lead and the need (title, role, country). Never the client's identity. |
| Worker | the candidate | the client once a booking is proposed. The worker is **not** a party to these terms. |

Both rules are enforced in the database, not only in the interface (the client's row names the lead
as the agency of record; the partner reads only definer functions without client columns).

## 2. Responsibility along the chain (draft, decision 0033)

- **R1. The lead answers to the client.** The lead presents the candidate to the client. Toward the
  client, the lead is responsible for every candidate it presents, including a candidate its partner
  supplied, and for the partner it chose to use. That covers the candidate's suitability and
  qualifications, and the correctness of the results of any checks presented, including document
  checks. The client's contract is with the lead only.
- **R2. The partner answers to the lead.** The partner is responsible to the lead for its own actions
  and for the data it supplied: the worker's identity, availability, qualifications and the checks
  it performed or relied on. The partner has no contract with the client and makes no promise to it.
- **R3. Each agency answers for its own actions.** Every agency in the chain is responsible for what
  it did and for the data it submitted. The lead's responsibility to the client does not remove the
  partner's responsibility to the lead (recourse).
- **R4. Disclosure.** The client is told which agency is directly responsible: the lead. The partner's
  identity and the commercial split are not disclosed to the client, except where the law requires it.
  Lawyer: list the cases, see Q9.
- **R5. Internal audit.** Each partner offer is recorded with its chain as the platform knows it:
  - source and submitter: the partner;
  - presenter to the client: the lead;
  - intermediaries: none in v1;
  - agency verification: not recorded in the platform.

  The record is `audit_logs`, action `agency_partner_candidate_offered`, which only an admin can read.
  Document checks recorded in the platform are the platform's own (`worker_documents.verified_by`).
  An agency's off-platform checks are not recorded, and the duty to have done them follows R1–R3.

## 3. Minimal mutual terms (draft, for the lawyer)

These are the smallest set the owner principles call for. They bind **companies only**.

- **T1. Protection period.** 12 months from the **last documented** candidate presentation or
  cooperation act between the parties concerned (see §4 for what is documented).
- **T2. Client ↔ partner.** During the protection period the client does not engage the partner
  agency directly for a worker the partner presented through the lead. The partner does not
  approach that client directly for that need, or for that worker's placement with that client.
- **T3. Partner ↔ client through the lead.** The protection also runs the other way: the partner
  does not use a need passed by the lead to reach the lead's client around the lead. The lead does
  not take over a worker the partner presented in order to cut the partner out of a placement.
- **T4. The worker stays free.** Nothing restricts the worker's choice to accept, refuse or change
  work, or to apply anywhere on their own. A worker's own independent application is not
  circumvention by any company.
- **T5. Prior relationships.** A relationship that is documented as existing before the
  introduction is not covered.
- **T6. Consequence.** Contractual and agreed between the companies, for example the commission the
  bypassed party would have received under the term in force. **The platform computes nothing,
  charges nothing and asserts no breach.** It only keeps the dated records.
- **T7. Where the terms live.** In a separate written agreement between the companies, or in
  partnership terms reviewed by the lawyer. They are not in the current product text.

## 4. What the platform already records, and whether it is enough

The "last documented act" can be read from existing timestamps, without new columns:

| Act | Record (table.column) |
|---|---|
| partnership invited / answered / ended | `agency_partnerships.created_at`, `decided_at`, `ended_at` |
| need passed to the partner / taken back | `agency_partner_request_shares.created_at`, `revoked_at` |
| candidate presented (and re-affirmed) | `agency_candidate_offers.created_at`, `updated_at` (with `partner_share_id` naming the pass) |
| client's decision | `agency_candidate_offers.decided_at` |
| offer withdrawn | `agency_candidate_offers.withdrawn_at` |
| booking proposed / answered | `booking_requests.created_at`, `booking_request_events.created_at` |
| placement started | `company_worker_engagements.started_at` |
| term accepted | `agency_candidate_offers.placement_term_accepted_at`, `audit_logs` (`agency_placement_term_accepted`) |

**Assessment: enough for v1, with no new column.** The last act for a (client, partner) pair is the
latest of these dates across offers made through that partner's passes on that client's shares.
Three gaps go to the owner and the lawyer:

1. **Retention.** These rows cascade when a company is deleted, and erasure clears the actor
   columns (dates stay). A 12-month protection plus a limitation period may need a longer
   retention, or a frozen export, than `docs/legal/data-retention-matrix-v1.md` sets today.
2. **Contacts outside the platform** (calls, e-mails) are not recorded. That is by design.
3. **No reader exists** that shows "protection until …" to anyone. Adding one is a product decision,
   not part of v1.

## 5. Questions for the lawyer

1. **Competition law.** Agencies are competitors. Is a mutual non-solicitation between a lead and a
   partner a permissible ancillary restraint (TFEU Art. 101; Lithuanian Law on Competition), or
   does it read as a no-poach or market-sharing agreement? Does narrowing it to the specific need,
   client and worker presented keep it ancillary?
2. **The worker's free choice of work.** Does any clause indirectly limit a worker's freedom to choose
   work (Constitution of Lithuania Art. 48; EU Charter Art. 15; Labour Code rules on non-compete
   and on fees charged to job seekers)? Can a client be restricted from hiring a worker directly,
   or only from bypassing the fee?
3. **Proportionality.** Is 12 months proportionate for temporary-work and placement intermediation?
   Should it be shorter for a candidate who was presented but not placed?
4. **Consequence.** Is a fixed commission-equivalent a penalty that a court may reduce (Civil Code
   Art. 6.258)? Should it be framed as compensation for loss?
5. **Form.** Must the terms be a signed agreement between the companies? Is clicking to accept a
   partnership on the platform enough, and in which jurisdictions?
6. **Evidence and data protection.** Can the platform's dated records serve as evidence? What is the
   lawful basis and retention for keeping them past the end of a partnership (GDPR Art. 6(1)(f),
   Art. 17(3)(e))?
7. **Cross-border.** Which law and court apply when the client, lead and partner are in different
   countries?
8. **Temporary-work rules.** Does a placement through two agencies change who is the temporary-work
   agency of record toward the worker or the user undertaking?
9. **Disclosure the law requires.** When must the partner's identity be disclosed to the client or
   the worker despite R4? Consider temporary-agency-work rules, licensing or registration of
   intermediaries, data-protection transparency (GDPR Art. 13/14: who obtained the worker's data),
   and public procurement.
10. **R1 limits.** Can the lead limit its responsibility to the client for a partner's checks, for
    example by relying on written assurances from the partner? Is recourse against the partner (R3)
    enough without a written back-to-back agreement?

## 6. Disputes and corrections

- **v1: outside the platform.** A disagreement about a commission, a placement or a term is settled
  between the companies. The platform keeps its records as they are.
- **Historical data is never changed.** No offer, term, decision, booking or commission reading is
  edited or back-dated to settle a dispute.
- **Future path, documented only and not built:** a correction becomes a separate, append-only,
  audited record. It names:
  - the object it corrects (offer or commission reading);
  - the reason;
  - who proposed it and who confirmed it (both companies);
  - when.

  Readers would show the original and the correction side by side, and the original stays
  readable. This follows the platform rule that a confirmed fact is never overwritten.

## 7. Unchanged by owner decision

- The **14-day** validity of a partnership invitation.
- The **commission model**:
  - direct, 100 % of the agency's term;
  - lead, 100 % minus the partner's share of the lead's term;
  - partner, its share of the lead's term;
  - due only on an actual placement.
