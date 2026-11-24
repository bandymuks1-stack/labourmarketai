# Pilot tester session script (LT)

Skirta savininkui — paruoštas tekstas pirmiems testuotojams.

Trumpas, paprastas, ne korporacinis. Galite kopijuoti ir siųsti.

---

## Siunčiamas tekstas

Sveiki,

Esate pakviestas (-a) išbandyti **labourmarket.ai** bandomąją versiją. Tai užtrunka ~20–30 minučių. Jūsų užduotis — ne pagirti, o **pamatyti, kas painu / lūžta / blogai išverstas**.

Pradžios vadovas: https://github.com/bandymuks1-stack/labourmarketai/blob/main/docs/pilot/TESTER_START_HERE_LT.md
(jei nuoroda neveiks — atsiųsiu .md failą)

Užduočių sąrašas:

### 1. Prisijungimas (2 min)
- Atsidarykite https://app.labourmarket.ai
- Spauskite **Tęsti su Google**.
- ✅ Jei sėkmingai patekote į dashboard — kitam žingsniui.
- ❌ Jei nukreipė atgal į login su klaida — užrašykite, ką gavote ekrane.

### 2. Pradinio dashboard apžiūra (3 min)
- Pažiūrėkite, kas matosi.
- ✅ Jei kas nors atrodo "kas tai per žodis / nesuprantu" — pažymėkite tą tekstą ir spauskite **Pranešti apie tekstą** (apatiniame dešiniame kampe).

### 3. Profilio / CV testas (5 min)
- Eikite į **Profilis** (iš nav meniu).
- Aprašykite savo darbą / patirtį laisvai. Pvz.: "Dirbau 5 metus statybose, daugiausia gipso kartono montavimu, Vilniuje ir kaime."
- Patikrinkite, ar sistema pasiūlė įgūdžius. Patvirtinkite kelis. Atmeskite kelis.
- ✅ Jei pasiūlymai turi prasmę — gerai.
- ❌ Jei pasiūlymai keisti / praleido akivaizdų įgūdį / pavadino nesąmonę — praneškite per "Pranešti apie tekstą" su trumpu paaiškinimu.

### 4. Darbo dienoraščio testas (7 min)
- Eikite į **Mano dienoraštis**.
- Įrašykite tikrą šios dienos / vakar dienos pavyzdį. Pvz.: "4 valandas glaiščiau sienas ir 2 valandas tvarkiau objektą."
- Spauskite **Pasiūlykite struktūrą**.
- ✅ Tikėtina, kad sistema pasiūlys du darbo fragmentus su laiku ir veikla.
- Patvirtinkite tai, kas tiesa. Spauskite **Patvirtinti įrašą**.
- ✅ Įrašas turi atsirasti **Įrašai** sąraše apačioje.
- Pabandykite **Redaguoti įrašą** ant pridėto įrašo.
- Pabandykite **Pašalinti įrašą** ant kito įrašo.
- ❌ Bet kuri klaida → "Pranešti apie tekstą" + "BUG:" prefiksas.

### 5. Bandymas kitose rolėse (jei matote rolių perjungiklį) (5 min)
- Jei matote rolių perjungiklį (worker / company / agency / customer), perjunkite į **company** (ar agency, ar buyer).
- Užpildykite pirmą juodraštį. Stebėkite, kurie laukai jums neaiškūs.
- Saugokite. ✅ Turi atsirasti "Saved privately…" žinutė.

### 6. Atsijungimas + prisijungimas iš naujo (2 min)
- Spauskite avataro meniu → **Atsijungti**.
- Prisijunkite iš naujo.
- ✅ Jūsų įrašai turi išlikti.

### 7. Bendras įspūdis (3 min)
Po visko — užpildykite vieną pranešimą per "Pranešti apie tekstą" su atsakymais:
- Kuri vieta buvo aiškiausia?
- Kuri vieta buvo painiausia?
- Ar grįžtumėte naudoti šią platformą savaitę vėliau? (Yes/No + viena eilutė kodėl.)

---

## Savininkui — ką daryti su rezultatais

Po sesijos atidarykite (kaip admin):

1. `/lt/dashboard/admin/agent-os` — patikrinkite, ar visi 10 agentų korteles matomos.
2. `/lt/dashboard/admin/pilot-telemetry` — pamatysite testuotojo task summary (kiek vidutiniškai užtruko `journal_entry_create` ir pan.), top klaidų kodus, paskutinius 200 įvykių.
3. `/lt/dashboard/admin/language-feedback` — visi "Pranešti apie tekstą" raportai.
4. `/lt/dashboard/admin` (hub) — drafts skaičiai.

Žiūrėkite į konkrečius klaidų kodus (`unit_slug_unknown`, `not_owner`, `exchange_failed`, ...) — jie tiesiogiai veda į kodo vietą, kurią reikia taisyti.
