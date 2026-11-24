# LABOURMARKET.AI — OWNER VISUAL ACCEPTANCE AUDIT & 2026 PREMIUM REBUILD GOAL

## GOAL

Paversti dabartinį `labourmarket.ai` iš techniškai veikiančios, bet vizualiai ir logiškai padrikos web aplikacijos į aiškų, vientisą, 2026 m. top premium lygio AI-first produktą, kuriame:

- pokalbis yra pagrindinis valdymo centras;
- profilis / Premium Player Card yra aiškiai matomas pagrindinis žmogaus objektas;
- organizacijos ir asmeninės erdvės realiai persijungia;
- jokie meniu, profilis, nustatymai, pranešimai ar workspace pasirinkimai nepersidengia ir nėra nepaspaudžiami;
- landing neperilgas, nedubliuoja logikos, neapsiriboja statybomis ir realiai demonstruoja tą patį vizualinį bei funkcinį lygį, kuris egzistuoja produkto viduje;
- visa produkto logika yra kontekstinė, ne formų ir statinių CTA siena;
- kalendorius, žurnalas, žinutės, žemėlapis ir profilis nėra atskiros lygiagrečios aplikacijos, o pokalbio valdomos projekcijos;
- visos matomos funkcijos veikia production;
- produktas atrodo ir elgiasi kaip 2026 m. premium AI platforma, o ne kaip vakar pradėtas MVP.

## 1. Savininko galutinis verdictas

Dabartinis production rezultatas **neatitinka** ankstesnio deklaruoto:

`OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED`

Pagal realią savininko production peržiūrą teisingas verdiktas yra:

`OWNER_VISIBLE_REBUILD_NOT_COMPLETE_LANDING_IA_CHAT_CENTER_PLAYER_CARD_WORKSPACE_PROFILE_SETTINGS_CALENDAR_MESSAGES_AND_OVERLAY_DEFECTS`

Pagrindinė problema nėra viena ar kelios smulkios klaidos. Dabartinis produktas vis dar atrodo kaip keli tradiciniai CRUD puslapiai su pokalbio sluoksniu viršuje, nors kanoninė produkto kryptis yra priešinga:

> Pokalbis yra operacinis centras, o profilis, kalendorius, žurnalas, žemėlapis ir žinutės yra jo valdomos projekcijos.

## 2. P0 — Funkcionalumo defektai

### P0.1 Workspace perjungimas neveikia

- meniu rodo `Asmeninė erdvė` ir `Labour market ai Sp. z o.o`;
- rodomi tušti punktai su brūkšniais;
- paspaudus įmonės erdvę, realus perėjimas nevyksta;
- rodoma, kad erdvės perjungimas dar neįjungtas.

Reikalavimas:

- asmeninė ir kiekviena įmonės erdvė turi realiai persijungti;
- turi pasikeisti aktyvus kontekstas, duomenys, CTA, kalendorius, žemėlapis ir pokalbio santrauka;
- jokių tuščių punktų ar production tekstų apie neįjungtą funkciją.

### P0.2 Profilis ir nustatymai nepaspaudžiami

- profilio meniu persidengia su dešiniuoju skydeliu;
- Profilis ir Nustatymai normaliai neatsidaro;
- kai kurie punktai pasislepia po kitu turiniu.

Reikalavimas:

- Profilis, Nustatymai, Administravimas ir visi meniu punktai privalo būti paspaudžiami;
- meniu negali lysti po žemėlapiu ar kitais sluoksniais;
- patikrinti desktop ir mobile.

### P0.3 Globalūs overlay / dropdown persidengimai

Matoma:

- pranešimų panelė palenda po žemėlapiu;
- profilio meniu palenda po turiniu;
- workspace ir profilio meniu kertasi;
- dropdown'ai dengia vienas kitą.

Reikalavimas:

- vienas portal root;
- aiški z-index skalė;
- collision detection;
- focus trap;
- escape close;
- click outside;
- mobile bottom-sheet fallback;
- vizualinė regresija visiems overlay.

