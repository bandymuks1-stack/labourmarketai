import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { messagingRefusal } from "@/lib/capabilities/messaging-capabilities";

/**
 * The MCP send tools relayed the communication core's Lithuanian developer
 * `message` to ChatGPT / Claude ("Nėra ryšio, leidžiančio pradėti pokalbį…"),
 * and through them to an English or Swedish person (Swedish employer audit
 * 2026-11-11, N-3 follow-up). The tools now keep the code and answer in
 * English by code; an unknown code reads as a generic English line.
 */
const src = readFileSync(join(__dirname, "..", "capabilities", "messaging-capabilities.ts"), "utf8");

describe("MCP messaging refusals are English, by code", () => {
  it("the send path never relays the core's message text", () => {
    expect(src).not.toMatch(/message: (opened|sent)\.message/);
    expect(src).toContain("return messagingRefusal(opened.code);");
    expect(src).toContain("return messagingRefusal(sent.code);");
  });

  it("rate_limited asserts neither limit nor a retry day", () => {
    const r = messagingRefusal("rate_limited");
    expect(r.ok ? "" : r.message).not.toMatch(/tomorrow|daily/i);
  });

  it.each([
    "invalid_input",
    "no_permission",
    "rate_limited",
    "rate_check_unavailable",
    "insert_failed",
    "not_a_participant",
    "rpc_unavailable",
    "not_authenticated",
    "update_failed",
    "something_new",
  ])("%s keeps its code and reads in English", (code) => {
    const r = messagingRefusal(code);
    expect(r).toMatchObject({ ok: false, code });
    const message = r.ok ? "" : (r.message ?? "");
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toMatch(/[ąčęėįšųūž]/i);
  });
});
