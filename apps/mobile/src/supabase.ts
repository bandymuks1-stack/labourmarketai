import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CONFIG } from "./config";

/**
 * THE SAME AUTH SERVER THE WEB CLIENT USES. There is no second auth model.
 *
 * The platform issues exactly one kind of end-user credential, from one place.
 * This client asks that same place for it. Registration, sign-in, refresh and
 * sign-out are Supabase Auth endpoints, which accept a token directly and have
 * never needed a cookie — which is why authentication is the ONE capability
 * that is not blocked by the cookie-only API boundary
 * (`docs/APP_READINESS_MAP.md` §2).
 *
 * ## Why persistSession and autoRefreshToken are off
 *
 * `supabase-js` can persist and renew sessions itself, given a storage
 * adapter. Letting it would mean two session stores in this app: its own, and
 * the one `@labourmarket/client-core` defines and tests. Two stores drift, and
 * the drift shows up as a person who is signed in according to one and signed
 * out according to the other.
 *
 * The cost is that renewal becomes THIS app's job, and it is done in
 * `auth-context.tsx` — on a timer and on foregrounding. Turning these off
 * without doing that is how a client works for exactly one token lifetime.
 *
 * So this client holds a session only in memory for the life of a request, and
 * `auth-context.tsx` is the single writer of the keychain. One store, one
 * format, one state machine — and that state machine is unit-tested off-device.
 *
 * ## What this client is NOT for
 *
 * It authenticates. It does not read product data. Querying tables directly
 * from the device would re-derive meaning the canonical domain already owns
 * (journal entry → evidence → capability → CV line) and would be the second
 * implementation this architecture exists to prevent. Product reads and writes
 * go through the canonical capabilities at `/api/mcp` — see `src/domain.ts`,
 * which since the bearer seam (#1331) carries real reads rather than refusing.
 */
export const supabase: SupabaseClient | null =
  CONFIG === null
    ? null
    : createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          // There is no browser URL to detect a session in. A device would
          // receive an auth callback as a deep link instead — and NO deep-link
          // callback handler exists in this client yet, which is exactly why
          // this stays false: mobile authentication is password-only today,
          // and the social-provider flows that would need such a callback are
          // blocked upstream on the auth-domain/branding work, not here.
          detectSessionInUrl: false,
        },
      });
