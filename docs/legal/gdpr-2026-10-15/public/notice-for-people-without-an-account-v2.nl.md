# Kennisgeving voor personen zonder account — LabourMarket.ai

*Informatie op grond van artikel 14 AVG (gegevens die niet van u zijn verkregen)*

> **Status:** DRAFT v2 — 2026-10-15 (concept)
> **Juridische toetsing vereist / Requires lawyer review.** Concept voor toetsing door een jurist. Niet definitief, nog zonder rechtskracht, niet gecertificeerd.
> **Vertaling van het Engelse concept; de juridische juistheid van deze vertaling moet afzonderlijk worden getoetst door een gekwalificeerde jurist/vertaler.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Gebruikte feitenbronnen:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §3.3 (43 personen in roosters, 41 niet aan een account gekoppeld; 2.944 bewijsregistraties; staging-rijen met `person_label` + `activity_text`; `source_fact` kan namen en adressen van personen bevatten; accountkoppeling SET NULL; zonder account geen weg om rechten uit te oefenen)
> - `03-rights-consent-legal-pages.md` §0, §3 (alle 43 in één organisatie; registraties leesbaar voor managers van de importerende organisatie en van als partij genoemde organisaties; geen kennisgeving op grond van art. 14; claimen alleen via een door een manager verstuurde uitnodiging; betwisten pas na koppeling; registraties alleen aan te vullen (insert-only); Zweedse vacatures: 41.353 beschrijvingen met een e-mailadres, 22.500 met formuleringen over een contactpersoon; NAV: 3.809 met telefoonnummerachtige reeksen; vacaturetekst wordt letterlijk getoond aan ingelogde gebruikers; verwijderde vacatures worden bewaard)
> - `02-processors-transfers-cookies-ai.md` §1 rij 15, D13 (NAV-`contactList` nooit opgeslagen; Zweedse beschrijving opgeslagen); §1 rijen 9, 21 (contactpersonen bij behoeften van bedrijven; uitnodigingsmails)
> - `docs/legal/retention-decision-package-v1.md` beslissing 3b
>
> **Openstaande beslissingen:**
> 1. [OWNER DECISION: kanaal voor verzoeken van personen zonder account — voorlopig voorstel: info@labourmarket.ai; een apart webformulier met identiteitscontrole overwegen]
> 2. [LAWYER: rolverdeling voor door organisaties aangeleverde registraties — de organisatie als verwerkingsverantwoordelijke met het platform als verwerker, gezamenlijke verwerkingsverantwoordelijken (art. 26) of zelfstandige verwerkingsverantwoordelijken. Zie `organisation-data-terms-v2` §2]
> 3. [LAWYER/OWNER: wie deze kennisgeving verstrekt aan personen in roosters van organisaties, en wanneer (art. 14, lid 3: uiterlijk binnen één maand). Momenteel wordt geen kennisgeving verstrekt]
> 4. [LAWYER: of art. 14, lid 5, onder b (onevenredige inspanning) van toepassing is op contactpersonen in openbare vacatures, en welke maatregelen voor het openbaar maken van de informatie daarmee gepaard moeten gaan]
> 5. [OWNER DECISION: e-mailadressen en telefoonnummers in de vacaturetekst vóór weergave onleesbaar maken, of behouden; bewaring van verwijderde vacatures (voorgesteld 12 maanden)]
> 6. [OWNER DECISION: weg voor wissing of onleesbaarmaking van alleen aan te vullen (insert-only) bewijsregistraties van organisaties]
> 7. [OWNER DECISION: bewaring van import-staging-rijen]

---

## 1. Waarom u dit misschien leest

Het LabourMarket.ai-platform kan informatie over u bevatten, ook al hebt u zich nooit geregistreerd. Dat gebeurt op vier manieren:

- **A.** Een bedrijf, bureau of school heeft **uw werkgeschiedenis vastgelegd of geïmporteerd**. Bijvoorbeeld: een voormalige werkgever heeft de projecten ingevoerd waaraan u hebt gewerkt.
- **B.** U wordt genoemd als **contactpersoon in een openbare vacature**, gepubliceerd door de Zweedse of Noorse openbare dienst voor arbeidsbemiddeling.
- **C.** U bent de **contactpersoon in een zakelijke aanvraag** die een bedrijf ons heeft gestuurd (bijvoorbeeld een personeelsbehoefte).
- **D.** Iemand heeft **u per e-mail uitgenodigd** om lid te worden, en u bent nog geen lid geworden.

