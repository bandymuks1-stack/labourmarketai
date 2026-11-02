# Hinweis für Personen ohne Konto — LabourMarket.ai

*Informationen nach Artikel 14 DSGVO (Daten, die nicht bei Ihnen erhoben wurden)*

> **Status:** DRAFT v2 — 2026-10-15 (Entwurf)
> **Anwaltliche Prüfung erforderlich / Requires lawyer review.** Entwurf zur anwaltlichen Prüfung. Nicht endgültig, noch ohne Rechtswirkung, nicht zertifiziert.
> **Übersetzung des englischen Entwurfs; die rechtliche Richtigkeit dieser Übersetzung bedarf einer gesonderten Prüfung durch eine qualifizierte Rechtsanwältin bzw. einen qualifizierten Rechtsanwalt oder eine Fachübersetzerin bzw. einen Fachübersetzer.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Verwendete Faktenquellen:**
> - Audit 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §3.3 (43 Personen in Personallisten, 41 davon nicht mit einem Konto verknüpft; 2.944 Nachweisdatensätze; Staging-Zeilen mit `person_label` + `activity_text`; `source_fact` kann Namen und Anschriften von Personen enthalten; Kontoverknüpfung SET NULL; ohne Konto kein Weg zur Ausübung der Rechte)
> - `03-rights-consent-legal-pages.md` §0, §3 (alle 43 in einer Organisation; Datensätze lesbar für Manager der importierenden Organisation und der als Partei genannten Organisationen; kein Hinweis nach Art. 14; Inanspruchnahme nur über eine von einem Manager versandte Einladung; Bestreiten erst nach Verknüpfung; Datensätze nur ergänzbar (insert-only); schwedische Anzeigen: 41.353 Beschreibungen mit einer E-Mail-Adresse, 22.500 mit Formulierungen zu Kontaktpersonen; NAV: 3.809 mit telefonnummernähnlichen Zahlen; Anzeigentext wird angemeldeten Nutzern wörtlich angezeigt; entfernte Anzeigen werden aufbewahrt)
> - `02-processors-transfers-cookies-ai.md` §1 Zeile 15, D13 (NAV-`contactList` nie gespeichert; schwedische Beschreibung gespeichert); §1 Zeilen 9, 21 (Kontakte aus Unternehmensbedarfen; Einladungs-E-Mails)
> - `docs/legal/retention-decision-package-v1.md` Entscheidung 3b
>
> **Offene Entscheidungen:**
> 1. [OWNER DECISION: Kanal für Anträge von Personen ohne Konto — vorläufiger Vorschlag: info@labourmarket.ai; ein eigenes Webformular mit Identitätsprüfung erwägen]
> 2. [LAWYER: Rollenverteilung bei von Organisationen bereitgestellten Aufzeichnungen — die Organisation als Verantwortlicher und die Plattform als Auftragsverarbeiter, gemeinsam Verantwortliche (Art. 26) oder eigenständige Verantwortliche. Siehe `organisation-data-terms-v2` §2]
> 3. [LAWYER/OWNER: wer diesen Hinweis Personen in Personallisten von Organisationen erteilt und wann (Art. 14 Abs. 3: spätestens innerhalb eines Monats). Derzeit wird kein Hinweis erteilt]
> 4. [LAWYER: ob Art. 14 Abs. 5 lit. b (unverhältnismäßiger Aufwand) auf Kontaktpersonen in öffentlichen Stellenanzeigen anwendbar ist und welche Maßnahmen zur öffentlichen Bereitstellung der Informationen damit einhergehen müssen]
> 5. [OWNER DECISION: E-Mail-Adressen und Telefonnummern im Anzeigentext vor der Anzeige schwärzen oder beibehalten; Aufbewahrung entfernter Anzeigen (vorgeschlagen 12 Monate)]
> 6. [OWNER DECISION: Weg zur Löschung oder Schwärzung nur ergänzbarer (insert-only) Nachweisdatensätze von Organisationen]
> 7. [OWNER DECISION: Aufbewahrung von Import-Staging-Zeilen]

---

## 1. Warum Sie dies möglicherweise lesen

Die Plattform LabourMarket.ai kann Informationen über Sie enthalten, obwohl Sie sich nie registriert haben. Dies geschieht auf vier Wegen:

- **A.** Ein Unternehmen, eine Agentur oder eine Schule hat **Ihre Arbeitshistorie erfasst oder importiert**. Zum Beispiel hat ein früherer Arbeitgeber die Projekte eingetragen, an denen Sie gearbeitet haben.
- **B.** Sie sind als **Kontaktperson in einer öffentlichen Stellenanzeige** genannt, die von der schwedischen oder norwegischen öffentlichen Arbeitsverwaltung veröffentlicht wurde.
- **C.** Sie sind die **Kontaktperson in einer geschäftlichen Anfrage**, die ein Unternehmen an uns gesendet hat (zum Beispiel ein Personalbedarf).
- **D.** Jemand hat **Sie per E-Mail eingeladen**, beizutreten, und Sie sind noch nicht beigetreten.

