import "server-only";

import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import {
  FAIL_CLOSED_PROVIDERS,
  readEnabledProviders,
  type EnabledProviders,
} from "@/lib/auth/enabled-providers-core";

export { FAIL_CLOSED_PROVIDERS };
export type { EnabledProviders };

/**
 * Server-side cached read of which OAuth providers the auth server can
 * actually complete (GoTrue `/auth/v1/settings`, anon `apikey`).
 *
 * All honesty/fail-closed semantics live in enabled-providers-core.ts. This
 * wrapper only adds the 300 s `unstable_cache` window, keyed on the project
 * URL so a project switch never serves another project's provider surface.
 *
 * Consumers: the auth page server components
 * (app/[locale]/auth/{login,signup}/page.tsx) fetch this and pass plain
 * boolean props down to the client forms — the flags render buttons, nothing
 * else, so nothing secret crosses the boundary.
 */
export const getEnabledProviders = unstable_cache(
  (): Promise<EnabledProviders> =>
    readEnabledProviders(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  ["auth-enabled-providers-v1", env.NEXT_PUBLIC_SUPABASE_URL],
  { revalidate: 300 },
);
