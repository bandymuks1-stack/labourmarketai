/**
 * Simple, deterministic match structure.
 *
 * This is a transparent, rule-based overlap score — skill match, availability
 * and location proximity. There is no model and no hidden scoring: the same
 * inputs always produce the same output and the explanation is generated from
 * the same rules. This is the structural seed for matching, not a finished
 * ranking system.
 */
import type { HiringNeed, MatchResult, Profile } from "./types";

const WEIGHTS = {
  skills: 70,
  availability: 20,
  location: 10,
} as const;

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function scoreMatch(need: HiringNeed, profile: Profile): MatchResult {
  const needSkills = need.mustHaveSkills.map(normalise);
  const profileSkills = new Set(profile.skills.map(normalise));

  const matchedSkills = need.mustHaveSkills.filter((skill) =>
    profileSkills.has(normalise(skill)),
  );
  const gapSkills = need.mustHaveSkills.filter(
    (skill) => !profileSkills.has(normalise(skill)),
  );

  const skillRatio =
    needSkills.length === 0 ? 0 : matchedSkills.length / needSkills.length;
  const skillPoints = Math.round(skillRatio * WEIGHTS.skills);

  const availabilityPoints =
    profile.availability === "open"
      ? WEIGHTS.availability
      : profile.availability === "engaged"
        ? Math.round(WEIGHTS.availability / 2)
        : 0;

  const sameLocation =
    normalise(profile.location) === normalise(need.location);
  const locationPoints = sameLocation ? WEIGHTS.location : 0;

  const score = skillPoints + availabilityPoints + locationPoints;

  const reason =
    `${matchedSkills.length}/${needSkills.length} required skills` +
    `, ${profile.availability} availability` +
    `, ${sameLocation ? "same" : "different"} location`;

  return {
    id: `${need.id}__${profile.id}`,
    needId: need.id,
    profileId: profile.id,
    score,
    matchedSkills,
    gapSkills,
    reason,
  };
}

export function rankMatches(
  need: HiringNeed,
  profiles: Profile[],
): MatchResult[] {
  return profiles
    .map((profile) => scoreMatch(need, profile))
    .sort((a, b) => b.score - a.score);
}
