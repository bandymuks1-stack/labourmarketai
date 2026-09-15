# Owner dry run — bringing a real workforce and its history in

**Status:** instructions only. **No new importer was built for this, and none
should be.** Everything below describes the importer that already exists in
production code: `lib/organization-people/` (who the people are) and
`lib/organization-evidence/` (what they did). Both already preview before they
write. If a step here does not work, that is a defect in the existing path, not
a reason to build a second one.

Verified against the code on **2026-09-15**.

---

## 0. The one rule

**A file arriving is not a commit.** Both halves parse, match, classify and
*show you* the result; nothing reaches the database until you confirm the exact
preview you were shown (`peopleCommitHashInput` / `peopleReadyFingerprint` bind
the confirmation token to the precise set of people the preview listed, and a
replayed or widened token fails as stale). You can therefore upload a real file
as a dry run and walk away without committing.

---

## 1. Where both importers live

Both panels are on **`/dashboard/company`**, in the organisation whose roster
you are filling:

| Panel | Component | What it takes |
|---|---|---|
| People | `PeopleImportPanel` | a list of *who* — names, optionally your own reference numbers |
| Historical work | `EvidenceImportSection` | a timesheet/journal of *what was done*, per person per date |

Import people **first**. The evidence half matches each row against the roster;
with an empty roster every row comes back unmatched.

---

## 2. Accepted file formats

Identical for both halves — one reader, one format list
(`SUPPORTED_PEOPLE_FILE_EXTENSIONS`, `readEvidenceSourceFile`):

| Extension | Reader |
|---|---|
| `.xlsx`, `.xlsm` | audited workbook reader (magic-byte check, byte cap, cell cap, parse timeout) |
| `.csv`, `.tsv`, `.txt` | delimited reader; the delimiter is detected from the header row (tab › `;` › `,`) |

**Not accepted, deliberately:** `.pdf`, `.doc`, `.docx`, `.pages`, `.numbers`,
scans, photos. A CV read for a name alone would import the person and silently
discard their professional history — that reads to you as "imported" and to
them as erasure. Refusing is the honest answer until that history has somewhere
truthful to land.

**Limits:**

| Limit | Value | Constant |
|---|---|---|
| File size | 5 MB | `PEOPLE_FILE_MAX_BYTES`, `SOURCE_FILE_MAX_BYTES` |
| Rows per submit | 500 | `MAX_ROWS_PER_SUBMIT` |
| Sheets read per workbook | 10 | `MAX_SHEETS` |
| Person name length | 200 characters | `MAX_PERSON_NAME` |

A file over any limit is refused with the limit named. Split it and run twice —
the second run classifies the first run's people as `already_on_roster`, so
nothing doubles.

---

## 3. People file — required columns

The **first non-empty row is the header**. Column *order does not matter*;
column *names* do. Headers are matched case-insensitively with diacritics
stripped, so `Pavardė` and `pavarde` are the same header. An exact header match
always beats a partial one.

### Required — exactly one column naming the person

Any one of:

> `name`, `full name`, `person`, `employee`, `worker`, `candidate`, `student`,
> `vardas`, `pavarde`, `vardas pavarde`, `asmuo`, `darbuotojas`, `kandidatas`,
> `studentas`, `имя`, `фамилия`, `фио`, `сотрудник`, `работник`, `кандидат`,
> `студент`, `naam`, `medewerker`, `kandidaat`, `vorname`, `nachname`,
> `mitarbeiter`, `bewerber`, `person name`

If no column matches, the import stops and **shows you the headers it found**
rather than guessing. It will never fall back to "column 1" — a sheet whose
first column is an employee number would file every person under a number.

### Optional — your own reference number

> `id`, `ref`, `reference`, `employee number`, `employee no`,
> `personnel number`, `tab nr`, `tabelio nr`, `darbuotojo nr`, `kodas`,
> `табельный номер`, `номер`, `код`, `personeelsnummer`, `personalnummer`,
> `mitarbeiternummer`

Worth supplying. Roster uniqueness is expressed as (normalised name + your
reference), so a reference is what keeps two people called the same thing apart
— and what makes a re-run recognise the same person instead of creating a
second one.

### Not a column — the relationship

**The relationship is supplied once, in the panel, for the whole batch. It is
never read from the file and never inferred.** The panel asks it in plain
language and offers six answers — employee, candidate, agency worker, student,
trainee, contractor — with the one that fits your workspace leading. The
thirteen technical slugs behind them (`candidate`, `employee`,
`former_employee`, `agency_worker`, `subcontractor`, `contractor`, `student`,
`graduate`, `trainee`, `apprentice`, `programme_participant`, `volunteer`,
`other`) are what the database stores; you never type one.

