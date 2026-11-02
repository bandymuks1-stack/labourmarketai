import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ops/vps/lm-stripe-arm.sh keeps what is already on the VPS (owner 2026-10-21):
 * Enter keeps a valid current value, every arm/off run snapshots the whole env
 * first (never pruned), and `restore` puts that snapshot back.
 */
const SRC = readFileSync(join(__dirname, "..", "..", "..", "..", "ops", "vps", "lm-stripe-arm.sh"), "utf8");

describe("lm-stripe-arm.sh keeps, snapshots and restores", () => {
  it("snapshots the env before the first change of an arm/off run", () => {
    const snap = SRC.indexOf('cp -p "$ENVF" "$SNAP"');
    expect(snap).toBeGreaterThan(0);
    expect(snap).toBeLessThan(SRC.indexOf("put PAYMENTS_ENABLED false"));
    expect(snap).toBeLessThan(SRC.indexOf('put BILLING_PILOT_ORGANIZATION_IDS "$PILOT"'));
    expect(SRC).toContain("env.prearm-");
  });

  it("Enter keeps only a value valid for the mode being armed", () => {
    expect(SRC).toMatch(/if \[ -z "\$SK" \]; then SK=\$\(cur STRIPE_SECRET_KEY\); KEPT_SK=1/);
    expect(SRC).toMatch(/\[ "\$OLDMODE" = "\$MODE" \] \|\| \{ echo "STOP: the current webhook secret/);
    expect(SRC).toMatch(/\[ "\$OLDMODE" = "\$MODE" \] \|\| \{ echo "STOP: the current price/);
    expect(SRC).toContain('[ "$MODE" = live ] || case "$SK" in rk_live_*) echo "STOP: a live key in test mode"');
  });

  it("every check runs before the first write", () => {
    const firstPut = SRC.indexOf('put BILLING_PILOT_ORGANIZATION_IDS "$PILOT"');
    for (const check of ['echo "STOP: no valid webhook signing secret', 'echo "STOP: no valid price id', "not a $MODE secret key"]) {
      expect(SRC.indexOf(check), check).toBeLessThan(firstPut);
    }
  });

  it("restore asks for RESTORE, saves the current env first and never prints a value", () => {
    expect(SRC).toContain('[ "$OK" = RESTORE ]');
    expect(SRC.indexOf('cp -p "$ENVF" "$KEEP"')).toBeLessThan(SRC.indexOf('mv "$ENVF.new" "$ENVF"'));
    expect(SRC).not.toMatch(/(echo|printf) "[^"\n]*\$\{?(SK|WH)\b/);
  });
});
