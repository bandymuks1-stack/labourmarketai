# LABOURMARKET.AI — PREMIUM UNIFIED PRODUCT GOAL

**Statusas:** KANONINIS
**Data:** 2026-07-30
**Šaltinis:** savininko vykdymo komanda (OWNER EXECUTION COMMAND)

> Šis dokumentas yra **vienintelis kanoninis produkto UX ir vizualinės krypties
> šaltinis**. Esant konfliktui su bet kuriuo kitu `docs/product/*` dokumentu,
> galioja šis. Konfliktuojantys ankstesni dokumentai turi būti pažymėti kaip
> `SUPERSEDED BY LABOURMARKETAI_PREMIUM_UNIFIED_PRODUCT_GOAL.md`, o ne ištrinti.

---

## 1. PRODUKTO MISIJA

`labourmarket.ai` yra **AI-first darbo operacinė sistema** žmonėms, įmonėms ir
projektams.

### Sistema NĖRA

- CV kūrimo įrankis
- paprastas darbo skelbimų portalas
- atskiras darbo žurnalas
- tradicinis dashboardas
- atskirų formų ir puslapių rinkinys

### Sistema SUJUNGIA

žmogaus darbo tapatybę · darbo žurnalą · įgūdžių formavimą iš realiai atlikto
darbo · Player Card · darbo ir projektų matching · įmones · projektus ·
kalendorių · dokumentus · reputaciją · rinkos duomenis · pasiūlymus · sąskaitų
ir ataskaitų rezultatus

→ į **vieną kontekstinę AI valdomą darbo erdvę**.

---

## 2. PAGRINDINIAI PRODUKTO PRINCIPAI

### 2.1 CHAT FIRST

Pokalbis yra **pagrindinė darbo sąsaja**, ne pagalbinis widget'as.

Per pokalbį vartotojas turi galėti: įrašyti atliktus darbus · papildyti profilį ·
peržiūrėti Player Card · ieškoti darbo · ieškoti darbuotojų · kurti pasiūlymą ·
valdyti projektą · tikrinti kalendorių · planuoti laiką · peržiūrėti rinkos
situaciją · gauti rekomendacijas · kurti dokumentus · paruošti sąskaitą ·
eksportuoti darbo įrašus · perjungti asmeninį, įmonės ir projekto kontekstą.

**Testas:** jei funkcijai pasiekti privaloma palikti pokalbį — funkcija dar
neintegruota.

### 2.2 ONE WORKSPACE

Po prisijungimo egzistuoja **viena** pagrindinė darbo erdvė.

Negalima kurti: antro dashboardo · atskiro AI dashboardo · atskiro darbo žurnalo
produkto · atskiros įmonės valdymo sistemos · atskiro projekto dashboardo ·
paralelinės navigacijos sistemos.

> **Dabartinis pažeidimas.** `/dashboard/advanced` (916 eil.) yra antras
> dashboardas, o `dashboard-chrome.tsx` turi tris navigacijos tapatybes.
> Žr. auditą §2, §3.1.

### 2.3 ONE FUNCTION — ONE CANONICAL SURFACE

Kiekviena funkcija turi **vieną** kanoninį komponentą ir vieną pagrindinę
prieigos logiką. Ta pati funkcija negali būti dubliuojama dviejuose ekranuose.

> **Dabartinis pažeidimas.** 3 Player Card implementacijos, ≥4 laiko „tiesos",
> 2 AI įėjimo taškai (`/dashboard` ir `/dashboard/assist`).

### 2.4 PROGRESSIVE DISCLOSURE

Informacija rodoma sluoksniais:

1. trumpa santrauka
2. išskleidžiamas blokas
3. katalogas arba tab
4. detalus rezultatas
5. redagavimo režimas — **tik tada, kai jo reikia**

### 2.5 REAL DATA ONLY

Autentikuotame produkte draudžiama: placeholder duomenys · koncepciniai
pavyzdžiai · netikri rodikliai · dekoratyviniai grafikai · išgalvoti procentai ·
žvaigždutės · bendras žmogaus balas.

**Praktinė taisyklė.** Jei duomenų nėra — rodomas **empty state, kuris padeda
atlikti kitą veiksmą**, o ne pavyzdinis skaičius. Tuščia yra sąžininga; netikra
nėra.

**Taikymas atkuriamiems komponentams.** Kiekvienas §6 orphaned komponentas
atkuriamas TIK patikrinus, kad jo duomenų šaltinis realus. Jei jis maitinamas
demo duomenimis — jis **nekuriamas**, kol nėra realaus šaltinio.

### 2.6 PREMIUM BUT SIMPLE

Produktas turi atrodyti: efektingai · profesionaliai · šiuolaikiškai · gyvai ·
patikimai · išskirtinai.

