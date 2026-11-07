import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRequestDoor,
  REQUEST_DOORS,
  requestDoorFromSourcePath,
  requestDoorIntake,
  requestDoorSourcePath,
  type RequestDoor,
} from "./request-doors";

const persist = vi.fn();
const alert = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "de" }));
vi.mock("./company-need-public-intake", () => ({ persistPublicCompanyNeed: (i: unknown) => persist(i) }));
vi.mock("../notifications/telegram-owner-alerts", () => ({ sendCompanyNeedOwnerAlert: (a: unknown) => alert(a) }));

import { submitRequestDoorAction } from "./request-door-actions";

const reader = (f: Record<string, string>) => (name: string) => f[name] ?? "";
const contact = { name: "UAB Testas", email: "a@b.lt", country: "lt" };
const VALID: Record<RequestDoor, Record<string, string>> = {
  "worker-search": { ...contact, profession: "Mūrininkas", workers: "4", start: "2026-12-01", details: "Su A1" },
  b2b: { ...contact, work: "Fasadai", scope: "2000 m2", deadline: "kovas", city: "Vilnius" },
  project: { ...contact, need: "Vonios remontas", customer: "private" },
};

describe("the type is stored and comes back", () => {
  it.each(REQUEST_DOORS)("%s", (door) => {
    const intake = requestDoorIntake(door, "lt", reader(VALID[door]));
    expect(intake?.sourcePath).toBe(requestDoorSourcePath("lt", door));
    expect(requestDoorFromSourcePath(intake?.sourcePath)).toBe(door);
  });

  it("the path fits the RPC's limit, and the first line tells the operator the door", () => {
    for (const door of REQUEST_DOORS) {
      const intake = requestDoorIntake(door, "lt", reader(VALID[door]));
      expect(intake?.sourcePath.length).toBeLessThanOrEqual(200);
      expect(intake?.description.split("\n")[0]).toMatch(/užklausa$/);
    }
  });

  it("a source path that is no door is no door", () => {
    expect(requestDoorFromSourcePath("/lt/company-need")).toBeNull();
    expect(requestDoorFromSourcePath("/lt/request/other")).toBeNull();
    expect(requestDoorFromSourcePath(null)).toBeNull();
    expect(isRequestDoor("b2b")).toBe(true);
    expect(isRequestDoor("x")).toBe(false);
  });
});

describe("each door asks only for what it needs", () => {
  it("the worker search carries profession, number, country, start and extras", () => {
    const i = requestDoorIntake("worker-search", "lt", reader(VALID["worker-search"]));
    expect(i).toMatchObject({ sector: "Mūrininkas", headcount: 4, country: "LT", startWindow: "2026-12-01", companyName: "UAB Testas" });
    expect(i?.description).toContain("Su A1");
  });

  it("B2B carries work, place, scope and deadlines", () => {
    const i = requestDoorIntake("b2b", "lt", reader(VALID.b2b));
    expect(i).toMatchObject({ sector: "Fasadai", cityRegion: "Vilnius", startWindow: "kovas", engagementType: "subcontracting" });
    expect(i?.description).toContain("2000 m2");
  });

  it("a project says whether the customer is private or a business", () => {
    expect(requestDoorIntake("project", "lt", reader(VALID.project))?.description).toContain("Užsakovas: privatus");
    expect(requestDoorIntake("project", "lt", reader({ ...VALID.project, customer: "business" }))?.description).toContain("Užsakovas: verslo");
  });

  it("a phone is optional and kept when given", () => {
    expect(requestDoorIntake("b2b", "lt", reader(VALID.b2b))?.contactPhone).toBeUndefined();
    expect(requestDoorIntake("b2b", "lt", reader({ ...VALID.b2b, phone: "+370" }))?.contactPhone).toBe("+370");
  });

  it.each([
    ["no name", { name: "" }],
    ["a bad email", { email: "nope" }],
    ["no country", { country: "" }],
    ["a country that is no code", { country: "Lietuva" }],
    ["a phone too long", { phone: "1".repeat(41) }],
  ])("refuses %s", (_n, change) => {
    expect(requestDoorIntake("b2b", "lt", reader({ ...VALID.b2b, ...change }))).toBeNull();
  });

  it("refuses a door's own missing field", () => {
    expect(requestDoorIntake("worker-search", "lt", reader({ ...VALID["worker-search"], profession: "" }))).toBeNull();
    expect(requestDoorIntake("worker-search", "lt", reader({ ...VALID["worker-search"], workers: "0" }))).toBeNull();
    expect(requestDoorIntake("b2b", "lt", reader({ ...VALID.b2b, work: "" }))).toBeNull();
    expect(requestDoorIntake("project", "lt", reader({ ...VALID.project, need: "" }))).toBeNull();
  });
});

