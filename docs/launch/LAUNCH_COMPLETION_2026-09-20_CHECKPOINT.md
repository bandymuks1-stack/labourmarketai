# Launch completion pass — CHECKPOINT (paused by owner, 2026-09-20)

Owner command: FINISH THE PRODUCT (verify → classify → fix all GREEN gaps → prove →
name only the genuine RED / external / human gates). This file is the save point of
that pass. It extends `OWNER_RETURN_PACKAGE_2026-09-19_COMPLETION.md` (§P is the last
receipt); nothing here supersedes an owner decision recorded there.

**State at pause:** branch `feat/cc/launch-completion-2026-09-20`, pushed, NO pull
request yet. Base = main = production `49572592` (health ok, dub1). Migration ledger
299 = repo (last `20260920052103`). Nothing was applied to production; no production
row was written; every production probe ran read-only or inside a DO block aborted by
RAISE (zero residue).

## 1. Baseline truth established

| item | value |
|---|---|
| #1751 (Historical Reality visual-first) | **MERGED 2026-09-17 by the owner** (head `aa062f7c` → `85ef5294`), deployed. The command's "last owner-known head fad75ab2 / not authorised to merge" is stale — the owner accepted it as the visual foundation (~40 % of the premium target, redesign deferred; §completion-mode 2026-09-17). |
| #1810 (PL locale activation, owner approval 2026-09-20) | OPEN, auto-merge armed by the owner, **red on `quality` only because the PR-scoped `/jobs` waiver does not name PR 1810** (three waiver-pinned files receive one `pl:` row each). Owner sentence needed — see RED packet W-1. |
| open RED drafts unchanged | #1803 (R-12, waiver number), #1806 (R-6 v9, ratchets must restack to 299 before merge) and the older `needs-human-gate` drafts listed by `gh pr list`. |
| production errors, last 24 h | only 12 statement timeouts on `search_public_vacancy_previews_v1` (RED R-B) and 1 on the vacancy-ingest insert; no other product-path error. |
| production env (names only) | AI runtime + `GEMINI_API_KEY` present; `CRON_SECRET` present (crons live); **`INVITE_EMAIL_*` absent** → invitation / notification e-mail is `not_configured`; the product degrades honestly to copy/share links (EXTERNAL_GATE, not a defect). |
| translate_message runs in `ai_runs` | **0** — the live translation path has never executed in production (no cross-language thread exists yet: 18 messages, 12 `lt`, 6 `NULL`). |

## 2. Shipped on the branch

`515293ef` **multilingual communication** — author-declared "I am writing in" (13
communication languages, remembered per browser), `sendMessage(originalLanguage)`
validated against the communication set; clarification replies stamped; ONE explicit
state per message (`same_language / translated / original_foreign /
unknown_language`) with the reason a foreign original is untranslated
(`declined / failed / rate_limited / not_attempted`); prompt names source and target in
words; thread and inbox no longer render a failed read as empty; inbox preview carries
the language badge; helper copy no longer claims "no automatic translation" (false since
the RED-2 grant) in 11 catalogs; the `language-clarity` guard now pins the truthful
contract.

`df694640` **wave 1** (134 files) — worker Today doors (offers / invitations / unread,
UNKNOWN when a reader fails); five-state work-seeking intent beside the board;
recorded/confirmed hours per engagement on the identity card; failed history/skill
reads render "unavailable"; employer inbox review door and conversation list honest on
failure; invitable roster read scoped + bounded; unmeasured availability = UNKNOWN
capacity; per-person overlap chip on "who is committed where"; allocated · journaled ·
confirmed hours per project (operations centre); client company sees its agencies +
shared requests; practice relationships reach the verifier list; org ledger beside the
reports window; competency signals from imported history → skill SUGGESTIONS (never
verified); imported day/period records on the company person page and the worker's
ledger (beside, never summed); "your imports" list on the history door; journal
calendar names an unreadable org ledger and wears the observed colour; SEO (single-brand
/jobs title, OG+twitter on the answer engine, /questions + categories in the sitemap,
one Organization node with description, legal-page descriptions, /about brand name);
PWA/a11y (dialog focus hook in five modals, three controls labelled, apple-touch-icon,
44 px historical targets, locale number formatting); mobile (universal-link claims
narrowed to real routes, privacy/terms/support + account-deletion door in Settings,
readiness docs corrected).

Local proof at pause: `pnpm -F web typecheck` clean; `pnpm -F web lint` 0 errors
(44 pre-existing warnings); `lib/guards` 929/932 files green — the 3 failures are the
known Windows CRLF working-copy class (`booking-atomic-double-booking`,
`demand-lifecycle-colleague-r15`, both `w/crlf`) and one token class already fixed
(`ink-400`); product gate on the committed diff:
`PRODUCT_GATE_PASS_WITH_SCOPED_TRANSITIONAL_WAIVER` (no waived file touched).
`pnpm -F web build` NOT yet run on this head.

