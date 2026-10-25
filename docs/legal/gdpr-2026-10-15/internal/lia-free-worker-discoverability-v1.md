# Legitimate-interests assessment — default employer discoverability of free workers (v1, 2026-10-25)

| | |
|---|---|
| **Decision it supports** | Owner product decision 2026-10-25: free workers are discoverable by registered companies by default, with an easy opt-out. |
| **Processing** | Showing a free worker's limited, anonymous professional summary in company and agency searches and matching (`list_discoverable_worker_ids_v1`, `list_discoverable_worker_profiles_v1`, scouting and auto-match over the same pool). |
| **Controller** | UAB "Nonstop Group" (privacy policy section 0). |
| **Chosen basis** | GDPR Art. 6(1)(f), legitimate interest. Consent (Art. 6(1)(a)) stays the basis when a person turns visibility on themself. |
| **Implementation** | Migration `20261025100000_free_worker_visibility_default_v1.sql`; notice `PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1` (`apps/web/lib/privacy/consent-definitions.ts`); UI `components/app/discoverability-consent.tsx`. |
| **Status** | Assessment prepared for the controller. Default OFF in production until the controller arms it after publishing the aligned privacy policy (this PR). |

## 1. Why not consent, and why not contract

- **Consent cannot be the basis of a default.** Consent must be an unambiguous affirmative act. A pre-set switch is not consent (Art. 4(11), Art. 7; CJEU C-673/17 *Planet49*). Keeping consent would keep the product's core purpose behind an opt-in. In production, 54 of 86 real worker profiles have never been asked or never decided.
- **Contract (Art. 6(1)(b)) is not chosen.** Being found by third-party companies is arguably the service a job-seeker signs up for. But the account, CV and Work Journal all work without discovery, so discovery is not strictly necessary to perform the contract. EDPB Guidelines 2/2019 read "necessary" narrowly. Contract is therefore not relied on.
- **Legitimate interest (Art. 6(1)(f)) fits** because the interest is real, the processing is limited to what that interest needs, and the person can stop it in one tap. The three-part test follows.

## 2. Purpose test — is there a legitimate interest?

- **Controller and platform interest:** to connect people who look for work with the companies that need them — the reason the platform exists (product doctrine: one labour/work graph).
- **The worker's own interest:** being found for work they are looking for. Companies cannot invite, book or message a worker they cannot see.
- **Third parties' interest:** registered companies and agencies have a lawful hiring need.
- **Lawful, specific, present:** the interest is lawful (labour-market intermediation), clearly articulated, and present now, not speculative.

## 3. Necessity test — is the processing necessary, and the least intrusive way?

- **Only a discovery projection is processed.** No name and no free text. Exact timestamps are replaced by a week bucket. The worker appears under an anonymous label (`20261018160000_worker_identity_split_v1.sql`).
- **Never part of discovery:** contacts, documents, Work Journal entries, external profile links and the CV file. RLS was checked on production on 2026-10-24:
  - `workers_select` requires a working relationship;
  - `profiles_select` allows only the person themself or an admin;
  - `journal_entries_select` allows the owner or the engagement's own organisation;
  - `worker_external_profiles_select` and `worker_documents_select` allow only the owner or an admin.
- **First contact goes through platform messaging.** Name and contacts reach a company only through the person's separate per-company disclosure (consent, `employer_data_disclosure`).
- **Less intrusive alternatives were considered:**
  - An opt-in only model is already in place. It reaches the purpose for only about a third of workers, so it does not achieve the purpose.
  - Showing names, or contact on discovery, was rejected as more intrusive.
  - The default is therefore limited to the anonymous summary and to people for whom being found is the expected outcome (free workers, section 4).

## 4. Balancing test — do the person's interests override?

**Reasonable expectations.**
- A person who registers on a labour-market platform as a worker looking for work reasonably expects employers to be able to find them.
- The expectation is created explicitly, not assumed. The versioned notice is shown in the product (onboarding, home, profile, privacy page) before the default applies, and its display is recorded per person in the consent ledger (`notice_shown`, notice version and hash).
- For accounts that existed before the switch, visibility starts only `default_grace_days_existing` days (default 14) after the notice. They can object before anything happens.

