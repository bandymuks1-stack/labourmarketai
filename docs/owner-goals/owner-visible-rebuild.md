# LABOURMARKET.AI — OWNER-VISIBLE REBUILD GOAL & RECOVERY

## 0. Kanoninis tikslas

Baigti visą jau pradėtą `labourmarket.ai` matomo produkto pertvarkymą taip, kad savininkas grįžęs production aplinkoje iš karto pamatytų realų, profesionalų, aiškų ir žmogui įdomų pokytį.

Techninis rezultatas nėra pakankamas. PR, commit, testai, CI, waiver ar architektūra yra tik vidinės sąlygos. Darbas laikomas baigtu tik tada, kai realiame production vaizde:

- landing atrodo moderniai, profesionaliai ir neprimena 2000-ųjų;
- žemėlapis yra prasminga produkto dalis, o ne padrikas didelis blokas;
- Google prisijungimas nebeatidaro atskiro popup lango;
- pagrindinė darbo erdvė yra chat-first;
- nėra mygtukų sienos, dubliuotų avatarų ar neaiškių navigacijų;
- mobile vaizdas tvarkingas;
- W1–W6 veikia kaip viena grandinė;
- darbo žurnalas, profilis, kontekstas ir žemėlapis realiai susieti;
- žmogui nereikia aiškinti, kas pasikeitė.

Dirbti tik su:

- repo: `bandymuks1-stack/labourmarketai`
- lokalus kelias: `C:\Users\Mano\Documents\labourmarketai`
- produktas: `labourmarket.ai`
- pradžia: naujausias faktinis `origin/main`
- žinomas paskutinis main kontrolinis SHA: `60c65244` arba naujesnis

Seno LABMA projekto nenaudoti ir neliesti.

---

## 1. Dabartinis atkūrimo taškas

Ankstesnė sesija pasiekė context limit po maždaug 55 minučių darbo.

Užduočių būsena paskutinėje sesijoje buvo:

- 11 tasks
- 5 done
- 1 in progress
- 5 open

Matoma task list būsena:

- `Landing: full professional rebuild (IA + visual + motion)` — IN PROGRESS
- `W1: workspace switcher by chat + data-context verification` — OPEN
- `W3: Context Panel mobile drawer + plain language pass` — OPEN
- `W5: profile completeness consistency + card polish` — OPEN
- `Journal chat-first closure (E)` — OPEN
- dar bent 1 pending/open užduotis
- 5 užduotys pažymėtos completed, bet jų negalima laikyti įrodytomis nepatikrinus repo ir realaus vaizdo

Paskutinis matomas darbas:

- ruoštas landing rebuild;
- pridėtas copy keturioms naujoms landing sekcijoms;
- copy plėstas 11 lokalių;
- naudoti raktai `landing.demo`, `landing.chain`, `landing.moment`, `landing.proof`;
- DA i18n riba išmatuota iki `1263`;
- keistas `i18n-debt.ts` komentaras / riba;
- tikrintas failas:
  `apps/web/app/[locale]/(marketing)/page.tsx`;
- sesija baigėsi prieš faktinį SESSION RECOVERY.

Nieko iš dabartinio necommitinto darbo neatmesti ir neatstatyti aklai.

---

## 2. Pirmas veiksmas naujoje sesijoje — SESSION RECOVERY

Pradėti ne iš atminties, o iš faktinės repo būsenos.

Patikrinti:

```bash
git fetch --all --prune
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status --short
git diff --stat
git diff
git log --oneline -15
```

Papildomai:

- išvardyti visus untracked failus;
- patikrinti, ar yra necommitintų landing pakeitimų;
- patikrinti, ar scratchpad turinys realiai pateko į repo failus;
- patikrinti dabartinį task list;
- patikrinti, ar dabartinis diff kompiliuojasi;
- patikrinti, ar nebuvo prarasta dalis darbo per context limit.

Sukurti arba atnaujinti repo faile:

`docs/local/owner-visible-rebuild-progress.md`

Jame palaikyti lentelę:

| Darbas | Faktinė būsena | Pakeisti failai | Vizualiai patikrinta | Kas liko |
|---|---|---|---|---|

Privalomos eilutės:

- Google popup P0
- Landing rebuild
- W1 workspace context
- W2 state-aware chat
- W3 Context Panel
- W4 AI Workspace
- W5 Live Profile Card
- W6 Context ↔ map
- Journal chat-first
- Top bar
- Mobile menu
- Visual QA
- Deploy / production verification

Po SESSION RECOVERY nestabdyti darbo ir nelaukti papildomo savininko atsakymo, išskyrus aiškiai uždraustus ar negrįžtamus veiksmus.

---

## 3. Kanoninė W1–W6 grandinė

### W1 — Active Workspace ir tapatybė

Tikslas: vartotojas visada aiškiai supranta, kieno vardu ir kokiame kontekste dirba.

Privaloma:

- asmeninė erdvė;
- organizacijos erdvė;
- aktyvus workspace pasirinkiklis prie pokalbio;
- neperkrauti top bar;
- subtilus vizualinis skirtumas tarp erdvių;
- aktyvus kontekstas realiai keičia duomenis, CTA, kalendorių ir rekomendacijas;
- jokio duomenų nutekėjimo tarp organizacijų;
- jokio antro workspace/dashboard modelio.

Patikrinti realias esamas erdves, jeigu jos egzistuoja:

- Asmeninė erdvė
- Labourmarket.ai
- Rexora
- Nonstop Group
- Watchmaker Vismantas

Geras rezultatas:

- workspace pasikeičia be refresh;
- turinys ir rekomendacijos iš karto keičiasi;
- aišku, kurioje erdvėje vartotojas yra;
- nėra dubliuoto workspace switcher.

### W2 — State-aware chat

Tikslas: pokalbis yra pagrindinis darbo paviršius ir remiasi realia sistemos būsena.

Privaloma:

- realus vartotojo, profilio, darbo, projektų ir kalendoriaus kontekstas;
- jokių fiktyvių production duomenų;
- vienu metu daugiausia 1–3 aktualūs veiksmai;
- seni veiksmai suskleidžiami;
- nėra nuolatinės mygtukų sienos;
- kiekvienas veiksmas turi dvi būsenas:
  1. priimtas, įrašytas ir turi ID;
  2. užbaigtas, rezultatas paruoštas.

Pagrindinis ekranas neturi būti tuščias „Kuo galiu padėti?“.

Jis turi rodyti realią aktualią santrauką:

- tinkamos galimybės;
- neužbaigtas darbo įrašas;
- trūkstama profilio informacija;
- dokumento terminas;
- kalendoriaus konfliktas;
- aktyvaus projekto situacija.

### W3 — Context Panel

Tikslas: kompaktiškai parodyti tik aktyviam pokalbiui reikalingą kontekstą.

Privaloma:

- nėra antras dashboard;
- nėra navigacijos;
- panelė suskleidžiama;
- mobiliame veikia kaip tvarkingas drawer arba bottom sheet;
- paprasta žmogui suprantama kalba;
- rodomi tik aktualūs elementai:
  - workspace;
  - projektas;
  - vieta;
  - laikas;
  - konfliktas;
  - pasirinktas žmogus ar galimybė;
- būsena susieta su W6 žemėlapiu.

### W4 — AI Workspace

Tikslas: AI ne tik kalba, bet realiai atlieka ir išsaugo veiksmus.

Privaloma:

- tikri serverio veiksmai;
- realus duomenų išsaugojimas;
- rezultatas matomas tame pačiame pokalbio sraute;
- nėra paralelinių dubliuojančių formų;
- formos tik kai būtina;
- loading, success, empty ir error būsenos;
- jokio neveikiančio `link:` ar fiktyvaus action chip.

Privalomi realūs veiksmai:

- profilio papildymas;
- CV importas;
- darbo paieška;
- darbuotojo poreikio pateikimas;
- darbo įrašo sukūrimas;
- projekto / kalendoriaus konteksto peržiūra;
- aktualios rekomendacijos.

### W5 — Live Profile Card

Naudoti tik esamą `WorkerPlayerCard`.

Privaloma rodyti:

- vardą;
- profesinį apibūdinimą;
- vietą;
- prieinamumą;
- darbo istorijos santrauką;
- įrodytus įgūdžius;
- įgūdžių įrodymų šaltinius;
- dokumentus ir jų būseną;
- trūkstamą profilio informaciją;
- tinkamas galimybes;
- paaiškinimą, kodėl jos tinka;
- subjektyvių atsiliepimų statistiką, jei duomenys yra.

