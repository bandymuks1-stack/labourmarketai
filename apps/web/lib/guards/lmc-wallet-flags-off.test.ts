/**
 * Guard — LMC WALLET SERVER LAYER SHIPS WITH EVERY FLAG OFF (Wagon 2,
 * owner order 2026-10-21: "build and test the purchase, spend and ledger flows
 * behind the flags, and leave them OFF until the owner approves").
 *
 * Fails the build if:
 *   1. any LMC flag constant stops being a literal `false as const`;
 *   2. a wallet entry point reaches a client or an RPC before its kill-switch
 *      (statically, by source order, AND behaviourally, with the real flags);
 *   3. the wallet module stops being `server-only`;
 *   4. any billing module or billing route imports it (Stripe ⟂ LMC — the
 *      top-up path is Wagon 4 and must arrive through its own reviewed seam);
 *   5. anything outside lib/lmc imports it (no product call site until the
 *      owner arms it).
 *
 * STRENGTHENED, never disabled.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const createAdminClient = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("createAdminClient must not be reached while the flags are off");
  }),
);
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

import * as flags from "@/lib/billing/lmc-flags";
import {
  recordLmcPurchase,
  spendLmc,
  spendLmcForAction,
  type LmcWalletRpcClient,
} from "@/lib/lmc/wallet";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const WALLET = "lib/lmc/wallet.ts";
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(f)) acc.push(p);
  }
  return acc;
}
const rel = (file: string) =>
  file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

/** Each exported async entry point → the flag(s) it must check first. */
const ENTRY_POINTS: Record<string, string[]> = {
  recordLmcPurchase: ["LMC_PURCHASES_ENABLED"],
  spendLmc: ["LMC_SPENDING_ENABLED"],
  spendLmcForAction: ["LMC_SPENDING_ENABLED", "LMC_COMPENSATION_ENABLED"],
};

describe("LMC wallet — every flag stays OFF", () => {
  it("every LMC flag constant is a literal false as const", () => {
    const src = read("lib/billing/lmc-flags.ts");
    const decls = [...src.matchAll(/export const (\w+_ENABLED) = (.+);/g)];
    expect(decls.length).toBe(7);
    for (const [, name, value] of decls) {
      expect(value, name).toBe("false as const");
      expect((flags as Record<string, unknown>)[name], name).toBe(false);
    }
    expect(flags.lmcCommerceEnabled()).toBe(false);
  });
});

describe("LMC wallet — the flag is checked before any DB call", () => {
  const src = read(WALLET);
  const exportedAsync = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);

  it("the guard knows every exported async entry point", () => {
    expect(exportedAsync.sort()).toEqual(Object.keys(ENTRY_POINTS).sort());
  });

  for (const [fn, required] of Object.entries(ENTRY_POINTS)) {
    it(`${fn}: ${required.join(" + ")} gate precedes client/RPC use (source order)`, () => {
      const start = src.indexOf(`export async function ${fn}`);
      const next = src.indexOf("export ", start + 10);
      const whole = src.slice(start, next === -1 ? undefined : next);
      // The body starts after the signature's return type — the function's
      // own name in its declaration is not a call.
      const sig = whole.match(/\):\s*Promise<[\s\S]*?>\s*\{/);
      expect(sig, `${fn} signature`).not.toBeNull();
      const body = whole.slice(sig!.index! + sig![0].length);
      const firstDb = Math.min(
        ...[/walletClient\(/, /createAdminClient\(/, /\.rpc\(/, /spendLmc\(/, /compensateSpend\(/]
          .map((rx) => body.search(rx))
          .filter((i) => i >= 0),
      );
      expect(Number.isFinite(firstDb), `${fn} has no DB call?`).toBe(true);
      for (const flag of required) {
        const gate = body.search(new RegExp(`if \\(!${flag}\\) \\{\\s*return \\{ kind: "disabled"`));
        expect(gate, `${fn} must check ${flag}`).toBeGreaterThan(-1);
        expect(gate, `${fn}: ${flag} must come before the first DB call`).toBeLessThan(firstDb);
      }
    });
  }

  it("behaviourally: with the real flags, no client is built and no RPC runs", async () => {
    const rpc = vi.fn();
    const c = { rpc } as unknown as LmcWalletRpcClient;
    const person = { type: "person", profileId: "11111111-1111-4111-8111-111111111111" } as const;
    const actor = "33333333-3333-4333-8333-333333333333";
    const outs = [
      await recordLmcPurchase({ subject: person, amountCents: 100, providerReference: "ref", idempotencyKey: "key-00000001" }),
      await recordLmcPurchase({ subject: person, amountCents: 100, providerReference: "ref", idempotencyKey: "key-00000001" }, c),
      await spendLmc({ subject: person, amountCents: 100, reason: "r", idempotencyKey: "key-00000002", actorProfileId: actor }),
      await spendLmc({ subject: person, amountCents: 100, reason: "r", idempotencyKey: "key-00000002", actorProfileId: actor }, c),
      await spendLmcForAction(
        { subject: person, amountCents: 100, reason: "r", idempotencyKey: "key-00000003", actorProfileId: actor, actionLabel: "x" },
        async () => "never",
        c,
      ),
    ];
    for (const o of outs) expect(o).toMatchObject({ kind: "disabled", layer: "code" });
    expect(rpc).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("LMC wallet — boundaries", () => {
  it("the wallet module is server-only", () => {
    expect(read(WALLET).trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("no billing module or billing route imports the wallet (Stripe ⟂ LMC)", () => {
    const offenders: string[] = [];
    for (const dir of [join(webRoot, "lib", "billing"), join(webRoot, "app", "api", "billing")]) {
      for (const file of sources(dir)) {
        if (/lmc\/wallet|lib\/lmc\b/.test(readFileSync(file, "utf8"))) offenders.push(rel(file));
      }
    }
    expect(offenders, `billing imports LMC wallet:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("nothing outside lib/lmc imports the wallet yet (no armed call site)", () => {
    const offenders: string[] = [];
    for (const root of ["app", "lib", "components"]) {
      for (const file of sources(join(webRoot, root))) {
        const r = rel(file);
        if (r.startsWith("lib/lmc/") || r.startsWith("lib/guards/")) continue;
        if (/["'`][^"'`]*lmc\/wallet["'`]/.test(readFileSync(file, "utf8"))) offenders.push(r);
      }
    }
    expect(offenders, `unexpected wallet call site:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the wallet calls only the two wrapped RPCs directly (compensation via its seam)", () => {
    const rpcs = [...read(WALLET).matchAll(/\.rpc\(\s*["'](\w+)["']/g)].map((m) => m[1]);
    expect(rpcs.sort()).toEqual(["lmc_record_purchase_v1", "lmc_spend_v1"]);
  });
});
