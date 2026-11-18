# Privacyverklaring — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (concept)
> **Juridische toetsing vereist / Requires lawyer review.** Dit is een concept voor toetsing door een jurist. Het is niet definitief, heeft nog geen rechtskracht en is door niemand gecertificeerd.
> **Vertaling van het Engelse concept; de juridische juistheid van deze vertaling moet afzonderlijk worden getoetst door een gekwalificeerde jurist/vertaler.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Gebruikte feitenbronnen (en geen andere):**
> - Audit 2026-10-15: `gdpr-2026-10-15/audit/01-personal-data-inventory-and-erasure-classes.md`, `02-processors-transfers-cookies-ai.md`, `03-rights-consent-legal-pages.md`
> - `docs/legal/`: `corporate-identity-source-of-truth-v1.md`, `legal-basis-matrix-v1.md`, `data-retention-matrix-v1.md`, `retention-decision-package-v1.md`, `processing-activities-register-v1.md`, `subprocessor-register-v2.md`, `entity-role-and-data-access-matrix-v1.md`, `dpo-requirement-assessment-v1.md`, `consent-copy-register-v1.md`, `deletion-process-design-v1.md`, `privacy-risk-and-dpia-screening-v1.md`
> - Huidige gepubliceerde tekst: `apps/web/messages/en.json` → `legal.*`; `apps/web/lib/privacy/consent-definitions.ts`; `apps/web/lib/billing/plans.ts`
>
> **Openstaande beslissingen (moeten vóór publicatie worden afgerond):**
> 1. [OWNER DECISION: bewaartermijnen per gegevensklasse — de beslissingen 1, 2, 3, 3b van pakket A zijn niet goedgekeurd; elke termijn in §9 is een voorstel]
> 2. [OWNER DECISION: toestemmingsbanner voor de opslag van analysegegevens, OF telemetrie beperken tot wat strikt noodzakelijk is / uitsluitend geaggregeerd. Momenteel wordt de analyseopslag zonder toestemming uitgevoerd]
> 3. [OWNER DECISION: minimumleeftijd (16 of 18) en de regel voor lerenden / studenten]
> 4. [OWNER DECISION: kanaal voor verzoeken van personen zonder account]
> 5. [OWNER DECISION: Gemini — de betaalde laag bevestigen voordat taken met persoonsgegevens weer worden ingeschakeld; tot die tijd vermeldt deze verklaring dat zij zijn uitgeschakeld]
> 6. [LAWYER/OWNER: het doorgiftemechanisme (SCC's / EU-VS-kader voor gegevensbescherming (Data Privacy Framework) / adequaatheidsbesluit) per leverancier bevestigen — in de repository is er geen enkel aangetoond]
> 7. [LAWYER/OWNER: bevestigen dat verwerkersovereenkomsten zijn aanvaard met Supabase, Vercel, Stripe, Resend, Hostinger en GitHub]
> 8. [LAWYER: rechtsgrond per doel (tabel §4) — slechts een werkindeling]
> 9. [LAWYER: rol van organisaties die gegevens van personen uploaden — zie `organisation-data-terms-v2`, waar dit als OPEN DECISION is vermeld, inclusief gezamenlijke verwerkingsverantwoordelijkheid op grond van art. 26]
> 10. [OWNER/LAWYER: gegevensbeschermingseffectbeoordeling (DPIA) voor automatische matching en rangschikking van kandidaten — de drempel is al overschreden, er is geen DPIA beschikbaar]
> 11. [OWNER: bevestigen of de overdrachtskoppeling naar Nonstop Group (`NONSTOP_HANDOFF_ENDPOINT`), Telegram-meldingen aan de eigenaar en de Agentai OS-meldingsbrug in productie zijn ingeschakeld]
> 12. [OWNER: de aanbieder van de „partnerinfrastructuur” voor het partnernetwerk voor kansen noemen]
>
> **[INTERNAL — vóór publicatie verwijderen]**
> - [OWNER/LAWYER: beoordeling van eerdere verwerking via de gratis laag in behandeling] Tussen 2026-08-28 en #2399 zijn berichtteksten en in de chat getypte zinnen naar Gemini verzonden zonder bewijs van een betaalde laag. Deze verklaring beschrijft die periode NIET als feit. Er is een besluit nodig over de beoordeling als inbreuk op grond van art. 33-34.
> - OPGELOST 2026-10-15: de 2 `extract_cv`- en 13 `translate_vacancy`-rijen hebben Gemini nooit bereikt (geweigerd door de egress-blokkade, geen tokens). `data_categories_sent` legt de beoogde categorieën vast, niet de verzonden categorieën. §8 is in de huidige formulering juist voor het huidige gedrag. Eerdere verwerking (145 berichtvertalingen 2026-09-28→10-09, 79 aanroepen voor chatbegrip 2026-09-05→10-14) is een intern beoordelingspunt (INC-2026-001), geen gepubliceerde tekst.
> - Van de live pagina's de uitspraken „betalingen zijn niet actief”, „bouwt geen gedragsprofielen op”, „geen analyse” en „Gemini vertaalt vacatures” verwijderen. De auditpunten D1, D5, D10 en L7 tonen aan dat ze onjuist zijn.
> - De naam van de bestuurder mag pas in openbare tekst verschijnen nadat deze is geverifieerd (`corporate-identity-source-of-truth-v1.md` §4 #2).

---

## 1. Wie wij zijn en hoe u contact met ons opneemt

De verwerkingsverantwoordelijke voor het LabourMarket.ai-platform is:

**UAB „Nonstop Group“**
Ondernemingscode 302676973, btw-nummer LT100010790613
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litouwen

- Privacycontact: **info@labourmarket.ai**. Dit is een mailbox. Het is geen functionaris voor gegevensbescherming.
- **Er is geen functionaris voor gegevensbescherming (FG) aangewezen.** Uit onze beoordeling op grond van artikel 37 AVG blijkt dat dit momenteel niet verplicht is. [LAWYER: opnieuw beoordelen — er draait nu automatische matching, wat volgens `dpo-requirement-assessment-v1.md` §5 aanleiding is voor een herbeoordeling]
- „LabourMarket.ai” is de naam van het platform. Het is geen onderneming.
- **Labour Market AI Sp. z o.o.** (Warschau, Polen) is eigenaar van de software en het merk en verleent daarvoor een licentie aan UAB „Nonstop Group“. Zij is geen verwerkingsverantwoordelijke en geen verwerker van uw gegevens. Zij heeft geen routinematige toegang tot de productiedatabase, profielen, cv's, contactgegevens of documenten.

## 2. Onze rol en de rol van organisaties

Er zijn drie situaties. Zij bepalen wie verantwoordelijk is voor uw gegevens.

| Situatie | Wie beslist over de gegevens | Onze rol |
|---|---|---|
| Uw eigen account, profiel, Living CV, werkjournaal, toestemmingen, berichten, matching en de eigen functies van het platform | UAB „Nonstop Group“ | **Verwerkingsverantwoordelijke** |
| Gegevens die een bedrijf, bureau of school over personen aanmaakt of uploadt (bijvoorbeeld een personeelsrooster, geïmporteerde werkgeschiedenis, projectgegevens, verzuim- of arbeidstijdregistraties) | Die organisatie, voor haar eigen administratie | Doorgaans **verwerker** voor de organisatie (artikel 28 AVG). Voor wat het platform zelf toevoegt, zoals het koppelen van een registratie aan een account of matching, blijven wij **verwerkingsverantwoordelijke**. [LAWYER: per activiteit bevestigen — zie `organisation-data-terms-v2`, waar dit als OPEN DECISION is vermeld, inclusief gezamenlijke verwerkingsverantwoordelijkheid op grond van art. 26] |
| Gegevens die u zelf elders naartoe stuurt (uw eigen AI-assistent, uw Google-account, een werkgever die uw gegevens met uw toestemming heeft ontvangen) | De ontvanger, voor zijn eigen verwerking | Wij zijn niet verantwoordelijk voor het eigen gebruik door de ontvanger |

Als een organisatie de verwerkingsverantwoordelijke is, moet zij u over haar verwerking informeren. U kunt nog steeds contact met ons opnemen; wij sturen uw verzoek door of vertellen u met wie u contact kunt opnemen.

## 3. Op wiens gegevens deze verklaring betrekking heeft

- **Personen met een account:** werkenden, werkzoekenden, lerenden en personen die het platform gebruiken namens een bedrijf, bureau of school.
- **Personen zonder account** van wie gegevens op het platform terechtkomen:
  - personen van wie een organisatie de werkgeschiedenis heeft vastgelegd of geïmporteerd;
  - contactpersonen die in openbare vacatures worden genoemd;
  - contactpersonen in zakelijke aanvragen (bijvoorbeeld een aanvraag voor een behoefte van een bedrijf);
  - per e-mail uitgenodigde personen die zich nog niet hebben aangesloten.

  Voor personen zonder account is er een afzonderlijke kennisgeving: **„Kennisgeving voor personen zonder account”**.
- **Bezoekers** van de openbare website (technische gegevens, zie het Cookie- en opslagbeleid).

## 4. Waarvoor wij gegevens gebruiken en op welke rechtsgrond

De rechtsgronden zijn die van artikel 6, lid 1, AVG: (a) toestemming, (b) overeenkomst, (c) wettelijke verplichting, (f) gerechtvaardigde belangen. [LAWYER: elke rij bevestigen]

„Bewaard” geeft de huidige regel; §9 bevat de voorgestelde termijnen. „Verwerkers” zijn onze dienstverleners uit §6.

| # | Doel | Gegevens | Rechtsgrond | Bron | Bewaard | Ontvangers |
|---|---|---|---|---|---|---|
| 1 | Uw account aanmaken en beheren; u laten inloggen | e-mailadres, inlogidentiteit, taal. Bij inloggen met Google: naam, e-mailadres, link naar profielfoto, Google-account-ID | art. 6, lid 1, onder b | u; Google | tot verwijdering van het account | verwerkers (Supabase; Resend en Amazon SES voor inlog-e-mails) |
| 2 | Uw profiel en Living CV | beroep, vaardigheden, ervaring, opleiding, prestaties, talen, beschikbaarheid, salarisverwachting indien ingevuld, avatar, links naar externe profielen, documentenlijst | art. 6, lid 1, onder b | u | tot verwijdering van het account | verwerkers; anderen alleen in het kader van doelen 4, 5, 6, 8 |
| 3 | Werkjournaal en werkregistraties | journaalitems (tekst, foto's, meetgegevens), uren, urenstaten, werkplanningen, taken, afwezigheden | art. 6, lid 1, onder b. Waar een werkgever arbeidstijd- of verzuimregistraties bijhoudt, is de werkgever verwerkingsverantwoordelijke op grond van zijn eigen wettelijke verplichtingen (art. 6, lid 1, onder c) | u; uw organisatie | tot verwijdering van het account; registraties van de werkgever zie §9 | managers van de organisatie waartoe het werk behoort; verwerkers |
| 4 | Bedrijven en bureaus een beperkte professionele samenvatting laten vinden | weergavenaam, beroep, ervaring, vaardigheden, regio bij benadering, beschikbaarheid, talen, salarisverwachting (alleen indien ingevuld) | **art. 6, lid 1, onder a, toestemming** („zichtbaarheid van het profiel”), opt-in | u | tot u uw toestemming intrekt | geregistreerde bedrijven en bureaus |
| 5 | Uw contactgegevens, cv of gekozen velden naar **één** genoemd bedrijf sturen voor één behoefte | alleen de velden die u goedkeurt | **art. 6, lid 1, onder a, toestemming** („doorgifte aan een bedrijf”) | u | de registratie van de doorgifte: §9 | alleen dat bedrijf |
| 6 | Uw beschikbaarheid tonen in het partnernetwerk voor kansen, dat ook buiten dit platform naar werk zoekt | alleen een niet-herleidbare referentie en professionele kenmerken: geen naam, e-mailadres, telefoonnummer, adres, cv-bestand of journaalinhoud. Gepseudonimiseerd, niet anoniem | **art. 6, lid 1, onder a, toestemming** („partnernetwerk”) | u | bij elke update opnieuw opgebouwd; na intrekking verwijderd bij de volgende update | partnerinfrastructuur die in onze opdracht handelt [OWNER: aanbieder noemen] |
| 7 | Uw interesse in een vacature doorgeven aan de uitzend- en detacheringsdienst van Nonstop Group, wanneer u daarom vraagt | de toegestane gegevens (allow-list) die de vacature nodig heeft | art. 6, lid 1, onder a, toestemming gegeven bij die stap [LAWYER: of art. 6, lid 1, onder b] | u | [OWNER DECISION] | uitzend- en detacheringsdienst van UAB „Nonstop Group“ |
| 8 | Werkrelaties die u hebt aanvaard (rooster of team, boekingen, opdrachten, projecten) | professionele samenvatting; journaalitems in het kader van die opdracht | art. 6, lid 1, onder b; art. 6, lid 1, onder f voor de coördinatie door de organisatie | u; de organisatie | zolang de relatie actief is; registraties zie §9 | de bevoegde personen van die organisatie |
| 9 | Matching en aanbevelingen (zie §8) | professionele gegevens, beschikbaarheid, regio, bewijs in uw dossier | art. 6, lid 1, onder b voor aanbevelingen aan u; art. 6, lid 1, onder f voor de aan werkgevers getoonde rangschikking, **alleen onder personen die zichtbaarheid hebben ingeschakeld** [LAWYER] | platform | opnieuw berekend; matchbewijzen slaan alleen aantallen en referenties op | u; werkgevers (alleen als zichtbaarheid is ingeschakeld) |
| 10 | Menselijke matching door ons operatorteam | namen en professionele gegevens in de interne pool. Zonder uw toestemming gaat er niets naar buiten | art. 6, lid 1, onder f | platform | zolang het account bestaat | alleen ons operatorteam |
| 11 | Berichten tussen gebruikers | berichttekst, bijlagen, weergavenaam van de andere persoon | art. 6, lid 1, onder b | u; de andere persoon | bewaard (§9) | deelnemers aan het gesprek; verwerkers |
| 12 | Toestemmingen en gegevensdoorgiften aantonen (art. 7, lid 1, art. 5, lid 2) | toestemmingsgebeurtenissen (doel, tekstversie en hash, taal, tijdstip), registraties van verstrekkingen. **Geen IP-adres of browsergegevens** | art. 6, lid 1, onder c en art. 6, lid 1, onder f | platform | kan niet worden gewijzigd (§9) | u; autoriteiten indien vereist |
| 13 | Privacyverzoeken behandelen | het verzoek en onze behandelnotities | art. 6, lid 1, onder c | u | §9 | ons privacyteam; verwerkers |
| 14 | Registraties die een organisatie over u bijhoudt (bijv. geïmporteerde werkgeschiedenis) | naam zoals de organisatie die heeft vastgelegd, haar referentie, werkbeschrijvingen, data, plaatsen, verklaringen | de eigen rechtsgrond van de organisatie (zij is verwerkingsverantwoordelijke). Onze koppeling en matching: art. 6, lid 1, onder f [LAWYER] | de organisatie | de organisatie beslist | managers van die organisatie en van organisaties die als partij in de registratie zijn genoemd |
| 15 | Openbare vacatures | naam van de werkgever, organisatienummer, vacaturetekst, waarin een contactpersoon met e-mailadres of telefoonnummer kan worden genoemd | art. 6, lid 1, onder f: beschikbaar werk tonen [LAWYER: art. 14, lid 5, onder b] | de Zweedse en Noorse openbare diensten voor arbeidsbemiddeling | zolang actief; verwijderde vacatures verborgen (§9) | alle ingelogde gebruikers |
| 16 | Zakelijke aanvragen en meldingen aan de eigenaar | bedrijfsnaam, contactpersoon, details van de behoefte | art. 6, lid 1, onder b precontractueel / art. 6, lid 1, onder f | de aanvrager | [OWNER DECISION] | ons team; meldingskanaal van de eigenaar indien ingeschakeld |
| 17 | Betaalde organisatieabonnementen en facturering | e-mailadres en naam van het factuurcontact, **factuuradres, btw- of fiscaal nummer**, referentie van de organisatie en het abonnement. Kaartgegevens gaan rechtstreeks naar Stripe | art. 6, lid 1, onder b; art. 6, lid 1, onder c boekhouding en belastingen | de organisatie; Stripe | wettelijke termijn (§9) | Stripe; belastingautoriteiten en accountants voor zover vereist |
| 18 | Productanalyse (zie §8 en het Cookie- en opslagbeleid) | aan uw account-ID gekoppelde gebeurtenissen, een willekeurige sessie-ID, pagina, taal, campagnegegevens van het eerste bezoek (`utm_*`, verwijzende website, landingspagina), organisatie-ID | art. 6, lid 1, onder f voor de analyse; **toestemming** voor het opslaan van de identificatoren op uw apparaat (art. 5, lid 3, e-privacyrichtlijn) [OWNER DECISION: banner of schrappen] | uw apparaat | bewaard (§9) | ons team; verwerkers |
| 19 | Beveiliging, misbruikpreventie en auditlogs | verzoekgegevens, IP-adres in hostinglogs, auditregistraties van belangrijke wijzigingen | art. 6, lid 1, onder f | uw apparaat; platform | [OWNER: bewaarperiode hostinglogs] | verwerkers |
| 20 | AI-ondersteunde functies (zie §8) | momenteel gaan alleen openbare marktstatistieken naar een AI-aanbieder | art. 6, lid 1, onder f | platform | uitvoerfragmenten worden na 90 dagen verwijderd | Google (Gemini API) |
| 21 | Uw eigen AI-assistent koppelen (ChatGPT, Claude en andere) | wat u de assistent binnen uw eigen rechten laat lezen | art. 6, lid 1, onder b, op uw verzoek | u | tot u de koppeling verbreekt | de aanbieder van de assistent |
| 22 | Locatie bij inloggen bij benadering, als u ervoor kiest die te delen | locatie op stadsniveau | art. 6, lid 1, onder a [OWNER: functie en toestemmingstekst controleren] | u | tot u uw toestemming intrekt | verwerkers |
| 23 | Correspondentie met ons | uw e-mailadres en bericht | art. 6, lid 1, onder f; art. 6, lid 1, onder c bij een verzoek tot uitoefening van rechten | u | [OWNER DECISION] | aanbieder van de mailbox |

**Bijzondere categorieën van persoonsgegevens (artikel 9 AVG).** Wij vragen niet naar gegevens over gezondheid, etnische afkomst, religie, politieke opvattingen, lidmaatschap van een vakbond of biometrische gegevens. Vrije tekstvelden kunnen zulke gegevens toch bevatten als iemand ze invult, bijvoorbeeld een reden van afwezigheid. Redenen van afwezigheid zijn alleen toegankelijk voor u en de beoordelende manager. [LAWYER: rechtsgrond op grond van art. 9, lid 2, onder b, voor verzuimregistraties van werkgevers; overwegen de tekst van de reden te beperken]

**Bent u verplicht gegevens te verstrekken?** Gegevens gemarkeerd met art. 6, lid 1, onder b, zijn nodig om de functie te leveren. Zonder die gegevens kan de functie niet werken. Elk toestemmingsdoel is vrijwillig. Weigeren verandert verder niets aan uw account.

## 5. Waar gegevens vandaan komen

- **Van u:** wat u in het product invoert, uploadt of zegt.
- **Van organisaties:** een bedrijf, bureau of school kan feiten over uw werk vastleggen of importeren (roosters, werkgeschiedenis, project- en tijdregistraties). Zij kan ook uw journaalitems bevestigen.
- **Van andere gebruikers:** berichten, bevestigingen van uw werk, uitnodigingen waarin u wordt genoemd.
- **Van Google**, als u inlogt met Google.
- **Van Stripe**, over de betalingen voor een organisatieabonnement.
- **Uit openbare bronnen:** vacatures gepubliceerd door Arbetsförmedlingen (Zweden) en NAV (Noorwegen). Wij slaan de gestructureerde contactlijst van NAV niet op. De tekst van een vacature kan toch een contactpersoon noemen.
- **Van uw apparaat:** technische en analysegegevens (zie het Cookie- en opslagbeleid).

## 6. Wie gegevens ontvangt

**Binnen het platform** zijn gegevens standaard afgeschermd. Andere gebruikers zien alleen wat een specifieke regel toestaat. De pagina „Uw gegevens en wie ze kan zien” beschrijft deze regels.
- Bedrijven en bureaus zien uw beperkte samenvatting alleen als u zichtbaarheid hebt ingeschakeld (doel 4).
- Uw contactgegevens, cv of documenten zien zij pas na een afzonderlijke goedkeuring voor dat bedrijf (doel 5).
- Managers van een organisatie waarmee u werkt, zien wat die relatie vereist (doel 8).
- Managers van een organisatie die uw werkgeschiedenis heeft vastgelegd, kunnen die lezen. Dat geldt ook voor managers van een organisatie die als partij in die registratie is genoemd.
- Wanneer een werkgever of manager een eigen AI-assistent koppelt, kan die assistent lezen wat de manager mag lezen. Dit kan gegevens over u omvatten, bijvoorbeeld zoekresultaten over kandidaten, het rooster of afwezigheidsaanvragen. De organisatie is verantwoordelijk voor die keuze. [LAWYER: analyse verwerkingsverantwoordelijke en ontvanger — audit D4]

**Onze dienstverleners (verwerkers).** Zij handelen volgens onze instructies:

| Aanbieder | Wat hij doet | Locatie |
|---|---|---|
| Supabase | database, inloggen, bestandsopslag | EU (Ierland, eu-west-1); Amerikaans moederbedrijf |
| Vercel | hosting, serverfuncties (Dublin), verzoeklogs | functies in Dublin; een deel van de verwerking van verzoeken draait op het wereldwijde edge-netwerk van Vercel; Amerikaans bedrijf |
| Resend, verzending via Amazon SES (eu-west-1) | e-mails voor registratie en inloggen | Amerikaans bedrijf; verzending in de EU |
| Stripe Payments Europe | betalingsverwerking voor organisatieabonnementen. Voor haar eigen fraudepreventie en wettelijke verplichtingen treedt Stripe op als zelfstandige verwerkingsverantwoordelijke | Ierland; wereldwijde groep |
| Hostinger | mailbox voor info@labourmarket.ai [OWNER: aanbieder en locatie controleren] | [controleren] |
| GitHub | codehosting en geautomatiseerde taken. Deze taken kunnen technisch toegang krijgen tot productiegegevens en openbare vacaturegegevens wegschrijven | VS |
| Google (Gemini API) | AI-verwerking. Momenteel worden **alleen openbare marktstatistieken** verzonden | Google-infrastructuur |
| Telegram, of de Agentai OS-meldingsbrug | korte meldingen aan de eigenaar over zakelijke aanvragen. Geen gegevens van werkenden. **Alleen indien ingeschakeld** [OWNER: bevestigen] | buiten de EER |

**Zelfstandige ontvangers.** Zij bepalen zelf hoe zij de gegevens gebruiken:
- **Google**, wanneer u „Doorgaan met Google” gebruikt.
- **OpenStreetMap Foundation.** Kaartdelen worden van haar servers geladen, waardoor uw browser haar uw IP-adres en het bekeken kaartgebied stuurt.
- **De maker van uw browser** (bijvoorbeeld Google of Apple), als u spraakdictatie gebruikt. Uw browser stuurt de audio naar zijn eigen spraakdienst; wij ontvangen de audio niet.
- **De aanbieder van een AI-assistent** die u of uw organisatie koppelt.
- **Bedrijven** die uw gegevens met uw toestemming hebben ontvangen.
- **Autoriteiten**, wanneer de wet dat vereist.

**Binnen UAB „Nonstop Group“.** UAB „Nonstop Group“ exploiteert ook een uitzend- en detacheringsbedrijf. Dat ontvangt uw gegevens alleen wanneer u daarom vraagt (doel 7).

## 7. Doorgiften buiten de Europese Economische Ruimte

Onze hoofddatabase bevindt zich in de EU. Sommige aanbieders zijn Amerikaanse bedrijven of verwerken gegevens buiten de EER:
- het edge-netwerk van Vercel;
- ondersteuningstoegang door Amerikaanse moederbedrijven;
- door GitHub gehoste runners;
- Google;
- Telegram, indien ingeschakeld.

De OpenStreetMap Foundation is gevestigd in het Verenigd Koninkrijk, waarvoor een adequaatheidsbesluit van de EU geldt.

Wanneer gegevens de EER verlaten, moet een doorgifte-instrument op grond van de artikelen 44-49 AVG van toepassing zijn: een adequaatheidsbesluit, het EU-VS-kader voor gegevensbescherming (Data Privacy Framework) of standaardcontractbepalingen. [LAWYER/OWNER: de grondslag (SCC's / DPF / adequaatheidsbesluit) per leverancier bevestigen. In onze administratie is er nog geen aangetoond. Geen mechanisme publiceren dat niet is bevestigd.] U kunt ons om een kopie van de waarborgen vragen.

## 8. AI-functies, matching en profilering

**Automatische matching en rangschikking vinden plaats. Er wordt over u geen besluit genomen dat uitsluitend op geautomatiseerde verwerking is gebaseerd en waaraan voor u rechtsgevolgen zijn verbonden of dat u anderszins in aanmerkelijke mate treft (artikel 22 AVG).** Elk besluit dat ertoe doet, wordt door een mens genomen: wie wordt benaderd, wie werk wordt aangeboden, wie wordt aangenomen, geverifieerd of afgewezen.

Wat automatisch gebeurt:

- **Een behoefte matchen met werkenden.** Wanneer een organisatie een behoefte publiceert of heropent, rangschikt een op regels gebaseerde matcher de werkenden die zichtbaarheid hebben ingeschakeld. Hij verstuurt geen bericht, uitnodiging of melding. De organisatie beslist of zij iemand benadert.
- **Rangschikking van kandidaten.** Zoekresultaten voor werkgevers worden gesorteerd op geschiktheid. Een werkgever ziet eerst een korte lijst met de beste resultaten (momenteel 8). De rangschikking beïnvloedt wie het eerst wordt gezien. Zij wijst nooit iemand af.
- **Vacaturemeldingen en „nieuwe passende vacatures”.** Wij vergelijken uw profiel met openstaande vacatures en bevelen die bij u aan.
- **Afleidingen in het Living CV.** Op basis van uw bewijs stellen wij directe, indirecte en potentiële capaciteiten voor. Een suggestie blijft een suggestie. Zij wordt afzonderlijk gelabeld van wat u zelf hebt opgegeven en van wat iemand heeft bevestigd of gecertificeerd.
- **Bevestigingsregels van organisaties.** Een organisatie kan een regel instellen die een vaardigheid in haar eigen registratie bevestigt wanneer haar betrouwbaarheidsdrempel is bereikt. [OWNER/LAWYER: informatie en uitleg aan de werkende ontbreken — audit 03, addendum]

**AI-modellen.**
- Momenteel is de enige taak die een extern AI-model (Google Gemini) bereikt, de toelichting op **openbare marktstatistieken**. Die bevat geen persoonsgegevens.
- Het vertalen van berichten en suggesties voor in de chat getypte zinnen zijn voor persoonsgegevens **uitgeschakeld**. Zij blijven uitgeschakeld totdat de betaalde, contractuele voorwaarden van de AI-aanbieder zijn bevestigd. [OWNER DECISION: pas opnieuw inschakelen nadat de betaalde laag is bevestigd; eerst deze sectie bijwerken]
- AI-uitvoer is altijd een suggestie. Niets wordt als feit over u opgeslagen totdat u of een bevoegde persoon het bevestigt.
- AI verifieert nooit een vaardigheid, neemt nooit een kandidaat aan of wijst die af, en neemt nooit contact op met iemand.
- AI-uitvoeringslogs bewaren een kort fragment van de uitvoer. Dat wordt na 90 dagen verwijderd.

**Uw keuzes.**
- U kunt zichtbaarheid op elk moment uitschakelen. U valt dan bij nieuwe zoekopdrachten buiten de matching voor werkgevers.
- U kunt bezwaar maken tegen profilering op basis van gerechtvaardigde belangen (§10) en vragen dat een mens een rangschikking toelicht.

[LAWYER: beoordelen of de op regels gebaseerde matcher een „AI-systeem” is in de zin van de AI-verordening (Verordening (EU) 2024/1689, artikel 3, punt 1). Zo ja, bijlage III, punt 4 (werkgelegenheid) controleren. Geen classificatie publiekelijk vermelden voordat deze is beoordeeld.]

## 9. Hoe lang wij gegevens bewaren

Momenteel worden gegevens bewaard zolang uw account bestaat en de functie ze nog gebruikt. De onderstaande termijnen zijn **voorstellen die niet zijn goedgekeurd**. [OWNER DECISION: elke termijn goedkeuren of wijzigen — pakket A]

| Gegevens | Momenteel | Voorgestelde termijn |
|---|---|---|
| Account, profiel, Living CV | tot verwijdering van het account | ongewijzigd |
| Werkjournaal | tot verwijdering van het account | [OWNER DECISION: verwijderen of als losgekoppeld bewijs bewaren. Momenteel wordt bij verwijdering van het account het journaal verwijderd] |
| Berichten | bewaard | [OWNER DECISION: 36 maanden na afsluiting van het gesprek] |
| Boekingen en opdrachten | bewaard | [OWNER DECISION: 6 jaar na afloop — verjaringstermijn voor rechtsvorderingen; LAWYER] |
| Tekst van de reden van afwezigheid | bewaard | [OWNER DECISION: 12 maanden] |
| Meldingen | bewaard | [OWNER DECISION: 12 maanden] |
| Analysegebeurtenissen | bewaard | [OWNER DECISION: 24 maanden, of verwijdering op verzoek] |
| Registraties van toestemming en verstrekking | bewaard, kunnen niet worden gewijzigd | [OWNER DECISION: looptijd van het account + 6 jaar, na verwijdering gepseudonimiseerd] |
| Privacyverzoeken | bewaard | [OWNER DECISION: 3 jaar na afhandeling] |
| Facturering en facturen | bewaard | [LAWYER: wettelijke bewaartermijn voor de boekhouding; naar Litouws recht wordt doorgaans uitgegaan van 10 jaar] |
| AI-uitvoerfragmenten | **na 90 dagen verwijderd** (dagelijkse uitvoering) | ongewijzigd |
| Door organisaties aangeleverde registraties | bewaard | de organisatie beslist [OWNER DECISION: standaard voor geïmporteerde staging-rijen] |
| Verwijderde openbare vacatures | bewaard, verborgen | [OWNER DECISION: 12 maanden na verwijdering] |
| Back-ups | rotatie beheerd door de aanbieder | periode van de aanbieder [OWNER: de werkelijke periode vermelden] |

## 10. Uw rechten

Op grond van de artikelen 15-22 AVG hebt u het recht op:

- **Inzage** (art. 15): een kopie van uw gegevens ontvangen en informatie over hoe wij ze gebruiken.
- **Rectificatie** (art. 16): onjuiste gegevens laten corrigeren. Opgeslagen journaalitems kunnen niet worden herschreven; u kunt een correctie toevoegen. Registraties die een organisatie bijhoudt, worden door die organisatie gecorrigeerd; u kunt ze betwisten zodra uw account is gekoppeld.
- **Gegevenswissing** (art. 17): uw gegevens laten wissen, tenzij wij een deel ervan moeten bewaren (bijvoorbeeld boekhoudkundige gegevens of het bewijs van toestemming).
- **Beperking van de verwerking** (art. 18): ons vragen het gebruik te beperken terwijl een vraag wordt onderzocht.
- **Overdraagbaarheid van gegevens** (art. 20): de gegevens die u ons hebt verstrekt in een machineleesbaar bestand ontvangen.
- **Bezwaar** (art. 21): bezwaar maken tegen verwerking op basis van gerechtvaardigde belangen, inclusief profilering, analyse en matching door operators. Wij stoppen dan, tenzij wij dwingende gerechtvaardigde gronden hebben.
- **Menselijke beoordeling** (art. 22): niet te worden onderworpen aan een uitsluitend op geautomatiseerde verwerking gebaseerd besluit dat u in aanmerkelijke mate treft. Zulke besluiten nemen wij niet (§8). U kunt nog steeds vragen dat een mens naar een geautomatiseerd resultaat kijkt.
- **Intrekking van toestemming** (art. 7, lid 3): op elk moment, in één stap. De intrekking doet geen afbreuk aan de rechtmatigheid van de verwerking vóór de intrekking. Gegevens die een werkgever al rechtmatig heeft ontvangen, blijven bij die werkgever, onder diens eigen verantwoordelijkheid.

## 11. Hoe u uw rechten uitoefent

**In uw account:** open **Dashboard → Privacy** (`/dashboard/privacy`; in de mobiele app: Instellingen → Privacy).
- **Uw gegevens downloaden:** een JSON-bestand met uw gegevens en een CSV-bestand met uw werkjournaal. Dit gebeurt direct.
- **Verwijdering aanvragen:** dien een verzoek tot verwijdering van uw account in. Verwijdering gebeurt **niet direct**. Een mens beoordeelt het verzoek en laat u weten wat is verwijderd, wat wordt bewaard en waarom.
- **Toestemmingen:** schakel elke toestemming afzonderlijk in of uit.

**Per e-mail:** schrijf naar **info@labourmarket.ai**. Gebruik dit voor inzage in de volledige informatie op grond van art. 15, rectificatie, beperking, bezwaar of alles wat de accountpagina niet dekt. [OWNER DECISION: verzoektypen voor rectificatie, beperking en bezwaar in het product toevoegen]

**Geen account?** Zie de „Kennisgeving voor personen zonder account”. [OWNER DECISION: kanaal]

**Identiteitscontrole.** In uw account identificeert het inloggen u. Per e-mail kunnen wij u vragen te schrijven vanaf het adres van uw account of gegevens te verstrekken die alleen de werkelijke persoon kan kennen. Wij vragen alleen wat wij nodig hebben om te bevestigen dat u het bent.

**Termijn.** Wij antwoorden **binnen één maand** na ontvangst van het verzoek. Bij complexe of talrijke verzoeken kunnen wij deze termijn met ten hoogste twee maanden verlengen. In dat geval laten wij u dat binnen de eerste maand weten en lichten wij de reden toe (art. 12, lid 3). Verzoeken zijn kosteloos, tenzij zij kennelijk ongegrond of buitensporig zijn (art. 12, lid 5).

## 12. Kinderen en jongeren

[OWNER DECISION: minimumleeftijd om een account aan te maken — 16 of 18]

- Het platform is gericht op werk, leerlingplaatsen en leren, dus lerenden en studenten kunnen het gebruiken.
- [LAWYER: Litouwen hanteert 14 jaar als leeftijd voor toestemming voor onlinediensten op grond van art. 8 AVG — controleren. Onder die leeftijd is voor doelen op basis van toestemming de toestemming van een ouder nodig. Ook de Litouwse regels over werk door minderjarigen controleren.]
- [OWNER DECISION: of personen onder de 18 zichtbaarheid voor werkgevers mogen inschakelen, en of een school minderjarige leerlingen of studenten mag toevoegen]
- Momenteel is er bij de registratie geen leeftijdscontrole.

## 13. Beveiliging

Wat wij daadwerkelijk doen:
- Toegangsregels zijn in de database zelf vastgelegd. Zonder een regel die toegang verleent, ziet niemand de gegevens. Deze regels worden door geautomatiseerde tests gedekt.
- Bestanden en foto's staan in afgeschermde opslag. Zij openen alleen via kortlevende links.
- Registraties van toestemming en verstrekking kunnen alleen worden aangevuld (append-only). Niemand, ook geen beheerder, kan ze wijzigen.
- Beheerschermen zijn beperkt tot een klein aantal beheerders.
- Geen enkele beheerder kan namens u toestemming geven.

Geen enkel systeem is volkomen veilig. Als zich bij ons een inbreuk in verband met persoonsgegevens voordoet, melden wij die aan de toezichthoudende autoriteit, en aan u wanneer de wet dat vereist (art. 33-34). Als u een probleem opmerkt, schrijf dan naar info@labourmarket.ai.

## 14. Klachten

U kunt een klacht indienen bij een toezichthoudende autoriteit, met name in de EU-lidstaat waar u woont of werkt of waar het probleem zich heeft voorgedaan (art. 77).

Onze leidende toezichthoudende autoriteit is de **Staatsinspectie voor Gegevensbescherming van Litouwen** (Valstybinė duomenų apsaugos inspekcija, VDAI):
- L. Sapiegos g. 17, LT-10312 Vilnius;
- ada@ada.lt;
- vdai.lrv.lt.

[LAWYER: adres en contactgegevens controleren]

Wij krijgen graag eerst de kans om het probleem op te lossen; schrijf daarom ook naar ons. U bent daartoe niet verplicht.

## 15. Wijzigingen in deze verklaring

- Versie: **v2 (concept), 2026-10-15**. Vervangt de eerdere pagina in eenvoudige taal.
- Wanneer wij deze verklaring wijzigen, werken wij hier de datum en de versie bij.
- Als een wijziging gevolgen heeft voor iets waarmee u hebt ingestemd, laten wij u dat in het product weten voordat de wijziging geldt. Toestemmingsteksten hebben een versienummer: als een toestemmingstekst verandert, vragen wij het u opnieuw.
