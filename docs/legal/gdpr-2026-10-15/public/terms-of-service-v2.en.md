# Terms of Service — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Draft for lawyer review. Not final, not legally valid yet, not certified.
>
> **Source facts used:**
> - `docs/legal/corporate-identity-source-of-truth-v1.md` (contracting party, IP owner, brand-is-not-an-entity rule); `entity-role-and-data-access-matrix-v1.md`
> - Current Terms and marketplace rules: `apps/web/messages/en.json` → `legal.terms`, `legal.marketplaceRules`
> - Audit 2026-10-15 `03-rights-consent-legal-pages.md` §0 (3 live-mode Stripe checkouts for the organisation plan, 0 subscriptions), §5 (no age gate), L7 (Terms too thin); `02-processors-transfers-cookies-ai.md` §1 row 4 (Stripe collects billing address, VAT id, name), §4 (no automated rejection)
> - `apps/web/lib/billing/plans.ts` (Person and Organization Free plans €0; one paid Organization plan; Worker Plus, agency tiers, credits and media upsells deferred and not sold)
> - `docs/legal/retention-decision-package-v1.md` decision 2 (billing records)
>
> **Open decisions:**
> 1. [OWNER DECISION: are paid plans sold to businesses only (B2B)? If consumers or sole traders acting as consumers can buy, §9.6 applies — 14-day withdrawal right under Directive 2011/83/EU Art. 9, Lithuanian Civil Code [LAWYER: verify article]]
> 2. [OWNER DECISION: billing period, automatic renewal, cancellation notice and refunds]
> 3. [OWNER DECISION: minimum age (16 or 18)]
> 4. [LAWYER: limitation of liability wording and caps, under Lithuanian law and consumer law]
> 5. [LAWYER: consumer out-of-court dispute body (State Consumer Rights Protection Authority, VVTAT) and whether any EU ODR reference is still needed — the EU ODR platform was discontinued in 2025, verify]
> 6. [OWNER DECISION: notice period for changes to these Terms]
> 7. [OWNER DECISION: suspension and account-closure rules, and appeal route]
> 8. [LAWYER: whether "LabourMarket.ai" may appear as a contracting name anywhere — it must not, per the identity rules]

---

## 1. Who you contract with

- The platform is operated, and all its services are sold, by **UAB „Nonstop Group“**:
  - company code 302676973;
  - VAT LT100010790613;
  - Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lithuania;
  - e-mail info@labourmarket.ai.

  It is "we" or "us" in these Terms.
- Your contract for any platform service is with UAB „Nonstop Group“. It issues invoices and receives payments.
- "LabourMarket.ai" is the platform's name. It is not a company.
- **Labour Market AI Sp. z o.o.** (Warsaw, Poland; KRS 0001218752) owns the software, the brand and related intellectual property, and licenses them to us. It is not a party to your contract and has no access to your personal data.

## 2. What the platform is, and what it is not

- The platform helps people and organisations find, record, present and coordinate work. It covers:
  - a person's profile, Living CV and work journal;
  - organisations' needs, projects, teams and records;
  - matching, messages and bookings;
  - public job advertisements.
- A human operator is involved in coordination.
- Using the platform **does not by itself create an employment relationship**. It does not promise work, workers or any result.
- Any job, assignment or contract that people agree through the platform is between them. We are not a party to it, unless we say so in writing.

## 3. Accounts

- [OWNER DECISION: you must be at least 16 / 18 years old to create an account; learner and student rule]
- Give true information, and keep it up to date.
- Keep your sign-in safe. Tell us at once if you think someone else used your account.
- One person per personal account. Organisation accounts are used by people the organisation has authorised. The organisation answers for what they do in its name.

## 4. Your content

- You keep the rights to what you enter: profile, Living CV, journal entries, photos, documents and messages.
- You give us a non-exclusive licence to host, store, show and process that content. The licence covers only what is needed to run the platform for you, and to show it to the people the platform's rules or your consents allow.
- Do not upload content that you have no right to share, or that is unlawful. Do not upload other people's personal data unless you are allowed to. Do not upload identity documents unless a feature asks for them.
- Saved journal entries cannot be rewritten afterwards. You can add a correction. This keeps the work record honest.

## 5. Visibility and consent

- Your professional profile is **not** visible to companies or agencies unless you switch on visibility.
- Your contacts, CV and documents go to a company only after your separate approval for that company.
- These choices are never bundled with these Terms and are never required to use your account.
- Our Privacy Policy sets out the details.

## 6. Organisations

If you use the platform for a company, agency, school or other organisation, the **Organisation Data Terms** also apply. Two duties stand out:
- An organisation that records or uploads data about people (staff, former staff, candidates, learners) must have a lawful basis for doing so, and must inform those people.
- It answers for the accuracy of what it records.

