import { deriveProfessionalExperience, type ExperienceRelationship } from "@/lib/journal/professional-experience";
import { organizationAllTime } from "@/lib/journal/organization-all-time";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";

/**
 * THE TWO EXPERIENCE FIGURES every identity surface shows beside the journal's
 * own totals — one rule (decision 0025), not one per surface:
 *   · organizationHistoryHours — the organization-supplied history (day +
 *     period records, no invoice consulted, #2169);
 *   · professionalExperienceHours — the ONE continuous professional history:
 *     every work hour once over the journal and the organization history.
 * The profile computed these; the Player Card (chat, profile, journal) and the
 * chat's own figures did not, so a person whose experience is mostly
 * organization history (an 800 h period) was shown journal hours only.
 * null = not readable / nothing to say, never 0.
 */
export function experienceFiguresOf(
  wi: WorkIntelligence | null | undefined,
  relationships: readonly ExperienceRelationship[] | null | undefined,
): { organizationHistoryHours: number | null; professionalExperienceHours: number | null } {
  if (!wi) return { organizationHistoryHours: null, professionalExperienceHours: null };
  return {
    organizationHistoryHours: organizationAllTime(wi)?.totalHours ?? null,
    // Unreadable relationships (null) leave journal entries unattributed to
    // their organization, so a journal hour inside an organization period
    // would be counted twice: the total is UNKNOWN, never an inflated sum.
    // An empty list ([]) is a real answer and still totals.
    professionalExperienceHours:
      relationships == null
        ? null
        : (deriveProfessionalExperience({ wi, relationships: [...relationships] }).hours?.total ?? null),
  };
}
