# Owner package — Google sign-in must say "LabourMarket.ai" (2026-08-31)

> **STATUS: OPEN — waiting on the owner console/DNS actions below.**
> Raised by the owner's real incognito new-user journey (Act B, paused):
> Google's account-chooser presents the destination as
> `gorgitwvdzxbnaxhrsrw.supabase.co` instead of LabourMarket.ai.

## Root cause (exact, not a regression)

Google's consent screen line ("to continue to …") is derived from the OAuth
client's **redirect URI domain** unless a **verified brand** covers it. Our
Google OAuth client's redirect URI is
`https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback` — the Supabase
project host — because `signInWithOAuth` runs through Supabase's hosted auth
endpoint (the deliberate same-tab PKCE architecture, `domain-truth-v1.md`
§"Auth origin visibility", where this seam was recorded as the owner-gated
remainder of the single-domain migration).

**Branding alone cannot fix it**: Google brand verification requires the
app's *authorized domains* to cover its URLs, and `supabase.co` can never be
an authorized domain of ours. The supported chain is therefore:

1. put the auth endpoint on OUR domain (Supabase **custom domain**, official
   paid add-on) → the redirect URI becomes `auth.labourmarket.ai`;
2. then Google brand verification can attach, and the screen reads
   "to continue to LabourMarket.ai".

This is the officially supported path (Supabase custom-domains docs:
"OAuth flows will advertise the custom domain as a callback URL"). No proxy,
no pre-redirect fake UI, no GIS resurrection (the same-tab PKCE decision and
its guard stay untouched).

## Engineering readiness — DONE, nothing app-side blocks the switch

Verified today: every client derives the auth origin from env —
`NEXT_PUBLIC_SUPABASE_URL` (web), `EXPO_PUBLIC_SUPABASE_URL` (mobile,
https-only validator accepts any https origin), and the MCP OAuth discovery
document (`/.well-known/oauth-protected-resource`) builds
`authorization_servers` from the same env. The raw ref host appears only in
the env-default fallback, guards, and one admin diagnostics page. After the
owner actions, the entire cutover is an env value change + redeploy, and the
old `…supabase.co` host keeps working during transition (Supabase guarantee),
so existing sessions, PKCE flows, RLS and the proven Google/password chains
do not break.

## THE OWNER ACTIONS (one bundle, in this order)

**A. Supabase dashboard — activate the custom auth domain** (paid add-on on
the Pro plan, ~$10/mo):
1. Dashboard → Project `labourmarket.ai` → Settings → **Custom Domains** →
   enter **`auth.labourmarket.ai`**.
2. At the DNS provider for labourmarket.ai, add the two records the dialog
   shows: `CNAME auth → gorgitwvdzxbnaxhrsrw.supabase.co` and the
   `TXT _acme-challenge.auth …` validation record.
3. Wait for verification (≤30 min), press **Activate**.

**B. Google Cloud Console — the OAuth client Supabase uses** (APIs &
Services → Credentials → that OAuth 2.0 Client):
1. **Authorized redirect URIs**: ADD `https://auth.labourmarket.ai/auth/v1/callback`
   (keep the old supabase.co one during transition).
2. OAuth consent screen → **Branding**: App name **LabourMarket.ai**;
   upload the logo; support email; App domain = `https://labourmarket.ai`
   (+ privacy/terms links); **Authorized domains**: add `labourmarket.ai`.
3. Submit brand verification (the "lighter-weight" brand review — no
   sensitive scopes are used, so no full security audit).

**C. Vercel env** (the harness blocks agents from `vercel env` — owner or a
one-click approval): set `NEXT_PUBLIC_SUPABASE_URL=https://auth.labourmarket.ai`
for Production (leave the anon key unchanged), redeploy. Tell Claude —
verification of the full chain (fresh-session OAuth, PKCE callback, session
reload, RLS reads, MCP discovery, mobile config) runs immediately after, and
the paused Act B journey resumes on the SAME evidence.

## What this does NOT change

- The same-tab PKCE flow, callback contract, cancel handling (#1375), RLS
  identity binding, and the ChatGPT MCP chain (its discovery document follows
  the env automatically; the old host keeps answering during transition).
- Auth e-mail templates (recovery/confirmation) — separate, already-recorded
  dashboard item (`domain-truth-v1.md` seam 2), can be done in the same
  dashboard sitting: point template links at
  `https://labourmarket.ai/{locale}/auth/…`.

## Interim honest state

Until A+B land, Google will keep showing the Supabase host. Per the owner
rule, we do NOT mask it with UI. GOOGLE_NEW_USER and
PUBLIC_ACQUISITION_READY stay NO.
