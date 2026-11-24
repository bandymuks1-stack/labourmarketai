# LabourMarket.ai — pilnas įgyvendinimo roadmap (PR-J … PR-V)

> Šaltinis: `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` (kanoninė
> vizija, 2026-07-27). Šis planas suskaido LIKUSĮ darbą į nuoseklius,
> nedubliuojančius PR. Jau įgyvendinta bazė (vizijos §18) čia nekartojama.
> Bendros taisyklės kiekvienam PR: doktrina (`docs/PLATFORM_DOCTRINE.md`) —
> kanoninės struktūros plečiamos, ne dubliuojamos; visos migracijos su
> rollback; RED klasė (SECDEF/GRANT/RLS/DML) = draft + `needs-human-gate` +
> owner apply per MCP; jokių fake success; dviejų etapų būsenos modelis
> (accepted → completed); nauji guard testai kiekvienai sąžiningumo taisyklei;
> **niekas nedeklaruojama VERIFIED_E2E be realios DB + naršyklės įrodymo.**

Priklausomybių tvarka (viršuje — pirmiau):

```
PR-J (multi-company kontekstas)  ──┬─→ PR-L (paslaugos) ─→ PR-M (būstas)
PR-K (dokumentų variklis)        ──┤
PR-N (žurnalas → sąskaitos/PDF)  ──┼─→ PR-Q (mokėjimai)
PR-O (kanalai: email ir kt.)     ──┼─→ PR-P (automatizacijos)
PR-R (pokalbio persistencija)    ──┘
PR-S (countries seed) — lygiagretus, blokuoja tik GE/US company-setup
PR-T (pilnas E2E) — po J..S branduolio
PR-U (admin/analytics/observability) — lygiagretus po T pradžios
PR-V (public launch readiness) — paskutinis
```

---

## PR-J — multi-company / multi-activity canonical model

- **Tikslas:** viena paskyra → kelios įmonės/veiklos/prekės ženklai su aiškiu
  AKTYVIU kontekstu pokalbyje ir UI (vizija §3–§4).
- **Exit kriterijai:** vartotojas pokalbiu sukuria antrą įmonę, persijungia
  kontekstą („dirbu kaip UAB X"), visi vėlesni veiksmai (poreikiai, užsakymai,
  žurnalai) rašomi TEISINGAI įmonei; jokio duomenų persiliejimo tarp įmonių
  (RLS testas); kontekstas matomas kiekviename atsakyme.
- **DB:** PLĖSTI `organizations` + `engagement_contexts` (doktrina §5.5) —
  nauja lentelė tik `active_context` nuostatai (user_id → org_id/project_id,
  owner-scoped RLS). Jokio parallel org modelio.
- **API/UI:** konteksto resolver'is dispatch grandinėje; konteksto perjungimo
  intent + chip'ai; konteksto indikatorius chat header'yje.
- **Testai:** RLS izoliacijos + konteksto persijungimo unit/guard; E2E su 2
  įmonėmis. **Migracijos:** additive + rollback; GREEN tikėtina.
- **Owner gate:** tik jei prireiktų RLS/SECDEF keitimų (tada RED draft).
- **Negalima deklaruoti veikiančiu iki E2E:** konteksto persijungimas ir
  izoliacija realioje DB.

## PR-K — document requirements and missing-document engine

- **Tikslas:** vizija §9 — ko trūksta, kas baigia galioti, ko reikia šiam
  darbui/šaliai/įmonei; veiksmų sąrašas.
- **Exit:** pokalbiu „kokių dokumentų man trūksta darbui NL?" → realus
  atsakymas iš `worker_documents` + `country_document_requirements` (jau yra
  0031 bazė — PLĖSTI, ne kurti naują); galiojimo perspėjimai; requirements
  pagal kontekstą (šalis+profesija+įmonė).
- **DB:** plėsti `country_document_requirements` (kontekstų dimensijos),
  `worker_documents.expires_at` indeksai; requirements seed = duomenų DML →
  RED/owner-gated apply.
