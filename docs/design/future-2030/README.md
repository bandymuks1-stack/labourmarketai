# LabourMarket.ai — Future Experience 2030 (trys koncepcijos)

**Statusas: SAVININKO VIZUALINIS SPRENDIMAS — laukia pasirinkimo (A / B / C / derinys / atmesti).**
Niekas čia neliečia produkcijos: jokių maršrutų, tokenų, `components/*`, D1–D7 ar M2–M4 failų,
jokių i18n raktų. Savarankiški HTML prototipai (`file://`) + ekrano nuotraukos. Po savininko
pasirinkimo — atskira, evoliucinė integravimo programa (žr. `index.html` § Integravimo programa).

Pradėk nuo **`index.html`** — palyginimas, rekomendacija, integravimo eilė, ko reikia iš savininko.

| Failas | Kryptis | Telefonas | Kompiuteris | Living CV / projektas |
|---|---|---|---|---|
| `a-future-command.html` | A · darbo valdymo centras | laiko linija „dabar", vienas veiksmas, kamera → pasekmių pėdsakas | projektai · pokalbis su struktūruotu atsakymu · pasekmių žurnalas | profesinė telemetrija |
| `b-career-universe.html` | B · karjera kaip transporto žemėlapis | vertikalus žemėlapis: ateitis ↑, „Tu esi čia", praeitis ↓ | horizontalus žemėlapis + stotelės skydelis | projekto stotelės planas |
| `c-team-performance.html` | C · komanda prieš tikslą | savaitės tikslas, atkarpos, asmeninis rekordas, sudėtis | komandos arena: trasa, sudėtis, tikslai, pagalba, AI | „Mano sezonas" |

Bendros taisyklės visose trijose: jokių reitingų / žvaigždučių / žmogaus vertės balų; FACT ≠ DERIVED ≠
FORECAST (SEP-1); UNKNOWN ≠ ZERO (SEP-7); žalia = antros šalies patvirtinimas, auksas = veiksmas /
laukimas; vienas auksinis veiksmas ekrane; pokalbis visada pasiekiamas (sprendimas 0017); jokio naujo
backend ir priklausomybių. Visi vardai, valandos ir galimybės — iliustraciniai (vienas išgalvotas
žmogus visose kryptyse palyginimui).

Ekrano nuotraukos: `screenshots/`. Harness: `node ../../docs/design/future-2030/shoot.mjs` iš `apps/web`
(arba bet kur, kur pasiekiamas `playwright-core`; `PW_CHROME=<chrome.exe>` jei naršyklė neįdiegta).
