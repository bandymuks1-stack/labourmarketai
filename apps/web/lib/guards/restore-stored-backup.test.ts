import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stored-backup test restores decrypted production data, so its only possible target is a throw-away
 * local container (owner order 2026-11-05: never into the running production database).
 */
const path = resolve(__dirname, "../../../../ops/restore-stored-backup.sh");
const script = readFileSync(path, "utf8").replace(/\r/g, "");
const code = script.split("\n").filter((l) => !l.startsWith("#")).join("\n");

describe("restore-stored-backup.sh can only reach its own container", () => {
  it("takes no target: no host, URL, port or password option", () => {
    const options = [...code.matchAll(/^\s+--([a-z-]+)\)/gm)].map((m) => m[1]);
    expect(options.sort()).toEqual(["db", "files", "keep", "key", "on-disk", "run", "run-log"]);
  });

  it("names no database URL or remote host", () => {
    expect(code).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|pooler|PGHOST|DATABASE_URL|SUPABASE_[A-Z]|\bssh\b|labourmarket\.ai/);
    for (const m of code.matchAll(/\s-h\s+(\S+)/g)) expect(m[1]).toBe("127.0.0.1");
  });

  it("runs database tools only inside the container", () => {
    expect(code).toContain('ex() { docker exec -i "$C" "$@"; }');
    expect(code).toContain("--network none");
    expect(code).not.toMatch(/\s-p\s+\d|--publish|--network host/);
    expect(code).not.toMatch(/^\s*(psql|pg_restore)\b/m);
  });

  it("checks the target before decrypting", () => {
    expect(code.indexOf("the target is not the expected throw-away container")).toBeGreaterThan(-1);
    expect(code.indexOf("the target is not the expected throw-away container")).toBeLessThan(code.indexOf('echo "5. decrypt"'));
  });

  it("stops at once on a remote Docker", () => {
    for (const host of ["ssh://root@example.test", "tcp://10.0.0.1:2375"]) {
      const r = spawnSync("bash", [path, "--run", "1", "--key", "k", "--db", "d", "--files", "f"], {
        encoding: "utf8",
        env: { ...process.env, DOCKER_HOST: host },
      });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("DOCKER_HOST points away");
    }
  });
});
