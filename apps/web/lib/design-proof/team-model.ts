import { NEED, PEOPLE, personById, type Person, type RoleId } from "./product-fixtures";

/**
 * TEAM FORMATION — the pure model behind the working tool.
 *
 * A team is a set of SEATS, grouped by role. A seat is open, held by a person,
 * or held by an invitation that has not been answered. Everything the screen
 * says — who is on the team, what is covered, what is missing, who clashes with
 * the dates — is derived from the seats and the people; nothing is stored twice.
 */
export type Seat = { readonly kind: "open" } | { readonly kind: "person"; readonly id: string } | { readonly kind: "invited" };
export type Seats = Readonly<Record<RoleId, readonly Seat[]>>;

const ROLE_OF: Record<string, RoleId> = {
  "Site lead": "lead",
  Scaffolder: "scaf",
  Electrician: "elec",
  "Safety officer": "hse",
};

export const roleOfPerson = (p: Person): RoleId | null => ROLE_OF[p.role] ?? null;

export function emptySeats(): Seats {
  const out = {} as Record<RoleId, Seat[]>;
  for (const r of NEED.roles) out[r.id] = Array.from({ length: r.count }, () => ({ kind: "open" }) as Seat);
  return out;
}

export function startingSeats(): Seats {
  return addPerson(addPerson(emptySeats(), "is").seats, "tk").seats;
}

export function membersOf(seats: Seats): { personId: string; role: RoleId; index: number }[] {
  const out: { personId: string; role: RoleId; index: number }[] = [];
  for (const r of NEED.roles) {
    seats[r.id].forEach((s, index) => {
      if (s.kind === "person") out.push({ personId: s.id, role: r.id, index });
    });
  }
  return out;
}

export const seatTotals = (seats: Seats) => {
  let filled = 0;
  let invited = 0;
  let total = 0;
  for (const r of NEED.roles) {
    for (const s of seats[r.id]) {
      total++;
      if (s.kind === "person") filled++;
      if (s.kind === "invited") invited++;
    }
  }
  return { filled, invited, total, open: total - filled - invited };
};

export function addPerson(
  seats: Seats,
  personId: string,
  role?: RoleId,
  index?: number,
): { seats: Seats; result: "added" | "full" | "no-role" | "already" } {
  if (membersOf(seats).some((m) => m.personId === personId)) return { seats, result: "already" };
  const r = role ?? roleOfPerson(personById(personId));
  if (!r) return { seats, result: "no-role" };
  const row = seats[r];
  const i = index ?? row.findIndex((s) => s.kind === "open");
  const j = i >= 0 ? i : row.findIndex((s) => s.kind === "invited");
  if (j < 0) return { seats, result: "full" };
  const next = row.map((s, k) => (k === j ? ({ kind: "person", id: personId } as Seat) : s));
  return { seats: { ...seats, [r]: next }, result: "added" };
}

const setSeat = (seats: Seats, role: RoleId, index: number, seat: Seat): Seats => ({
  ...seats,
  [role]: seats[role].map((s, k) => (k === index ? seat : s)),
});
export const removeSeat = (seats: Seats, role: RoleId, index: number) => setSeat(seats, role, index, { kind: "open" });
export const inviteSeat = (seats: Seats, role: RoleId, index: number) => setSeat(seats, role, index, { kind: "invited" });
export const replaceSeat = (seats: Seats, role: RoleId, index: number, personId: string) =>
  setSeat(removePerson(seats, personId), role, index, { kind: "person", id: personId });

function removePerson(seats: Seats, personId: string): Seats {
  const next = {} as Record<RoleId, Seat[]>;
  for (const r of NEED.roles) next[r.id] = seats[r.id].map((s) => (s.kind === "person" && s.id === personId ? ({ kind: "open" } as Seat) : s));
  return next;
}

// ───────────── coverage ─────────────

export type Coverage = {
  readonly cap: string;
  readonly needed: number;
  readonly confirmed: number;
  readonly recorded: number;
  readonly status: "covered" | "own-records" | "missing";
};

export function coverageOf(seats: Seats): Coverage[] {
  const people = membersOf(seats).map((m) => personById(m.personId));
  return NEED.required.map((cap) => {
    const needed = Math.max(
      1,
      NEED.roles.filter((r) => (r.caps as readonly string[]).includes(cap)).reduce((n, r) => n + r.count, 0),
    );
    const levels = people.map((p) => p.caps.find((c) => c.label === cap)?.level);
    const confirmed = levels.filter((l) => l === "confirmed").length;
    const recorded = levels.filter((l) => l === "recorded").length;
    const status = confirmed >= needed ? "covered" : confirmed + recorded >= needed ? "own-records" : "missing";
    return { cap, needed, confirmed: Math.min(confirmed, needed), recorded: Math.min(recorded, needed - Math.min(confirmed, needed)), status };
  });
}

// ───────────── availability against the project window ─────────────

export type Conflict = { readonly kind: "busy" | "late"; readonly text: string };

/** Project starts 10 Nov; a "From D Nov" candidate is late by whole weeks. */
export function conflictOf(p: Person): Conflict | null {
  const a = p.availability;
  if (a.state === "busy") return { kind: "busy", text: `${a.note} · overlaps the first weeks` };
  if (a.state === "from") {
    const m = /From (\d+) Nov/.exec(a.note);
    const day = m ? Number(m[1]) : 0;
    if (day > 10) return { kind: "late", text: `Starts ${Math.ceil((day - 10) / 7)} week${day - 10 > 7 ? "s" : ""} after the project` };
  }
  return null;
}

export function fitRank(p: Person, role: RoleId | null): number {
  const sameRole = role && roleOfPerson(p) === role ? 1000 : 0;
  const avail = p.availability.state === "now" ? 200 : p.availability.state === "from" ? 100 : 0;
  const confirmed = p.caps.reduce((n, c) => n + (c.level === "confirmed" ? c.hours : 0), 0) / 100;
  return sameRole + avail + Math.min(confirmed, 90);
}

export const DEFAULT_TEAM: Seats = (() => {
  let s = emptySeats();
  for (const id of ["is", "tk", "mt", "an2", "mn", "an1", "ap"]) s = addPerson(s, id).seats;
  return s;
})();

export const everyone = PEOPLE;