Deze kennisgeving vertelt u welke gegevens wij hebben, waarom, en wat u kunt doen.

## 2. Wie verantwoordelijk is

**UAB „Nonstop Group“**
Ondernemingscode 302676973
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litouwen
Privacycontact: **info@labourmarket.ai**. Er is geen functionaris voor gegevensbescherming aangewezen.

In **geval A** beslist de organisatie die uw geschiedenis heeft vastgelegd wat zij over u vastlegt, en zij is verantwoordelijk voor die registraties. Voor de eigen werkzaamheden van het platform met die registraties zijn wij verantwoordelijk (bijvoorbeeld het koppelen van een registratie aan een account als u zich later aansluit). [LAWYER: rolverdeling bevestigen]

## 3. Welke gegevens wij hebben, en waar ze vandaan komen

| Geval | Gegevens | Bron |
|---|---|---|
| A — werkgeschiedenis | uw naam zoals de organisatie die heeft vastgelegd, de referentie van de organisatie voor u, beschrijvingen van werk, data, plaatsen en adressen van het werk, notities, verklaringen van de organisatie, en signalen over vaardigheden die het platform uit deze registraties afleidt | de organisatie (haar bestanden of imports) |
| B — vacatures | naam van de werkgever, organisatienummer (waarmee een eenmanszaak kan worden geïdentificeerd), en de vacaturetekst, die de naam, het e-mailadres en het telefoonnummer van een contactpersoon kan bevatten. Wij slaan de afzonderlijke gestructureerde contactlijst van de dienst voor arbeidsbemiddeling niet op | Arbetsförmedlingen (Zweden) en NAV (Noorwegen), openbare open data |
| C — aanvragen | bedrijfsnaam, uw naam en contactgegevens zoals het bedrijf die heeft ingevoerd, details van de behoefte | het bedrijf dat de aanvraag heeft gestuurd |
| D — uitnodigingen | uw e-mailadres, de naam die de uitnodiger heeft getypt, en diens bericht | de persoon of organisatie die u heeft uitgenodigd |

## 4. Waarom wij de gegevens gebruiken, en op welke rechtsgrond

| Geval | Doel | Rechtsgrond |
|---|---|---|
| A | de organisatie bewaart en gebruikt haar eigen werkregistraties. Het platform host ze, laat u ze later claimen en leidt signalen over vaardigheden af | de eigen rechtsgrond van de organisatie voor haar registraties. Voor de koppeling en de afgeleide signalen van het platform: ons gerechtvaardigd belang om mensen een bruikbare registratie van hun werkelijke werk te bieden (artikel 6, lid 1, onder f, AVG) [LAWYER] |
| B | beschikbare vacatures tonen aan werkzoekenden, zodat zij kunnen solliciteren | gerechtvaardigd belang (art. 6, lid 1, onder f): de vacature is gepubliceerd zodat mensen contact opnemen met de werkgever [LAWYER] |
| C | de aanvraag beantwoorden en een mogelijke overeenkomst voorbereiden | precontractuele stappen / gerechtvaardigd belang (art. 6, lid 1, onder b en f) |
| D | de uitnodiging bezorgen en u de mogelijkheid geven die te aanvaarden | gerechtvaardigd belang van de uitnodiger en van u om te worden uitgenodigd (art. 6, lid 1, onder f) |

Wij vragen niet naar bijzondere categorieën van persoonsgegevens (art. 9) over u. Als een registratie per vergissing zulke gegevens bevat, laat het ons of de organisatie dan weten.

## 5. Wie de gegevens kan zien

- **Geval A:** managers van de organisatie die de gegevens heeft vastgelegd, kunnen ze zien. Dat geldt ook voor managers van een andere organisatie die als partij in dezelfde registratie is genoemd (bijvoorbeeld de opdrachtgever van een project). Andere gebruikers kunnen ze niet zien. Ze worden **niet** getoond aan werkgevers die naar kandidaten zoeken.
- **Geval B:** de vacaturetekst, inclusief eventuele contactgegevens daarin, wordt getoond aan **ingelogde gebruikers** van het platform. [OWNER DECISION: onleesbaarmaking]
- **Geval C:** ons team. Als het meldingskanaal van de eigenaar is ingeschakeld, gaat een korte melding via Telegram of de Agentai OS-brug naar de eigenaar; die bevat geen gegevens van werkenden. [OWNER: bevestigen]
- **Geval D:** de uitnodiger en ons team.

