/**
 * Guard — PLAN CATALOGUE CONSISTENCY (LMC canonicalization, 2026-10-03).
 *
 * Three plan catalogues exist and none may silently drift from the others:
 *   1. CODE   lib/billing/plans.ts            PRE_PAYMENT_PLANS  (entitlement boundary, no figures)
 *   2. DB     public.plans                    (display names + the ONE EUR figure; data-applied)
 *   3. STRIPE STRIPE_PRICE_* env slots        (provider price ids; amount lives in Stripe)
 *
 * This guard is DETECTION ONLY. It changes no behaviour and decides no price.
 * It pins the explicit mapping below, so a new plan, a renamed slot or a
 * changed approved figure fails CI until the mapping (and the owner decision
 * behind it) is updated deliberately. See docs/consolidation/LMC_CANONICALIZATION.md.
 *
 * Pure source reads. No network, no database, no Stripe.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFERRED_PLAN_KEYS, FREE_ORGANIZATION_PLAN_KEY, ORGANIZATION_PLAN_KEY, PRE_PAYMENT_PLANS, isSellablePlan } from "@/lib/billing/plans";

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * code plan key -> { DB plans.slug, Stripe env slot }.
 * Only the keys that have a counterpart are listed; null = deliberately none.
 * Owner-approved launch pricing 2026-09-05 (0/0/99): the figure below is the
 * approved MONTHLY price in EUR, tax-EXCLUSIVE (Stripe Tax adds VAT).
 */
const MAPPING = {
  [FREE_ORGANIZATION_PLAN_KEY]: { dbSlug: "free", stripeEnv: null, approvedEurMonthly: 0 },
  [ORGANIZATION_PLAN_KEY]: { dbSlug: "business", stripeEnv: "STRIPE_PRICE_COMPANY_PILOT", approvedEurMonthly: 99 },
} as const;

/** Slots that exist in env but are deliberately unset (deferred plans). */
const DEFERRED_STRIPE_SLOTS = { worker_plus: "STRIPE_PRICE_WORKER_PLUS", agency_pilot: "STRIPE_PRICE_AGENCY_PILOT" } as const;
/** DB rows retired as public tiers (applied 2026-09-05): must stay unpriced. */
const RETIRED_DB_SLUGS = ["agency", "enterprise"] as const;

describe("code catalogue <-> mapping", () => {
  it("every sellable code plan is in the mapping with a Stripe slot and a DB slug; nothing else is sellable", () => {
    const sellable = PRE_PAYMENT_PLANS.filter(isSellablePlan).map((p) => p.slug);
    expect(sellable).toEqual([ORGANIZATION_PLAN_KEY]);
    for (const slug of sellable) {
      const m = MAPPING[slug as keyof typeof MAPPING];
      expect(m, slug).toBeDefined();
      expect(m.stripeEnv, slug).toBeTruthy();
      expect(m.dbSlug, slug).toBeTruthy();
    }
  });

  it("every mapped code plan exists, and every non-sellable priced-looking plan is a known free/deferred/internal one", () => {
    for (const k of Object.keys(MAPPING)) expect(PRE_PAYMENT_PLANS.some((p) => p.slug === k), k).toBe(true);
    const known = new Set<string>([...Object.keys(MAPPING), ...DEFERRED_PLAN_KEYS, "free_worker", "admin_internal"]);
    for (const p of PRE_PAYMENT_PLANS) expect(known.has(p.slug), `unmapped code plan ${p.slug}`).toBe(true);
  });

  it("the code registry carries no EUR figure (the figure lives only in plans.price_eur_monthly)", () => {
    expect(/\b\d{2,}\s*(€|EUR)|(€|EUR)\s*\d{2,}|price_eur|cents/i.test(stripComments(read(join(WEB, "lib/billing/plans.ts"))))).toBe(false);
  });
});

describe("Stripe price slots <-> code plans", () => {
  const prices = read(join(WEB, "lib/billing/prices.ts"));
  const envTs = read(join(WEB, "lib/env.ts"));
  const envExample = read(join(REPO, ".env.example"));

  it("prices.ts resolves exactly the mapped + deferred plan keys, each to its declared env slot", () => {
    const cases = [...prices.matchAll(/case "([a-z_]+)":\s*return env\.(STRIPE_PRICE_[A-Z_]+)/g)].map((m) => [m[1], m[2]]);
    const expected = [
      ...Object.entries(MAPPING).filter(([, v]) => v.stripeEnv).map(([k, v]) => [k, v.stripeEnv]),
      ...Object.entries(DEFERRED_STRIPE_SLOTS),
    ];
    expect(cases.sort()).toEqual(expected.sort());
    for (const k of DEFERRED_PLAN_KEYS) expect(Object.keys(DEFERRED_STRIPE_SLOTS)).toContain(k);
  });

  it("every STRIPE_PRICE_* slot is declared in env.ts (schema + process.env) and documented in .env.example", () => {
    const slots = [...Object.values(DEFERRED_STRIPE_SLOTS), ...Object.values(MAPPING).map((m) => m.stripeEnv).filter(Boolean)] as string[];
    for (const s of slots) {
      expect(envTs.split(s).length - 1, `${s} in env.ts`).toBeGreaterThanOrEqual(2);
      expect(envExample, `${s} in .env.example`).toContain(s);
    }
    const all = new Set([...envTs.matchAll(/STRIPE_PRICE_[A-Z_]+/g)].map((m) => m[0]));
    expect([...all].sort()).toEqual([...new Set(slots)].sort());
  });
});

