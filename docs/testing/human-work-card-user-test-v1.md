# Mano darbo kortelė — User Test Package v1

A real, run-it-with-people testing package for the worker work-card experience.
Target: 4–8 testers (mix of trades / office / first-time users), Lithuanian
first. Each session ≈ 10–15 min. Record screen + think-aloud if possible.

Goal of the test: confirm the North Star —
*"Sistema mane prisimena, supranta, ką apie mane jau žino, ir siūlo vieną aiškų
veiksmą, kuris man duoda naudą."*

---

## 0. Setup (facilitator)

- Use a real account on the production site (`labourmarket-ai.vercel.app`) or a
  staging login. **No demo/sample data** — the tester uses their own answers.
- For the **new-user** script, use a fresh account with an empty work card.
- For the **returning-user** script, use an account that already saved at least
  profession + availability + location (so the card is in `returning` state).
- For the **stale** check (optional), an account whose card was confirmed > 90
  days ago (or temporarily note it can't be reproduced live yet).
- Do not coach. When the tester asks "what do I do?", reply "what would you
  naturally do?".

---

## 1. New user — 5-minute script

> Scenario: *"Ką tik prisiregistravote. Pažiūrėkite į ekraną ir darykite tai, kas
> jums atrodo natūralu. Garsiai sakykite, ką galvojate."*

1. Land on `/dashboard`. **Do not** explain anything.
2. Ask them to read the top out loud ("Mano darbo kortelė", "Sveiki, …").
3. Watch what they click first. (Expected: the one primary action
   "Nurodyti, ką dirbu".)
4. Let them set their profession + 1–2 skills.
5. Return to the dashboard. Note whether they understand they progressed.
6. Watch the next single action (expected: availability or location).
7. Stop at 5 minutes.

**Success signal:** within 1–2 min they did one meaningful thing and can say
*why* it helps ("kad žinotų, kokį darbą siūlyti").

---

## 2. Returning user — 5-minute script

> Scenario: *"Jūs jau naudojotės anksčiau ir kai ką nurodėte. Prisijunkite dar
> kartą."*

1. Land on `/dashboard`.
2. Ask: *"Ar sistema jus prisimena? Iš ko matote?"* (Expected: they point at
   "Kas jau aišku" with their real data.)
3. Ask: *"Ko, sistemos nuomone, dar trūksta? Ar sutinkate?"*
4. Watch: is there exactly **one** clear next action? Do they feel re-asked
   anything they already filled? (Expected: **no** re-asking.)
5. Open **"Kaip mane matytų darbdavys"**. Ask: *"Ar tai jums naudinga? Kodėl?"*
6. Stop at 5 minutes.

**Success signal:** they feel remembered, not nagged; the next action feels
useful; the employer preview makes them want to complete more.

---

## 3. Mobile script (LT, phone)

1. Open `/dashboard` on a real phone (or 390px viewport).
2. Check: is the card readable in one scroll without pinch-zoom?
3. Tap the primary action — is the tap target big enough?
4. Open "Keisti darbo kortelę" — can they fill availability/pay quickly with the
   on-screen keyboard?
5. Open "Kaip mane matytų darbdavys" — does the panel read cleanly on mobile?

**Success signal:** no horizontal scroll, no tiny targets, editing feels fast.

---

## 4. Questions to ask each tester

Ask after the session, in Lithuanian:

1. Ar supratote, ką čia reikia daryti?
2. Ar supratote, kodėl tai naudinga?
3. Ar jautėtės, kad sistema jus prisimena?
4. Kurioje vietoje pasidarė neaišku?
5. Kas atrodė per ilgai?
6. Ar buvo per daug mygtukų?
7. Ar norėtumėte tęsti pildymą? (Kodėl / kodėl ne?)

Record answers verbatim where possible.

---

## 5. Observation checklist (facilitator notes)

For each tester, mark:

- [ ] Where did they **hesitate**? (timestamp + element)
- [ ] Where did they **click the wrong thing**?
- [ ] Where did they ask **"kam to reikia?"**
- [ ] Did **first value** appear within **1–2 minutes**? (Y/N + time)
- [ ] Did the **returning** login feel **useful or annoying**? (one word)
- [ ] Did they ever feel **re-asked** something already saved? (Y/N)
- [ ] Did they understand the **one next action** + its **why**? (Y/N)
- [ ] Was the **employer preview** seen as useful or confusing? (note)
- [ ] Any moment they wanted to **quit**? (where)

---

## 6. Pass / fail bar

The build passes user testing for this sprint if, across testers:

- ≥ 75% reach first value within 2 minutes (new user).
- ≥ 75% say the returning login feels "remembered / useful", not "fill again".
- No tester is re-asked a saved dimension.
- ≥ 75% can articulate *why* the suggested action helps them.
- No tester reads it as an "administracinė sistema / formų pildymas".

Log results back into `docs/audits/human-work-card-transformation-v1.md` under a
"User testing results" section.
