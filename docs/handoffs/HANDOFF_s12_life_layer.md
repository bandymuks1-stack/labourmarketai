# HANDOFF — S12: Gyvenimo sluoksnis (Worker Life Layer v1)

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s12-life-layer`
**Tier:** kodas/docs GREEN; DB = DRAFT iki vartų; partnerių registracijos/raktai = owner-gated (secrets). Vokas galioja; §4, §7, §19, DESIGN_SOUL privalomi.
**Vieta programoje:** S12, po S11 booking. Owner strategija 2026-06-11: gigantų paslaugos atvedamos PAS darbuotoją per affiliate modelį; savos sistemos tik ten, kur partneriai nišos nedengia.

## GALUTINIS TIKSLAS
Darbuotojo command center tampa gyvenimo palydovu kelionėje dėl darbo: **būstas** prie naujos aikštelės, **kelionė** į darbą ir namo, **pirkiniai** (maistas, dovanos šeimai, šventės), **atostogų paketai** ir **dovanų kuponai** artimiesiems — viskas kontekstiškai, tuo momentu, kai realiai reikia (gavai darbą NL → būstas + transportas; artėja Kalėdos → dovanos namo; penktadienis → maistas į būstą). Pirkimai vyksta PAS partnerius (affiliate deep-links), platforma gauna bonusą — darbuotojui niekada nė cento brangiau.

## DOKTRINOS PASIŪLYMAS (owner patvirtinimui — į PR aprašymą, doktrinos failo NEKEISTI be owner)
**„Gyvenimo sluoksnio principai (anti-company-store)":**
1. Darbdavys, agentūra ir užsakovas NIEKADA nemato darbuotojo pirkimų, užsakymų ar jų istorijos — jokia forma, jokiu agregatu.
2. Jokių kreditų, skolų, „pirk dabar mokėk vėliau" ir jokios integracijos su алga ar išskaitymais. Pirkimas niekada nesusiejamas su darbo santykiu.
3. Visi pasiūlymai — opt-in, su aiškia „Partnerio pasiūlymas" žyma ir atviru paaiškinimu, kad platforma gauna bonusą.
4. Kaina per platformą niekada ne blogesnė nei einant pas partnerį tiesiai. Jokių dark patterns, jokio spaudimo, jokių „limited time" manipuliacijų.
5. Konteksto duomenys pasiūlymams (priskyrimo šalis, datos) naudojami tik su darbuotojo sutikimu (§4); išjungus — sluoksnis tiesiog tylus, be bausmių.

## ŽINGSNIS 0 — standartiniai šaltiniai + esamų primityvų patikra (assignments su šalim/datom kaip konteksto varikliai; S9 „kito veiksmo" variklis kaip pasiūlymų vieta; consent šablonai iš S6).

## SCOPE — ETAPAS A (šis sprintas)
1. **Partnerių karkasas (DRAFT + gate):** partnerių registras (pavadinimas, kategorija: housing/travel/shopping/gifts/groceries, affiliate link šablonas, bonus modelio pastaba, regionai, is_active), pasiūlymų taisyklės (kategorija × konteksto trigeris), darbuotojo life-consent jungiklis (default OFF), click-through audit (be pirkimo turinio — tik kad nuoroda atidaryta, bonusų apskaitai). JOKIŲ partnerio API raktų šiame sprinte — tik link šablonai; raktai = owner-gated vėliau.
2. **Būstas pirmiausia (didžiausias skausmas):** (a) partnerių deep-links (long-stay paieška prie priskyrimo vietos su datom iš booking/assignment) — kontekstinis, vienas paspaudimas iki partnerio; (b) **sava niša — „crew housing" skelbimai (DRAFT + gate):** darbdavių/agentūrų siūlomas būstas prie objektų (kaina, vietos, laikotarpis, nuotrauka vėliau) — tai, ko Airbnb nedengia; default-closed, matoma tik susijusiems darbuotojams, jokio mokėjimo per platformą v1 (kontaktas + žyma).
3. **UI — „Gyvenimas" sekcija command center:** kontekstinės kortelės pagal trigerius (nauja šalis → būstas+kelionė; artėjančios šventės pagal šalies kalendorių → dovanos; savaitės ritmas → maistas), TASK 07 estetika, kiekviena kortelė su „Partnerio pasiūlymas" žyma, consent-off = sekcijos nėra.
4. **Doktrinos pasiūlymo tekstas + guard'as:** life-layer-honesty testas — partnerio žyma privaloma, darbdavio kelias prie pirkimų duomenų neegzistuoja, consent default OFF.

## ETAPAS B (kitas sprintas, tik dizainas dabar): kelionių paketai namo/atostogos, dovanų kuponai, maisto pristatymas — per tą patį karkasą; gilesnės partnerystės (API, ne tik links) — owner sprendimai.

## NELEIDŽIAMA — standartai + vokas, plius: visi 5 anti-company-store punktai; jokių partnerio raktų/secrets; jokio mokėjimo per platformą; jokio darbuotojų pirkimo duomenų eksponavimo bet kam; „crew housing" niekada neprivalomas (susiejimas su darbo pasiūlymu kaip sąlyga — draudžiamas).

## VALIDACIJA — standartinė + life-layer-honesty guard + consent-off smoke.

## FINAL REPORT — standartinė forma + draft'ų sąrašas review failui, partnerių registro pradinis sąrašas (kategorijos, be sutarčių), kas Etape B, doktrinos pasiūlymo tekstas owner'iui.

---

## SUDERINIMAS su Privatumo baze v2 (pridėta 2026-06-11, Claude Code)

S12 doktrinos pasiūlymo 1 ir 5 punktai (darbdavys/agentūra/užsakovas NIEKADA
nemato pirkimų; konteksto duomenys tik su sutikimu, default OFF) yra tos
pačios būsimos doktrinos „Privatumo bazė (visomis kryptimis)" sekcijos
atvejai. Techninė bazė jau užrakinta `lib/guards/privacy-base.test.ts`
(cross-role keliai, n imties grindys, research_* be PII, elgsenos profilių
draudimas); S12 life-layer guard'as, kai bus statomas, privalo papildyti tą
patį guard'ą pirkimų-kelio draudimu. Doktrinos teksto 1:1 įrašymas laukia
owner originalo — žr. docs/proposals/privacy-base-v2-DRAFT.md.
