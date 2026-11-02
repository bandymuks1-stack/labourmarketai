# Datenschutzerklärung — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (Entwurf)
> **Anwaltliche Prüfung erforderlich / Requires lawyer review.** Dies ist ein Entwurf zur anwaltlichen Prüfung. Er ist nicht endgültig, hat noch keine Rechtswirkung und ist von niemandem zertifiziert.
> **Übersetzung des englischen Entwurfs; die rechtliche Richtigkeit dieser Übersetzung bedarf einer gesonderten Prüfung durch eine qualifizierte Rechtsanwältin bzw. einen qualifizierten Rechtsanwalt oder eine Fachübersetzerin bzw. einen Fachübersetzer.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Verwendete Faktenquellen (und keine anderen):**
> - Audit 2026-10-15: `gdpr-2026-10-15/audit/01-personal-data-inventory-and-erasure-classes.md`, `02-processors-transfers-cookies-ai.md`, `03-rights-consent-legal-pages.md`
> - `docs/legal/`: `corporate-identity-source-of-truth-v1.md`, `legal-basis-matrix-v1.md`, `data-retention-matrix-v1.md`, `retention-decision-package-v1.md`, `processing-activities-register-v1.md`, `subprocessor-register-v2.md`, `entity-role-and-data-access-matrix-v1.md`, `dpo-requirement-assessment-v1.md`, `consent-copy-register-v1.md`, `deletion-process-design-v1.md`, `privacy-risk-and-dpia-screening-v1.md`
> - Derzeit veröffentlichter Text: `apps/web/messages/en.json` → `legal.*`; `apps/web/lib/privacy/consent-definitions.ts`; `apps/web/lib/billing/plans.ts`
>
> **Offene Entscheidungen (müssen vor der Veröffentlichung geklärt werden):**
> 1. [OWNER DECISION: Speicherfristen je Datenklasse — die Entscheidungen 1, 2, 3, 3b aus Paket A sind nicht genehmigt; jede Frist in §9 ist ein Vorschlag]
> 2. [OWNER DECISION: Einwilligungsbanner für die Analytics-Speicherung ODER Telemetrie auf das unbedingt Erforderliche / ausschließlich aggregierte Daten beschränken. Derzeit wird die Analytics-Speicherung ohne Einwilligung vorgenommen]
> 3. [OWNER DECISION: Mindestalter (16 oder 18) und die Regel für Lernende / Studierende]
> 4. [OWNER DECISION: Kanal für Anträge von Personen ohne Konto]
> 5. [OWNER DECISION: Gemini — die kostenpflichtige Stufe bestätigen, bevor Aufgaben mit personenbezogenen Daten wieder aktiviert werden; bis dahin gibt diese Erklärung an, dass sie deaktiviert sind]
> 6. [LAWYER/OWNER: das Übermittlungsinstrument (SCC / EU-US Data Privacy Framework / Angemessenheitsbeschluss) je Anbieter bestätigen — im Repository ist keines belegt]
> 7. [LAWYER/OWNER: bestätigen, dass Auftragsverarbeitungsverträge (AVV) mit Supabase, Vercel, Stripe, Resend, Hostinger und GitHub abgeschlossen sind]
> 8. [LAWYER: Rechtsgrundlage je Zweck (Tabelle §4) — nur eine vorläufige Zuordnung]
> 9. [LAWYER: Rolle von Organisationen, die Daten von Personen hochladen — siehe `organisation-data-terms-v2`, wo dies als OPEN DECISION aufgeführt ist, einschließlich gemeinsamer Verantwortlichkeit nach Art. 26]
> 10. [OWNER/LAWYER: Datenschutz-Folgenabschätzung (DSFA) für automatisches Matching und das Ranking von Kandidatinnen und Kandidaten — die Auslöseschwelle ist bereits überschritten, eine DSFA liegt nicht vor]
> 11. [OWNER: bestätigen, ob die Übergabeschnittstelle an Nonstop Group (`NONSTOP_HANDOFF_ENDPOINT`), Telegram-Benachrichtigungen an den Inhaber und die Agentai-OS-Benachrichtigungsbrücke in der Produktion aktiviert sind]
> 12. [OWNER: den Anbieter der „Partnerinfrastruktur“ für das Partner-Chancennetzwerk benennen]
>
> **[INTERNAL — vor der Veröffentlichung entfernen]**
> - [OWNER/LAWYER: Bewertung der früheren Verarbeitung über die kostenlose Stufe ausstehend] Zwischen 2026-08-28 und #2399 wurden Nachrichtentexte und im Chat eingegebene Sätze an Gemini gesendet, ohne dass eine kostenpflichtige Stufe nachgewiesen war. Diese Erklärung stellt diesen Zeitraum NICHT als Tatsache dar. Eine Entscheidung zur Bewertung als Datenschutzverletzung nach Art. 33–34 ist erforderlich.
> - GELÖST 2026-10-15: Die 2 `extract_cv`- und 13 `translate_vacancy`-Zeilen haben Gemini nie erreicht (Ablehnung durch die Egress-Sperre, keine Tokens). `data_categories_sent` erfasst die beabsichtigten, nicht die tatsächlich gesendeten Kategorien. §8 ist in der vorliegenden Fassung für das derzeitige Verhalten zutreffend. Die frühere Verarbeitung (145 Nachrichtenübersetzungen 2026-09-28→10-09, 79 Aufrufe zum Chat-Verständnis 2026-09-05→10-14) ist ein interner Bewertungspunkt (INC-2026-001), kein veröffentlichter Text.
> - Von den Live-Seiten die Aussagen „Zahlungen sind nicht aktiv“, „erstellt keine Verhaltensprofile“, „keine Analytics“ und „Gemini übersetzt Stellenanzeigen“ entfernen. Die Audit-Punkte D1, D5, D10 und L7 zeigen, dass sie falsch sind.
> - Der Name des Geschäftsführers darf erst nach Verifizierung in öffentlichem Text erscheinen (`corporate-identity-source-of-truth-v1.md` §4 #2).

---

## 1. Wer wir sind und wie Sie uns erreichen

Verantwortlicher für die Plattform LabourMarket.ai ist:

**UAB „Nonstop Group“**
Unternehmenscode 302676973, USt-IdNr. LT100010790613
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litauen

- Datenschutzkontakt: **info@labourmarket.ai**. Dies ist ein Postfach. Es ist kein Datenschutzbeauftragter.
- **Es ist kein Datenschutzbeauftragter benannt.** Unsere Prüfung nach Art. 37 DSGVO hat ergeben, dass derzeit keiner erforderlich ist. [LAWYER: erneut prüfen — inzwischen läuft automatisches Matching, was nach `dpo-requirement-assessment-v1.md` §5 eine erneute Prüfung auslöst]
- „LabourMarket.ai“ ist der Name der Plattform. Es ist kein Unternehmen.
- **Labour Market AI Sp. z o.o.** (Warschau, Polen) ist Inhaberin der Software und der Marke und lizenziert sie an UAB „Nonstop Group“. Sie ist weder Verantwortlicher noch Auftragsverarbeiter Ihrer Daten. Sie hat keinen regulären Zugriff auf die Produktionsdatenbank, Profile, Lebensläufe, Kontakte oder Dokumente.

## 2. Unsere Rolle und die Rolle von Organisationen

Es gibt drei Konstellationen. Sie entscheiden darüber, wer für Ihre Daten einsteht.

| Konstellation | Wer über die Daten entscheidet | Unsere Rolle |
|---|---|---|
| Ihr eigenes Konto, Profil, Living CV, Arbeitstagebuch, Ihre Einwilligungen, Nachrichten, das Matching und die eigenen Funktionen der Plattform | UAB „Nonstop Group“ | **Verantwortlicher** |
| Aufzeichnungen, die ein Unternehmen, eine Agentur oder eine Schule über Personen erstellt oder hochlädt (zum Beispiel eine Personalliste, importierte Arbeitshistorie, Projektaufzeichnungen, Abwesenheits- oder Arbeitszeitaufzeichnungen) | Diese Organisation, für ihre eigenen Aufzeichnungen | In der Regel **Auftragsverarbeiter** der Organisation (Art. 28 DSGVO). Für das, was die Plattform selbst hinzufügt, etwa die Verknüpfung einer Aufzeichnung mit einem Konto oder das Matching, bleiben wir **Verantwortlicher**. [LAWYER: je Tätigkeit bestätigen — siehe `organisation-data-terms-v2`, wo dies als OPEN DECISION aufgeführt ist, einschließlich gemeinsamer Verantwortlichkeit nach Art. 26] |
| Daten, die Sie selbst an andere senden (Ihr eigener KI-Assistent, Ihr Google-Konto, ein Arbeitgeber, der Ihre Daten mit Ihrer Einwilligung erhalten hat) | Der Empfänger, für seine eigene Verarbeitung | Für die eigene Nutzung durch den Empfänger sind wir nicht verantwortlich |

Ist eine Organisation der Verantwortliche, muss sie Sie über ihre Verarbeitung informieren. Sie können sich trotzdem an uns wenden; wir leiten Ihr Anliegen weiter oder teilen Ihnen mit, an wen Sie sich wenden können.

## 3. Wessen Daten diese Erklärung betrifft

- **Personen mit Konto:** Arbeitskräfte, Arbeitsuchende, Lernende sowie Personen, die die Plattform für ein Unternehmen, eine Agentur oder eine Schule nutzen.
- **Personen ohne Konto**, deren Daten auf die Plattform gelangen:
  - Personen, deren Arbeitshistorie eine Organisation erfasst oder importiert hat;
  - in öffentlichen Stellenanzeigen genannte Kontaktpersonen;
  - Kontaktpersonen in geschäftlichen Anfragen (zum Beispiel eine Bedarfsanfrage eines Unternehmens);
  - per E-Mail eingeladene Personen, die noch nicht beigetreten sind.

  Für Personen ohne Konto gibt es einen gesonderten Hinweis: **„Hinweis für Personen ohne Konto“**.
- **Besucherinnen und Besucher** der öffentlichen Website (technische Daten, siehe die Cookie- und Speicherrichtlinie).

## 4. Wofür wir Daten verwenden und auf welcher Rechtsgrundlage

Die Rechtsgrundlagen sind diejenigen des Art. 6 Abs. 1 DSGVO: (a) Einwilligung, (b) Vertrag, (c) rechtliche Verpflichtung, (f) berechtigte Interessen. [LAWYER: jede Zeile bestätigen]

„Speicherdauer“ nennt die derzeit geltende Regel; §9 enthält die vorgeschlagenen Fristen. „Auftragsverarbeiter“ bezeichnet unsere Dienstleister nach §6.

| # | Zweck | Daten | Rechtsgrundlage | Herkunft | Speicherdauer | Empfänger |
|---|---|---|---|---|---|---|
| 1 | Ihr Konto anlegen und führen; Ihre Anmeldung | E-Mail-Adresse, Anmeldeidentität, Sprache. Bei Anmeldung mit Google: Name, E-Mail-Adresse, Link zum Profilbild, Google-Konto-ID | Art. 6 Abs. 1 lit. b | Sie; Google | bis zur Löschung des Kontos | Auftragsverarbeiter (Supabase; Resend und Amazon SES für Anmelde-E-Mails) |
| 2 | Ihr Profil und Living CV | Beruf, Fähigkeiten, Erfahrung, Ausbildung, Leistungen, Sprachen, Verfügbarkeit, Gehaltsvorstellung (falls angegeben), Avatar, Links zu externen Profilen, Dokumentenliste | Art. 6 Abs. 1 lit. b | Sie | bis zur Löschung des Kontos | Auftragsverarbeiter; andere nur im Rahmen der Zwecke 4, 5, 6, 8 |
| 3 | Arbeitstagebuch und Arbeitsaufzeichnungen | Tagebucheinträge (Text, Fotos, Kennzahlen), Stunden, Stundenzettel, Arbeitspläne, Aufgaben, Abwesenheiten | Art. 6 Abs. 1 lit. b. Wo ein Arbeitgeber Arbeitszeit- oder Abwesenheitsaufzeichnungen führt, ist der Arbeitgeber im Rahmen seiner eigenen rechtlichen Verpflichtungen Verantwortlicher (Art. 6 Abs. 1 lit. c) | Sie; Ihre Organisation | bis zur Löschung des Kontos; Aufzeichnungen des Arbeitgebers siehe §9 | Manager der Organisation, zu der die Arbeit gehört; Auftragsverarbeiter |
| 4 | Unternehmen und Agenturen eine begrenzte berufliche Zusammenfassung auffinden lassen | Anzeigename, Beruf, Erfahrung, Fähigkeiten, ungefähre Region, Verfügbarkeit, Sprachen, Gehaltsvorstellung (nur falls angegeben) | **Art. 6 Abs. 1 lit. a Einwilligung** („Profilsichtbarkeit“), Opt-in | Sie | bis zu Ihrem Widerruf | registrierte Unternehmen und Agenturen |
| 5 | Ihre Kontaktdaten, Ihren Lebenslauf oder ausgewählte Felder an **ein** benanntes Unternehmen für einen Bedarf senden | nur die von Ihnen freigegebenen Felder | **Art. 6 Abs. 1 lit. a Einwilligung** („Übermittlung an ein Unternehmen“) | Sie | der Übermittlungsnachweis: §9 | nur dieses Unternehmen |
| 6 | Ihre Verfügbarkeit im Partner-Chancennetzwerk zeigen, das auch außerhalb dieser Plattform nach Arbeit sucht | nur eine nicht sprechende Referenz und berufliche Merkmale: kein Name, keine E-Mail-Adresse, Telefonnummer oder Anschrift, keine Lebenslaufdatei und keine Tagebuchinhalte. Pseudonymisiert, nicht anonym | **Art. 6 Abs. 1 lit. a Einwilligung** („Partnernetzwerk“) | Sie | bei jeder Aktualisierung neu erstellt; nach Ihrem Widerruf bei der nächsten Aktualisierung entfernt | in unserem Auftrag handelnde Partnerinfrastruktur [OWNER: Anbieter benennen] |
| 7 | Ihr Interesse an einer Stelle an den Personaldienstleistungsbereich von Nonstop Group weitergeben, wenn Sie dies wünschen | die für die Stelle benötigten, freigegebenen Angaben (Allow-List) | Art. 6 Abs. 1 lit. a, Einwilligung in diesem Schritt [LAWYER: oder Art. 6 Abs. 1 lit. b] | Sie | [OWNER DECISION] | Personaldienstleistungsbereich der UAB „Nonstop Group“ |
| 8 | Von Ihnen angenommene Arbeitsbeziehungen (Personalliste oder Team, Buchungen, Einsätze, Projekte) | berufliche Zusammenfassung; Tagebucheinträge im Rahmen dieses Einsatzes | Art. 6 Abs. 1 lit. b; Art. 6 Abs. 1 lit. f für die Koordination durch die Organisation | Sie; die Organisation | solange die Beziehung besteht; Aufzeichnungen siehe §9 | die zuständigen Personen dieser Organisation |
| 9 | Matching und Empfehlungen (siehe §8) | berufliche Daten, Verfügbarkeit, Region, Nachweise in Ihrem Datensatz | Art. 6 Abs. 1 lit. b für Empfehlungen an Sie; Art. 6 Abs. 1 lit. f für das Arbeitgebern angezeigte Ranking, **nur unter Personen, die die Sichtbarkeit eingeschaltet haben** [LAWYER] | Plattform | neu berechnet; Matching-Belege speichern nur Anzahlen und Referenzen | Sie; Arbeitgeber (nur bei eingeschalteter Sichtbarkeit) |
| 10 | Menschliches Matching durch unser Operator-Team | Namen und berufliche Daten im internen Pool. Ohne Ihre Einwilligung wird nichts weitergegeben | Art. 6 Abs. 1 lit. f | Plattform | solange das Konto besteht | nur unser Operator-Team |
| 11 | Nachrichten zwischen Nutzern | Nachrichtentext, Anhänge, Anzeigename der anderen Person | Art. 6 Abs. 1 lit. b | Sie; die andere Person | gespeichert (§9) | Gesprächsteilnehmer; Auftragsverarbeiter |
| 12 | Nachweis von Einwilligungen und Datenübermittlungen (Art. 7 Abs. 1, Art. 5 Abs. 2) | Einwilligungsereignisse (Zweck, Textversion und Hash, Sprache, Zeitpunkt), Offenlegungsnachweise. **Keine IP-Adresse und keine Browserdaten** | Art. 6 Abs. 1 lit. c und Art. 6 Abs. 1 lit. f | Plattform | nicht änderbar (§9) | Sie; Behörden, falls erforderlich |
| 13 | Bearbeitung von Datenschutzanträgen | der Antrag und unsere Bearbeitungsvermerke | Art. 6 Abs. 1 lit. c | Sie | §9 | unser Datenschutzteam; Auftragsverarbeiter |
| 14 | Aufzeichnungen, die eine Organisation über Sie führt (z. B. importierte Arbeitshistorie) | Name, wie die Organisation ihn erfasst hat, deren Referenz, Arbeitsbeschreibungen, Daten, Orte, Bestätigungen | die eigene Rechtsgrundlage der Organisation (sie ist Verantwortlicher). Unsere Verknüpfung und unser Matching: Art. 6 Abs. 1 lit. f [LAWYER] | die Organisation | entscheidet die Organisation | Manager dieser Organisation und der Organisationen, die in der Aufzeichnung als Partei genannt sind |
| 15 | Öffentliche Stellenanzeigen | Name des Arbeitgebers, Organisationsnummer, Anzeigentext, der eine Kontaktperson mit E-Mail-Adresse oder Telefonnummer nennen kann | Art. 6 Abs. 1 lit. f: Anzeige verfügbarer Arbeit [LAWYER: Art. 14 Abs. 5 lit. b] | die öffentlichen Arbeitsverwaltungen Schwedens und Norwegens | solange aktiv; entfernte Anzeigen ausgeblendet (§9) | alle angemeldeten Nutzer |
| 16 | Geschäftliche Anfragen und Benachrichtigungen an den Inhaber | Firmenname, Kontaktperson, Angaben zum Bedarf | Art. 6 Abs. 1 lit. b vorvertraglich / Art. 6 Abs. 1 lit. f | die anfragende Stelle | [OWNER DECISION] | unser Team; Benachrichtigungskanal des Inhabers, falls aktiviert |
| 17 | Kostenpflichtige Organisationspläne und Rechnungsstellung | E-Mail-Adresse und Name des Rechnungskontakts, **Rechnungsanschrift, USt-IdNr. oder Steuernummer**, Referenz der Organisation und des Plans. Kartendaten gehen direkt an Stripe | Art. 6 Abs. 1 lit. b; Art. 6 Abs. 1 lit. c Buchführung und Steuern | die Organisation; Stripe | gesetzliche Frist (§9) | Stripe; Steuerbehörden und Buchhalter, soweit erforderlich |
| 18 | Produktanalyse (siehe §8 und die Cookie- und Speicherrichtlinie) | mit Ihrer Konto-ID verknüpfte Ereignisse, eine zufällige Sitzungs-ID, Seite, Sprache, Kampagnendaten des ersten Besuchs (`utm_*`, verweisende Website, Einstiegsseite), Organisations-ID | Art. 6 Abs. 1 lit. f für die Analyse; **Einwilligung** für die Speicherung der Kennungen auf Ihrem Endgerät (Art. 5 Abs. 3 ePrivacy-Richtlinie) [OWNER DECISION: Banner oder Wegfall] | Ihr Endgerät | gespeichert (§9) | unser Team; Auftragsverarbeiter |
| 19 | Sicherheit, Missbrauchsverhinderung und Audit-Protokolle | Anfragedaten, IP-Adresse in Hosting-Protokollen, Audit-Aufzeichnungen wesentlicher Änderungen | Art. 6 Abs. 1 lit. f | Ihr Endgerät; Plattform | [OWNER: Zeitraum der Hosting-Protokolle] | Auftragsverarbeiter |
| 20 | KI-gestützte Funktionen (siehe §8) | derzeit gehen nur öffentliche Marktstatistiken an einen KI-Anbieter | Art. 6 Abs. 1 lit. f | Plattform | Ausgabeauszüge werden nach 90 Tagen entfernt | Google (Gemini API) |
| 21 | Anbindung Ihres eigenen KI-Assistenten (ChatGPT, Claude und andere) | was Sie dem Assistenten im Rahmen Ihrer eigenen Berechtigungen zu lesen erlauben | Art. 6 Abs. 1 lit. b, auf Ihren Wunsch | Sie | bis Sie die Verbindung trennen | der Anbieter des Assistenten |
| 22 | Ungefährer Anmeldeort, wenn Sie ihn teilen möchten | Standort auf Stadtebene | Art. 6 Abs. 1 lit. a [OWNER: Funktion und Einwilligungstext prüfen] | Sie | bis zu Ihrem Widerruf | Auftragsverarbeiter |
| 23 | Korrespondenz mit uns | Ihre E-Mail-Adresse und Nachricht | Art. 6 Abs. 1 lit. f; Art. 6 Abs. 1 lit. c bei einem Antrag auf Wahrnehmung von Rechten | Sie | [OWNER DECISION] | E-Mail-Postfach-Anbieter |

**Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO).** Wir fragen nicht nach Gesundheitsdaten, ethnischer Herkunft, Religion, politischen Meinungen, Gewerkschaftszugehörigkeit oder biometrischen Daten. Freitextfelder können solche Daten dennoch enthalten, wenn jemand sie einträgt, zum Beispiel einen Abwesenheitsgrund. Abwesenheitsgründe sind auf Sie und den prüfenden Manager beschränkt. [LAWYER: Rechtsgrundlage nach Art. 9 Abs. 2 lit. b für Abwesenheitsaufzeichnungen von Arbeitgebern; Begrenzung des Freitexts zum Abwesenheitsgrund erwägen]

