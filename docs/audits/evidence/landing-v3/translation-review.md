# Landing V3 — second, independent review of the ru / pl / de / nl texts

Date: 2026-11-13. This text contains no personal data, no secrets, no security-vulnerability detail, no commercial facts.

**What this is.** Each language was read by a separate automated reviewer that had not written the translation, against the owner-approved Lithuanian and English texts: meaning, polite form of address, consistent terms, placeholders and tags, length of card labels, spelling and grammar.

**What this is not.** No native speaker has read these texts. **Every string in all four languages is still NOT confirmed by a native speaker** — the ones changed here, the ones left as they were, and the ones listed as open questions. A native-speaker review is still recommended before release.

| Language | Strings checked | Changed after review | Proposed but not applied | Open questions for a native speaker | Confirmed by a native speaker |
|---|---|---|---|---|---|
| Russian (ru) | 183 | 19 | 2 | 9 | 0 |
| Polish (pl) | 183 | 20 | 3 | 9 | 0 |
| German (de) | 183 | 12 | 4 | 12 | 0 |
| Dutch (nl) | 183 | 12 | 2 | 8 | 0 |

The 183 strings are the landing's own texts: `landing.v3.*`, `landing.entry.*`, `landing.requestDoors.*`, `landing.openJobs.*`, `siteNav.intents.*`, `siteNav.links.*`, `consent.banner.*` and the other keys the V3 copy table touched.

## Russian (ru)

### Changed

| Key | Before | After | Reason |
|---|---|---|---|
| `consent.banner.label` | Выбор об измерении использования | Настройка измерения использования | Ungrammatical: «выбор об…» is not a valid Russian construction. |
| `landing.entry.examples.hire` | Нужны 5 работников склада в Вильнюсе | Нужно 5 работников склада в Вильнюсе | With a numeral 5+ the idiomatic predicate is neuter singular «нужно». |
| `landing.entry.placeholder` | Напр.: нужны 5 работников склада | Напр.: нужно 5 работников склада | Same agreement fix as examples.hire; stays at 32 characters (limit 34). |
| `landing.entry.numbers` | Сейчас на платформе: {vacancies} активных объявлений · {employers} работодателей | Сейчас на платформе: активных вакансий — {vacancies} · работодателей — {employers} | Fixed genitive plural breaks for counts like 1 or 21-24; count-safe form as in landing.v3.market.line. Also aligns 'job advert' with «вакансии» used everywhere else. |
| `landing.entry.understood.find-workers` | Вы ищете работников. После входа опишите потребность — кандидаты показываются у конкретной потребности, если они есть. | Вы ищете работников. После входа опишите потребность — кандидаты показываются по конкретной потребности, если они есть. | «показываются у потребности» is a calque of LT 'prie poreikio'; «по» is the natural preposition (matches understood.candidates). |
| `landing.entry.unrecognised` | Не удалось точно определить потребность. Выберите один из вариантов: | Не удалось точно определить, что вам нужно. Выберите один из вариантов: | «определить потребность» is a calque here; natural wording echoes the field label «Что вам нужно?». |
| `landing.requestDoors.promise` | Опишите, какие работники, услуги или выполнение какого проекта вам нужны. Запрос передаётся команде LabourMarket.ai на рассмотрение. | Опишите, какие работники или услуги вам нужны либо какой проект требуется выполнить. Запрос передаётся команде LabourMarket.ai на рассмотрение. | «выполнение какого проекта вам нужны» is clumsy and breaks agreement; meaning unchanged. |
| `landing.requestDoors.workerSearch.body` | Укажите профессию, число работников, страну и дату начала работы. | Укажите профессию, количество работников, страну и дату начала работы. | Consistency with the form field «Количество работников» and understood.need-workers. |
| `landing.v3.how.s1.body` | Ищите работу, работников или услуги и ведите предложения и договорённости на платформе. | Ищите работу, работников или услуги и управляйте предложениями и договорённостями на платформе. | «вести предложения» is not idiomatic; 'tvarkykite / manage' = «управляйте». |
| `landing.v3.how.s4.body` | Ассистент предлагает варианты, а решения принимаете вы. Вы решаете, могут ли работодатели вас находить и раскрывать ли контакты. Рабочие записи видит организация, в которой вы работаете. | Ассистент предлагает варианты, а решения принимаете вы. Вы решаете, могут ли работодатели вас находить и раскрывать ли контакты. Записи о работе видит организация, в которой вы работаете. | «Рабочие записи» reads as 'working notes'; «записи о работе» is unambiguous and is the dominant form in the existing app locale. |
| `siteNav.account` | Для вошедших пользователей | Для авторизованных пользователей | «вошедших пользователей» is a calque of 'signed-in users'. |
| `siteNav.intents.agencies.title` | Для агентств | Агентствам | LT has the same text for short and title; align with the short label and with «Учебным заведениям» (dative, no «для»). |
| `siteNav.intents.agencies.description` | Управляйте клиентами агентства и предложениями кандидатов. | Работайте с клиентами агентства и предложениями по кандидатам. | «Управляйте клиентами» sounds like managing people; «предложениями кандидатов» reads as offers made BY candidates, while the source means proposals of candidates to clients. |
| `siteNav.intents.services.description` | Представьте свои услуги, находите заказы и отвечайте на запросы. | Представляйте свои услуги, находите заказы и отвечайте на запросы. | Verb aspect was mixed in one series (perfective + two imperfective). |
| `siteNav.links.commercial` | Предложения и контракты | Предложения и договоры | 'Sutartys' = «договоры», the standard term and the one used in the existing app locale (71 vs 7 for «контракт»). |
| `siteNav.links.createCv` | Создать бесплатное CV | Создать бесплатное резюме | Terminology: the other three rows of this set use «резюме» for CV. |
| `siteNav.links.marketListings` | Объявления рынка | Объявления на рынке | «Объявления рынка» is an unnatural genitive; matches «Вакансии на рынке». |
| `siteNav.links.workOpportunities` | Возможности работы | Возможности для работы | «Возможности работы» is an unnatural calque of 'darbo galimybės'; 22 characters. |
| `vacancySources.language.originalIn` | Язык объявления: {language} | Язык вакансии: {language} | Terminology: job advert is «вакансия» in every other row. |

