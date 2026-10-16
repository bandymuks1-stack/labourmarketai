# Notice for People Without an Account — LabourMarket.ai

*Information under GDPR Article 14 (data not obtained from you)*

> **Status:** DRAFT v2 — 2026-10-15
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Draft for lawyer review. Not final, not legally valid yet, not certified.
>
> **Source facts used:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §3.3 (43 roster people, 41 not linked to an account; 2,944 evidence records; staging rows with `person_label` + `activity_text`; `source_fact` may hold person names and addresses; account link SET NULL; no rights path without an account)
> - `03-rights-consent-legal-pages.md` §0, §3 (all 43 in one organisation; records readable by managers of the importing organisation and of party organisations; no Art. 14 notice; claims only through a manager-sent invite; dispute only once linked; records insert-only; SE ads: 41,353 descriptions with an e-mail address, 22,500 with contact-person wording; NAV: 3,809 with phone-like numbers; ad text shown verbatim to signed-in users; removed ads kept)
> - `02-processors-transfers-cookies-ai.md` §1 row 15, D13 (NAV `contactList` never stored; SE description stored); §1 rows 9, 21 (company-need contacts; invitation e-mails)
> - `docs/legal/retention-decision-package-v1.md` decision 3b
>
> **Open decisions:**
> 1. [OWNER DECISION: request channel for people without an account — interim proposal: info@labourmarket.ai; consider a dedicated web form with identity check]
> 2. [LAWYER: role split for organisation-supplied records — the organisation as controller with the platform as processor, joint controllers (Art. 26), or independent controllers. See `organisation-data-terms-v2` §2]
> 3. [LAWYER/OWNER: who gives this notice to people in organisation rosters, and when (Art. 14(3): within one month at the latest). Today no notice is given]
> 4. [LAWYER: whether Art. 14(5)(b) (disproportionate effort) applies to contact persons in public job ads, and the public-information measures that must accompany it]
> 5. [OWNER DECISION: redact e-mail addresses and phone numbers in ad text before display, or keep them; retention of removed ads (proposed 12 months)]
> 6. [OWNER DECISION: erasure or redaction path for insert-only organisation evidence records]
> 7. [OWNER DECISION: retention for import staging rows]

---

## 1. Why you may be reading this

The LabourMarket.ai platform may hold information about you even though you never signed up. This happens in four ways:

- **A.** A company, agency or school **recorded or imported your work history**. For example, a former employer entered the projects you worked on.
- **B.** You are named as a **contact person in a public job advertisement**, published by the Swedish or Norwegian public employment service.
- **C.** You are the **contact person in a business enquiry** that a company sent us (for example, a staffing need).
- **D.** Someone **invited you by e-mail** to join, and you have not joined yet.

This notice tells you what we hold, why, and what you can do.

## 2. Who is responsible

**UAB „Nonstop Group“**
Company code 302676973
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lithuania
Privacy contact: **info@labourmarket.ai**. No data protection officer is appointed.

For **case A**, the organisation that recorded your history decides what it records about you, and it is responsible for those records. For the platform's own work on them, we are responsible (for example, linking a record to an account if you join later). [LAWYER: confirm role split]

## 3. What we hold, and where it comes from

| Case | Data | Source |
|---|---|---|
| A — work history | your name as the organisation wrote it, the organisation's reference for you, descriptions of work, dates, places and addresses of work, notes, attestations by the organisation, and skill signals the platform derives from these records | the organisation (its files or imports) |
| B — job ads | employer name, organisation number (which can identify a sole trader), and the ad text, which can include a contact person's name, e-mail and phone. We do not store the employment service's separate structured contact list | Arbetsförmedlingen (Sweden) and NAV (Norway), public open data |
| C — enquiries | company name, your name and contact details as the company entered them, details of the need | the company that sent the enquiry |
| D — invitations | your e-mail address, the name the inviter typed, and their message | the person or organisation that invited you |

## 4. Why we use it, and on what legal basis

