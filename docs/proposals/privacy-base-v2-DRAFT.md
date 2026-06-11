# PASIŪLYMAS (DRAFT) — Doktrinos skyrius „Privatumo bazė (visomis kryptimis)"

> **STATUSAS: LAUKIA OWNER TEKSTO 1:1.** Owner 2026-06-11 nurodė įrašyti šį
> skyrių „tiksliai pagal owner tekstą iš ankstesnės žinutės (6 punktai)" —
> tas tekstas Claude Code sesijai NEPASIEKIAMAS (patikrinta: Downloads,
> docs, Telegram getUpdates). Pagal doktrinos taisyklę („Amendments require
> DI's explicit approval"), skyrius į PLATFORM_DOCTRINE.md NEĮRAŠYTAS be
> originalo. Žemiau — TIK struktūrinis karkasas iš owner komandos fragmentų;
> TAI NĖRA owner tekstas.
>
> **Veiksmas owner'iui:** atsiųsk originalų 6 punktų tekstą (failu į
> Downloads arba per Chat Claude) — jis bus įrašytas 1:1 kaip §20 su
> changelog eilute, o guard'as papildytas teksto pin'ais.

## Kas JAU užrakinta techniškai (be teksto)

Guard `apps/web/lib/guards/privacy-base.test.ts` (CI vykdomas) pina:

1. **Cross-role keliai uždari** — agency pool niekada neskaito
   `worker_documents`; consent agregatų RPC filtruoja pagal sutikimą ir
   grąžina tik skaičius; kandidatinių įgūdžių tikslinimasis lieka
   owner-only manager lentoje.
2. **Imties grindys kryžminiams atlygio agregatams** — pozicijos vidurkis
   tik n>=2 (individo apsauga), small-sample vėliava n<5.
3. **MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS** — bet kuri (dabartinė
   ar būsima) `research_*` lentelė struktūriškai be PII / person-ref
   stulpelių (profile_id, worker_id, email, vardai, telefonas, IP —
   draudžiami pačioje schemoje).
4. **Jokių elgsenos profilio identifikatorių** — behavior/engagement/
   activity score, user profiling, tracking pixel, session replay
   identifikatoriai draudžiami ir kode, ir migracijose.

## Žinomi 6 punktų fragmentai (iš owner komandos; NE pilnas tekstas)

- Privatumas „visomis kryptimis" (cross-role: darbdavys/agentūra/užsakovas/
  platforma ↔ darbuotojas).
- „MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS" — tyrimų sluoksnis
  struktūriškai be PII.
- (likę 4 punktai — laukiama originalo)

## Sąsajos

§4 (default-closed), §19 (Atitikties principas), S12 handoff'o
anti-company-store pasiūlymas (darbdavys NIEKADA nemato pirkimų — žr.
`docs/handoffs/HANDOFF_s12_life_layer.md` suderinimo pastabą).