### Proposed by the reviewer, not applied

| Key | Kept | Proposed | Why not applied |
|---|---|---|---|
| `landing.entry.exampleLabels.offerCapacity` | У нас есть свободные | Есть свободные люди | the longer label no longer fits two lines of the 375 px example chip (existing guard); these chips are not shown on the V3 landing |
| `landing.entry.exampleLabels.verifyWork` | Кто подтвердит | Кто подтвердит опыт | the longer label no longer fits two lines of the 375 px example chip (existing guard); these chips are not shown on the V3 landing |

### Open questions — NOT confirmed, for a native speaker to decide

| Key | Question |
|---|---|
| `landing.entry.nextHint` | 'Poreikis' is rendered «потребность» throughout (also landing.entry.understood.candidates, landing.v3.lead «базовая публикация потребности», landing.requestDoors.title, siteNav.links.companyNeed). It is consistent and matches the existing app locale, so it was kept, but «сохранить потребность» / «публикация потребности» sound bookish; a native speaker should decide whether «заявка» is better product-wide. If so, 'how to apply' (see next item) must not also use «заявка». |
| `landing.openJobs.sub` | 'How to apply' is «способ подачи заявки» (also landing.v3.adverts.sub). Correct, but «как откликнуться» is the usual job-site wording and avoids a clash with «запрос»/«заявка» used for enquiries. |
| `landing.entry.login` | «учётная запись» is consistent within this set, but the existing app locale uses «аккаунт» far more often (about 207 vs 39 occurrences). Decide which one the landing page should follow. |
| `siteNav.links.createCv` | Changed to «резюме» for consistency inside this set; the app locale itself mixes «CV» and «резюме» (and has a 'Living CV' product name). If «CV» is the product term, change the three landing.entry.understood.cv* rows instead. |
| `siteNav.intents.contractors.short` | Contractor is «исполнитель» (consistent in this set); the app locale more often uses «подрядчик». «Исполнитель» fits all professions better; confirm. |
| `siteNav.links.projectEnquiry` | 31 characters, one over the 30-character guideline; no shorter wording keeps 'individual'. Same for siteNav.links.forWorkers (31), which also repeats the root «работает … работников» — «Как это устроено для работников» would avoid the repetition but breaks the parallel with the agencies/companies links. |
| `landing.entry.examples.logWork` | «отработал» is masculine; Russian past tense forces a gender. A neutral option: «Сегодня 8 часов работы на объекте Green Tower». |
| `landing.entry.understood.add-document` | «записать документ» is understandable but «добавить» or «внести» is more natural for adding a document to a profile; source says 'record'. |
| `landing.entry.family.agency` | «Вы говорите как…» follows LT 'Kalbate'; the user is typing, EN says 'writing'. «Вы пишете как…» may fit better (applies to all landing.entry.family.* rows). |

