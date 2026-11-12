# SV consent / legal texts — owner review packet v1 (2026-11-12)

Status: **DRAFT FOR OWNER REVIEW, NOT APPROVED, NOT APPLIED.** This follows owner decision 2026-11-11, option A: Swedish versions of the three consent definitions for the Swedish business tester programme. Until the owner approves them and applies the RED re-pin migration, Swedish users see the **clearly labelled English** text (the J-2 fallback). This branch must not be deployed on its own.

Source of truth: `apps/web/lib/privacy/consent-definitions.ts`. The EN column below is copied verbatim from it.
- **Seven blocks** per definition.
- **Placeholders** `{companyName}` and `{contextTitle}` stay as they are.
- **Legal entity strings** are copied, never translated: UAB ”Nonstop Group”, company code 302676973, Labour Market AI Sp. z o.o., info@labourmarket.ai.

The table was generated from the registry itself, so it matches the code.

## Content equivalence (checked against EN)

| Check | Result |
|---|---|
| **Scope:** purpose, recipients, data categories, use | Unchanged. No version bump: 2026-07-11.v2 / 2026-07-11.v2 / 2026-09-04.v1 stay. |
| **Verbatim facts** in every block where EN has them: controller name, company code, privacy e-mail, software owner, brand, placeholders | Present. Test: `consent-definitions.test.ts` "keeps every verbatim fact of en". |
| **Emphasised negation:** EN "NOT" becomes SV "INTE" | Present (3.invisibleData). Tested. |
| **Partner record:** never called anonymised (owner correction 2026-09-20) | Called "utan direkt identifierande uppgifter". "anonym"/"avidentifierad" appears nowhere. Tested. |
| **Withheld data, partner network:** name, e-mail, phone, address, CV file, document copies, work journal | All seven named. Tested. |
| **Optional:** "not required to use…" | "krävs inte för att använda…" in all three. |
| **Withdrawal:** where and with what effect | Same effect sentence as EN in all three, including the honest limit in 2.withdrawal ("företaget kan ha sett uppgifterna medan tillståndet gällde"). |

## Terminology (GDPR, Swedish official wording)

| EN | SV used | Note |
|---|---|---|
| data controller | personuppgiftsansvarig | GDPR art. 4.7 (Swedish text of the regulation, IMY usage) |
| personal data | personuppgifter | |
| consent | samtycke | |
| withdraw / revoke | återkalla (consent, permission); stänga av (a setting switch) | |
| privacy settings | integritetsinställningar | |
| staffing agency | bemanningsföretag | |
| work journal | arbetsdagbok | product term |
| without direct identifying data | utan direkt identifierande uppgifter | pseudonymised, never "anonym" |
| opaque reference | ogenomskinlig referens | literal rendering of EN. **Owner/legal review point:** an alternative is "intern referenskod". |
| credential classes | behörighetsklasser | |
| company code (LT) | företagskod | a Lithuanian code, not a Swedish organisationsnummer |
| Lithuania | Litauen | |

Quotation marks follow Swedish style (”…”). Address form is "du", as in the Swedish UI.

## What a native/legal reviewer should look at

1. 3.visibleData: is "ogenomskinlig referens" clear enough to a lay reader?
2. 2.withdrawal: is "upphävs" right for "cancelled" (access links)? An alternative is "ogiltigförklaras".
3. 1.summary: "jobberbjudanden och urval av kandidater" is meant as a faithful "job offers and candidate selection".

## Versioning, language and time of each consent

Already in place, so no schema change is needed:
- every `privacy_consent_events` row records `consent_text_version`, `consent_text_hash`, `locale` and `created_at`;
- the grant RPCs refuse a stale (version, hash) and an unlisted locale.

After the apply, a Swedish grant is recorded with `locale = 'sv'` and the new hash. Past grants keep their own version and hash as evidence, and none is touched.

## Migration and rollback

The migration is `supabase/migrations/20261112120000_privacy_consent_locale_sv_v1.sql` (RED, draft, NOT applied). It is modelled on the PL pair 20260920173000 + 20260922140000, folded into one file. It does two things:
- re-pins three hashes; each UPDATE names the hash it replaces, and a check refuses the file unless all three moved;
- adds `'sv'` to the locale allowlist of the three grant functions. The bodies are otherwise byte-identical to production (prosrc md5 matched).

