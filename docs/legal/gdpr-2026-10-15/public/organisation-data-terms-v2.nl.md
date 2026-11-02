# Gegevensvoorwaarden voor organisaties — LabourMarket.ai

*Voor bedrijven, bureaus, scholen en andere organisaties die op het platform gegevens over personen vastleggen, uploaden of beheren. Bevat verwerkingsvoorwaarden op grond van artikel 28 AVG.*

> **Status:** DRAFT v2 — 2026-10-15 (concept)
> **Juridische toetsing vereist / Requires lawyer review.** Concept voor toetsing door een jurist. Niet definitief, nog zonder rechtskracht, niet gecertificeerd.
> **Vertaling van het Engelse concept; de juridische juistheid van deze vertaling moet afzonderlijk worden getoetst door een gekwalificeerde jurist/vertaler.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Gebruikte feitenbronnen:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §2 (behandelingen REASSIGN / RETAIN voor registraties van organisaties), §3.2 (alleen aan te vullen en met hashes geketende tabellen), §3.3 (werkopvatting: de aanleverende organisatie is verwerkingsverantwoordelijke voor haar registraties, het platform verwerker voor die kopie en verwerkingsverantwoordelijke voor de matching en koppeling die het toevoegt; bewijs `organization_person_id` NO ACTION; staging-rijen blijven bestaan)
> - `03-rights-consent-legal-pages.md` §3, §4, §7 (geen aanwijzing van de verwerkingsverantwoordelijke, geen verwerkersovereenkomst, geen verklaring bij import; leesbaar voor importerende en als partij genoemde organisaties; alleen aanvullende correcties, één per registratie; betwisting door de betrokkene na koppeling; dubbele rol van Nonstop Group)
> - `02-processors-transfers-cookies-ai.md` §1 rij 14 en D4 (door werkgevers gekoppelde MCP-assistenten ontvangen gegevens van werkenden); §4 (automatische match, rangschikking, `apply_learning_auto_confirmation`)
> - `docs/legal/legal-basis-matrix-v1.md` (op relaties gebaseerde zichtbaarheid); `entity-role-and-data-access-matrix-v1.md`; `subprocessor-register-v2.md`
>
> **Openstaande beslissingen:**
> 1. [OPEN DECISION / LAWYER: rol per activiteit — tabel §2. De feiten geven hierover geen uitsluitsel]
> 2. [OWNER DECISION: een verklaringsstap bij import toevoegen (rechtsgrond + kennisgeving op grond van art. 14 bevestigd) voordat een organisatie gegevens van personen kan importeren. Die bestaat momenteel niet]
> 3. [OWNER DECISION: weg voor wissing en onleesbaarmaking van alleen aan te vullen, met hashes geketende bewijsregistraties; volgorde van verwijdering (bewijs vóór de persoon in het rooster)]
> 4. [OWNER DECISION: aankondigingstermijn bij wijziging van subverwerkers (§7.6)]
> 5. [OWNER DECISION: termijn voor het melden van inbreuken aan organisaties (§7.8)]
> 6. [OWNER DECISION: exportformaat en verwijderingstermijn bij einde van de overeenkomst (§7.10)]
> 7. [OWNER DECISION: termijn waarbinnen organisaties moeten reageren op een betwisting of een doorgestuurd verzoek]
> 8. [LAWYER: aansprakelijkheid en vrijwaring (§9)]
> 9. [OWNER/LAWYER: of organisaties externe AI-assistenten mogen koppelen met toegang tot afwezigheids- en journaalinhoud van werkenden, of dat die tools worden beperkt (audit D4)]
> 10. [OWNER/LAWYER: hoe deze voorwaarden worden aanvaard (click-through bij het aanmaken van de organisatie of bij import, of een ondertekende verwerkersovereenkomst) — momenteel wordt niets vastgelegd]
> 11. [OWNER/LAWYER: rechtsgrond op grond van art. 9, lid 2, onder b, en minimalisering voor door werkgevers bewaarde tekst over de reden van afwezigheid]

---

## 1. Voor wie deze voorwaarden gelden

- Deze voorwaarden gelden voor elke organisatie (bedrijf, uitzendbureau, school of andere instantie) die het LabourMarket.ai-platform gebruikt om:
  - gegevens over personen vast te leggen, te importeren of te uploaden: personeel, voormalig personeel, werkenden, kandidaten, lerenden, contactpersonen van klanten;
  - het werk van personen te beheren via projecten, roosters, boekingen, urenstaten, afwezigheden, beoordelingen van journaalitems en bevestigingen.
- Het platform wordt geëxploiteerd door **UAB „Nonstop Group“** (ondernemingscode 302676973, Litouwen), hier „wij” genoemd. De organisatie wordt „u” genoemd.
- Deze voorwaarden vormen een aanvulling op de Gebruiksvoorwaarden en de Privacyverklaring. Als zij met betrekking tot persoonsgegevens met elkaar in strijd zijn, gaan voor activiteiten van organisaties deze voorwaarden voor.

