/**
 * Client-safe contract for the §11 WHAT-IF move — a PERSON between two of the
 * company's projects, consequences on BOTH sides before anything changes.
 * Types only; the server module is `project-move.ts`.
 */
export interface MoveWorkerOption {
  readonly workerProfileId: string;
  readonly workerId: string;
  readonly name: string;
  readonly projectId: string;
  readonly projectTitle: string;
}

export interface MoveProjectOption {
  readonly projectId: string;
  readonly title: string;
  readonly city: string | null;
  readonly country: string | null;
  readonly headcount: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export type MoveOptionsResult =
  | {
      readonly kind: "ok";
      /** One row per ACTIVE assignment (a person on two projects appears twice). */
      readonly workers: readonly MoveWorkerOption[];
      readonly projects: readonly MoveProjectOption[];
    }
  | { readonly kind: "no-company" }
  | { readonly kind: "unavailable" };

/** Every number here is read from canonical rows; null = the source did not
 *  answer (said as such), never a guess. */
export interface MoveWhatIf {
  readonly workerName: string;
  readonly workerProfileId: string;
  readonly from: {
    readonly projectId: string;
    readonly title: string;
    readonly country: string | null;
    readonly headcountBefore: number;
    readonly headcountAfter: number;
    /** OPEN work packages on the source assigned to this person — they stay
     *  there; the move does not reassign work. */
    readonly openTasksForWorker: number;
    readonly readinessChecked: number;
    readonly readinessTotal: number;
  };
  readonly to: {
    readonly projectId: string;
    readonly title: string;
    readonly country: string | null;
    readonly headcountBefore: number;
    readonly headcountAfter: number;
    readonly startDate: string | null;
    readonly endDate: string | null;
    /** The manager's per-project checklist starts EMPTY for a newly assigned
     *  person: this many items to establish. */
    readonly readinessTotal: number;
    /** Approved/declared unavailability spans overlapping the destination's
     *  dates. null = the leave model did not answer, or the destination has no
     *  dates to check against. */
    readonly unavailabilitySpans: number | null;
  };
  readonly countryChanges: boolean;
}

export type MoveWhatIfResult =
  | { readonly kind: "ok"; readonly whatIf: MoveWhatIf }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };
