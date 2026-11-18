# Cookie- und Speicherrichtlinie — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (Entwurf)
> **Anwaltliche Prüfung erforderlich / Requires lawyer review.** Entwurf zur anwaltlichen Prüfung. Nicht endgültig, noch ohne Rechtswirkung, nicht zertifiziert.
> **Übersetzung des englischen Entwurfs; die rechtliche Richtigkeit dieser Übersetzung bedarf einer gesonderten Prüfung durch eine qualifizierte Rechtsanwältin bzw. einen qualifizierten Rechtsanwalt oder eine Fachübersetzerin bzw. einen Fachübersetzer.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Verwendete Faktenquellen:**
> - Audit 2026-10-15 `02-processors-transfers-cookies-ai.md` §2.1-2.5 (jedes Cookie und jeder Speicherschlüssel mit Fundstelle im Code) sowie D5, D12; `03-rights-consent-legal-pages.md` §2, L3, L4
> - Am 2026-10-15 im Code geprüfte Laufzeiten: `lm_active_workspace` 180 Tage (`apps/web/lib/company/organization-actions.ts:54`); `lm_hide_admin_ui` 365 Tage (`apps/web/lib/auth/admin-ui-actions.ts:20`)
> - Derzeitige Seite: `apps/web/messages/en.json` → `legal.cookies`
>
> **Offene Entscheidungen:**
> 1. [OWNER DECISION: ein Einwilligungsbanner einführen, bevor die Analytics-Elemente in §4 gespeichert werden, ODER Telemetrie auf das unbedingt Erforderliche / ausschließlich aggregierte Daten beschränken und `lm.attr.first`, `lm.funnel.*` und `lm.pilot.session` entfernen. **Derzeit werden diese Elemente ohne Einwilligung gespeichert, und es gibt kein Banner.** Diese Richtlinie darf in der vorliegenden Fassung erst veröffentlicht werden, wenn eine der beiden Optionen umgesetzt ist.]
> 2. [LAWYER: ob nach litauischem Recht eine Ausnahme für Analytics greift. Standardlesart: keine für profilbezogene Analytics]
> 3. [LAWYER: Einstufung der „funktionalen“ Elemente in §3, die der Nutzer nicht ausdrücklich angefordert hat (Nutzungszähler, kürzlich angesehene Jobs)]
> 4. [OWNER: die Laufzeit des Anmelde-Cookies bestätigen — Standardwert der Bibliothek, nicht in unserem Code festgelegt]
> 5. [OWNER: bestätigen, ob für Zahlungen von Stripe gehostete Checkout-Seiten verwendet werden, und dies in §5 angeben]
> 6. [LAWYER: die Artikelangabe zum litauischen Gesetz über elektronische Kommunikation (Art. 61 Abs. 3, im Audit zitiert) anhand der geltenden Fassung prüfen]

---

## 1. Worauf sich diese Richtlinie bezieht

Die Plattform speichert kleine Elemente in Ihrem Browser:
- **Cookies**;
- **lokaler Speicher (Local Storage)**, der bestehen bleibt, bis Sie ihn löschen;
- **Sitzungsspeicher (Session Storage)**, der gelöscht wird, wenn Sie den Tab schließen.

Bei einigen Funktionen nimmt Ihr Browser außerdem direkt Kontakt zu anderen Diensten auf (§5).

Das Speichern oder Auslesen von Informationen auf Ihrem Endgerät erfordert Ihre **Einwilligung**, es sei denn, es ist für einen von Ihnen angeforderten Dienst **unbedingt erforderlich**. Diese Regel ergibt sich aus Art. 5 Abs. 3 der ePrivacy-Richtlinie 2002/58/EG, in Litauen umgesetzt durch das Gesetz über elektronische Kommunikation (Art. 61). [LAWYER: Artikel prüfen]

Wir verwenden keine Werbe-Cookies von Drittanbietern. Wir nutzen keinen Analysedienst von Drittanbietern und keine Sitzungsaufzeichnung. Wir **haben** jedoch eine eigene (First-Party-)Produktanalyse, die in §4 beschrieben ist.

## 2. Unbedingt erforderliche Elemente

Für diese Elemente ist keine Einwilligung erforderlich. Ohne sie kann der von Ihnen angeforderte Dienst nicht funktionieren.

