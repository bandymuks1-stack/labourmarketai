"use server";

import "server-only";

import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import {
  CV_STATE_UNREADABLE,
  classifyCvState,
  type CvState,
} from "@/lib/conversation/cv-state";

/**
 * The conversation's READ of the person's own CV — the server boundary for
 * `lib/conversation/cv-state.ts`.
 *
 * REUSE, NOT A SECOND READER: it calls `buildVerifiedCv()`, the same builder
 * the printed CV page renders from, so the chat can never disagree with the
 * document. It adds no query of its own and writes nothing.
 *
 * `buildVerifiedCv` already answers `not_authenticated` / `no_worker` as
 * DATA. What it does not promise is that the read succeeds at all — a
 * throwing client, a dropped connection or a missing table would otherwise
 * surface to the person as "you have no CV", which is a false claim about
 * their working life. So a throw becomes `unreadable`, and the chat says so.
 *
 * Every export in a "use server" module must be an async function — that is
 * why the pure classifier and its types live in the sibling module.
 */
export async function readMyCvState(): Promise<CvState> {
  try {
    return classifyCvState(await buildVerifiedCv());
  } catch {
    return CV_STATE_UNREADABLE;
  }
}