**One relationship per file.** If your list mixes employees and subcontractors,
split it and run the importer twice.

### Smallest valid people file

```csv
name,employee no
Jonas Jonaitis,1041
Petras Petraitis,1042
```

---

## 4. Historical work file — required columns

Same header rules. Same synonym folding across LT / EN / PL / DE / NL / RU.

### Required

| Field | Header synonyms (any one) |
|---|---|
| **Person** | `worker`, `employee`, `name`, `person`, `full name`, `surname name`, `darbuotojas`, `vardas`, `pavarde`, `vardas pavarde`, `pavarde vardas`, `asmuo`, `pracownik`, `imie nazwisko`, `mitarbeiter`, `medewerker`, `rabotnik`, `sotrudnik`, `fio` |
| **Date** — either a single date … | `date`, `work date`, `day`, `data`, `diena`, `darbo data`, `datum`, `dag`, `data pracy`, `data raboty` |
| … **or** a period (both ends) | from: `from`, `period start`, `start`, `week start`, `date from`, `nuo`, `pradzia`, `von`, `vanaf`, `od` · to: `to`, `period end`, `end`, `week end`, `date to`, `iki`, `pabaiga`, `bis`, `tot`, `do` |

A row with no person is skipped as `no_person`; a row with no date is skipped as
`no_date`. Skipped rows are **reported back to you with their row numbers** —
they are not silently dropped.

### Optional but strongly recommended

| Field | Header synonyms |
|---|---|
| Hours | `hours`, `hrs`, `h`, `worked hours`, `total hours`, `valandos`, `val`, `darbo valandos`, `isdirbta`, `stunden`, `uren`, `godziny`, `chasy` |
| Site / project | `object`, `site`, `project`, `address`, `location`, `workplace`, `objektas`, `statybvete`, `projektas`, `adresas`, `vieta`, `darbo vieta`, `obiekt`, `baustelle`, `locatie` |
| What was done | `description`, `work`, `works`, `task`, `tasks`, `notes`, `comment`, `activity`, `aprasymas`, `darbai`, `atlikti darbai`, `uzduotis`, `pastabos`, `veikla`, `beschreibung`, `omschrijving`, `opis`, `opisanie` |
| Your reference | `employee no`, `employee number`, `personnel number`, `staff id`, `tab no`, `tabelis`, `tabelio nr`, `darbuotojo nr`, `nr`, `personalnummer`, `personeelsnummer` |

Unrecognised columns are **kept in the raw row**, not discarded. An hours cell
that cannot be read is reported as `unreadable_hours` against its row number
rather than rounded into a number nobody typed.

### Dates

`YYYY-MM-DD` is always safe. A **monthly grid whose month is never stated is
refused** (`month-not-stated`) rather than dated by guess — put the month in the
sheet or add a real date column.

### Smallest valid work file

```csv
darbuotojas,data,valandos,objektas,atlikti darbai
Jonas Jonaitis,2026-03-04,8,Vilnius Žirmūnų g. 12,PERI klojinių montavimas
Jonas Jonaitis,2026-03-05,7.5,Vilnius Žirmūnų g. 12,Betonavimas
```

---

## 5. The dry run itself

1. Open `/dashboard/company` in the right organisation.
2. **People panel** → pick the relationship → attach the people file → submit.
3. Read the preview. Every row comes back in one of five states:
   `new`, `already_on_roster`, `duplicate_in_batch`, `ambiguous` (with the
   candidates it is torn between), `unusable` (empty or over-long name).
4. **To dry-run only: stop here and navigate away. Nothing has been written.**
5. To proceed: resolve every `ambiguous` row, then confirm. The commit re-plans
   against the roster as it is at write time and **refuses while anything is
   unresolved** — so a stale preview cannot create a duplicate person or settle
   an ambiguity on its own.
6. **Historical work panel** → attach the timesheet → submit → same shape:
   parsed rows, skipped rows with reasons, person matches, and a preview you
   confirm or abandon. Re-uploading the same bytes resolves to the same session
   (the source is fingerprinted), so a retry is not a second import.

---

## 6. What to send back after the dry run

Whatever the preview showed, verbatim:

- the header row the importer said it found (especially if it could not find a
  name column);
- the counts per state (`new` / `already_on_roster` / `duplicate_in_batch` /
  `ambiguous` / `unusable`);
- the skipped-row reasons and row numbers from the work file;
- any row where the preview is *wrong about a real person* — that is the only
  class of finding that needs code, and it needs the row, not a description.

A dry run that parses cleanly and previews correctly is the evidence that the
existing importer is enough. A dry run that does not is a defect report against
these two modules — not a brief for a third importer.
