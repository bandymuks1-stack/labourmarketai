# Hostinger VPS migration feasibility audit (read-only)

**Status:** architecture audit only. **No deploy / DNS / env / secrets / DB /
migration / infra changes were made.** Nothing here moves production.

## TL;DR
- The `gorgitwvdzxbnaxhrsrw.supabase.co` shown in the Google consent screen comes
  from the **Auth callback running on Supabase GoTrue**
  (`<ref>.supabase.co/auth/v1/callback`). It has **nothing to do with where the
  Next.js frontend is hosted**.
- **Moving only the frontend to a Hostinger VPS does NOT remove `supabase.co`.**
  If Auth stays on Supabase, the consent screen is unchanged — you'd take on VPS
  ops for **zero** branding benefit.
- The cheapest correct fix is **Supabase custom auth domain** (`auth.labourmarket.ai`)
  while staying on Vercel + Supabase (Variant 2). Full self-host (Variant 4)
  also removes it but is a large operational/security undertaking unsuitable for
  a first-users launch.

## What the project actually is (audited)
| Aspect | Finding | Migration impact |
|---|---|---|
| Framework | Next.js 15.5, React 19, Node 20, next-intl | Portable to any Node host |
| Vercel-specific config | None (`next.config.ts` minimal, no `vercel.json`, no Vercel crons) | Low lock-in on hosting |
| Runtime | No `edge` routes; 11 route handlers `nodejs`; 53 server actions; middleware (Supabase SSR) | Runs under `next start` on a VPS unchanged |
| **Backend coupling (Supabase)** | **117 `.from()` sites, 45 SECURITY DEFINER RPCs, 276 RLS policies, 83 migrations** | **Heavy. This is the real lock-in — not the frontend** |
| Auth | Supabase GoTrue OAuth (Google), PKCE; callback on `*.supabase.co` | Source of the branding issue |
| Storage | Supabase Storage — `journal-entry-photos` + buyer attachments (light) | Must be re-hosted only in full self-host |
| CV extraction | In-memory (unpdf/mammoth) in a `nodejs` route — no storage | Portable as-is |
| Background jobs / cron | **None** in the app (only CI workflows) | Nothing to reschedule |
| Secrets at runtime | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe (test, off), AI (off) | Same env on any host |

**Conclusion of the audit:** the frontend is highly portable; the **value and
risk live in the Supabase Postgres + 276 RLS policies + 45 SECURITY DEFINER
functions + Auth**. Leaving Supabase means re-creating and operating all of that.

---

## The 4 variants

### Variant 1 — Current: Vercel + Supabase (Free) + Google OAuth branding (Lever 1)
- **Removes `supabase.co`?** No. Lever-1 branding makes the screen say
  "Labourmarket.ai" + logo, but the `supabase.co` host can still appear in the
  redirect notice/URL.
- **Paid Supabase?** No.
- **DNS / env / secrets?** None (Google consent-screen config only).
- **Deploy complexity:** none (already live).
- **Rollback:** n/a.
- **Auth risk:** none (no change).
- **DB/RLS/security risk:** none.
- **Backup/monitoring:** Supabase-managed (PITR on paid; Free has limited backups).
- **First-users launch?** Yes — usable today.
- **Exactly do:** apply the Lever-1 consent-screen branding (see
  `GOOGLE_OAUTH_BRANDING_RUNBOOK.md`).

### Variant 2 — Vercel + Supabase Pro + custom auth domain `auth.labourmarket.ai` (RECOMMENDED)
- **Removes `supabase.co`?** **Yes** — the whole visible auth flow becomes
  `auth.labourmarket.ai`.
- **Paid Supabase?** **Yes** — Pro + Custom Domains add-on (owner to confirm
  current Supabase pricing; categories below).
- **DNS / env / secrets?** Yes (owner-approved): one `CNAME` + one `TXT`
  (Supabase-issued) for `auth.labourmarket.ai`; change `NEXT_PUBLIC_SUPABASE_URL`;
  add a Google redirect URI.
- **Deploy complexity:** low — managed; no servers to run; reuses all existing
  RLS/RPC/storage/DB untouched.
- **Rollback:** revert `NEXT_PUBLIC_SUPABASE_URL` to the `*.supabase.co` URL and
  redeploy; remove the custom domain. Fast, low-risk.
- **Auth risk:** low — same GoTrue, only the hostname changes.
- **DB/RLS/security risk:** none — database, RLS, RPCs unchanged.
- **Backup/monitoring:** Supabase-managed; Pro adds PITR + better backups.
- **First-users launch?** **Yes — best fit.**
- **Exactly do:** the Lever-2 steps in `GOOGLE_OAUTH_BRANDING_RUNBOOK.md`.

### Variant 3 — Hostinger VPS frontend, DB/Auth stay on Supabase
- **Removes `supabase.co`?** **No.** Auth still runs on Supabase → consent screen
  unchanged. **This variant does not solve the stated problem.**
- **Paid Supabase?** Only if you want Variant-2 branding on top (then you'd just
  do Variant 2 anyway).