Onze dienstverleners hosten de gegevens (Supabase, in de EU; Vercel; anderen vermeld in de Privacyverklaring, §6). De Privacyverklaring, §7, licht doorgiften buiten de EER toe.

## 6. Hoe lang wij de gegevens bewaren

- **A:** zolang de organisatie de registratie bewaart. [OWNER DECISION: standaardtermijn; import-staging-rijen]
- **B:** zolang de vacature actief is. Verwijderde vacatures worden verborgen, maar momenteel bewaard. [OWNER DECISION: voorgesteld 12 maanden na verwijdering]
- **C:** [OWNER DECISION: voorgesteld 24 maanden na afsluiting van de aanvraag]
- **D:** [OWNER DECISION: tot aanvaarding, intrekking of verval]

## 7. Uw rechten

U hebt dezelfde rechten als accounthouders: inzage, rectificatie, gegevenswissing, beperking van de verwerking, bezwaar en, waar van toepassing, overdraagbaarheid van gegevens (artikelen 15-21 AVG). De Privacyverklaring, §10, beschrijft deze rechten.

**Bezwaar.** Waar wij ons baseren op gerechtvaardigde belangen (art. 6, lid 1, onder f), kunt u bezwaar maken. Wij stoppen dan, tenzij wij dwingende gronden hebben. Voor contactgegevens in vacatures (geval B) verbergen of verwijderen wij uw gegevens in onze kopie van de vacature. [OWNER DECISION: de maatregel bevestigen]

**Geval A — registraties die een organisatie bijhoudt.**
- U kunt ons vragen welke organisatie uw geschiedenis heeft vastgelegd. Wij sturen uw verzoek door naar die organisatie, of geven u haar contactgegevens.
- Wij wissen de signalen over vaardigheden en de koppelingen die het platform zelf heeft afgeleid.
- De organisatie beslist over haar eigen registraties. Zij moet u antwoorden op grond van haar eigen verplichtingen uit de AVG.
- Registraties kunnen alleen worden aangevuld (append-only), dus een correctie wordt als nieuwe vermelding toegevoegd. [OWNER DECISION: weg voor wissing]

**Uw werkgeschiedenis claimen.** Als u de geschiedenis in uw eigen account wilt hebben, vraag de organisatie dan u een uitnodiging te sturen. Momenteel kan een registratie zonder uitnodiging niet worden geclaimd; dit voorkomt dat onbekenden naar de registraties van anderen zoeken. Zodra uw account is gekoppeld, kunt u de registratie inzien en betwisten.

## 8. Hoe u contact met ons opneemt

[OWNER DECISION: kanaal] Schrijf naar **info@labourmarket.ai**, met als onderwerp „Verzoek — geen account”. Vermeld:
- welk geval van toepassing is (A, B, C of D);
- uw naam zoals die in de registratie kan voorkomen;
- bij geval A de organisatie, als u die kent;
- bij geval B een link naar de vacature, of de naam van de werkgever.

**Identiteitscontrole.** Omdat u geen account hebt, moeten wij bevestigen dat u de betrokkene bent voordat wij iets verstrekken of wijzigen. Wij vragen alleen wat nodig is, bijvoorbeeld een antwoord vanaf het e-mailadres dat in de registratie staat, of gegevens die alleen u kunt kennen. Wij vragen niet om een kopie van een identiteitsdocument, tenzij er geen andere mogelijkheid is. [LAWYER: bevestigen]

**Termijn.** Wij antwoorden binnen **één maand**. Bij complexe verzoeken kunnen wij deze termijn met twee maanden verlengen; in dat geval laten wij u dat binnen de eerste maand weten (art. 12, lid 3). Verzoeken zijn kosteloos.

## 9. Klachten

U kunt een klacht indienen bij een toezichthoudende autoriteit in de EU-lidstaat waar u woont of werkt. Onze leidende toezichthoudende autoriteit is de Staatsinspectie voor Gegevensbescherming van Litouwen (Valstybinė duomenų apsaugos inspekcija, VDAI): L. Sapiegos g. 17, LT-10312 Vilnius, ada@ada.lt, vdai.lrv.lt. [LAWYER: controleren]

## 10. Versie

v2 (concept), 2026-10-15. Deze kennisgeving is gepubliceerd op [OWNER DECISION: openbare URL, bijv. /legal/no-account-notice]. Er wordt naar verwezen vanuit de Privacyverklaring.