**Müssen Sie Daten angeben?** Mit Art. 6 Abs. 1 lit. b gekennzeichnete Daten sind für die Bereitstellung der Funktion erforderlich. Ohne sie kann die Funktion nicht arbeiten. Jeder Einwilligungszweck ist freiwillig. Eine Ablehnung ändert sonst nichts an Ihrem Konto.

## 5. Woher die Daten stammen

- **Von Ihnen:** was Sie im Produkt eingeben, hochladen oder sagen.
- **Von Organisationen:** Ein Unternehmen, eine Agentur oder eine Schule kann Tatsachen über Ihre Arbeit erfassen oder importieren (Personallisten, Arbeitshistorie, Projekt- und Zeitaufzeichnungen). Sie kann auch Ihre Tagebucheinträge bestätigen.
- **Von anderen Nutzern:** Nachrichten, Bestätigungen Ihrer Arbeit, Einladungen, in denen Sie genannt werden.
- **Von Google**, wenn Sie sich mit Google anmelden.
- **Von Stripe**, zu den Zahlungen für einen Organisationsplan.
- **Aus öffentlichen Quellen:** von Arbetsförmedlingen (Schweden) und NAV (Norwegen) veröffentlichte Stellenanzeigen. Die strukturierte Kontaktliste von NAV speichern wir nicht. Der Text einer Anzeige kann dennoch eine Kontaktperson nennen.
- **Von Ihrem Endgerät:** technische Daten und Analysedaten (siehe die Cookie- und Speicherrichtlinie).