**Wave 2 — VERIFIED on resume (commit `131bb46f`):** chat sentences `accept-offer`
(exactly one proposed offer → its card, the button stays the commitment; one pending
invitation → its card; otherwise the offers list with "which one?") and `write-employer`
(exactly one active interest → the interest card's own contact action → the thread;
none → express interest first; many → pick the card); registry 78 → 79, write-employer
left the blocked set, five-locale parity row added. Copy/locale pass: RU corrupted word
on Today; internal vocabulary out of worker/company surfaces; NL/DE `orgMembers`
translated (ratchet lowered lt 75→72, ru 56→53, nl 279→266, de 222→210); one name per
locale for the professional identity card (LT "Profesinė kortelė", RU
"Профессиональная карточка"), work card kept distinct; RU/LT grammar + ICU plurals;
term drift unified (Prekyvietė, pasirengimas, Užsakovas); internal status rows removed
from public `/vision`; NEW static locale-leak guard
`lib/guards/i18n-key-resolution-static.test.ts` (every literal `t("key")` under app/,
components/, lib/ must resolve in the merged catalog of every active locale; >3,000
keys checked in ~1 s) — it found two real misses (`conversation.chat.offerCapacity.*`),
fixed in the five active catalogs.

Proof on `131bb46f`: typecheck clean; lint 0 errors; `lib/guards` 931/933 files green
(only the CRLF working-copy pair); `lib/conversation` 78 files / 2,668 tests green;
placeholders / i18n-debt / worker-plain-language OK; product gate on the diff
`PASS_WITH_SCOPED_TRANSITIONAL_WAIVER`, 0 new surfaces.

## 3. Audit results that need no further discovery (mark exhausted for this release)

- Multilingual communication: architecture LIVE (send stamp, on-read resolver, egress
  grant, RLS participant-only, source binding). Remaining: **viewer-side preferred
  language for uk/ka readers = RED COMM-1** (below); live provider round-trip = needs one
  real cross-language thread (human walk).
- Journeys: worker / employer / agency LIVE end to end with the register's known RED
  edges (project headcount, project thread, agency deployment visibility, replacement
  linkage, brigade-as-unit, team-enquiry fan-out RPC, learner placement, RPL).
- Calendar: temporal grammar one closed set; period aggregates never on days; booking
  clash → warn → explicit acknowledgement → receipt LIVE; **project assignment clash has
  no pre-write warn / receipt = RED CAL-7 (schema)**.
- Journal / identity / historical: diary not table; one identity builder; no scores;
  post-commit hops now all have readers (wave 1).
- SEO: metadata/JSON-LD/sitemap/robots/llms.txt live; `/jobs/[id]` hreflang+OG is the
  R-12 draft #1803 (waiver number); public claims in `llms.txt` ("live checkout",
  institutions/agencies "describe needs") conflict with the register → owner wording.
- Web/PWA: installable, no offline claim, error boundaries, deep-link return proven;
  nested `<main>` on the jobs pages sits in waived files (RED by process).
- Mobile: IOS_STATUS = READY_FOR_INTERNAL_TEST (simulator), ANDROID_STATUS =
  READY_FOR_INTERNAL_TEST (debug/emulator). Native app = Today / Journal / Profile /
  Settings; jobs, messaging, calendar, Google auth, camera evidence NOT implemented in
  the app; store gates external (`docs/mobile/STORE_RELEASE_READINESS_2026-09-13.md` §1a).
- Notifications: 22 types, every emitter awaited and reachable; `journal_entry_confirmed`
  = #1806 (RED); e-mail channel EXTERNAL (`INVITE_EMAIL_*`); no marketing send exists.
- Privacy: export, deletion request, dispute (org evidence), consent / contact /
  roster-link withdrawals all human-reachable; deletion executor R-7 and EVID-7 subject
  reply are RED drafts as registered.
- Security: CRITICAL 0, HIGH 0; MCP tools call the same cores as the UI, HMAC-bound
  confirms; CSP still Report-Only (GREEN follow-up); no rate limit on `expressInterest`
  / journal write / MCP `tools/call` (GREEN follow-up).

## 4. RED owner packet (one batch; nothing applied)

