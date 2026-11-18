# Datenbedingungen für Organisationen — LabourMarket.ai

*Für Unternehmen, Agenturen, Schulen und andere Organisationen, die auf der Plattform Daten über Personen erfassen, hochladen oder verwalten. Enthält Bedingungen zur Auftragsverarbeitung nach Art. 28 DSGVO.*

> **Status:** DRAFT v2 — 2026-10-15 (Entwurf)
> **Anwaltliche Prüfung erforderlich / Requires lawyer review.** Entwurf zur anwaltlichen Prüfung. Nicht endgültig, noch ohne Rechtswirkung, nicht zertifiziert.
> **Übersetzung des englischen Entwurfs; die rechtliche Richtigkeit dieser Übersetzung bedarf einer gesonderten Prüfung durch eine qualifizierte Rechtsanwältin bzw. einen qualifizierten Rechtsanwalt oder eine Fachübersetzerin bzw. einen Fachübersetzer.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Verwendete Faktenquellen:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §2 (Behandlungen REASSIGN / RETAIN für Aufzeichnungen von Organisationen), §3.2 (nur ergänzbare und hash-verkettete Tabellen), §3.3 (Arbeitsauffassung: die bereitstellende Organisation ist Verantwortlicher ihrer Aufzeichnungen, die Plattform Auftragsverarbeiter für diese Kopie und Verantwortlicher für das von ihr hinzugefügte Matching und die Verknüpfung; Nachweis `organization_person_id` NO ACTION; Staging-Zeilen bleiben bestehen)
> - `03-rights-consent-legal-pages.md` §3, §4, §7 (keine Festlegung des Verantwortlichen, kein AVV, keine Bestätigung beim Import; lesbar für importierende und als Partei genannte Organisationen; nur ergänzende Berichtigungen, eine je Datensatz; Bestreiten durch die betroffene Person nach Verknüpfung; Doppelrolle von Nonstop Group)
> - `02-processors-transfers-cookies-ai.md` §1 Zeile 14 und D4 (von Arbeitgebern angebundene MCP-Assistenten erhalten Daten von Arbeitskräften); §4 (Auto-Match, Ranking, `apply_learning_auto_confirmation`)
> - `docs/legal/legal-basis-matrix-v1.md` (beziehungsbasierte Sichtbarkeit); `entity-role-and-data-access-matrix-v1.md`; `subprocessor-register-v2.md`
>
> **Offene Entscheidungen:**
> 1. [OPEN DECISION / LAWYER: Rolle je Tätigkeit — Tabelle §2. Die Fakten klären dies nicht]
> 2. [OWNER DECISION: einen Bestätigungsschritt beim Import (Rechtsgrundlage + Hinweis nach Art. 14 bestätigt) einführen, bevor eine Organisation Daten von Personen importieren kann. Derzeit gibt es keinen]
> 3. [OWNER DECISION: Weg zur Löschung und Schwärzung nur ergänzbarer, hash-verketteter Nachweisdatensätze; Reihenfolge der Löschung (Nachweise vor der Person in der Personalliste)]
> 4. [OWNER DECISION: Ankündigungsfrist bei Änderungen von Unterauftragsverarbeitern (§7.6)]
> 5. [OWNER DECISION: Frist für die Meldung von Datenschutzverletzungen an Organisationen (§7.8)]
> 6. [OWNER DECISION: Exportformat und Löschfrist bei Vertragsende (§7.10)]
> 7. [OWNER DECISION: Frist, innerhalb derer Organisationen auf ein Bestreiten oder einen weitergeleiteten Antrag antworten müssen]
> 8. [LAWYER: Haftung und Freistellung (§9)]
> 9. [OWNER/LAWYER: ob Organisationen externe KI-Assistenten mit Zugriff auf Abwesenheits- und Tagebuchinhalte von Arbeitskräften anbinden dürfen oder ob diese Werkzeuge eingeschränkt werden (Audit D4)]
> 10. [OWNER/LAWYER: wie diese Bedingungen angenommen werden (Click-through bei Erstellung der Organisation oder beim Import, oder unterzeichneter AVV) — derzeit wird nichts erfasst]
> 11. [OWNER/LAWYER: Rechtsgrundlage nach Art. 9 Abs. 2 lit. b und Datenminimierung für von Arbeitgebern gespeicherte Freitexte zum Abwesenheitsgrund]