- **DNS / env / secrets?** Yes — point a domain at the VPS, install Node, set all
  env vars on the box, manage TLS (Let's Encrypt/Nginx).
- **Deploy complexity:** **medium–high** — you now run and patch a server,
  reverse proxy, TLS renewal, process manager (pm2/systemd), zero-downtime
  deploys, log rotation. Vercel did all this for free.
- **Rollback:** redeploy previous build on the box (manual); slower than Vercel.
- **Auth risk:** unchanged (still Supabase).
- **DB/RLS/security risk:** unchanged DB, but **new server attack surface** (SSH,
  OS packages, Nginx) you must harden.
- **Backup/monitoring:** **new burden** — you must add uptime + server monitoring;
  DB still Supabase-backed.
- **First-users launch?** Not recommended — more ops, **no branding gain**.
- **Exactly do:** only pursue if you specifically need the VPS for other reasons
  (it does not fix branding).

### Variant 4 — Full self-host: Hostinger VPS + self-hosted Postgres + Auth + Storage
- **Removes `supabase.co`?** **Yes** — you control the auth domain entirely.
- **Paid Supabase?** No (you leave Supabase) — but you pay in operations.
- **DNS / env / secrets?** Extensive — DNS for app + auth, all secrets on the box,
  TLS, SMTP for auth emails, JWT secrets, OAuth client reconfig.
- **Deploy complexity:** **high** — stand up Postgres, run **all 83 migrations**,
  re-create **276 RLS policies** + **45 SECURITY DEFINER functions**, self-host
  GoTrue (or migrate to another auth — large code change to 117 `.from()` sites +
  RPC calls if the auth/client API differs), self-host Storage + the
  `journal-entry-photos` bucket, wire Google OAuth to the new auth host.
- **Rollback:** **hard** — once data lives on the VPS, reverting to Supabase means
  a reverse data migration. Plan a maintenance window + tested dump/restore.
- **Auth risk:** **high** — you own token signing, session security, OAuth
  callback integrity, email deliverability.
- **DB/RLS/security risk:** **high** — you own Postgres hardening, RLS
  correctness under a new deployment, backups/PITR, patching, encryption at rest.
- **Backup/monitoring:** **fully your responsibility** — automated backups, PITR,
  uptime, alerting, disk/CPU monitoring, security updates.
- **First-users launch?** **No** — too much risk/ops for an early launch.
- **Exactly do:** only as a deliberate long-term infrastructure decision with a
  dedicated migration project and a tested rollback.

---

## Final report

**1. Does Hostinger VPS alone solve the Google/Supabase branding problem?**
**No.** The `supabase.co` string is produced by the Auth callback on Supabase
GoTrue, not by the frontend host. Moving only the Next.js app to a VPS (Variant 3)
leaves Auth on Supabase, so the consent screen is unchanged. The branding problem
is solved only by a custom auth domain (Variant 2) or by self-hosting auth
(Variant 4).

**2. Recommended for the short term:** **Variant 2** — Vercel + Supabase Pro +
custom auth domain `auth.labourmarket.ai`. It removes `supabase.co` from the
visible flow, keeps the entire database / 276 RLS policies / 45 RPCs / storage
untouched, has a fast rollback, and is the lowest-risk path to a trustworthy
login for first users. (Apply Lever 1 immediately as a free interim improvement.)

**3. Best for the long term:** still **Variant 2** for the foreseeable future.
Full self-host (Variant 4) only becomes worth it if you have a concrete reason to
leave managed infra (cost at large scale, data-residency, vendor independence)
**and** capacity to operate Postgres + Auth + backups + security. There is no
architectural reason in this codebase that forces self-hosting.

**4. Exact migration/cutover plan IF VPS is truly chosen (Variant 4):**
1. Provision VPS; harden (SSH keys only, firewall, auto-updates), install Node 20,
   Nginx + TLS (Let's Encrypt), a process manager (systemd/pm2).
2. Stand up Postgres; run all 83 migrations in order; verify 276 RLS policies +
   45 SECURITY DEFINER functions; load data via tested dump/restore.
3. Self-host Supabase (or GoTrue + PostgREST + Storage) OR adopt another auth and
   refactor the 117 `.from()` sites / RPC calls accordingly.
4. Recreate the `journal-entry-photos` Storage bucket + attachment storage.
5. Configure Google OAuth for the new auth host; set all env/secrets on the box.
6. DNS: app + `auth.labourmarket.ai` → VPS; TLS for both.
7. Staging cutover + full smoke (login, dashboard, CV upload, RLS deny tests),
   then production cutover in a maintenance window.
8. **Rollback:** keep Supabase live and DNS-revertible until the VPS is proven;
   reverse data migration tested before cutover.
*(Frontend-only VPS = Variant 3 = do not pursue for branding; it doesn't help.)*

**5. Risks:** Variant 2 — low (hostname change only; fast rollback). Variant 3 —
new server ops/security with no branding gain. Variant 4 — high: auth/token
security, RLS correctness under a new deployment, backups/PITR ownership, OS
patching, email deliverability, hard rollback.

**6. Cost categories (confirm current pricing — no guessed figures):**
- Variant 1: current spend only (Vercel plan in use + Supabase Free).
- Variant 2: Vercel (unchanged) + **Supabase Pro + Custom Domains add-on**
  (confirm current Supabase pricing on the billing page).
- Variant 3: Vercel can be dropped, **+ Hostinger VPS plan** (confirm current
  Hostinger pricing) + your ops time; Supabase unchanged.
- Variant 4: **Hostinger VPS** (likely a larger plan for Postgres) + backups
  storage + your ops time; Supabase dropped. No managed safety net.

**7. Clear decision:** **Continue with Vercel + Supabase, and fix branding via the
custom auth domain (Variant 2).** Do **not** migrate to a VPS to solve branding —
a frontend move (Variant 3) does not remove `supabase.co`, and full self-host
(Variant 4) is disproportionate risk for an early launch. Apply Lever 1 (free)
now; schedule Variant 2 when you approve the Supabase Pro cost.
