import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bounceReaderConfigFromEnv, fetchedLiteral, readRecentDeliveryReports, searchUids } from "@/lib/email/bounce-reader";

const SMTP = {
  LM_SMTP_HOST: "smtp.example.test",
  LM_SMTP_USER: "info@labourmarket.ai",
  LM_SMTP_PASS: "not-a-real-secret",
  LM_SMTP_FROM: "LabourMarket.ai <info@labourmarket.ai>",
};

describe("bounce reader configuration", () => {
  it("reuses the sender mailbox credentials; needs LM_IMAP_HOST and implicit TLS 993", () => {
    expect(bounceReaderConfigFromEnv({})).toBeNull();
    expect(bounceReaderConfigFromEnv(SMTP)).toBeNull();
    expect(bounceReaderConfigFromEnv({ ...SMTP, LM_IMAP_HOST: "imap.example.test", LM_IMAP_PORT: "143" })).toBeNull();
    expect(bounceReaderConfigFromEnv({ ...SMTP, LM_IMAP_HOST: "imap.example.test" })).toEqual({
      host: "imap.example.test",
      port: 993,
      user: "info@labourmarket.ai",
      pass: "not-a-real-secret",
      ourDomain: "labourmarket.ai",
    });
  });

  it("not configured → an honest not_configured, no connection", async () => {
    await expect(readRecentDeliveryReports({ config: null })).resolves.toEqual({ status: "not_configured" });
  });
});

describe("IMAP answer parsing", () => {
  it("search UIDs newest first, bounded", () => {
    expect(searchUids("* SEARCH 4 19 7\r\nA3 OK done\r\n")).toEqual([19, 7, 4]);
    expect(searchUids("* SEARCH\r\nA3 OK\r\n")).toEqual([]);
    expect(searchUids("* SEARCH 1 2 3 4 5\r\n", 2)).toEqual([5, 4]);
  });
  it("the fetched literal is exactly n bytes", () => {
    expect(fetchedLiteral("* 1 FETCH (UID 9 BODY[] {5}\r\nHelloEXTRA)\r\nA4 OK\r\n")).toBe("Hello");
    expect(fetchedLiteral("A4 NO\r\n")).toBe("");
  });
});

describe("the reader is read-only (source pin)", () => {
  it("uses EXAMINE and BODY.PEEK only — never SELECT, STORE, EXPUNGE, COPY, MOVE or plain BODY[]", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./bounce-reader.ts", import.meta.url), "utf8");
    const commands = src.match(/`(?:UID |)(?:[A-Z]+)[^`]*`|"(?:EXAMINE|SELECT)[^"]*"/g) ?? [];
    const joined = commands.join(" ");
    expect(joined).toContain("EXAMINE INBOX");
    expect(joined).toContain("BODY.PEEK[]");
    expect(src).not.toMatch(/\b(SELECT INBOX|STORE|EXPUNGE|UID COPY|UID MOVE|\+FLAGS)\b/);
    expect(src).not.toMatch(/FETCH \$\{uid\} \(BODY\[\]\)/);
  });
});