## 6. Wer Daten erhält

**Innerhalb der Plattform** sind Daten standardmäßig verschlossen. Andere Nutzer sehen nur, was eine bestimmte Regel zulässt. Die Seite „Ihre Daten und wer sie sehen kann“ legt diese Regeln dar.
- Unternehmen und Agenturen sehen Ihre begrenzte Zusammenfassung nur, wenn Sie die Sichtbarkeit eingeschaltet haben (Zweck 4).
- Ihre Kontaktdaten, Ihren Lebenslauf oder Ihre Dokumente sehen sie erst nach einer gesonderten Freigabe für dieses Unternehmen (Zweck 5).
- Manager einer Organisation, mit der Sie arbeiten, sehen, was diese Beziehung erfordert (Zweck 8).
- Manager einer Organisation, die Ihre Arbeitshistorie erfasst hat, können sie lesen. Das gilt auch für Manager einer Organisation, die in dieser Aufzeichnung als Partei genannt ist.
- Bindet ein Arbeitgeber oder ein Manager einen eigenen KI-Assistenten an, kann dieser Assistent lesen, was der Manager lesen darf. Dazu können Daten über Sie gehören, zum Beispiel Suchergebnisse zu Kandidatinnen und Kandidaten, die Personalliste oder Abwesenheitsanträge. Die Organisation ist für diese Entscheidung verantwortlich. [LAWYER: Analyse zu Verantwortlichem und Empfänger — Audit D4]