### P0.4 Google OAuth rodo neteisingą projekto identitetą

Popup pašalintas, bet Google lange rodoma techninė Supabase nuoroda (`...supabase.co`) vietoj `labourmarket.ai` identiteto.

Reikalavimas:

- Google consent ir account chooser turi rodyti LabourMarket identitetą;
- atlikti read-only OAuth, redirect, custom auth domain ir consent branding auditą;
- jokių OAuth Console ar secrets pakeitimų be savininko patvirtinimo.

### P0.5 Darbo paieškos srautas pradeda nuo klaidingos išvados

Paspaudus `Ieškau darbo`, sistema iš karto sako, kad nerado tinkamų pasiūlymų, nors vartotojas dar neįvedė kriterijų.

Reikalavimas: pradėti dialogą apie rolę, vietą, pradžios laiką, grafiką, sąlygas ir tik tada ieškoti.

### P0.6 Profilio CTA prieštarauja būsenai

Sistema rodo `6 iš 6`, bet vis tiek siūlo `Užbaigti profilį`.

Reikalavimas:

- vienas kanoninis completeness skaičiavimas;
- pilnas profilis → CTA nerodomas;
- profilio redagavimas prieinamas per pokalbį.

### P0.7 Darbo žurnalo redagavimas daugina įrašus

Po vieno įrašo koregavimo kalendoriuje atsirado keli panašūs įrašai.

Reikalavimas:

- redagavimas atnaujina esamą įrašą;
- viena kanoninė įrašo tapatybė ir `idempotency_key`;
- E2E: create → edit → edit → vienas aktyvus įrašas.

## 3. Landing

### 3.1 Per ilgas ir dubliuoja pats save

Navigacija jau turi auditorijų ir produkto skiltis, o landing jas dar kartą išskleidžia.

Reikalavimas: sutrumpinti iki:

1. Hero;
2. gyvas produkto scenarijus;
3. produkto grandinė;
4. žmogui / įmonei;
5. Player Card ir įrodymų sistema;
6. rinkos / žemėlapio kontekstas;
7. final CTA.

### 3.2 Hero nesubalansuotas

Kairė kolona mažesnė, bet turi daugiau teksto; dešinė didelė, bet vizualiai liūdna.

Reikalavimas:

- sumažinti teksto tankį;
- subalansuoti kolonas;
- gyvas kelių žingsnių produkto demo vietoj statinės dėžės.

### 3.3 Per siaurai orientuotas į statybas

Kartojasi mūrijimas, plytelės, statybų objektai.

Reikalavimas: rotuojami scenarijai — statybos, HoReCa, IT, logistika, slauga, gamyba, kūrybinis / savarankiškas darbas.

### 3.4 Trūksta motion ir 2026 premium lygio

Reikalavimas:

- darbo įrašas → įgūdžio įrodymas → Player Card → pasiūlymas;
- interaktyvi sektorių kaita;
- profesionalus žemėlapio scenarijus;
- motion aiškina produktą, ne tik dekoruoja;
- mobile lengvesnis variantas.

### 3.5 Klaidingi ir silpni tekstai

Probleminiai pavyzdžiai:

- `Kaip platforma veikia iš tikrųjų`;
- `Vienas pokalbio langas valdo jūsų darbą`;
- `Ruošiama`;
- `Koncepcinis`;
- `Placeholder`;
- netiksli šešių žingsnių grandinė.

Reikalavimas: pilnas LT copy auditas ir jokio pažado, kurio nėra produkto viduje.

### 3.6 Koncepcinis žemėlapis atrodo primityviai

Balta dėžė su abstrakčia forma ir taškais neatitinka premium lygio.

Reikalavimas rodyti realų miestą / regioną, poreikį, tinkamų ir prieinamų žmonių skaičių, atstumą, sektorių ir paaiškinamą atitikimą.

### 3.7 Player Card demo klaidina

Landing rodo `PLACEHOLDER`, aukso / sidabro / bronzos lygius ir 92/87/79 skaičius.

Reikalavimas:

- landing ir produktas naudoja tą patį `WorkerPlayerCard`;
- jokio universalaus žmogaus balo;
- jokio aukso / sidabro / bronzos žmogaus reitingavimo;
- jokio `PLACEHOLDER`;
- leidžiamos tik paaiškinamos dimensijos ir įrodymai.

## 4. Pagrindinis pokalbis

### 4.1 Pokalbio įvedimas nėra centre

Dabartinis composer prilipintas apačioje, o centras tuščias.

Reikalavimas:

- pirmo atidarymo metu composer centre;
- po pirmos žinutės natūraliai pereina į sticky apačią;
- pasisveikinimas arčiau produkto identiteto;
- 1–3 jaukūs ir kontekstiniai CTA.

### 4.2 Pirmas ekranas per tuščias

`Kuo galiu padėti?` per generinis.

Reikalavimas rodyti realią santrauką: paskutinis darbas, neužbaigti veiksmai, profilio būsena, terminai, galimybės ir vienas kitas žingsnis.

### 4.3 CTA siena

Matomi statiniai mygtukai nepriklausomai nuo būsenos.

Reikalavimas:

- tik 1–3 kontekstiniai CTA;
- pilnas profilis → nėra `Užbaigti profilį`;
- įkeltas CV → `Atnaujinti CV`;
- darbo paieška pirmiausia surenka kriterijus.

### 4.4 Viršutinė navigacija per sunki

Matomi Pokalbis, Žurnalas, Kalendorius, Žinutės, paieška, kalba, tema, pranešimai, Išplėstinis valdymas ir profilis.

Reikalavimas:

- palikti aktyvią erdvę, pokalbį, pranešimus ir profilį;
- Žurnalas, Kalendorius, Žinutės ir Player Card tampa pokalbio valdomomis projekcijomis;
- `Išplėstinis valdymas` dingsta paprastam vartotojui.

## 5. Premium Player Card

### 5.1 Kortelė nerandama

Savininkas negalėjo paprastai rasti avataro ar Premium Player Card.

Reikalavimas:

- aiškiai pasiekiama iš pirmo ekrano;
- atidaroma per avatarą ir komandą `Parodyk mano kortelę`;
- matoma po darbo įrašo atnaujinimo;
- vienas kanoninis komponentas landing ir produkto viduje.

### 5.2 Kortelės vizualika turi būti reali

Jei landing rodo grafiką, įgūdžių projekcijas ir įrodymų ryšius, tas pats turi būti viduje.

Kortelė turi turėti: avatarą, profesinį identitetą, vietą, prieinamumą, darbo istoriją, įrodytus įgūdžius, įrodymų šaltinius, dokumentų būseną, reputacijos nuomonių statistiką ir paaiškinamas galimybes.

## 6. Žurnalas

### 6.1 Atskiras puslapis dubliuoja pokalbį

Atskira didelė įvedimo forma prieštarauja chat-first principui.

Reikalavimas:

- darbo registravimas tik per pokalbį;
- Žurnalas lieka istorijos / įrodymų projekcija;
- jokios antros įvedimo formos.

### 6.2 Angliški ir vidiniai terminai

Matoma `employee`, `owner`, pasikartojantys pasirinkimai.

Reikalavimas: jokios raw enum reikšmės; aiškūs lietuviški terminai.

### 6.3 Įgūdžio nustatymas turi būti paaiškinamas

Po įrašo sistema priskyrė `Programavimas`, bet nepaaiškino kodėl.

Reikalavimas rodyti:

- aptiktą įgūdžio signalą;
- iš kokios frazės;
- ar tai signalas, ar patvirtintas įgūdis;
- patvirtinti / pataisyti veiksmą.

## 7. Kalendorius

### 7.1 Per mažai informacijos

Reikalavimas rodyti: laiką, trukmę, workspace, projektą, vietą, statusą, konfliktą, tipą, šaltinį ir susijusį žmogų / įmonę.

### 7.2 Patikrinti visą sutartą modelį