| # | decision | why RED | smallest change · recommended |
|---|---|---|---|
| **W-1** | "Extend waiver `public-acquisition-route-jobs` to PR 1810 (and 1803)." | waivers are PR-scoped by owner rule; #1810 adds one `pl:` row to each of the three pinned files | add the two numbers to `owner-waivers.mjs` `pullRequests` + the pin in `scoped-owner-waiver.test.ts`; nothing else |
| **R-B** | "Apply R-B: plpgsql `search_public_vacancy_previews_v1`, same signature/ACL/projection, with rollback." | SECDEF body replace = migration-safety rule g | **dry-run proven again 2026-09-20 on production, zero residue:** welder page 617 buffers / 387 ms cold under `anon` (was ~14,878 / 8.3 s > 3 s timeout); md5 of the 20 ids identical to the live function for (welder) / (none) / ('svets') / ('svets'+welder, offset 5); totals 399 / 52,109 / 399 / 393 identical. SQL below. Rollback = the current `LANGUAGE sql` body verbatim (already in `supabase/rollbacks/20260906080000_…down.sql` form). |
| **ARCH-4 v2** | "Apply the active-connection/active-share gate to `list_agency_offered_candidates_for_request_v2`, with rollback." | SECDEF body replace | verified: revoke/unshare withdraw only `offered` rows, so `accepted`/`declined` offers (agency note + worker_id) stay readable by a severed client through v2, which the app prefers over the fixed v1. Same columns; adds the two joins + `c.status='active' and s.status='active'`. Option: keep rows with a `booking_id` visible (the client holds that booking) — say which. SQL below. |
| **COMM-1** | "Add `profiles.communication_locale` (nullable, CHECK ⊆ the 13 communication languages), person-writable, with rollback." | schema | the missing home for the READ side of the P0: a `uk`/`ka` reader has no `/uk` `/ka` route, so the viewer language = route locale today. After apply: one control under Settings (same write path as `profiles.locale`), resolver target = `communication_locale ?? route locale`. SQL below. |
| **CAL-7 (project)** | "Add `p_acknowledge_clash` + a clash receipt to `assign_worker_to_project`, mirroring the booking path." | schema (parameter + receipt row) | today the project path warns AFTER the write and records no override (`lib/projects/actions.ts:37-46`); booking path is the template (`booking_request_events.clash_acknowledged`). |
| **R-6, R-12, R-5, R-7, R-8, R-10, agency deployment stage, replacement linkage, project headcount, project thread, learner placement, team-enquiry fan-out RPC, brigade-as-unit, ka/uk UI routes, `llms.txt` claims, LT tu/jūs register, the one-object-five-words term set, RU reviewed ≠ confirmed wording, x-default → /lt** | unchanged from §O4 / §O7–O10 / the copy audit | — | one sentence each when wanted; none blocks the core commercial loop |

### R-B SQL (drop-in body; header + rollback per repo convention)

```sql
create or replace function public.search_public_vacancy_previews_v1(
  p_query text default null, p_profession_slug text default null,
  p_limit integer default 20, p_offset integer default 0)
returns table(id uuid, title_raw text, profession_slug text, occupation_raw text,
  employment_form text, working_time text, positions integer, compensation_currency text,
  compensation_min numeric, compensation_max numeric, source_language text,
  attribution_code text, published_at timestamp with time zone, total_count bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_needle  text    := nullif(replace(replace(btrim(coalesce(p_query, '')), '%', '\%'), '_', '\_'), '');
  v_pattern text;
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_total   bigint;
begin
  if p_profession_slug is null and v_needle is null then
    select coalesce((select c.active_vacancies from public.public_vacancy_supply_counts c where c.singleton),
      (select count(*) from public.public_vacancies v where v.is_active and (v.expires_at is null or v.expires_at > now())))
      into v_total;
    return query select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
      case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
      v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
      from public.public_vacancies v where v.is_active and (v.expires_at is null or v.expires_at > now())
      order by v.published_at desc nulls last, v.id limit v_limit offset v_offset;
  elsif p_profession_slug is not null and v_needle is null then
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and v.profession_slug = p_profession_slug and (v.expires_at is null or v.expires_at > now());
    return query select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
      case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
      v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
      from public.public_vacancies v where v.is_active and v.profession_slug = p_profession_slug
        and (v.expires_at is null or v.expires_at > now())
      order by v.published_at desc nulls last, v.id limit v_limit offset v_offset;
  elsif p_profession_slug is null then
    v_pattern := '%' || v_needle || '%';
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern;
    return query select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
      case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
      v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
      from public.public_vacancies v where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.occupation_raw ilike v_pattern
      order by v.published_at desc nulls last, v.id limit v_limit offset v_offset;
  else
    v_pattern := '%' || v_needle || '%';
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and v.profession_slug = p_profession_slug
       and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern;
    return query select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
      case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
      v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
      from public.public_vacancies v where v.is_active and v.profession_slug = p_profession_slug
        and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern
      order by v.published_at desc nulls last, v.id limit v_limit offset v_offset;
  end if;
end;
$function$;
```

### ARCH-4 v2 SQL