**Unsere Dienstleister (Auftragsverarbeiter).** Sie handeln nach unseren Weisungen:

| Anbieter | Tätigkeit | Standort |
|---|---|---|
| Supabase | Datenbank, Anmeldung, Dateispeicherung | EU (Irland, eu-west-1); Muttergesellschaft in den USA |
| Vercel | Hosting, Serverfunktionen (Dublin), Anfrageprotokolle | Funktionen in Dublin; ein Teil der Anfrageverarbeitung läuft im globalen Edge-Netzwerk von Vercel; US-Unternehmen |
| Resend, Versand über Amazon SES (eu-west-1) | E-Mails zur Registrierung und Anmeldung | US-Unternehmen; Versand in der EU |
| Stripe Payments Europe | Zahlungsabwicklung für Organisationspläne. Für eigene Zwecke der Betrugsprävention und eigene rechtliche Pflichten handelt Stripe als eigenständiger Verantwortlicher | Irland; weltweite Unternehmensgruppe |
| Hostinger | Postfach für info@labourmarket.ai [OWNER: Anbieter und Standort prüfen] | [prüfen] |
| GitHub | Code-Hosting und automatisierte Jobs. Diese Jobs können technisch auf Produktionsdaten zugreifen und öffentliche Stellendaten schreiben | USA |
| Google (Gemini API) | KI-Verarbeitung. Derzeit werden **nur öffentliche Marktstatistiken** gesendet | Google-Infrastruktur |
| Telegram oder die Agentai-OS-Benachrichtigungsbrücke | kurze Benachrichtigungen an den Inhaber über geschäftliche Anfragen. Keine Daten von Arbeitskräften. **Nur falls aktiviert** [OWNER: bestätigen] | außerhalb des EWR |

