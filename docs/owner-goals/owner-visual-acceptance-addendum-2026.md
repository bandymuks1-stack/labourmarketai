# OWNER ADDENDUM — privaloma vykdymo politika

> Šis papildymas yra kanoninės specifikacijos dalis ir turi tokią pačią galią
> kaip [`owner-visual-acceptance-audit-2026.md`](owner-visual-acceptance-audit-2026.md).
> Gauta iš savininko 2026-07-29, įrašyta verbatim.

### 1. Tikslas svarbiau už esamą implementaciją

Jeigu dabartinė architektūra neleidžia pilnai įgyvendinti chat-first, premium
UX ar vientisos produkto logikos, leidžiama ją perprojektuoti.

Nedraudžiama:
- keisti komponentų struktūrą;
- perkelti funkcijas;
- jungti puslapius;
- naikinti dubliuojančius ekranus;
- perorganizuoti navigaciją.

Svarbu ne išsaugoti seną struktūrą, o pasiekti kanoninį produkto tikslą.

### 2. Draudžiami laikini pataisymai

Neleidžiama:

- CSS workaround vietoj architektūrinio sprendimo;
- paslėpti neveikiančius elementus vietoj jų sutvarkymo;
- "TODO", "temporary", "placeholder", "vėliau";
- palikti neveikiančius mygtukus production;
- dirbtinai apeiti problemą nepašalinus jos priežasties.

### 3. Chat-first yra absoliutus prioritetas

Prieš kuriant ar taisant bet kurią funkciją privaloma atsakyti:

"Ar tai gali būti atlikta per pokalbį?"

Jeigu atsakymas TAIP: funkcija negali būti kuriama kaip atskiras pilnas CRUD
ekranas, nebent tam yra aiški verslo priežastis.

Pokalbis yra operacinis centras. Visa kita yra jo projekcijos.

### 4. Landing negali meluoti

Landing negali rodyti:

- neegzistuojančių funkcijų;
- kitokio Player Card;
- kitokio žemėlapio;
- kitokios AI logikos;
- kitokios vizualinės kokybės nei realus produktas.

Landing ir produktas turi būti tas pats produktas.

### 5. Premium standartas

Kiekvienas naujas ekranas prieš laikant jį baigtu turi atsakyti į klausimą:

"Ar šis ekranas atrodytų natūraliai tarp geriausių 2026 AI produktų?"

Jeigu atsakymas nėra aiškus TAIP, darbas nelaikomas baigtu.

### 6. Jokio "pakanka"

Negalima taisyti tik konkretaus bugo. Kiekvienas taisymas turi užbaigti visą
komponentą. Pvz. jeigu taisomas Profile menu, turi būti sutvarkyta: overlay;
z-index; keyboard; mobile; focus; escape; click outside; Player Card
pasiekiamumas; Settings; Workspace; visual polish. Ne tik vienas bugas.

### 7. Po kiekvieno etapo

Po kiekvieno P0, P1 ar P2 darbo agentas privalo pats paklausti:

"Kas šiame komponente dar atrodo ne premium?"

Jeigu randa problemų, jas įrašo į AGENT_DISCOVERED_ADDITIONAL_DEFECTS ir
sutvarko nelaukdamas papildomo savininko nurodymo, jei tam nereikia
production approval.

### 8. Galutinis tikslas

Tikslas nėra "praėję testai". Tikslas nėra "green CI". Tikslas nėra
"deploy success".

Tikslas yra: savininkui pirmą kartą atsidarius production atsiranda įspūdis —

"Tai atrodo kaip pilnai išbaigtas 2026 premium AI produktas."

Jeigu toks įspūdis nepasiekiamas,
`OWNER_VISUAL_ACCEPTANCE_2026_PREMIUM_PRODUCTION_VERIFIED` negali būti
naudojamas.
