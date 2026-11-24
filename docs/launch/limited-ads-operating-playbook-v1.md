# Limited-Ads Operating Playbook v1

**Date:** 2026-07-15 · Companion to `pre-advertising-launch-readiness-v1.md` and `launch-blocker-register-v1.md`.

Purpose: the operational rules for running the FIRST limited, worker-acquisition-only campaign safely, and for handling any company request that arrives. Nothing here is auto-published; SLA and staffing lines marked **owner-only** require the owner's decision.

---

## 1. What is being advertised (and what is not)

- **Advertise:** worker acquisition — "build your work profile / internal CV." One audience, one locale-prefixed landing per ad.
- **Do NOT advertise (yet):** any employer/company promise ("find workers", "guaranteed staff", response times, prices). Employer supply is not ready (register §C2).
- **No** guaranteed job, guaranteed workers, "AI finds the perfect match", real-time European coverage, official Eurostat endorsement, or automatic skill verification — in any ad or landing copy.

---

## 2. Pre-flight checklist (all must be true before spend)

- [ ] PR `feat/pre-advertising-launch-readiness-v1` merged.
- [ ] Migration `20260713190000` applied to production (owner intake queue reads).
- [ ] Google OAuth branding configured (register §E1) — consent screen reads LabourMarket.ai.
- [ ] Every ad URL is locale-prefixed (`/lt/…`, `/en/…`) and points at the app host, not a Vercel preview (OAuth stays same-origin).
- [ ] Owner alert channel confirmed working AND the admin intake queue loads (no grant-required banner).
- [ ] Acquisition-Funnel panel (`/dashboard/admin/telemetry`) shows events after a manual test landing (confirm delivery once).
- [ ] Small daily budget cap set; one campaign; kill-switch owner knows.

---

## 3. Conversion measurement — how to read it

- Owner view: `/dashboard/admin/telemetry` → **Acquisition funnel** panel.
- Stages: landing_viewed → cta_clicked → role_selected → registration_started → onboarding_started → onboarding_completed; and company_need_started → company_need_submitted.
- Rates: landing→CTA, landing→registration, onboarding completion, company-need submit.
- First-touch `utm_source` breakdown of conversions.
- Use the **"exclude admins"** filter to remove owner/test navigation from the numbers.
- Counts are event occurrences over a recent window, **not** unique visitors, and carry **no** revenue attribution. Duplicates/test records: exclude admin sessions; treat the ~10 test/demo accounts and any launch-readiness test submissions as non-real (remove test records after verification).
- **PII rule:** events never contain CV/job-text/email/phone/name/token. Do not add such keys to the allowlist.

---

## 4. Company-request response operations (if a company request arrives)

Even in a worker-only campaign, a company may submit `/company-need`. Handle it:

1. **See it:** `/dashboard/admin/company-need-intakes`. If a "grant-required" banner shows, the grant migration is not applied — apply it (register §B1); until then rely on the owner alert.
2. **Status flow:** `new → contacted → qualified → rejected`. (Transition audit of actor/timestamp/note is an owner-gated schema follow-up — register §F1; until then, keep a manual note of who actioned what.)
3. **Contact:** the contact email is required, so every intake is reachable. Do not expose the requester's details to anyone unauthorized.
4. **Duplicates:** no idempotency yet (register §F1) — a double-submit creates two rows + two alerts; de-dup by company + created_at manually.

---

## 5. First-response templates (drafts — owner may edit; no unapproved promises)

These are neutral acknowledgements. They must NOT promise guaranteed workers, jobs, response times, or prices unless the owner has approved that wording.

**EN** — "Thank you for your request on LabourMarket.ai. We've received your workforce need and will review it. We'll get back to you at the email you provided. If anything changes, just reply to this message."

**LT** — "Ačiū, kad kreipėtės į LabourMarket.ai. Gavome jūsų darbuotojų poreikį ir jį peržiūrėsime. Susisieksime nurodytu el. paštu. Jei kas pasikeis, tiesiog atsakykite į šią žinutę."

**RU** — "Спасибо за ваш запрос на LabourMarket.ai. Мы получили вашу потребность в персонале и рассмотрим её. Мы свяжемся с вами по указанному адресу электронной почты. Если что-то изменится, просто ответьте на это сообщение."

**NL** — "Bedankt voor je aanvraag op LabourMarket.ai. We hebben je personeelsbehoefte ontvangen en bekijken deze. We nemen contact met je op via het opgegeven e-mailadres. Als er iets verandert, reageer dan op dit bericht."

**DE** — "Vielen Dank für Ihre Anfrage bei LabourMarket.ai. Wir haben Ihren Personalbedarf erhalten und prüfen ihn. Wir melden uns unter der angegebenen E-Mail-Adresse. Falls sich etwas ändert, antworten Sie einfach auf diese Nachricht."

---

## 6. Internal launch SLA rule (owner-only staffing decisions marked)

Not published as a public SLA. Internal expectation:
- **Who checks new requests:** _owner-only decision_ (default: the owner) — checks the intake queue + alert channel.
- **Where they appear:** `/dashboard/admin/company-need-intakes` + owner alert.
- **Working-hours expectation:** _owner-only_ — do not publish a response time that cannot be maintained.
- **Fallback if owner unavailable:** _owner-only_ — name a backup checker or a "we review within N working days" internal target.
- **High-urgency escalation:** intake carries an `urgency` field; owner decides escalation.
- **Spam/duplicates:** exclude admin/test sessions from metrics; de-dup intakes manually until idempotency ships.

---

## 7. Failure & recovery expectations

| Failure | Honest recovery today |
|---|---|
| Company submit fails to persist | Form degrades to "prepared — create an account" (no false success); user data retained. |
| Owner alert fails | DB row still exists once the grant migration is applied → queue is the durable source of truth. |
| CV upload/parse fails | Specific per-code message; no fake success; user can retry/correct. |
| Google login cancelled | Password-login hint surfaced; no dead end. |
| Wrong locale from ad | Language switcher now visible on mobile (this PR) — user can switch. |
| Eurostat data unavailable | Intelligence cards degrade honestly ("prepared / pending"). |

---

## 8. Hard stops (do not do during this campaign)

- Do not advertise an employer promise until supply is real.
- Do not activate payments/Stripe, or merge PR #754.
- Do not activate another external data source (Eurostat stays the only one).
- Do not weaken RLS/consent/contact-permission to "make discovery work".
- Do not publish a support-time SLA that cannot be maintained.
- Do not manufacture fake workers/employers/testimonials/metrics.