**Eigenständige Empfänger.** Sie entscheiden selbst, wie sie die Daten verwenden:
- **Google**, wenn Sie „Weiter mit Google“ verwenden.
- **OpenStreetMap Foundation.** Kartenteile werden von ihren Servern geladen; Ihr Browser übermittelt ihr daher Ihre IP-Adresse und den angezeigten Kartenausschnitt.
- **Der Hersteller Ihres Browsers** (zum Beispiel Google oder Apple), wenn Sie die Sprachdiktierfunktion nutzen. Ihr Browser sendet die Audioaufnahme an seinen eigenen Spracherkennungsdienst; wir erhalten die Audioaufnahme nicht.
- **Der Anbieter eines KI-Assistenten**, den Sie oder Ihre Organisation anbinden.
- **Unternehmen**, die Ihre Daten mit Ihrer Einwilligung erhalten haben.
- **Behörden**, wenn das Gesetz es verlangt.

**Innerhalb der UAB „Nonstop Group“.** Die UAB „Nonstop Group“ betreibt auch ein Personaldienstleistungsgeschäft. Dieses erhält Ihre Daten nur, wenn Sie dies wünschen (Zweck 7).

## 7. Übermittlungen außerhalb des Europäischen Wirtschaftsraums

Unsere Hauptdatenbank befindet sich in der EU. Einige Anbieter sind US-Unternehmen oder verarbeiten Daten außerhalb des EWR:
- das Edge-Netzwerk von Vercel;
- Supportzugriff durch US-Muttergesellschaften;
- von GitHub gehostete Runner;
- Google;
- Telegram, falls aktiviert.

