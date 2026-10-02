import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDayObject } from "@/lib/journal/day-object";
import { nextActionForStage } from "@/lib/pipeline/candidate-pipeline";

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the manager sees work, not parser internals", () => {
  const inbox = read("app/[locale]/dashboard/inbox/page.tsx");
  it("only labelled metrics reach the card; the work date is carried separately", () => {
    expect(inbox).toMatch(/\.filter\(\(m\) => FIELD_LABEL_SLUGS\.has\(m\.metric_slug\)\)/);
    expect(inbox).toMatch(/workDate/);
  });
  it("the card says up front when the viewer cannot decide (server RPC stays the authority)", () => {
    expect(inbox).toMatch(/canApprove/);
    const card = read("components/app/journal-inbox-entry.tsx");
    expect(card).toMatch(/noApproveRight/);
    expect(card).toMatch(/entry\.workDate \?\? entry\.createdAt/);
  });
});

describe("'waiting' means submitted for confirmation, not 'nobody switched it on'", () => {
  const entry = (verification: string) => ({
    minutes: 60, photoCount: 0, verification, decisions: [], skills: [],
  }) as never;
  it("splits pending from not-enabled", () => {
    const d = buildDayObject([entry("verification_pending"), entry("verifier_available"), entry("verifier_not_identified"), entry("self_reported")]);
    expect(d.waitingCount).toBe(1);
    expect(d.recordedOnlyCount).toBe(2);
  });
  it("the timeline only claims 'waiting' when the entry is in a queue", () => {
    const t = read("components/app/evidence-decision-timeline.tsx");
    expect(t).toMatch(/events\.length === 0 && awaiting === false/);
  });
});

describe("scouting never turns 'nothing checked / no data' into a green match", () => {
  const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
  it("green only with a checked hard criterion and enough data", () => {
    expect(page).toMatch(/c\.match\.eligible && c\.match\.status !== "insufficient_data" && c\.match\.matchedHard\.length > 0/);
  });
  it("0 of N is not shown when the person stated no skills", () => {
    expect(page).toMatch(/identity\.skillUnknown/);
  });
});

describe("an accepted booking leads somewhere", () => {
  it("the next step is the project assign picker, not the bookings list", () => {
    const a = nextActionForStage("accepted", { locale: "lt", requestId: "r" } as never);
    expect(a.href).toBe("/lt/dashboard/projects#assign-worker");
    expect(a.key).toBe("candidatePipeline.action.assignToProject");
  });
});