---

## 1. Für wen diese Bedingungen gelten

- Diese Bedingungen gelten für jede Organisation (Unternehmen, Personalagentur, Schule oder sonstige Stelle), die die Plattform LabourMarket.ai nutzt, um:
  - Daten über Personen zu erfassen, zu importieren oder hochzuladen: Personal, ehemaliges Personal, Arbeitskräfte, Kandidatinnen und Kandidaten, Lernende, Kontaktpersonen von Kunden;
  - die Arbeit von Personen über Projekte, Personallisten, Buchungen, Stundenzettel, Abwesenheiten, Prüfungen von Tagebucheinträgen und Bestätigungen zu verwalten.
- Die Plattform wird von der **UAB „Nonstop Group“** (Unternehmenscode 302676973, Litauen) betrieben, hier „wir“ genannt. Die Organisation wird „Sie“ genannt.
- Diese Bedingungen ergänzen die Nutzungsbedingungen und die Datenschutzerklärung. Widersprechen sie sich in Bezug auf personenbezogene Daten, gehen für die Tätigkeit von Organisationen diese Bedingungen vor.

## 2. Wer wofür verantwortlich ist

Die Tabelle zeigt unsere Arbeitsauffassung. **Wo OPEN DECISION steht, ist die Rolle noch nicht geklärt.** [LAWYER: jede Zeile bestätigen. Gemeinsame Verantwortlichkeit nach Art. 26 erwägen, wo beide Parteien über die Zwecke entscheiden.]

| Tätigkeit | Ihre Rolle | Unsere Rolle | Stand |
|---|---|---|---|
| Ihre eigenen Aufzeichnungen über Personen: Personallisten, importierte Arbeitshistorie, Nachweisdatensätze, Projekt- und Arbeitsaufzeichnungen, von Ihnen hochgeladene Dokumente | **Verantwortlicher** | **Auftragsverarbeiter** (wir hosten und verarbeiten sie nach Ihren Weisungen, §7) | OPEN DECISION — Arbeitsauffassung in Audit 01 §3.3 |
| Arbeitszeit-, Stundenzettel-, Abwesenheits- und Arbeitsplanaufzeichnungen Ihres Personals | **Verantwortlicher** (Arbeitgeberpflichten) | **Auftragsverarbeiter** | OPEN DECISION |
| Prüfung und Bestätigung der Tagebucheinträge einer Arbeitskraft; Bestätigungsregeln, die Fähigkeiten automatisch bestätigen | **Verantwortlicher** für Ihre Bestätigung | **Verantwortlicher** für das eigene Tagebuch der Arbeitskraft | OPEN DECISION — die Aufzeichnung betrifft zwei Personen |
| Verknüpfung einer Person aus der Personalliste mit einem Plattformkonto; Ableitung von Signalen zu Fähigkeiten aus Ihren Aufzeichnungen | — | **Verantwortlicher** (unser eigener Zweck) | OPEN DECISION: oder gemeinsam (Art. 26) |
| Matching und Ranking von Arbeitskräften für Ihre veröffentlichten Bedarfe | **Verantwortlicher** für Ihre Auswahlentscheidungen | **Verantwortlicher** für den Matching-Dienst | OPEN DECISION: oder gemeinsam (Art. 26) |
| Daten, die eine Arbeitskraft Ihnen mit Einwilligung offenlegt (Kontaktdaten, Lebenslauf) | **Eigenständiger Verantwortlicher** ab Erhalt | **Verantwortlicher** bis zur Übermittlung | Arbeitsauffassung in `legal-basis-matrix-v1.md` |
| Anbindung Ihres eigenen KI-Assistenten (ChatGPT, Claude) an die Plattform | **Verantwortlicher**: Sie entscheiden, Daten an diesen Anbieter zu senden | wir stellen den Zugang im Rahmen der Berechtigungen Ihrer Nutzer bereit | OPEN DECISION — Audit D4 |
| Abrechnung Ihres Plans | Kunde | **Verantwortlicher** | geklärt |

Innerhalb der UAB „Nonstop Group“ ist das Personaldienstleistungsgeschäft vom Plattformbetrieb getrennt. Es erhält Plattformdaten nur, wenn eine Arbeitskraft dies wünscht (Datenschutzerklärung, Zweck 7).

## 3. Ihre Pflichten als Verantwortlicher

