# S2 `personalWorkspace` copy review — RU / NL / DE

**Base:** `origin/main` @ `fec62073` (PR #999 merge commit)
**Branch:** `fix/s2-personalworkspace-ru-nl-de-copy-review`
**Scope:** copy only, `personalWorkspace` namespace only. No component, route, readiness,
role-gating or chat change. No other namespace touched.

---

## 1. Method

Every proposal is anchored in a term the repo's **existing** catalogue already uses for that
concept, so this is a consistency review, not a taste rewrite. Where the current wording was
already the canonical one, it is left alone and marked "keep".

The one term flagged as an outright error (`Arbeitsbereitschaft`) is flagged on meaning, not
style: in German labour-law usage it denotes a form of **paid on-call/standby working time**,
so as a heading over "what is already set / what matters most now" it can read as a shift type.

## 2. Register — verified against the surface, not the whole catalogue

The block renders **inside the conversation**, directly above the greeting and composer. The
strings a user sees in the same screen:

| Locale | Greeting | Composer | Register |
|---|---|---|---|
| DE | „Hallo. Wie kann ich **dir** heute helfen?" | „Schreib, was **du** brauchst…" | informal `du` |
| NL | „Hoi. Hoe kan ik **je** vandaag helpen?" | „Schrijf wat **je** nodig hebt…" | informal `je` |
| RU | „Здравствуйте. Чем помочь сегодня?" | „Напишите, что **вам** нужно…" | formal `вы` |

The DE catalogue as a whole is `Sie`-dominant (1318 : 234), but that mass sits in `auth`
(132 : 7) and the employer/admin namespaces. The conversation-first worker surfaces are
deliberately `du` (`conversation` 74 : 7, `workspace` 59 : 0, `todayScreen` 9 : 0).

**Decision: DE stays `du`, NL stays `je`, RU stays `вы`.** Switching DE to `Sie` would make one
card address the reader two different ways in a single screen. This is the reading of
"consistent with the rest of the German product copy" that holds at the surface the user
actually sees; flagged here explicitly because the brief could also be read as "use Sie".

## 3. Review table

| Key | LT meaning | EN meaning | Current RU | Proposed RU | Current NL | Proposed NL | Current DE | Proposed DE | Reason |
|---|---|---|---|---|---|---|---|---|---|
| `title` | Mano erdvė | My space | Моё пространство | *keep* | Mijn ruimte | *keep* | Mein Bereich | *keep* | All three are natural; `Mein Bereich` avoids colliding with "workspace"; RU pairs with the space-kind label "Личное пространство" without repeating it. |
| `intro` | Where you assemble your work profile; the work starts in the conversation below | same | (вы) … | *keep* | (je) … | *keep* | (du) … | *keep* | Meaning and register already correct on all three. |
| `workProfile` | Mano darbo profilis | My work profile | Мой рабочий профиль | *keep* | Mijn werkprofiel | *keep* | Mein Arbeitsprofil | *keep* | `werkprofiel` / `Arbeitsprofil` already canonical (`marketRecognition.supply.needWorkBody`). |
| `unverifiedNote` | Self-declared, not human-reviewed | same | (вы) … | *keep* | (je) … | *keep* | (du) … | *keep* | Honest and natural in all three. |
| `dimension.whatICanDo` | Ką moku | What I can do | Что я умею | *keep* | Wat ik kan | *keep* | Was ich kann | *keep* | Natural first-person in all three. |
| `dimension.whatIAmLookingFor` | Ko ieškau | What I am looking for | Что я ищу | **Какую работу я ищу** | Wat ik zoek | *keep* | Was ich suche | *keep* | RU „Что я ищу" is vague out of context (could be search); naming the object matches the LT sense. NL/DE read unambiguously in the list. |
| `dimension.whenICanWork` | Kada galiu dirbti | When I can work | Когда я могу работать | *keep* | Wanneer ik kan werken | *keep* | Wann ich arbeiten kann | *keep* | Availability as a first-person phrase; the canonical nouns `Beschikbaarheid` / `Verfügbarkeit` are already rendered by the pillar labels inside the same block. |
| `dimension.whereICanWork` | Kur galiu dirbti | Where I can work | Где я могу работать | *keep* | Waar ik kan werken | *keep* | Wo ich arbeiten kann | *keep* | Kept first-person deliberately: the six dimensions are one parallel list, and `Mein Arbeitsort` / `Mijn werkregio` would break that pattern for no gain. |
| `dimension.whatPayIExpect` | Kokio atlygio tikiuosi | What pay I expect | Какую **оплату** я ожидаю | **Какую зарплату я ожидаю** | Welke **beloning** ik verwacht | **Welk salaris ik verwacht** | Welche **Bezahlung** ich erwarte | **Welche Gehaltsvorstellung ich habe** | All three used a non-canonical word. Catalogue canon: RU `Зарплата` (`marketRecognition.field.salary`, `jobPostings…salary.label`); NL `Salaris` / `Salarisverwachting` (`cvSections.names.salary`, `cvExport.privateDetails.title`); DE `Gehaltsvorstellung` (`cvExport.privateDetails.title`, `cvSections`). RU `оплата` is used for payment/price elsewhere; NL `beloning` is HR-register. |
| `dimension.howIProveExperience` | Kuo galiu pagrįsti patirtį | How I can back up my experience | Чем я могу подтвердить опыт | *keep* | Waarmee ik mijn **ervaring** kan onderbouwen | **Waarmee ik mijn werkervaring kan onderbouwen** | Womit ich meine **Erfahrung belegen** kann | **Womit ich meine Berufserfahrung nachweisen kann** | RU already matches the canonical `подтверждения` family. NL/DE: name *work* experience, and DE moves to the canonical `Nachweis` root (`Nachweisbericht`, `Nachweiskennzahlen`). |
| `readiness.label` | Darbo pasiruošimas | Work readiness | Готовность **к работе** | **Готовность профиля** | **Werkgereedheid** | **Status van je werkprofiel** | **Arbeitsbereitschaft** | **Status des Arbeitsprofils** | **DE is the error this PR exists for**: `Arbeitsbereitschaft` is paid standby working time in German labour-law usage. NL `Werkgereedheid` is a bureaucratic coinage, not human-first. RU „готовность к работе" reads as *available to work* rather than *profile state*. All three now name the work profile's state, which is what the section shows. |
| `readiness.known` | Jau nurodyta: | Already set: | Уже указано: | *keep* | Al ingevuld: | *keep* | Bereits angegeben: | *keep* | Natural in all three. |
| `readiness.next` | Svarbiausia dabar: | Most important now: | Сейчас важнее всего: | *keep* | Nu het belangrijkst: | *keep* | Jetzt am wichtigsten: | *keep* | Natural in all three. |
| `readiness.complete` | Viskas, kas svarbiausia, jau nurodyta. | Everything important is already set. | Всё самое важное уже указано. | *keep* | Alles wat belangrijk is, is al ingevuld. | *keep* | Alles Wichtige ist bereits angegeben. | *keep* | Natural in all three. |
| `readiness.unavailable` | Couldn't show readiness; the conversation still works | same | …показать **готовность к работе**… | **…показать готовность профиля…** | De **werkgereedheid** kon nu niet… | **De status van je werkprofiel kon nu niet…** | Die **Arbeitsbereitschaft** konnte gerade nicht… | **Der Status deines Arbeitsprofils konnte gerade nicht…** | Must follow `readiness.label` or the degraded state contradicts the heading. |
| `action.startWithYourself` | Pradėti nuo savęs | Start with yourself | Начать с себя | *keep* | Begin bij jezelf | *keep* | Bei dir selbst beginnen | *keep* | Natural in all three. |
| `action.whenICanWork` | Nurodyti, kada galiu dirbti | Say when I can work | Указать, когда я могу работать | *keep* | Aangeven wanneer ik kan werken | *keep* | Angeben, wann ich arbeiten kann | *keep* | Natural imperative-ish CTA in all three. |
| `action.whereICanWork` | Nurodyti, kur galiu dirbti | Say where I can work | Указать, где я могу работать | *keep* | Aangeven waar ik kan werken | *keep* | Angeben, wo ich arbeiten kann | *keep* | As above. |
| `action.addSkills` | Pridėti įgūdžius | Add skills | Добавить навыки | *keep* | Vaardigheden toevoegen | *keep* | Fähigkeiten hinzufügen | *keep* | Matches the pillar labels rendered in the same block. |
| `action.addExperienceEvidence` | Pridėti patirties įrodymų | Add proof of experience | Добавить **подтверждение** опыта | **Добавить подтверждения опыта** | Bewijs van **ervaring** toevoegen | **Bewijs van werkervaring toevoegen** | **Nachweise für Erfahrung** hinzufügen | **Nachweise zur Berufserfahrung hinzufügen** | RU catalogue uses the plural `Подтверждения` (`reports.worker.evidence.confirmations`). NL/DE name *work* experience; DE `Nachweise zur Berufserfahrung` is the natural collocation. |
| `action.viewWorkProfile` | Peržiūrėti mano darbo profilį | View my work profile | Посмотреть мой рабочий профиль | *keep* | Mijn werkprofiel bekijken | *keep* | Mein Arbeitsprofil ansehen | *keep* | Natural in all three. |
| `action.completeWorkProfile` | Papildyti mano darbo profilį | Add to my work profile | Дополнить мой рабочий профиль | *keep* | Mijn werkprofiel aanvullen | *keep* | Mein Arbeitsprofil ergänzen | *keep* | Natural in all three. |

**Changed:** RU 4 · NL 4 · DE 5. Everything else verified and deliberately kept.

## 4. Finding OUTSIDE this PR's scope — LT register mix (NOT changed)

`lt.personalWorkspace` addresses the reader **two ways inside one card**:

- `intro` — „Čia **susidėlioji** savo darbo profilį, matai, ką sistema apie **tave** jau žino…" (informal *tu*)
- `unverifiedNote` — „Tai, ką **pasakojate** apie save…" (formal *jūs*)

The `unverifiedNote` string was ported from the legacy `auth.dashboard.mySpace` namespace,
which used *jūs*, into a block written in *tu*. EN is unaffected (English has one form).

This brief limits LT/EN edits to clear factual typos, so **nothing was changed**. It is a real
user-visible defect in the primary market language and the fix is one word —
`pasakojate` → `pasakoji` (and it also renders in the same card as the *tu* greeting
„Labas, …"). Owner decision; one word to approve.

## 5. Native-review status

These proposals are anchored to existing catalogue terms and verified against register
evidence, but **they are not a certified native-speaker sign-off**. RU / NL / DE remain
`COPY_REVIEW_PENDING` until a native speaker confirms. This PR narrows the gap and removes
the one term (`Arbeitsbereitschaft`) that was actively misleading.
