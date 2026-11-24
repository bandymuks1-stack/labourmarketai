# Labourmarket.ai — All spaces review-ready polish v1

## One-paste `/goal` command

```text
/goal Read and execute docs/agent-goals/all-spaces-review-ready-polish-v1.md.

Repo: bandymuks1-stack/labourmarketai.

Start from fresh origin/main after PR #205. Verify main includes:
- PR #199 merge SHA 97a3d4b or later
- PR #200 merge SHA cf9f289 or later
- PR #201 merge SHA 217a7d2 or later
- PR #202 merge SHA f298b22 or later
- PR #203 merge SHA a4b0563 or later
- PR #204 merge SHA 30ff0a5 or later
- PR #205 merge SHA d7b68f8 or later

Create branch:
feat/cc/all-spaces-review-ready-polish-v1

Open a PR only. Do not merge. Do not deploy.

Goal:
Prepare all existing room-based spaces for a real owner/Ramūnas walkthrough. Each existing space must be clear, mobile-readable, role-specific, and free of unrelated visual clutter. This is not a new feature PR. It is a review-readiness polish pass across the existing spaces.

Core rule:
One account can have multiple spaces, but one visible page must feel like one room. Each room must answer:
- Where am I?
- What can I do here?
- What is the main action?
- What belongs here?
- What is intentionally somewhere else?

Hard boundaries:
No DB changes. No migrations. No auth/env/billing/payment/outbound changes. No AI/matching. No new business logic. No fake/demo data. No legal/tax advice. No broad redesign. Open PR only.
```

---

# All spaces review-ready polish v1

## Starting rule

Start from clean `origin/main` after PR #205 (`d7b68f8` or later). Create branch:

```text
feat/cc/all-spaces-review-ready-polish-v1
```

Open PR only. Do not merge, deploy, or apply migrations.

## Product context

The next human step is a real walkthrough with Ramūnas. Before that, all existing spaces must be understandable and usable enough for a non-developer reviewer.

This is review-readiness polish, not a feature expansion.

## Core IA principle

```text
One person.
One account.
Separate rooms/spaces.
One visible page = one current room.
Other rooms are reachable through My spaces, not displayed as visual clutter.
```

The UI must not show the whole house in every room.

## Routes/surfaces to inspect

At minimum inspect and polish existing surfaces:

```text
/[locale]/dashboard
/[locale]/dashboard/account
/[locale]/dashboard/profile
/[locale]/dashboard/buyer
/[locale]/dashboard/company
/[locale]/dashboard/journal
```

Also inspect if present:

```text
/[locale]/dashboard/agency
/[locale]/dashboard/team
/[locale]/dashboard/projects
/[locale]/dashboard/notifications
/[locale]/dashboard/messages
```

If a route does not exist, document it honestly and do not fake it.

## General per-room requirements

For each reviewed route:

1. The header clearly names the room.
2. The purpose sentence is short.
3. There is one obvious primary action if a real action exists.
4. Cards belong to that room only.
5. No unrelated role/company/buyer/profile/agency clutter.
6. Mobile layout is readable.
7. No internal DB/RPC/schema text.
8. No fake/demo data.
9. No unsupported claims.
10. Future or inactive items are secondary and clearly inactive.

## Room expectations

### Dashboard/current active room

`/[locale]/dashboard` must remain the current active room only.

It must not show:
- all-role catalogue;
- generic future-module grid;
- all possible account modes;
- buyer/company/profile/agency mixed content.

It should show:
- current-space header;
- compact switch to `My spaces`;
- room-specific actions/status/progress.

### My spaces / Account room

`/[locale]/dashboard/account` is the only cross-space catalogue/switcher surface.

Organize it as:

1. Current space
2. Available spaces
3. Add/switch space
4. Modules coming later

Required labels:

LT:
```text
Mano erdvės
Dabartinė erdvė
Galimos erdvės
Keisti erdvę
Pridėti erdvę
Vėliau įjungiami moduliai
```

EN:
```text
My spaces
Current space
Available spaces
Switch space
Add space
Modules coming later
```

Future modules must be visually secondary.

### Personal profile room

Allowed focus:
- avatar;
- CV;
- skills;
- work status;
- profile completeness;
- personal contact/profile details if already present.

Do not show buyer/company/agency blocks except compact `My spaces` switch.

Suggested labels:

LT:
```text
Asmeninis profilis
Avataras
CV ir įgūdžiai
Darbo statusas
Profilio pilnumas
```

EN:
```text
Personal profile
Avatar
CV and skills
Work status
Profile completeness
```

### Buyer room

Buyer room is for marketplace requests as a buyer.

Allowed focus:
- create request;
- my requests;
- request status;
- buyer account/contact details only if needed.

Buyer can look for:
- product;
- service;
- specialist;
- master/craftsman;
- contractor;
- supplier;
- team.

Buyer must not look like:
- CV/profile room;
- employer hiring room;
- company workspace;
- agency supply room.

Forbidden buyer generic wording:

LT:
```text
darbuotojo
darbuotojų
pirkti darbuotoją
darbuotojų pirkimas
```

EN:
```text
buy worker
buy employee
worker purchase
employee purchase
```

Use:

LT:
```text
prekės, paslaugos, specialisto, meistro, rangovo, tiekėjo ar komandos
```

