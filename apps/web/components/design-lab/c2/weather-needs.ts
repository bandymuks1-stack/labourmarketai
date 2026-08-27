/**
 * C2 — the needs already in the weather.
 *
 * Placed by hand along the camera's flight path so the journey passes through
 * them in sequence rather than seeing them all at once. They are illustrative
 * kinds of demand, not counts, rates or vacancies.
 */
export const NEED_SEEDS = [
  { label: "Retrofit crew", x: -9, y: 2.5, z: -14, radius: 17, strength: 3.2 },
  { label: "Night shift, two weeks", x: 11, y: -3, z: -34, radius: 15, strength: 2.8 },
  { label: "Practice placements", x: -13, y: -1.5, z: -56, radius: 18, strength: 3.0 },
  { label: "Commissioning engineer", x: 8, y: 4, z: -78, radius: 16, strength: 2.6 },
  { label: "Team for a spring project", x: -4, y: -2, z: -100, radius: 20, strength: 3.4 },
] as const;
