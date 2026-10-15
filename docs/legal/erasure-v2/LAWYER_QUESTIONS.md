# Questions for the lawyer: account erasure (GDPR Art. 17), labourmarket.ai

Context: when a person asks for their account to be deleted, the platform will **erase** their own
content, **pseudonymise** their part in other people's records (the link is removed, names and ids
scrubbed), and **retain, detached** a small set of records under a legal hold. The design is
`DESIGN.md`, which has a per-table list. Each answer below changes one row class in the
`privacy_erasure_relations` registry (DELETE / PSEUDONYMISE / RETAIN). Production volumes are small today
(e.g. 40 consent-ledger rows, 0 disclosure rows, 155 journal entries of which 42 are employer-confirmed),
so a decision costs little now.

1. **Proof of consent: Art. 7(1) + Art. 17(3)(b)/(e).** May we keep the append-only consent ledger
   (`privacy_consent_events`: purpose, action, consent text version + hash, time; identity removed, grouped
   only by a random per-erasure id) and the disclosure ledger (`personal_data_disclosures`: which data
   categories went to which organization, when, under which consent event) for **6 years after erasure**?
   Is the basis Art. 17(3)(b) (legal obligation) or 17(3)(e) (establishment, exercise or defence of legal
   claims)? Is 6 years the right period? Should the invitation-acceptance record (which review notice
   version the person accepted) be kept on the same basis?

2. **Employer-confirmed work evidence: retention period.** A journal entry that an employer confirmed, a
   timesheet, work-hour allocations, absence facts (reason text removed) and training/safety acknowledgements
   are kept with the person's link removed. Which basis applies: the employer's labour-law duty
   (working-time records, Lithuanian Labour Code / DSS rules) or legal claims, and **for how many years**:
   the Package A recommendation of 6 years after the engagement ends, or 10? Does keeping the confirmed
   entry's **original free text** (the person's own words describing the work) go beyond what that basis
   allows, so that we should keep only date, hours, quantities and the confirmation?

3. **Accounting and tax: Lithuanian law.** For billing customers, checkout operations, subscriptions and
   usage-cost ledgers (with personal session/workspace fields removed), and the future credit ledger, please
   confirm the statutory retention under the Lithuanian Law on Accounting (Buhalterinės apskaitos įstatymas,
   our reading: 10 years) and tax law. Please also say whether a Polish-law period applies instead or in
   addition, given that the contracting entity under the Legal Notice is Polish. Does an **active
   subscription or open balance** justify refusing or postponing erasure (we treat it as a blocker), or
   must we erase and keep only the invoice data?

4. **Controller or processor for employer-held records.** Organizations keep records about the person on
   the platform: roster entries imported from their own history, documents, HR requests, performance
   reviews, contract copies, work permits. For these, is the organization the **controller** and we the
   **processor**? If so, should we (a) forward the Art. 17 request to the organization and leave its
   records alone, or (b) pseudonymise them, as the design now does (unlink, replace the name with "Erased
   person")? Does the answer differ for records the organization imported **before** the person ever had an
   account (41 of 43 roster people are unclaimed today)?

5. **Messages in other people's threads.** In a conversation with another participant, the design keeps
   the message slot (time, thread position), removes the author and **replaces the text with an empty
   body**. The other party keeps their own messages. Is that enough for Art. 17? Or does the other party
   have a legitimate interest (Art. 17(3)(e), or their own Art. 15 right) in keeping the erased person's
   words when a dispute is open or reasonably foreseeable? If so, what counts as a "legal hold" trigger we
   can record, and for how long?

6. **Backups: what we must disclose.** Database backups / point-in-time recovery (Supabase-managed) keep
   pre-erasure data until they rotate out. We cannot edit them. Is it enough to state in the completion note
   and the privacy policy that "backups expire within the provider's retention window and are never
   restored into production without re-applying erasures"? Do we need a documented re-erasure-after-restore
   procedure? Do we have to name the exact window?

7. **Audit logs and AI run logs.** We keep `audit_logs` (who did what to which record) with the person's id
   removed from the actor and payload, and `ai_runs` rows with output excerpt and request context deleted.
   We do this for accountability (Art. 5(2), 24) and AI-system logging. Is pseudonymised retention
   acceptable here? For how long: 6 years as for the consent ledger, or shorter (e.g. 12–24 months)? Is a
   pseudonymised log row still "personal data" for us under Recital 26, given that we also keep a pre-erasure
   backup for a limited time?

8. **One-month deadline (Art. 12(3)) while blockers exist.** Erasure waits until a human resolves blockers:
   the person is the last owner of an organization, an employment engagement or roster link is still
   active, a timesheet is undecided, a subscription is active. If this cannot be done within one month, may
   we use the two-month extension, and which reasons count as "complexity"? Must we erase everything that is
   **not** blocked within the month (partial erasure first, the rest later), or may we run it as one
   transaction once the blockers clear? What must the interim notice to the person say?
