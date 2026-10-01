import { describe, expect, it } from "vitest";

import {
  JOB_ALERT_MAX_PER_RUN,
  formatOfferedPay,
  jobAlertEntityId,
  jobAlertFacts,
  jobAlertFit,
  missingJobAlertCriteria,
  selectJobAlertVacancies,
  type JobAlertCriteria,
} from "./job-alert-model";
import { notificationEventHref, notificationDedupeKey } from "@/lib/notifications/events";

const NOW = "2026-10-01T10:00:00.000Z";
const crit = (o: Partial<JobAlertCriteria> = {}): JobAlertCriteria => ({
  professionSlugs: ["welder"],
  preferredCountries: ["NO"],
  salaryMinEur: null,
  ...o,
});
type V = Parameters<typeof jobAlertFit>[1] & {
  publishedAt: string;
  capturedAt: string;
  storeId: string | null;
  titleRaw: string;
};
const vac = (o: Partial<V> = {}): V => ({
  professionSlug: "welder",
  location: { country: "NO", region: null, city: null, lat: null, lng: null } as V["location"],
  compensation: { currency: null, min: null, max: null, description: null },
  expiresAt: null,
  publishedAt: "2026-10-01T08:00:00.000Z",
  capturedAt: "2026-10-01T08:30:00.000Z",
  storeId: "11111111-1111-4111-8111-111111111111",
  titleRaw: "Sveiser",
  ...o,
});

describe("job alert criteria — missing preferences are named, never invented", () => {
  it("needs a profession and a country; salary is optional", () => {
    expect(missingJobAlertCriteria(crit())).toEqual([]);
    expect(missingJobAlertCriteria(crit({ professionSlugs: [] }))).toEqual(["profession"]);
    expect(missingJobAlertCriteria(crit({ preferredCountries: [] }))).toEqual(["country"]);
    expect(
      missingJobAlertCriteria(crit({ professionSlugs: [], preferredCountries: [] })),
    ).toEqual(["profession", "country"]);
  });
  it("a person with missing criteria fits nothing", () => {
    expect(jobAlertFit(crit({ preferredCountries: [] }), vac(), NOW)).toEqual({
      fits: false,
      why: "missing_criteria",
    });
  });
});

describe("job alert fit — the engine's own profession / country / pay rules", () => {
  it("matching profession + country fits", () => {
    expect(jobAlertFit(crit(), vac(), NOW).fits).toBe(true);
  });
  it("wrong profession -> no alert", () => {
    expect(jobAlertFit(crit(), vac({ professionSlug: "painter" }), NOW)).toEqual({
      fits: false,
      why: "profession",
    });
    expect(jobAlertFit(crit(), vac({ professionSlug: null }), NOW).fits).toBe(false);
  });
  it("wrong country -> no alert; changed preferences change the answer", () => {
    const v = vac({ location: { country: "SE" } as V["location"] });
    expect(jobAlertFit(crit(), v, NOW)).toEqual({ fits: false, why: "country" });
    expect(jobAlertFit(crit({ preferredCountries: ["NO", "SE"] }), v, NOW).fits).toBe(true);
    expect(jobAlertFit(crit({ professionSlugs: ["painter"] }), vac(), NOW).fits).toBe(false);
  });
  it("expected pay above a stated EUR ceiling excludes; at or below fits", () => {
    const paid = vac({ compensation: { currency: "EUR", min: 2000, max: 3000, description: null } });
    expect(jobAlertFit(crit({ salaryMinEur: 3500 }), paid, NOW)).toEqual({
      fits: false,
      why: "salary_above_offer",
    });
    expect(jobAlertFit(crit({ salaryMinEur: 3000 }), paid, NOW)).toEqual({
      fits: true,
      salaryKnown: true,
    });
  });
  it("UNKNOWN pay is never zero and never a mismatch", () => {
    expect(jobAlertFit(crit({ salaryMinEur: 9999 }), vac(), NOW)).toEqual({
      fits: true,
      salaryKnown: false,
    });
    // A non-EUR figure is not comparable: unknown, not excluded.
    const sek = vac({ compensation: { currency: "SEK", min: 100, max: 200, description: null } });
    expect(jobAlertFit(crit({ salaryMinEur: 9999 }), sek, NOW).fits).toBe(true);
    expect(formatOfferedPay(sek)).toBeNull();
    // No worker expectation: nothing is excluded on pay.
    const paid = vac({ compensation: { currency: "EUR", min: 1, max: 2, description: null } });
    expect(jobAlertFit(crit({ salaryMinEur: null }), paid, NOW).fits).toBe(true);
  });
  it("an expired ad is not announced as active", () => {
    expect(jobAlertFit(crit(), vac({ expiresAt: "2026-09-30T00:00:00.000Z" }), NOW)).toEqual({
      fits: false,
      why: "not_live",
    });
  });
});

describe("selection — new work only, newest first, capped, exactly-once identity", () => {
  it("old ads are on the board, not in the bell", () => {
    const old = vac({ publishedAt: "2026-09-01T00:00:00.000Z", storeId: "22222222-2222-4222-8222-222222222222" });
    expect(selectJobAlertVacancies(crit(), [old], NOW)).toEqual([]);
  });
  it("caps a burst to the newest few", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      vac({
        storeId: `00000000-0000-4000-8000-00000000000${i}`,
        publishedAt: `2026-10-01T0${i}:00:00.000Z`,
      }),
    );
    const out = selectJobAlertVacancies(crit(), many, NOW);
    expect(out).toHaveLength(JOB_ALERT_MAX_PER_RUN);
    expect(out[0].publishedAt > out[1].publishedAt).toBe(true);
  });
  it("same job + same revision -> same dedupe key; changed revision -> new fact", () => {
    const a = jobAlertEntityId("11111111-1111-4111-8111-111111111111", "h1");
    expect(jobAlertEntityId("11111111-1111-4111-8111-111111111111", "h1")).toBe(a);
    expect(jobAlertEntityId("11111111-1111-4111-8111-111111111111", "h2")).not.toBe(a);
    expect(notificationDedupeKey("job_alert", a)).toBe(`job_alert:${a}`);
  });
});

describe("first layer + link", () => {
  it("facts are public-ad facts; salary only when stated in EUR", () => {
    const f = jobAlertFacts(
      vac({ compensation: { currency: "EUR", min: 2500, max: 3200, description: null } }),
    );
    expect(f).toMatchObject({ title: "Sveiser", country: "NO", salary: "2500-3200 EUR" });
    expect(jobAlertFacts(vac())?.salary).toBeNull();
  });
  it("a job alert opens THE job, not a list", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(notificationEventHref("public_vacancy", { vacancyId: id })).toBe(`/jobs/${id}`);
    expect(notificationEventHref("public_vacancy", { vacancyId: "../x" })).toBe("/jobs");
  });
});
