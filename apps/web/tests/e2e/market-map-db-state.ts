/**
 * Shared LOCAL-stack DB state helpers for the authenticated Market Map specs.
 *
 * The capture/readiness specs assume a pristine fixture state that drifts in a
 * long-lived local stack: preferred_locations rows accumulate across runs, the
 * fixture worker's availability_status gets toggled away from 'available', the
 * manually-recipe'd verified worker_skills row disappears on a fixture reset,
 * and the owner demand row the capture spec edits may never have been created.
 * Each spec re-pins exactly the state it assumes in beforeAll through these
 * helpers — the same service-role PostgREST pattern as
 * w3-calendar-rows-11-12.spec.ts — and removes its marker-scoped rows in
 * afterAll. Assertions are untouched; only the state setup is deterministic.
 *
 * Loopback-guarded: db() refuses any non-local target, so this can never touch
 * a cloud project.
 */
import { readFileSync } from "node:fs";

export const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

/** Minimal PostgREST calls with the LOCAL service key — refuses non-loopback. */
export async function db(
  method: "POST" | "DELETE" | "GET" | "PATCH",
  path: string,
  body?: unknown,
  prefer?: string,
): Promise<Response> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to seed a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? (method === "POST" ? "return=representation" : "return=minimal"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** db(), but a non-2xx response fails the run loudly — a silent seed failure
 *  would resurface as exactly the flake this file exists to kill. */
export async function dbOk(
  method: "POST" | "DELETE" | "GET" | "PATCH",
  path: string,
  body?: unknown,
  prefer?: string,
): Promise<Response> {
  const res = await db(method, path, body, prefer);
  if (!res.ok) {
    throw new Error(`seed ${method} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The profile id the storage state was minted for, decoded from the
 * `sb-<ref>-auth-token` cookie (@supabase/ssr format: `base64-` +
 * base64url(JSON session), chunked into `.0`, `.1`, … above the cookie size
 * cap — see scripts/e2e-mint-session.ts). Resolved from the artefact itself so
 * the pinned rows always belong to the user the browser actually runs as,
 * whatever E2E_OWNER_EMAIL minted the session.
 */
export function mintedProfileId(storageStatePath: string): string {
  const state = JSON.parse(readFileSync(storageStatePath, "utf8")) as {
    cookies?: Array<{ name: string; value: string }>;
  };
  const chunkIndex = (name: string): number =>
    /\.\d+$/.test(name) ? Number(name.slice(name.lastIndexOf(".") + 1)) : 0;
  const chunks = (state.cookies ?? [])
    .filter((c) => /^sb-[^.]+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => chunkIndex(a.name) - chunkIndex(b.name));
  if (chunks.length === 0) {
    throw new Error("storage state has no sb-*-auth-token cookie — re-mint the session");
  }
  const joined = chunks.map((c) => c.value).join("");
  const b64 = joined
    .replace(/^base64-/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const session = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
    user?: { id?: string };
  };
  const id = session.user?.id ?? "";
  if (!UUID_RE.test(id)) {
    throw new Error("storage state cookie carries no valid user id — re-mint the session");
  }
  return id;
}