Draudžiama:

- žvaigždutės;
- universalus žmogaus balas;
- `trust_score`;
- `opportunityScore`;
- nepaaiškinamas 0–100 skaičius;
- nuomonė pateikta kaip faktas;
- antras profilio modelis.

Reputacija:

- +1 gera subjektyvi patirtis;
- −1 bloga subjektyvi patirtis;
- tekstinis atsiliepimas;
- tai nuomonė, ne faktas;
- neigiamų nuomonių persvara = rizikos signalas, ne automatinis nuosprendis.

Profilio completeness:

- vienas kanoninis skaičiavimas;
- negali kartu rodyti „profilis baigtas“ ir „užbaikite profilį“;
- po išsaugojimo būsena atsinaujina be refresh;
- jokių prieštaringų `4/5 saved` būsenų.

### W6 — Context ↔ Map

Tikslas: žemėlapis yra realus darbo ir paklausos konteksto sluoksnis.

Privaloma:

- Context Panel pasirinktas objektas / projektas / žmogus / galimybė atsispindi žemėlapyje;
- pasirinkimas žemėlapyje atnaujina pokalbio kontekstą;
- tik realūs ir leidžiami duomenys;
- marker clustering;
- aiškūs tooltip ir detail card;
- profesionali legenda ir filtrai;
- žemėlapis neužgožia produkto;
- mobile valdomas;
- pašalinti W3/W4 owner waiver, kai A-01 ir A-09 realiai išspręsti.

Geras rezultatas:

- pasirinkus galimybę pokalbyje, matoma jos vieta;
- pasirinkus žemėlapio objektą, pokalbis supranta kontekstą;
- vaizdas atrodo kaip profesionali produkto funkcija, ne standartinis OSM demonstracinis lapas.

---

## 4. P0 ir Owner-visible UX closure

### Google popup P0

Visose prisijungimo vietose:

- jokio atskiro popup lango;
- redirect tame pačiame naršyklės lange arba realiai inline sprendimas;
- grįžimas į teisingą locale ir ankstesnį kelią;
- jokio svetimo ar neteisingo redirect;
- desktop ir mobile patikra;
- patikrinti visus OAuth pradžios mygtukus;
- neveikiantys social login mygtukai nerodomi.

Statusas `FIXED` tik po realaus production bandymo.

### Top bar

Pašalinti:

- dubliuotus avatarus;
- kelis vienodus „S“ apskritimus;
- neaiškias ikonas;
- dubliuotą workspace pasirinkimą;
- nereikalingą triukšmą.

Palikti tik:

- aktyvią erdvę prie pokalbio;
- pranešimus;
- profilį;
- vieną nustatymų kelią.

### Mobile menu

- tvarkingas bottom sheet arba drawer;
- aiškus uždarymas;
- nėra persidengimo;
- nėra horizontalaus scroll;
- nėra nukirsto teksto;
- išlaikoma ankstesnė būsena.

Testuoti:

- 360×800
- 390×844
- 412×915

### Chat-first

Pašalinti nuolatinę CTA sieną:

- Užfiksuoti darbą
- Įkelti CV
- Ieškau darbo
- Mano planas
- Užbaigti profilį
- Peržiūrėti pasiūlymus

Šie veiksmai rodomi tik pagal realų kontekstą, vienu metu 1–3.

### Darbo žurnalas

Darbo žurnalas nėra atskiras dashboard.

Per pokalbį žmogus turi galėti:

1. nurodyti atliktą darbą;
2. pridėti projektą, vietą, laiką ir aprašymą;
3. pridėti įrodymus;
4. gauti įrašo ID;
5. matyti darbo istorijos atnaujinimą;
6. matyti galimus įgūdžių signalus;
7. atskirti automatinį signalą nuo patvirtinto įgūdžio.

---

## 5. Landing profesionalus rebuild

Dabartinio landingo nelaikyti tinkama baze vien todėl, kad jis techniškai veikia.

Pašalinti:

- 2000-ųjų struktūros įspūdį;
- didelį padriką žemėlapio bloką;
- atsitiktinių sekcijų vaizdą;
- silpną hierarchiją;
- neaiškią produkto vertę;
- vienodų kortelių sieną;
- generinį SaaS šablono vaizdą;
- neprofesionalų spacing;
- stock-photo įspūdį.

