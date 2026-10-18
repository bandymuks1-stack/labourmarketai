import "server-only";

import {
  isContactPermitted,
  type ContactPermissionState,
} from "./communication-eligibility";

/**
 * CONTACT AUTHORITY — proof that the §8.1 contact-permission gate HELD.
 *
 * WHY THIS EXISTS (audit 2026-10-06, F-1). `createConversationCore` is the ONE
 * place a conversation is created, and it is reachable from the exported
 * `'use server'` action `createConversation` — i.e. from a browser, with an
 * arbitrary `participantProfileIds`. The §8.1 gate lived only in the callers
 * that happened to run it first (`getOrCreateDirectConversation`,
 * `planDirectContact`). A client that called the action directly skipped it.
 *
 * THE SHAPE. Adding ANOTHER person to a conversation requires an authority
 * object. Only the modules that actually evaluated the gate can mint one
 * (`issueContactAuthority`, called with the `ContactPermissionState` they
 * resolved). The token is identified by IDENTITY in a module-private WeakSet:
 *   - it cannot be built from client input — a server action receives plain
 *     deserialised data, never an object created here;
 *   - a look-alike `{ permission: "allowed_engagement" }` is NOT recognised;
 *   - it carries no capability of its own beyond the permission it was issued
 *     for (default-closed: `no_permission` mints nothing).
 * The database enforces the same boundary from below
 * (20261006100100_conversation_participants_server_authority_v1): an end-user
 * session cannot insert another profile into a conversation at all, so even a
 * direct PostgREST call cannot add someone; only the server can, after this.
 *
 * Importers are pinned by lib/guards/conversation-creation-authority.test.ts.
 */

const issued = new WeakSet<object>();

export interface ContactAuthority {
  readonly permission: ContactPermissionState;
}

/** Mint an authority for a gate result that PERMITS contact; `null` otherwise. */
export function issueContactAuthority(
  permission: ContactPermissionState | null | undefined,
): ContactAuthority | null {
  if (!permission || !isContactPermitted(permission)) return null;
  const authority: ContactAuthority = Object.freeze({ permission });
  issued.add(authority);
  return authority;
}

/** True only for an object this module issued. */
export function isContactAuthority(value: unknown): value is ContactAuthority {
  return typeof value === "object" && value !== null && issued.has(value);
}
