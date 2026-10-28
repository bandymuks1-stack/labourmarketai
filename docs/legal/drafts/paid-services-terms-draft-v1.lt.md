# Mokamų papildomų paslaugų, atsisakymo ir grąžinimo sąlygos — JUODRAŠTIS v1

> **JUODRAŠTIS SAVININKO IR TEISININKO PERŽIŪRAI. NEPUBLIKUOTI.**
> Svetainėje nerodomas ir į `messages/*.json` neįtrauktas. Paruošta 2026-10-27
> pagal savininko nurodymą (QA matrica 7.28, 7.19). Teisės aktų nuorodos yra
> orientacinės — jas turi patikrinti teisininkas. Skliaustuose `[...]` —
> sprendimai, kuriuos turi priimti savininkas.

## Kodėl reikia

Dabartinės naudojimo sąlygos (`legal.terms`) turi tris skyrius: su kuo
sudaroma sutartis, taikoma teisė, kas platforma yra. Jose nėra nieko apie
mokamas paslaugas, mokėjimą, atnaujinimą, nutraukimą, grąžinimą ir vartotojo
teisę atsisakyti sutarties per 14 dienų, nors mokamas pilotas jau parduodamas.

## 1. Kas nemokama

1.1. Registracija platformoje nemokama darbuotojams ir įmonėms.
1.2. Įmonės nemokamai sukuria organizaciją, skelbia darbo poreikius ir
ieško darbuotojų. Darbuotojai nemokamai pildo Darbo žurnalą ir Gyvą CV.
1.3. Mokamos tik pasirenkamos papildomos funkcijos (2 skyrius). Nemokamos
funkcijos neišjungiamos dėl to, kad mokama paslauga nenupirkta ar pasibaigė.

## 2. Mokamos papildomos paslaugos

2.1. **Piloto leidimas** — vienkartinis mokėjimas `[suma] EUR [su / be] PVM`
už `[N]` dienų. Jis neatsinaujina automatiškai ir nieko daugiau
nenuskaičiuojama. Pasibaigus terminui organizacija grįžta į nemokamą planą.
2.2. **Prenumerata** (`[pvz., 99 EUR / mėn.]`, kol kas nerodoma) — apmokama
iš anksto už kiekvieną laikotarpį ir atsinaujina automatiškai, kol
nenutraukiama. `[Savininkas: ar prenumerata bus siūloma vartotojams, ar tik
įmonėms]`
2.3. Pardavėjas yra UAB „Nonstop Group“: jis išrašo sąskaitas ir gauna
mokėjimus. Mokėjimus apdoroja Stripe. Kortelės duomenų platforma nesaugo.
2.4. Kaina rodoma prieš apmokėjimą kartu su PVM informacija ir trukme.

## 3. Nutraukimas

3.1. Prenumeratą galima nutraukti bet kada paskyros atsiskaitymo skiltyje
(Stripe portale). Nutraukimas įsigalioja apmokėto laikotarpio pabaigoje, o
iki tol funkcijos lieka veikti.
3.2. Vienkartinio piloto leidimo nutraukti nereikia — jis baigiasi savaime.

## 4. Vartotojo teisė atsisakyti sutarties per 14 dienų

> Taikoma tik **vartotojams** (fiziniams asmenims, perkantiems ne verslo
> tikslais). Įmonėms (B2B) ši teisė pagal įstatymą netaikoma, nebent
> savininkas nuspręstų ją suteikti savanoriškai: `[taip / ne]`.

4.1. Vartotojas gali atsisakyti nuotoliniu būdu sudarytos paslaugų sutarties
per 14 dienų nuo jos sudarymo, nenurodydamas priežasties (Direktyva
2011/83/ES, 9 str.; LR civilinio kodekso nuostatos dėl nuotolinių sutarčių —
`[teisininkui patikslinti straipsnius]`).
4.2. Jei vartotojas aiškiai paprašo, kad paslauga būtų pradėta teikti
anksčiau nei baigiasi 14 dienų terminas, o vėliau sutarties atsisako, jis
sumoka proporcingą sumą už jau suteiktą paslaugos dalį (Direktyva
2011/83/ES, 14 str. 3 d.).
4.3. Jei paslauga per atsisakymo terminą suteikta visa, vartotojas teisę
atsisakyti praranda tik tada, kai prieš tai aiškiai sutiko ir patvirtino, kad
žino apie šios teisės praradimą (Direktyva 2011/83/ES, 16 str. a p.).
4.4. Kaip atsisakyti: parašyti `[el. paštas]` arba užpildyti pavyzdinę
atsisakymo formą `[pridėti]`. Grąžinama ta pačia mokėjimo priemone per 14
dienų nuo pranešimo gavimo.

**Ką turi pakeisti produktas (nepublikuoti, kol nepatvirtinta):**
- prieš apmokėjimą parodyti atsisakymo teisės informaciją;
- vartotojui — atskiras pažymimas langelis „Prašau pradėti teikti paslaugą
  iš karto ir suprantu, kad atsisakius sumokėsiu už suteiktą dalį“;
- patvirtinimą ir sąlygas atsiųsti el. paštu (reikalingas veikiantis SMTP).

## 5. Grąžinimai

5.1. Vartotojams — pagal 4 skyrių.
5.2. Įmonėms `[savininko sprendimas, pvz.: per 14 dienų nuo pirmo apmokėjimo,
jei mokama funkcija dar nebuvo naudota — visa suma; kitais atvejais
negrąžinama]`.
5.3. Nepagrįstai ar dvigubai nuskaičiuota suma grąžinama visada.
5.4. Ginčas dėl mokėjimo (chargeback) nagrinėjamas per Stripe. Iki
išsprendimo mokama funkcija gali būti sustabdyta, bet nemokamos funkcijos
ir duomenys lieka prieinami.

## 6. Pretenzijos

6.1. Pretenzijos — `[el. paštas]`, atsakoma per `[14]` dienų.
6.2. Vartotojas taip pat gali kreiptis į Valstybinę vartotojų teisių
apsaugos tarnybą (vvtat.lt) dėl ginčo neteisminio sprendimo.
`[Teisininkui: ES EGS platforma nebeveikia — patikrinti, ar nuorodos nereikia]`

## 7. Kas pašalinama iš viešų puslapių

- Frazė, kad teisinė informacija „rengiama“, kai mokamas pilotas jau
  parduodamas (QA 7.28).

## Savininko sprendimai prieš publikavimą

1. Ar mokamos paslaugos bus parduodamos vartotojams (darbuotojams), ar tik
   įmonėms.
2. Grąžinimo politika įmonėms (5.2).
3. Kontaktinis el. paštas atsisakymui ir pretenzijoms.
4. Piloto leidimo ir prenumeratos kainos su PVM (susiję su RED #2685 Stripe Tax).
5. Teisininko patvirtinimas, tada vertimas į visas aktyvias kalbas ir
   publikavimas per atskirą PR.
