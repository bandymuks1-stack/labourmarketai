import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DEPLOY SSH RETRY (owner order 2026-11-24, run 45406594897: "ssh: connect to
 * host … port 22: Connection timed out"). A connection that never reached the
 * VPS is tried again, bounded; a deploy the receiver has started is never sent
 * twice, because the receiver switches builds and rolls back by itself.
 */
const wf = readFileSync(join(__dirname, "..", "..", "..", "..", ".github/workflows/deploy-vps.yml"), "utf8");
const ship = wf.slice(wf.indexOf("- name: Ship + activate on the VPS"), wf.indexOf("- name: Public verification through Cloudflare"));

describe("the ship step retries only a connection that never started the receiver", () => {
  it("at most 3 tries, 60 s then 120 s apart", () => {
    expect(ship).toMatch(/for try in 1 2 3; do/);
    expect(ship).toMatch(/if \[ "\$try" -lt 3 \]; then sleep \$\(\(try \* 60\)\); continue; fi/);
  });

  it("retries only on ssh exit 255 with no `previous=` line (the receiver prints it first)", () => {
    expect(ship).toMatch(/if \[ "\$code" -eq 255 \] && ! grep -q '\^previous=' deploy\.log; then/);
    const receiver = readFileSync(join(__dirname, "..", "..", "..", "..", "ops/vps/lm-deploy-receive.sh"), "utf8");
    const deploy = receiver.slice(receiver.indexOf("  deploy)"));
    // `previous=` is the receiver's first output line for a deploy, before it reads the tarball.
    expect(deploy.indexOf('echo "previous=')).toBeGreaterThan(-1);
    expect(deploy.indexOf('echo "previous=')).toBeLessThan(deploy.indexOf('cat > "$T/release.tgz"'));
  });

  it("bounds the connection, never the started session", () => {
    expect(ship).toContain("-o ConnectTimeout=30");
    expect(ship).not.toMatch(/ServerAlive/);
  });

  it("names the VPS network when every try fails, and still requires DEPLOY_OK otherwise", () => {
    expect(ship).toContain("::error::VPS NETWORK:");
    expect(ship).toMatch(/grep -q '\^DEPLOY_OK ' deploy\.log \|\| \{/);
  });
});
