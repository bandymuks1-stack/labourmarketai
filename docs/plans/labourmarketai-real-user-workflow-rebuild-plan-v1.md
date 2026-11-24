# Real-User Workflow Rebuild — architektūrinis planas v1

**Šaka:** `feat/real-user-workflow-rebuild-v1` · **Auditas:** `docs/audits/labourmarketai-ux-ia-workflow-rebuild-audit-v1.md`
**Santykis su roadmap:** šis planas YRA PR-J (multi-company kontekstas) įgyvendinimas,
praplėstas Time Engine ir chat-centrinės IA konsolidacija. Ne nauja kryptis — sutartos
vizijos (§3–§4, §15–§16) vykdymas.

## Principai (privalomi)

1. **Workspace = tik aktyvus kontekstas**, ne naujas puslapis, ne antras dashboard.
   Įgyvendinamas kaip PLĖTINYS: `lib/company/active-organization.ts` +
   `AuthContext` + `profiles.active_organization_id` pointer'is. Jokio naujo store,
   jokios naujos lentelės (pointer migracija jau parašyta, owner-gated).
2. **Time Engine = kanoninio kalendoriaus plėtra**, ne naujas kalendorius. Nauji
   šaltiniai jungiasi į `PLANNING_SOURCE_TYPES`; konfliktų logika lieka
   `planning-model.ts` grynose funkcijose + DB guard'uose.
3. **Chat plėtra = tik per kanoninę dispatch grandinę.** Jokio naujo vykdymo kelio —
   naudojami jau parašyti (bet nepasiekiami) company/agency vykdikliai.
4. **Akcentinės spalvos — tik indikatoriams** (workspace chip, chat antraštė, CTA,
   kalendoriaus akcentai), per CSS channel tokens `globals.css`, ne per naują paletę.
5. Kiekviena nauja taisyklė — vitest guard tame pačiame PR.

## Bangos (waves)

### W1 — Workspace Context foundation (ši šaka, GREEN)
- `lib/company/active-organization.ts` → PLĖSTI: `getWorkspaceContext()` visoms
  tapatybėms (ne tik company): personal + narystės iš `engagement_contexts`
  (owner/manager/employee) + owned orgs; stabilus akcento indeksas iš org id.
- `app/[locale]/dashboard/layout.tsx` → resolvinti kontekstą visoms rolėms.
- `lib/auth/context.tsx` → workspace laukai (accent, relationship, memberships).
- `conversation-header.tsx` → workspace chip + switcher ŠALIA pokalbio lango
  (ne viršuje, ne atskirame puslapyje); akcento spalva.
- Org žymės mišriuose sąrašuose: žurnalo eilutės, projektų kortelės (pradžia).
- Guard: workspace-context.test.ts (visos tapatybės gauna kontekstą; accent
  deterministinis; owned-orgs filtruoja team/agency žymėmis).

### W2 — Time Engine unifikacija (ši šaka, GREEN + RED draft)
- `planning-model.ts` + `planning.ts` → nauji šaltiniai: `absence`
  (worker_absences approved/requested), `stage` (project_stages valdomiems
  projektams); darbuotojo `assigned` projektų datuotas skaitymas (atrakina jau
  parašytą konfliktų šaką).
- `detectConflicts` → absence×booking, assigned×assigned poros; kalendoriuje ir
  chat'e rodomi konfliktai.
- Chat `calendar-view` intent → realus agenda readback per `getPlanning()`
  (delegacija, ne dublikatas).
- RED draft (owner gate, atskiras follow-up): btree_gist EXCLUDE constraint
  accepted booking'ams; absence↔booking kryžminis guard'as RPC'uose; žurnalo
  `work_date` stulpelio promotion + backfill.
- Kontrakto dokumento atnaujinimas (`canonical-calendar-contract-v1.md` — W6/W7
  šaltiniai nebe „nėra modelio").

### W3 — Chat kaip darbo centras visoms rolėms (ši šaka, GREEN)
- Rolės prop į `ConversationChat`; role-aware starter chips (+ `log-work` chip
  darbuotojui; company chips: poreikis, kandidatai, kas laukia).
- `lib/conversation/company-forms.ts` → inline formos company vykdikliams per
  esamą `InlineActionForm` + `dispatchWorkerAction` (kanoninis dispatch).
- Intent-router plėtra: company intent'ai (LT/EN/RU).
- Workspace kontekstas dispatch grandinėje: `ExecCtx.organizationId` iš aktyvaus
  workspace (fallback — esamas legacy resolve).

### W4 — IA konsolidacija (follow-up šaka)
- Nav simetrija: žurnalas pasiekiamas iš simple shell; kalendorius iš Advanced.
- Negyvų nuorodų valymas (current-space-header → stubai; assistant → REDIRECT_STUB
  klasė; marketplace_hub route).
- Vieno projekto kūrimo kelio konsolidacija; org žymės likusiuose sąrašuose
  (tasks, assets, review queue, žinutės); spine org dimensija.

## Kodėl tai dera su esama architektūra

- Nekuriamas joks naujas modulis, store, lentelė ar route — visi pakeitimai yra
  esamų kanoninių struktūrų plėtiniai (doktrina §2).
- Kalendoriaus guard'as (viena projekcija) ir dispatch guard'ai (no-direct-write,
  canonical-delegation) LIEKA — plėtra praeina pro juos, nes naudoja tuos pačius
  kelius.
- Workspace pointer'is jau suprojektuotas PR-J: mes tik įjungiame frontend'ą su
  sąžiningu degradavimu, kol owner aplikuos migraciją (esamas
  `pointerAvailable=false` kelias išlieka).
