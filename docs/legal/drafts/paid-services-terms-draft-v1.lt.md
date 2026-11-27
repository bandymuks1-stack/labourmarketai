# Mokamų paslaugų sąlygos — JUODRAŠTIS v2

> **JUODRAŠTIS SAVININKO IR TEISININKO PERŽIŪRAI. NEPUBLIKUOTI.**
> Svetainėje nerodomas, į `messages/*.json` neįtrauktas, jokio kodo nekeičia.
> v1 — 2026-10-27 (QA matrica 7.28, 7.19). v2 — 2026-11-03, savininko
> nurodymas: *„Mokėjimo planai – tęsti kainodaros ir teisinių sąlygų
> parengimą, nekeisti realių kainų be atskiro patvirtinimo.“*
>
> - Kiekvienas savininko ar teisininko sprendimas pažymėtas
>   **[SPRENDIMAS: …]**. Visas sąrašas — dokumento pabaigoje.
> - Teisės aktų nuorodos yra orientacinės; straipsnius turi patikrinti
>   teisininkas.
> - Kainos šiame tekste nekeičia jokios kainos produkte. Galiojanti kaina yra
>   ta, kurią savininkas nustatė (`docs/human-gates/payments-price-table-gate.md`).
> - Vertimas į anglų kalbą: `paid-services-terms-draft-v1.en.md`.
>   Ko reikia produkte prieš viešą pardavimą:
>   `paid-services-checkout-implementation-checklist.md`.

Šios sąlygos papildo platformos Naudojimo sąlygas ir taikomos tik mokamoms
paslaugoms. Kas yra pardavėjas ir kokia teisė taikoma, nustatyta Naudojimo
sąlygose ir čia nekeičiama.

## 1. Pardavėjas

1.1. Mokamas paslaugas parduoda, sąskaitas išrašo ir mokėjimus gauna
UAB „Nonstop Group“, įmonės kodas 302676973, PVM kodas LT100010790613,
registruota buveinė Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio r. sav.,
Lietuva (toliau — **Pardavėjas**).

1.2. Kontaktai mokėjimų, atsisakymo ir pretenzijų klausimais:
info@labourmarket.ai.
**[SPRENDIMAS: ar naudoti šį adresą, ar atskirą, pvz., billing@ / pretenzijos@; ar nurodyti telefoną]**

1.3. Mokėjimus apdoroja Stripe. Platforma kortelės duomenų nesaugo.

## 2. Kas nemokama

2.1. Registracija ir naudojimasis platforma nemokami darbuotojams ir kitiems
asmenims (planas **ASMUO**). Darbo žurnalas, Gyvas CV, įgūdžiai, dokumentai,
darbų lenta, užsakymai ir darbo kortelė lieka nemokami.

