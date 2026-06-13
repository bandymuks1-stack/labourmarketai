/**
 * COMMUNICATION REQUEST SAFETY — permanent CI guard (Step 4A).
 *
 * The company → worker "request to communicate" must be gated, in-app only, and
 * leak nothing. Doctrine §4 (default-closed) + §7 (encode the negatives). The
 * behavioural proof is `lib/communication/communication-eligibility.test.ts`;
 * this guard pins the source wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const ACTION = "lib/communication/request-worker-conversation.ts";
const BUTTON = "components/app/request-communication-button.tsx";
const PAGE = "app/[locale]/dashboard/company/scouting/page.tsx";

describe("server action — gated + in-app only", () => {
  const src = code(read(ACTION));

  it("verifies demand ownership, shortlist, and contactability", () => {
    expect(src).toMatch(/customer_requests/);
    expect(src).toMatch(/demand_shortlist/);
    expect(src).toMatch(/canStartCommunicationOrBooking/);
    expect(src).toMatch(/evaluateCommunicationRequest/);
  });

  it("resolves the worker profile_id server-side and never returns it", () => {
    expect(src).toMatch(/profile_id/); // resolved here
    // The serializable result shape exposes only a conversationId / reason.
    expect(src).not.toMatch(/return\s*\{\s*ok:\s*true,\s*profileId/);
    expect(src).not.toMatch(/conversationId:\s*workerProfileId/);
  });

  it("reuses the existing backend — no new table or policy", () => {
    expect(src).toMatch(/getOrCreateDirectConversation/);
    expect(src).not.toMatch(/create table|create policy/i);
  });

  it("sends nothing external (no email/sms/telegram/http)", () => {
    expect(src).not.toMatch(/nodemailer|sendgrid|twilio|fetch\(|axios|smtp|sms|telegram/i);
  });
});

describe("client button — anonymized, never receives a profileId", () => {
  const src = code(read(BUTTON));

  it("takes only requestId + workerId (no worker profileId prop)", () => {
    expect(src).toMatch(/requestId/);
    expect(src).toMatch(/workerId/);
    expect(src).not.toMatch(/profileId/);
  });

  it("calls the gated server action", () => {
    expect(src).toMatch(/requestWorkerConversationAction/);
  });
});

describe("page — request button only when contactable", () => {
  const src = code(read(PAGE));
  it("renders RequestCommunicationButton behind canContact", () => {
    // Tolerates an optional wrapper element (PR6 places the ProposeBookingButton
    // alongside it, both gated behind the same canContact check).
    expect(src).toMatch(/c\.canContact\s*\?\s*\(?[\s\S]{0,200}?<RequestCommunicationButton/);
  });
  it("passes no worker profileId to the button", () => {
    const idx = src.indexOf("<RequestCommunicationButton");
    const slice = idx >= 0 ? src.slice(idx, idx + 400) : "";
    expect(slice).not.toMatch(/profileId/);
  });
});

describe("no fake acceptance / booking / contact-unlock language", () => {
  for (const rel of [ACTION, BUTTON, PAGE]) {
    const src = code(read(rel)).toLowerCase();
    it(`${rel}: honest`, () => {
      expect(src).not.toMatch(/worker accepted|booking confirmed|booked|contact unlocked|unlock contact/);
      expect(src).not.toMatch(/\bphone\b|\bemail\b/);
    });
  }
});

describe("i18n parity for the request copy (LT/EN/RU)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}.json carries scouting.request.*`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        scouting?: { request?: Record<string, unknown> };
      };
      const r = j.scouting?.request;
      expect(r?.button).toBeTruthy();
      expect(r?.opened).toBeTruthy();
      expect(r?.error).toBeTruthy();
      expect(JSON.stringify(r)).not.toContain("[EN]");
    });
  }
});
