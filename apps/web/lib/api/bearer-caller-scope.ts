import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { ApiIdentity } from "./api-identity";

/**
 * BEARER CALLER SCOPE — the request-scoped seam that lets the web's existing
 * domain entrypoints run for a caller who authenticated with a BEARER token.
 *
 * ## Why it exists
 *
 * Most of the product's canonical writes are server actions and helpers that
 * obtain the caller through `createClient()` (lib/supabase/server), which
 * reads the browser's auth cookies. A bearer client (ChatGPT over MCP, an
 * agent runtime, mobile) has no cookies, so before this seam every such
 * action was unreachable from outside the browser unless it was first
 * hand-extracted into a `DomainCaller` core. That extraction is still the
 * better long-term shape for any core that grows, but requiring it for every
 * action meant a second, ever-lagging copy of the product's surface.
 *
 * Inside `runAsBearerCaller`, `createClient()` returns the caller's OWN
 * bearer client — the one `resolveApiIdentity` already verified — instead of
 * a cookie client. Nothing else changes: the same server action runs, the
 * same `auth.getUser()` answers the same verified user, and Postgres
 * evaluates the same RLS policies for the same JWT subject.
 *
 * ## The invariant it must keep
 *
 * **A bearer caller can never do more than the same person's web session.**
 *  - The scope holds ONLY an identity the auth-core boundary verified. It is
 *    entered by the MCP door after `resolveApiIdentity` succeeded, never from
 *    a client-supplied value.
 *  - The client in the scope is anon-key + the user's own JWT — never a
 *    service-role client. A service-role client inside a server action is
 *    created by that action itself, after its own checks, exactly as on the
 *    web.
 *  - A cookie transport never enters the scope (it already has its client),
 *    so the browser path is byte-for-byte unchanged.
 *  - The store is an `AsyncLocalStorage`: it is visible only to the async
 *    continuation of the one request that entered it.
 *
 * The store lives on `globalThis` under a registered symbol so that, should a
 * bundler ever emit two copies of this module into one server, both copies
 * read the same scope instead of one silently seeing "no scope".
 */

export type BearerCallerScope = {
  readonly userId: string;
  /** The verified caller's own RLS-scoped client — never service-role. */
  readonly supabase: SupabaseClient<Database>;
};

const STORE_KEY = Symbol.for("labourmarket.bearer-caller-scope.v1");

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: AsyncLocalStorage<BearerCallerScope>;
};

function store(): AsyncLocalStorage<BearerCallerScope> {
  const g = globalThis as GlobalWithStore;
  g[STORE_KEY] ??= new AsyncLocalStorage<BearerCallerScope>();
  return g[STORE_KEY];
}

/**
 * Run `fn` as the verified bearer caller. A cookie identity runs `fn`
 * unchanged — its `createClient()` already IS the caller.
 */
export function runAsBearerCaller<T>(identity: ApiIdentity, fn: () => Promise<T>): Promise<T> {
  if (identity.transport !== "bearer") return fn();
  return store().run({ userId: identity.userId, supabase: identity.supabase }, fn);
}

/** The bearer caller of the current request, if one entered the scope. */
export function currentBearerCaller(): BearerCallerScope | undefined {
  return store().getStore();
}
