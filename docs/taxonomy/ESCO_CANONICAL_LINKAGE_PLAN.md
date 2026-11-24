# ESCO Canonical Linkage — join path, mapping dry run, apply plan

> **Status:** DRY RUN — measured 2026-08-30, **zero production writes**.
> Companion artifact: [`esco-mapping-dryrun-2026-08-30.json`](esco-mapping-dryrun-2026-08-30.json)
> (210 rows: 161 skills + 49 professions, every row carrying slug, esco_uri,
> match method, confidence, source and a human-review flag).
> E2E proof: `apps/web/lib/guards/esco-concept-label-e2e.test.ts` (Polish).
> Canonical coverage numbers: [`docs/LANGUAGE_MATRIX.md`](../LANGUAGE_MATRIX.md).

---

## 1. THE JOIN PATH (proven, prod, 2026-08-30)

```
skills.esco_uri      = esco_skills.esco_uri       (text = text)
                        └─ esco_skills.id          = esco_labels.concept_id
                                                     (concept_type = 'skill')

professions.esco_uri = esco_occupations.esco_uri  (text = text)
                        └─ esco_occupations.id     = esco_labels.concept_id
                                                     (concept_type = 'occupation')
```

Measured facts the join rests on:

| fact | measurement |
|---|---|
| `esco_labels` | 1,045,186 rows; 643,375 skill labels over **13,939 concepts**, 401,811 occupation labels over **3,039 concepts**; 28 locales (all 24 EU + ar/is/no/uk; **no `ka`**) |
| `esco_skills.esco_uri` | 13,939 rows, all unique, all `http://data.europa.eu/esco/skill/<uuid>` |
| `esco_occupations.esco_uri` | 3,039 rows, all unique, all `http://data.europa.eu/esco/occupation/<uuid>` |
| orphan labels | 0 (every `concept_id` resolves in its concept table) |
| label types | `preferred` / `alternative` / `hidden` (unique on the 5-col key) |
| external identity check | `skill/504d99c7-…` resolved at the official ESCO API 2026-08-30 → "lay tiles", status `released`, alternatives match ours verbatim |

**⚠ The one trap: the join is strictly TWO-HOP.** Local `esco_skills.id` /
`esco_occupations.id` are freshly generated uuids — they do **NOT** equal the
uuid at the end of the ESCO URI (verified: 13,939/13,939 and 3,039/3,039
differ). Never "optimize" by parsing the URI tail into `concept_id`; always go
through the concept table.

### Identifier compatibility

- `skills.esco_uri` / `professions.esco_uri` are plain nullable `text` with
  **no format CHECK, no uniqueness, no FK** (migration
  `20260610130100_esco_uri_refs.sql`). The corpus side IS constrained
  (`not null unique`). Compatibility is therefore behavioural, not enforced:
  a curated value joins iff it is byte-identical to a corpus URI.
- **Namespaces are distinct** — skill URIs and occupation URIs live in
  separate tables and separate URI paths, and `esco_labels.concept_type`
  keeps the label spaces apart. Nothing today stops a curator writing an
  occupation URI into `skills.esco_uri`; it would silently join to nothing.
  The apply migration (§4) must assert against the corpus tables.
- **Versioning:** the corpus is a point-in-time ESCO v1.2.1 import
  (2026-06-10, `scripts/esco/import-esco.mjs`). No version column exists
  anywhere. ESCO URIs are stable across ESCO releases (concepts are
  deprecated, not re-identified), so curated URIs survive a future re-import;
  the re-import path upserts on `esco_uri`, preserving local ids.

## 2. MAPPING DRY RUN — results

Method: canonical EN + LT display names (`messages/{en,lt}/skill-names.json`,
`professions.json`) plus the slug phrase, matched **verbatim (lowercased)**
against official ESCO labels in the matching locale; plus a mechanical
verb-template tier for skills (`X operator/operation → operate X`,
`X install → install X`). No similarity scoring anywhere. Classification:

- **EXACT** — `en:preferred` AND `lt:preferred` agree on one concept, no other
  concept matches via a preferred label.
- **HIGH_CONFIDENCE** — exactly one concept holds a preferred match (single
  locale or verb-template), or the only match at all is a unique
  alternative label.
- **AMBIGUOUS** — matches exist, no unique preferred winner (incl. the
  hidden-label-only case). Human review required.
