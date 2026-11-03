/**
 * Synthetic QA plus-addresses on the platform's own domain
 * (`qa.<name>+<tag>@labourmarket.ai`) are created by the production walks for
 * invitations and rosters; the walks take the link from the API, never from a
 * mailbox. The domain's mail host has no plus-addressing, so a send to one is a
 * hard 550 bounce into the platform mailbox. The transactional send choke point
 * (lib/email/transactional.ts, lib/email/send-ledger-store.ts) never delivers to
 * them and answers `suppressed_synthetic_address` instead.
 *
 * Deliberately narrow: only the `qa.` local part WITH a `+tag`, only our own
 * domain. `qa.invited@labourmarket.ai` (no plus) is the real QA mailbox and
 * stays deliverable; every other address is untouched.
 */
const SYNTHETIC_QA_PLUS_ADDRESS = /^qa\.[^@+\s]+\+[^@\s]+@labourmarket\.ai$/i;

export function isSyntheticQaPlusAddress(email: string): boolean {
  return SYNTHETIC_QA_PLUS_ADDRESS.test(email.trim());
}