## Polish (pl)

### Changed

| Key | Before | After | Reason |
|---|---|---|---|
| `consent.banner.accept` | Zezwól na pomiar | Zezwalam na pomiar | Informal 2nd-person singular imperative; brief requires formal/impersonal address. First-person button form is standard on Polish consent banners. |
| `consent.banner.refuse` | Odmów | Odmawiam | Informal 2nd-person singular imperative; brief requires formal/impersonal address. Matches the first-person form of the accept button. |
| `consent.banner.label` | Wybór dotyczący pomiaru korzystania | Wybór dotyczący pomiaru korzystania z serwisu | 'pomiaru korzystania' is left dangling in Polish; needs an object. |
| `landing.entry.browseJobs` | Przegląd ofert pracy | Przeglądanie ofert pracy | 'Przegląd' reads as 'overview/review', not the action of browsing. |
| `landing.entry.examples.professional` | Jestem księgowym i szukam pracy w Wilnie | Jestem księgową i szukam pracy w Wilnie | LT source is feminine ('buhalterė'); translation switched to masculine. |
| `landing.entry.numbers` | Teraz na platformie: {vacancies} aktywnych ogłoszeń o pracę · {employers} pracodawców | Teraz na platformie – aktywne oferty pracy: {vacancies} · pracodawcy: {employers} | Terminology: job advert is 'oferta pracy' everywhere else; fixed genitive plural is wrong for counts like 1 or 2-4, label:number form is plural-safe (same pattern as landing.v3.market.line). |
| `landing.entry.refreshed` | odświeżono {date} | zaktualizowano {date} | Consistency with 'Ostatnia aktualizacja ofert' (same LT verb 'atnaujinta'); 'odświeżono' is a calque. |
| `landing.entry.understood.need-service` | Potrzebują Państwo wykonawcy pracy. Po zalogowaniu zobaczą Państwo, kto oferuje taką usługę. | Potrzebują Państwo kogoś, kto wykona pracę. Po zalogowaniu zobaczą Państwo, kto oferuje taką usługę. | 'wykonawcy pracy' is unnatural Polish; source says 'someone to carry out a job'. |
| `landing.entry.understood.offer-capacity` | Mają Państwo wolnych pracowników lub wolne moce. Można złożyć swoją ofertę. | Mają Państwo wolnych pracowników lub wolne zasoby. Można złożyć swoją ofertę. | 'wolne moce' alone is not idiomatic ('moce przerobowe' is industrial); 'wolne zasoby' fits all sectors. |
| `landing.openJobs.sub` | Przeglądanie nie wymaga konta; po zalogowaniu zobaczysz pracodawcę, miejsce i sposób aplikowania. | Przeglądanie nie wymaga konta; po zalogowaniu widoczni są pracodawca, miejsce i sposób aplikowania. | Informal 'zobaczysz' (ty); impersonal form as in landing.v3.adverts.sub. |
| `landing.openJobs.title` | Prawdziwe oferty pracy, otwarte teraz. | Prawdziwe oferty pracy, aktywne teraz. | 'otwarte oferty' is a calque of EN 'open'; LT says 'aktyvūs' and all other rows use 'aktywne'. |
| `landing.requestDoors.countryChoose` | Wybierz kraj | Proszę wybrać kraj | Informal 2nd-person singular imperative; brief requires formal/impersonal address. |
| `landing.requestDoors.workerSearch.title` | Zapytanie o poszukiwanie pracowników | Zapytanie o rekrutację pracowników | 'Zapytanie o poszukiwanie' is clumsy; 'rekrutacja pracowników' is the natural term (EN 'recruitment'). |
| `siteNav.intents.agencies.description` | Zarządzanie klientami agencji i ofertami kandydatów. | Zarządzanie klientami agencji i propozycjami kandydatów. | 'oferty kandydatów' reads as offers made by candidates; source means candidates proposed to clients (cf. 'zaproponować kandydata'). |
| `siteNav.links.companyNeed` | Opisz potrzebę | Opis zapotrzebowania | Informal 2nd-person singular imperative; brief requires formal/impersonal address. Also terminology: need/request is 'zapotrzebowanie' in all other rows, not 'potrzeba'. |
| `siteNav.links.createCv` | Utwórz darmowe CV | Tworzenie bezpłatnego CV | Informal 2nd-person singular imperative; brief requires formal/impersonal address. 'bezpłatne' matches the wording used for 'free' elsewhere. |
| `siteNav.links.network` | Twoja sieć | Państwa sieć | Informal 'Twoja'; sibling row uses 'Państwa usługi'. |
| `siteNav.links.partnerWithUs` | Zostań partnerem | Zostać partnerem | Informal 2nd-person singular imperative; brief requires formal/impersonal address. Infinitive mirrors LT 'Tapti partneriu'. |
| `siteNav.start.viewAll` | Wszystkie oferty | Wszystkie oferty pracy | Source says 'all job adverts'; identical source in landing.openJobs.all is 'Wszystkie oferty pracy'. |
| `vacancySources.language.originalIn` | Język ogłoszenia: {language} | Język oferty: {language} | Terminology: advert is 'oferta' in all other rows, 'ogłoszenie' here. |

