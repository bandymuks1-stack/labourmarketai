import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: no user-facing "missing-backend" copy in PRODUCT UI.
 *
 * Owner hard rule (connect-all-functions sprint, 2026-06-16): a visible/active
 * product function must work end-to-end against an applied backend. It must NOT
 * show "needsMigration / waiting on a DB update / feature not active yet / try
 * later because the migration isn't applied" as a user-facing state. If a backend
 * is genuinely missing, the feature is connected (owner-gated apply) or removed —
 * never surfaced as a migration/DB-pending message.
 *
 * Scope = product namespaces. EXCLUDED (legitimately reference migrations/DB
 * state): `admin`, `adminReadiness`, `agentOs` (admin-only ops diagnostics +
 * the migration-auditor tool). Stripe/payment "not active" copy is a real
 * business state (Stripe is out of scope) and does not use these phrases.
 *
 * Static, secret-free, no-DB. Runs in CI via `pnpm -F web test`.
 */

const ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;
const load = (loc: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, "messages", `${loc}.json`), "utf8"));

/** Admin-only / ops namespaces where migration/DB diagnostics are legitimate. */
// adminPilots (Pilot Onboarding and Measurement v1) is superadmin-only —
// its honest needs-migration diagnostics are legitimate operator copy.
const EXCLUDED_NAMESPACES = new Set([
  "admin",
  "adminReadiness",
  "adminPilots",
  "agentOs",
]);

/** Missing-backend phrases that must never reach a product user (LT/EN/RU). */
const BANNED: RegExp[] = [
  /needsMigration/i,
  /laukiama duomenų bazės|duomenų bazės atnaujinimo|DB migracij|reikia migracijos|laukiama migracijos/i,
  /database update pending|waiting on a (?:database|migration)|migration[^.]{0,40}\b(?:required|applied|not applied)/i,
  /\bfunkcija dar (?:neaktyv|nepasiek|neparuoš|ruoš)/i,
  /feature is (?:being prepared|not available yet|not active yet)/i,
  /обновлени\w* базы данных|требуется миграция|ожида\w* миграции|миграция[^.]{0,40}не применена/i,
  /функци\w* (?:пока недоступн|ещё готов|пока не активн|готовится)/i,
];

function stringLeaves(node: unknown, prefix: string, out: [string, string][]): void {
  if (typeof node === "string") out.push([prefix, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => stringLeaves(v, `${prefix}[${i}]`, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node as Record<string, unknown>))
      stringLeaves(v, prefix ? `${prefix}.${k}` : k, out);
}

describe("no user-facing needsMigration / DB-pending / feature-inactive copy (product)", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: product namespaces carry no missing-backend copy`, () => {
      const m = load(loc);
      const offenders: string[] = [];
      for (const [ns, node] of Object.entries(m)) {
        if (EXCLUDED_NAMESPACES.has(ns)) continue;
        const out: [string, string][] = [];
        stringLeaves(node, ns, out);
        for (const [k, v] of out) {
          if (BANNED.some((re) => re.test(v))) offenders.push(`${k}: "${v}"`);
        }
      }
      expect(
        offenders,
        `${loc} product copy shows a missing-backend state to the user:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});