PG16 proof: `scripts/db-proof/privacy-consent-locale-sv-v1.sh`, 19/19. It covers:
- before the apply, sv is refused;
- after it, the pins move, an sv grant records its locale and time, an old pin is refused, an unknown language is refused, and Polish evidence is unchanged;
- anon is refused, and SECURITY DEFINER plus search_path are kept;
- the apply is idempotent;
- the rollback restores the pins and the production bodies, refuses sv again and keeps the sv evidence; running it twice is idempotent;
- a drifted pin refuses the whole file.

**Safe deploy:** apply the migration in the same step as the deploy of this registry change. In between, a new grant is refused as stale, never recorded against the wrong text.

**Safe rollback:** roll the app back first (remove `sv`), then run the down file. Swedish consent events stay as evidence.

Owner sentence that closes this packet: **"APPROVE SV CONSENT TEXTS v1"** (optionally with edits inline), plus a separate apply approval for 20261112120000.

## The texts

### 1. `profile_discoverability` (version 2026-07-11.v2, unchanged)

| Block | EN (verbatim source) | SV (proposed) |
|---|---|---|
| title | Allow companies to find my professional profile | Låt företag hitta min yrkesprofil |
| summary | By choosing this option you allow registered companies and agencies to see a limited part of your professional profile for job offers and candidate selection. | Genom att välja det här alternativet låter du registrerade företag och bemanningsföretag se en begränsad del av din yrkesprofil för jobberbjudanden och urval av kandidater. |
| visibleData | Companies will be able to see your profession, experience, skills, preferred work region, availability, languages and the other professional information clearly listed in the preview. | Företag kommer att kunna se ditt yrke, din erfarenhet, dina färdigheter, önskad arbetsregion, tillgänglighet, språk och den övriga yrkesinformation som tydligt anges i förhandsvisningen. |
| invisibleData | Your phone number, email address, full CV, exact address and private documents will not be shared without your separate confirmation. | Ditt telefonnummer, din e-postadress, ditt fullständiga CV, din exakta adress och dina privata dokument delas inte utan din separata bekräftelse. |
| freedom | This choice is not required to use your account, CV or work journal. If you do not enable it, your profile stays private. | Det här valet krävs inte för att använda ditt konto, ditt CV eller din arbetsdagbok. Om du inte aktiverar det förblir din profil privat. |
| withdrawal | You can switch this off at any time in your privacy settings. Once switched off, your profile no longer appears in new company searches. | Du kan stänga av detta när som helst i dina integritetsinställningar. När det är avstängt visas din profil inte längre i nya sökningar som företag gör. |
| controller | The data controller is UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The software owner Labour Market AI Sp. z o.o. does not receive your personal data. | Personuppgiftsansvarig är UAB ”Nonstop Group” (företagskod 302676973, Litauen). Kontakt i integritetsfrågor: info@labourmarket.ai. Programvarans ägare Labour Market AI Sp. z o.o. tar inte emot dina personuppgifter. |

### 2. `employer_data_disclosure` (version 2026-07-11.v2, unchanged)

| Block | EN (verbatim source) | SV (proposed) |
|---|---|---|
| title | Confirm data transfer to a company | Bekräfta överföring av uppgifter till ett företag |
| summary | You allow LabourMarket.ai to transfer the data listed below to “{companyName}” for “{contextTitle}”. | Du tillåter LabourMarket.ai att överföra de uppgifter som anges nedan till ”{companyName}” för ”{contextTitle}”. |
| visibleData | Only the fields listed in this confirmation (for example name, contact details or a CV file) will be transferred. Nothing else is shared. | Endast de fält som anges i den här bekräftelsen (till exempel namn, kontaktuppgifter eller en CV-fil) överförs. Inget annat delas. |
| invisibleData | All your other data stays private. This confirmation is not valid for other companies or other needs. | Alla dina övriga uppgifter förblir privata. Den här bekräftelsen gäller inte för andra företag eller andra behov. |
| freedom | The transfer happens only after your active confirmation. Without it, no data is passed to the company and your account keeps working. | Överföringen sker först efter din aktiva bekräftelse. Utan den lämnas inga uppgifter till företaget och ditt konto fortsätter att fungera. |
| withdrawal | You can revoke this permission in your privacy settings. New transfers stop and platform-generated access links are cancelled, but the company may have seen the data while the permission was valid — we state this honestly. | Du kan återkalla det här tillståndet i dina integritetsinställningar. Nya överföringar stoppas och åtkomstlänkar som plattformen har skapat upphävs, men företaget kan ha sett uppgifterna medan tillståndet gällde – det säger vi öppet. |
| controller | The transfer is performed by the data controller UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. Data goes only to the company named in the confirmation — not to Labour Market AI Sp. z o.o. | Överföringen utförs av den personuppgiftsansvarige UAB ”Nonstop Group” (företagskod 302676973, Litauen). Kontakt i integritetsfrågor: info@labourmarket.ai. Uppgifterna går endast till det företag som anges i bekräftelsen – inte till Labour Market AI Sp. z o.o. |

