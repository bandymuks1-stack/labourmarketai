# Controlled real-user pilot readiness checklist

The owner-driven manual smoke that gates inviting 2–5 trusted real users to `app.labourmarket.ai`. **Do not** treat green here as a public-launch signal — it's a controlled pilot only.

Run this on **production** (`https://app.labourmarket.ai`) with the **superadmin Google account** (`sukysdonatas@gmail.com` once the grant is applied). Each item maps to a Work Package in the sprint goal.

## 0. Superadmin grant (run once before the pilot starts)

The server-side superadmin role is already wired (`lib/auth/superadmin.ts`, RLS via `is_admin()`). The grant itself must be applied separately, in a controlled way:

```bash
cd C:\Users\Mano\Documents\labourmarketai\apps\web

# Step 1 — dry-run (zero writes, prints the audit line that WOULD result)
pnpm admin:grant-superadmin --email sukysdonatas@gmail.com --dry-run

# Step 2 — apply (REQUIRES both flags; either alone is rejected)
pnpm admin:grant-superadmin --email sukysdonatas@gmail.com --apply --i-understand-this-mutates-production
```

**Heads-up:** this Supabase project uses an explicit-grants pattern (no Supabase defaults — see migration 0004 / 0010 headers). The dry-run on prod reports
`"details":"permission denied for table profiles"` because `service_role` has not been granted explicit access to `public.profiles`. If this happens, run **once** in Supabase Dashboard → SQL Editor (read-only safe check first):

```sql
-- Verify which roles have privileges on public.profiles
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles'
order by grantee, privilege_type;
```

If `service_role` is missing, grant the minimum it needs to perform a controlled admin promotion:

```sql
grant select, update on public.profiles to service_role;
```

This is the standard fix in the explicit-grants pattern. After granting, re-run the dry-run; it should now report `dry-run.would-grant`. Then run `--apply --i-understand-this-mutates-production`. The owner is free to defer this and verify the rest of the pilot panel works for any user with `active_role='admin'` set by other means.

Verify with a read-only SQL query:

```sql
select email, active_role from public.profiles
where email = 'sukysdonatas@gmail.com';
-- expected: active_role = 'admin'
```

If `active_role` is anything but `admin`, the rest of this checklist won't work — admins use the same `is_admin()` RLS helper for SELECTs on the pilot panel.

## 1. Auth (Work Package F)

- [ ] `/lt/auth/login` Google sign-in completes without `?error=exchange_failed`. If it fails once, retry — the prior audit documented this as an intermittent PKCE cookie race that retry self-heals.
- [ ] After login, owner lands on `/lt/dashboard` (worker view) without a manual second click.
- [ ] Logout button on the account page clears the session.

## 2. Profile text save (Work Package F)

- [ ] Open `/lt/dashboard/profile`. Header reads `Mano gebėjimai`, subtitle reminds the user that category is context, not a limit.
- [ ] Type any narrative. Click `Pasiūlykite struktūrą`. The composer's `✓ Jūsų tekstas išsaugotas · Tai jūsų pačių teiginys — dar ne išorinis patvirtinimas` indicator appears.
- [ ] Reload the page. The narrative is still in the textarea (server-rendered).

## 3. Idea-based extraction (Work Package B)

Use the broad anchor narrative or your own equivalent:

```
Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti
lietuviškos virtuvės patiekalus. taip pat moku drožti iš medžio,
bei dirbti su word, excel ir pdf dokumentais rivilė aplinkoje ir
galiu koordinuoti komanda bei ieškoti naujų žmonių ir darbuotojų.
Turiu teisinės patirties, ruošiu sutartis ir teisinius dokumentus.
Galiu vairuoti lengvąjį automobilį, taip pat užsiimu santechnikos
montavimu ir dirbu pardavėju.
```

- [ ] Counter `Sistema rado · N` is at least **15** when the narrative covers ≥10 distinct domains.
- [ ] Parent chips visible: Maisto gamyba, Medienos apdirbimas, Dokumentų tvarkymas, Apskaitos sistemos, Santechnika, Vairavimas, Programavimas, Namų statyba, Stogų dengimas.
- [ ] Specialization chips visible **alongside** their parents: Lietuviškos virtuvės gamyba, Drožyba, Word dokumentai, Excel / Skaičiuoklės, PDF dokumentai, Rivilė, Santechnikos montavimas, Lengvojo automobilio vairavimas.
- [ ] New-domain chips visible: Komandos koordinavimas, Darbuotojų paieška, Pardavimai, Sutarčių ruošimas.
- [ ] No `Patvirtinta` / `Patvirtinti` / `Confirmed` / `Verified` badge on any of these chips — only `Pasirinkti` / `Pasirinkta` / `Išsaugota` / `Jau išsaugota`.

## 4. Save + reload (Work Package E)

- [ ] Click `Pasirinkti` on 3+ pending chips. Bottom button activates as `Įtraukti pasirinktus pasiūlymus`.
- [ ] Click the bottom button. Toast reads `✓ Įgūdžiai išsaugoti į Mano gebėjimai`.
- [ ] Confirmed chips switch from `Pasirinkta` → `Išsaugota` badge.
- [ ] Scroll down: the `Įgūdžiai ir patirtis` card now lists the new chips (router.refresh propagates).
- [ ] Reload the page. The chips persist in the unified surface.

