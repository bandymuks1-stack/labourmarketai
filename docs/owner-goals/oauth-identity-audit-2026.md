# P0.4 — Google OAuth identiteto auditas (read-only) — 2026-07-29

> Savininko auditas: Google lange rodoma `...supabase.co` vietoj
> `labourmarket.ai`. Šis dokumentas — read-only priežasties auditas ir
> taisymo planas. **Jokie OAuth Console / DNS / Supabase nustatymai
> nekeisti** — visi taisymo veiksmai yra savininko rankose.

## Kas vyksta dabar (kodo faktai)

1. `components/app/google-button.tsx` kviečia
   `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo:
   https://labourmarket.ai/<locale>/auth/callback?... } })` — same-tab, be popup
   (P0 iš #918 išspręstas teisingai).
2. Supabase JS tada naršyklę veda į
   `https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&...`.
3. Supabase Auth serveris peradresuoja į `accounts.google.com` su
   **`redirect_uri=https://<project-ref>.supabase.co/auth/v1/callback`** —
   nes Google klientas sukonfigūruotas su Supabase callback.
4. Google „Choose an account / Continue to" ekrane rodomas **redirect_uri
   domenas** → vartotojas mato `<project-ref>.supabase.co`.

Išvada: tai NE kodo klaida — tai infrastruktūrinė konfigūracija. Kodo pusėje
nieko keisti nereikia; srautas saugus (PKCE, same-tab, trace).

## Taisymo planas (savininko veiksmai, eilės tvarka)

### A variantas — Supabase Custom Domain (pilnas identiteto fiksas, rekomenduojama)

Google rodys `auth.labourmarket.ai`, nes redirect_uri taps mūsų domenu.

1. **Supabase Dashboard → Settings → Custom Domains**: aktyvuoti custom
   domain `auth.labourmarket.ai` (mokama funkcija — billing patvirtinimas).
2. **DNS**: sukurti CNAME `auth.labourmarket.ai → <project-ref>.supabase.co`
   (ir Supabase nurodytus TXT verifikacijos įrašus).
3. **Google Cloud Console → Credentials → OAuth Client**: prie Authorized
   redirect URIs PRIDĖTI `https://auth.labourmarket.ai/auth/v1/callback`
   (senojo netrinti, kol perjungimas nebaigtas).
4. **Supabase Dashboard → Auth → URL Configuration**: patikrinti, kad Site URL
   = `https://labourmarket.ai`, redirect allowlist turi
   `https://labourmarket.ai/*`.
5. **Kodas**: pakeisti `NEXT_PUBLIC_SUPABASE_URL` į
   `https://auth.labourmarket.ai` (Vercel env; po DNS/custom domain aktyvavimo).
   Tai vienintelis kodo/konfigūracijos pakeitimas mūsų pusėje — atlieku aš,
   kai savininkas patvirtins 1–4.
6. Patikra: login → Google ekrane „to continue to auth.labourmarket.ai".

### B variantas — tik Consent Screen branding (dalinis, nemokamas)

Google consent ekrane rodomas produkto pavadinimas/logotipas, bet
„continue to" eilutė LIEKA supabase.co (nes redirect domenas nesikeičia).

1. **Google Cloud Console → OAuth consent screen**: App name
   „LabourMarket.ai", logotipas, application home page
   `https://labourmarket.ai`, authorized domain `labourmarket.ai`.
2. Verifikacija (Google gali pareikalauti domain verification per Search
   Console — jau turėtų būti, nes domenas gyvas).

B variantas — greitas kosmetinis žingsnis; A variantas — pilnas P0.4
uždarymas. Rekomenduoju A+B kartu.

## Statusas

- Kodas: pakeitimų nereikia (iki A-5 žingsnio).
- Savininko gate: Supabase custom domain (billing) + DNS CNAME + Google
  Console redirect URI + consent branding.
- Iki gate įvykdymo P0.4 lieka **OWNER-GATED-OPEN** — įtraukta į galutinio
  verdikto blokatorius, jei savininkas neįvykdo iki priėmimo.
