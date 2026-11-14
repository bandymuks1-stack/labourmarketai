import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A colleague with the manage-demand capability may shortlist a found person,
 * and was then shown the "contact" button. The server starts a conversation
 * only for the need's AUTHOR, so for a colleague that button always refused:
 * a dead control. The page now offers it to the author only and tells a
 * colleague why. Whether colleagues SHOULD be able to contact is an access
 * decision that stays open; this guard pins only that page and server agree.
 */
const web = join(__dirname, "..", "..");
const page = readFileSync(join(web, "app/[locale]/dashboard/company/scouting/page.tsx"), "utf8");
const server = readFileSync(join(web, "lib/communication/request-worker-conversation.ts"), "utf8");

describe("scouting: the contact button is offered only where the server accepts it", () => {
  it("the server still accepts only the need's author", () => {
    expect(server).toMatch(/\.eq\("id", requestId\)\s+\.eq\("profile_id", user\.id\)/);
  });

  it("every contact button on the page sits behind the author check", () => {
    const buttons = page.split("<RequestCommunicationButton").length - 1;
    expect(buttons).toBe(3);
    const guarded = page.match(/result(\?\.kind === "ok" && result)?\.demand\.ownedByCaller \? \(\s+<RequestCommunicationButton/g);
    expect(guarded?.length).toBe(buttons);
  });

  it("a colleague is told why, in every active locale", () => {
    expect(page.split('t("request.authorOnly")').length - 1).toBe(3);
    for (const locale of activeLocales) {
      const m = JSON.parse(readFileSync(join(web, "messages", `${locale}.json`), "utf8"));
      expect(m?.scouting?.request?.authorOnly, locale).toBeTruthy();
    }
  });
});

describe("scouting: proposing dates is offered only where the database accepts it", () => {
  const repo = join(web, "..", "..");
  const fn = readFileSync(
    join(repo, "supabase/migrations/20261021095200_booking_propose_reachable_open_v1.sql"),
    "utf8",
  );

  it("the database function still accepts only the need's author", () => {
    expect(fn).toMatch(/where cr\.id = p_request_id and cr\.profile_id = uid;/);
    expect(fn).toContain("raise exception 'Not your demand'");
  });

  it("every propose-dates button on the page sits behind the author check", () => {
    const buttons = page.split("<ProposeBookingButton").length - 1;
    expect(buttons).toBe(3);
    const guarded = page.match(/\{result(\?\.kind === "ok" && result)?\.demand\.ownedByCaller \? \(\s+<ProposeBookingButton/g);
    expect(guarded?.length).toBe(buttons);
  });
});