## 5. Edit / back-to-text flow (Work Package C)

- [ ] Click the prominent blue `← Grįžti prie teksto` button.
- [ ] Textarea reappears with the last saved text intact.
- [ ] Edit the text (add a new capability mention).
- [ ] Click `Pasiūlykite struktūrą` again. The new chip from the edit appears as `Pasirinkti`-actionable.
- [ ] Already-saved chips render with `Jau išsaugota` badge in the same bucket (no duplicates).

## 6. Manual add / remove (Work Package D)

- [ ] Above the saved chips, type a label the extractor missed (e.g. `Anglų kalba`) into the `Pridėti įgūdį rankiniu būdu` input.
- [ ] Click `Pridėti`. New chip appears below.
- [ ] Reload. The manual chip persists.
- [ ] Re-add the same label. It does NOT create a duplicate (UNIQUE constraint at the DB layer).
- [ ] Click the `×` on a saved chip. It disappears immediately and on reload.

## 7. Save-state clarity (Work Package E)

- [ ] After saving everything actionable, click `Iš naujo pasiūlyti pagal tekstą`.
- [ ] All chips now carry `Jau išsaugota` badge.
- [ ] Empty-state copy `Naujų pasiūlymų neradome. Jau išsaugoti gebėjimai rodomi žemiau.` is visible.
- [ ] The bottom `Įtraukti pasirinktus pasiūlymus` Save button is **hidden** entirely.

## 8. Privacy + honest status (Work Package F)

- [ ] Saved chips card carries the explicit status row `PATIES NURODYTA · NEPATVIRTINTA IŠORIŠKAI · ŠALTINIS: PROFILIO TEKSTAS`.
- [ ] Below: disclaimer `Šie įgūdžiai paimti iš jūsų pačių aprašymo. Jie dar nėra patvirtinti darbų žurnalu, dokumentais ar kito žmogaus patvirtinimu — bet jie yra jūsų bendros gebėjimų savybės dalis.`
- [ ] No chip anywhere reads `Patvirtinta` / `Confirmed` / `Verified`.

## 9. Superadmin panel (Work Package A)

- [ ] Open `/lt/dashboard/admin` as the granted superadmin. Page renders with the `PILOTO VALDYMAS` eyebrow.
- [ ] Metrics show total profile + claim counts.
- [ ] Recent profiles list 10 rows, emails masked (`jo***@example.com` style).
- [ ] Click `Tikrinti →` on any row. Per-user inspect page shows that user's profile text + saved claims.
- [ ] No mutation surface on these pages (PR scope is read-only inspection).

## 10. Non-admin block (Work Package A)

- [ ] Sign out, sign in as a non-admin Google account (or use the prior-tested account before granting).
- [ ] Navigate to `/lt/dashboard/admin`. The route redirects to `/lt/dashboard` immediately. No flash of admin content. (Server-side redirect via `requireSuperadmin`.)
- [ ] Same for `/lt/dashboard/admin/users/<any-id>` — redirects without rendering.

## 11. Mobile usability (Work Package D7)

- [ ] On a phone-size viewport, the composer is reachable without horizontal scroll.
- [ ] The chip grid wraps cleanly; chips remain tappable (≥ 44 px hit area).
- [ ] The bottom Save button does not sit under the mobile nav bar.

## 12. LT copy understandable (Work Package F)

- [ ] Pilot user reads the disclaimer + status row and understands they are self-declared, not verified.
- [ ] `Naujų pasiūlymų neradome` empty state explains the situation without feeling like an error.
- [ ] The page title `Mano gebėjimai` + subtitle communicates the platform's non-locking-into-one-category posture.

---

## Verification matrix (auto-checked by the existing test suite)

These don't need manual verification — the test suite enforces them:

| Invariant | Test |
|---|---|
| Server-side superadmin gate | `lib/guards/superadmin.test.ts` |
| Grant script defaults to dry-run | same |
| Grant script requires both flags to mutate | same |
| Grant script never logs the service-role key | same |
| Admin pages don't bypass RLS via service-role | same |
| Manual-add uses the same `saveProfileSkillClaimsAction` path | same |
| No `workers.bio` write from this surface | same |
| No fake `Patvirtinta`/`Verified` in `admin.*` i18n | same |
| Broad extraction covers ≥15 chips on the anchor narrative | `lib/profile/skill-claim-extractor.test.ts` |
| LT cuisine specialization fires alongside the parent | same |
| Word / Excel / PDF / Rivilė / drožyba / lengvasis automobilis / sales / contracts each have an anchor | same |
| Back-to-text reset (`applied` + `error`) | `lib/guards/profile-text-flow-wiring.test.ts` |
| Save button hidden when nothing to save | same |
| No reintroduction of the legacy `Sistema rado` bucket grid | same |
| No `/api/workers/:id/skills` POST from the composer | same |
| Profile-text composer is no longer construction-only gated | same |

## Out of scope (intentional)

- New DB migrations.
- Production DB writes other than the explicit owner-approved grant script.
- Service-role seeding of fake test data.
- Public sharing of skill claims (visibility is `closed` by DB CHECK constraint).
- Billing / payment / provider work.
- External AI / API.
- Mobile redesign beyond "usable enough for pilot".

---

After this checklist is green on production, the owner can safely invite 2–5 trusted real users.
