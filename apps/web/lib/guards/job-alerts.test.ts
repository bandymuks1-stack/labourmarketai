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
  it("vercel.json keeps its two crons (Hobby limit); no job-alerts cron added there", () => {
    const v = JSON.parse(read(path.join(web, "vercel.json"))) as {
      crons: { path: string }[];
    };
    expect(v.crons).toHaveLength(2);
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
