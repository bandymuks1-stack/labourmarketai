import json,collections,sys
d=json.load(open(sys.argv[1]));rows=d['rows'];G=d['groups']
NOTE={'PASS_CI_ONLY':'automatiniai testai praeina, produkcijoje nepatvirtinta','NOT_VERIFIED':'produkcijoje dar nepatikrinta','BLOCKED':'sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos','FAIL':'rasta klaida, taisoma','NOT_IMPLEMENTED':'dar nesukurta','LIVE_VERIFIED':''}
c=collections.Counter(r['cat'] for r in rows)
o=[]
o.append('# LabourMarket.ai — funkcijų katalogas (LT)\n')
o.append('Parengta 2026-11-12 susitikimui. **Vienintelis šaltinis — [`docs/program/FUNCTION_REGISTER.md`](../../program/FUNCTION_REGISTER.md)** (funkcijų eilutės ir lietuviška „Function map data“ dalis). Šis failas yra registro rodinys, ne antras registras: būsenos neperrašytos ranka, o išvestos iš registro statusų.\n')
o.append('## Kaip skaityti būsenas\n')
o.append('| Būsena | Reikšmė | Iš registro statusų |\n|---|---|---|')
o.append('| **VEIKIA** | realiai pasiekiama ir patvirtinta produkcijoje (produkcijos eisena, savininko ar realaus naudotojo veiksmas, realus naudojimas) | `LIVE_VERIFIED` |')
o.append('| **SUKURTA / TIKRINAMA** | kodas yra, bet produkcijoje nepatvirtinta, laukia sprendimo / paskyros / konfigūracijos arba rasta klaida | `PASS_CI_ONLY`, `NOT_VERIFIED`, `BLOCKED`, `FAIL` |')
o.append('| **PLANUOJAMA** | numatyta, dar nesukurta | `NOT_IMPLEMENTED` |\n')
o.append(f"**Iš viso: {len(rows)} funkcijos** (288 suplanuotos minus 1 papildomas testinis scenarijus 7.4; 2 dublikatai neskaičiuojami). **VEIKIA {c['VEIKIA']}**, **SUKURTA / TIKRINAMA {c['SUKURTA / TIKRINAMA']}**, **PLANUOJAMA {c['PLANUOJAMA']}**.\n")
o.append('Svarbios išlygos:\n')
o.append('- „Veikia“ reiškia, kad funkcija patvirtinta produkcijoje registre nurodytu įrodymu ir data; ji neįrodo kiekvieno funkcijos atvejo. Dauguma produkcijos eisenų vyko automatizuota naršykle su sintetinėmis paskyromis.')
o.append('- Registro naujausi įrašai — iki 2026-11-09. Vėlesni PR (pvz. #3211 įmonės perėmimo kvietimas, #3213 įmonės perėmimo įrankiai, #3209 partnerių registracijos projektas) šiame kataloge **nevertinami kaip veikiantys**, kol registras neatnaujintas.')
o.append('- Kainos: planų puslapis veikia, tačiau kainų sumos šiame dokumente nenurodomos (registre jos privačios), o internetinis apmokėjimas dar neįjungtas (7.5, 7.15).')
o.append('- AI pagalba (LLM) produkte išjungta, kol nepraeis saugumo, teisinis ir funkcinis patikrinimas (10.6–10.10); atranka veikia taisyklėmis (4.5, 4.13).\n')
o.append('## Suvestinė pagal sritį\n')
o.append('| Sritis | Iš viso | VEIKIA | SUKURTA / TIKRINAMA | PLANUOJAMA |\n|---|---|---|---|---|')
for g in sorted(G,key=int):
    rs=[r for r in rows if r['g']==g]
    if not rs: continue
    cc=collections.Counter(r['cat'] for r in rs)
    o.append(f"| {g}. {G[g]} | {len(rs)} | {cc['VEIKIA']} | {cc['SUKURTA / TIKRINAMA']} | {cc['PLANUOJAMA']} |")
o.append('')
for g in sorted(G,key=int):
    rs=[r for r in rows if r['g']==g]
    if not rs: continue
    o.append(f"## {g}. {G[g]}\n")
    o.append('| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |\n|---|---|---|---|---|---|---|---|')
    for r in rs:
        w=r['where'].replace('|','/') or '—'
        o.append(f"| {r['id']} | {r['name']} | {r['what']} | {r['who'] or '—'} | {w} | **{r['cat']}** | {NOTE[r['raw']] or '—'} | `{r['raw']}` · {r['date']} |")
    o.append('')
o.append('## Būsenos, kurių nepavyko patvirtinti\n')
o.append('- Produkcijos svetainė iš šios rengimo aplinkos nebuvo pasiekiama (tinklo politika), todėl būsenos **nepertikrintos gyvai** 2026-11-12 — jos paimtos iš registro.')
o.append('- Funkcijos su statusu `NOT_VERIFIED` ar `PASS_CI_ONLY` (žr. lenteles) — veikimas produkcijoje nepatvirtintas.')
o.append('- Vėlesni nei 2026-11-09 pakeitimai — nevertinti.')
open(sys.argv[2],'w').write('\n'.join(o)+'\n')
