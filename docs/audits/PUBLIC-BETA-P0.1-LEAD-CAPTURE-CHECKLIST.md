# P0.1 — Lead-capture verification checklist (owner action)

> From `docs/audits/PUBLIC-BETA-READINESS-AUDIT-V1.md` P0.1, hardened in
> `TASK-PUBLIC-BETA-HARDENING-V1`. This is the **only hard gate** left before a
> limited, manually guided closed beta.

## Code-level status (verified in this sprint — no change needed)

`apps/web/app/api/leads/route.ts` is **safe and honest**:

- Validates input with zod (email, intent, source).
- Inserts into `leads` via the service-role admin client.
- **Fails loudly, never silently:**
  - missing `SUPABASE_SERVICE_ROLE_KEY` → `createAdminClient()` throws →
    caught → `{ ok: false }` HTTP **503** ("Lead capture is not configured yet").
  - insert error → `{ ok: false }` HTTP **502** ("Could not save right now").
  - returns `{ ok: true }` **only after a successful insert** (`!error`).
- The UI (`PilotRequestButton`) shows the success state only on `res.ok &&
  data.ok !== false`; otherwise it shows an honest error. **No fake "submitted".**

So the path cannot silently lose a lead or fake success. The remaining risk is
purely **environment configuration in production**, which is owner-managed and
was not touched by this audit (env is out of scope).

## Owner steps to clear P0.1

1. In the production environment (Vercel project for `labourmarketai`), confirm
   these are set on the **Production** environment:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   (The service key powers the RLS-bypassing `leads` insert.)
2. Deploy/redeploy so the env is live.
3. Do one **real end-to-end test** as a signed-in user:
   - open the company/agency dashboard → **Request a pilot** → submit.
   - confirm the button reaches the success state (not the error state).
4. Confirm the row landed: check the `leads` table in Supabase for the new row
   (correct `email`, `intent`, `source = "dashboard_pilot"`, `status = "new"`).
5. If step 3 shows an error or step 4 shows no row → P0.1 is **still blocked**;
   re-check the env value and Supabase `leads` table grants/RLS (do not change
   schema as part of beta hardening — escalate if a grant is missing).

## Outcome

- ✅ Steps 1–4 pass → **P0.1 cleared → limited closed-beta GO.**
- ❌ Any step fails → **P0.1 remains a P0 blocker**; do not invite external users
  until lead capture persists.
