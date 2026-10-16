# Cookie- en opslagbeleid — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (concept)
> **Juridische toetsing vereist / Requires lawyer review.** Concept voor toetsing door een jurist. Niet definitief, nog zonder rechtskracht, niet gecertificeerd.
> **Vertaling van het Engelse concept; de juridische juistheid van deze vertaling moet afzonderlijk worden getoetst door een gekwalificeerde jurist/vertaler.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Gebruikte feitenbronnen:**
> - Audit 2026-10-15 `02-processors-transfers-cookies-ai.md` §2.1-2.5 (elke cookie en elke opslagsleutel, met de vindplaats in de code) en D5, D12; `03-rights-consent-legal-pages.md` §2, L3, L4
> - Op 2026-10-15 in de code gecontroleerde levensduur: `lm_active_workspace` 180 dagen (`apps/web/lib/company/organization-actions.ts:54`); `lm_hide_admin_ui` 365 dagen (`apps/web/lib/auth/admin-ui-actions.ts:20`)
> - Huidige pagina: `apps/web/messages/en.json` → `legal.cookies`
>
> **Openstaande beslissingen:**
> 1. [OWNER DECISION: een toestemmingsbanner toevoegen voordat de analyse-items in §4 worden opgeslagen, OF telemetrie beperken tot wat strikt noodzakelijk is / uitsluitend geaggregeerd en `lm.attr.first`, `lm.funnel.*` en `lm.pilot.session` verwijderen. **Momenteel worden deze items zonder toestemming opgeslagen en is er geen banner.** Dit beleid mag in de huidige formulering pas worden gepubliceerd wanneer een van beide opties is uitgevoerd.]
> 2. [LAWYER: of naar Litouws recht een uitzondering voor analyse van toepassing is. Standaardlezing: geen voor aan een profiel gekoppelde analyse]
> 3. [LAWYER: classificatie van de „functionele” items in §3 waarom de gebruiker niet uitdrukkelijk heeft gevraagd (gebruikstellers, recent bekeken vacatures)]
> 4. [OWNER: de levensduur van de inlogcookie bevestigen — standaardwaarde van de bibliotheek, niet in onze code ingesteld]
> 5. [OWNER: bevestigen of voor betalingen door Stripe gehoste Checkout-pagina's worden gebruikt, en dat in §5 vermelden]
> 6. [LAWYER: de artikelverwijzing naar de Litouwse wet op de elektronische communicatie (art. 61, lid 3, aangehaald in de audit) toetsen aan de geldende versie]

---

## 1. Waarop dit beleid betrekking heeft

Het platform slaat kleine items op in uw browser:
- **cookies**;
- **lokale opslag** (local storage), die blijft bestaan totdat u die wist;
- **sessieopslag** (session storage), die wordt gewist wanneer u het tabblad sluit.

Bij sommige functies neemt uw browser ook rechtstreeks contact op met andere diensten (§5).

Voor het opslaan of uitlezen van informatie op uw apparaat is uw **toestemming** nodig, tenzij dit **strikt noodzakelijk** is voor een dienst waarom u hebt gevraagd. Deze regel volgt uit artikel 5, lid 3, van de e-privacyrichtlijn 2002/58/EG, in Litouwen omgezet door de wet op de elektronische communicatie (art. 61). [LAWYER: artikel controleren]

Wij gebruiken geen advertentiecookies van derden. Wij gebruiken geen analysedienst van derden en geen sessie-opnames. Wij **hebben** wel onze eigen (first-party) productanalyse, beschreven in §4.

## 2. Strikt noodzakelijke items

Voor deze items is geen toestemming nodig. Zonder deze items kan de dienst waarom u hebt gevraagd niet werken.

| Naam | Type | Levensduur | Doel |
|---|---|---|---|
| `sb-<project>-auth-token` (kan zijn opgesplitst in `.0`, `.1`, …) | cookie | zolang u ingelogd blijft; wordt automatisch vernieuwd [OWNER: maximale levensduur controleren] | houdt u ingelogd |
| `sb-<project>-auth-token-code-verifier` | cookie | kort, alleen voor de inlogstap | beveiligt het inloggen met Google (PKCE) |
| `lm_active_workspace` | cookie (niet leesbaar voor scripts van de pagina) | 180 dagen | onthoudt in welke werkruimte (persoonlijk of organisatie) u werkt |
| `lmai:command-finder-speech-consent:v1` | lokale opslag | totdat u die wist | legt vast dat u de kennisgeving over spraakdictatie hebt geaccepteerd |
| `lm.oauth.trace` | sessieopslag | totdat het tabblad wordt gesloten | een willekeurige ID waarmee wij een mislukte inlogpoging kunnen traceren |
| `lm-chunk-reload` | sessieopslag | totdat het tabblad wordt gesloten | voorkomt dat de pagina na een update in een lus herlaadt |

## 3. Voorkeurs- en functionele items

Deze items onthouden keuzes die u hebt gemaakt, of bewaren uw werk terwijl u een functie gebruikt.

| Naam | Type | Levensduur | Doel |
|---|---|---|---|
| `NEXT_LOCALE` | cookie | 1 jaar | uw taal |
| `lm_tz` | cookie | 1 jaar | uw tijdzone, zodat dagen en tijden juist worden weergegeven |
| `lm_hide_admin_ui` | cookie | 1 jaar | alleen voor beheerders: of beheerknoppen verborgen zijn. Wijzigt geen rechten |
| `theme` | lokale opslag | totdat u die wist | licht of donker thema |
| `lm.communication.writeLanguage` | lokale opslag | totdat u die wist | de taal waarin u berichten schrijft |
| `lmai:voice-speech-language` | lokale opslag | totdat u die wist | dicteertaal |
| `lm.search-location.v1` | lokale opslag | totdat u die wist | de zoeklocatie die u hebt gekozen. Die kan nauwkeurig zijn en blijft op uw apparaat |
| `lm.opportunities.recentlyViewed.v1` | lokale opslag | totdat u die wist | vacatures die u recent hebt bekeken [LAWYER: classificatie] |
| `lm.commandFinder.recentCommandIds` | lokale opslag | totdat u die wist | uw recente opdrachten |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | lokale opslag | totdat u die wist | hoe vaak u functies gebruikt, om snelkoppelingen voor te stellen. Blijft op uw apparaat [LAWYER: classificatie] |
| `lm.professionRecoveryPrompt.v1.dismissed` | lokale opslag | totdat u die wist | u hebt deze melding gesloten |
| `lm.work-card-checks.kept` | lokale opslag | totdat u die wist | controles die u wilde bewaren |
| `lm.employerVisibilityAsk.v1` | lokale opslag | totdat u die wist | uw antwoord op de vraag over zichtbaarheid voor werkgevers. De toestemming zelf wordt op onze server vastgelegd |
| `lm.chat.continueAfterSwitch` | sessieopslag | totdat het tabblad wordt gesloten | maximaal 500 tekens van een zin die u hebt getypt, zodat die kan doorgaan nadat u van werkruimte wisselt |
| `lmai:voice-transcript-draft` | sessieopslag | totdat het tabblad wordt gesloten | de concepttekst van uw dictaat |

## 4. Analyse-items — toestemming vereist

Wij meten hoe het product wordt gebruikt: welke pagina's en stappen mensen bereiken, registratiestappen, dagelijkse activiteit en welke campagne een bezoeker heeft aangetrokken. Gebeurtenissen worden op onze eigen servers opgeslagen en, als u bent ingelogd, aan uw account gekoppeld.

[OWNER DECISION: banner of schrappen] **Deze items worden pas geplaatst nadat u toestemming hebt gegeven.** U kunt uw keuze op elk moment wijzigen via [OWNER DECISION: waar de keuze wordt gewijzigd, bijv. de link „Cookie-instellingen” in de footer].

| Naam | Type | Levensduur | Doel |
|---|---|---|---|
| `lm.attr.first` | lokale opslag | totdat u die wist | campagnegegevens van het eerste bezoek (`utm_*`-tags, verwijzende website, landingspagina). Bij de registratie worden deze in uw accountgegevens overgenomen |
| `lm.funnel.last_seen_day` | lokale opslag | totdat u die wist | de laatste dag waarop u actief was, om dagelijks actieve gebruikers te tellen |
| `lm.funnel.signup_pending` | lokale opslag | totdat u die wist | markeert dat een registratie bezig is |
| `lm.pilot.session` | sessieopslag | totdat het tabblad wordt gesloten | een willekeurige sessie-ID die met elke analysegebeurtenis wordt meegestuurd |
| `lm.funnel.*` (bijvoorbeeld `landing_fired`, `login_succeeded`) | sessieopslag | totdat het tabblad wordt gesloten | voorkomt dat dezelfde analysegebeurtenis twee keer wordt geteld |

Als u geen toestemming geeft, werkt het product op dezelfde manier.

De analyse zelf is gebaseerd op ons gerechtvaardigd belang bij het verbeteren van het product (artikel 6, lid 1, onder f, AVG). U kunt daartegen bezwaar maken (zie de Privacyverklaring, §10).

## 5. Diensten waarmee uw browser rechtstreeks contact opneemt

- **OpenStreetMap-kaarttegels** (`tile.openstreetmap.org`). De marktkaart laadt haar kaartdelen van de servers van de OpenStreetMap Foundation. Uw browser stuurt uw IP-adres, browsergegevens en het kaartgebied dat u bekijkt. Er is geen cookie van ons bij betrokken. Het eigen privacybeleid van de OpenStreetMap Foundation is van toepassing.
- **Spraakdictatie.** Als u in de opdrachtzoeker dictatie gebruikt, stuurt uw browser uw audio naar de spraakdienst van zijn maker (bijvoorbeeld Google voor Chrome, Apple voor Safari). Wij ontvangen de audio niet. Vóór het eerste gebruik ziet u een kennisgeving.
- **Betaalpagina's.** Wanneer een organisatie betaalt, gelden op de pagina's van Stripe de eigen voorwaarden en cookies van Stripe. [OWNER: gehoste Checkout bevestigen]
- **Lettertypen** worden vanaf onze eigen website geleverd. Er wordt geen verbinding gemaakt met Google Fonts.

## 6. Hoe u deze items beheert of verwijdert

- Via uw browserinstellingen kunt u cookies en sitegegevens (lokale opslag en sessieopslag) op elk moment verwijderen.
- Als u de inlogcookies verwijdert, wordt u uitgelogd.
- Sessieopslag wordt gewist wanneer u het tabblad sluit.
- [OWNER DECISION: de toestemmingskeuze in het product voor §4, zodra die is gebouwd]

## 7. Wijzigingen

- Versie **v2 (concept), 2026-10-15**.
- Wij werken deze lijst bij voordat wij een nieuwe cookie of een nieuw opslagitem toevoegen.
- Vragen: info@labourmarket.ai.
- Verwerkingsverantwoordelijke: UAB „Nonstop Group“, ondernemingscode 302676973 (zie de Privacyverklaring, §1).