describe("DB plans <-> approved figures (read from the repo, never from prod)", () => {
  const ledger = read(join(REPO, "docs/APPLIED_LEDGER.md"));
  const section = ledger.slice(ledger.indexOf("launch pricing DATA update on `public.plans`"));
  const rows = [...section.slice(0, 2500).matchAll(/^\| `([a-z]+)` \| (NULL|\d+) \| \*{0,2}(true|false)\*{0,2} \|/gm)].map((m) => ({
    slug: m[1],
    price: m[2] === "NULL" ? null : Number(m[2]),
    active: m[3] === "true",
  }));

  it("the applied-ledger plans update records exactly the mapped DB slugs at the approved figures", () => {
    for (const m of Object.values(MAPPING)) {
      const row = rows.find((r) => r.slug === m.dbSlug);
      expect(row, m.dbSlug).toBeDefined();
      expect(row!.price, m.dbSlug).toBe(m.approvedEurMonthly);
      expect(row!.active, m.dbSlug).toBe(true);
    }
    for (const s of RETIRED_DB_SLUGS) {
      const row = rows.find((r) => r.slug === s);
      expect(row, s).toBeDefined();
      expect(row!.price).toBeNull();
      expect(row!.active).toBe(false);
    }
  });

  it("the seed migration seeds the same DB slugs (mapped + retired) and no migration sets a different figure", () => {
    const seed = read(join(REPO, "supabase/migrations/0002_reference_data.sql"));
    const block = seed.slice(seed.indexOf("insert into public.plans"));
    const seeded = [...block.slice(0, 1500).matchAll(/^\s*\('([a-z]+)',/gm)].map((m) => m[1]).sort();
    expect(seeded).toEqual([...Object.values(MAPPING).map((m) => m.dbSlug), ...RETIRED_DB_SLUGS].sort());
    // the seed is price-free (figures are data-applied, ledger-recorded)
    expect(block.slice(0, 1500)).not.toMatch(/,\s*\d+(\.\d+)?,\s*'\{/);
    const dir = join(REPO, "supabase/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const t = read(join(dir, f));
      expect(/update\s+(public\.)?plans\s+set[^;]*price_eur_monthly/i.test(t), `${f} sets a plan price outside the ledger`).toBe(false);
    }
  });

  it("the public pricing registry lists only mapped, priced DB slugs", () => {
    const m = read(join(WEB, "lib/marketing/plans.ts")).match(/PLAN_SLUGS = \[([^\]]+)\] as const/);
    const slugs = [...(m?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    expect(slugs).toEqual(Object.values(MAPPING).map((x) => x.dbSlug));
  });
});

describe("canonical typed catalogue (lib/commercial/plan-catalogue.ts) <-> pinned mapping", () => {
  it("catalogue dbSlug / stripeSlot (plan-key slot id; env names live only in prices.ts) agree with MAPPING and the deferred slots, key for key", async () => {
    const { PLAN_CATALOGUE, RETIRED_DB_ROWS } = await import("@/lib/commercial/plan-catalogue");
    for (const [k, m] of Object.entries(MAPPING)) {
      const e = PLAN_CATALOGUE.find((p) => p.slug === k)!;
      expect(e.commercial.dbSlug, k).toBe(m.dbSlug);
      expect(e.commercial.stripeSlot, k).toBe(m.stripeEnv ? k : null);
    }
    for (const [k, slot] of Object.entries(DEFERRED_STRIPE_SLOTS)) {
      const e = PLAN_CATALOGUE.find((p) => p.slug === k)!;
      expect(e.commercial.stripeSlot, `${k} (${slot})`).toBe(k);
      expect(e.commercial.dbSlug, k).toBeNull();
    }
    expect(RETIRED_DB_ROWS.map((r) => r.dbSlug).sort()).toEqual([...RETIRED_DB_SLUGS].sort());
  });

  it("the catalogue carries no EUR figure either (it references the DB row, it never copies the number)", () => {
    expect(/\b\d{2,}\s*(€|EUR)|(€|EUR)\s*\d{2,}|price_eur_monthly:\s*\d|cents/i.test(stripComments(read(join(WEB, "lib/commercial/plan-catalogue.ts"))))).toBe(false);
  });
});