EN:
```text
product, service, specialist, master, contractor, supplier, or team
```

### Company workspace

Company workspace is for company work management.

Allowed focus:
- projects;
- teams;
- hiring;
- job requests;
- work context;
- project context create/list if already available.

Do not mix buyer request UI into company hiring.

Suggested labels:

LT:
```text
Įmonės darbo erdvė
Projektai
Komandos
Darbuotojų paieška
Sukurti darbo pasiūlymą
Sukurti projekto kontekstą
```

EN:
```text
Company workspace
Projects
Teams
Hiring
Create job request
Create project context
```

### Company as buyer

If this appears anywhere, keep it clearly separate from employer/company hiring.

Do not fake a dedicated route if it does not exist. If not implemented, document as future work.

Suggested labels:

LT:
```text
Įmonė kaip pirkėjas
Pirkimai įmonės vardu
Prekės, paslaugos, tiekėjai ir rangovai
```

EN:
```text
Company as buyer
Buying on behalf of a company
Products, services, suppliers, and contractors
```

### Agency room

If agency route/components exist, agency must feel like candidate/team supply.

Allowed focus:
- candidate supply;
- team supply;
- offer candidate/team;
- assignments for candidates.

Do not label agency as buyer by default.

Suggested labels:

LT:
```text
Agentūros erdvė
Kandidatų pasiūla
Komandų pasiūla
Siūlyti kandidatą ar komandą
Ieškoti užsakymų kandidatams
```

EN:
```text
Agency space
Candidate supply
Team supply
Offer a candidate or team
Find assignments for candidates
```

### Journal/work room

If journal route is part of current navigation, ensure it feels like a work evidence/work record room.

Allowed focus:
- work journal;
- entries;
- evidence;
- project context if already read-only/linked;
- confirmation/review status if already implemented.

Do not show buyer/agency/company-as-buyer clutter.

## Mobile review checklist

For each inspected room:
- first screen names the room;
- primary action is obvious;
- no cramped button row;
- cards stack cleanly;
- no tiny labels below 10px;
- no overflowing text;
- no long technical paragraphs;
- no table-like layout on narrow screens;
- no unrelated role cards;
- future/inactive modules are not visually primary;
- `My spaces` switch is compact.

## Required guards/tests

Add/update guards so:

1. `/dashboard` does not render all-role catalogue.
2. `/dashboard` does not render generic future-module grid.
3. `/dashboard/account` remains the only cross-space catalogue/switcher surface.
4. Buyer route does not render profile/CV/company/agency blocks by default.
5. Company route does not render buyer request blocks by default.
6. Profile route does not render buyer/company/agency blocks by default except compact switcher.
7. Agency route, if present, does not render buyer/private-person blocks by default.
8. Journal route does not render buyer/agency/company-as-buyer blocks by default.
9. Buyer generic copy does not include worker-purchase wording.
10. No technical DB/RPC/schema text appears in user-facing copy.
11. Current-space header or equivalent room header is present where appropriate.
12. Future modules remain secondary and are not placed back into active `/dashboard`.

Use existing repo guard/test style.

## Review-with-Ramūnas artifact

Create:

```text
docs/owner-reviews/all-spaces-review-ready-polish-v1.md
```

Include:
- route list;
- what each space is supposed to be;
- what changed in each space;
- what is intentionally not shown in each space;
- what remains future work;
- short review checklist for Ramūnas;
- suggested walkthrough order:
  1. Personal profile
  2. Dashboard/current room
  3. My spaces
  4. Buyer
  5. Company
  6. Journal/work
  7. Agency if present
- label: `Provisional owner review before deploy. Final verdict after deploy and live walkthrough.`

Do not generate a large screenshot pack. If screenshots are produced, keep to one minimal compressed contact sheet and keep it gitignored unless explicitly requested.

## Validation

Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- relevant tests/guards and standard repo quality checks
- migration-safety
- `git diff --check`

## Final report format

```text
Final Report — All spaces review-ready polish v1

Identifiers
- PR:
- Branch:
- Head SHA:
- Base main SHA:
- Merge status: OPEN, not merged
- Deploy status: NOT deployed

What changed
- ...

Routes affected
- ...

Per-room readiness
- Dashboard/current room:
- My spaces/account:
- Profile:
- Buyer:
- Company:
- Journal:
- Agency if present:

What was simplified
- ...

What remains future work
- ...

Validation
- typecheck:
- lint:
- build:
- tests/guards:
- migration-safety:
- git diff --check:

Safety proof
- No DB changes:
- No migrations:
- No auth/env/billing/payment/outbound:
- No fake/demo data:
- Cross-space content remains only under /dashboard/account:
- Buyer does not present workers as purchasable:
- Room boundaries preserved:

Owner/Ramūnas review artifact
- Path:

Recommendation
- READY_FOR_OWNER_REVIEW
  OR
- BLOCKED with reason
```

## Definition of done

Done only when:
- PR is open;
- PR is not merged;
- validation is green or blockers are honestly reported;
- review-with-Ramūnas artifact exists;
- every existing reviewed room has clear role/purpose;
- active dashboard remains focused;
- My spaces remains the only cross-space surface;
- buyer/company/profile/journal/agency concepts are not visually mixed;
- no DB/migration/auth/env/billing/payment/outbound changes are introduced.