Die OpenStreetMap Foundation hat ihren Sitz im Vereinigten Königreich, für das ein Angemessenheitsbeschluss der EU besteht.

Wo Daten den EWR verlassen, muss ein Übermittlungsinstrument nach Art. 44–49 DSGVO greifen: ein Angemessenheitsbeschluss, das EU-US Data Privacy Framework oder Standardvertragsklauseln. [LAWYER/OWNER: die Grundlage (SCC / DPF / Angemessenheitsbeschluss) je Anbieter bestätigen. In unseren Unterlagen ist noch keine belegt. Kein Instrument veröffentlichen, das nicht bestätigt ist.] Sie können bei uns eine Kopie der Garantien anfordern.

## 8. KI-Funktionen, Matching und Profiling

**Automatisches Matching und Ranking finden statt. Es wird keine ausschließlich auf einer automatisierten Verarbeitung beruhende Entscheidung über Sie getroffen, die Ihnen gegenüber rechtliche Wirkung entfaltet oder Sie in ähnlicher Weise erheblich beeinträchtigt (Art. 22 DSGVO).** Jede maßgebliche Entscheidung trifft ein Mensch: wer kontaktiert wird, wem Arbeit angeboten wird, wer angenommen, verifiziert oder abgelehnt wird.

Was automatisch abläuft:

- **Abgleich eines Bedarfs mit Arbeitskräften.** Veröffentlicht eine Organisation einen Bedarf oder eröffnet ihn erneut, ordnet ein regelbasierter Matcher die Arbeitskräfte, die die Sichtbarkeit eingeschaltet haben, nach Rang. Er sendet keine Nachricht, keine Einladung und keine Benachrichtigung. Die Organisation entscheidet, ob sie jemanden kontaktiert.
- **Ranking von Kandidatinnen und Kandidaten.** Suchergebnisse für Arbeitgeber werden nach Eignung sortiert. Ein Arbeitgeber sieht zuerst eine kurze Liste der besten Ergebnisse (derzeit 8). Das Ranking beeinflusst, wer zuerst gesehen wird. Es lehnt niemals jemanden ab.
- **Job-Benachrichtigungen und „neue passende Jobs“.** Wir vergleichen Ihr Profil mit offenen Stellen und empfehlen sie Ihnen.
- **Ableitungen im Living CV.** Aus Ihren Nachweisen schlagen wir direkte, indirekte und potenzielle Fähigkeiten vor. Ein Vorschlag bleibt ein Vorschlag. Er ist getrennt gekennzeichnet von dem, was Sie angegeben haben, und von dem, was jemand bestätigt oder zertifiziert hat.
- **Bestätigungsregeln von Organisationen.** Eine Organisation kann eine Regel festlegen, die eine Fähigkeit in ihrer eigenen Aufzeichnung bestätigt, wenn ihr Konfidenzschwellenwert erreicht ist. [OWNER/LAWYER: Information und Erläuterung gegenüber der Arbeitskraft fehlen — Audit 03, Nachtrag]

**KI-Modelle.**
- Derzeit ist die einzige Aufgabe, die ein externes KI-Modell (Google Gemini) erreicht, die Erläuterung **öffentlicher Marktstatistiken**. Sie enthält keine personenbezogenen Daten.
- Die Übersetzung von Nachrichten und Vorschläge für im Chat eingegebene Sätze sind für personenbezogene Daten **deaktiviert**. Sie bleiben deaktiviert, bis die kostenpflichtigen, vertragsbasierten Bedingungen des KI-Anbieters bestätigt sind. [OWNER DECISION: erst nach Bestätigung der kostenpflichtigen Stufe wieder aktivieren; zuvor diesen Abschnitt aktualisieren]
- KI-Ausgaben sind immer ein Vorschlag. Nichts wird als Tatsache über Sie gespeichert, bevor Sie oder eine zuständige Person es bestätigen.
- KI verifiziert niemals eine Fähigkeit, nimmt keine Kandidatin und keinen Kandidaten an oder lehnt sie bzw. ihn ab und kontaktiert niemanden.
- KI-Ausführungsprotokolle speichern einen kurzen Ausgabeauszug. Er wird nach 90 Tagen entfernt.