### Proposed by the reviewer, not applied

| Key | Kept | Proposed | Why not applied |
|---|---|---|---|
| `landing.entry.signup` | Utwórz konto | Zakładam konto | standard Polish button imperative kept |
| `landing.requestDoors.send` | Wyślij zapytanie | Wysyłam zapytanie | standard Polish button imperative kept; first-person form judged unusual for a submit button |
| `landing.entry.exampleLabels.logWork` | Zapisz swoją pracę | Zapisać wykonaną pracę | the longer label no longer fits two lines of the 375 px example chip (existing guard); these chips are not shown on the V3 landing |

### Open questions — NOT confirmed, for a native speaker to decide

| Key | Question |
|---|---|
| `landing.v3.how.s3.body` | LT 'užsakovas' is 'Zamawiający' here but 'Klient' in landing.requestDoors.customer/project.body; decide on one term (Klient / Zamawiający / Zleceniodawca). Also 'kierownik organizacji pracodawcy' may read as THE head of the organisation; source means a manager within it ('kierownik w organizacji pracodawcy'). |
| `landing.entry.examples.brigade` | LT 'objektas' / EN 'site' is rendered 'budowa' (construction site) here and in examples.logWork, but 'obiekt' in understood.create-project. Platform covers all professions: decide whether 'budowa' is acceptable or 'obiekt' should be used throughout. |
| `landing.entry.examples.logWork` | 'przepracowałem' is masculine; LT is gender-neutral. A neutral alternative: 'Dziś 8 godzin pracy na budowie Green Tower'. |
| `landing.entry.family.hire` | Plural 'zapotrzebowaniach' (also 'zapotrzebowania' in understood.company-overview) is correct but heavy; 'potrzebach' would read more naturally at the cost of terminology consistency. |
| `landing.entry.understood.candidates` | 'kandydatów do swojego zapotrzebowania' is understandable but slightly awkward; a native speaker may prefer 'kandydatów dla swojego zapotrzebowania' or 'kandydatów do zgłoszonego zapotrzebowania'. |
| `siteNav.links.b2bEnquiry` | 33 characters (target <=30); same text as landing.requestDoors.b2b.title. Shorter option: 'Zapytanie B2B o usługi' (22). LT/EN sources are equally long, so may be acceptable. |
| `siteNav.links.projectEnquiry` | 32 characters (target <=30); same text as landing.requestDoors.project.title. Shorter option: 'Zapytanie o projekt' loses 'individual'. |
| `landing.entry.signup` | Proposed first-person 'Zakładam konto' to avoid the informal imperative; if the site keeps standard UI imperatives for buttons ('Utwórz konto', 'Wyślij zapytanie', 'Zezwól'), the owner should decide that globally - the current file mixes imperatives with noun forms ('Rejestracja agencji'). |
| `landing.entry.understood.add-document` | 'pažymėjimas' is rendered 'certyfikat' (also in understood.documents); 'zaświadczenie/świadectwo' may be closer for non-certificate attestations. Consistent as is. |