```sql
create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)
returns table (offer_id uuid, worker_id uuid, agency_name text, note text, offer_status text,
               booking_id uuid, decided_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note,
         o.status, o.booking_id, o.decided_at, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where o.request_id = p_request_id
     and o.status <> 'withdrawn'
     and c.status = 'active' and s.status = 'active'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())
   order by (o.status = 'offered') desc, o.created_at desc
   limit 100;
$$;
-- rollback: the 20260903101000 body verbatim (no joins). Grants unchanged.
```

### COMM-1 SQL

```sql
alter table public.profiles
  add column if not exists communication_locale text
  check (communication_locale is null or communication_locale in
    ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka'));
-- rollback: alter table public.profiles drop column if exists communication_locale;
-- RLS unchanged (profiles_update = id = auth.uid()).
```

## 5. External gates (one packet)

| gate | needed for | owner action |
|---|---|---|
| `INVITE_EMAIL_PROVIDER` / `INVITE_EMAIL_API_KEY` / `INVITE_EMAIL_FROM` on Vercel | invitation + notification e-mail (today: copy/share link, honest) | choose Resend or Postmark, add the three variables |
| Apple Developer Program, Team ID, distribution certificate; `APPLE_TEAM_ID` on Vercel | iOS device build, TestFlight, universal links | owner account |
| Google Play console, upload key, App Signing SHA-256s; `ANDROID_CERT_FINGERPRINTS` on Vercel | Android release, app links | owner account |
| EAS project id / owner | any EAS build (`appVersionSource: remote`) | owner account |
| Store listings, screenshots, Data Safety / App Privacy forms, review test account; app icon + splash art; final privacy/support URLs | store submission | owner |
| Social profile URLs | `Organization.sameAs` | owner (none exist; not invented) |
| A real Georgian/Ukrainian-speaking participant | live proof of the translation round-trip | human walk |
| Polish consent legal text (3 purposes × 7 paragraphs) | PL consent surfaces after #1810 | owner/legal |

## 6. Minimal final human walk (draft, ~12 checks, one sitting, real accounts only)

1. Donatas (worker, `/lt`): Today shows the three doors (or none, honestly) → open one.
2. Board `/dashboard/opportunities`: intent chip present after declaring under Privacy; readiness row unchanged.
3. Identity card on `/dashboard/journal`: hours line per engagement; no "0 h" for an untimed entry.
4. `/dashboard/communication`: write one message in Lithuanian with "Rašau: Lietuvių"; Ramūnas reads it on `/ru` — sees a Russian rendering with "Išversta iš LT" or the original with the explicit "no translation" label (never blank); reply in Russian; Donatas sees Lithuanian.
5. Ramūnas (Nonstop, `/dashboard/company/partners`): invite the real client by e-mail → the platform shows the copy/share link (e-mail not configured) → client accepts (44 px).
6. Client: `/dashboard/company/needs` → real need → share with Nonstop → Nonstop proposes → client accepts → worker consents on Today.
7. Client `/dashboard/company/planning`: the placed worker appears; an overlap shows the conflict chip only when real.
8. Client `/dashboard/projects/<id>/operations`: allocated · journaled · confirmed hours row present (or "no ledger").
9. Worker writes one journal day; client confirms from `/dashboard/inbox`; a failed load says so (never "nothing to review").
10. Company `/dashboard/company/history`: "your imports" lists the committed session; person page shows the imported period record as a band, not days.
11. Phone (375 px): dialogs trap focus and close on Escape; historical week buttons are tappable.
12. `/lt/questions` and one answer: share preview carries the image; `/lt/jobs` title single-branded.

## 7. Resume instructions

1. `git checkout feat/cc/launch-completion-2026-09-20 && git pull`; read the two wave-2
   agent reports in this file's commit message (or re-derive with `git diff df694640`).
2. From `apps/web`: `pnpm -F web typecheck`, `pnpm -F web lint`, `npx vitest run lib/guards`
   (expect only the CRLF class), `pnpm placeholders:check`, `pnpm check:i18n-debt`,
   `BASE_SHA=origin/main PR_NUMBER=0 node .github/scripts/product-gate.mjs` (then
   `git checkout -- PRODUCT_ARCHITECTURE_DIFF.md`), `pnpm -F web build`.
3. Open ONE PR (GREEN, no migration), enable auto-merge, verify `/api/health.build`.
4. RED drafts: separate branches from main, one migration + rollback + guard each
   (R-B, ARCH-4 v2, COMM-1 with its Settings control + resolver change), draft +
   `needs-human-gate`, one approval sentence each in the body.
5. Then the human walk above; record every row with the 7-field format of
   `RAMUNAS_NONSTOP_REAL_WALK_2026-09-20.md`.