Dieser Hinweis erklärt Ihnen, welche Daten wir haben, warum, und was Sie tun können.

## 2. Wer verantwortlich ist

**UAB „Nonstop Group“**
Unternehmenscode 302676973
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litauen
Datenschutzkontakt: **info@labourmarket.ai**. Es ist kein Datenschutzbeauftragter benannt.

In **Fall A** entscheidet die Organisation, die Ihre Historie erfasst hat, darüber, was sie über Sie erfasst, und sie ist für diese Aufzeichnungen verantwortlich. Für die eigene Tätigkeit der Plattform mit diesen Aufzeichnungen sind wir verantwortlich (zum Beispiel die Verknüpfung einer Aufzeichnung mit einem Konto, wenn Sie später beitreten). [LAWYER: Rollenverteilung bestätigen]

## 3. Welche Daten wir haben und woher sie stammen

| Fall | Daten | Herkunft |
|---|---|---|
| A — Arbeitshistorie | Ihr Name, wie die Organisation ihn erfasst hat, die Referenz der Organisation für Sie, Beschreibungen der Arbeit, Daten, Orte und Anschriften der Arbeit, Notizen, Bestätigungen der Organisation sowie Signale zu Fähigkeiten, die die Plattform aus diesen Aufzeichnungen ableitet | die Organisation (ihre Dateien oder Importe) |
| B — Stellenanzeigen | Name des Arbeitgebers, Organisationsnummer (die einen Einzelunternehmer identifizieren kann) und der Anzeigentext, der Name, E-Mail-Adresse und Telefonnummer einer Kontaktperson enthalten kann. Die gesonderte strukturierte Kontaktliste der Arbeitsverwaltung speichern wir nicht | Arbetsförmedlingen (Schweden) und NAV (Norwegen), öffentliche offene Daten |
| C — Anfragen | Firmenname, Ihr Name und Ihre Kontaktdaten, wie das Unternehmen sie eingegeben hat, Angaben zum Bedarf | das Unternehmen, das die Anfrage gesendet hat |
| D — Einladungen | Ihre E-Mail-Adresse, der von der einladenden Person eingegebene Name und deren Nachricht | die Person oder Organisation, die Sie eingeladen hat |

## 4. Wofür wir die Daten verwenden und auf welcher Rechtsgrundlage

| Fall | Zweck | Rechtsgrundlage |
|---|---|---|
| A | die Organisation führt und nutzt ihre eigenen Arbeitsaufzeichnungen. Die Plattform hostet sie, ermöglicht Ihnen, sie später zu übernehmen, und leitet Signale zu Fähigkeiten ab | die eigene Rechtsgrundlage der Organisation für ihre Aufzeichnungen. Für die Verknüpfung und die abgeleiteten Signale der Plattform: unser berechtigtes Interesse, Menschen eine nutzbare Aufzeichnung ihrer tatsächlichen Arbeit zu geben (Art. 6 Abs. 1 lit. f DSGVO) [LAWYER] |
| B | Arbeitsuchenden verfügbare Stellen anzeigen, damit sie sich bewerben können | berechtigtes Interesse (Art. 6 Abs. 1 lit. f): die Anzeige wurde veröffentlicht, damit Personen den Arbeitgeber kontaktieren [LAWYER] |
| C | die Anfrage beantworten und einen möglichen Vertrag vorbereiten | vorvertragliche Maßnahmen / berechtigtes Interesse (Art. 6 Abs. 1 lit. b, f) |
| D | die Einladung zustellen und Ihnen deren Annahme ermöglichen | berechtigtes Interesse der einladenden Person und Ihr Interesse, eingeladen zu werden (Art. 6 Abs. 1 lit. f) |

Wir fragen nicht nach besonderen Kategorien personenbezogener Daten (Art. 9) über Sie. Enthält eine Aufzeichnung versehentlich solche Daten, teilen Sie dies bitte uns oder der Organisation mit.

## 5. Wer die Daten sehen kann

- **Fall A:** Manager der Organisation, die die Daten erfasst hat, können sie sehen. Das gilt auch für Manager einer anderen Organisation, die in derselben Aufzeichnung als Partei genannt ist (zum Beispiel der Auftraggeber eines Projekts). Andere Nutzer können sie nicht sehen. Sie werden Arbeitgebern, die nach Kandidatinnen und Kandidaten suchen, **nicht** angezeigt.
- **Fall B:** Der Anzeigentext einschließlich darin enthaltener Kontaktdaten wird **angemeldeten Nutzern** der Plattform angezeigt. [OWNER DECISION: Schwärzung]
- **Fall C:** unser Team. Ist der Benachrichtigungskanal des Inhabers aktiviert, geht eine kurze Benachrichtigung über Telegram oder die Agentai-OS-Brücke an den Inhaber; sie enthält keine Daten von Arbeitskräften. [OWNER: bestätigen]
- **Fall D:** die einladende Person und unser Team.

