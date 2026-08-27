/**
 * CONCEPT A — "The Record".
 *
 * An ILLUSTRATIVE record, not a real person and not production data. It is
 * generated from a fixed seed so the same marks appear on every load, in
 * every browser, and in a screenshot taken a week apart — a random field
 * would make art-direction review impossible.
 *
 * The lines below are plausible ACTIVITY descriptions. They deliberately
 * carry no market statistics, no employer names and no verification claims.
 */

export type Stance = "study" | "work" | "build" | "hire";

export type Capability = {
  readonly id: string;
  readonly label: string;
  /** How the platform would hold this claim today. */
  readonly state: "recorded" | "confirmed";
};

export type Stroke = {
  /** 0..1 position in the chronological record */
  readonly t: number;
  /** which month of the record this mark belongs to */
  readonly month: number;
  /** position of this mark inside its month */
  readonly inMonth: number;
  /** how many marks that month holds */
  readonly monthTotal: number;
  /** 0..1 evidence weight -> mark height */
  readonly w: number;
  /** index into the stance's capability list */
  readonly cap: number;
  /** 0..1 ink density jitter */
  readonly ink: number;
  /** small rotation, radians */
  readonly rot: number;
  /** the journal line this mark stands for (only some marks carry one) */
  readonly line?: string;
};

export type RecordSet = {
  readonly stance: Stance;
  readonly chip: string;
  readonly opening: string;
  readonly capabilities: readonly Capability[];
  readonly strokes: readonly Stroke[];
  readonly months: number;
  readonly spanLabel: string;
  readonly outcome: string;
};

/** Deterministic PRNG (mulberry32) — same seed, same record, always. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Spec = {
  readonly seed: number;
  readonly chip: string;
  readonly opening: string;
  readonly spanLabel: string;
  readonly outcome: string;
  readonly count: number;
  readonly months: number;
  readonly capabilities: readonly Capability[];
  readonly lines: readonly string[];
  /** per-capability relative frequency over the record's timeline */
  readonly weightAt: (cap: number, t: number) => number;
};

const SPECS: Record<Stance, Spec> = {
  work: {
    seed: 20260827,
    chip: "I work",
    opening: "Tuesday. Rebuilt the ventilation riser on the fourth floor.",
    spanLabel: "26 months of recorded activity",
    outcome: "Six capabilities, none of them typed into a form.",
    count: 430,
    months: 26,
    capabilities: [
      { id: "install", label: "Installation", state: "confirmed" },
      { id: "diag", label: "Diagnostics", state: "confirmed" },
      { id: "safety", label: "Site safety", state: "confirmed" },
      { id: "handover", label: "Client handover", state: "recorded" },
      { id: "coord", label: "Team coordination", state: "recorded" },
      { id: "docs", label: "Documentation", state: "recorded" },
    ],
    lines: [
      "Rebuilt the ventilation riser on the fourth floor.",
      "Traced a pressure drop back to a collapsed flexible duct.",
      "Walked the new apprentice through lock-out before the shift.",
      "Handed the plant room over to the building manager.",
      "Split the shift so the second crew could start on level two.",
      "Photographed and logged every weld before the ceiling closed.",
      "Re-balanced the supply air after a tenant reported draught.",
      "Wrote the fault history up so the next crew would not repeat it.",
    ],
    weightAt: (cap, t) =>
      [1.0, 0.5 + t * 0.9, 0.7, 0.15 + t * 0.85, 0.1 + t * t * 1.5, 0.2 + t * 0.6][
        cap
      ],
  },
  study: {
    seed: 771,
    chip: "I study",
    opening: "Thursday. Ran the tensile test series and wrote up the failures.",
    spanLabel: "22 months of recorded activity",
    outcome: "A defensible profile with no formal employment in it.",
    count: 330,
    months: 22,
    capabilities: [
      { id: "lab", label: "Laboratory work", state: "confirmed" },
      { id: "field", label: "Field practice", state: "confirmed" },
      { id: "write", label: "Technical writing", state: "recorded" },
      { id: "team", label: "Team projects", state: "confirmed" },
      { id: "present", label: "Presenting", state: "recorded" },
      { id: "tools", label: "Tooling", state: "recorded" },
    ],
    lines: [
      "Ran the tensile test series and wrote up the failures.",
      "Two weeks of practice on site — measured, did not just watch.",
      "Presented the group findings to the department.",
      "Calibrated the rig after it drifted mid-series.",
      "Took the minutes and turned them into the team task list.",
      "Rewrote the method section after the review came back.",
      "Built the fixture the rest of the group used all semester.",
      "Volunteered on the workshop weekend and ran the cutting station.",
    ],
    weightAt: (cap, t) =>
      [1.2 - t * 0.4, 0.1 + t * 1.6, 0.4 + t * 0.7, 0.8, 0.2 + t * 0.8, 0.9][cap],
  },
  build: {
    seed: 4242,
    chip: "I build",
    opening: "Monday. Priced the facade package and sent it out for review.",
    spanLabel: "31 months of recorded activity",
    outcome: "The company record, not the company self-description.",
    count: 470,
    months: 31,
    capabilities: [
      { id: "estimate", label: "Estimating", state: "confirmed" },
      { id: "schedule", label: "Scheduling", state: "confirmed" },
      { id: "subs", label: "Subcontracting", state: "recorded" },
      { id: "quality", label: "Quality control", state: "confirmed" },
      { id: "report", label: "Client reporting", state: "recorded" },
      { id: "procure", label: "Procurement", state: "recorded" },
    ],
    lines: [
      "Priced the facade package and sent it out for review.",
      "Pulled the insulation delivery forward by a week.",
      "Signed off the mock-up panel with the architect on site.",
      "Rewrote the programme after the crane slot moved.",
      "Brought a second joinery crew on for the stair core.",
      "Sent the client the weekly progress note with photographs.",
      "Rejected a batch of glazing units and logged why.",
      "Closed out the snag list before the handover meeting.",
    ],
    weightAt: (cap, t) =>
      [1.1, 0.9, 0.3 + t * 1.1, 0.5 + t * 0.8, 0.6, 0.7 - t * 0.2][cap],
  },
  hire: {
    seed: 99001,
    chip: "I hire",
    opening: "Friday. Two people short for the shell phase in March.",
    spanLabel: "18 months of recorded need",
    outcome: "The same record, read from the other side of the market.",
    count: 300,
    months: 18,
    capabilities: [
      { id: "roles", label: "Roles needed", state: "recorded" },
      { id: "skills", label: "Skills required", state: "confirmed" },
      { id: "sites", label: "Sites", state: "confirmed" },
      { id: "timing", label: "Timing", state: "recorded" },
      { id: "volume", label: "Volume", state: "recorded" },
      { id: "response", label: "Response", state: "confirmed" },
    ],
    lines: [
      "Two people short for the shell phase in March.",
      "Needed someone who had actually commissioned a plant room.",
      "The site moved; the start date moved with it.",
      "Asked for evidence rather than a list of adjectives.",
      "Took three people from one crew — they already worked together.",
      "The winter package needed a different skill mix entirely.",
      "Reopened the need after the first crew finished early.",
      "Answered every person who expressed interest, including the no.",
    ],
    weightAt: (cap, t) =>
      [0.9, 1.2, 0.6, 0.5 + t * 0.7, 0.4 + t * 0.6, 0.3 + t * 1.0][cap],
  },
};

