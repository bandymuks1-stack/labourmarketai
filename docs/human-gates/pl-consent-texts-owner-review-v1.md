# PL consent / legal texts — owner review packet v1 (2026-09-20)

Status: **APPROVED 2026-09-20 — IN CODE (PR #1810).** Owner sentence: "APPROVE PL CONSENT TEXTS v1
WITH REQUIRED INLINE EDITS". Definitions 1 and 2 landed as drafted below. Definition 3 landed WITH
the required correction: the exported record is never called anonymised / zanonimizowane /
de-identified. Canonical term in all six locales: EN "professional summary without direct
identifying data", PL "podsumowanie zawodowe pozbawione bezpośrednich danych identyfikujących",
LT "profesinė santrauka be tiesioginių identifikuojančių duomenų", RU "профессиональная сводка
без прямых идентифицирующих данных", NL "professionele samenvatting zonder directe identificerende
gegevens", DE "berufliche Zusammenfassung ohne direkt identifizierende Daten" (3.visibleData,
3.controller, `recipientCategory`, `privacyConsent.partnerSupply.sectionIntro`). The PL table
below keeps the ORIGINAL proposal for the record; the code is the source of truth.

Verification against production (2026-09-20, read-only SQL + code): the outbound payload is
`first_party_supply_feed_v1()` — its select list has no name/email/phone/address/CV/document/
journal field (actorRef = `lm:<type>:<declaration uuid>`), the consumer contract enforces
`FORBIDDEN_IDENTITY_KEYS` at runtime, and the function is recomputed per call filtered by the
NEWEST consent event (withdrawal = absent from the next read). `profiles` (email/phone/full_name)
is readable only by the owner or an admin; `workers` under `can_view_worker` carries no address,
phone or email column. `withdraw_employer_data_disclosure` appends a `withdrawn` event (readers
are latest-wins) and stamps `revoked_access_at`; "platform-generated access links" = the
`contact_disclosure_requests` asks, which expire and are re-checked live via
`has_employer_data_disclosure`. Controller / software-owner statements are the owner's legal
declarations (v2 controller-identity migration); this repo asserts them consistently and cannot
prove corporate facts. Adding `pl` changed every purpose hash → re-pin migration
`20260920173000_privacy_consent_locale_pl_hash_repin_v1.sql` (GREEN, data-only), applied in the
same step as the #1810 deploy.

Source of truth: `apps/web/lib/privacy/consent-definitions.ts` (EN column below is verbatim).
Each definition has seven blocks. Placeholders `{companyName}` / `{contextTitle}` must stay.
Legal entity strings (UAB "Nonstop Group", company code 302676973, Labour Market AI Sp. z o.o.,
info@labourmarket.ai) are copied, never translated.

Owner sentence that closes this packet: **"APPROVE PL CONSENT TEXTS v1"** (optionally with edits
inline). Then: paste the three `pl:` blocks into the three definitions, add `"pl"` to
`CONSENT_LOCALES`, run `consent-definitions.test.ts`, and the consent readers stop falling back.

Legal categories used: **CONSENT** (GDPR Art. 6(1)(a) consent wording — the person's decision),
**PRIVACY NOTICE** (Art. 13 information: controller, recipients, withdrawal), **INFORMATIONAL**
(explains what is / is not shared; no decision text).

---

## 1. PROFILE_DISCOVERABILITY_V1 (purpose `profile_discoverability`, version 2026-07-11.v2)

Where it appears: `/[locale]/dashboard/privacy` — the "discoverability" choice card (title, summary,
visible / invisible data, freedom, withdrawal, controller line); the same texts are read by
`lib/privacy/discoverability-actions.ts` when the choice is recorded.

| Block | Category | EN (source) | PL (proposed) |
|---|---|---|---|
| title | CONSENT | Allow companies to find my professional profile | Zezwól firmom na znalezienie mojego profilu zawodowego |
| summary | CONSENT | By choosing this option you allow registered companies and agencies to see a limited part of your professional profile for job offers and candidate selection. | Wybierając tę opcję, zezwalasz zarejestrowanym firmom i agencjom na wgląd w ograniczoną część Twojego profilu zawodowego w celu składania ofert pracy i wyboru kandydatów. |
| visibleData | INFORMATIONAL | Companies will be able to see your profession, experience, skills, preferred work region, availability, languages and the other professional information clearly listed in the preview. | Firmy będą mogły zobaczyć Twój zawód, doświadczenie, umiejętności, preferowany region pracy, dostępność, języki oraz pozostałe informacje zawodowe wyraźnie wymienione w podglądzie. |
| invisibleData | INFORMATIONAL | Your phone number, email address, full CV, exact address and private documents will not be shared without your separate confirmation. | Twój numer telefonu, adres e-mail, pełne CV, dokładny adres i prywatne dokumenty nie będą udostępniane bez Twojego odrębnego potwierdzenia. |
| freedom | CONSENT | This choice is not required to use your account, CV or work journal. If you do not enable it, your profile stays private. | Ten wybór nie jest wymagany, aby korzystać z konta, CV ani dziennika pracy. Jeśli go nie włączysz, Twój profil pozostaje prywatny. |
| withdrawal | PRIVACY NOTICE | You can switch this off at any time in your privacy settings. Once switched off, your profile no longer appears in new company searches. | Możesz to wyłączyć w dowolnym momencie w ustawieniach prywatności. Po wyłączeniu Twój profil nie pojawia się już w nowych wyszukiwaniach firm. |
| controller | PRIVACY NOTICE | The data controller is UAB "Nonstop Group" (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The software owner Labour Market AI Sp. z o.o. does not receive your personal data. | Administratorem danych jest UAB "Nonstop Group" (kod przedsiębiorstwa 302676973, Litwa). Kontakt w sprawach prywatności: info@labourmarket.ai. Właściciel oprogramowania, Labour Market AI Sp. z o.o., nie otrzymuje Twoich danych osobowych. |

## 2. EMPLOYER_DATA_DISCLOSURE_V1 (purpose `employer_data_disclosure`, version 2026-07-11.v2)

Where it appears: the per-company disclosure confirmation (a worker approves a specific transfer
for a named company and context); read by `lib/privacy/contact-disclosure-actions.ts` and shown on
`/[locale]/dashboard/privacy` (disclosure list).

| Block | Category | EN (source) | PL (proposed) |
|---|---|---|---|
| title | CONSENT | Confirm data transfer to a company | Potwierdź przekazanie danych firmie |
| summary | CONSENT | You allow LabourMarket.ai to transfer the data listed below to "{companyName}" for "{contextTitle}". | Zezwalasz LabourMarket.ai na przekazanie wymienionych poniżej danych firmie "{companyName}" w związku z "{contextTitle}". |
| visibleData | INFORMATIONAL | Only the fields listed in this confirmation (for example name, contact details or a CV file) will be transferred. Nothing else is shared. | Przekazane zostaną wyłącznie pola wymienione w tym potwierdzeniu (na przykład imię i nazwisko, dane kontaktowe lub plik CV). Nic więcej nie jest udostępniane. |
| invisibleData | INFORMATIONAL | All your other data stays private. This confirmation is not valid for other companies or other needs. | Wszystkie pozostałe dane pozostają prywatne. To potwierdzenie nie obowiązuje wobec innych firm ani innych zapytań. |
| freedom | CONSENT | The transfer happens only after your active confirmation. Without it, no data is passed to the company and your account keeps working. | Przekazanie następuje wyłącznie po Twoim aktywnym potwierdzeniu. Bez niego żadne dane nie trafiają do firmy, a Twoje konto działa dalej. |
| withdrawal | PRIVACY NOTICE | You can revoke this permission in your privacy settings. New transfers stop and platform-generated access links are cancelled, but the company may have seen the data while the permission was valid — we state this honestly. | Możesz cofnąć to zezwolenie w ustawieniach prywatności. Nowe przekazania zostają wstrzymane, a wygenerowane przez platformę linki dostępu unieważnione, jednak firma mogła zobaczyć dane w czasie, gdy zezwolenie obowiązywało — mówimy o tym wprost. |
| controller | PRIVACY NOTICE | The transfer is performed by the data controller UAB "Nonstop Group" (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. Data goes only to the company named in the confirmation — not to Labour Market AI Sp. z o.o. | Przekazania dokonuje administrator danych UAB "Nonstop Group" (kod przedsiębiorstwa 302676973, Litwa). Kontakt w sprawach prywatności: info@labourmarket.ai. Dane trafiają wyłącznie do firmy wskazanej w potwierdzeniu — nie do Labour Market AI Sp. z o.o. |

## 3. PARTNER_SUPPLY_REPRESENTATION_V1 (purpose `partner_supply_representation`, version 2026-09-04.v1)

Where it appears: `/[locale]/dashboard/privacy` — the partner-network representation choice card;
read by `lib/privacy/partner-supply-actions.ts` when the choice is recorded.

| Block | Category | EN (source) | PL (proposed) |
|---|---|---|---|
| title | CONSENT | Allow my availability to be represented in the partner opportunity network | Zezwól na reprezentowanie mojej dostępności w partnerskiej sieci ofert pracy |
| summary | CONSENT | By choosing this option you allow LabourMarket.ai to represent your professional availability inside the partner opportunity network, which looks for work opportunities outside this platform as well. | Wybierając tę opcję, zezwalasz LabourMarket.ai na reprezentowanie Twojej dostępności zawodowej w partnerskiej sieci ofert pracy, która poszukuje możliwości pracy również poza tą platformą. |
| visibleData | INFORMATIONAL | Only a de-identified professional summary is passed on: an opaque reference, your professions, skills, years of experience, credential classes and whether they are currently valid, languages, the countries you can work in, the countries you agreed to be offered work in, your availability and start date. | Przekazywane jest wyłącznie zanonimizowane podsumowanie zawodowe: nieprzejrzysty identyfikator, Twoje zawody, umiejętności, lata doświadczenia, klasy uprawnień i to, czy są obecnie ważne, języki, kraje, w których możesz pracować, kraje, w których zgodziłeś(-aś) się otrzymywać oferty pracy, Twoja dostępność i data rozpoczęcia. |
| invisibleData | INFORMATIONAL | Your name, email address, phone number, address, CV file, document copies and work-journal content are NOT passed on. The partner cannot technically receive them — the record that crosses over has no fields for them at all. | Twoje imię i nazwisko, adres e-mail, numer telefonu, adres, plik CV, kopie dokumentów i treść dziennika pracy NIE są przekazywane. Partner nie może ich technicznie otrzymać — przekazywany rekord w ogóle nie ma na nie pól. |
| freedom | CONSENT | This choice is not required to use your account, CV, work journal or to be found inside LabourMarket.ai. If you do not enable it, your availability does not appear in the partner network. | Ten wybór nie jest wymagany, aby korzystać z konta, CV, dziennika pracy ani aby być widocznym wewnątrz LabourMarket.ai. Jeśli go nie włączysz, Twoja dostępność nie pojawia się w sieci partnerskiej. |
| withdrawal | PRIVACY NOTICE | You can withdraw this at any time in your privacy settings. Once withdrawn, your record disappears from the next partner-network rebuild — that view is rebuilt whole each time, so a withdrawn consent is not left behind as a historical entry. | Możesz to wycofać w dowolnym momencie w ustawieniach prywatności. Po wycofaniu Twój rekord znika przy najbliższym przebudowaniu sieci partnerskiej — ten widok jest za każdym razem budowany od nowa w całości, więc wycofana zgoda nie pozostaje jako wpis historyczny. |
| controller | PRIVACY NOTICE | The data controller is UAB "Nonstop Group" (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The partner infrastructure processes data only on the controller's instructions and receives only this de-identified summary; the software owner Labour Market AI Sp. z o.o. does not receive your personal data. | Administratorem danych jest UAB "Nonstop Group" (kod przedsiębiorstwa 302676973, Litwa). Kontakt w sprawach prywatności: info@labourmarket.ai. Infrastruktura partnerska przetwarza dane wyłącznie na polecenie administratora i otrzymuje jedynie to zanonimizowane podsumowanie; właściciel oprogramowania, Labour Market AI Sp. z o.o., nie otrzymuje Twoich danych osobowych. |

---

Notes for the owner's review:
- "zgodziłeś(-aś) się" in 3.visibleData is the gender-inclusive past form; an alternative without the
  bracket is "w których wyrażono zgodę na otrzymywanie ofert pracy".
- The EN quotes around company names use typographic quotes ("…"); the PL strings keep the same
  characters as the source file (they are copied, not retyped) when pasted into code.
- Nothing here changes the meaning, scope, recipients or data categories of any definition; if the
  owner edits meaning, the definition VERSION must bump per the file's own rule.
