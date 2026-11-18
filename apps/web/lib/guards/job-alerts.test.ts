import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_ENTITY_HREF,
  NOTIFICATION_EVENT_TYPES,
} from "@/lib/notifications/events";

/**
 * JOB ALERTS (stream N) — structural pins. Behaviour is in
 * lib/opportunities/job-alert-model.test.ts; these pin the wiring that stops
 * the feature becoming a parallel system or a spam source.
 */
const web = path.resolve(__dirname, "../..");
const repo = path.resolve(web, "../..");
const read = (p: string) => readFileSync(p, "utf8");
// The VPS cron file is the ONE owner of scheduled routes since the 2026-10-17 move off
// Vercel (vercel.json and its crons were removed 2026-10-18). Active lines only.
const vpsCron = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("SHELL="))
    .map((l) => {
      const m = l.match(/^(\S+ \S+ \S+ \S+ \S+) root sh \/root\/lm-prod\/bin\/lm-cron\.sh (\S+)$/);
      return m ? { schedule: m[1], path: `/api/cron/${m[2]}` } : { schedule: "", path: l };
    });


describe("job alerts ride the EXISTING notification store", () => {
  it("is one more event type + entity type, not a new table", () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain("job_alert");
    expect(NOTIFICATION_ENTITY_HREF.public_vacancy).toBe("/jobs");
    const mig = read(
      path.join(repo, "supabase/migrations/20261001110000_job_alert_notification_type_v1.sql"),
    );
    expect(mig).toMatch(/'job_alert'/);
    expect(mig).toMatch(/'public_vacancy'/);
    expect(mig).not.toMatch(/create table/i);
    expect(
      existsSync(
        path.join(repo, "supabase/rollbacks/20261001110000_job_alert_notification_type_v1.down.sql"),
      ),
    ).toBe(true);
  });

  it("goes through `deliver` (the consent gate) with a hash-derived exactly-once id", () => {
    const src = read(path.join(web, "lib/notifications/event-emitters.ts"));
    const block = src.slice(src.indexOf("JOB ALERTS (stream N"));
    expect(block).toMatch(/await deliver\(/);
    expect(block).toMatch(/jobAlertEntityId\(v\.storeId, v\.contentHash\)/);
    // never a direct insert that would bypass preferences / dedupe
    expect(block).not.toMatch(/\.from\("notification_events"\)\s*\.insert/);
  });

  it("reads jobs through the canonical vacancy read, not a second query", () => {
    const src = read(path.join(web, "lib/opportunities/job-alert-candidates.ts"));
    expect(src).toMatch(/searchPublicVacancies/);
    expect(src).not.toMatch(/\.from\(["']public_vacancies["']\)/);
  });
});

describe("the sweep is fail-closed and scheduled without a new cron slot", () => {
  it("route authorizes with the machine secret", () => {
    const src = read(path.join(web, "app/api/cron/job-alerts/route.ts"));
    expect(src).toMatch(/authorizeCronRequest/);
  });
  it("scheduled exactly once, by the VPS cron (vercel.json is gone; no second scheduler)", () => {
    const cron = vpsCron(read(path.join(web, "..", "..", "ops/vps/labourmarket.cron")));
    expect(cron.filter((c) => c.path === "/api/cron/job-alerts")).toHaveLength(1);
    expect(existsSync(path.join(web, "vercel.json"))).toBe(false);
  });
});

describe("copy exists in every locale", () => {
  for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
    it(`${loc}: bell label + readiness card`, () => {
      const m = JSON.parse(read(path.join(web, `messages/${loc}.json`)));
      expect(m.auth.notifications.types.event_job_alert, loc).toBeTruthy();
      for (const k of ["title", "ready", "missing", "profession", "country", "cta"]) {
        expect(m.opportunities.jobAlerts[k], `${loc}.${k}`).toBeTruthy();
      }
    });
  }
});