**Ihre Wahlmöglichkeiten.**
- Sie können die Sichtbarkeit jederzeit ausschalten. Sie sind dann bei neuen Suchen vom Arbeitgeber-Matching ausgenommen.
- Sie können gegen ein auf berechtigte Interessen gestütztes Profiling Widerspruch einlegen (§10) und verlangen, dass ein Mensch Ihnen ein Ranking erläutert.

[LAWYER: prüfen, ob der regelbasierte Matcher ein „KI-System“ im Sinne der KI-Verordnung (Verordnung (EU) 2024/1689, Art. 3 Nr. 1) ist. Falls ja, Anhang III Nummer 4 (Beschäftigung) prüfen. Vor Abschluss der Prüfung keine Einstufung öffentlich angeben.]

## 9. Wie lange wir Daten speichern

Derzeit werden Daten gespeichert, solange Ihr Konto besteht und die Funktion sie noch verwendet. Die nachstehenden Fristen sind **Vorschläge, die nicht genehmigt sind**. [OWNER DECISION: jede Frist genehmigen oder ändern — Paket A]

| Daten | Derzeit | Vorgeschlagene Frist |
|---|---|---|
| Konto, Profil, Living CV | bis zur Löschung des Kontos | unverändert |
| Arbeitstagebuch | bis zur Löschung des Kontos | [OWNER DECISION: löschen oder als losgelösten Nachweis aufbewahren. Derzeit löscht die Kontolöschung das Tagebuch] |
| Nachrichten | gespeichert | [OWNER DECISION: 36 Monate nach Abschluss des Gesprächs] |
| Buchungen und Einsätze | gespeichert | [OWNER DECISION: 6 Jahre nach Ende — Frist für Rechtsansprüche; LAWYER] |
| Freitext zum Abwesenheitsgrund | gespeichert | [OWNER DECISION: 12 Monate] |
| Benachrichtigungen | gespeichert | [OWNER DECISION: 12 Monate] |
| Analyseereignisse | gespeichert | [OWNER DECISION: 24 Monate oder Löschung auf Antrag] |
| Einwilligungs- und Offenlegungsnachweise | gespeichert, nicht änderbar | [OWNER DECISION: Bestehen des Kontos + 6 Jahre, nach der Löschung pseudonymisiert] |
| Datenschutzanträge | gespeichert | [OWNER DECISION: 3 Jahre nach Abschluss] |
| Abrechnung und Rechnungen | gespeichert | [LAWYER: gesetzliche Aufbewahrungsfrist für Buchführungsunterlagen; nach litauischem Recht werden üblicherweise 10 Jahre angenommen] |
| KI-Ausgabeauszüge | **nach 90 Tagen entfernt** (tägliche Ausführung) | unverändert |
| Von Organisationen bereitgestellte Aufzeichnungen | gespeichert | entscheidet die Organisation [OWNER DECISION: Standard für importierte Staging-Zeilen] |
| Entfernte öffentliche Stellenanzeigen | gespeichert, ausgeblendet | [OWNER DECISION: 12 Monate nach Entfernung] |
| Sicherungskopien (Backups) | vom Anbieter verwaltete Rotation | Zeitraum des Anbieters [OWNER: den tatsächlichen Zeitraum angeben] |

## 10. Ihre Rechte

Nach Art. 15–22 DSGVO haben Sie folgende Rechte:

- **Auskunftsrecht** (Art. 15): eine Kopie Ihrer Daten und Informationen darüber erhalten, wie wir sie verwenden.
- **Recht auf Berichtigung** (Art. 16): unrichtige Daten berichtigen lassen. Gespeicherte Tagebucheinträge können nicht umgeschrieben werden; Sie können eine Berichtigung hinzufügen. Von einer Organisation geführte Aufzeichnungen werden von dieser Organisation berichtigt; Sie können sie bestreiten, sobald Ihr Konto verknüpft ist.
- **Recht auf Löschung** (Art. 17): Ihre Daten löschen lassen, sofern wir nicht einen Teil davon aufbewahren müssen (zum Beispiel Buchführungsunterlagen oder Einwilligungsnachweise).
- **Recht auf Einschränkung der Verarbeitung** (Art. 18): verlangen, dass wir die Verwendung einschränken, während eine Frage geprüft wird.
- **Recht auf Datenübertragbarkeit** (Art. 20): die Daten, die Sie uns bereitgestellt haben, in einer maschinenlesbaren Datei erhalten.
- **Widerspruchsrecht** (Art. 21): Widerspruch gegen eine auf berechtigte Interessen gestützte Verarbeitung einlegen, einschließlich Profiling, Analyse und Matching durch Operatoren. Wir beenden die Verarbeitung dann, es sei denn, wir haben zwingende schutzwürdige Gründe.
- **Menschliche Überprüfung** (Art. 22): nicht einer ausschließlich auf einer automatisierten Verarbeitung beruhenden Entscheidung unterworfen zu werden, die Sie erheblich beeinträchtigt. Solche Entscheidungen treffen wir nicht (§8). Sie können dennoch verlangen, dass ein Mensch sich jedes automatisierte Ergebnis ansieht.
- **Widerruf der Einwilligung** (Art. 7 Abs. 3): jederzeit, in einem Schritt. Der Widerruf berührt nicht die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung. Daten, die ein Arbeitgeber bereits rechtmäßig erhalten hat, verbleiben bei diesem Arbeitgeber in dessen eigener Verantwortung.

