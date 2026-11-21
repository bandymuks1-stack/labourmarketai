import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The production deploy bundle for services/transcribe (COM-6). It must keep
 * the service private behind TLS, never carry a secret, and never print one.
 */
const DEPLOY = join(__dirname, "..", "..", "..", "..", "services", "transcribe", "deploy");
const read = (f: string) => readFileSync(join(DEPLOY, f), "utf8").replace(/\r/g, "");

describe("transcribe production bundle", () => {
  const compose = read("docker-compose.prod.yml");

  it("publishes only Caddy 80/443; the transcribe container is not published", () => {
    expect(compose).toMatch(/ports:\s*\n\s*- "80:80"\s*\n\s*- "443:443"/);
    expect(compose).not.toMatch(/8085:8085/);
    expect(compose).toContain("expose:");
  });

  it("requires the token and hostname from .env, with no inline secret", () => {
    expect(compose).toContain("TRANSCRIBE_TOKEN: ${TRANSCRIBE_TOKEN:?");
    expect(compose).toContain("${TRANSCRIBE_HOSTNAME:?");
    expect(compose).not.toMatch(/TRANSCRIBE_TOKEN:\s*[0-9a-f]{32,}/i);
  });

  it("keeps the container read-only with tmpfs and a memory cap", () => {
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("tmpfs:");
    expect(compose).toContain("memory:");
  });

  it("Caddy proxies only the two API paths and 404s the rest", () => {
    const caddy = read("Caddyfile");
    expect(caddy).toContain("/healthz /v1/transcribe");
    expect(caddy).toContain("respond 404");
  });

  it("bootstrap generates the token with a CSPRNG into a 600 file and never echoes it", () => {
    const sh = read("bootstrap.sh");
    expect(sh).toContain("openssl rand -hex 32");
    expect(sh).toContain("umask 077");
    expect(sh).toContain("not shown");
  });

  it("verify-live never logs the token", () => {
    const js = read("verify-live.mjs");
    expect(js).not.toMatch(/console\.\w+\([^)]*secret/);
  });

  it("the committed env example carries no token value", () => {
    const env = readFileSync(join(DEPLOY, "..", ".env.example"), "utf8");
    expect(env).toMatch(/^TRANSCRIBE_TOKEN=\s*$/m);
  });
});