Tačiau turi likti: paprastas · greitai suprantamas · be vizualinės taršos · be
ilgų puslapių · be perteklinių rėmelių · be dešimčių lygiaverčių kortelių · be
nereikalingų mygtukų.

> **Kalibravimas.** Pridėtas vizualinis pavyzdys yra **krypties ir kokybės**
> etalonas, ne kopijavimo šablonas.
>
> **Perimti:** vizualinę hierarchiją, premium atmosferą, didelį profesionalo
> identiteto hero, aiškius pagrindinius rodiklius, kompaktišką grupavimą,
> grafikus su gyvais duomenimis, motion sluoksnį, paprastą navigaciją tarp
> katalogų.
>
> **Neperimti:** NBA produkto logikos, žvaigždučių reitingo, bendro žmogaus
> balo, netikrų/dekoratyvinių rodiklių, nereikalingų katalogų, ilgo puslapio
> struktūros, funkcijų, kurių `labourmarket.ai` neturi.

### 2.7 NO REGRESSION

Jau gerai veikiantys ar savininko teigiamai įvertinti elementai negali būti
pašalinti · supaprastinti · pakeisti silpnesniais · perrašyti vien dėl
vienodinimo · paslėpti · nustumti į antraeilę vietą — **be aiškaus savininko
sprendimo**.

> **Precedentas, kurio nekartojame.** Ankstesnis raundas ištrynė vienintelį
> grafiką (A-13) ir 8 gerus komponentus išėmė kaip „self-duplication", vietoj to,
> kad juos perpakuotų. Trynimas yra ne vienodinimas — tai regresija.
>
> **Operacinė taisyklė:** komponentas **išjungiamas iš maršruto** tik tada, kai
> kanoninis pakaitalas integruotas IR patikrintas. Failas netrinamas tame pačiame
> žingsnyje.

---

## 3. KAS LAIKOMA UŽBAIGIMU

Darbas **nėra** paruoštas vien todėl, kad build praeina · testai žali ·
komponentas rodomas · yra grafikas · ekranas neperpildytas · nėra overflow ·
funkcija techniškai egzistuoja.

Darbas paruoštas savininko peržiūrai **tik** kai:

- visa sistema atrodo kaip **vienas** produktas
- aišku, kad pokalbis yra pagrindinis valdymo centras
- nėra paralelinių dashboardų
- nėra funkcijų dubliavimo
- Player Card atrodo kaip premium darbo identitetas
- grafikai realiai padeda priimti sprendimus
- informacija kompaktiška, sugrupuota katalogais
- motion padeda orientuotis
- mobile patirtis pilnavertė
- realios funkcijos veikia
- esamos geros dalys nepablogintos
- rezultatas neatrodo kaip mokomasis ar šabloninis projektas

> **Jeigu produktą reikia žodžiais teisinti kaip „premium" — jis dar nėra premium.**

### 3.1 Testai NĖRA priėmimas

Testai ir guard'ai tikrina **regresiją**, ne kokybę. Savininko vizualinis
priėmimas yra atskiras, žmogaus atliekamas žingsnis. Jokiame raporte negali
atsirasti `completed` · `verified` · `owner accepted`, kol savininkas realiai
nepriėmė.

---

## 4. GRIEŽTI DRAUDIMAI (§16)

Be atskiro savininko leidimo draudžiama: merge į `main` · production deploy ·
DB migracijos · OAuth identiteto pakeitimai · billing · mokėjimai · Stripe ·
mokami planai · naujos mokamos paslaugos · naujos bibliotekos (jei tą patį galima
esamu stack) · naujas repo · paralelinė produkto architektūra · gero komponento
pašalinimas · placeholder duomenys autentikuotame produkte · savavališkas dizaino
„supaprastinimas" · ilgų puslapių kūrimas · funkcijų dubliavimas.

---

## 5. SUSIJĘ KANONINIAI DOKUMENTAI

| Dokumentas | Vaidmuo |
|---|---|
| `docs/audits/LABOURMARKETAI_UNIFIED_PRODUCT_SURFACE_AUDIT.md` | Esamos būklės inventorius |
| `docs/product/LABOURMARKETAI_CANONICAL_COMPONENT_MAP.md` | Viena funkcija = vienas komponentas |
| `docs/product/LABOURMARKETAI_UNIFIED_PREMIUM_BLUEPRINT.md` | Tikslinė architektūra + migracija |
| `docs/product/LABOURMARKETAI_MOTION_SYSTEM.md` | Motion doktrina |
| `docs/product/LABOURMARKETAI_PREMIUM_VISUAL_SYSTEM.md` | Vizualinė sistema |
| `docs/product/LABOURMARKETAI_NEXT_FUNCTIONS_PLAN.md` | Rytojaus prioritetai P1–P6 |