2.2. Organizacija nemokamai sukuria savo erdvę, ieško darbuotojų, juos
susisiekia, kuria projektus ir patvirtina darbą (planas **ORGANIZACIJA
NEMOKAMAI**). Vienu metu organizacija gali turėti **1 atvirą darbo poreikį**.
**[SPRENDIMAS: jei bus patvirtintas RED #2474 — įrašyti „3 unikalių darbuotojų profilių atidarymai organizacijai, pakartotiniai atidarymai nemokami“]**

2.3. Nemokamos funkcijos neišjungiamos dėl to, kad mokama paslauga
nenupirkta, pasibaigė ar buvo sustabdyta.

## 3. Mokami planai

3.1. **ORGANIZACIJA** — **99 EUR per mėnesį be PVM**. Apima viską, kas
nurodyta 2.2 punkte, darbo mastu: atvirų darbo poreikių skaičius fiksuotai
neribojamas, projektų valdymas, pasirengimas, ataskaitos, CSV eksportas,
darbo žurnalo peržiūra. Taikomos techninės ribos, kurios saugo nuo
piktnaudžiavimo (pvz., dirbtinio intelekto veiksmų skaičius per dieną
organizacijai). Tekstuose sakoma „be fiksuotos ribos“, niekada
„neribota“.
**[SPRENDIMAS: ar esamos užklausų ribos ir DI dienos riba laikomos sąžiningo naudojimo riba (FIN-1 c), ar reikia skaičiumi įvardyti sąžiningo naudojimo ribą]**

3.2. **ORGANIZACIJA SCALE** — **[SPRENDIMAS: kaina P2, EUR per mėnesį be PVM]**.
Apima viską, kas yra plane ORGANIZACIJA, ir didesnius mėnesio leidimus:
dirbtinio intelekto veiksmų per dieną **[SPRENDIMAS: P2-AI]**, skelbimų
vertimų per mėnesį **[SPRENDIMAS: P2-TR]**, į planą įtrauktų LMC kreditų
**[SPRENDIMAS: P2-LMC]**. Plane ORGANIZACIJA jokia funkcija dėl šio plano
neatimama. Šis planas dar nesukurtas ir neparduodamas.
**[SPRENDIMAS: ar siūlyti šį antrą mokamą planą (plano pasiūlymo variantas A), ar asmens mokamą planą (B), ar atidėti (C)]**

3.3. **Bandomasis laikotarpis** — **14 dienų** nemokamai, vieną kartą
organizacijai. Jei iki bandomojo laikotarpio pabaigos prenumerata
nenutraukiama, ji tampa mokama ir pirmasis mokėjimas nuskaičiuojamas
bandomojo laikotarpio pabaigoje. Prieš pradedant bandomąjį laikotarpį
parodoma, kada ir kiek bus nuskaičiuota.
**[SPRENDIMAS: ar bandomasis laikotarpis bus įjungtas viešai; ar likus N dienų siųsti priminimą el. paštu (rekomenduojama, nors teisės aktai to tiesiogiai nereikalauja B2B)]**

3.4. **Piloto leidimas** — vienkartinis mokėjimas už **30 dienų** plano
ORGANIZACIJA naudojimą. Jis neatsinaujina ir nieko daugiau
nenuskaičiuojama. Pasibaigus terminui organizacija grįžta į planą
ORGANIZACIJA NEMOKAMAI, nebent pati užsisako prenumeratą.
**[SPRENDIMAS: ar piloto leidimas lieka tik individualiai pasiūlytoms organizacijoms, ar įrašomas į viešas sąlygas su kaina; jei viešai — nurodyti kainą su / be PVM]**

## 4. Kainos ir PVM

4.1. **Organizacijoms** (B2B) kainos nurodomos **be PVM**. PVM
apskaičiuojamas ir pridedamas mokant pagal pirkėjo šalį ir statusą:
Lietuvos pirkėjui — Lietuvos PVM tarifu; kitos ES valstybės narės PVM
mokėtojui, nurodžiusiam galiojantį PVM kodą, — taikomas atvirkštinis
apmokestinimas; kitais atvejais — pagal taikomas taisykles.
**[SPRENDIMAS: teisininkui ir buhalteriui — patvirtinti PVM taikymą; susiję su RED #2685 (Stripe Tax) ir #2701 (nepagrįsto PVM pažado pašalinimas)]**

4.2. **Vartotojams** (jei paslaugos jiems bus parduodamos, žr. 6.1) kaina
nurodoma **su visais mokesčiais**, įskaitant PVM.

4.3. Prieš apmokėjimą visada parodoma: plano pavadinimas, kaina, ar PVM
įskaičiuotas, atsiskaitymo laikotarpis, ar mokėjimas atsinaujina, ir pirmojo
mokėjimo data.

4.4. Sąskaita faktūra išrašoma už kiekvieną mokėjimą ir pateikiama
elektroniniu būdu (el. paštu ir paskyros atsiskaitymo skiltyje).
**[SPRENDIMAS: ar sąskaitas išrašo Stripe (Stripe Invoicing), ar Pardavėjo buhalterinė sistema; i.SAF pateikimas]**

## 5. Atsiskaitymo laikotarpis ir automatinis atnaujinimas

5.1. Prenumerata mokama **iš anksto už kiekvieną mėnesį**. Laikotarpis
prasideda apmokėjimo (arba bandomojo laikotarpio pabaigos) dieną.

5.2. Prenumerata **atsinaujina automatiškai** kiekvieno laikotarpio
pabaigoje ir tuo pačiu mokėjimo būdu nuskaičiuojama to paties plano kaina,
kol prenumerata nenutraukta (7 skyrius).
**[SPRENDIMAS: ar siūlyti metinį mokėjimą (šiuo metu atidėtas)]**

5.3. **Nepavykęs mokėjimas.** Jei mokėjimas nepavyksta, Stripe bandys jį
nuskaičiuoti pakartotinai, o Pardavėjas informuos el. paštu. Jei mokėjimas
nepavyksta per **[SPRENDIMAS: N dienų malonės laikotarpis]**, mokamos
funkcijos sustabdomos ir organizacija grįžta į planą ORGANIZACIJA
NEMOKAMAI (9 skyrius).

5.4. **Plano keitimas.** Pereinant į brangesnį planą, skirtumas už likusią
laikotarpio dalį apskaičiuojamas proporcingai ir nuskaičiuojamas iš karto.
Pereinant į pigesnį planą, pakeitimas įsigalioja nuo kito laikotarpio.
**[SPRENDIMAS: patvirtinti proporcingą perskaičiavimą (Stripe proration) arba „pakeitimas nuo kito laikotarpio“ abiem kryptimis]**

## 6. Kas yra pirkėjas

6.1. Mokami planai skirti **organizacijoms** — juridiniams asmenims ir
fiziniams asmenims, perkantiems savo verslo, prekybos, amato ar profesijos
tikslais. Perkant asmuo patvirtina, kad perka organizacijos vardu.
**[SPRENDIMAS: ar paslaugos parduodamos ir vartotojams (fiziniams asmenims ne verslo tikslais). Jei ne — 8 skyrius taikomas tik tiems, kurie vis dėlto laikomi vartotojais pagal privalomą teisę; jei taip — būtinas visas 8 skyrius ir kainos su PVM (4.2)]**

6.2. Jei pirkėjas pagal privalomas teisės normas laikomas vartotoju, jis
visada išsaugo vartotojo teises, net jei šiose sąlygose nurodyta kitaip.

## 7. Kaip nutraukti prenumeratą ir kada tai įsigalioja

7.1. Prenumeratą galima nutraukti **bet kada** paskyros atsiskaitymo
skiltyje („Valdyti prenumeratą“, Stripe klientų portalas) arba parašius
1.2 punkte nurodytu adresu. Nutraukimui nereikia nurodyti priežasties.

7.2. Nutraukimas įsigalioja **apmokėto laikotarpio pabaigoje**. Iki tol
mokamos funkcijos veikia, vėliau nieko nenuskaičiuojama.

7.3. Nutraukus bandomąjį laikotarpį iki jo pabaigos, nieko nenuskaičiuojama.

7.4. Nutraukimas patvirtinamas el. paštu ir rodomas atsiskaitymo skiltyje
su data, kada mokamos funkcijos baigsis.

7.5. Kas lieka po nutraukimo: organizacijos duomenys, projektai, darbo
įrašai ir patvirtinimai **neištrinami**. Jau paskelbti darbo poreikiai
automatiškai neuždaromi, tačiau naujo poreikio sukurti ar uždaryto
atnaujinti negalima, kol atvirų poreikių daugiau nei leidžia nemokamas
planas.

7.6. Pardavėjas gali nutraukti mokamą paslaugą, jei pirkėjas iš esmės
pažeidžia sąlygas (pvz., piktnaudžiavimas, neteisėtas naudojimas), apie tai
pranešęs el. paštu ir nurodęs priežastį. Už neišnaudotą apmokėtą laikotarpį
tokiu atveju **[SPRENDIMAS: grąžinama proporcingai / negrąžinama]**.

## 8. Vartotojo teisė atsisakyti sutarties per 14 dienų

> Taikoma **tik vartotojams**. Organizacijoms (B2B) ši teisė pagal įstatymą
> netaikoma, nebent Pardavėjas ją suteikia savanoriškai (9.2).

8.1. Vartotojas gali atsisakyti nuotoliniu būdu sudarytos paslaugų sutarties
per **14 dienų** nuo jos sudarymo dienos, nenurodydamas priežasties
(Direktyva 2011/83/ES 9 str.; LR civilinio kodekso nuostatos dėl
nuotolinių vartojimo sutarčių).
**[SPRENDIMAS: teisininkui — tikslūs CK 6.228¹⁰–6.228¹¹ (ar kiti) straipsniai; ar paslauga yra „skaitmeninė paslauga“ pagal Direktyvą (ES) 2019/770 ir atitinkamas CK nuostatas]**

8.2. **Kaip atsisakyti.** Pakanka iki termino pabaigos išsiųsti aiškų
pranešimą 1.2 punkte nurodytu adresu arba užpildyti pavyzdinę atsisakymo
formą (8.6). Pardavėjas gavimą patvirtina el. paštu.

8.3. **Pinigų grąžinimas.** Visi gauti mokėjimai grąžinami ne vėliau kaip
per **14 dienų** nuo pranešimo gavimo, ta pačia mokėjimo priemone, be
papildomų mokesčių, išskyrus 8.4 punkte nurodytą sumą.

8.4. **Paslauga pradėta iš karto.** Jei vartotojas aiškiai paprašė pradėti
teikti paslaugą anksčiau, nei baigiasi 14 dienų terminas, ir vėliau
sutarties atsisako, jis sumoka **proporcingą sumą** už laiką iki
pranešimo apie atsisakymą (Direktyva 2011/83/ES 14 str. 3 d.).

8.5. **Kada teisė prarandama.** Jei paslauga per 14 dienų suteikta visa,
vartotojas teisės atsisakyti netenka tik tada, kai prieš pradedant teikti
paslaugą jis aiškiai sutiko ir patvirtino žinantis, kad visiškai suteikus
paslaugą šios teisės neteks (Direktyva 2011/83/ES 16 str. a p.). Mėnesinei
prenumeratai tai paprastai netaikoma, nes paslauga teikiama visą laikotarpį.

8.6. **Pavyzdinė atsisakymo forma** (užpildyti ir išsiųsti tik norint
atsisakyti sutarties):

> Kam: UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio
> r. sav., Lietuva, info@labourmarket.ai.
> Aš pranešu, kad atsisakau sutarties dėl šios paslaugos: [plano
> pavadinimas]. Užsakymo data: [data]. Vartotojo vardas, pavardė: [...].
> Paskyros el. paštas: [...]. Data: [...]. Parašas (jei forma pateikiama
> popieriuje).

8.7. Ką produktas privalo parodyti ir išsiųsti — žr.
`paid-services-checkout-implementation-checklist.md` (A dalis).

## 9. Grąžinimai

9.1. Vartotojams — pagal 8 skyrių ir privalomas teisės normas.

9.2. Organizacijoms — **[SPRENDIMAS: pasirinkti vieną]**:
- **(a)** savanoriška 14 dienų garantija: per 14 dienų nuo **pirmojo**
  mokėjimo už planą grąžinama visa suma, jei paprašoma 1.2 punkte nurodytu
  adresu; vėlesni mokėjimai negrąžinami, o nutraukimas veikia pagal 7
  skyrių;
- **(b)** mokėjimai negrąžinami; nutraukimas veikia pagal 7 skyrių;
- **(c)** proporcingas grąžinimas už nepanaudotą laikotarpio dalį.

9.3. Klaidingai, dvigubai ar po nutraukimo nuskaičiuota suma **grąžinama
visada**, ta pačia mokėjimo priemone.

9.4. Grąžinimas atliekamas per **14 dienų** nuo sprendimo grąžinti; lėšų
įskaitymo laikas priklauso nuo banko ar kortelės išdavėjo.

## 10. Mokėjimo ginčai (chargeback) ir sustabdymas

10.1. Prieš inicijuojant mokėjimo ginčą banke prašome susisiekti 1.2
punkte nurodytu adresu — dauguma klausimų išsprendžiami greičiau.

10.2. Inicijavus mokėjimo ginčą, Pardavėjas atsako per Stripe ir pateikia
turimus mokėjimo bei naudojimo įrodymus. Iki ginčo išsprendimo **mokamos
funkcijos gali būti sustabdytos**.

10.3. Sustabdymas niekada neištrina duomenų ir neišjungia nemokamų
funkcijų. Išsprendus ginčą pirkėjo naudai, mokamos funkcijos atkuriamos.

10.4. Mokamos funkcijos taip pat gali būti sustabdytos nepavykus
mokėjimui (5.3) ar esant pagrįstam įtarimui dėl sukčiavimo; apie
sustabdymą ir jo priežastį pranešama el. paštu.

## 11. Pretenzijos

11.1. Pretenzijas galima pateikti raštu 1.2 punkte nurodytu adresu.
Nurodykite organizacijos pavadinimą, paskyros el. paštą, kas įvyko ir ko
prašote.

11.2. Gavimas patvirtinamas per **[SPRENDIMAS: 2 darbo dienas]**.
Vartotojo pretenzija išnagrinėjama ir atsakymas pateikiamas **ne vėliau
kaip per 14 dienų** nuo gavimo (LR vartotojų teisių apsaugos įstatymas);
organizacijos pretenzija — per **[SPRENDIMAS: 14 / 30 dienų]**.

11.3. Jei vartotojo netenkina atsakymas arba jis negautas, vartotojas gali
per **vienus metus** nuo kreipimosi į Pardavėją kreiptis į **Valstybinę
vartotojų teisių apsaugos tarnybą** (VVTAT, Vilniaus g. 25, LT-01402
Vilnius, www.vvtat.lt) dėl ginčo neteisminio sprendimo, arba į teismą.
**[SPRENDIMAS: teisininkui — patikrinti VVTAT adresą ir terminą publikavimo dieną]**

11.4. **ES elektroninio ginčų sprendimo (EGS / ODR) platforma** veikė iki
2025 m. liepos 20 d. ir nebeveikia (Reglamentas (ES) 2024/3228), todėl
nuoroda į ją nepateikiama.
**[SPRENDIMAS: teisininkui — patvirtinti, kad nuorodos nebereikia]**

## 12. Atsakomybė

12.1. Platforma padeda rasti, pristatyti ir koordinuoti darbo rinkos
galimybes. Ji **negarantuoja**, kad bus surasti darbuotojai ar darbas,
kad bus sudaryta sutartis ar pasiektas konkretus verslo rezultatas.

12.2. Pardavėjas atsako už tinkamą mokamų paslaugų teikimą. Organizacijoms
Pardavėjo bendra atsakomybė pagal mokamą paslaugą ribojama suma, kurią
organizacija sumokėjo už tą paslaugą per **12 mėnesių** iki žalos
atsiradimo, o netiesioginiai nuostoliai (negautas pelnas, prarastos
sutartys) neatlyginami.
**[SPRENDIMAS: patvirtinti ribą (12 mėn. mokėjimų) ir netiesioginių nuostolių išimtį]**

12.3. Atsakomybė **neribojama**, kai žala padaryta tyčia ar dėl didelio
neatsargumo, kai žalojama gyvybė ar sveikata, ir kitais atvejais, kai
riboti draudžia įstatymas (CK 6.252 str.). Vartotojų teisės, kurių negalima
atsisakyti, išlieka.

12.4. Pardavėjas neatsako už trečiųjų šalių (pvz., Stripe, el. pašto ar
interneto paslaugų teikėjų) sutrikimus, kurių jis negalėjo kontroliuoti,
tačiau imasi priemonių jų pasekmėms sumažinti ir apie juos informuoja.

12.5. Už darbuotojų, įmonių ir kitų naudotojų pateiktą informaciją ir jų
tarpusavio sutartis atsako jas pateikę ar sudarę asmenys. Platforma rodo,
kas informaciją įrašė ir ar ji buvo patvirtinta.

## 13. Sąlygų ir kainų keitimas

13.1. Apie **kainos padidinimą** ar esminį mokamos paslaugos sąlygų
pakeitimą Pardavėjas praneša el. paštu ir paskyroje ne vėliau kaip prieš
**30 dienų** iki pakeitimo įsigaliojimo.
**[SPRENDIMAS: 30 dienų ar ilgesnis terminas]**

13.2. Nauja kaina taikoma tik nuo **kito atsiskaitymo laikotarpio**,
prasidedančio po pakeitimo įsigaliojimo. Jau apmokėtas laikotarpis
nekeičiamas.

13.3. Nesutinkantis su pakeitimu pirkėjas gali **nutraukti prenumeratą**
iki pakeitimo įsigaliojimo be jokių papildomų mokesčių (7 skyrius). Jei
nenutraukia, laikoma, kad sutinka nuo kito laikotarpio.

13.4. Kainos sumažinimas ar naujas pasirinkimas pirkėjui gali būti
taikomas iš karto.

13.5. Pakeitimai, kurių reikalauja įstatymas, gali įsigalioti greičiau;
apie juos pranešama kuo anksčiau.

## 14. Baigiamosios nuostatos

14.1. Pardavėjas, taikoma teisė ir ginčų teismingumas nustatyti
Naudojimo sąlygose. Vartotojas visada išsaugo savo gyvenamosios valstybės
privalomas teises.

14.2. Asmens duomenys tvarkomi pagal Privatumo politiką.

14.3. Sąlygos skelbiamos visomis aktyviomis platformos kalbomis; esant
neatitikimui, vadovaujamasi lietuvišku tekstu.
**[SPRENDIMAS: ar lietuviškas tekstas viršesnis, ar vartotojui — jo kalbos tekstas]**

14.4. Kiekviena sąlygų versija turi datą; pirkėjui el. paštu siunčiama ta
versija, kuri galiojo pirkimo metu.

## Kas pašalinama iš viešų puslapių publikavimo metu

- Frazė, kad teisinė informacija „rengiama“, ir „teisinė peržiūra
  laukiama“ juostos, kai mokamas planas jau parduodamas (QA 7.28).

---

## Visi atviri sprendimai [SPRENDIMAS]

| # | Kur | Sprendimas | Kas |
|---|---|---|---|
| 1 | 1.2 | Kontaktinis adresas mokėjimams, atsisakymui, pretenzijoms; telefonas | savininkas |
| 2 | 2.2 | Įrašyti 3 nemokamus profilių atidarymus, jei patvirtinamas RED #2474 | savininkas |
| 3 | 3.1 | Ar esamos ribos laikomos sąžiningo naudojimo riba (FIN-1 c) | savininkas |
| 4 | 3.2 | Antrasis mokamas planas: A (ORGANIZACIJA SCALE) / B (asmens planas) / C (atidėti) | savininkas |
| 5 | 3.2 | P2 kaina, P2-AI, P2-TR, P2-LMC | savininkas |
| 6 | 3.3 | Ar bandomasis laikotarpis įjungiamas viešai; priminimas prieš apmokėjimą | savininkas |
| 7 | 3.4 | Piloto leidimas — tik individualiai ar viešai su kaina | savininkas |
| 8 | 4.1 | PVM taikymas (LT, ES atvirkštinis, ne ES); #2685, #2701 | teisininkas + buhalteris |
| 9 | 4.4 | Kas išrašo sąskaitas; i.SAF | savininkas + buhalteris |
| 10 | 5.2 | Metinis mokėjimas | savininkas |
| 11 | 5.3 | Malonės laikotarpis nepavykus mokėjimui (dienos) | savininkas |
| 12 | 5.4 | Plano keitimas: proporcingai ar nuo kito laikotarpio | savininkas |
| 13 | 6.1 | Ar parduodama vartotojams | savininkas + teisininkas |
| 14 | 7.6 | Grąžinimas, kai Pardavėjas nutraukia dėl pažeidimo | savininkas |
| 15 | 8.1 | Tikslūs CK straipsniai; ar tai skaitmeninė paslauga (Dir. 2019/770) | teisininkas |
| 16 | 9.2 | Grąžinimas organizacijoms: (a) / (b) / (c) | savininkas |
| 17 | 11.2 | Gavimo patvirtinimo terminas; organizacijų pretenzijų terminas | savininkas |
| 18 | 11.3 | VVTAT duomenys publikavimo dieną | teisininkas |
| 19 | 11.4 | Kad EGS nuorodos nebereikia | teisininkas |
| 20 | 12.2 | Atsakomybės riba ir netiesioginių nuostolių išimtis | savininkas + teisininkas |
| 21 | 13.1 | Įspėjimo apie pakeitimus terminas (30 d. ar ilgesnis) | savininkas |
| 22 | 14.3 | Kurio kalbos teksto viršenybė | teisininkas |

Po sprendimų: teisininko patvirtinimas → vertimas į visas aktyvias kalbas →
publikavimas atskiru PR kartu su kodo pakeitimais iš kontrolinio sąrašo.