Wenn Sie Daten über Personen erfassen oder hochladen, müssen Sie Folgendes tun.

1. **Eine Rechtsgrundlage haben** (Art. 6 DSGVO) für jede Aufzeichnung. Sind Daten besonderer Kategorien betroffen (zum Beispiel Gesundheitsangaben in einem Abwesenheitsgrund), benötigen Sie zusätzlich eine Bedingung nach Art. 9, etwa das Arbeitsrecht nach Art. 9 Abs. 2 lit. b. [LAWYER]
2. **Die Personen informieren** (Art. 13 und 14). Teilen Sie ihnen spätestens innerhalb eines Monats (Art. 14 Abs. 3) mit, dass ihre Daten auf der Plattform sind, warum, und wie sie ihre Rechte ausüben können.
   - Für den Teil der Plattform können Sie auf unseren **„Hinweis für Personen ohne Konto“** verweisen.
   - Dieser Hinweis ersetzt nicht Ihren eigenen Hinweis. [OWNER DECISION: ob wir eine fertige Vorlage bereitstellen]
3. **Datenminimierung** (Art. 5 Abs. 1 lit. c):
   - Erfassen Sie nur, was der Zweck erfordert.
   - Laden Sie keine Ausweisdokumente, Gesundheitsangaben, nationalen Identifikationsnummern oder Bankdaten hoch, es sei denn, eine Funktion erfordert es und Sie haben eine Rechtsgrundlage.
   - Halten Sie Abwesenheitsgründe kurz und sachlich.
4. **Richtigkeit** (Art. 5 Abs. 1 lit. d). Sie sind für die Richtigkeit dessen verantwortlich, was Sie erfassen und importieren. Berichtigen Sie Fehler zügig (§5).
5. **Nur befugte Nutzer.** Nur Personen, die Sie befugt haben, dürfen für Sie handeln. Sie sind für das verantwortlich, was diese in Ihrem Namen tun, einschließlich Importen und Bestätigungen.
6. **In Aufzeichnungen genannte Parteien.** Wenn Sie eine andere Organisation in einer Aufzeichnung als Partei nennen (zum Beispiel einen Projektauftraggeber), können deren Manager diese Aufzeichnung lesen. Nennen Sie eine Partei nur, wenn Sie berechtigt sind, die Aufzeichnung mit ihr zu teilen.
7. **Minderjährige.** Erfassen Sie keine Daten über Kinder, es sei denn, Sie haben eine Rechtsgrundlage und die gegebenenfalls erforderliche Beteiligung der Eltern. [OWNER DECISION: Regeln für Schulen, die minderjährige Schülerinnen und Schüler bzw. Studierende hinzufügen]
8. **KI-Assistenten.** Wenn Sie einen externen KI-Assistenten anbinden, entscheiden Sie, Daten an diesen Anbieter zu senden. Sie müssen eine Rechtsgrundlage und einen Vertrag mit diesem Anbieter haben. Verwenden Sie ihn nicht zur Verarbeitung von Abwesenheitsgründen oder anderen sensiblen Inhalten, es sei denn, Sie sind dazu berechtigt. [OWNER/LAWYER: Werkzeuge einschränken]
9. **Keine sachfremden Zwecke.** Verwenden Sie Daten von der Plattform nicht für sachfremde Zwecke und exportieren Sie sie nicht ohne Rechtsgrundlage in großem Umfang in andere Systeme.

## 4. Wer Ihre Aufzeichnungen auf der Plattform sehen kann

- Die Manager Ihrer Organisation.
- Manager von Organisationen, die Sie in einer Aufzeichnung als Partei nennen.
- Unsere befugten Operator-Mitarbeitenden, nur soweit es für Betrieb, Support und Sicherheit des Dienstes erforderlich ist.

Ihre Aufzeichnungen werden anderen Arbeitgebern, die nach Kandidatinnen und Kandidaten suchen, **nicht** angezeigt. Eine von Ihnen erfasste Person sieht die Aufzeichnung erst, nachdem ihr Konto über eine von Ihnen gesendete Einladung verknüpft wurde.

## 5. Richtigkeit, Berichtigungen und Bestreiten

