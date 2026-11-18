import { test } from "@playwright/test";

/**
 * THE INVITATION ABUSE CAP IS A PRODUCT RULE, NOT A TEST FAILURE.
 *
 * `create_invitation_v*` allows one inviter at most 30 invitations per rolling
 * 24 h (and 100 open). The synthetic owner reaches it after a few walks in a
 * day (2026-10-13: brigade-formation "failed" with "Kol kas pasiektas kvietimų
 * limitas"). The cap is RIGHT and stays exactly as it is — no exemption, no
 * second door, no service-role shortcut. A walk that meets it reports the
 * steps that depend on the invitation as BLOCKED (skipped with this reason),
 * never as a product FAIL and never as PASS.
 *
 * Usage in a serial spec:
 *   const cap = inviteCapGate();          // at module level
 *   cap.check(textTheProductShowed);      // where the invitation is created
 * Every later test in the file is skipped with the same BLOCKED reason.
 */
export const INVITE_CAP_ANSWER = /kvietimų limitas|limit_reached|invitation limit/i;
export const INVITE_CAP_REASON = "BLOCKED: the inviter reached the product's invitation cap (30 per 24 h); not a product failure";

export function inviteCapGate(): { check: (productAnswer: string) => void; readonly blocked: boolean } {
  const state = { blocked: false };
  test.beforeEach(() => {
    test.skip(state.blocked, INVITE_CAP_REASON);
  });
  return {
    check(productAnswer: string) {
      if (INVITE_CAP_ANSWER.test(productAnswer)) {
        state.blocked = true;
        console.info(`[invite-cap] ${INVITE_CAP_REASON}`);
        test.skip(true, INVITE_CAP_REASON);
      }
    },
    get blocked() {
      return state.blocked;
    },
  };
}
