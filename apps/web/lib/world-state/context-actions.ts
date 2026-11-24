"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type { EntityContextResult } from "./entity-context";
import { resolveEntityContext } from "./resolvers";
import { resolveWorkContext, type WorkContextResult } from "./work-context-server";
import type { EntityRef } from "./world-state";

/**
 * The Context Panel's two server entrypoints (W3).
 *
 * Thin on purpose: they resolve the locale, delegate to the registry, and
 * return. No query, no table, no ranking, no authorization logic of their own —
 * every resolver enters through a canonical use case that already answers "may
 * this person see this row?".
 *
 * A `"use server"` module may only export async functions, so the registry, the
 * contracts and the pure model all live in sibling modules.
 */

/** Open one entity. The panel calls this whenever World State's `active_entity`
 *  changes; nothing here navigates, and nothing here writes. */
export async function loadEntityContext(ref: EntityRef): Promise<EntityContextResult> {
  const tPanel = await getTranslations("workspace.panel");
  return resolveEntityContext(ref, tPanel("unavailableUnknownType"));
}

/** The no-selection state: the person's real work context. */
export async function loadWorkContext(): Promise<WorkContextResult> {
  const locale = await getLocale();
  return resolveWorkContext(locale);
}