- Aufzeichnungen können **nur ergänzt werden (append-only)**: Sie lassen sich nicht an Ort und Stelle bearbeiten. Um eine Aufzeichnung zu berichtigen, fügen Sie eine Berichtigung hinzu. Jede Aufzeichnung kann eine Berichtigung haben. So bleibt die Historie wahrheitsgetreu.
- Eine Person, deren Konto mit Ihrer Aufzeichnung verknüpft ist, kann diese **bestreiten** und das Bestreiten zurücknehmen.
- Geht ein Bestreiten ein, prüfen Sie es und antworten Sie der Person. [OWNER DECISION: Frist]
- Wir können eine Aufzeichnung als bestritten kennzeichnen. Wir entscheiden nicht, wer im Recht ist, es sei denn, das Gesetz verlangt es.
- [OWNER DECISION: Löschung oder Schwärzung nur ergänzbarer Aufzeichnungen. Derzeit kann eine Person nicht aus der Personalliste entfernt werden, solange Nachweisdatensätze bestehen, und Nachweisdatensätze können im Produkt nicht gelöscht werden.]

## 6. Anträge der betroffenen Personen

- Fragt eine Person **Sie** nach Daten auf der Plattform, antworten Sie ihr. Wir unterstützen Sie wie in §7.7 beschrieben.
- Fragt eine Person **uns** nach Ihren Aufzeichnungen, teilen wir ihr mit, dass Sie der Verantwortliche sind, und leiten den Antrag an Sie weiter, sofern das Gesetz nichts anderes verlangt. Sie antworten dann innerhalb der nach der DSGVO zulässigen Frist (Art. 12 Abs. 3: ein Monat, verlängerbar).
- Zu den eigenen Daten der Plattform (Verknüpfungen, abgeleitete Signale, Matching) antworten wir der Person selbst.

## 7. Bedingungen zur Auftragsverarbeitung (Art. 28 DSGVO)

Dieser Abschnitt gilt, soweit wir als **Ihr Auftragsverarbeiter** handeln (siehe §2).

1. **Gegenstand und Dauer.** Hosting und Verarbeitung Ihrer Aufzeichnungen auf der Plattform, solange Sie die Plattform nutzen, und bis zur Löschung nach §7.10.
2. **Art und Zweck.** Speicherung, Anzeige für Ihre befugten Nutzer und die von Ihnen genannten Parteien, Suche, Export, Verarbeitung von Importen und die von Ihnen genutzten Funktionen.
3. **Arten von Daten.** Namen und Referenzen; Arbeitsbeschreibungen, Daten, Orte und Anschriften; Arbeitszeit-, Stundenzettel- und Abwesenheitsaufzeichnungen; Bestätigungen; von Ihnen hochgeladene Dokumente und Fotos; Notizen.
4. **Betroffene Personen.** Ihr Personal, ehemaliges Personal, Arbeitskräfte, Kandidatinnen und Kandidaten, Lernende und Kontaktpersonen Ihrer Kunden.
5. **Weisungen.** Wir verarbeiten die Daten nur auf Ihre dokumentierte Weisung. Ihre Nutzung der Funktionen und Einstellungen der Plattform gilt als Ihre Weisung. Wir verarbeiten die Daten nicht für eigene Zwecke, ausgenommen die Tätigkeiten als Verantwortlicher nach §2 oder soweit das Unionsrecht oder das Recht eines Mitgliedstaats dies verlangt; verlangt das Gesetz dies, teilen wir es Ihnen vorher mit, sofern das Gesetz dies nicht verbietet (Art. 28 Abs. 3 lit. a).
6. **Unterauftragsverarbeiter.** Sie erteilen eine allgemeine Genehmigung für die Unterauftragsverarbeiter, die mit Ihren Aufzeichnungen in Berührung kommen:
   - Supabase (Datenbank und Dateispeicherung, EU);
   - Vercel (Hosting und Serverfunktionen);
   - GitHub (automatisierte Jobs mit technischem Zugriff auf Produktionsdaten).

   Die vollständige Anbieterliste befindet sich in der Datenschutzerklärung, §6. [LAWYER/OWNER: bestätigen, ob Hostinger (Korrespondenz zu Anträgen) auf diese Liste gehört]

   Wir informieren Sie [OWNER DECISION: z. B. 30 Tage], bevor wir einen Unterauftragsverarbeiter hinzufügen oder ersetzen. Sie können aus berechtigten datenschutzrechtlichen Gründen Einspruch erheben. Wir verpflichten jeden Unterauftragsverarbeiter auf Datenschutzpflichten, die diesen gleichwertig sind (Art. 28 Abs. 2 und 4). [LAWYER/OWNER: AVV mit den einzelnen Unterauftragsverarbeitern sind noch nicht belegt]