## 2. Wie waarvoor verantwoordelijk is

De tabel toont onze werkopvatting. **Waar OPEN DECISION staat, is de rol nog niet vastgesteld.** [LAWYER: elke rij bevestigen. Gezamenlijke verwerkingsverantwoordelijkheid op grond van art. 26 overwegen waar beide partijen de doeleinden bepalen.]

| Activiteit | Uw rol | Onze rol | Status |
|---|---|---|---|
| Uw eigen registraties over personen: roosters, geïmporteerde werkgeschiedenis, bewijsregistraties, project- en werkregistraties, documenten die u uploadt | **Verwerkingsverantwoordelijke** | **Verwerker** (wij hosten en verwerken ze volgens uw instructies, §7) | OPEN DECISION — werkopvatting in audit 01 §3.3 |
| Registraties van arbeidstijd, urenstaten, afwezigheid en werkplanning van uw personeel | **Verwerkingsverantwoordelijke** (verplichtingen als werkgever) | **Verwerker** | OPEN DECISION |
| Beoordelen en bevestigen van de journaalitems van een werkende; bevestigingsregels die vaardigheden automatisch bevestigen | **Verwerkingsverantwoordelijke** voor uw bevestiging | **Verwerkingsverantwoordelijke** voor het eigen journaal van de werkende | OPEN DECISION — de registratie betreft twee personen |
| Een persoon uit het rooster koppelen aan een platformaccount; signalen over vaardigheden afleiden uit uw registraties | — | **Verwerkingsverantwoordelijke** (ons eigen doel) | OPEN DECISION: of gezamenlijk (art. 26) |
| Matching en rangschikking van werkenden voor uw gepubliceerde behoeften | **Verwerkingsverantwoordelijke** voor uw selectiebeslissingen | **Verwerkingsverantwoordelijke** voor de matchingdienst | OPEN DECISION: of gezamenlijk (art. 26) |
| Gegevens die een werkende met toestemming aan u verstrekt (contactgegevens, cv) | **Zelfstandige verwerkingsverantwoordelijke** na ontvangst | **Verwerkingsverantwoordelijke** tot de doorgifte | werkopvatting in `legal-basis-matrix-v1.md` |
| Uw eigen AI-assistent (ChatGPT, Claude) aan het platform koppelen | **Verwerkingsverantwoordelijke**: u kiest ervoor gegevens naar die aanbieder te sturen | wij bieden toegang binnen de rechten van uw gebruikers | OPEN DECISION — audit D4 |
| Facturering van uw abonnement | klant | **Verwerkingsverantwoordelijke** | vastgesteld |

Binnen UAB „Nonstop Group“ is het uitzend- en detacheringsbedrijf gescheiden van de exploitatie van het platform. Het ontvangt platformgegevens alleen wanneer een werkende daarom vraagt (Privacyverklaring, doel 7).

## 3. Uw verplichtingen als verwerkingsverantwoordelijke

Wanneer u gegevens over personen vastlegt of uploadt, moet u het volgende doen.

1. **Beschik over een rechtsgrond** (artikel 6 AVG) voor elke registratie. Als bijzondere categorieën van gegevens betrokken zijn (bijvoorbeeld gezondheidsinformatie in een reden van afwezigheid), hebt u ook een voorwaarde uit artikel 9 nodig, zoals het arbeidsrecht op grond van art. 9, lid 2, onder b. [LAWYER]
2. **Informeer de personen** (artikelen 13 en 14). Laat hun uiterlijk binnen één maand (art. 14, lid 3) weten dat hun gegevens op het platform staan, waarom, en hoe zij hun rechten kunnen uitoefenen.
   - Voor het deel van het platform kunt u hen verwijzen naar onze **„Kennisgeving voor personen zonder account”**.
   - Die kennisgeving vervangt uw eigen kennisgeving niet. [OWNER DECISION: of wij een kant-en-klaar sjabloon leveren]
3. **Beperk de gegevens tot het minimum** (art. 5, lid 1, onder c):
   - Leg alleen vast wat het doel vereist.
   - Upload geen identiteitsdocumenten, gezondheidsgegevens, nationale identificatienummers of bankgegevens, tenzij een functie dat vereist en u een rechtsgrond hebt.
   - Houd redenen van afwezigheid kort en feitelijk.
