import { getOwnAvatar } from "@/lib/profile/avatar";

import { OwnAvatarHydrator } from "./own-avatar";

/** Server half of the shell's own-photo hydration — see `own-avatar.tsx`.
 *  Reads ONLY the signed-in person's own avatar (`getOwnAvatar`). Any failure
 *  is `null`: the shell then shows the plate and initials. */
export async function OwnAvatarStream() {
  const { signedUrl } = await getOwnAvatar().catch(() => ({ signedUrl: null }));
  return <OwnAvatarHydrator url={signedUrl} />;
}