## 7. Rules of use

You must not:
- give false information, impersonate anyone, or claim verification you do not have;
- offer or trade regulated or illegal goods or services, or post discriminatory or misleading job offers;
- collect other users' data, scrape the platform, or contact people for purposes they did not agree to;
- try to bypass access rules or security, or overload the service;
- use the platform to send unsolicited bulk messages.

We may hide content or offers that break these rules. Public offers appear only after moderation. You can report inappropriate behaviour or suspicious activity; moderators review it.

## 8. Verification, AI and matching

- A "verified" status appears only after a real human check, never automatically.
- The platform never confirms a right to work or legal eligibility without the required documents.
- AI features give **suggestions**. Nothing is saved as a fact until you, or a responsible person, confirms it.
- Matching and ranking help organisations see relevant people first. **They never reject anyone automatically.** A person decides about every contact, offer or selection. Our Privacy Policy, §8, explains how matching works.
- If you connect your own AI assistant (such as ChatGPT or Claude), it acts only with your permissions. Actions with consequences need a separate confirmation. The assistant's provider is responsible for its own processing.

## 9. Paid services

1. **What is free.** Participation as a person is free. Organisations can use a free plan with one active open position at a time.
2. **What is paid.** Organisations can buy the paid Organization plan. The price, billing period and taxes are shown on the pricing page and at checkout before you pay. [OWNER DECISION: billing period]
3. **Payment.** Payments are processed by Stripe. At checkout Stripe asks for the billing contact, billing address and VAT or tax ID. Card data goes straight to Stripe; we never receive it.
4. **Renewal and cancellation.** [OWNER DECISION: renewal, how to cancel, effect of cancellation, refunds]
5. **Invoices.** UAB „Nonstop Group“ issues invoices. We keep billing records for the period accounting and tax law require. [LAWYER: confirm period]
6. **Consumers.** [OWNER DECISION: B2B only?]
   - **If only businesses may buy:** paid plans are for businesses acting in their trade. By buying you confirm that you are not acting as a consumer.
   - **If consumers may buy:** a consumer may withdraw from the contract within 14 days without giving a reason (Directive 2011/83/EU, Art. 9). If you ask us to start the service within those 14 days and then withdraw, you pay for what was provided until then (Art. 14(3)). [LAWYER: Lithuanian Civil Code article; withdrawal form; digital-services rules]
7. Features, credits and add-ons that are not offered at checkout are not sold.

## 10. Intellectual property

The platform's software, design and brand belong to Labour Market AI Sp. z o.o. and are licensed to us. You may use the platform only as these Terms allow. Open-source components remain under their own licences.

## 11. Availability and changes to the service

We work to keep the platform available and correct. We cannot promise that it will always be available, error-free or uninterrupted. We may change, add or remove features. If a change materially reduces a paid service, we tell you in advance. [OWNER DECISION: notice and remedy]

## 12. Liability

[LAWYER: liability clause — exclusions and caps permitted under Lithuanian law. It must not exclude liability for intent or gross negligence, or for harm to life or health, nor limit consumers' mandatory rights.]

We are not responsible for:
- what other users or organisations decide or do;
- the content of public job advertisements from public employment services;
- the services of third parties you choose to use, such as your own AI assistant.

## 13. Suspension and ending

- You can stop using the platform at any time. You can ask for your account and data to be deleted in **Dashboard → Privacy** (see the Privacy Policy).
- We may suspend or close an account that seriously or repeatedly breaks these Terms or the law. Where possible we warn you first and tell you why. [OWNER DECISION: rules and appeal route]
- When the contract ends, the Privacy Policy decides what happens to your data, including what we must keep by law.

## 14. Changes to these Terms

We may update these Terms. We show the new version and its date. We tell you in the product before material changes apply. [OWNER DECISION: notice period] If you do not agree, you can stop using the platform before the change applies.

## 15. Governing law and disputes

- These Terms and every customer contract are governed by the law of the Republic of Lithuania.
- Disputes go to the competent courts of Lithuania.
- These two rules apply except where mandatory consumer, employment, data-protection or other law gives you rights or a forum that cannot be taken away. If you are a consumer, you always keep the mandatory rights of the country where you live.
- Consumers may also turn to the State Consumer Rights Protection Authority of Lithuania (Valstybinė vartotojų teisių apsaugos tarnyba) for out-of-court resolution. [LAWYER: verify]
- Please contact us first at info@labourmarket.ai. We would like to solve the problem with you.

## 16. Version

**v2 (draft), 2026-10-15.** Replaces the earlier three-section page.