function form(fields: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

describe("the action never claims what did not happen", () => {
  beforeEach(() => {
    persist.mockReset();
    alert.mockReset();
    persist.mockResolvedValue({ ok: true });
    alert.mockResolvedValue(true);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  const send = (extra: Record<string, string> = {}) => submitRequestDoorAction(form({ door: "b2b", ...VALID.b2b, ...extra }));

  it("received: stored once, with the active locale in the path", async () => {
    expect(await send()).toBe("received");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].sourcePath).toBe("/de/request/b2b");
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("not stored is never received, and no one is alerted", async () => {
    for (const [code, answer] of [["rate_limited", "limited"], ["unavailable", "unavailable"], ["error", "unavailable"], ["invalid", "invalid"]]) {
      alert.mockClear();
      persist.mockResolvedValue({ ok: false, code });
      expect(await send()).toBe(answer);
      expect(alert).not.toHaveBeenCalled();
    }
  });

  it("a failed alert does not lose a stored request", async () => {
    alert.mockRejectedValue(new Error("down"));
    expect(await send()).toBe("received");
  });

  it("an unknown door stores nothing", async () => {
    expect(await submitRequestDoorAction(form({ door: "x", ...VALID.b2b }))).toBe("invalid");
    expect(persist).not.toHaveBeenCalled();
  });

  it("a bot filling the hidden field, or sending at once, stores nothing and alerts no one", async () => {
    expect(await send({ website: "http://spam" })).toBe("received");
    expect(await send({ started: String(Date.now()) })).toBe("received");
    expect(persist).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("a person who took their time gets through", async () => {
    expect(await send({ started: String(Date.now() - 10_000) })).toBe("received");
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("the page", () => {
  const WEB = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

  it("the owner's words stand in Lithuanian", () => {
    const d = JSON.parse(read("messages/lt.json")).landing.requestDoors;
    expect(d.workerSearch.title).toBe("Užsakyti darbuotojų paiešką");
    expect(d.b2b.title).toBe("Pateikti B2B bendradarbiavimo užklausą");
    expect(d.project.title).toBe("Užsakyti individualaus projekto vykdymą");
    expect(d.promise).toBe("Pateikite užklausą be registracijos – susisieksime su jumis per 24 valandas.");
  });

  it.each(["lt", "en", "ru", "nl", "de", "pl"])("%s has every key, and the notice links the policy", (locale) => {
    const d = JSON.parse(read(`messages/${locale}.json`)).landing.requestDoors;
    const en = JSON.parse(read("messages/en.json")).landing.requestDoors;
    expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
    expect(d.notice).toMatch(/<privacy>.+<\/privacy>/);
    expect(d.promise).toMatch(/24/);
  });

  it("a failed send keeps the input: no form action, which would reset it", () => {
    const form = read("components/marketing/landing-request-doors-form.tsx");
    expect(form).toContain("onSubmit={submit}");
    expect(form).not.toMatch(/<form[^>]*\baction=/);
  });

  it("there is no upload: no safe public path exists", () => {
    expect(read("components/marketing/landing-request-doors-form.tsx")).not.toMatch(/type="file"/);
  });

  it("both landing heroes carry the doors", () => {
    expect(read("app/[locale]/focus-landing/focus-landing.tsx").match(/<LandingRequestDoors /g)).toHaveLength(2);
  });
});