Audituoti realius šaltinius: rezervacijos, projektai, užduotys, žurnalas, finansai, kvietimai, atostogos, etapai, darbo pasiūlymai, prieinamumas, konfliktai.

### 7.3 Redagavimo dublikatų klaida

Kritinis reikalavimas: vienas aktyvus įrašas visose day/week/month/year projekcijose.

## 8. Žinutės ir pranešimai

### 8.1 Žinučių puslapis per silpnas

Dabartinis vaizdas primena ankstyvą administravimo lentelę.

Reikalavimas: siuntėjas, tema, preview, laikas, unread, prioritetas, kontekstas, thread, greitas atsakymas ir archyvas.

Pokalbis turi galėti parodyti, perskaityti, parengti atsakymą ir išsiųsti po patvirtinimo.

### 8.2 Pranešimų panelė persidengia

Patenka į bendrą P0 overlay sistemos taisymą.

## 9. Dešinysis baras ir žemėlapis

### 9.1 Neaišku, ką jis rodo

Neaišku, ar taškai reiškia žmones, galimybes, projektus ar demonstracinius duomenis; neaišku, ar galima kontaktuoti.

Reikalavimas:

- kontekstinis, suskleidžiamas baras;
- aiškus paaiškinimas, kas rodoma;
- saugi kontakto logika per platformą;
- jokių nepaaiškintų taškų.

### 9.2 Realių duomenų auditas

Nustatyti, ką reiškia markeris, kodėl keičiasi vieta ir kas yra `13 be nustatomos vietos`.

## 10. CV įkėlimas

Dabartinis `iki 5 MB` perkelia techninę problemą vartotojui.

Reikalavimas:

- sistema automatiškai optimizuoja / suspaudžia, jei įmanoma;
- jei didesnis failas naudoja daugiau resursų, apie LMC informuoti prieš veiksmą;
- jokio slapto LMC nuskaičiavimo ar mokėjimo.

## 11. Lokalizacija

Pašalinti:

- `employee`;
- `owner`;
- `PLACEHOLDER`;
- techninius pavadinimus;
- dev / konceptines žymes;
- netaisyklingus ar neprofesionalius tekstus.

## 12. Vizualinė kryptis

Dabartinis įspūdis:

- daug šviesiai pilko fono;
- ploni kontūrai;
- daug tuščios erdvės;
- vienodos apvalintos dėžės;
- silpna hierarchija;
- per mažai gyvos būsenos;
- kai kur labiau administravimo UI nei 2026 AI produktas.

Reikalavimas: ne vien gražesnės spalvos, o nauja IA, komponentų hierarchija, veiksmų eiga, būsenos ir projekcijų santykis su pokalbiu.

## 13. Kanoninė informacijos architektūra

### Kairė viršuje

- LabourMarket identitetas;
- aktyvus workspace;
- minimalus perjungimas.

### Centras

- pokalbis;
- composer centre pirmo atidarymo metu;
- gyva kontekstinė santrauka;
- 1–3 CTA;
- po darbo pradžios sticky composer apačioje.

### Dešinė

Tik kontekstinė projekcija: Player Card, žemėlapis, kalendoriaus fragmentas, žinutė, darbo pasiūlymas arba dokumentas.

### Viršus

- aktyvi erdvė;
- pranešimai;
- profilis;
- minimalūs universalūs nustatymai.

## 14. Vykdymo prioritetai

### P0

1. Profilis paspaudžiamas.
2. Nustatymai paspaudžiami.
3. Visi overlay sutvarkyti.
4. Workspace realiai persijungia.
5. Tušti workspace punktai pašalinti.
6. `Ieškau darbo` pradeda dialogą.
7. Pilnam profiliui nerodomas `Užbaigti profilį`.
8. Redaguojamas žurnalo įrašas nesidaugina.
9. OAuth identiteto auditas ir taisymo planas.
10. Jokių nepaspaudžiamų elementų.

### P1