4. **Houd de gegevens juist** (art. 5, lid 1, onder d). U bent verantwoordelijk voor de juistheid van wat u vastlegt en importeert. Corrigeer fouten snel (§5).
5. **Alleen gemachtigde gebruikers.** Alleen personen die u hebt gemachtigd, mogen namens u handelen. U bent verantwoordelijk voor wat zij in uw naam doen, inclusief imports en bevestigingen.
6. **In registraties genoemde partijen.** Als u een andere organisatie als partij in een registratie noemt (bijvoorbeeld een opdrachtgever van een project), kunnen haar managers die registratie lezen. Noem een partij alleen als u gerechtigd bent de registratie met haar te delen.
7. **Minderjarigen.** Leg geen gegevens over kinderen vast, tenzij u een rechtsgrond hebt en de eventueel vereiste betrokkenheid van de ouders. [OWNER DECISION: regels voor scholen die minderjarige leerlingen of studenten toevoegen]
8. **AI-assistenten.** Als u een externe AI-assistent koppelt, beslist u om gegevens naar die aanbieder te sturen. U moet een rechtsgrond en een overeenkomst met die aanbieder hebben. Gebruik de assistent niet om redenen van afwezigheid of andere gevoelige inhoud te verwerken, tenzij u daartoe gerechtigd bent. [OWNER/LAWYER: tools beperken]
9. **Geen oneigenlijke doeleinden.** Gebruik gegevens van het platform niet voor oneigenlijke doeleinden en exporteer ze niet zonder rechtsgrond op grote schaal naar andere systemen.

## 4. Wie uw registraties op het platform kan zien

- De managers van uw organisatie.
- Managers van organisaties die u als partij in een registratie noemt.
- Onze gemachtigde operatormedewerkers, uitsluitend voor zover nodig om de dienst te laten werken, te ondersteunen en te beveiligen.

Uw registraties worden **niet** getoond aan andere werkgevers die naar kandidaten zoeken. Een persoon die u hebt vastgelegd, ziet de registratie pas nadat diens account is gekoppeld via een uitnodiging die u verstuurt.

## 5. Juistheid, correcties en betwistingen

- Registraties kunnen **alleen worden aangevuld (append-only)**: ze kunnen niet ter plaatse worden bewerkt. Om een registratie te corrigeren, voegt u een correctie toe. Elke registratie kan één correctie hebben. Zo blijft de geschiedenis waarheidsgetrouw.
- Een persoon van wie het account aan uw registratie is gekoppeld, kan die **betwisten** en de betwisting intrekken.
- Wanneer een betwisting binnenkomt, beoordeelt u die en antwoordt u de persoon. [OWNER DECISION: termijn]
- Wij kunnen een registratie als betwist markeren. Wij beslissen niet wie gelijk heeft, tenzij de wet dat vereist.
- [OWNER DECISION: wissing of onleesbaarmaking van alleen aan te vullen registraties. Momenteel kan een persoon niet uit het rooster worden verwijderd zolang er bewijsregistraties bestaan, en bewijsregistraties kunnen niet in het product worden verwijderd.]

## 6. Verzoeken van betrokkenen

- Als een persoon **u** vragen stelt over gegevens op het platform, antwoordt u hem of haar. Wij helpen u zoals beschreven in §7.7.
- Als een persoon **ons** vragen stelt over uw registraties, laten wij hem of haar weten dat u de verwerkingsverantwoordelijke bent en sturen wij het verzoek naar u door, tenzij de wet iets anders vereist. U antwoordt dan binnen de termijn die de AVG toestaat (art. 12, lid 3: één maand, verlengbaar).
- Over de eigen gegevens van het platform (koppelingen, afgeleide signalen, matching) antwoorden wij de persoon zelf.

## 7. Verwerkingsvoorwaarden (artikel 28 AVG)

Deze sectie is van toepassing waar wij optreden als **uw verwerker** (zie §2).

1. **Onderwerp en duur.** Het hosten en verwerken van uw registraties op het platform, zolang u het platform gebruikt en tot de verwijdering op grond van §7.10.
2. **Aard en doel.** Opslag, weergave aan uw gemachtigde gebruikers en de partijen die u noemt, zoeken, exporteren, verwerken van imports en de functies die u gebruikt.
3. **Soorten gegevens.** Namen en referenties; werkbeschrijvingen, data, plaatsen en adressen; registraties van arbeidstijd, urenstaten en afwezigheid; verklaringen en bevestigingen; documenten en foto's die u uploadt; notities.
4. **Betrokkenen.** Uw personeel, voormalig personeel, werkenden, kandidaten, lerenden en contactpersonen van uw klanten.
5. **Instructies.** Wij verwerken de gegevens uitsluitend op basis van uw schriftelijke instructies. Uw gebruik van de functies en instellingen van het platform geldt als uw instructie. Wij verwerken de gegevens niet voor eigen doeleinden, behalve de activiteiten als verwerkingsverantwoordelijke in §2, of wanneer het Unierecht of het lidstatelijke recht dat vereist; als de wet dat vereist, laten wij u dat vooraf weten, tenzij de wet dat verbiedt (art. 28, lid 3, onder a).
6. **Subverwerkers.** U geeft een algemene toestemming voor de subverwerkers die met uw registraties in aanraking komen:
   - Supabase (database en bestandsopslag, EU);
   - Vercel (hosting en serverfuncties);
   - GitHub (geautomatiseerde taken met technische toegang tot productiegegevens).

   De volledige lijst van aanbieders staat in de Privacyverklaring, §6. [LAWYER/OWNER: bevestigen of Hostinger (correspondentie over verzoeken) op deze lijst hoort]

   Wij laten het u [OWNER DECISION: bijv. 30 dagen] van tevoren weten voordat wij een subverwerker toevoegen of vervangen. U kunt op redelijke gronden van gegevensbescherming bezwaar maken. Wij leggen elke subverwerker verplichtingen inzake gegevensbescherming op die gelijkwaardig zijn aan deze (art. 28, leden 2 en 4). [LAWYER/OWNER: verwerkersovereenkomsten met de afzonderlijke subverwerkers zijn nog niet aangetoond]