Unsere Dienstleister hosten die Daten (Supabase, in der EU; Vercel; weitere in der Datenschutzerklärung, §6, aufgeführt). Die Datenschutzerklärung, §7, erläutert Übermittlungen außerhalb des EWR.

## 6. Wie lange wir die Daten speichern

- **A:** solange die Organisation die Aufzeichnung führt. [OWNER DECISION: Standardfrist; Import-Staging-Zeilen]
- **B:** solange die Anzeige aktiv ist. Entfernte Anzeigen werden ausgeblendet, derzeit aber aufbewahrt. [OWNER DECISION: vorgeschlagen 12 Monate nach Entfernung]
- **C:** [OWNER DECISION: vorgeschlagen 24 Monate nach Abschluss der Anfrage]
- **D:** [OWNER DECISION: bis zur Annahme, zum Widerruf oder zum Ablauf]

## 7. Ihre Rechte

Sie haben dieselben Rechte wie Kontoinhaber: Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und, soweit anwendbar, Datenübertragbarkeit (Art. 15–21 DSGVO). Die Datenschutzerklärung, §10, beschreibt sie.

**Widerspruch.** Wo wir uns auf berechtigte Interessen stützen (Art. 6 Abs. 1 lit. f), können Sie Widerspruch einlegen. Wir beenden die Verarbeitung dann, es sei denn, wir haben zwingende Gründe. Bei Kontaktdaten in Stellenanzeigen (Fall B) blenden wir Ihre Daten in unserer Kopie der Anzeige aus oder entfernen sie. [OWNER DECISION: die Maßnahme bestätigen]

**Fall A — von einer Organisation geführte Aufzeichnungen.**
- Sie können uns fragen, welche Organisation Ihre Historie erfasst hat. Wir leiten Ihr Anliegen an diese Organisation weiter oder geben Ihnen deren Kontaktdaten.
- Wir löschen die Signale zu Fähigkeiten und die Verknüpfungen, die die Plattform selbst abgeleitet hat.
- Über ihre eigenen Aufzeichnungen entscheidet die Organisation. Sie muss Ihnen im Rahmen ihrer eigenen Pflichten nach der DSGVO antworten.
- Aufzeichnungen können nur ergänzt werden (append-only); eine Berichtigung wird daher als neuer Eintrag hinzugefügt. [OWNER DECISION: Weg zur Löschung]

**Übernahme Ihrer Arbeitshistorie.** Wenn Sie die Historie in Ihrem eigenen Konto haben möchten, bitten Sie die Organisation, Ihnen eine Einladung zu senden. Derzeit kann eine Aufzeichnung ohne Einladung nicht übernommen werden; dies verhindert, dass Fremde nach den Aufzeichnungen anderer Personen suchen. Sobald Ihr Konto verknüpft ist, können Sie die Aufzeichnung einsehen und bestreiten.

## 8. Wie Sie uns erreichen

[OWNER DECISION: Kanal] Schreiben Sie an **info@labourmarket.ai** mit dem Betreff „Anfrage — kein Konto“. Teilen Sie uns mit:
- welcher Fall zutrifft (A, B, C oder D);
- Ihren Namen, wie er in der Aufzeichnung erscheinen könnte;
- bei Fall A die Organisation, falls Sie sie kennen;
- bei Fall B einen Link zur Anzeige oder den Namen des Arbeitgebers.

**Identitätsprüfung.** Da Sie kein Konto haben, müssen wir bestätigen, dass Sie die betroffene Person sind, bevor wir etwas herausgeben oder ändern. Wir fragen nur nach dem Erforderlichen, zum Beispiel nach einer Antwort von der in der Aufzeichnung angegebenen E-Mail-Adresse oder nach Angaben, die nur Sie kennen können. Eine Kopie eines Ausweisdokuments verlangen wir nur, wenn es keinen anderen Weg gibt. [LAWYER: bestätigen]

**Frist.** Wir antworten innerhalb **eines Monats**. Bei komplexen Anträgen können wir diese Frist um zwei weitere Monate verlängern; in diesem Fall teilen wir Ihnen dies innerhalb des ersten Monats mit (Art. 12 Abs. 3). Anträge sind unentgeltlich.

## 9. Beschwerden

Sie können sich bei einer Aufsichtsbehörde in dem EU-Mitgliedstaat beschweren, in dem Sie wohnen oder arbeiten. Unsere federführende Aufsichtsbehörde ist die Staatliche Datenschutzinspektion Litauens (Valstybinė duomenų apsaugos inspekcija, VDAI): L. Sapiegos g. 17, LT-10312 Vilnius, ada@ada.lt, vdai.lrv.lt. [LAWYER: prüfen]

## 10. Version

v2 (Entwurf), 2026-10-15. Dieser Hinweis ist veröffentlicht unter [OWNER DECISION: öffentliche URL, z. B. /legal/no-account-notice]. Er ist in der Datenschutzerklärung verlinkt.