- **API/UI:** `document-gaps` read model + chat intent + dashboard kortelė.
- **Testai:** gap skaičiavimo unit; sąžiningumo guard (nerodyti „viskas
  tvarkoje" be duomenų); E2E su seed dokumentais.
- **Priklausomybės:** PR-J (įmonės kontekstas dokumentams), PR-S (šalių seed).
- **Negalima deklaruoti:** requirements turinys šaliai, kol seed nepatvirtintas
  savininko (teisinis turinys!).

## PR-L — service marketplace

- **Tikslas:** vizija §7 — pilnas užsakymo ciklas su kaina/terminu/būsena/
  žinutėmis/ginčo logika. PLĖSTI esamą `service_offerings` +
  `service_offering_requests` (W8/PR#525 bazė), ne kurti naują.
- **Exit:** pokalbiu: pasiūlyti paslaugą → rasti teikėją → užsakyti → kaina →
  terminas → būsenų grandinė (requested→quoted→accepted→in_progress→delivered
  →confirmed→closed/disputed) su realiu ID kiekviename žingsnyje.
- **DB:** additive stulpeliai/lentelės ant service_* spine (price, deadline,
  status history, dispute); RLS owner+counterparty.
- **API/UI:** vykdikliai per kanoninį dispatch (`service.*` veiksmai);
  užsakymo kortelė chate ir dashboard'e.
- **Testai:** būsenų mašinos unit; no-fake-success guard; E2E pirkėjas↔teikėjas.
- **Priklausomybės:** PR-J. Mokėjimo žingsnis — stub iki PR-Q (sąžiningai
  „mokėjimas dar nevykdomas per platformą").
- **Negalima deklaruoti:** „apmokėta" — iki PR-Q; ginčų sprendimas be admin UI (PR-U).

## PR-M — housing and accommodation marketplace

- **Tikslas:** vizija §8 — būsto skelbimai, rezervacijos (lova/kambarys/butas),
  susiejimas su projektu/įmone, užimtumas.
- **Exit:** „Surask būstą 6 darbuotojams Roterdame nuo 09-01" → trūkstamų
  kriterijų surinkimas → reali paieška → rezervacijos užklausa su ID; įmonės
  apmokamo būsto priskyrimas darbuotojams.
- **DB:** nauja `housing_listings` + `housing_bookings` domeno šeima (naujas
  domenas — pagrįsta: kanoninio ekvivalento nėra; jungiasi prie organizations/
  projects/profiles FK); RLS default-closed; kainų/užimtumo modelis.
- **API/UI:** `housing.*` vykdikliai; paieškos intent; žemėlapio sluoksnis
  (esamas Leaflet spine).
- **Testai:** užimtumo konfliktų unit; RLS; E2E paieška→rezervacija.
- **Priklausomybės:** PR-J, PR-L (užsakymo šablonas), PR-S (lokacijos).
- **Negalima deklaruoti:** sutartys/mokėjimai iki PR-N/PR-Q; realus inventorius
  be pirmų tiekėjų (empty state sąžiningas).

## PR-N — work ledger → invoice / PDF / acts

- **Tikslas:** vizija §10 — iš žurnalo įrašų generuoti sąskaitas, aktus,
  žiniaraščius; PDF; būsenų grandinė draft→…→paid.
- **Exit:** „Sukurk sąskaitą įmonei X už birželio darbus" → realūs žurnalo
  įrašai → skaičiavimo peržiūra → patvirtinimas → DB įrašas su numeriu → PDF
  parsisiuntimas; aktas ir žiniaraštis iš tų pačių duomenų.
- **DB:** PLĖSTI `finance_records` (yra manual bazė) į `invoices` +
  `invoice_lines` (žurnalo įrašų FK — provenance!); numeracijos seka per įmonę.
- **API/UI:** PDF variklis (server-side, be išorinių SaaS; biblioteka į deps —
  supply-chain peržiūra!); vykdikliai; sąskaitų sąrašas dashboard'e.
- **Testai:** skaičiavimo determinizmo unit (jokių sugalvotų mokesčių — tik
  sukonfigūruotos taisyklės); PDF snapshot; E2E pilnas ciklas.
- **Priklausomybės:** PR-J (įmonės rekvizitai). **Owner gate:** billing zona —
  PR atidaromas draft su `needs-human-gate` (CLAUDE.md RED: billing).
- **Negalima deklaruoti:** „sent/paid" — iki PR-O/PR-Q; mokestinių taisyklių
  teisingumas be savininko patvirtintos konfigūracijos.

## PR-O — messaging and delivery channels

- **Tikslas:** vizija §11 — el. paštas (yra adapteris `lib/email/transactional.ts`
  — PLĖSTI), sistemos pranešimai, outbox su draft/queued/sent/failed.
- **Exit:** pokalbiu paruoštas laiškas → peržiūra (gavėjas/tema/tekstas/priedai/
  siunčianti paskyra) → patvirtinimas → REALUS siuntimas → sent tik po provider
  2xx; nesėkmė matoma kaip failed su priežastimi.
- **DB:** `outbound_messages` outbox lentelė (draft/queued/sent/failed,
  provider_message_id, retry count) — naujas kanoninis siuntimo žurnalas.
- **API/UI:** `message.send` vykdiklis su strong tier patvirtinimu; sąskaitos
  siuntimas iš PR-N.
- **Testai:** state machine unit; „sent tik po 2xx" guard; E2E su sandbox
  provider'iu.
- **Owner gate:** LIVE outreach = RED pagal CLAUDE.md — pirmas realus siuntimas
  tik po savininko įjungimo (provider raktai — savininko veiksmas).
- **Negalima deklaruoti:** SMS/WhatsApp — atskiras etapas; „išsiųsta" be
  provider patvirtinimo.

## PR-P — automation engine

- **Tikslas:** vizija §12 — automatizacijos su ID/grafiku/istorija/pauze.
- **Exit:** pokalbiu sukurta automatizacija („kas savaitę darbo suvestinė") →
  automation ID + kitas vykdymo laikas → realus pirmasis vykdymas → vykdymo
  istorija su rezultatu; pauzė/atnaujinimas veikia.
- **DB:** `automations` + `automation_runs` (owner+org scoped, RLS).
- **Infra:** scheduler — Vercel Cron arba Supabase pg_cron (sprendimas PR'e su
  savininko patvirtinimu; šiandien scheduler'io NĖRA — tai pirmas realus).
- **API/UI:** `automation.*` vykdikliai; sąrašas dashboard'e; kiekvienas run —
  dviejų etapų modelis.
- **Testai:** trigger'io determinizmo unit; idempotency guard (dvigubas run
  nekuria dvigubų veiksmų); E2E bent 1 realiam scenarijui.
- **Priklausomybės:** PR-O (pranešimų kanalas), PR-N (sąskaitų automatizacijos).
- **Negalima deklaruoti:** automatizacija „active" be bent vieno realaus
  įvykdyto run'o įrodymo.

## PR-Q — payments and financial state

- **Tikslas:** vizija §10 — mokėjimų būsenos, Stripe bazė (yra TEST-mode chain
  #844 draft — suderinti, ne dubliuoti).
- **Exit:** sąskaita gauna payment link; apmokėjimas keičia būseną per webhook;
  partially_paid/paid/overdue realios; įmonės balanso suvestinė.
- **DB:** `payments` + webhook events (yra bazė) susiejimas su PR-N invoices.
- **Owner gate:** billing = RED; live raktai — savininko; iki tol TEST mode
  su aiškia žyma.
- **Testai:** webhook idempotency; būsenų unit; E2E TEST mode pilnas ciklas.
- **Negalima deklaruoti:** „live payments" iki savininko raktų ir teisinės
  peržiūros.

## PR-R — full conversation persistence and audit activation

- **Tikslas:** aktyvuoti #883 (assistant transcript) + praplėsti: istorijos
  grupavimas pagal intent/temą, org kontekstas, dvigubų veiksmų prevencija
  (idempotency raktas transcript seq).
- **Exit:** po owner apply — perkrovus puslapį istorija matoma (collapsed UI
  jau LIVE #884); temos grupuojamos; kiekvienas įvykdytas veiksmas turi
  transcript `seq` kaip audit ID; export/erasure RPC veikia.
- **DB:** #883 apply (owner) + additive `assistant_conversations.context_org_id`.
- **Priklausomybės:** #883 owner approve — BLOCKED iki tol.
- **Testai:** hash-chain integrity; RLS izoliacija; E2E reload-continuity.

## PR-S — global seed and country-specific requirements

- **Tikslas:** `countries` lentelės seed visoms ISO šalims (company-setup GE/US
  unblock — žinomas #882 likutis) + šalių dokumentų requirements turinio seed
  pirmoms rinkoms (LT/EU/GE/US).
- **DB:** INSERT seed migracijos = DML → **RED/owner-gated apply**; idempotent
  (on conflict do nothing); rollback su delete pagal sąrašą.
- **Exit:** company-setup leidžia GE/US; dokumentų variklis (PR-K) turi realius
  reikalavimus bent LT+NL+GE+US.
- **Negalima deklaruoti:** requirements teisinis tikslumas be savininko šaltinių
  patvirtinimo.

## PR-T — full production E2E and pilot readiness

- **Tikslas:** užbaigti PR-I matricą (S2-S5, S7) + praplėsti iki vizijos §21
  scenarijų: multi-company, dokumentai, paslauga, būstas, sąskaita, laiškas,
  automatizacija — kiekvienam realus DB/API + naršyklės įrodymas.
- **Exit:** visų pagrindinių grandinių VERIFIED_E2E lentelė su screenshot +
  DB įrodymu; CI'e paleidžiamas smoke subset'as (atskiras workflow, ne quality
  blockeris iš pradžių).
- **Priklausomybės:** J..S branduolys.

## PR-U — admin, analytics and observability

- **Tikslas:** vizija §19.12-14 — admin įrankiai (ginčai, moderavimas, pagalbos
  užklausos), pilotų analitika (yra pilot_events bazė — PLĖSTI), production
  observability (klaidų sekimas, RPC latency, dead-letter peržiūra).
- **Exit:** admin mato užsakymų/ginčų eiles; savininko dashboard su realiais
  pilotų rodikliais; klaidos matomos be log grepinimo.
- **Owner gate:** trečios šalies observability SaaS raktai — savininko
  sprendimas; default — savų lentelių + Vercel/Supabase įrankiai.

## PR-V — public launch readiness

- **Tikslas:** galutinis auditas prieš viešą paleidimą: saugumo perskanavimas
  (I-02 P2 backlog uždarymas), našumo matavimai (LCP/CLS/INP/bundle), teisiniai
  puslapiai, kainodara, incident runbook'ai, backup/restore patikra.
- **Exit:** 0 P0/P1; našumo tikslai pasiekti; savininko GO sprendimas.
- **Priklausomybės:** visi ankstesni.

---

**Šiandien šis roadmap NEVYKDOMAS** — tik įrašytas kaip sutartas planas.
Kiekvieno PR pradžia: perskaityti viziją + doktriną + šį įrašą, patikrinti
kanoninius ekvivalentus, tik tada projektuoti.