/**
 * A working life is not a uniform sprinkle of marks. It has busy months and
 * quiet ones, and the quiet ones are part of the truth — so the record is
 * generated MONTH BY MONTH, with a per-month volume, and the canvas lays each
 * month out in its own slot. Empty space in a month is information, not a gap
 * to be closed.
 */
export function buildRecord(stance: Stance): RecordSet {
  const spec = SPECS[stance];
  const rand = rng(spec.seed);
  const strokes: Stroke[] = [];
  const capIndexes = spec.capabilities.map((_, i) => i);

  const months = spec.months;
  // per-month volume: a slow swell across the record plus real variance
  const perMonth: number[] = [];
  for (let m = 0; m < months; m += 1) {
    const t = m / (months - 1);
    const swell = 0.55 + 0.75 * t + 0.35 * Math.sin(t * Math.PI * 2.4 + 0.6);
    const noise = 0.35 + Math.pow(rand(), 1.5) * 1.5;
    perMonth.push(Math.max(1, Math.round((spec.count / months) * swell * noise)));
  }
  const grand = perMonth.reduce((a, b) => a + b, 0);
  // keep the pool honest: scale back if the variance overshot the budget
  const scale = Math.min(1, spec.count / grand);

  for (let m = 0; m < months; m += 1) {
    const total = Math.max(1, Math.round(perMonth[m] * scale));
    for (let k = 0; k < total; k += 1) {
      const t = (m + (k + 0.5) / total) / months;
      const mix = capIndexes.map((c) => Math.max(0.02, spec.weightAt(c, t)));
      const sum = mix.reduce((a, b) => a + b, 0);
      let pick = rand() * sum;
      let cap = 0;
      for (let c = 0; c < mix.length; c += 1) {
        pick -= mix[c];
        if (pick <= 0) {
          cap = c;
          break;
        }
      }
      // most days are ordinary; a few carry real weight
      const base = rand();
      const w = base < 0.78 ? 0.14 + base * 0.42 : 0.52 + rand() * 0.48;
      strokes.push({
        t,
        month: m,
        inMonth: k,
        monthTotal: total,
        w,
        cap,
        ink: 0.4 + rand() * 0.6,
        rot: (rand() - 0.5) * 0.07,
        line:
          k === 1 && m % 4 === 1
            ? spec.lines[Math.floor(m / 4) % spec.lines.length]
            : undefined,
      });
    }
  }

  return {
    stance,
    chip: spec.chip,
    opening: spec.opening,
    capabilities: spec.capabilities,
    strokes: strokes.slice(0, 470),
    months,
    spanLabel: spec.spanLabel,
    outcome: spec.outcome,
  };
}

export const STANCES: readonly Stance[] = ["study", "work", "build", "hire"];