### Landing struktūra

1. **Hero**
   - aišku kas tai, kam skirta ir kuo skiriasi;
   - viena pagrindinė ir viena antrinė CTA;
   - gyvas produkto demonstravimas;
   - subtilus motion;
   - jokio milžiniško statinio žemėlapio.

2. **Produkto grandinė**
   - darbo poreikis;
   - tinkamas žmogus;
   - realus darbas;
   - darbo žurnalas;
   - įrodyti įgūdžiai;
   - geresnė kita galimybė.

3. **Gyvas produkto demo**
   - žmogus pokalbyje užfiksuoja darbą;
   - atsiranda darbo įrašas;
   - atsinaujina įgūdžio įrodymas;
   - sistema paaiškina naują galimybę.

4. **Dvi kryptys**
   - žmogui / darbuotojui;
   - įmonei / organizacijai.

5. **Darbo žurnalo išskirtinumas**
   - darbo faktai;
   - įrodymai;
   - įgūdžių signalai;
   - atsiliepimai laikomi atskirai.

6. **Profesionalus žemėlapio fragmentas**
   - kontroliuojamas aukštis;
   - stilizuotas;
   - keli aiškūs aktyvūs taškai;
   - subtili animacija;
   - vienas suprantamas scenarijus;
   - be standartinių padrikų OSM valdiklių.

7. **Reputacija ir įrodymai**
   - darbo faktas;
   - įrodytas įgūdis;
   - subjektyvus atsiliepimas;
   - jokių žvaigždučių.

8. **Final CTA**
   - pradėti kaip žmogui;
   - pradėti kaip organizacijai.

---

## 6. Motion, 3D ir skills

Pirmiausia audituoti dabartinį stack ir nediegti dubliuojančių bibliotekų.

Prioritetas:

1. `Motion for React`
   - UI perėjimai;
   - kortelės;
   - layout;
   - drawer / bottom sheet;
   - mikroanimacijos.

2. `GSAP + ScrollTrigger`
   - tik landing scroll pasakojimui;
   - produkto sekai;
   - subtiliam pin / scrub;
   - neperkrauti.

3. `React Three Fiber + Drei`
   - tik vienam prasmingam premium 3D objektui;
   - lazy-load;
   - mobile lengvesnis 2D fallback;
   - no-WebGL fallback;
   - 3D negali trukdyti CTA ar performance.

Skills diegimo taisyklės:

- oficialus arba patikimas aktyvus šaltinis;
- aiški licencija;
- nemokamas;
- nereikalauja secrets;
- nevykdo deploy;
- nedubliuoja esamo skill;
- realiai padeda konkrečiam darbui.

Užfiksuoti:

| Skill | Šaltinis | Licencija | Kam naudojamas | Įdiegtas / atmestas | Priežastis |
|---|---|---|---|---|---|

---

## 7. Vizualinė QA

Privalomi viewport:

- 360×800
- 390×844
- 412×915
- 768×1024
- 1280×800
- 1440×900
- 1920×1080

Privalomi ekranai:

1. landing hero;
2. visas landing;
3. login;
4. Google OAuth pradžia;
5. pagrindinis chat;
6. workspace switcher;
7. mobile menu;
8. Live Profile Card;
9. darbo žurnalo registravimas;
10. darbo pasiūlymai;
11. Context Panel;
12. produkto žemėlapis;
13. light tema;
14. dark tema;
15. empty būsena;
16. error būsena;
17. loading būsena.

Kiekvienam:

- BEFORE screenshot;
- AFTER screenshot;
- desktop;
- mobile;
- realus vartotojo veiksmas;
- nėra persidengimo;
- tekstas nenukirstas;
- CTA veikia;
- žmogui suprantama.

Automatiniai screenshot testai nepakeičia realaus naršyklės patikrinimo.

---

## 8. Darbo tvarka nuo dabartinio checkpoint