- **NO_MATCH** — no official label matches any canonical term. Human review
  (usually: the concept is phrased nominally while ESCO phrases skills as
  verb actions — see §3).

| | EXACT | HIGH_CONFIDENCE | AMBIGUOUS | NO_MATCH |
|---|---|---|---|---|
| **skills (161)** | 4 | 27 | 4 | 126 |
| **professions (49)** | 9 | 27 | 5 | 8 |

- Professions map well: **36 of 49 (73%)** are auto-linkable pending owner
  sign-off. The 5 ambiguous (`cleaner`, `driver`, `event_organizer`,
  `gardener`, `painter`) each match multiple ESCO occupations with no
  preferred-label winner; the 8 no-match are compound roles ESCO splits or
  names differently (`crane_operator`, `drywaller`, `foreman`,
  `general_laborer`, `heavy_equipment_operator`, `rebar_worker`, `recruiter`,
  `safety_specialist`).
- Skills map poorly by name — **by design of ESCO, not by defect of ours**:
  ESCO phrases skills as verb actions ("lay tiles", "operate excavator",
  "plaster surfaces") while our catalogue uses activity nouns ("Tiling",
  "Excavator operator", "Plastering"). 31 of 161 are deterministically
  linkable today; the 126 NO_MATCH rows need a per-concept curation pass
  (ESCO's own search/API, a human picking the concept), NOT a fuzzier
  matcher. The artifact records curated candidate suggestions for 8 of them,
  clearly marked as suggestions.
- Many-to-one is real and allowed: `forklift-operation` and
  `forklift-operator` both resolve to ESCO "operate forklift";
  `blueprint-reading` and `welding-blueprint` both hit "read standard
  blueprints" (flagged for a human decision). `esco_uri` must therefore stay
  **non-unique** on our side.

## 3. WHAT THE E2E PROOF ESTABLISHED (Polish)

`apps/web/lib/guards/esco-concept-label-e2e.test.ts` proves, with the REAL
recognizer and REAL matching engine and no per-language code:

```
"Umiem tynkować powierzchnie…"        → plastering
"Potrafię obsługiwać podnośnik widłowy." → forklift-operation
"Na budowie mogę obsługiwać czerparkę."  → excavator-operator
PL employer need sentence → canonical slugs → computeContextFit = 100%
```

- The labels are official ESCO v1.2.1 PL preferred labels (prod-verified),
  for concepts the artifact maps EXACT/HIGH_CONFIDENCE.
- Negative control: without the data, none of the expressions resolves —
  these phrases are NOT in the shipped PL needle pack.
- The locale was NOT activated; the fixture is injected exactly like the
  seam guard's synthetic language; runtime sources are unchanged.
- Downstream runs on **slugs** end to end — the PR4 invariant (matching never
  depends on `esco_uri` being non-null) is untouched.

## 4. THE APPLY PLAN (not executed — owner gate)

1. **Owner reviews the artifact** — especially the AMBIGUOUS rows and the
   many-to-one pairs. Any correction is an edit to the artifact JSON, which
   stays the single mapping record.
2. **One reviewed migration** writes the EXACT + approved HIGH_CONFIDENCE
   rows into `skills.esco_uri` / `professions.esco_uri`:
   - guarded per row: `update … set esco_uri = <uri> where slug = <slug> and
     esco_uri is null` — never overwrite an existing value;
   - assert every written URI `exists` in `esco_skills` / `esco_occupations`
     (the missing FK, §1, enforced at write time);
   - reversible: rollback = `set esco_uri = null` for exactly the listed
     slugs. Additive, no RLS change → GREEN-class under `migration-safety`,
     but **prod apply stays via Supabase MCP `apply_migration` after owner
     review** per the standing migration policy.
3. **Step-3 label shipping** (separate slice): export per-language
   `ConceptLabelSet` data for the linked concepts from `esco_labels` into
   `lib/structuring/concept-resolution/labels/` — the seam is already built
   for exactly this shape; the E2E guard is the template.
4. **The 126 skill NO_MATCH rows are a curation queue, not a blocker** — each
   later curated row joins the same pipeline with no code change.

**What must NOT be done** (unchanged from LANGUAGE_MATRIX §4.1): no new
hand-written needle packs for languages 13–26; no re-keying of matching onto
ESCO URIs (slug stays the join key); no similarity-based auto-mapping of the
ambiguous rows.