## 11. Wie Sie Ihre Rechte ausüben

**In Ihrem Konto:** Öffnen Sie **Dashboard → Datenschutz** (`/dashboard/privacy`; in der mobilen App: Einstellungen → Datenschutz).
- **Ihre Daten herunterladen:** eine JSON-Datei mit Ihren Daten und eine CSV-Datei Ihres Arbeitstagebuchs. Dies erfolgt sofort.
- **Löschung beantragen:** einen Antrag auf Löschung des Kontos stellen. Die Löschung erfolgt **nicht sofort**. Ein Mensch prüft den Antrag und teilt Ihnen mit, was gelöscht wurde, was aufbewahrt wird und warum.
- **Einwilligungen:** jede einzeln ein- oder ausschalten.

**Per E-Mail:** Schreiben Sie an **info@labourmarket.ai**. Nutzen Sie diesen Weg für die vollständige Auskunft nach Art. 15, für Berichtigung, Einschränkung der Verarbeitung, Widerspruch oder alles, was die Kontoseite nicht abdeckt. [OWNER DECISION: Antragsarten für Berichtigung, Einschränkung und Widerspruch im Produkt hinzufügen]

**Kein Konto?** Siehe den „Hinweis für Personen ohne Konto“. [OWNER DECISION: Kanal]

**Identitätsprüfung.** In Ihrem Konto identifiziert Sie die Anmeldung. Per E-Mail können wir Sie bitten, von der Adresse Ihres Kontos aus zu schreiben oder Angaben zu machen, die nur die tatsächlich betroffene Person kennen kann. Wir fragen nur nach dem, was wir benötigen, um zu bestätigen, dass Sie es sind.

**Frist.** Wir antworten **innerhalb eines Monats** nach Eingang des Antrags. Bei komplexen oder zahlreichen Anträgen können wir diese Frist um bis zu zwei weitere Monate verlängern. In diesem Fall teilen wir Ihnen dies innerhalb des ersten Monats mit und nennen die Gründe (Art. 12 Abs. 3). Anträge sind unentgeltlich, sofern sie nicht offenkundig unbegründet oder exzessiv sind (Art. 12 Abs. 5).

## 12. Kinder und Jugendliche

[OWNER DECISION: Mindestalter für die Erstellung eines Kontos — 16 oder 18]

- Die Plattform dient Arbeit, Ausbildung und Lernen; daher können Lernende und Studierende sie nutzen.
- [LAWYER: Litauen legt das Alter für die Einwilligung in Online-Dienste nach Art. 8 DSGVO auf 14 Jahre fest — prüfen. Unterhalb dieses Alters ist für einwilligungsbasierte Zwecke die Einwilligung eines Elternteils erforderlich. Außerdem die litauischen Vorschriften zur Arbeit Minderjähriger prüfen.]
- [OWNER DECISION: ob Personen unter 18 Jahren die Sichtbarkeit für Arbeitgeber einschalten dürfen und ob eine Schule minderjährige Schülerinnen und Schüler bzw. Studierende hinzufügen darf]
- Derzeit gibt es bei der Registrierung keine Altersprüfung.

## 13. Sicherheit

Was wir tatsächlich tun:
- Zugriffsregeln liegen in der Datenbank selbst. Ohne eine Regel, die den Zugriff gewährt, sieht niemand die Daten. Diese Regeln sind durch automatisierte Tests abgedeckt.
- Dateien und Fotos liegen in einem privaten Speicher. Sie lassen sich nur über kurzlebige Links öffnen.
- Einwilligungs- und Offenlegungsnachweise können nur ergänzt werden (append-only). Niemand, auch kein Administrator, kann sie ändern.
- Administrationsansichten sind auf eine kleine Zahl von Administratoren beschränkt.
- Kein Administrator kann in Ihrem Namen eine Einwilligung erteilen.

Kein System ist vollkommen sicher. Kommt es bei uns zu einer Verletzung des Schutzes personenbezogener Daten, melden wir dies der Aufsichtsbehörde und benachrichtigen Sie, soweit das Gesetz es verlangt (Art. 33–34). Wenn Ihnen ein Problem auffällt, schreiben Sie an info@labourmarket.ai.

## 14. Beschwerden

Sie können sich bei einer Aufsichtsbehörde beschweren, insbesondere in dem EU-Mitgliedstaat, in dem Sie wohnen oder arbeiten oder in dem sich der Vorfall ereignet hat (Art. 77).

Unsere federführende Aufsichtsbehörde ist die **Staatliche Datenschutzinspektion Litauens** (Valstybinė duomenų apsaugos inspekcija, VDAI):
- L. Sapiegos g. 17, LT-10312 Vilnius;
- ada@ada.lt;
- vdai.lrv.lt.

[LAWYER: Anschrift und Kontaktdaten prüfen]

Wir würden gern die Gelegenheit erhalten, das Problem zunächst selbst zu beheben; bitte schreiben Sie daher auch uns. Sie sind dazu nicht verpflichtet.

## 15. Änderungen dieser Erklärung

- Version: **v2 (Entwurf), 2026-10-15**. Ersetzt die frühere Seite in einfacher Sprache.
- Wenn wir diese Erklärung ändern, aktualisieren wir hier Datum und Version.
- Betrifft eine Änderung das, worin Sie eingewilligt haben, informieren wir Sie im Produkt, bevor sie gilt. Einwilligungstexte sind versioniert: Ändert sich ein Einwilligungstext, fragen wir Sie erneut.