1. SESSION RECOVERY.
2. Stabilizuoti dabartinį landing diff.
3. Padaryti checkpoint commit.
4. Google popup P0.
5. W1.
6. W3.
7. W5.
8. Journal chat-first.
9. W6 ir profesionalus žemėlapis.
10. Top bar ir mobile menu.
11. W2/W4 realių veiksmų pilnas patikrinimas.
12. Landing galutinis motion / polish.
13. Pilna desktop ir mobile visual QA.
14. CI ir E2E kaip saugos vartai.
15. Merge.
16. Production deploy.
17. Post-deploy realus vizualinis ir funkcinis patikrinimas.
18. Rollback, jei production blogesnė.

Po kiekvieno didelio etapo:

- atnaujinti `docs/local/owner-visible-rebuild-progress.md`;
- padaryti atskirą checkpoint commit;
- įrašyti pakeistus failus;
- įrašyti screenshot kelius;
- įrašyti kitą konkretų veiksmą;
- nepalikti visos būsenos vien pokalbio kontekste.

---

## 9. Leidimai ir ribos

Leidžiama:

- nuoseklūs PR;
- merge, kai reali visual QA ir CI žali;
- production deploy;
- post-deploy smoke;
- rollback;
- nemokamos patikrintos open-source frontend bibliotekos ir skills.

Draudžiama:

- Billing;
- Stripe;
- mokėjimai;
- prenumeratos;
- mokami API;
- DNS;
- production DB migracija be atskiro savininko leidimo;
- duomenų trynimas;
- naujas repo;
- senas LABMA;
- bendras branch protection apėjimas;
- fake screenshot;
- mock duomenys pateikti kaip production faktas;
- secrets ar OAuth console pakeitimas be aiškaus pagrindimo ir rollback plano.

Nestabdyti dėl kitų klausimų. Savininko laukti tik jeigu būtina:

- production DB migracija;
- Billing / mokėjimai;
- secrets / OAuth konsolė;
- DNS;
- kitas negrįžtamas išorinis veiksmas.

---

## 10. Galutinis priėmimas

Galutinė ataskaita turi prasidėti:

### KĄ SAVININKAS REALIAI PAMATYS PRODUCTION

Pirma aprašyti:

- kaip pasikeitė landing;
- kuo hero tapo įdomus;
- kaip veikia motion;
- ar panaudotas 3D ir kodėl;
- kaip sutvarkytas žemėlapis;
- kaip veikia Google login;
- kaip atrodo pagrindinis chat;
- kaip perjungiamos erdvės;
- kaip atrodo profilis;
- kaip registruojamas darbas;
- kaip veikia mobile.

Tada lentelė:

| Problema / W | Prieš | Po | Production route | Desktop evidence | Mobile evidence | Statusas |
|---|---|---|---|---|---|---|

Leidžiami statusai:

- `FIXED_AND_VISUALLY_VERIFIED_IN_PRODUCTION`
- `PARTIAL_NOT_ACCEPTED`
- `BLOCKED_EXTERNAL_CONFIGURATION`
- `NOT_FIXED`

Jeigu bent viena iš šių problemų lieka production, rezultatas nebaigtas:

- Google popup;
- dubliuoti avatarai;
- perkrautas top bar;
- mygtukų siena;
- blogas mobile menu;
- profilio būsenų prieštaravimai;
- atskiras dashboard tipo darbo žurnalas;
- neprofesionalus landing;
- padrikas žemėlapis;
- W6 neatspindėtas žemėlapyje.

Galutinis verdiktas tik:

`OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED`

arba:

`OWNER_VISIBLE_REBUILD_NOT_COMPLETE_<TIKSLŪS_LIKĘ_BLOKATORIAI>`

---

## 11. Trumpas GOAL naujai agento sesijai

Naujoje sesijoje įklijuoti tik tai:

```text
GOAL: neprarandant ankstesnės sesijos darbo užbaigti labourmarket.ai owner-visible W1–W6, chat-first UX ir profesionalų landing rebuild.

Pirmiausia perskaityk:
docs/owner-goals/owner-visible-rebuild.md

Tada atlik SESSION RECOVERY iš faktinės Git būsenos, nieko neatmesk aklai, atnaujink:
docs/local/owner-visible-rebuild-progress.md

Po recovery iš karto tęsk nuo pirmo realiai neužbaigto etapo. Po kiekvieno etapo atnaujink progress failą ir padaryk checkpoint commit. Nesustok iki production vizualinio patikrinimo, išskyrus faile aiškiai nurodytus owner-gated veiksmus.
```