### 3. `partner_supply_representation` (version 2026-09-04.v1, unchanged)

| Block | EN (verbatim source) | SV (proposed) |
|---|---|---|
| title | Allow my availability to be represented in the partner opportunity network | Tillåt att min tillgänglighet representeras i partnernätverket för arbetsmöjligheter |
| summary | By choosing this option you allow LabourMarket.ai to represent your professional availability inside the partner opportunity network, which looks for work opportunities outside this platform as well. | Genom att välja det här alternativet låter du LabourMarket.ai representera din yrkesmässiga tillgänglighet i partnernätverket för arbetsmöjligheter, som även söker arbetsmöjligheter utanför den här plattformen. |
| visibleData | Only a professional summary without direct identifying data is passed on: an opaque reference, your professions, skills, years of experience, credential classes and whether they are currently valid, languages, the countries you can work in, the countries you agreed to be offered work in, your availability and start date. | Endast en yrkessammanfattning utan direkt identifierande uppgifter lämnas vidare: en ogenomskinlig referens, dina yrken, färdigheter, antal år av erfarenhet, behörighetsklasser och om de för närvarande är giltiga, språk, de länder där du får arbeta, de länder där du har gått med på att få arbetserbjudanden, din tillgänglighet och ditt startdatum. |
| invisibleData | Your name, email address, phone number, address, CV file, document copies and work-journal content are NOT passed on. The partner cannot technically receive them — the record that crosses over has no fields for them at all. | Ditt namn, din e-postadress, ditt telefonnummer, din adress, din CV-fil, dokumentkopior och innehållet i din arbetsdagbok lämnas INTE vidare. Partnern kan tekniskt sett inte ta emot dem – posten som förs över har inga fält för dem alls. |
| freedom | This choice is not required to use your account, CV, work journal or to be found inside LabourMarket.ai. If you do not enable it, your availability does not appear in the partner network. | Det här valet krävs inte för att använda ditt konto, ditt CV eller din arbetsdagbok eller för att kunna hittas inom LabourMarket.ai. Om du inte aktiverar det visas din tillgänglighet inte i partnernätverket. |
| withdrawal | You can withdraw this at any time in your privacy settings. Once withdrawn, your record disappears from the next partner-network rebuild — that view is rebuilt whole each time, so a withdrawn consent is not left behind as a historical entry. | Du kan återkalla detta när som helst i dina integritetsinställningar. Efter återkallelsen försvinner din post vid nästa ombyggnad av partnernätverket – den vyn byggs om i sin helhet varje gång, så ett återkallat samtycke ligger inte kvar som en historisk post. |
| controller | The data controller is UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The partner infrastructure processes data only on the controller’s instructions and receives only this summary without direct identifying data; the software owner Labour Market AI Sp. z o.o. does not receive your personal data. | Personuppgiftsansvarig är UAB ”Nonstop Group” (företagskod 302676973, Litauen). Kontakt i integritetsfrågor: info@labourmarket.ai. Partnerinfrastrukturen behandlar uppgifter endast enligt den personuppgiftsansvariges instruktioner och tar endast emot denna sammanfattning utan direkt identifierande uppgifter; programvarans ägare Labour Market AI Sp. z o.o. tar inte emot dina personuppgifter. |