| Name | Art | Laufzeit | Zweck |
|---|---|---|---|
| `sb-<project>-auth-token` (kann in `.0`, `.1`, … aufgeteilt sein) | Cookie | solange Sie angemeldet bleiben; wird automatisch erneuert [OWNER: maximale Laufzeit prüfen] | hält Sie angemeldet |
| `sb-<project>-auth-token-code-verifier` | Cookie | kurz, nur für den Anmeldeschritt | sichert die Anmeldung mit Google ab (PKCE) |
| `lm_active_workspace` | Cookie (für Skripte der Seite nicht lesbar) | 180 Tage | merkt sich, in welchem Arbeitsbereich (persönlich oder Organisation) Sie arbeiten |
| `lmai:command-finder-speech-consent:v1` | lokaler Speicher | bis Sie ihn löschen | hält fest, dass Sie den Hinweis zur Sprachdiktierfunktion akzeptiert haben |
| `lm.oauth.trace` | Sitzungsspeicher | bis der Tab geschlossen wird | eine zufällige ID, mit der wir eine fehlgeschlagene Anmeldung nachverfolgen können |
| `lm-chunk-reload` | Sitzungsspeicher | bis der Tab geschlossen wird | verhindert, dass die Seite nach einem Update in einer Schleife neu lädt |

## 3. Präferenz- und Funktionselemente

Diese Elemente merken sich Entscheidungen, die Sie getroffen haben, oder bewahren Ihre Arbeit, während Sie eine Funktion nutzen.

| Name | Art | Laufzeit | Zweck |
|---|---|---|---|
| `NEXT_LOCALE` | Cookie | 1 Jahr | Ihre Sprache |
| `lm_tz` | Cookie | 1 Jahr | Ihre Zeitzone, damit Tage und Uhrzeiten richtig angezeigt werden |
| `lm_hide_admin_ui` | Cookie | 1 Jahr | nur für Administratoren: ob Administrationselemente ausgeblendet sind. Ändert keine Berechtigungen |
| `theme` | lokaler Speicher | bis Sie ihn löschen | helles oder dunkles Design |
| `lm.communication.writeLanguage` | lokaler Speicher | bis Sie ihn löschen | die Sprache, in der Sie Nachrichten schreiben |
| `lmai:voice-speech-language` | lokaler Speicher | bis Sie ihn löschen | Diktiersprache |
| `lm.search-location.v1` | lokaler Speicher | bis Sie ihn löschen | der von Ihnen gewählte Suchort. Er kann genau sein und verbleibt auf Ihrem Endgerät |
| `lm.opportunities.recentlyViewed.v1` | lokaler Speicher | bis Sie ihn löschen | kürzlich von Ihnen angesehene Jobs [LAWYER: Einstufung] |
| `lm.commandFinder.recentCommandIds` | lokaler Speicher | bis Sie ihn löschen | Ihre zuletzt verwendeten Befehle |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | lokaler Speicher | bis Sie ihn löschen | wie oft Sie Funktionen nutzen, um Abkürzungen vorzuschlagen. Verbleibt auf Ihrem Endgerät [LAWYER: Einstufung] |
| `lm.professionRecoveryPrompt.v1.dismissed` | lokaler Speicher | bis Sie ihn löschen | Sie haben diesen Hinweis geschlossen |
| `lm.work-card-checks.kept` | lokaler Speicher | bis Sie ihn löschen | Prüfungen, die Sie behalten wollten |
| `lm.employerVisibilityAsk.v1` | lokaler Speicher | bis Sie ihn löschen | Ihre Antwort auf die Abfrage zur Sichtbarkeit für Arbeitgeber. Die Einwilligung selbst wird auf unserem Server erfasst |
| `lm.chat.continueAfterSwitch` | Sitzungsspeicher | bis der Tab geschlossen wird | bis zu 500 Zeichen eines von Ihnen eingegebenen Satzes, damit er nach einem Wechsel des Arbeitsbereichs fortgesetzt werden kann |
| `lmai:voice-transcript-draft` | Sitzungsspeicher | bis der Tab geschlossen wird | der Entwurfstext Ihres Diktats |

## 4. Analytics-Elemente — Einwilligung erforderlich

