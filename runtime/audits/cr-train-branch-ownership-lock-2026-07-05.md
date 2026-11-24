# CR TRAIN — SHARED TREE / BRANCH OWNERSHIP LOCK (owner, 2026-07-05)

Binding from Wagon 6 onward (Part A of the combined lock).

1. Only the currently active wagon agent writes to the repo working tree.
2. No parallel helper commits into another wagon's branch.
3. Coordinator locks/fixes while a wagon is active: report as a required carried
   lock → the ACTIVE wagon agent applies it; or a separate branch from fresh main
   AFTER the active wagon merges. The coordinator does NOT touch the tree.
4. Pre-PR discipline (every wagon): `git status --short --branch` +
   `git log --oneline origin/main..HEAD`; list every commit riding the PR;
   declare any carried commit explicitly in the PR body.
5. Contamination found → STOP before push/PR; report branch/commits/diff;
   no branch surgery while another wagon runs without owner approval.

HISTORY (to be restated honestly in the final CR closure): the one prior
collision — coordinator commit 90a964e (owner NO-FAKE-FINDER-RESULTS lock,
finder relabel + 6 guard pins) landed on wagon-4's feat/cc/plan-clarity branch
via a shared-tree branch switch; disclosed in PR #622's body and commit list,
gate-verified, merged as part of 3040556. No other carried commits exist.
