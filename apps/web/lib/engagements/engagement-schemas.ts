import { z } from "zod";

/**
 * Zod input schema for the RELATIONSHIP-side conversation actions (§7.1).
 *
 * A third map beside `worker-schemas.ts` and `company-schemas.ts`, for the
 * same reason the `engagement.` namespace exists at all: this action belongs
 * to neither party. Filing it under either side's map would make one side's
 * module the home of a decision both sides own, which is where a second
 * authorization model starts.
 *
 * Same contract as the other two: a SHAPE gate only. Every real rule —
 * who may end this engagement, whether it is still active, whether the row
 * exists at all — stays in `end_company_worker_engagement_v2`, which re-derives
 * all of it server-side from the authenticated actor. Nothing here is a second
 * copy of that logic, and nothing here can widen it.
 *
 * Kept isomorphic (no `server-only` import) so the dispatcher and the UI share
 * one definition.
 */

const uuid = z.string().uuid();

/**
 * End one engagement, addressed by PRIMARY KEY and by nothing else.
 *
 * `.strict()` — deliberately, and it is the point of this file rather than a
 * stylistic flourish. The migration's whole authority model rests on the
 * client supplying an id and NOTHING else: no company id, no worker id, no
 * `side`, no project id. A permissive object would silently accept those keys
 * and let a future caller start passing them, at which point somebody would
 * eventually read one. Strict mode makes that a validation failure now, so the
 * "id only" contract is enforced by the parser and not merely by the comment
 * above it.
 */
export const engagementEndSchema = z.object({ engagementId: uuid }).strict();

/**
 * Map of action id → schema for the executable relationship actions. Every id
 * here MUST have a matching executor in `engagement-executors.ts` and a
 * descriptor in the action registry (guard-pinned).
 */
export const ENGAGEMENT_ACTION_SCHEMAS = {
  "engagement.end": engagementEndSchema,
} as const;

export type EngagementActionId = keyof typeof ENGAGEMENT_ACTION_SCHEMAS;