## German (de)

### Changed

| Key | Before | After | Reason |
|---|---|---|---|
| `landing.entry.examples.logWork` | Heute habe ich 8 Stunden an der Green Tower gearbeitet | Heute habe ich 8 Stunden auf der Baustelle Green Tower gearbeitet | Grammar: 'an der Green Tower' is wrong (Tower is masculine) and the source's 'site/objekte' was dropped. |
| `landing.entry.examples.hire` | Wir brauchen 5 Lagerarbeiter in Vilnius | Wir brauchen 5 Lagerkräfte in Vilnius | Consistency with landing.entry.placeholder ('Lagerkräfte'), also gender-neutral. |
| `landing.entry.family.student` | Sie sprechen über das Lernen und den Weg in die Arbeit. | Sie sprechen über das Lernen und den Weg in den Beruf. | 'Weg in die Arbeit' is unidiomatic German. |
| `landing.entry.understood.find-work` | Sie suchen Arbeit. Wir zeigen Ihnen Möglichkeiten nach Ihrem Beruf und Ort. | Sie suchen Arbeit. Wir zeigen Ihnen Möglichkeiten, die zu Ihrem Beruf und Ort passen. | 'Möglichkeiten nach Ihrem Beruf und Ort' is unnatural; source says opportunities that match profession and location. |
| `landing.openJobs.eyebrow` | Stellenangebote | Stellenanzeigen | Terminology: 'Darbo skelbimai' is 'Stellenanzeigen' in every other row (nav.jobs, siteNav.links.jobs). |
| `landing.openJobs.sub` | Ansehen geht ohne Konto; melden Sie sich an, um Arbeitgeber, Ort und Bewerbungsweg zu sehen. | Ansehen ist ohne Konto möglich; melden Sie sich an, um Arbeitgeber, Ort und Bewerbungsweg zu sehen. | 'Ansehen geht ohne Konto' is colloquial for a formal Sie register. |
| `landing.requestDoors.notice` | Mit dem Senden bestätigen Sie, dass Sie die <privacy>Datenschutzerklärung</privacy> gelesen haben. | Mit dem Senden der Anfrage bestätigen Sie, dass Sie die <privacy>Datenschutzerklärung</privacy> gelesen haben. | Source says 'by sending a request'; the object was dropped. |
| `landing.v3.lead` | Für Arbeitskräfte, Arbeitgeber und Dienstleister aller Berufe und Branchen. Die Registrierung und das einfache Melden eines Bedarfs sind kostenlos. | Für Arbeitskräfte, Arbeitgeber und Dienstleister aller Berufe und Branchen. Die Registrierung und die Basisveröffentlichung eines Bedarfs sind kostenlos. | 'das einfache Melden' reads as 'simply posting' and loses the limiting sense of 'basic' (pagrindinis) - could imply all posting is free. |
| `siteNav.intents.agencies.description` | Verwalten Sie die Kunden Ihrer Agentur und Kandidatenangebote. | Verwalten Sie die Kunden Ihrer Agentur und Kandidatenvorschläge. | 'Kandidatenangebote' is not idiomatic; candidates are proposed ('vorschlagen' is used in landing.entry.understood.propose-candidate). |
| `siteNav.intents.workers.short` | Personal finden | Arbeitskräfte finden | Terminology: 'Arbeitskräfte' is used for workers everywhere else (incl. the .title); 20 chars, still fits the card. |
| `siteNav.links.createCv` | Kostenlosen Lebenslauf erstellen | Lebenslauf kostenlos erstellen | Was 32 characters; this is 30 with identical meaning. |
| `siteNav.links.serviceRequests` | Leistungsanfragen | Dienstleistungsanfragen | Consistency with 'B2B-Dienstleistungsanfrage' / 'Dienstleistungsanfrage für Unternehmen'; 23 chars. |

### Proposed by the reviewer, not applied

