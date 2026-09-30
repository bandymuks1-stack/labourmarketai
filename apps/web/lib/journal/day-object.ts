import type { WorkVerificationState } from "@/lib/journal/work-verification-state";

/**
 * THE DAY AS ONE OBJECT (Step 2 — Work Journal).
 *
 * One day of real work read as a single thing a person can open and
 * understand: where I worked → what I did → how long → what proves it → who
 * confirmed it → what it added to my professional history.
 *
 * PURE. It only re-arranges rows the journal page has already loaded — the
 * entries, their metrics, their confirmations, their skill links, their photo
 * counts. It adds no read, no table and no second journal. Every field is
 * either a real value or absent; nothing here invents a place, a person, a
 * photo or a claim. Generated imagery is never an input.
 */

/** What the page already knows about one entry of the day. */
export interface DayObjectEntryInput {
  readonly id: string;
  /** Organization and site labels, already resolved by the page. */
  readonly places: readonly string[];
  /** Localized activity label (the entry's `work_direction`), if any. */
  readonly activity: string | null;
  /** Canonical work minutes for the entry (0 = not recorded). */
  readonly minutes: number;
  readonly verification: WorkVerificationState;
  /** Real decisions on the entry, oldest → newest (approvals only matter). */
  readonly decisions: readonly {
    readonly result: string;
    readonly role: string | null;
    readonly at: string | null;
    readonly automatic: boolean;
  }[];
  readonly photoCount: number;
  /** Skills linked to this entry (real links), with their proof state. */
  readonly skills: readonly { readonly id: string; readonly name: string; readonly confirmed: boolean }[];
}

export interface DayObjectConfirmation {
  readonly role: string | null;
  readonly at: string | null;
  readonly automatic: boolean;
}

export interface DayObjectSkill {
  readonly id: string;
  readonly name: string;
  /** True only when SOMEONE ELSE confirmed an entry that carries the skill. */
  readonly confirmed: boolean;
}

export interface DayObject {
  readonly entryCount: number;
  /** Distinct places, in first-seen order. */
  readonly places: readonly string[];
  readonly activities: readonly string[];
  /** Sum of the entries' canonical minutes. */
  readonly totalMinutes: number;
  /** Entries whose time is not recorded — said, never counted as zero work. */
  readonly untimedCount: number;
  readonly photoCount: number;
  /** Entries a person other than the author confirmed. */
  readonly confirmedCount: number;
  /** Entries the author confirmed alone — legitimate, never shown as green. */
  readonly selfConfirmedCount: number;
  /** Entries still nobody has decided. */
  readonly waitingCount: number;
  /** Entries a reviewer sent back or disputed. */
  readonly contestedCount: number;
  readonly confirmations: readonly DayObjectConfirmation[];
  /** Skills this day's entries are linked to (deduplicated). */
  readonly skills: readonly DayObjectSkill[];
  /** Minutes on entries a reviewer confirmed — what became proof. */
  readonly confirmedMinutes: number;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function buildDayObject(entries: readonly DayObjectEntryInput[]): DayObject {
  let confirmedCount = 0;
  let selfConfirmedCount = 0;
  let waitingCount = 0;
  let contestedCount = 0;
  let confirmedMinutes = 0;
  let totalMinutes = 0;
  let untimedCount = 0;
  let photoCount = 0;
  const confirmations: DayObjectConfirmation[] = [];
  const skillById = new Map<string, DayObjectSkill>();

  for (const e of entries) {
    totalMinutes += Math.max(0, e.minutes);
    if (e.minutes <= 0) untimedCount += 1;
    photoCount += Math.max(0, e.photoCount);

    switch (e.verification) {
      case "verified":
        confirmedCount += 1;
        confirmedMinutes += Math.max(0, e.minutes);
        break;
      case "self_confirmed":
        selfConfirmedCount += 1;
        break;
      case "returned":
      case "disputed":
        contestedCount += 1;
        break;
      default:
        waitingCount += 1;
    }

    for (const d of e.decisions) {
      if (d.result === "approved") {
        confirmations.push({ role: d.role, at: d.at, automatic: d.automatic });
      }
    }

    for (const s of e.skills) {
      const seen = skillById.get(s.id);
      // A skill is "confirmed" for the day when ANY entry carrying it is.
      skillById.set(s.id, {
        id: s.id,
        name: s.name,
        confirmed: (seen?.confirmed ?? false) || s.confirmed,
      });
    }
  }

  return {
    entryCount: entries.length,
    places: unique(entries.flatMap((e) => e.places)),
    activities: unique(
      entries.map((e) => e.activity).filter((a): a is string => Boolean(a)),
    ),
    totalMinutes,
    untimedCount,
    photoCount,
    confirmedCount,
    selfConfirmedCount,
    waitingCount,
    contestedCount,
    confirmations,
    skills: [...skillById.values()],
    confirmedMinutes,
  };
}
