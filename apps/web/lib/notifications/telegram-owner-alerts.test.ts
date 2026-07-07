import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * OWNER TELEGRAM ALERTS v1 — SAFETY GUARDS + BEHAVIOR.
 *
 * Proves the demand-signal alert is: server-only, env-gated (no-op when
 * unconfigured), plain-text (no markup injection), best-effort (never throws /
 * never blocks the /company-need submit), fired only after persistence success,
 * and scoped to the single event that actually exists (company_need_submitted).
 * All network calls are mocked — no real Telegram request is made.
 */

const HELPER = join(__dirname, "telegram-owner-alerts.ts");
const ACTION = join(__dirname, "..", "staffing", "company-need-form-actions.ts");
const ENV = join(__dirname, "..", "env.ts");
const readF = (p: string) => readFileSync(p, "utf8");

const configureEnv = () => {
  vi.stubEnv("OWNER_TELEGRAM_ALERTS_ENABLED", "true");
  vi.stubEnv("OWNER_TELEGRAM_BOT_TOKEN", "123456:test-token");
  vi.stubEnv("OWNER_TELEGRAM_CHAT_ID", "999");
};

// env.ts parses process.env at module load, so reset + dynamic-import after
// stubbing so the helper sees the intended configuration.
async function loadHelper() {
  vi.resetModules();
  return import("./telegram-owner-alerts");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("static safety shape", () => {
  const src = readF(HELPER);

  it("is server-only and reads token/chat from server env (never NEXT_PUBLIC)", () => {
    expect(src).toContain('import "server-only"');
    expect(src).toContain("OWNER_TELEGRAM_BOT_TOKEN");
    expect(src).toContain("OWNER_TELEGRAM_CHAT_ID");
    expect(src).not.toMatch(/NEXT_PUBLIC[A-Z_]*(TELEGRAM|TOKEN|CHAT)/);
  });

  it("sends PLAIN TEXT (no parse_mode) so user fields cannot inject markup", () => {
    expect(src).not.toContain("parse_mode");
  });

  it("points at the owner queue route", () => {
    expect(src).toContain("/dashboard/admin/company-need-intakes");
  });

  it("defines only the company_need event — no worker/company-search sender", () => {
    expect(src).not.toMatch(/send(Worker|CompanySearch|JobSearch)[A-Za-z]*Alert/);
  });

  it("registers the vars in the Zod env allowlist, none as NEXT_PUBLIC", () => {
    const envSrc = readF(ENV);
    for (const v of [
      "OWNER_TELEGRAM_ALERTS_ENABLED",
      "OWNER_TELEGRAM_BOT_TOKEN",
      "OWNER_TELEGRAM_CHAT_ID",
    ]) {
      expect(envSrc).toContain(v);
      expect(envSrc).not.toContain(`NEXT_PUBLIC_${v}`);
    }
  });
});

describe("env gating + best-effort behavior (fetch mocked)", () => {
  it("is a silent no-op and makes NO network call when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendCompanyNeedOwnerAlert } = await loadHelper();
    await expect(
      sendCompanyNeedOwnerAlert({ companyName: "Acme" }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts plain text to the owner chat when configured", async () => {
    configureEnv();
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { sendCompanyNeedOwnerAlert } = await loadHelper();
    const ok = await sendCompanyNeedOwnerAlert({
      companyName: "Acme Statyba",
      country: "LT",
      sector: "construction",
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain(
      "https://api.telegram.org/bot123456:test-token/sendMessage",
    );
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("Acme Statyba");
    expect(body.text).toContain("/dashboard/admin/company-need-intakes");
    expect(body).not.toHaveProperty("parse_mode");
  });

  it("never throws and returns false when the network fails", async () => {
    configureEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const { sendCompanyNeedOwnerAlert } = await loadHelper();
    await expect(
      sendCompanyNeedOwnerAlert({ companyName: "Acme" }),
    ).resolves.toBe(false);
  });
});

describe("message builder", () => {
  it("includes the key fields + admin route and truncates long values", async () => {
    const { buildCompanyNeedAlertText } = await loadHelper();
    const long = "x".repeat(500);
    const text = buildCompanyNeedAlertText({
      companyName: long,
      contact: "Jonas jonas@example.com",
      sector: "construction",
      country: "LT",
      cityRegion: "Vilnius",
      headcount: 5,
      urgency: "weeks",
    });
    expect(text).toContain("Naujas LabourMarket.ai įmonės poreikis");
    expect(text).toContain("construction");
    expect(text).toContain("Vilnius");
    expect(text).toContain("/dashboard/admin/company-need-intakes");
    // long field is capped (not the full 500 chars)
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(500 + 400);
  });
});

describe("wiring into the /company-need action", () => {
  const action = readF(ACTION);

  it("fires the alert ONLY after persistence success", () => {
    expect(action).toContain("sendCompanyNeedOwnerAlert");
    expect(action).toMatch(
      /if \(persisted\)[\s\S]{0,600}sendCompanyNeedOwnerAlert/,
    );
  });

  it("isolates the alert so a failure cannot break submission", () => {
    // the call site is wrapped in try/catch (defense-in-depth)
    expect(action).toMatch(
      /try \{[\s\S]{0,600}sendCompanyNeedOwnerAlert[\s\S]{0,900}catch/,
    );
  });
});
