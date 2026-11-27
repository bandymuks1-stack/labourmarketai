"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { readWorkerIntakeDraftFor } from "@/lib/staffing/worker-intake-draft";

/**
 * What a worker typed on /worker-intake before they had an account waits in
 * the profile composer (`ProfileTextFirstFlow`), which lives on the profile's
 * edit block (`?tab=edit`, decision 0034). Sign-up returns them to the profile
 * builder's address; when their own kept text is waiting and they have no
 * profile text yet, this takes them to the block where it is — the same rule
 * the composer uses to place it. Reads only; the draft stays where it is.
 */
export function IntakeDraftOpensEditor({ viewerEmail }: { viewerEmail: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!readWorkerIntakeDraftFor(viewerEmail)) return;
    router.replace(`${pathname}?tab=edit#profile-edit`);
  }, [router, pathname, viewerEmail]);
  return null;
}
