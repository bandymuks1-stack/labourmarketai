# Owner visual acceptance audit — 2026-07-29 (agent-derived)

> Savininkas atmetė verdiktą `OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED`.
> Savininko originalus audito failas repo nepasiekė, todėl šis defektų sąrašas
> išvestas per REALIĄ production peržiūrą naršyklėje (labourmarket.ai,
> autentikuota worker sesija, 2026-07-29). Kiekvienas punktas matytas gyvai.

## P0 — funkcionalumas ir overlay

- **P0-1 Pranešimų dropdown po žemėlapiu.** Paspaudus varpelį, „Mano pranešimai"
  popover'is perdengiamas Leaflet žemėlapio (Leaflet pane z-index 400+ >
  popover). Popover tekstas nukirptas.
- **P0-2 Paieškos overlay nepridengia kontekstinės panelės.** Backdrop
  pritemdo viską, išskyrus „Tavo darbas dabar" panelę — ji šviečia virš
  backdrop. Z-index sluoksniavimo klaida.
- **P0-3 Paieška neranda realių duomenų.** Užklausa „plyteles" → „Nieko
  nerasta", nors prieš minutę išsaugotas žurnalo įrašas su plytelėmis ir
  pridėtas įgūdis „Plytelių klojimas".
- **P0-4 Chat žinutė gali dingti be pėdsako.** Pirma pasiųsta žinutė
  („Šiandien klojau plyteles…") dingo: jokio burbulo, jokio atsakymo, jokios
  klaidos. Pakartojus — veikė. Nėra optimistinio užtikrinimo/klaidos būsenos.
- **P0-5 Chat neatsako į klausimą iš savo duomenų.** „Kiek valandų dirbau
  šiandien?" → atsakymas šablonu „Kurią dieną ir kiek laiko dirbai? Parašyk,
  pvz.…" — vietoje atsakymo iš žurnalo (tą dieną yra 14 val. įrašas).
  AI-first pažadas neišpildytas.
- **P0-6 Ilgi pagrindinės gijos užšalimai po navigacijos.** Per auditą
  renderer'is ≥4 kartus buvo užšalęs >30 s (dashboard su žemėlapiu,
  communication). Sutampa su realiu vartotojo skundu pagalbos kanale:
  „daug kas labai lėtai veikia arba neveikia taip kaip turėtų būti".
- **P0-7 Viršutinio tabo paspaudimas kartais nesuveikia.** „Kalendorius"
  paspaudimas liko /dashboard be jokios reakcijos (pakartotinai — veikė).

## P1 — chat-first IA, Player Card, projekcijos

- **P1-1 Žemėlapis rodo Nyderlandus.** LT worker'iui panelės žemėlapis
  centruotas į NL su 1 tašku; „13 be nustatomos vietos". Projekcija
  beprasmė: nei savo rinkos, nei realių galimybių vietų.
- **P1-2 Player Card paslėpta.** Kortelė — sulankstytas „› KORTELĖ"
  akordeonas žurnalo puslapio apačioje. Savininko reikalavimas: premium,
  matoma, realiai veikianti.
- **P1-3 Sveikinimas raw username.** „Labas, sukysdonatas" — el. pašto
  prefiksas vietoje vardo; avataras — atsitiktinė miniatiūra.
- **P1-4 Žurnalas — senas pasaulis.** Mono-caps vidinė nav
  (VIRŠUS/KORTELĖ/ĮRAŠAI/PRIDĖTI ĮRAŠĄ), milžiniška forma, kita dizaino
  kalba nei chat shell. Ne chat-first projekcija.
- **P1-5 Neišverstas enum.** „Darbo kontekstas" dropdown rodo raw
  „employee".
- **P1-6 Dviguba konfirmacija.** „Supratau taip — išsaugoti?" → Išsaugoti →
  „Patvirtinti įrašą?" → Išsaugoti dar kartą.
- **P1-7 Vietos ekstrakcija nepagauna objekto.** „…Kauno objekte" →
  Objektas laukas tuščias.
- **P1-8 Kontekstinė panelė neatsinaujina gyvai.** Po išsaugojimo per chat
  liko „1 įsipareigojimai" (atsinaujino tik perkrovus); taip pat linksnio
  klaida — „1 įsipareigojimai" (turi būti „1 įsipareigojimas").
- **P1-9 Žurnalo įrašo meta triukšmas.** „Vieta: labourmarket.ai" kaip
  vieta; kalendoriuje visas sakinys kaip pavadinimas.

## P2 — landing

- **P2-1 Per ilgas.** 9619 px ≈ 10,7 ekrano, 17 sekcijų.
- **P2-2 Vieno sektoriaus demo.** Hero seka — tik mūrijimas/statybos;
  reikia kelių sektorių scenarijų.
- **P2-3 Vizualika neatitinka produkto vidaus.** Demo langas stilistiškai
  ne tas pats, kas realus chat shell.
- **P2-4 Motion beveik statinis.** Tik hero demo ciklas; sekcijos be
  gyvybės (laikantis reduced-motion).

## Įrodymai

Peržiūros seka ir screenshot'ai — sesijos evidence kataloge
(`docs/audits/evidence/owner-visual-acceptance-2026/`), pildoma fix'ų eigoje.