7. **Unterstützung.** Unter Berücksichtigung dessen, was unsere Systeme ermöglichen, unterstützen wir Sie dabei:
   - Anträge betroffener Personen zu beantworten (Art. 15–22);
   - Ihre Pflichten in Bezug auf Sicherheit, Meldung von Datenschutzverletzungen, Datenschutz-Folgenabschätzung und vorherige Konsultation zu erfüllen (Art. 32–36).
8. **Verletzungen des Schutzes personenbezogener Daten.** Wir informieren Sie über eine Verletzung, die Ihre Aufzeichnungen betrifft, unverzüglich, nachdem sie uns bekannt geworden ist [OWNER DECISION: z. B. innerhalb von 48 Stunden]. Wir fügen die uns vorliegenden Informationen bei, die Sie nach Art. 33 Abs. 3 benötigen.
9. **Vertraulichkeit und Sicherheit.** Personen mit Zugriff auf die Daten sind zur Vertraulichkeit verpflichtet. Unsere Sicherheitsmaßnahmen (Art. 32):
   - in der Datenbank selbst durchgesetzte und durch automatisierte Tests abgedeckte Zugriffsregeln;
   - privater Dateispeicher mit kurzlebigen Links;
   - nur ergänzbare (append-only) Audit- und Einwilligungsaufzeichnungen;
   - Administratorzugriff beschränkt auf eine kleine Zahl von Personen.

   [OWNER/LAWYER: eine förmliche Beschreibung der technischen und organisatorischen Maßnahmen steht noch aus]
10. **Vertragsende.** Wenn Sie die Nutzung der Plattform beenden, können Sie Ihre Aufzeichnungen exportieren. Danach löschen wir sie, sofern nicht das Unionsrecht oder das Recht eines Mitgliedstaats uns zur Aufbewahrung verpflichtet. [OWNER DECISION: Exportformat und Löschfrist. Die technische Einschränkung in §5 beachten]
11. **Übermittlungen.** Die Daten werden in der EU gehostet. Verarbeitet ein Unterauftragsverarbeiter Daten außerhalb des EWR, muss ein Übermittlungsinstrument nach Art. 44–49 greifen. [LAWYER/OWNER: je Anbieter bestätigen — noch keines belegt]
12. **Informationen und Überprüfungen.** Wir stellen Ihnen die Informationen zur Verfügung, die zum Nachweis der Einhaltung dieses Abschnitts erforderlich sind. Wir ermöglichen angemessene Überprüfungen (Audits) durch Sie oder Ihren Prüfer und tragen dazu bei, mit angemessener Vorankündigung und unter Wahrung der Vertraulichkeit (Art. 28 Abs. 3 lit. h).
13. **Verzeichnis.** Wir führen als Auftragsverarbeiter ein Verzeichnis von Verarbeitungstätigkeiten (Art. 30 Abs. 2).

## 8. Wo wir Verantwortlicher sind

Für die in §2 als unsere gekennzeichneten Tätigkeiten sind wir nach unserer Datenschutzerklärung Verantwortlicher. Soweit diese Tätigkeiten auf Ihren Aufzeichnungen beruhen (zum Beispiel Verknüpfung oder Matching), bestätigen Sie, dass Sie uns die Aufzeichnungen für diese Zwecke bereitstellen dürfen. [LAWYER]

## 9. Haftung

[LAWYER: Verteilung der Haftung zwischen der Organisation und der UAB „Nonstop Group“ nach Art. 82 DSGVO; Freistellung bei rechtswidrigen Uploads; Höchstbeträge im Einklang mit den Nutzungsbedingungen]

## 10. Änderungen, Annahme und anwendbares Recht

- [OWNER/LAWYER: wie diese Bedingungen angenommen und erfasst werden]
- Wir informieren Sie, bevor wesentliche Änderungen gelten. [OWNER DECISION: Ankündigungsfrist]
- Es gilt litauisches Recht; die Nutzungsbedingungen bestimmen, wo Streitigkeiten ausgetragen werden.
- Version **v2 (Entwurf), 2026-10-15**.

## 11. Kontakt

info@labourmarket.ai — UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litauen. Es ist kein Datenschutzbeauftragter benannt.
