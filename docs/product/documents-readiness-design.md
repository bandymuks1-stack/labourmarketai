# Dokumentai ir Readiness variklis v1 — Design (S3)

> **Statusas:** S3 sprinto dizainas (2026-06-10, branch
> `feat/cc/s3-documents-readiness`). Migracija — TIK DRAFT, NETAIKOMA
> (needs-human-gate; owner + Chat Claude per MCP `apply_migration`).
> UI — low-fidelity už feature flag (`DOCUMENTS_READINESS_ENABLED = false`),
> „bus pakeista TASK 07".
>
> **Tikslas (owner schema §3):** dokumentai = readiness variklis, ne popierių
> lentyna. Sistema žino, kokių dokumentų žmogui trūksta į konkrečią šalį,
> kada jie baigiasi, ir rodo paprastą vaizdą: ką turi / ko trūksta / ką
> daryti toliau. Maitina S4 (trust/visibility) ir S6 (marketplace filtrus).

## 0. Esamų primityvų inventorizacija (PRIVALOMA išvada)

| Primityvas | Kas tai | Sprendimas |
|---|---|---|
| `project_worker_readiness_items` + `upsert_worker_readiness_item` (20260609180000) | PROJEKTO ašis: manager-set checklist (project × worker × item_key), statusai needed/missing/received/checked/…; rašymas tik per gated RPC | **PERPANAUDOJAMA kaip projekto pusės vartotojas.** S3 NEliečia; ateities slice projekto checklist'ą galės auto-pasiūlyti iš worker_documents. `item_key` rekomenduojama standartizuoti į `document_types` slugs (dokumentuota, ne kodas) |
| `project_worker_operational_statuses` | manager-set operacinė worker būsena projekte | nesusiję su dokumentų inventoriumi — neliečiama |
| `register_customer_request_attachment` + `customer_request_attachments` + privatus storage bucket (0029) | failų metaduomenų + default-closed bucket šablonas | **ŠABLONAS:** worker_documents `file_path` rodo į default-closed bucket; v1 — TIK metaduomenys (failo įkėlimo UI — vėlesnis slice; §6 storage minimalizmas) |
| RPC hardening standartas (20260608140000 / 20260609180000) | SECURITY DEFINER + `set search_path = public` + `revoke all from public` + grant execute tik authenticated + REVOKE tiesioginių rašymų | **KOPIJUOJAMAS** naujam `upsert_worker_document` |
| Documents lentelių | nėra (patikrinta migracijose) | kuriamos naujos — žemiau |

**Išvada:** esamas readiness modelis yra PROJEKTO ašies; S3 prideda trūkstamą
WORKER ašį (dokumentų inventorius + šalies reikalavimai). Tai pildo kanoną,
ne stato paralelę: skirtingos ašys, viena kitą maitinančios.

## 1. Modelis (migracijos DRAFT 20260610170000)

- **`document_types`** — slug registras (§10): id, `slug` UNIQUE, category
  (`identity` / `qualification` / `posting`), is_active. Seed (6):
  `cv`, `id_document`, `a1_certificate`, `employment_contract`,
  `posted_worker_package`, `professional_certificate`. Labels — slug→JSON
  (`documents.types.<slug>` visose 10 locale; §2 — jokių name_* stulpelių).
