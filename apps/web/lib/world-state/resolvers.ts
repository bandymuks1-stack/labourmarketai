import "server-only";

import {
  registerEntityContextResolver,
  resolverFor,
  type EntityContextResult,
} from "./entity-context";
import type { EntityRef } from "./world-state";
import { resolveJobContext } from "./job-context-server";
import { resolveProjectContext } from "./project-context-server";

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
// W4 — the second type, and the whole bill for adding it: this line, its
// resolver module, and the allowlist entry below. Nothing else moved.
registerEntityContextResolver("project", resolveProjectContext);

/**
 * Entity types the workspace can open today — and the ALLOWLIST the dispatch
 * below resolves through. Kept in sync with the registrations above by a guard:
 * a registered resolver missing from this list would be silently unreachable,
 * and a listed type with no resolver would degrade for no reason.
 */
export const REGISTERED_ENTITY_TYPES = ["job", "project"] as const;

export async function resolveEntityContext(
  ref: EntityRef,
  unknownTypeReason: string,
): Promise<EntityContextResult> {
  // The type arrives from the client (it is a selection), so it is never used
  // to look anything up directly. It is matched against this module's own
  // constant list first, and the MATCHED LITERAL does the lookup — so the
  // dispatch target can only ever be one this file registered. CodeQL flagged
  // the direct form (`js/unvalidated-dynamic-method-call`) and it was right to.
  const known = REGISTERED_ENTITY_TYPES.find((t) => t === ref.type);
  const resolver = known ? resolverFor(known) : null;
  if (typeof resolver !== "function") {
    // An unregistered type is an honest "cannot open this yet" — never an
    // empty panel that implies the entity has nothing to show.
    return { kind: "unavailable", reason: unknownTypeReason };
  }
  return resolver(ref.id);
}