| Case | Purpose | Legal basis |
|---|---|---|
| A | the organisation keeps and uses its own work records. The platform hosts them, lets you claim them later, and derives skill signals | the organisation's own basis for its records. For the platform's linking and derived signals: our legitimate interest in giving people a usable record of their real work (GDPR Art. 6(1)(f)) [LAWYER] |
| B | show available jobs to job-seekers, so they can apply | legitimate interest (Art. 6(1)(f)): the ad was published so people would contact the employer [LAWYER] |
| C | answer the enquiry and prepare a possible contract | steps before a contract / legitimate interest (Art. 6(1)(b), (f)) |
| D | deliver the invitation and let you accept it | legitimate interest of the inviter and of you in being invited (Art. 6(1)(f)) |

We do not ask for special categories of data (Art. 9) about you. If a record contains such data by mistake, please tell us or the organisation.

## 5. Who can see it

- **Case A:** managers of the organisation that recorded it can see it. So can managers of another organisation named as a party on the same record (for example, the client of a project). Other users cannot. It is **not** shown to employers searching for candidates.
- **Case B:** the ad text, including any contact details in it, is shown to **signed-in users** of the platform. [OWNER DECISION: redaction]
- **Case C:** our team. If the owner-alert channel is enabled, a short alert goes to the owner through Telegram or the Agentai OS bridge; it contains no worker data. [OWNER: confirm]
- **Case D:** the inviter and our team.

Our service providers host the data (Supabase, in the EU; Vercel; others listed in the Privacy Policy, §6). The Privacy Policy, §7, explains transfers outside the EEA.

## 6. How long we keep it

- **A:** as long as the organisation keeps the record. [OWNER DECISION: default period; import staging rows]
- **B:** while the ad is active. Removed ads are hidden, but kept today. [OWNER DECISION: proposed 12 months after removal]
- **C:** [OWNER DECISION: proposed 24 months after the enquiry is closed]
- **D:** [OWNER DECISION: until accepted, withdrawn or expired]

## 7. Your rights

You have the same rights as account holders: access, rectification, erasure, restriction, objection, and portability where it applies (GDPR Arts 15-21). The Privacy Policy, §10, describes them.

**Objection.** Where we rely on legitimate interests (Art. 6(1)(f)), you can object. We then stop, unless we have compelling grounds. For job-ad contact details (case B), we will hide or remove your details from our copy of the ad. [OWNER DECISION: confirm the action]

**Case A — records kept by an organisation.**
- You can ask us which organisation recorded your history. We pass your request to that organisation, or give you its contact details.
- We delete the skill signals and links the platform itself derived.
- The organisation decides on its own records. It must answer you under its own GDPR duties.
- Records are append-only, so a correction is added as a new entry. [OWNER DECISION: erasure path]

**Claiming your work history.** If you want the history in your own account, ask the organisation to send you an invitation. Today a record cannot be claimed without one; this prevents strangers from searching for people's records. Once your account is linked, you can see and dispute the record.

## 8. How to contact us

[OWNER DECISION: channel] Write to **info@labourmarket.ai**, with the subject "Request — no account". Tell us:
- which case applies (A, B, C or D);
- your name as it may appear in the record;
- for case A, the organisation, if you know it;
- for case B, a link to the ad, or the employer's name.

**Identity check.** Because you have no account, we need to confirm that you are the person concerned before we give out or change anything. We ask only for what is needed, for example a reply from the e-mail address shown in the record, or details only you would know. We do not ask for a copy of an identity document unless there is no other way. [LAWYER: confirm]

**Time limit.** We reply within **one month**. We can extend this by two more months for complex requests; if so, we tell you within the first month (Art. 12(3)). Requests are free.

## 9. Complaints

You can complain to a supervisory authority in the EU country where you live or work. Our lead authority is the State Data Protection Inspectorate of Lithuania (Valstybinė duomenų apsaugos inspekcija, VDAI): L. Sapiegos g. 17, LT-10312 Vilnius, ada@ada.lt, vdai.lrv.lt. [LAWYER: verify]

## 10. Version

v2 (draft), 2026-10-15. This notice is published at [OWNER DECISION: public URL, e.g. /legal/no-account-notice]. It is linked from the Privacy Policy.
