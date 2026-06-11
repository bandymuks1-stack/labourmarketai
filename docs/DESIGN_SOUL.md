# DESIGN_SOUL — labourmarket.ai vizualinė siela

Statusas: PRIVALOMAS visiems UI darbams. Papildo PLATFORM_DOCTRINE.md.
Tikslas: produktas turi jaustis ne kaip mašina, o kaip organiškas, lengvas ir
patikimas įrankis, su kuriuo žmogus aplenkia įprastas sąlygas dešimčia metų.
Tas pojūtis kyla ne iš futuristinės grafikos, o iš pašalintos trinties: kas
anksčiau reikalavo skambučių, popierių ir savaičių, čia įvyksta dviem
paspaudimais ir palieka amžiną įrodymą. UI darbas — leisti žmogui tą
kontrastą pajusti tą akimirką, kai tai įvyksta.

## §1. Vienas kūnas (anatomijos principas)

- Išorė nėra dažai ant vidaus — ji yra vidaus oda. Kiekvienas vizualus
  elementas yra tiesioginė gyvo vidinio duomens išraiška.
- Jei kortelė švyti — viduje realiai įvyko patvirtinimas. Jei nieko
  neįvyko — niekas nešvyti. Sistema nemeluoja dėl anatomijos, ne dėl taisyklės.
- Vienas veiksmas → daug vaisių: vienas žurnalo įrašas + vienas patvirtinimas
  savaime atnaujina įgūdį kortelėje, darbo įrodymą, parengtį, vadovo komandos
  vaizdą. Žmogus padarė vieną judesį — sistema pati sukuria jungtis.
- Netikėtos jungtys džiugina tik kai jos realios (pvz. ESCO grafas: "šis tavo
  patvirtintas įgūdis tinka dar dviem profesijoms"). Staigmena be melo.
- Nulis dubliavimo: niekur niekada nereikia įvesti to paties antrą kartą.
  Dubliuotas veiksmas = architektūros ligos simptomas, ne UI sprendimas.

## §2. Penki testai kiekvienam ekranui

1. 3 SEKUNDŽIŲ TESTAS — atsidaręs ekraną žmogus per 3 s žino, ką gali
   padaryti DABAR ir ką už tai gaus (šiandien / šią savaitę, ne tik po metų).
2. ŽMOGAUS KALBOS TESTAS — nė vieno sisteminio termino. Tekstas skamba kaip
   gero brigadininko žodžiai, ne kaip programos pranešimas.
   Ne "Žurnalo įrašai: 12", o "Šią savaitę tavo darbas patvirtintas 3 kartus".
3. KITO ŽINGSNIO TESTAS — ekranas niekada nesibaigia aklaviete; visada
   matosi vienas natūralus kitas žingsnis, ne dešimt mygtukų.
4. RAMYBĖS TESTAS — niekas nerėkia. Patvirtinti dalykai švyti tyliai.
   Maksimaliai piktogramos ir vaizdai, minimaliai teksto.
5. AUGIMO TESTAS — profilis atrodo kaip auganti gyvybė, ne kaip forma.
   Kiekvienas patvirtintas įrašas vizualiai kažką užaugina.

## §3. Dėmesio ekonomija

- Žmogaus dėmesys — brangiausias resursas. Sistema jį saugo pagal nutylėjimą.
- Išimčių piramidė: rutina teka į bendrą srautą (vienas patvirtinimas
  sąrašui), į paviršių iškyla tik išimtys (naujas įgūdis, neįprastos
  valandos, naujo žmogaus pirmieji įrašai).
- Pasitikėjimas auga organiškai: kuo daugiau patvirtintos istorijos, tuo
  daugiau rutinos teka savaime. Naujokas matomas atidžiau, veteranas laisviau.
- Žmogus visada viršesnis: bet kada gali perjungti į "peržiūriu kiekvieną
  atskirai" — srautui, darbuotojui ar projektui. Sistema niekada neapkrauna,
  bet niekada nedraudžia gilintis.
- Sąžiningumo saugiklis: masinis patvirtinimas lieka tikru liudijimu
  ("patvirtinau ŠITĄ sąrašą") su pilnu audit pėdsaku; išimtys iškeliamos
  PRIEŠ paspaudimą, ne paslepiamos. (Doktrinos §3.)

## §4. Rolės — lęšiai, ne pasauliai

- Person-first: vienas žmogus, viena tapatybė, rolės kaip lęšiai.
  Tas pats žmogus yra ir darbuotojas, ir pirkėjas, ir pardavėjas.
- "Užsakyti darbą" yra veiksmas, ne tapatybė.
- Vadovas mato komandą kaip infrastruktūros žemėlapį: projektai → komandos →
  žmonės → klientai; maks. 2 paspaudimai iki veiksmo; kelių įmonių atveju —
  aiškus org perjungiklis.

## §5. Taikymas

- Kiekvienas UI slice prieš merge patikrinamas prieš §1–§4.
- Final report privalo atsakyti, kaip kiekvienas iš penkių testų praeitas.
- Konfliktas tarp gražumo ir šių principų sprendžiamas principų naudai.
