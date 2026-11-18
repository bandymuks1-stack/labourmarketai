import "server-only";

import { getProjectGallery } from "@/lib/journal/project-gallery";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { createClient } from "@/lib/supabase/server";

import type { AthleteSeasonPhoto } from "./athlete-profile";

/**
 * The few facts of the athlete-profile CV form the Living CV read does not
 * carry: the person's own photo, country and worker id (the last so a project
 * gallery can be narrowed to their own work). Read only at
 * `/cv?template=profile`, under the person's own session; the default CV makes
 * none of these calls. Any failure is an absent fact, never a stand-in.
 */
export async function readAthleteProfileFacts(profileId: string | null): Promise<{
  workerId: string | null;
  countryCode: string | null;
  portraitUrl: string | null;
}> {
  const [worker, avatar] = await Promise.all([
    readOwnWorker(profileId),
    getOwnAvatar().catch(() => ({ path: null, signedUrl: null })),
  ]);
  return { ...worker, portraitUrl: avatar.signedUrl };
}

async function readOwnWorker(
  profileId: string | null,
): Promise<{ workerId: string | null; countryCode: string | null }> {
  if (!profileId) return { workerId: null, countryCode: null };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workers")
      .select("id, current_location_country")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error || !data) return { workerId: null, countryCode: null };
    return { workerId: data.id, countryCode: data.current_location_country ?? null };
  } catch {
    return { workerId: null, countryCode: null };
  }
}

/** The existing project gallery, per project; it degrades to empty on its own. */
export async function readSeasonPhotos(
  projectIds: readonly string[],
): Promise<Map<string, readonly AthleteSeasonPhoto[]>> {
  const galleries = await Promise.all(
    projectIds.map(async (id) => [id, (await getProjectGallery(id)).photos] as const),
  );
  return new Map(galleries);
}