7. **Bijstand.** Rekening houdend met wat onze systemen mogelijk maken, helpen wij u:
   - verzoeken van betrokkenen te beantwoorden (art. 15-22);
   - uw verplichtingen na te komen op het gebied van beveiliging, melding van inbreuken, gegevensbeschermingseffectbeoordeling en voorafgaande raadpleging (art. 32-36).
8. **Inbreuken in verband met persoonsgegevens.** Wij informeren u zonder onredelijke vertraging over een inbreuk die uw registraties betreft, nadat wij er kennis van hebben genomen [OWNER DECISION: bijv. binnen 48 uur]. Wij voegen de informatie toe waarover wij beschikken en die u nodig hebt op grond van art. 33, lid 3.
9. **Vertrouwelijkheid en beveiliging.** Personen die toegang hebben tot de gegevens, zijn tot geheimhouding verplicht. Onze beveiligingsmaatregelen (art. 32):
   - toegangsregels die in de database zelf worden afgedwongen en door geautomatiseerde tests worden gedekt;
   - afgeschermde bestandsopslag met kortlevende links;
   - alleen aan te vullen (append-only) audit- en toestemmingsregistraties;
   - beheerderstoegang beperkt tot een klein aantal personen.

   [OWNER/LAWYER: een formele beschrijving van de technische en organisatorische maatregelen is nog in behandeling]
10. **Einde van de overeenkomst.** Wanneer u stopt met het gebruik van het platform, kunt u uw registraties exporteren. Daarna verwijderen wij ze, tenzij het Unierecht of het lidstatelijke recht ons verplicht ze te bewaren. [OWNER DECISION: exportformaat en verwijderingstermijn. Let op de technische beperking in §5]
11. **Doorgiften.** De gegevens worden in de EU gehost. Waar een subverwerker gegevens buiten de EER verwerkt, moet een doorgifte-instrument op grond van de artikelen 44-49 van toepassing zijn. [LAWYER/OWNER: per leverancier bevestigen — nog geen enkel aangetoond]
12. **Informatie en audits.** Wij stellen u de informatie ter beschikking die nodig is om aan te tonen dat deze sectie wordt nageleefd. Wij maken redelijke audits door u of uw controleur mogelijk en dragen daaraan bij, met een redelijke aankondiging en met inachtneming van de vertrouwelijkheid (art. 28, lid 3, onder h).
13. **Register.** Wij houden als verwerker een register van de verwerkingsactiviteiten bij (art. 30, lid 2).

## 8. Waar wij verwerkingsverantwoordelijke zijn

Voor de activiteiten die in §2 als de onze zijn aangemerkt, zijn wij verwerkingsverantwoordelijke op grond van onze Privacyverklaring. Waar die activiteiten op uw registraties berusten (bijvoorbeeld koppeling of matching), bevestigt u dat u ons de registraties voor die doeleinden mag verstrekken. [LAWYER]

## 9. Aansprakelijkheid

[LAWYER: verdeling van de aansprakelijkheid tussen de organisatie en UAB „Nonstop Group“ op grond van artikel 82 AVG; vrijwaring voor onrechtmatige uploads; maxima in overeenstemming met de Gebruiksvoorwaarden]

## 10. Wijzigingen, aanvaarding en toepasselijk recht

- [OWNER/LAWYER: hoe deze voorwaarden worden aanvaard en vastgelegd]
- Wij informeren u voordat wezenlijke wijzigingen van kracht worden. [OWNER DECISION: aankondigingstermijn]
- Het Litouwse recht is van toepassing, en de Gebruiksvoorwaarden bepalen waar geschillen worden behandeld.
- Versie **v2 (concept), 2026-10-15**.

## 11. Contact

info@labourmarket.ai — UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litouwen. Er is geen functionaris voor gegevensbescherming aangewezen.
