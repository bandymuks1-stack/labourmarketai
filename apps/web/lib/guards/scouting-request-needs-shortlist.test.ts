import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(__dirname, "../../app/[locale]/dashboard/company/scouting/page.tsx"),
  "utf8",
);

describe("scouting: the request-to-communicate button matches its server gate", () => {
  it("a matched candidate gets the button only once shortlisted, otherwise the page says what to do", () => {
    // The server gate (requestWorkerConversationAction) refuses a worker who is
    // not on the owner's shortlist; offering the button earlier produced a
    // generic error and no conversation (production walk 2026-10-01).
    expect(page).toMatch(/isShortlistedForContact\(c\.shortlistStatus\)\s*\?\s*\(\s*<RequestCommunicationButton/);
    expect(page).toMatch(/request\.shortlistFirst/);
  });
});
