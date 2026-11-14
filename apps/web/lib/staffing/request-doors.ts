import type { PublicIntakeInput } from "./company-need-public-intake";

/**
 * THE THREE COMMERCIAL REQUEST DOORS (owner P0 2026-11-07). PURE.
 *
 * Not a second intake: every door lands in `company_need_public_intakes` through the
 * existing RPC, with its rate limits and its 24 h duplicate rule, and reaches the
 * existing owner queue and alert.
 *
 * The TYPE is stored in `source_path` (`/lt/request/b2b`), read back by
 * `requestDoorFromSourcePath`. `engagement_type` cannot hold it: the RPC closes that
 * column to three staffing values and turns anything else into `employment`, and a
 * project is none of them. The operator's first line of the description names the door
 * too, because the queue's engagement label is only near for a project.
 */
export const REQUEST_DOORS = ["worker-search", "b2b", "project"] as const;
export type RequestDoor = (typeof REQUEST_DOORS)[number];

const OPERATOR_TITLE: Record<RequestDoor, string> = {
  "worker-search": "Darbuotojų paieškos užklausa",
  b2b: "B2B bendradarbiavimo užklausa",
  project: "Individualaus projekto užklausa",
};

export function requestDoorSourcePath(locale: string, door: RequestDoor): string {
  return `/${locale}/request/${door}`;
}

export function requestDoorFromSourcePath(path: string | null | undefined): RequestDoor | null {
  const door = /^\/[a-z]{2}\/request\/([a-z0-9-]+)$/.exec(path ?? "")?.[1];
  return REQUEST_DOORS.find((d) => d === door) ?? null;
}

/** The operator's name for a door: the internal alert and the queue use the same one. */
export function requestDoorOperatorTitle(door: RequestDoor): string {
  return OPERATOR_TITLE[door];
}

export function isRequestDoor(value: unknown): value is RequestDoor {
  return REQUEST_DOORS.some((d) => d === value);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY = /^[A-Za-z]{2}$/;

type Read = (name: string) => string;

const within = (value: string, max: number) => value.length <= max;

/** What the form sent, as an intake row, or null when a required field is missing or
 *  too long. The RPC checks again; this is what lets the form answer before it. */
export function requestDoorIntake(door: RequestDoor, locale: string, read: Read): PublicIntakeInput | null {
  const name = read("name");
  const email = read("email");
  const phone = read("phone");
  const country = read("country").toUpperCase();
  const city = read("city");
  if (name.length < 2 || !within(name, 200)) return null;
  if (!EMAIL.test(email) || !within(email, 254)) return null;
  if (!COUNTRY.test(country) || !within(phone, 40) || !within(city, 160)) return null;

  const base = {
    locale,
    companyName: name,
    contactEmail: email,
    contactPhone: phone || undefined,
    country,
    cityRegion: city || undefined,
    urgency: "flexible",
    accommodation: "not_provided",
    transportNeeded: false,
    sourcePath: requestDoorSourcePath(locale, door),
  };
  // The place is in the text on purpose. The RPC treats the same name, e-mail and
  // description within 24 h as a repeat, so the same work at a second site would
  // otherwise be dropped while the person is told it was received.
  const describe = (lines: readonly (string | false)[]) =>
    [OPERATOR_TITLE[door], `Vieta: ${[country, city].filter(Boolean).join(", ")}`, ...lines.filter(Boolean)].join("\n");

  if (door === "worker-search") {
    const profession = read("profession");
    const workers = Number(read("workers"));
    const start = read("start");
    const extra = read("details");
    if (profession.length < 2 || !within(profession, 200)) return null;
    if (!Number.isInteger(workers) || workers < 1 || workers > 100000) return null;
    if (!within(start, 40) || !within(extra, 2000)) return null;
    return {
      ...base,
      sector: profession,
      headcount: workers,
      startWindow: start || undefined,
      engagementType: "employment",
      description: describe([`Specialybė: ${profession}`, `Darbuotojų: ${workers}`, !!start && `Pradžia: ${start}`, !!extra && extra]),
    };
  }

  if (door === "b2b") {
    const work = read("work");
    const scope = read("scope");
    const deadline = read("deadline");
    if (work.length < 2 || !within(work, 200)) return null;
    if (!within(scope, 2000) || !within(deadline, 40)) return null;
    return {
      ...base,
      sector: work,
      headcount: 1,
      startWindow: deadline || undefined,
      engagementType: "subcontracting",
      description: describe([`Darbų pobūdis: ${work}`, !!scope && `Apimtis: ${scope}`, !!deadline && `Terminai: ${deadline}`]),
    };
  }

  const need = read("need");
  const customer = read("customer") === "business" ? "verslo" : "privatus";
  if (need.length < 2 || !within(need, 4000)) return null;
  return {
    ...base,
    sector: "individual-project",
    headcount: 1,
    engagementType: "employment",
    description: describe([`Užsakovas: ${customer}`, need]),
  };
}
