# Organisation Data Terms — LabourMarket.ai

*For companies, agencies, schools and other organisations that record, upload or manage data about people on the platform. Includes data processing terms under GDPR Art. 28.*

> **Status:** DRAFT v2 — 2026-10-15
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Draft for lawyer review. Not final, not legally valid yet, not certified.
>
> **Source facts used:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §2 (REASSIGN / RETAIN treatments for organisation records), §3.2 (append-only and hash-chained tables), §3.3 (working view: supplying organisation is controller of its records, platform processor for that copy and controller for the matching and linking it adds; evidence `organization_person_id` NO ACTION; staging rows survive)
> - `03-rights-consent-legal-pages.md` §3, §4, §7 (no controller designation, no DPA, no import attestation; readable by importing and party organisations; append-only corrections, one per record; subject contest when linked; dual role of Nonstop Group)
> - `02-processors-transfers-cookies-ai.md` §1 row 14 and D4 (MCP assistants connected by employers receive workers' data); §4 (auto-match, ranking, `apply_learning_auto_confirmation`)
> - `docs/legal/legal-basis-matrix-v1.md` (relationship-based visibility); `entity-role-and-data-access-matrix-v1.md`; `subprocessor-register-v2.md`
>
> **Open decisions:**
> 1. [OPEN DECISION / LAWYER: role per activity — table §2. The facts do not settle it]
> 2. [OWNER DECISION: add an import attestation step (lawful basis + Art. 14 notice confirmed) before an organisation can import people's data. None exists today]
> 3. [OWNER DECISION: erasure and redaction path for append-only, hash-chained evidence records; order of deletion (evidence before roster person)]
> 4. [OWNER DECISION: subprocessor change notice period (§7.6)]
> 5. [OWNER DECISION: breach notification deadline to organisations (§7.8)]
> 6. [OWNER DECISION: end-of-contract export format and deletion period (§7.10)]
> 7. [OWNER DECISION: deadline for organisations to answer a dispute or a forwarded request]
> 8. [LAWYER: liability and indemnity (§9)]
> 9. [OWNER/LAWYER: whether organisations may connect external AI assistants with access to workers' absence and journal content, or whether those tools are restricted (audit D4)]
> 10. [OWNER/LAWYER: how these terms are accepted (click-through at organisation creation or import, or signed DPA) — none is recorded today]
> 11. [OWNER/LAWYER: Art. 9(2)(b) basis and minimisation for absence-reason text kept by employers]

---

## 1. Who these terms are for

- These terms apply to any organisation (company, staffing agency, school or other body) that uses the LabourMarket.ai platform to:
  - record, import or upload data about people: staff, former staff, workers, candidates, learners, clients' contact persons;
  - manage people's work through projects, rosters, bookings, timesheets, absences, journal reviews and confirmations.
- The platform is operated by **UAB „Nonstop Group“** (company code 302676973, Lithuania), called "we" here. The organisation is "you".
- These terms add to the Terms of Service and the Privacy Policy. If they conflict on personal data, these terms prevail for organisation activity.

## 2. Who is responsible for what

The table shows our working view. **Where it says OPEN DECISION, the role is not settled yet.** [LAWYER: confirm each row. Consider joint controllership under Art. 26 where both parties decide purposes.]

| Activity | Your role | Our role | Status |
|---|---|---|---|
| Your own records about people: rosters, imported work history, evidence records, project and work records, documents you upload | **Controller** | **Processor** (we host and process them on your instructions, §7) | OPEN DECISION — working view in audit 01 §3.3 |
| Working-time, timesheet, absence and work-plan records of your staff | **Controller** (employer duties) | **Processor** | OPEN DECISION |
| Reviewing and confirming a worker's journal entries; confirmation rules that confirm skills automatically | **Controller** of your confirmation | **Controller** of the worker's own journal | OPEN DECISION — the record is about two people |
| Linking a roster person to a platform account; deriving skill signals from your records | — | **Controller** (our own purpose) | OPEN DECISION: or joint (Art. 26) |
| Matching and ranking workers for your published needs | **Controller** of your selection decisions | **Controller** of the matching service | OPEN DECISION: or joint (Art. 26) |
| Data a worker discloses to you with consent (contacts, CV) | **Independent controller** once received | **Controller** up to the transfer | working view in `legal-basis-matrix-v1.md` |
| Connecting your own AI assistant (ChatGPT, Claude) to the platform | **Controller**: you choose to send data to that provider | we provide access within your users' permissions | OPEN DECISION — audit D4 |
| Billing for your plan | customer | **Controller** | settled |

Within UAB „Nonstop Group“, the staffing business is separate from the platform operation. It receives platform data only when a worker asks for that (Privacy Policy, purpose 7).

## 3. Your duties as controller

When you record or upload data about people, you must do the following.

1. **Have a lawful basis** (GDPR Art. 6) for each record. If any special-category data is involved (for example health information in an absence reason), you also need an Art. 9 condition, such as employment law under Art. 9(2)(b). [LAWYER]
2. **Inform the people** (Arts 13 and 14). Tell them that their data is on the platform, why, and how to use their rights, at the latest within one month (Art. 14(3)).
   - You may point them to our **"Notice for people without an account"** for the platform's part.
   - That notice does not replace your own notice. [OWNER DECISION: whether we provide a ready template]
3. **Keep it minimal** (Art. 5(1)(c)):
   - Record only what the purpose needs.
   - Do not upload identity documents, health details, national identification numbers or bank data, unless a feature requires it and you have a lawful basis.
   - Keep absence reasons short and factual.
4. **Keep it accurate** (Art. 5(1)(d)). You are responsible for the accuracy of what you record and import. Correct errors quickly (§5).
5. **Only authorised users.** Only people you have authorised may act for you. You are responsible for what they do in your name, including imports and confirmations.
6. **Parties named on records.** If you name another organisation as a party on a record (for example a project client), its managers can read that record. Name a party only when you are entitled to share the record with it.
7. **Minors.** Do not record data about children unless you have a lawful basis and any required parental involvement. [OWNER DECISION: rules for schools adding students who are minors]
8. **AI assistants.** If you connect an external AI assistant, you decide to send data to that provider. You must have a lawful basis and a contract with that provider. Do not use it to process absence reasons or other sensitive content unless you are entitled to. [OWNER/LAWYER: restrict tools]
9. **No unrelated purposes.** Do not use data from the platform for unrelated purposes, and do not export it in bulk to other systems without a lawful basis.

## 4. Who can see your records on the platform

- Your organisation's managers.
- Managers of organisations you name as a party on a record.
- Our authorised operator staff, only as needed to run, support and secure the service.

Your records are **not** shown to other employers searching for candidates. A person you recorded sees the record only after their account is linked, through an invitation you send.

## 5. Accuracy, corrections and disputes

- Records are **append-only**: they cannot be edited in place. To correct a record, add a correction. Each record can have one correction. This keeps an honest history.
- A person whose account is linked to your record can **dispute** it, and can withdraw the dispute.
- When a dispute arrives, review it and answer the person. [OWNER DECISION: time limit]
- We may mark a record as disputed. We do not decide who is right, unless the law requires it.
- [OWNER DECISION: erasure or redaction of append-only records. Today a roster person cannot be removed while evidence records exist, and evidence records cannot be deleted from the product.]

## 6. Requests from the people concerned

- If a person asks **you** about data on the platform, you answer them. We help you as described in §7.7.
- If a person asks **us** about your records, we tell them you are the controller and forward the request to you, unless the law requires otherwise. You then answer within the time GDPR allows (Art. 12(3): one month, extendable).
- For the platform's own data (links, derived signals, matching), we answer the person ourselves.

## 7. Data processing terms (GDPR Art. 28)

This section applies where we act as **your processor** (see §2).

1. **Subject matter and duration.** Hosting and processing your records on the platform, for as long as you use the platform and until deletion under §7.10.
2. **Nature and purpose.** Storage, display to your authorised users and the parties you name, search, export, import processing, and the features you use.
3. **Types of data.** Names and references; work descriptions, dates, places and addresses; working-time, timesheet and absence records; attestations and confirmations; documents and photos you upload; notes.
4. **Data subjects.** Your staff, former staff, workers, candidates, learners, and contact persons of your clients.
5. **Instructions.** We process the data only on your documented instructions. Your use of the platform's features and settings is your instruction. We do not process it for our own purposes, except the controller activities in §2, or where EU or member-state law requires it; if the law requires it, we tell you first, unless the law forbids that (Art. 28(3)(a)).
6. **Subprocessors.** You give general authorisation for the subprocessors that touch your records:
   - Supabase (database and file storage, EU);
   - Vercel (hosting and server functions);
   - GitHub (automated jobs with technical access to production data).

   The full provider list is in the Privacy Policy, §6. [LAWYER/OWNER: confirm whether Hostinger (correspondence about requests) belongs on this list]

   We tell you [OWNER DECISION: e.g. 30 days] before adding or replacing one. You may object on reasonable data-protection grounds. We bind each subprocessor to data-protection obligations equivalent to these (Art. 28(2) and (4)). [LAWYER/OWNER: DPAs with each subprocessor are not yet evidenced]
7. **Assistance.** Taking into account what our systems allow, we help you:
   - answer people's requests (Arts 15-22);
   - meet your security, breach-notification, DPIA and prior-consultation duties (Arts 32-36).
8. **Personal data breaches.** We tell you about a breach affecting your records without undue delay after we become aware of it [OWNER DECISION: e.g. within 48 hours]. We include the information we have that you need under Art. 33(3).
9. **Confidentiality and security.** People who can access the data are bound by confidentiality. Our security measures (Art. 32):
   - access rules enforced in the database itself and covered by automated tests;
   - private file storage with short-lived links;
   - append-only audit and consent records;
   - administrator access limited to a small number of people.

   [OWNER/LAWYER: a formal description of technical and organisational measures is pending]
10. **End of the contract.** When you stop using the platform, you can export your records. Then we delete them, unless EU or member-state law requires us to keep them. [OWNER DECISION: export format and deletion period. Note the technical constraint in §5]
11. **Transfers.** Data is hosted in the EU. Where a subprocessor processes data outside the EEA, a transfer tool under Arts 44-49 must apply. [LAWYER/OWNER: confirm per vendor — none evidenced yet]
12. **Information and audits.** We give you the information needed to show that this section is followed. We allow and contribute to reasonable audits by you or your auditor, with reasonable notice and confidentiality (Art. 28(3)(h)).
13. **Records.** We keep a record of processing activities as processor (Art. 30(2)).

## 8. Where we are controller

For the activities marked as ours in §2, we are controller under our Privacy Policy. Where those activities rely on your records (for example linking or matching), you confirm that you may provide the records to us for those purposes. [LAWYER]

## 9. Liability

[LAWYER: allocation of liability between the organisation and UAB „Nonstop Group“ under GDPR Art. 82; indemnity for unlawful uploads; caps consistent with the Terms of Service]

## 10. Changes, acceptance and law

- [OWNER/LAWYER: how these terms are accepted and recorded]
- We tell you before material changes apply. [OWNER DECISION: notice period]
- Lithuanian law applies, and the Terms of Service decide where disputes go.
- Version **v2 (draft), 2026-10-15**.

## 11. Contact

info@labourmarket.ai — UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lithuania. No data protection officer is appointed.
