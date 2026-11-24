# E2 — Work Journal input paths: production proof of the CHAT path + the one-core map (2026-09-02)

Bounded identity: the walker (`e2e-walker-…`, a worker who also owns `E2E Walker UAB`). Real Chromium
at 390 px against https://labourmarket.ai. Residue: exactly one journal entry carrying the marker
`E2-chat-1788366581411` (owned by the test identity, covered by gate G-9 cleanup).

## The chat path, step by step (screenshots beside this file, `e2-chat-*.png`)

| # | step | observed |
|---|---|---|
| 1 | `/lt/dashboard` cold load | 8.8 s (a second run; the first was 12.5 s — the cold-load finding from I1 stands) |
| 2 | composer: "Užpildyk darbo žurnalą" → Siųsti | the work-log card opens: date, Objektas, "Ką dirbai (įrašo įrodymas)", **Darbo kontekstas** select, optional photo |
| 3 | context select | options: Darbuotojas / Savininkas / E2E Walker UAB — the walker holds several contexts, so the card REFUSES to save until one is named ("Prieš išsaugant pasirinkite, kuriam"). The first run left it unset and got the honest "Nepavyko išsaugoti. Bandyk dar kartą." — the guard, not a defect |
| 4 | Išsaugoti (1st) | "Patvirtinti įrašą?" — the two-step save; product code never auto-confirms |
| 5 | Išsaugoti (2nd) | saved; the assistant reply carries the recognition-pipeline vocabulary (skills / įgūdžiai) |
| 6 | `/lt/dashboard/journal` | the entry with the marker is listed |

Result: **chat path PRODUCTION_PROVEN** (DRAFT → REVIEW → CONFIRM → SAVE, human-typed evidence, nothing reframed as AI work).

## The one canonical core (code fact, guard-pinned)

Every write path ends in `createJournalEntryCore` (`apps/web/lib/journal/journal-write-core.ts`). Callers on main:
`lib/journal/actions.ts` (the chat card, the forms, the file/photo intake) and `lib/capabilities/registry.ts`
(the MCP / external-assistant capability `journal.create`). `lib/guards/journal-pipeline-canonical.test.ts`
pins that the composer awaits the server pipeline, never writes fake verification, and uses the caller-scoped
client — so the paths below cannot diverge in what they persist.

| path | state | evidence |
|---|---|---|
| chat (this file) | PRODUCTION_PROVEN | above |
| native UI | n/a by design | `/dashboard/journal` has NO composer (chat-first shell, #864); the card above IS the native UI |
| forms | same card | the work-log card is a form rendered inside the conversation |
| files PDF/DOCX | proven earlier (handoff §E2 "proven") | not re-run |
| CSV/XLSX (hours) | PRODUCTION_PROVEN 2026-09-02 | `e3-timesheet-import-prod-proof-2026-09-02.md` |
| API / external assistants (MCP) | PRODUCTION_PROVEN 2026-08-30 | real ChatGPT read + write via `/api/mcp` (chat-first audit train) |
| voice | OWNER_GATE | #740 (gate G-10) |
