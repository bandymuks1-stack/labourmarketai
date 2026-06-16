import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Launch Completion PR B guard — in-UI explanations + honest CTAs.
 *
 *  - The `featureNotes` namespace exists with every feature key in LT/EN/RU.
 *  - The reusable FeatureNote component exists and is placed on key surfaces.
 *  - No fake-payment CTA tokens leak into user-facing copy while billing is
 *    disabled (pay now / subscription active / unlock / atrakin…).
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const loadMsg = (loc: string) => JSON.parse(read(`messages/${loc}.json`));

const FEATURE_KEYS = [
  "personSpace",
  "companySpace",
  "workerProfile",
  "companyProfile",
  "documentsReadiness",
  "skillRecognition",
  "workJournal",
  "evidenceTrust",
  "companyNeeds",
  "opportunities",
  "marketplaceMap",
  "communicationInbox",
  "adminReview",
  "paymentReadiness",
  "identityModel",
];

const ADMIN_NAMESPACES = new Set([
  "admin",
  "agentOs",
  "telemetry",
  "adminReadiness",
  "adminBilling",
  "needStructuring",
]);

describe("featureNotes explanations exist in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: has all ${FEATURE_KEYS.length} feature explanation keys, non-empty`, () => {
      const fn = loadMsg(loc).featureNotes;
      expect(fn, `${loc} featureNotes missing`).toBeTruthy();
      for (const k of FEATURE_KEYS) {
        expect(typeof fn[k] === "string" && fn[k].trim().length > 20, `${loc} featureNotes.${k}`).toBe(true);
      }
    });
  }

  it("identity explanation states the action model (not a separate identity)", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const txt = loadMsg(loc).featureNotes.identityModel.toLowerCase();
      // mentions action framing for agency/buying
      expect(/action|veiksm|действи/.test(txt), `${loc} identityModel action framing`).toBe(true);
    }
  });
});

describe("FeatureNote component exists and is placed on key surfaces", () => {
  it("component exists", () => {
    expect(existsSync(join(APP_ROOT, "components/app/feature-note.tsx"))).toBe(true);
  });

  const SURFACES: [string, string][] = [
    ["app/[locale]/dashboard/market-map/page.tsx", "marketplaceMap"],
    ["app/[locale]/dashboard/communication/page.tsx", "communicationInbox"],
    ["app/[locale]/dashboard/opportunities/page.tsx", "opportunities"],
    ["app/[locale]/dashboard/profile/page.tsx", "workerProfile"],
    ["app/[locale]/dashboard/company/page.tsx", "companySpace"],
  ];
  for (const [file, key] of SURFACES) {
    it(`${file} renders FeatureNote with featureNotes.${key}`, () => {
      const src = read(file);
      expect(src).toMatch(/FeatureNote/);
      expect(src).toMatch(new RegExp(`featureNotes`));
      expect(src).toMatch(new RegExp(`"${key}"`));
    });
  }
});

describe("no fake-payment CTA copy while billing is disabled", () => {
  const FORBIDDEN = [/pay now/i, /subscription active/i, /\bunlock\b/i, /atrakin/i, /prenumerata aktyvi/i, /mokėti dabar/i];
  function collect(node: unknown, path: string, out: { path: string; value: string }[]) {
    if (typeof node === "string") out.push({ path, value: node });
    else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        collect(v, path ? `${path}.${k}` : k, out);
      }
    }
  }
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: user-facing copy has no fake-payment CTA tokens`, () => {
      const m = loadMsg(loc);
      const offenders: string[] = [];
      for (const [ns, sub] of Object.entries(m)) {
        if (ADMIN_NAMESPACES.has(ns)) continue;
        const strings: { path: string; value: string }[] = [];
        collect(sub, ns, strings);
        for (const { path, value } of strings) {
          for (const re of FORBIDDEN) if (re.test(value)) offenders.push(`${path}: "${value}"`);
        }
      }
      expect(offenders, `fake-payment CTA copy:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