| Key | Kept | Proposed | Why not applied |
|---|---|---|---|
| `landing.requestDoors.optional` | freiwillig | optional | 'optional' would equal the English string (untranslated-string guard); 'freiwillig' kept |
| `siteNav.intents.services.description` | Leistungen vorstellen, Aufträge finden, Anfragen beantworten. | Stellen Sie Ihre Dienstleistungen vor, finden Sie Aufträge und beantworten Sie Anfragen. | the long Sie-form is cut off on the 1440 px card; short form kept |
| `landing.entry.exampleLabels.hire` | Wir brauchen Leute | Ich brauche Arbeitskräfte | the longer label no longer fits two lines of the 375 px example chip (existing guard); these chips are not shown on the V3 landing |
| `landing.entry.exampleLabels.needService` | Ich brauche eine Leistung | Ich brauche eine Dienstleistung | the longer label no longer fits two lines of the 375 px example chip (existing guard); these chips are not shown on the V3 landing |

### Open questions — NOT confirmed, for a native speaker to decide

| Key | Question |
|---|---|
| `siteNav.intents.contractors.short` | 'Dienstleister finden' (20 chars) is acceptable: a Dienstleister is whoever delivers a service or carries out work, so it covers both halves of 'services or contractors', and the .title keeps the full wording. Only decide whether 'Auftragnehmer' should be visible on the card for construction users. |
| `siteNav.links.forAgencies` | Three 'So funktioniert es für ...' links are 32/34/36 characters (forAgencies, forCompanies, forWorkers) - over the 30-character ideal; the source labels are equally long. If they must shrink: 'Ablauf für Agenturen / Unternehmen / Arbeitskräfte' (20-24 chars). |
| `siteNav.intents.services.short` | 'Leistung' vs 'Dienstleistung': short labels use 'Leistungen' (services.short/.title, links.myServices, exampleLabels.offerService), body texts use 'Dienstleistungen'. Acceptable as a deliberate short form; decide whether to unify on 'Dienstleistungen' ('Dienstleistungen anbieten' = 25 chars). |
| `landing.v3.lead` | 'Arbeitskräfte' is used both for people being hired and for the audience addressed. As an audience label ('Für Arbeitskräfte', also siteNav.links.forWorkers) people rarely call themselves that; 'Beschäftigte' or 'Arbeitnehmer' would be more natural but excludes freelancers. Also check the proposed 'Basisveröffentlichung' against the real free scope. |
| `landing.requestDoors.project.title` | 'Einzelprojekt' means a single/one-off project; the source 'individualus projektas' may mean a custom, individually scoped project. 'Individuelle Projektanfrage' (27 chars) is the alternative; same for siteNav.links.projectEnquiry. |
| `landing.entry.exampleLabels.brigade` | 'Kolonne' is construction-site jargon (fits the example 'für die Baustelle') but the platform covers all professions; 'Team' or 'Arbeitsgruppe' is the neutral option. Label also says 'Ich suche' where the source says 'need'. |
| `landing.openJobs.title` | 'Echte Stellen, jetzt offen.' follows EN; LT says 'real job adverts, active now'. Since the adverts come from external sources, 'Echte Stellenanzeigen, jetzt aktiv.' claims less - owner should choose. |
| `landing.entry.placeholder` | 32 chars, within the 34 limit. Capital 'Wir' after 'Z. B.' is only correct if read as a quoted example sentence; otherwise 'Z. B. wir brauchen 5 Lagerkräfte'. |
| `landing.requestDoors.city` | 'Ort' for City next to 'Einsatzort' for Location may confuse; 'Stadt' is the literal alternative. 'Ort' is normal in German address forms, so left unchanged. |
| `landing.entry.examples.hire` | Gender policy: generic masculine is used throughout (Kandidaten, Kunden, Nutzer, Elektriker, Dienstleister, Auftragnehmer) while 'Lernende/Studierende' are neutral. Fine for a landing page, but decide if neutral forms are required. Also ich/wir: chips.hire says 'Ich brauche', the example and placeholder say 'Wir brauchen'. |
| `landing.entry.refreshed` | 'aktualisiert {date}' is correct only if {date} is an absolute date rendered without preposition; with a plain date 'aktualisiert am {date}' reads better - depends on the date format passed in. |
| `landing.entry.understood.create-project` | 'Objekt' for site/objektas is understood in construction and facility work but vague elsewhere; examples use 'Baustelle'. 'Einsatzort' would be the cross-sector word. |

## Dutch (nl)

### Changed

