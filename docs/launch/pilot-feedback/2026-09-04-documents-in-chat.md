# Documents answered in the conversation (2026-09-04)

> Owner Master Execution Contract §12 (documents first-class: have / valid /
> expires / missing / required / who can issue / what next) and §16
> (matching continues after "no"). Verification used a bounded E2E worker
> identity on production (its preferred countries were set to NL + DE for
> the probe); never the real user.

## Measured before (#1469)

"Show my documents" / "kas baigia galioti?" answered with a route chip
only. The document centre and the country-readiness join existed but no
conversation reader called them. "Ko man trūksta?" (bare) was unknown, and
the skills-gap answer ended at "log work".

## The fix (#1469, GREEN, prod `2076d727`)

`lib/conversation/documents-gap.ts` (pure) + `documents-gap-server.ts` (the
ONE use case over the same document-centre read and country-readiness join
the documents page renders); `runDocumentsReadiness` workflow; the skill-gap
answer continues to the document gap; router phrasing in five locales; 14
keys × 11 locales. The route to the centre is emitted by the chat (W4
guard), never by the workflow layer.

## Production verification (E2E worker identity, 390 px, `2076d727`)

| Step | Observed |
|---|---|
| "kas baigia galioti?" with NO stated country | "Dokumentai: 0 paruošti, 0 baigia galioti, 0 trūksta. Nenurodei, kur nori dirbti, todėl negaliu pasakyti, kokių dokumentų ten reikia." + chips **Dokumentai · Kur nori dirbti?** — the honest ask, never an invented country |
| preferred countries NL + DE | "kokių dokumentų man reikia?" → "Dokumentai: 0 paruošti, 0 baigia galioti, 6 trūksta." then per country: "— A1 pažymėjimas: reikalingas Nyderlandai. Išduoda / tvirtina: Your Europe — Social security forms (A1 / posted workers)", "— Komandiravimo pranešimas …", "— Asmens dokumentas …", the same for Vokietija; why-line "Iš tavo dokumentų ir Nyderlandai, Vokietija reikalavimų sąrašo."; chip **Dokumentai** (screenshot `walk-documents/43-documents-answer.png`) |
| "ko man trūksta?" | skills: "Nieko netrūksta: turi visus įgūdžius, kurių prašo 9 matomi poreikiai." — the document gap was NOT appended on this branch (the no-skill-missing branch returned early) → fixed in the follow-up PR: the answer continues to the document gap in every branch |
| never | the worker fallback; a route-only answer |

Known limits (honest): the country name renders in the nominative
("reikalingas Nyderlandai"); the skills gap still names only "log work" as
the closing step — training suggestions need a public projection of
programmes by profession (privacy decision recorded in the checkpoint queue).

## Attention from the documents gap (prod `6fc477d9`, #1485 + #1487)

Worker two (preferred NL + DE, 6 required documents missing) opens the dashboard: the
opening brief now carries **"Trūksta 6 dokumentų jūsų šalims."** with the "Mano
dokumentai" chip (`walk-attention-prod.cjs`, 10.6 s). The first walk on `2fc998ee`
found the line never reached an active worker (the cap of three lines was filled by
matches / unlogged work / unread) — an EXPIRING document now sits right after the
offer rung as a deadline; a MISSING document (for a stated country) stays lower and
was reached here.

Next: a document RECORDED by sentence ("turiu naują A1 iki 2027-03-31", #1488) so the
gap can close from the same conversation.
