# OWNER GATE — galutinis read-only auditas (2026-07-30)

> Visi šeši vykdymo etapai (§7, §8, §5.2, §10, §12, §16) užbaigti ir gyvi
> production. Liko **du** punktai, kurių agentas negali užbaigti, nes jiems
> reikia savininko veiksmų už repo ribų.
>
> **Šiame etape NIEKO nepakeista**: jokio DNS, jokio Google Console, jokio
> Supabase billing, jokios migracijos. Čia tik auditas, planas, įrodymai ir
> laukimo taškas.

---

## GATE 1 — OAuth identitetas (§P0.4)

### Faktinė būsena (patikrinta kode ir production)

Google prisijungimas veikia teisingai — same-tab, PKCE, be popup (patikrinta
production: `scripts/verify-prod-owner-visual-acceptance.mjs`, GIS skriptų 0
visuose 7 viewport'uose). Bet Google ekrane rodomas **redirect_uri domenas**,
o jis šiandien yra Supabase projektas:

1. `components/app/google-button.tsx` → `supabase.auth.signInWithOAuth`
   su `redirectTo: https://labourmarket.ai/<locale>/auth/callback`.
2. Supabase JS veda naršyklę į
   `https://<project-ref>.supabase.co/auth/v1/authorize?provider=google`.
3. Supabase Auth peradresuoja į `accounts.google.com` su
   `redirect_uri=https://<project-ref>.supabase.co/auth/v1/callback`.
4. Google „Continue to …" rodo **tą** domeną.

**Išvada: tai ne kodo defektas.** Kodo pusėje keisti nereikia nieko iki
5-o žingsnio žemiau. Pilnas priežasties auditas ir variantai:
[`oauth-identity-audit-2026.md`](oauth-identity-audit-2026.md).

### Kas privalo įvykti (tik savininkas)

| # | Veiksmas | Kur | Kodėl agentas negali |
|---|---|---|---|
| 1 | Aktyvuoti custom domain `auth.labourmarket.ai` | Supabase Dashboard → Settings → Custom Domains | **Supabase billing** (mokama funkcija) |
| 2 | CNAME `auth.labourmarket.ai` → `<project-ref>.supabase.co` + Supabase TXT verifikacija | DNS | **DNS** |
| 3 | Pridėti `https://auth.labourmarket.ai/auth/v1/callback` prie Authorized redirect URIs (senojo NETRINTI) | Google Cloud Console → Credentials | **Google Console** |
| 4 | Consent screen: App name „LabourMarket.ai", logotipas, home page, authorized domain | Google Cloud Console → OAuth consent screen | **Google Console** |
| 5 | *(agento darbas po 1–4)* `NEXT_PUBLIC_SUPABASE_URL` → `https://auth.labourmarket.ai` | Vercel env | — |

### Priėmimo patikra po gate

Google ekrane matoma „to continue to **auth.labourmarket.ai**"; login srautas
lieka same-tab; popup langų 0. Tą patį patvirtins jau egzistuojantis
harness'as (`verify-prod-owner-visual-acceptance.mjs`).

---

## GATE 2 — patvarus workspace pointer (§P0.1)

### Faktinė būsena

Erdvių perjungimas **jau veikia** production: narystės validuotas
server-side sesijos pointer (httpOnly cookie `lm_active_workspace`, rašomas
tik po narystės patikros; `lib/company/organization-actions.ts`), rolė seka
erdvę, „erdvės perjungimas dar neįjungtas" tekstas ištrintas iš 11 lokalių.

Ko dar nėra: **cross-device patvarumo**. Pasirinkta erdvė gyvena sesijoje, ne
DB. Tam paruošta migracija `supabase/migrations/20260714210000_company_memberships_v1.sql`
(`profiles.active_organization_id` + narystės validacijos trigeriai +
idempotentinis backfill). Kodas ją jau feature-detect'ina: kol nepritaikyta,
42703 nėra klaida — sesijos pointer veikia.

### Kas privalo įvykti (tik savininkas)

| # | Veiksmas | Kur | Kodėl agentas negali |
|---|---|---|---|
| 1 | Peržiūrėti migracijos SQL + RLS diff | `supabase/migrations/20260714210000_…sql` | RED klasė — žmogaus gate |
| 2 | Pritaikyti per Supabase MCP `apply_migration` (NIEKADA `db push`) | Supabase | **Production DB migracija** |

Po pritaikymo kodo keisti nereikia: `getWorkspaceContext` jau skaito DB
pointer'į kaip cross-device numatytąjį, o sesijos cookie lieka
„paskutinis pasirinkimas šioje sesijoje".

### Priėmimo patikra po gate

Perjungus erdvę viename įrenginyje, kitas įrenginys atidaro tą pačią erdvę.

---

## LAUKIMO TAŠKAS

Agentas sustoja čia. Nė vienas iš šių dviejų punktų neblokuoja jau atliktų
šešių etapų — jie visi gyvi production ir patikrinti. Kai savininkas įvykdys
GATE 1 (1–4) ir/arba GATE 2 (1–2), likę žingsniai (OAuth 5-as; migracijos
post-apply patikra) yra agento darbas ir užima minutes.