| Key | Before | After | Reason |
|---|---|---|---|
| `siteNav.links.companyNeed` | Beschrijf je behoefte | Beschrijf uw behoefte | Informal 'je' breaks the formal u/uw register. |
| `siteNav.links.network` | Jouw netwerk | Uw netwerk | Informal 'jouw' breaks the formal u/uw register (source: 'Jūsų tinklas'). |
| `landing.requestDoors.notice` | Door een aanvraag te versturen bevestigt u dat u het <privacy>Privacybeleid</privacy> hebt gelezen. | Door een aanvraag te versturen bevestigt u dat u het <privacy>Privacybeleid</privacy> heeft gelezen. | Every other row uses 'u heeft'; 'u hebt' here is inconsistent. |
| `vacancySources.language.originalIn` | Taal van de advertentie: {language} | Taal van de vacature: {language} | Job advert is 'vacature' in every other row; 'advertentie' is a one-off. |
| `landing.v3.lead` | Voor werkenden, werkgevers en dienstverleners in alle beroepen en sectoren. Registreren en een behoefte plaatsen zijn in de basis gratis. | Voor werkenden, werkgevers en dienstverleners in alle beroepen en sectoren. Registreren en de basisplaatsing van een behoefte zijn gratis. | 'in de basis gratis' qualifies registration too and reads as 'mostly free'; source says registration and BASIC posting are free. |
| `landing.entry.exampleLabels.hire` | Ik heb mensen nodig | Ik zoek werknemers | Identical source to landing.entry.chips.hire ('Reikia darbuotojų'), which is 'Ik zoek werknemers'; same label should not have two translations. |
| `siteNav.intents.workers.title` | Ik zoek medewerkers | Ik zoek werknemers | Worker is 'werknemers' in all other employer-side rows; 'medewerkers' is a one-off. |
| `siteNav.intents.workers.short` | Mensen zoeken | Werknemers zoeken | 'Mensen zoeken' is vague as a standalone card label and off-terminology; 17 chars. |
| `landing.entry.examples.logWork` | Vandaag heb ik 8 uur op de Green Tower gewerkt | Vandaag heb ik 8 uur op de werklocatie Green Tower gewerkt | 'op de Green Tower' reads as 'on top of the tower'; source is 'at the Green Tower site'. |
| `landing.entry.understood.need-service` | U heeft iemand nodig die een klus uitvoert. Na het inloggen ziet u wie die dienst aanbiedt. | U heeft iemand nodig die een opdracht uitvoert. Na het inloggen ziet u wie die dienst aanbiedt. | 'klus' is colloquial and narrows to odd jobs/manual work; platform covers all professions. |
| `landing.v3.how.s1.body` | Zoek werk, werknemers of diensten en beheer aanbiedingen en afspraken op het platform. | Zoek werk, werknemers of diensten en beheer voorstellen en afspraken op het platform. | 'aanbiedingen' suggests special deals/discounts; 'pasiūlymai' is 'voorstellen' in siteNav.links.commercial. |
| `landing.openJobs.sub` | Bekijken kan zonder account; log in om de werkgever, de plek en de sollicitatiewijze te zien. | Bekijken kan zonder account; log in om de werkgever, de plaats en de sollicitatiewijze te zien. | 'plek' is colloquial; the parallel row landing.v3.adverts.sub uses 'plaats'. |

### Proposed by the reviewer, not applied

| Key | Kept | Proposed | Why not applied |
|---|---|---|---|
| `landing.entry.examples.brigade` | Ik zoek een ploeg voor het project | Ik zoek een ploeg voor de werklocatie | the reworded sentence is no longer recognised by the sentence reader (existing test) |
| `landing.entry.examples.professional` | Ik ben accountant en zoek werk in Vilnius | Ik ben boekhouder en zoek werk in Vilnius | an existing test pins the profession word of this example; left for a native speaker |

### Open questions — NOT confirmed, for a native speaker to decide

