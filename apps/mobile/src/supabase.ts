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
 * ## Why persistSession is off
 *
 * `supabase-js` can persist sessions itself, given a storage adapter. Letting
 * it would mean two session stores in this app: its own, and the one
 * `@labourmarket/client-core` defines and tests. Two stores drift, and the
 * drift shows up as a user who is signed in according to one and signed out
 * according to the other.
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
 * go through `callDomain` in `@labourmarket/client-core`, which currently and
 * honestly refuses — see `src/domain.ts`.
 */
export const supabase: SupabaseClient | null =
  CONFIG === null
    ? null
    : createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          // There is no browser URL to detect a session in. On a device the
          // callback arrives as a deep link, handled explicitly.
          detectSessionInUrl: false,
        },
      });
