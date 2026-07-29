import "server-only";

import {
  registerEntityContextResolver,
  resolverFor,
  type EntityContextResult,
} from "./entity-context";
import type { EntityRef } from "./world-state";
import { resolveJobContext } from "./job-context-server";

/**
 * THE REGISTRATION POINT — where an entity type becomes openable (W3).
 *
 * This file is the whole answer to "is registering a new type enough?". Adding
 * `person`, `organization`, `project` or anything else the world grows is ONE
 * line here plus its own resolver module. The Context Panel does not change,
 * the World State does not change, the conversation does not change and the
 * map does not change. If a future type ever needs more than a line here, the
 * architecture — not the type — is wrong (`UNIFIED_WORLD_MODEL_V1`).
 *
 * W3 registers ONE type, because exactly one kind of entity can be selected in
 * the workspace today. That is the honest extent of the product, not a limit of
 * the mechanism.
 */
registerEntityContextResolver("job", resolveJobContext);

/** Entity types the workspace can open today. Exported for the guard. */
export const REGISTERED_ENTITY_TYPES = ["job"] as const;

export async function resolveEntityContext(
  ref: EntityRef,
  unknownTypeReason: string,
): Promise<EntityContextResult> {
  const resolver = resolverFor(ref.type);
  if (!resolver) {
    // An unregistered type is an honest "cannot open this yet" — never an
    // empty panel that implies the entity has nothing to show.
    return { kind: "unavailable", reason: unknownTypeReason };
  }
  return resolver(ref.id);
}
