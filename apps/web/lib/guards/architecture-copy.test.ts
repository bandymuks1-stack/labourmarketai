import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture-copy guard (core-network area E).
 *
 * User-facing copy explains what the USER can do — never how the system is
 * built. These narrow patterns pin the specific leak phrasings the E audit
 * removed (DB-row storage talk, "data model" as a user-facing status,
 * "waiting for its migration" chips, build-slice vocabulary), so they cannot
 * quietly return.
 *
 * Deliberately narrow (SR-2 philosophy): surfaces whose PURPOSE is technical
 * transparency keep their vocabulary — the privacy/data-access page and the
 * admin operations namespaces are excluded, and product-metaphor words
 * (map "sluoksnis"/layers) are NOT banned.
 */

const webRoot = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "de", "nl", "ru"] as const;

/** Namespaces whose audience/purpose is technical by design. */
const EXCLUDED_NAMESPACES = new Set([
  "admin",
  "adminBilling",
  "adminReadiness",
  "adminLaunchReadiness",
  "agentOs",
  "telemetry",
  "needStructuring",
  "privacy",
  "dataStorage",
  "vision", // internal owner preview (marketing shell), documented in the audit
  "assist", // operator-facing assist surface
]);

const BANNED: { name: string; rx: RegExp }[] = [
  { name: "db-row-storage-talk", rx: /išsaugom\w*\s+DB\b|DB kaip atskir|saved (as its own )?DB row|in der DB gespeichert|opgeslagen in de database|сохраняется в базе данных/i },
  { name: "data-model-as-user-status", rx: /duomenų modelis|duomenų modelio|\bdata model\b|Datenmodell|\bdatamodel\b|модель данных|модели данных/i },
  { name: "waiting-for-migration-chip", rx: /laukia migracijos|waiting for its migration|wartet auf .{0,12}Migration|wacht op .{0,12}migratie|ждёт миграции/i },
  { name: "build-slice-vocabulary", rx: /pjūvyje|pateikimo pjūvis|write-enabled slice|separate slice|presentation lens/i },
  { name: "implementation-primitives", rx: /getPublicUrl|signed URL|\bRLS\b|\bRPC\b|service_role/ },
];

type Hit = { locale: string; path: string; pattern: string; value: string };

function collect(
  node: unknown,
  path: string,
  locale: string,
  out: Hit[],
): void {
  if (typeof node === "string") {
    for (const { name, rx } of BANNED) {
      if (rx.test(node)) {
        out.push({ locale, path, pattern: name, value: node.slice(0, 120) });
      }
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collect(v, path ? `${path}.${k}` : k, locale, out);
    }
  }
}

describe("no architecture-explaining copy in user-facing namespaces", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: user copy carries no banned implementation phrasing`, () => {
      const messages = JSON.parse(
        readFileSync(join(webRoot, "messages", `${loc}.json`), "utf8"),
      ) as Record<string, unknown>;
      const hits: Hit[] = [];
      for (const [ns, sub] of Object.entries(messages)) {
        if (EXCLUDED_NAMESPACES.has(ns)) continue;
        collect(sub, ns, loc, hits);
      }
      expect(
        hits,
        `architecture copy leaked:\n${hits
          .map((h) => `  ${h.locale}.${h.path} [${h.pattern}]: "${h.value}"`)
          .join("\n")}`,
      ).toEqual([]);
    });
  }
});