- **`worker_documents`** — worker ašies inventorius: worker_id,
  document_type_slug FK→document_types(slug), `country` char(2) NULL
  (paskirties šalis, pvz. A1 į NL; NULL = bendrinis), status CHECK
  (`missing`,`ready`,`blocked`) — **`expiring` NESAUGOMAS** (§6: išvedama iš
  `valid_until`), valid_from/valid_until, `file_path` NULL (nuoroda į
  default-closed bucket, v1 tik metaduomenys), note, updated_by, timestamps.
  UNIQUE (worker_id, document_type_slug, coalesce(country,'')).
  RLS: SELECT owner/admin (default-closed §4 — darbdaviai NEMATO; matomumas
  marketplace'ui ateis per S4 taisykles, ne per tiesioginį grant).
  Rašymas TIK per RPC.
- **`worker_document_events`** — append-only audit (§3): worker_document_id,
  actor_id, event_type CHECK (`created`,`updated`,`status_changed`),
  before_state/after_state jsonb, created_at server-side. JOKIŲ
  update/delete policies; INSERT tik iš RPC vidaus.
- **`country_document_requirements`** — struktūra 9 launch rinkoms
  (`LT LV EE NL DE DK NO SE PL` + `BE` leidžiamas kaip `future`):
  country, document_type_slug, requirement_level CHECK
  (`required`,`recommended`,`conditional`), condition_note,
  **`source_status` NOT NULL DEFAULT `needs_legal_source`** CHECK
  (`needs_legal_source`,`sourced`,`reviewed`), source_url, is_active.
  **Turinys NESEED'INAMAS** — jokių išgalvotų teisinių faktų; eilutes pildo
  owner/legal kuravimas, kiekviena nešasi source_status žymą. NL Wadi —
  informacinis pavyzdys dizaine, NE duomenų eilutė.
- **RPC `upsert_worker_document`** — SECURITY DEFINER, set search_path,
  owner-scoped (savininkas arba admin), validuoja slug/status/šalį, rašo
  worker_documents + worker_document_events (before/after). Tiesioginiai
  INSERT/UPDATE/DELETE REVOKE'inti.

## 2. Readiness skaičiavimas šaliai X (lib, ne DB)

`apps/web/lib/documents/readiness.ts` (pure + fetch su 42P01 degrade):

- `deriveDocumentStatus(doc, now)`: `blocked` → blocked; `missing` → missing;
  `ready` + valid_until < now → **expired→missing** (pasibaigęs = trūksta);
  `ready` + valid_until < now+30d → `expiring`; kitaip `ready`.
- `computeCountryReadiness(country)`: imami `country_document_requirements`
  (`required` + `conditional`) × worker_documents (šalies arba bendriniai) →
  sąrašai: turima / baigiasi / trūksta / užblokuota + paprastas „kitas
  veiksmas" (pirmas trūkstamas required dokumentas).
- Jei šaliai reikalavimų DAR NĖRA (source_status eilučių 0) — rodoma
  SĄŽININGAI: „šios šalies reikalavimų sąrašas dar nesuvestas" — ne tuščias
  „viskas gerai".

## 3. UI (low-fidelity, flag OFF, „bus pakeista TASK 07")

`/dashboard/documents` — „Mano dokumentai": dokumentų kortelės su statusu ir
galiojimu, šalies selektorius „ko trūksta į [šalis]", kitas veiksmas.
Mobile-first stack. Kol `DOCUMENTS_READINESS_ENABLED = false` — sąžiningas
RUOŠIAMA ekranas (§18 leidžia atvirą roadmap žymą), jokio fake turinio.
Į bottom-nav NEdedama iki flag-flip. Visa copy slug→JSON 10 locale.

## 4. Sąžiningumo riba (privaloma copy taisyklė)

Jokių teisinių garantijų: visur formuluotė „pagal viešai skelbiamus
reikalavimus; galutinį atitikimą tikrina institucijos / teisininkas".
Jokio „compliance verified". Statusai — žmogaus įvestis + datų aritmetika,
ne sistemos verifikacija. Guard pin'ina disclaimerį ir draudžia
garantinę leksiką documents namespace.

## 5. Kas SĄMONINGAI nedaroma (NELEIDŽIAMA + vokas)

Failų turinio skenavimas/AI (M4+); scam-risk/payment (vision only); failų
įkėlimo UI (vėlesnis slice — v1 metaduomenys); šalių reikalavimų TURINYS
(tik struktūra + needs_legal_source žymos); bottom-nav pakeitimai;
project checklist'o migravimas į document_types slugs (rekomendacija
ateičiai, ne šio sprinto kodas).

## 6. Vartų protokolas

1. Owner peržiūri PR → MCP `apply_migration` (1 failas).
2. Owner/legal pildo country_document_requirements (per SQL/admin kuravimą,
   kiekviena eilutė su source_status).
3. Flag-flip slice: `DOCUMENTS_READINESS_ENABLED = true` + bottom-nav/profile
   nuorodos + failų įkėlimo slice atskirai.
4. S4 naudoja readiness išvestis matomumo taisyklėms; S6 — filtrams.
