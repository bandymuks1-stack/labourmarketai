# Privacy Policy — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15
> **Reikalinga teisininko peržiūra / Requires lawyer review.** This is a draft for lawyer review. It is not final, has no legal validity yet, and is not certified by anyone.
>
> **Source facts used (nothing else):**
> - Audit 2026-10-15: `gdpr-2026-10-15/audit/01-personal-data-inventory-and-erasure-classes.md`, `02-processors-transfers-cookies-ai.md`, `03-rights-consent-legal-pages.md`
> - `docs/legal/`: `corporate-identity-source-of-truth-v1.md`, `legal-basis-matrix-v1.md`, `data-retention-matrix-v1.md`, `retention-decision-package-v1.md`, `processing-activities-register-v1.md`, `subprocessor-register-v2.md`, `entity-role-and-data-access-matrix-v1.md`, `dpo-requirement-assessment-v1.md`, `consent-copy-register-v1.md`, `deletion-process-design-v1.md`, `privacy-risk-and-dpia-screening-v1.md`
> - Current published copy: `apps/web/messages/en.json` → `legal.*`; `apps/web/lib/privacy/consent-definitions.ts`; `apps/web/lib/billing/plans.ts`
>
> **Open decisions (must be closed before publication):**
> 1. [OWNER DECISION: retention periods per data class — Package A decisions 1, 2, 3, 3b are not approved; every period in §9 is a proposal]
> 2. [OWNER DECISION: consent banner for analytics storage, OR make telemetry strictly necessary / aggregate-only. Today analytics storage is written without consent]
> 3. [OWNER DECISION: minimum age (16 or 18) and the learner / student rule]
> 4. [OWNER DECISION: request channel for people without an account]
> 5. [OWNER DECISION: Gemini — confirm the paid tier before re-enabling personal-data tasks; until then this policy says they are off]
> 6. [LAWYER/OWNER: confirm the transfer mechanism (SCCs / EU-US Data Privacy Framework / adequacy) per vendor — none is evidenced in the repo]
> 7. [LAWYER/OWNER: confirm DPAs are accepted for Supabase, Vercel, Stripe, Resend, Hostinger, GitHub]
> 8. [LAWYER: legal basis per purpose (table §4) — working mapping only]
> 9. [LAWYER: role of organisations that upload people's data — see `organisation-data-terms-v2`]
> 10. [OWNER/LAWYER: DPIA for automatic matching and candidate ranking — trigger already passed, no DPIA on file]
> 11. [OWNER: confirm whether the Nonstop Group hand-off door (`NONSTOP_HANDOFF_ENDPOINT`), Telegram owner alerts and the Agentai OS alert bridge are enabled in production]
> 12. [OWNER: name the "partner infrastructure" provider for the partner opportunity network]
>
> **[INTERNAL — remove before publication]**
> - [OWNER/LAWYER: past free-tier processing assessment pending] Between 2026-08-28 and #2399, message text and typed chat sentences were sent to Gemini without proof of a paid tier. This policy does NOT describe that period as fact. A breach / Art. 33-34 assessment decision is required.
> - RESOLVED 2026-10-15: the 2 `extract_cv` and 13 `translate_vacancy` rows never reached Gemini (egress gate refusal, no tokens). `data_categories_sent` records intended categories, not sent ones. §8 as written is accurate for current behaviour. Past processing (145 message translations 2026-09-28→10-09, 79 chat-understanding calls 2026-09-05→10-14) is an internal assessment item (INC-2026-001), not published text.
> - Remove from the live pages the statements "payments are not active", "does not build behavioural profiles", "no analytics" and "Gemini translates job ads". Audit D1, D5, D10 and L7 show them to be false.
> - The director's name must not appear in public text until verified (`corporate-identity-source-of-truth-v1.md` §4 #2).

---

## 1. Who we are and how to contact us

The controller for the LabourMarket.ai platform is:

**UAB „Nonstop Group“**
Company code 302676973, VAT LT100010790613
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lithuania

- Privacy contact: **info@labourmarket.ai**. This is a mailbox. It is not a data protection officer.
- **No data protection officer (DPO) is appointed.** Our assessment under GDPR Art. 37 found that one is not required at present. [LAWYER: re-assess — automatic matching now runs, which is a re-assessment trigger in `dpo-requirement-assessment-v1.md` §5]
- "LabourMarket.ai" is the name of the platform. It is not a company.
- **Labour Market AI Sp. z o.o.** (Warsaw, Poland) owns the software and the brand and licenses them to UAB „Nonstop Group“. It is not a controller or a processor of your data. It has no routine access to the production database, profiles, CVs, contacts or documents.

## 2. Our role, and the role of organisations

There are three situations. They decide who answers for your data.

| Situation | Who decides about the data | Our role |
|---|---|---|
| Your own account, profile, Living CV, work journal, consents, messages, matching and the platform's own features | UAB „Nonstop Group“ | **Controller** |
| Records that a company, agency or school creates or uploads about people (for example a staff roster, imported work history, project records, absence or working-time records) | That organisation, for its own records | Usually **processor** for the organisation (GDPR Art. 28). We stay **controller** for what the platform adds itself, such as linking a record to an account or matching. [LAWYER: confirm per activity — see `organisation-data-terms-v2`, which lists this as an OPEN DECISION, including joint controllership under Art. 26] |
| Data you choose to send elsewhere (your own AI assistant, your Google account, an employer that received your data with your consent) | The recipient, for its own processing | We are not responsible for the recipient's own use |

If an organisation is the controller, it must tell you about its processing. You can still contact us; we will pass your request on, or tell you whom to contact.

## 3. Whose data this policy covers

- **People with an account:** workers, job-seekers, learners, and people who use the platform for a company, agency or school.
- **People without an account** whose data reaches the platform:
  - people whose work history an organisation recorded or imported;
  - contact persons named in public job advertisements;
  - contact persons in business enquiries (for example a company-need request);
  - people invited by e-mail who have not yet joined.

  People without an account have a separate notice: **"Notice for people without an account"**.
- **Visitors** of the public website (technical data, see the Cookie and Storage Policy).

## 4. What we use data for, and our legal basis

The legal bases are those in GDPR Art. 6(1): (a) consent, (b) contract, (c) legal obligation, (f) legitimate interests. [LAWYER: confirm each row]

"Kept" gives the current rule; §9 has the proposed periods. "Processors" means our service providers in §6.

| # | Purpose | Data | Legal basis | Source | Kept | Recipients |
|---|---|---|---|---|---|---|
| 1 | Create and run your account; sign you in | e-mail, sign-in identity, language. With Google sign-in: name, e-mail, profile picture link, Google account ID | 6(1)(b) | you; Google | until account deletion | processors (Supabase; Resend and Amazon SES for sign-in e-mails) |
| 2 | Your profile and Living CV | profession, skills, experience, education, achievements, languages, availability, pay expectation if entered, avatar, external profile links, document list | 6(1)(b) | you | until account deletion | processors; others only under purposes 4, 5, 6, 8 |
| 3 | Work journal and work records | journal entries (text, photos, metrics), hours, timesheets, work plans, tasks, absences | 6(1)(b). Where an employer keeps working-time or absence records, the employer is controller under its own legal obligations (6(1)(c)) | you; your organisation | until account deletion; employer records see §9 | managers of the organisation the work belongs to; processors |
| 4 | Let companies and agencies find a limited professional summary | display name, profession, experience, skills, approximate region, availability, languages, pay expectation (only if entered) | **6(1)(a) consent** ("profile visibility"), opt-in | you | until you withdraw | registered companies and agencies |
| 5 | Send your contacts, CV or chosen fields to **one** named company for one need | only the fields you approve | **6(1)(a) consent** ("transfer to a company") | you | the transfer record: §9 | that company only |
| 6 | Show your availability in the partner opportunity network, which also looks for work outside this platform | an opaque reference plus professional attributes only: no name, e-mail, phone, address, CV file or journal content. Pseudonymised, not anonymous | **6(1)(a) consent** ("partner network") | you | rebuilt at each update; dropped at the next update after you withdraw | partner infrastructure acting on our instructions [OWNER: name provider] |
| 7 | Pass your interest in a vacancy to Nonstop Group's staffing service, when you ask | the allow-listed facts the vacancy needs | 6(1)(a) consent given at that step [LAWYER: or 6(1)(b)] | you | [OWNER DECISION] | UAB „Nonstop Group“ staffing service |
| 8 | Work relationships you accepted (roster or team, bookings, engagements, projects) | professional summary; journal entries under that engagement | 6(1)(b); 6(1)(f) for the organisation's coordination | you; the organisation | while the relationship is active; records see §9 | that organisation's responsible people |
| 9 | Matching and recommendations (see §8) | professional data, availability, region, evidence on your record | 6(1)(b) for recommendations to you; 6(1)(f) for ranking shown to employers, **only among people who switched on visibility** [LAWYER] | platform | recomputed; match receipts store counts and references only | you; employers (only if visibility is on) |
| 10 | Human matching by our operator team | names and professional data in the internal pool. Nothing goes out without your consent | 6(1)(f) | platform | while the account exists | our operator team only |
| 11 | Messages between users | message text, attachments, the other person's display name | 6(1)(b) | you; the other person | kept (§9) | conversation participants; processors |
| 12 | Prove consents and data transfers (Art. 7(1), Art. 5(2)) | consent events (purpose, text version and hash, language, time), disclosure records. **No IP address or browser data** | 6(1)(c) and 6(1)(f) | platform | cannot be edited (§9) | you; authorities if required |
| 13 | Handle privacy requests | the request and our handling notes | 6(1)(c) | you | §9 | our privacy team; processors |
| 14 | Records an organisation keeps about you (e.g. imported work history) | name as the organisation wrote it, its reference, work descriptions, dates, places, attestations | the organisation's own basis (it is controller). Our linking and matching: 6(1)(f) [LAWYER] | the organisation | the organisation decides | managers of that organisation and of organisations named as a party on the record |
| 15 | Public job advertisements | employer name, organisation number, ad text, which may name a contact person with e-mail or phone | 6(1)(f): showing available work [LAWYER: Art. 14(5)(b)] | Swedish and Norwegian public employment services | while active; removed ads hidden (§9) | all signed-in users |
| 16 | Business enquiries and owner alerts | company name, contact person, need details | 6(1)(b) pre-contract / 6(1)(f) | the enquirer | [OWNER DECISION] | our team; owner alert channel if enabled |
| 17 | Paid organisation plans and invoicing | billing contact e-mail and name, **billing address, VAT or tax ID**, organisation and plan reference. Card data goes straight to Stripe | 6(1)(b); 6(1)(c) accounting and tax | the organisation; Stripe | statutory period (§9) | Stripe; tax authorities and accountants as required |
| 18 | Product analytics (see §8 and the Cookie and Storage Policy) | events tied to your account ID, a random session ID, page, language, first-visit campaign data (`utm_*`, referring site, landing page), organisation ID | 6(1)(f) for the analysis; **consent** for storing the identifiers on your device (ePrivacy Art. 5(3)) [OWNER DECISION: banner or drop] | your device | kept (§9) | our team; processors |
| 19 | Security, abuse prevention and audit logs | request data, IP address in hosting logs, audit records of key changes | 6(1)(f) | your device; platform | [OWNER: hosting log window] | processors |
| 20 | AI-assisted features (see §8) | today only public market statistics go to an AI provider | 6(1)(f) | platform | output excerpts removed after 90 days | Google (Gemini API) |
| 21 | Connecting your own AI assistant (ChatGPT, Claude and others) | what you allow the assistant to read, within your own permissions | 6(1)(b), at your request | you | until you disconnect | the assistant's provider |
| 22 | Approximate login location, if you choose to share it | city-level location | 6(1)(a) [OWNER: verify feature and consent text] | you | until you withdraw | processors |
| 23 | Correspondence with us | your e-mail and message | 6(1)(f); 6(1)(c) for a rights request | you | [OWNER DECISION] | mailbox provider |

**Special categories of data (GDPR Art. 9).** We do not ask for health, ethnic origin, religion, political opinions, trade-union membership or biometric data. Free-text fields can still contain such data if someone writes it, for example an absence reason. Absence reasons are restricted to you and the reviewing manager. [LAWYER: Art. 9(2)(b) basis for employers' absence records; consider limiting reason text]

**Do you have to give data?** Data marked 6(1)(b) is needed to provide the feature. Without it the feature cannot work. Every consent purpose is optional. Saying no changes nothing else about your account.

## 5. Where data comes from

- **From you:** what you enter, upload or say in the product.
- **From organisations:** a company, agency or school may record or import facts about your work (rosters, work history, project and time records). It may also confirm your journal entries.
- **From other users:** messages, confirmations of your work, invitations that name you.
- **From Google**, if you sign in with Google.
- **From Stripe**, about the payments of an organisation plan.
- **From public sources:** job advertisements published by Arbetsförmedlingen (Sweden) and NAV (Norway). We do not store NAV's structured contact list. An ad's text can still name a contact person.
- **From your device:** technical and analytics data (see the Cookie and Storage Policy).

## 6. Who receives data

**Inside the platform**, data is closed by default. Other users see only what a specific rule allows. The page "Your data and who can see it" sets out these rules.
- Companies and agencies see your limited summary only if you switched on visibility (purpose 4).
- They see your contacts, CV or documents only after a separate approval for that company (purpose 5).
- Managers of an organisation you work with see what that relationship needs (purpose 8).
- Managers of an organisation that recorded your work history can read it. So can managers of an organisation named as a party on that record.
- When an employer or manager connects its own AI assistant, that assistant can read what the manager may read. This can include data about you, for example candidate search results, the roster or absence requests. The organisation is responsible for that choice. [LAWYER: controller and recipient analysis — audit D4]

**Our service providers (processors).** They act on our instructions:

| Provider | What it does | Location |
|---|---|---|
| Supabase | database, sign-in, file storage | EU (Ireland, eu-west-1); US parent company |
| Vercel | hosting, server functions (Dublin), request logs | functions in Dublin; part of the request handling runs on Vercel's global edge network; US company |
| Resend, sending through Amazon SES (eu-west-1) | sign-up and sign-in e-mails | US company; sending in the EU |
| Stripe Payments Europe | payment processing for organisation plans. For its own fraud-prevention and legal duties Stripe acts as an independent controller | Ireland; global group |
| Hostinger | mailbox for info@labourmarket.ai [OWNER: verify provider and location] | [verify] |
| GitHub | code hosting and automated jobs. These jobs can technically reach production data and write public job data | US |
| Google (Gemini API) | AI processing. Today **only public market statistics** are sent | Google infrastructure |
| Telegram, or the Agentai OS alert bridge | short alerts to the owner about business enquiries. No worker data. **Only if enabled** [OWNER: confirm] | outside the EEA |

**Independent recipients.** They decide for themselves how they use the data:
- **Google**, when you use "Continue with Google".
- **OpenStreetMap Foundation.** Map pieces are loaded from its servers, so your browser sends it your IP address and the map area you view.
- **Your browser's maker** (for example Google or Apple), if you use voice dictation. Your browser sends the audio to its own speech service; we do not receive the audio.
- **The provider of an AI assistant** you or your organisation connect.
- **Companies** that received your data with your consent.
- **Authorities**, when the law requires it.

**Within UAB „Nonstop Group“.** UAB „Nonstop Group“ also runs a staffing business. It receives your data for that business only when you ask for it (purpose 7).

## 7. Transfers outside the European Economic Area

Our main database is in the EU. Some providers are US companies, or process data outside the EEA:
- Vercel's edge network;
- support access by US parent companies;
- GitHub-hosted runners;
- Google;
- Telegram, if it is enabled.

The OpenStreetMap Foundation is in the United Kingdom, which has an EU adequacy decision.

Where data leaves the EEA, a transfer tool under GDPR Arts 44-49 must apply: an adequacy decision, the EU-US Data Privacy Framework, or Standard Contractual Clauses. [LAWYER/OWNER: confirm the SCC / DPF / adequacy basis per vendor. None is evidenced in our records yet. Do not publish a mechanism that has not been confirmed.] You can ask us for a copy of the safeguards.

## 8. AI features, matching and profiling

**Automatic matching and ranking happen. No solely automated decision with legal or similarly significant effect is made about you (GDPR Art. 22).** A person makes every decision that counts: who is contacted, offered work, accepted, verified or rejected.

What runs automatically:

- **Matching a need to workers.** When an organisation publishes or reopens a need, a rule-based matcher ranks the workers who switched on visibility. It sends no message, invitation or notification. The organisation decides whether to contact anyone.
- **Candidate ranking.** Search results for employers are ordered by fit. An employer sees a short list of the top results first (currently 8). Ranking affects who is seen first. It never rejects anyone.
- **Job alerts and "new matching jobs".** We compare your profile with open vacancies and recommend them to you.
- **Living CV inference.** From your evidence we suggest direct, indirect and potential capabilities. A suggestion stays a suggestion. It is labelled separately from what you declared and from what someone confirmed or certified.
- **Organisation confirmation rules.** An organisation can set a rule that confirms a skill on its own record when its confidence threshold is met. [OWNER/LAWYER: notice and explanation to the worker are missing — audit 03 addendum]

**AI models.**
- Today the only task that reaches an outside AI model (Google Gemini) is the explanation of **public market statistics**. It contains no personal data.
- Translation of messages and suggestions for typed chat sentences are **switched off** for personal data. They stay off until the AI provider's paid, contract-based terms are confirmed. [OWNER DECISION: re-enable only after the paid tier is confirmed; update this section first]
- AI output is always a suggestion. Nothing is saved as a fact about you until you or a responsible person confirms it.
- AI never verifies a skill, accepts or rejects a candidate, or contacts anyone.
- AI run logs keep a short output excerpt. It is removed after 90 days.

**Your choices.**
- You can switch off visibility at any time. You then leave employer matching for new searches.
- You can object to profiling based on legitimate interests (§10), and ask for a person to explain a ranking.

[LAWYER: assess whether the rule-based matcher is an "AI system" under the EU AI Act (Regulation (EU) 2024/1689, Art. 3(1)). If it is, check Annex III point 4 (employment). Do not state a classification publicly until assessed.]

## 9. How long we keep data

Today, data is kept while your account exists and the feature still uses it. The periods below are **proposals that have not been approved**. [OWNER DECISION: approve or change each one — Package A]

| Data | Today | Proposed period |
|---|---|---|
| Account, profile, Living CV | until the account is deleted | same |
| Work journal | until the account is deleted | [OWNER DECISION: delete or keep detached evidence. Today deleting the account deletes the journal] |
| Messages | kept | [OWNER DECISION: 36 months after the conversation closes] |
| Bookings and engagements | kept | [OWNER DECISION: 6 years after the end — legal claim period; LAWYER] |
| Absence reason text | kept | [OWNER DECISION: 12 months] |
| Notifications | kept | [OWNER DECISION: 12 months] |
| Analytics events | kept | [OWNER DECISION: 24 months, or delete on request] |
| Consent and disclosure records | kept, cannot be edited | [OWNER DECISION: account lifetime + 6 years, pseudonymised after deletion] |
| Privacy requests | kept | [OWNER DECISION: 3 years after completion] |
| Billing and invoices | kept | [LAWYER: statutory accounting period, 10 years under Lithuanian law is the standard reading] |
| AI output excerpts | **removed after 90 days** (runs daily) | same |
| Organisation-supplied records | kept | the organisation decides [OWNER DECISION: default for imported staging rows] |
| Removed public job ads | kept, hidden | [OWNER DECISION: 12 months after removal] |
| Backups | provider-managed rotation | provider window [OWNER: state the actual window] |

## 10. Your rights

Under GDPR Arts 15-22 you have the right to:

- **Access** (Art. 15): get a copy of your data, and information about how we use it.
- **Rectification** (Art. 16): correct wrong data. Saved journal entries cannot be rewritten; you can add a correction. Records kept by an organisation are corrected by that organisation; you can dispute them once your account is linked.
- **Erasure** (Art. 17): have your data deleted, unless we must keep some of it (for example accounting records, or proof of consent).
- **Restriction** (Art. 18): ask us to limit use while a question is checked.
- **Portability** (Art. 20): receive the data you gave us in a machine-readable file.
- **Objection** (Art. 21): object to processing based on legitimate interests, including profiling, analytics and operator matching. We then stop unless we have compelling legitimate grounds.
- **Human review** (Art. 22): not to be subject to a decision based solely on automated processing that significantly affects you. We do not make such decisions (§8). You can still ask a person to look at any automated result.
- **Withdraw consent** (Art. 7(3)) at any time, in one step. Withdrawal does not affect what was lawful before it. Data an employer already lawfully received stays with that employer, under its own responsibility.

## 11. How to use your rights

**In your account:** open **Dashboard → Privacy** (`/dashboard/privacy`; in the mobile app, Settings → Privacy).
- **Download your data:** a JSON file of your data, and a CSV file of your work journal. This is immediate.
- **Request deletion:** file an account-deletion request. Deletion is **not instant**. A person reviews the request and tells you what was deleted and what is kept, and why.
- **Consents:** switch each one on or off.

**By e-mail:** write to **info@labourmarket.ai**. Use it for access to the full information under Art. 15, correction, restriction, objection, or anything the account page does not cover. [OWNER DECISION: add in-product request types for rectification, restriction and objection]

**No account?** See the "Notice for people without an account". [OWNER DECISION: channel]

**Identity check.** In your account, being signed in identifies you. By e-mail, we may ask you to write from your account's address, or to give details only the real person would know. We ask only for what we need to confirm it is you.

**Time limit.** We reply **within one month** of receiving the request. For complex or numerous requests we may extend this by up to two more months. If so, we tell you within the first month and explain why (Art. 12(3)). Requests are free, unless they are clearly unfounded or excessive (Art. 12(5)).

## 12. Children and young people

[OWNER DECISION: minimum age to create an account — 16 or 18]

- The platform serves work, apprenticeships and learning, so learners and students may use it.
- [LAWYER: Lithuania sets 14 as the age for consent to online services under GDPR Art. 8 — verify. Below that age a parent's consent is needed for consent-based purposes. Also check Lithuanian rules on the work of minors.]
- [OWNER DECISION: whether people under 18 may switch on employer visibility, and whether a school may add students who are minors]
- Today there is no age check at sign-up.

## 13. Security

What we actually do:
- Access rules sit inside the database itself. Without a rule that grants access, nobody sees the data. These rules are covered by automated tests.
- Files and photos are in private storage. They open only through short-lived links.
- Consent and disclosure records are append-only. Nobody, including administrators, can change them.
- Administrator screens are limited to a small number of administrators.
- No administrator can give consent on your behalf.

No system is perfectly secure. If we suffer a personal data breach, we notify the supervisory authority, and you where the law requires it (Arts 33-34). If you notice a problem, write to info@labourmarket.ai.

## 14. Complaints

You can complain to a supervisory authority, in particular in the EU country where you live or work, or where the issue happened (Art. 77).

Our lead supervisory authority is the **State Data Protection Inspectorate of Lithuania** (Valstybinė duomenų apsaugos inspekcija, VDAI):
- L. Sapiegos g. 17, LT-10312 Vilnius;
- ada@ada.lt;
- vdai.lrv.lt.

[LAWYER: verify the address and contacts]

We would like the chance to fix the issue first, so please write to us as well. You do not have to.

## 15. Changes to this policy

- Version: **v2 (draft), 2026-10-15**. Replaces the earlier plain-language page.
- When we change this policy, we update the date and version here.
- If a change affects what you agreed to, we tell you in the product before it applies. Consent texts are versioned: if a consent text changes, we ask you again.