1. Composer į centrą.
2. Viršutinės navigacijos supaprastinimas.
3. `Išplėstinis valdymas` pašalinamas paprastam vartotojui.
4. Žurnalo įvedimo forma pašalinama iš atskiro puslapio.
5. Player Card iškeliama į aiškią vietą.
6. Dešinysis baras tampa kontekstinis.
7. Kalendoriaus šaltinių ir konfliktų auditas.
8. Žinučių projekcijos perprojektavimas.

### P2

1. Landing sutrumpinimas.
2. Hero perbalansavimas.
3. Kelių sektorių scenarijai.
4. Motion ir gyvas produkto demo.
5. Profesionali žemėlapio projekcija.
6. Landing Player Card sutapatinimas su realiu produktu.
7. Visų tekstų auditas.
8. Visų `placeholder`, `ruošiama`, `koncepcinis` pašalinimas.
9. Premium design-system pass.

## 15. Priėmimo kriterijai

Darbas baigtas tik tada, kai savininkas production gali:

1. prisijungti be popup ir be svetimo projekto identiteto;
2. paspausti Profilį;
3. paspausti Nustatymus;
4. persijungti į įmonės erdvę;
5. atidaryti Premium Player Card;
6. per pokalbį redaguoti profilį;
7. pradėti darbo paiešką ir būti pirmiausia apklaustas;
8. užfiksuoti darbą;
9. pataisyti įrašą nesukuriant dublikato;
10. matyti įrašą kalendoriuje;
11. matyti, kodėl priskirtas įgūdžio signalas;
12. atidaryti žinutes be persidengimo;
13. suprasti, ką rodo žemėlapis;
14. naudoti dashboard be nepaspaudžiamų elementų;
15. landing matyti tą patį realų produkto lygį, ne fiktyvią vizualizaciją.

## 16. Privaloma vizualinė QA

Viewport:

- 360×800
- 390×844
- 412×915
- 768×1024
- 1280×800
- 1440×900
- 1920×1080

Privalomos būsenos:

- profilio meniu;
- nustatymų meniu;
- pranešimų panelė;
- workspace menu;
- dešinysis baras;
- Player Card;
- darbo paieškos dialogas;
- pilnas / nepilnas profilis;
- kalendorius day/week/month/year;
- žinutės;
- mobile menu;
- light/dark;
- scroll viršuje, viduryje ir apačioje.

Tikrinama ne tik screenshot, bet realūs click, keyboard, focus, escape, browser back, refresh state ir production elgsena.

## 17. Trumpas GOAL agentui

```text
GOAL: pagal `docs/owner-goals/owner-visual-acceptance-audit-2026.md` ištaisyti realios savininko production peržiūros metu rastus P0/P1/P2 defektus ir paversti labourmarket.ai vientisu 2026 top premium AI-first produktu.

Pirmiausia perskaityk visą failą ir atlik faktinės repo bei production būsenos auditą. Ankstesnis verdiktas `OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED` yra savininko atmestas.

Vykdyk griežtai:
1. P0 funkcionalumo ir overlay defektai.
2. Chat-first informacijos architektūra.
3. Premium Player Card matomumas ir realus veikimas.
4. Žurnalo, kalendoriaus, žinučių ir žemėlapio projekcijų sutvarkymas.
5. Landing sutrumpinimas, kelių sektorių scenarijai, realus motion ir produkto vidų atitinkanti vizualika.
6. Pilna desktop/mobile visual QA.
7. Production patikrinimas realiais vartotojo veiksmais.

Po kiekvieno etapo atnaujink `docs/local/owner-visible-rebuild-progress.md` ir padaryk checkpoint commit. Jokio `completed` be production click-through ir screenshot įrodymų.

Nesustok ir nelauk savininko, išskyrus:
- production DB migraciją;
- OAuth Console / secrets;
- Billing / mokėjimus;
- DNS;
- negrįžtamą išorinį veiksmą.

Galutinis verdiktas leidžiamas tik:
`OWNER_VISUAL_ACCEPTANCE_2026_PREMIUM_PRODUCTION_VERIFIED`
arba
`OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_<TIKSLŪS_BLOKATORIAI>`
```
