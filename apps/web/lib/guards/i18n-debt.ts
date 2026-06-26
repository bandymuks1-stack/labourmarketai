/**
 * DA/DE i18n untranslated-key debt inventory + guard.
 *
 * Quality Audit v2 flagged that the non-primary locale catalogs carry many
 * `[EN]` markers — strings still showing English to the user. This module
 * inventories that debt for DA and DE (the owner's named priority) and powers
 * a baseline RATCHET guard: existing debt is allowed, but the build fails if
 * the `[EN]` count GROWS above the recorded baseline.
 *
 * Deliberately NOT a translator. It never edits copy and never machine-
 * translates. The only output is an inventory + an owner report listing which
 * namespaces to translate first. Lowering the debt (real human translation)
 * is always allowed and never fails the guard.
 *
 * Pure: node:fs + node:path only. Consumed by:
 *   - lib/guards/i18n-debt.test.ts        (vitest ratchet gate)
 *   - scripts/check-i18n-debt.ts          (owner report + CI gate)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The user-visible marker for a not-yet-translated string. */
export const UNTRANSLATED_MARKER = "[EN]";

/** Locales whose debt is inventoried + ratcheted (owner scope: DA/DE; RU
 *  added 2026-06-12 with a ZERO baseline — RU is an ACTIVE worker locale,
 *  so any future `[EN]` marker in ru.json fails the gate immediately). */
export const TRACKED_LOCALES = ["da", "de", "ru"] as const;

/** Locales that must stay fully translated (0 markers) — regression guard. */
export const PRIMARY_LOCALES = ["en", "lt"] as const;

/**
 * Recorded debt baseline (count of `[EN]` leaf values) per tracked locale,
 * measured on `main`. The guard fails only if the live count EXCEEDS these.
 * When real translations land, lower these numbers to tighten the ratchet.
 */
export const I18N_DEBT_BASELINE: Readonly<Record<string, number>> = {
  // 2026-06-10 (+56 admin.matching, +11 matching suggestions/filters, +30
  // documents keys per locale, doctrine §2.4: every new key lands in all 10
  // locales in the same PR; [EN] markers until human translation). Feature
  // keys raise the ceiling; translations lower it. MEASURED 722 at the S3
  // documents merge (main 692 + 30 documents; the PR-note '714' was stale
  // arithmetic — measurement wins). MEASURED 766 at S4 (+44: admin.market
  // analysis view + hub link + matching confirmed-only filter).
  // MEASURED 783 at admin-control-room-v1 (+24: admin.room control-room group
  // titles, KPI labels + internal-diagnostics note land in all 11 locales;
  // en/lt/ru translated, da/de [EN] until human translation).
  da: 783,
  de: 783,
  // RU shipped fully translated (2026-06-12, AI-seeded pending §7.4 human
  // review) — the ratchet starts and stays at zero.
  ru: 0,
};

export interface LocaleDebt {
  readonly locale: string;
  readonly total: number;
  /** Untranslated count grouped by top-level namespace, descending. */
  readonly byNamespace: ReadonlyArray<{ namespace: string; count: number }>;
}

export interface I18nDebtReport {
  readonly tracked: readonly LocaleDebt[];
  readonly primary: ReadonlyArray<{ locale: string; total: number }>;
  readonly baseline: Readonly<Record<string, number>>;
}

export interface DebtRegression {
  readonly locale: string;
  readonly kind: "increased-above-baseline" | "primary-locale-untranslated";
  readonly current: number;
  readonly baseline: number;
}

function messagePath(webRoot: string, locale: string): string {
  return resolve(webRoot, "messages", `${locale}.json`);
}

/** Count `[EN]` leaf values, grouped by the FIRST path segment (namespace). */
function countUntranslated(node: unknown): { total: number; byNs: Map<string, number> } {
  const byNs = new Map<string, number>();
  let total = 0;

  const walk = (value: unknown, namespace: string): void => {
    if (typeof value === "string") {
      if (value.includes(UNTRANSLATED_MARKER)) {
        total += 1;
        byNs.set(namespace, (byNs.get(namespace) ?? 0) + 1);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, namespace));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        // First descent fixes the namespace (top-level key); deeper keys roll up.
        walk(v, namespace || k);
      }
    }
  };

  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [topKey, v] of Object.entries(node)) {
      walk(v, topKey);
    }
  }
  return { total, byNs };
}

function scanLocale(webRoot: string, locale: string): LocaleDebt {
  const abs = messagePath(webRoot, locale);
  if (!existsSync(abs)) {
    return { locale, total: 0, byNamespace: [] };
  }
  const json = JSON.parse(readFileSync(abs, "utf-8")) as unknown;
  const { total, byNs } = countUntranslated(json);
  const byNamespace = [...byNs.entries()]
    .map(([namespace, count]) => ({ namespace, count }))
    .sort((a, b) => b.count - a.count || a.namespace.localeCompare(b.namespace));
  return { locale, total, byNamespace };
}

/**
 * Run the DA/DE i18n debt scan.
 * @param webRoot absolute path to apps/web
 */
export function scanI18nDebt(webRoot: string): I18nDebtReport {
  const tracked = TRACKED_LOCALES.map((l) => scanLocale(webRoot, l));
  const primary = PRIMARY_LOCALES.map((l) => ({
    locale: l,
    total: scanLocale(webRoot, l).total,
  }));
  return { tracked, primary, baseline: I18N_DEBT_BASELINE };
}

/** Build-blocking regressions: tracked locale grew, or a primary locale leaked. */
export function debtRegressions(report: I18nDebtReport): readonly DebtRegression[] {
  const out: DebtRegression[] = [];
  for (const d of report.tracked) {
    const baseline = report.baseline[d.locale] ?? 0;
    if (d.total > baseline) {
      out.push({ locale: d.locale, kind: "increased-above-baseline", current: d.total, baseline });
    }
  }
  for (const p of report.primary) {
    if (p.total > 0) {
      out.push({ locale: p.locale, kind: "primary-locale-untranslated", current: p.total, baseline: 0 });
    }
  }
  return out;
}