Wir messen, wie das Produkt genutzt wird: welche Seiten und Schritte Personen erreichen, Schritte der Registrierung, tägliche Aktivität und welche Kampagne eine Besucherin oder einen Besucher hergeführt hat. Die Ereignisse werden auf unseren eigenen Servern gespeichert und, wenn Sie angemeldet sind, mit Ihrem Konto verknüpft.

[OWNER DECISION: Banner oder Wegfall] **Diese Elemente werden erst gesetzt, nachdem Sie eingewilligt haben.** Sie können Ihre Entscheidung jederzeit ändern unter [OWNER DECISION: wo die Entscheidung geändert wird, z. B. Link „Cookie-Einstellungen“ in der Fußzeile].

| Name | Art | Laufzeit | Zweck |
|---|---|---|---|
| `lm.attr.first` | lokaler Speicher | bis Sie ihn löschen | Kampagnendaten des ersten Besuchs (`utm_*`-Tags, verweisende Website, Einstiegsseite). Bei der Registrierung werden sie in Ihren Kontodatensatz übernommen |
| `lm.funnel.last_seen_day` | lokaler Speicher | bis Sie ihn löschen | der letzte Tag, an dem Sie aktiv waren, um täglich aktive Nutzer zu zählen |
| `lm.funnel.signup_pending` | lokaler Speicher | bis Sie ihn löschen | markiert, dass eine Registrierung im Gange ist |
| `lm.pilot.session` | Sitzungsspeicher | bis der Tab geschlossen wird | eine zufällige Sitzungs-ID, die mit jedem Analyseereignis gesendet wird |
| `lm.funnel.*` (zum Beispiel `landing_fired`, `login_succeeded`) | Sitzungsspeicher | bis der Tab geschlossen wird | verhindert, dass dasselbe Analyseereignis doppelt gezählt wird |

Wenn Sie nicht einwilligen, funktioniert das Produkt genauso.

Die Analyse selbst stützt sich auf unser berechtigtes Interesse an der Verbesserung des Produkts (Art. 6 Abs. 1 lit. f DSGVO). Sie können ihr widersprechen (siehe Datenschutzerklärung, §10).

## 5. Dienste, die Ihr Browser direkt kontaktiert

- **OpenStreetMap-Kartenkacheln** (`tile.openstreetmap.org`). Die Marktkarte lädt ihre Kartenteile von den Servern der OpenStreetMap Foundation. Ihr Browser übermittelt Ihre IP-Adresse, Browserangaben und den angezeigten Kartenausschnitt. Es ist kein Cookie von uns beteiligt. Es gilt die eigene Datenschutzerklärung der OpenStreetMap Foundation.
- **Sprachdiktat.** Wenn Sie im Befehlsfinder die Diktierfunktion verwenden, sendet Ihr Browser Ihre Audioaufnahme an den Spracherkennungsdienst seines Herstellers (zum Beispiel Google bei Chrome, Apple bei Safari). Wir erhalten die Audioaufnahme nicht. Vor der ersten Nutzung sehen Sie einen Hinweis.
- **Zahlungsseiten.** Wenn eine Organisation bezahlt, gelten auf den Seiten von Stripe die eigenen Bedingungen und Cookies von Stripe. [OWNER: gehosteten Checkout bestätigen]
- **Schriftarten** werden von unserer eigenen Website ausgeliefert. Es erfolgt kein Aufruf von Google Fonts.

## 6. Wie Sie diese Elemente steuern oder löschen

- In Ihren Browsereinstellungen können Sie Cookies und Websitedaten (lokalen Speicher und Sitzungsspeicher) jederzeit löschen.
- Wenn Sie die Anmelde-Cookies löschen, werden Sie abgemeldet.
- Der Sitzungsspeicher wird geleert, wenn Sie den Tab schließen.
- [OWNER DECISION: die Einwilligungsauswahl im Produkt für §4, sobald sie umgesetzt ist]

## 7. Änderungen

- Version **v2 (Entwurf), 2026-10-15**.
- Wir aktualisieren diese Liste, bevor wir ein neues Cookie oder Speicherelement hinzufügen.
- Fragen: info@labourmarket.ai.
- Verantwortlicher: UAB „Nonstop Group“, Unternehmenscode 302676973 (siehe Datenschutzerklärung, §1).
