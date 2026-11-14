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
const sendSmtp = vi.fn();
const smtpConfig = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "de" }));
vi.mock("./company-need-public-intake", () => ({ persistPublicCompanyNeed: (i: unknown) => persist(i) }));
vi.mock("../email/smtp", () => ({
  smtpConfigFromEnv: () => smtpConfig(),
  sendSmtp: (c: unknown, m: unknown) => sendSmtp(c, m),
}));

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

describe("a repeat for another place is another request", () => {
  it.each(REQUEST_DOORS)("%s: the description differs when only the place does", (door) => {
    const here = requestDoorIntake(door, "lt", reader({ ...VALID[door], country: "LT", city: "Vilnius" }));
    const there = requestDoorIntake(door, "lt", reader({ ...VALID[door], country: "LV", city: "Vilnius" }));
    const town = requestDoorIntake(door, "lt", reader({ ...VALID[door], country: "LT", city: "Kaunas" }));
    expect(here?.description).not.toBe(there?.description);
    expect(here?.description).not.toBe(town?.description);
  });

  it("the same request at the same place is still a repeat", () => {
    const a = requestDoorIntake("b2b", "lt", reader(VALID.b2b));
    const b = requestDoorIntake("b2b", "lt", reader(VALID.b2b));
    expect(a?.description).toBe(b?.description);
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
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    persist.mockReset();
    sendSmtp.mockReset();
    smtpConfig.mockReset();
    persist.mockResolvedValue({ ok: true });
    smtpConfig.mockReturnValue({ host: "fixture" });
    sendSmtp.mockResolvedValue({ status: "sent" });
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  const send = (extra: Record<string, string> = {}) =>
    submitRequestDoorAction(form({ door: "b2b", ...VALID.b2b, started: String(Date.now() - 10_000), ...extra }));

  it("received: stored once, with the active locale in the path", async () => {
    expect(await send()).toBe("received");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].sourcePath).toBe("/de/request/b2b");
    expect(sendSmtp).toHaveBeenCalledTimes(1);
  });

  it("the alert goes to the one mailbox with the door and the queue link, and nothing of the person's", async () => {
    await send({ phone: "+37060000000" });
    const [, mail] = sendSmtp.mock.calls[0];
    expect(mail.to).toBe("info@labourmarket.ai");
    const body = `${mail.subject} ${mail.text}`;
    expect(body).toContain("B2B");
    expect(body).toContain("/dashboard/admin/company-need-intakes");
    for (const secret of ["UAB Testas", "a@b.lt", "+37060000000", "Fasadai", "2000 m2", "Vilnius", "kovas"]) {
      expect(body).not.toContain(secret);
    }
  });

  it("an advert is stored and told it was received, and no mail goes out", async () => {
    persist.mockResolvedValue({ ok: true, advertising: true });
    expect(await send()).toBe("received");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(sendSmtp).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[request-door] stored", { door: "b2b", alerted: false });
  });

  it("logs whether anyone was told, and nothing else", async () => {
    await send();
    expect(info).toHaveBeenCalledWith("[request-door] stored", { door: "b2b", alerted: true });
  });

  it("not stored is never received, and no one is alerted", async () => {
    for (const [code, answer] of [["rate_limited", "limited"], ["rejected", "unavailable"], ["unavailable", "unavailable"], ["error", "unavailable"], ["invalid", "invalid"]]) {
      sendSmtp.mockClear();
      persist.mockResolvedValue({ ok: false, code });
      expect(await send()).toBe(answer);
      expect(sendSmtp).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["the sender throws", () => sendSmtp.mockRejectedValue(new Error("down"))],
    ["the server refuses", () => sendSmtp.mockResolvedValue({ status: "failed", reason: "x" })],
    ["no mailbox is set up", () => smtpConfig.mockReturnValue(null)],
  ])("%s: the stored request stands, and the log says no one was told", async (_n, arrange) => {
    arrange();
    expect(await send()).toBe("received");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[request-door] stored", { door: "b2b", alerted: false });
  });

  it("an unknown door stores nothing", async () => {
    expect(await submitRequestDoorAction(form({ door: "x", ...VALID.b2b }))).toBe("invalid");
    expect(persist).not.toHaveBeenCalled();
  });

  it("a bot filling the hidden field, sending at once, or with no fill time, stores nothing and alerts no one", async () => {
    // One generic "could not send" whichever check tripped (owner spam order 2026-11-09):
    // never "received" for a request that was dropped.
    expect(await send({ website: "http://spam" })).toBe("unavailable");
    expect(await send({ started: String(Date.now()) })).toBe("unavailable");
    expect(await send({ started: "" })).toBe("unavailable");
    expect(persist).not.toHaveBeenCalled();
    expect(sendSmtp).not.toHaveBeenCalled();
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
    // The V3 wording the owner approved on 2026-11-13: each service is named
    // as an enquiry, not as an order.
    const d = JSON.parse(read("messages/lt.json")).landing.requestDoors;
    expect(d.workerSearch.title).toBe("Darbuotojų paieškos užklausa");
    expect(d.b2b.title).toBe("Verslo paslaugų užklausa (B2B)");
    expect(d.project.title).toBe("Individualaus projekto užklausa");
    // No reply time and no promise to get in touch (owner 2026-11-10 and
    // 2026-11-13): the request is passed to the team for review, and the
    // confirmation says the same.
    expect(d.promise).toBe(
      "Aprašykite, kokių darbuotojų, paslaugų ar projekto vykdymo jums reikia. Užklausa perduodama LabourMarket.ai komandai peržiūrėti.",
    );
    expect(d.receivedBody).toBe("Jūsų užklausa gauta ir perduota LabourMarket.ai komandai peržiūrėti.");
    expect(`${d.promise} ${d.receivedBody}`).not.toMatch(/susisiek/i);
  });

  it.each(["lt", "en", "ru", "nl", "de", "pl"])("%s has every key, and the notice links the policy", (locale) => {
    const d = JSON.parse(read(`messages/${locale}.json`)).landing.requestDoors;
    const en = JSON.parse(read("messages/en.json")).landing.requestDoors;
    expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
    expect(d.notice).toMatch(/<privacy>.+<\/privacy>/);
    expect(d.promise.length).toBeGreaterThan(20);
    expect(d.promise).not.toMatch(/\d/);
    expect(d.receivedBody).not.toMatch(/\d/);
  });

  it("a failed send keeps the input: no form action, which would reset it", () => {
    const form = read("components/marketing/landing-request-doors-form.tsx");
    expect(form).toContain("onSubmit={submit}");
    expect(form).not.toMatch(/<form[^>]*\baction=/);
  });

  it("an answer belongs to the form that sent it: the doors lock, and a late answer is dropped", () => {
    const form = read("components/marketing/landing-request-doors-form.tsx");
    expect(form).toContain("disabled={pending}");
    expect(form).toMatch(/if \(shown\.current === sentFrom\) setResult\(answer\)/);
  });

  it("there is no upload: no safe public path exists", () => {
    expect(read("components/marketing/landing-request-doors-form.tsx")).not.toMatch(/type="file"/);
  });

  // One place for the doors. Since V3 (owner 2026-11-13) it is the landing's
  // "submit a request" entry, which the landing renders exactly once.
  it("the landing carries the doors once, inside the one request entry", () => {
    expect(read("app/[locale]/focus-landing/focus-landing.tsx").match(/<LandingNeedPath /g)).toHaveLength(1);
    expect(read("app/[locale]/focus-landing/focus-landing.tsx")).not.toMatch(/<LandingRequestDoors /);
    expect(read("components/marketing/landing-v3.tsx").match(/<LandingRequestDoors /g)).toHaveLength(1);
  });
});