| Key | Question |
|---|---|
| `siteNav.intents.contractors.short` | 'Dienstverleners zoeken' (22 chars) judged acceptable: a 'dienstverlener' covers both a service and whoever carries out the work, and the .title/.description keep the full 'diensten of opdrachtnemers'. No change proposed; confirm you agree. |
| `siteNav.links.b2bEnquiry` | 33 characters, above the ~30 target for link labels. Keep identical to landing.requestDoors.b2b.title, or shorten the link only to 'Aanvraag B2B-diensten' (21)? |
| `landing.requestDoors.title` | 'behoefte' (poreikis) is used as a countable, postable object ('Behoefte doorgeven', 'kandidaten voor uw behoefte', 'een behoefte plaatsen'). It is deliberate and consistent (behoefte = poreikis, aanvraag = užklausa) but not idiomatic Dutch; a native speaker should decide whether to keep it or use e.g. 'vraag'/'oproep' without collapsing into 'aanvraag'. Affects landing.entry.nextHint, understood.candidates, understood.find-workers, unrecognised, v3.lead, siteNav.links.companyNeed. |
| `siteNav.links.forWorkers` | Worker is 'werkenden' in landing.v3.lead but 'werknemers' here and elsewhere. 'werknemer' strictly means employee and excludes freelancers; on the worker-facing side 'werkenden' may be more accurate ('Zo werkt het voor werkenden', 27 chars). |
| `siteNav.intents.agencies.short` | 'bureau' alone for agency is ambiguous in Dutch (office/desk/agency). 'uitzendbureaus' would narrow to temp agencies; a native speaker should decide between 'bureaus', 'intermediairs' or 'uitzend- en wervingsbureaus'. Affects all agency rows. |
| `landing.v3.market.line` | 'vacatures' is used for job adverts throughout. Natural, but 'vacature' can be read as an open position, while the source counts adverts collected from external sources. Decide whether the count lines (market.line, entry.numbers) need 'vacatureadvertenties'/'vacatureteksten' for precision. |
| `landing.requestDoors.workerSearch.title` | 'Aanvraag voor het zoeken van werknemers' is correct but heavier than its two siblings ('Aanvraag zakelijke diensten (B2B)', 'Aanvraag individueel project'); 'Aanvraag personeelswerving' would be parallel but changes the worker term. |
| `landing.entry.examples.hire` | 'We zoeken 5 magazijnmedewerkers' uses 'we' and 'zoeken'; EN has 'I need', LT is impersonal ('Reikia'). Fine in meaning; confirm the plural voice is intended. |

## Changed after this review (2026-11-13 and 2026-11-14)

Shortened so that on a 320 px phone the first screen holds the goals and "More options" in every language (checked by the walk in all six languages). After the independent review of 2026-11-13 the consent texts keep the word "stored" and the Russian button names what is allowed again; the two buttons fit one row through narrower padding instead of a shorter label. **Not confirmed by a native speaker.**

| Language | Key | Before | After |
|---|---|---|---|
| ru | `consent.banner.text` | Данные измерений, хранящиеся в вашем браузере, и информацию о кампаниях мы используем только с вашего согласия. | Данные измерений, хранящиеся в браузере, и сведения о кампаниях используем только с вашего согласия. |
| ru | `consent.banner.accept` | Разрешить измерение | unchanged (a shorter label was tried and withdrawn) |
| pl | `consent.banner.text` | Dane pomiarowe przechowywane w Państwa przeglądarce oraz informacje o kampaniach wykorzystujemy tylko za Państwa zgodą. | Dane pomiarowe przechowywane w przeglądarce i informacje o kampaniach wykorzystujemy tylko za Państwa zgodą. |
| pl | `siteNav.intents.contractors.short` (card label only; the panel heading keeps the full text) | Szukam usług lub wykonawców | Szukam wykonawców |
| de | `landing.v3.lead` | …Die Registrierung und die Basisveröffentlichung eines Bedarfs sind kostenlos. | …Registrierung und Basis-Bedarfsmeldung sind kostenlos. |

**Register of address in Dutch — open.** The V3 landing texts use the formal "u / uw" (the owner's polite-address rule for this page). `main` (#3304) moved other Dutch strings to the informal "je". Both stand side by side today; which one Dutch should use everywhere is a decision for the owner with a Dutch speaker. In `conciergeOffer.note` the informal form of #3304 is kept.

`main`'s corrections to these catalogs (#3304) are kept wherever V3 had not rewritten the string: of 78 strings corrected on `main`, 74 are present word for word. Four differ because V3 rewrote the same string on purpose: ru `consent.banner.text`, nl `landing.entry.label`, nl `landing.entry.understood.log-work` (the corrected term is kept), nl `conciergeOffer.note` (only the price phrase differs; the address form of #3304 is kept). pl and de `pricing.faq.3.a` keep #3304's last sentence.