**Who is excluded (the default never applies to them).**
- **People employed in a company through the platform:** an active employee or manager engagement with an organisation, or an active company roster row. Their visibility stays relationship-scoped. If they want to be found, they decide themselves (consent). Joining a company suspends the default; leaving it resumes it. No row is written and no history is changed.
- **Learners:** an active student or intern engagement, or a current education entry. Learners are very often minors (`20260827210000`, `minors-and-age-policy-v1.md`); they can opt in themselves.
- **Anyone who ever decided:** a withdrawal, a recorded "not now" or a grant. A switch-off is never re-enabled by any default.
- **Anyone with an open account-deletion request** (existing rule `20261019070000`).

**Nature of the data.**
- Professional, non-special-category data only. No Art. 9 data is in the projection.
- Pay expectation appears only when the worker entered it.

**Impact.**
- Possible negative effects: unwanted contact (limited to platform messages, no contact details), and visibility to a current employer (mitigated by the employed exclusion and the anonymous label).
- Positive effect: access to work offers.

**Control.**
- One-tap switch-off on every surface. This is the Art. 21 objection.
- It takes effect at the next database statement. It stays off until the person turns visibility on.
- Separate controls remain: notification preferences (in-app and e-mail per type) and availability status.

**Power imbalance.**
- The platform is not the person's employer. The employed exclusion avoids employer-driven exposure.
- A company setting can never remove a person's own personal visibility, data or job search. Company settings act only on what the company publishes on its own behalf (team capacity listings, team offers).

## 5. Safeguards (implemented)

1. The default is derived at read time from the person's own ledger facts. Nothing is written on their behalf, and no consent row is fabricated.
2. Three separate choice states are kept in the one ledger:
   - NOT_ASKED (never a refusal);
   - EXPLICITLY_DISABLED (`withdrawn`, `declined`);
   - EXPLICITLY_ENABLED (`granted`).
3. The notice is versioned and hashed like a consent text. A changed notice needs a new version, and old notices then stop counting (fail closed).
4. The owner switch (`privacy_consent_purposes.default_on_from` / `default_basis`) is OFF until armed. Disarming stops every default at once.
5. Anonymous discovery, contact protection and relationship-scoped access are unchanged, as listed in section 3.
6. The ledger records the language of a withdrawal from the person's account language. Before this change it was always `lt`.
7. Erasure: unchanged (`privacy_erasure_executor_v3`). Notice and decline rows follow the ledger's existing erasure detach rule.

## 6. Data-subject rights

- **Information (Art. 13):** the notice text in six languages, plus privacy policy sections 4.1, 4.2, 5.1 and 7.2 (updated in this PR).
- **Objection (Art. 21):** the one-tap switch-off. No reason is needed, and the objection is honoured absolutely. Recruitment matching is not a ground the controller will argue overrides it.
- **Access and portability:** the person's own consent and visibility history is in the existing data export (`my_privacy_consent_history`) and on the privacy page.
- **Erasure and restriction:** existing processes. An open deletion request pauses discovery.

## 7. Residual risks and what keeps them in check

| Risk | Mitigation | Residual |
|---|---|---|
| A minor not linked to any school | Learner exclusion; anonymous label; one-tap objection | No age data exists to exclude minors outside learner links (`minors-and-age-policy-v1.md`). Low exposure because the summary is professional and anonymous. Recorded as a known gap. |
| A person employed outside the platform (no engagement row) | Anonymous label; no contacts; one-tap objection; the notice says it applies "while you do not work for a company through LabourMarket.ai" | Accepted |
| Ranking / auto-match over the default pool (DPIA P1/P2) | Same projection; no outward transfer; employer contact only through the platform | DPIA updated reference: the pool basis for defaulted workers is 6(1)(f) |

## 8. Conclusion

The controller has a legitimate interest. Processing the anonymous professional summary of free workers is necessary for it and limited to it. With the notice-first rule, the exclusions, the anonymous projection and the one-tap objection, the workers' interests and rights do not override it.

Art. 6(1)(f) is an appropriate basis for the default once the aligned privacy policy is published and the switch is armed. Explicit enabling stays consent-based.

**Review:** before any change to the projection, the scope (free / employed / learner), or the notice text, and at the latest after 12 months.
