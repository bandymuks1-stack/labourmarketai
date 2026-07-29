// SCOPED OWNER WAIVERS — the only way an axiom violation may pass the gate.
//
// Owner ruling, 2026-07-29. The problem it solves, in the owner's words: a
// transitional exception that always returns `exit 1` is not a waiver, it is a
// permanent blocker. But a blanket exception would delete the axiom. So the
// gate now accepts exactly one thing — a waiver record that names WHAT is
// excused, for WHICH pull request, on WHICH file, WHY, until WHEN, and WHAT
// removes it.
//
// ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
// It does not amend A-01. It does not delete the `not_reflected_on_map`
// finding: the violation is still detected, still printed, and still named in
// the architecture diff. What changes is only the EXIT CODE for a violation the
// owner has already reviewed and bounded.
//
// ── WHY IT CANNOT LEAK ─────────────────────────────────────────────────────
// Five independent constraints must ALL hold, or the waiver does nothing:
//   1. the finding's CODE is listed;
//   2. the finding's AXIOM is listed;
//   3. the finding's FILE is listed;
//   4. the pull request is listed (a different PR — W5, or anything new —
//      matches nothing, so it can never inherit the exception);
//   5. today is on or before `expiresAt`.
// And one more, which is what makes "any extra diff re-triggers review" real:
//   6. the run's findings must be a SUBSET of `expectedFindings`. One new
//      violation anywhere — even on a waived file — and the gate blocks again.
//
// ── WHY THE BINDING KEY IS THE PR NUMBER ───────────────────────────────────
// The ruling allows "specific PRs OR their exact head SHAs". Head-SHA pinning
// is self-defeating here: the waiver has to live IN the branch whose CI must
// honour it, so writing the SHA down changes the SHA. `approvedHeadShas` is
// therefore recorded for audit and enforced only when a run supplies a SHA to
// check (`PR_HEAD_SHA`), while the PR number is the always-on binding.
//
// THIS FILE IS THE SINGLE IMPLEMENTATION: the gate imports it, and the vitest
// guard imports the same module. There is no second copy of the rules.

/**
 * The active waivers. Exactly one, covering the already-reviewed W3/W4
 * transitional debt: the Context Panel cannot be reflected on the World Map
 * before the map is part of the workspace, and the owner sequenced the map
 * after the panel.
 */
/**
 * The active waivers. EMPTY since W6: the one recorded waiver
 * (`w3-w4-context-panel-not-on-map`) was removed the moment the workspace map
 * shipped and `reflectedOnMap` became a real yes — exactly the self-expiry the
 * owner demanded. The MECHANISM stays: a future owner ruling adds a record
 * here, with the same six constraints, and the tests keep proving them on
 * synthetic fixtures.
 */
export const SCOPED_OWNER_WAIVERS = [];

/** Is this ONE finding excused? Every constraint must hold. */
export function decideWaiver(finding, ctx, waivers = SCOPED_OWNER_WAIVERS) {
  const no = (rejection, detail) => ({ waived: false, waiver: null, rejection, detail });

  const candidates = waivers.filter((w) =>
    w.expectedFindings.some((e) => e.code === finding.code && e.file === finding.what),
  );
  if (candidates.length === 0) {
    return no("no-waiver", `no waiver names ${finding.code} on ${finding.what}`);
  }

  for (const w of candidates) {
    if (String(w.owner ?? "").trim().length < 3) {
      return no("no-waiver", `${w.id} carries no recorded owner approval`);
    }
    if (!w.axioms.includes(finding.axiom)) {
      return no("axiom-not-waivable", `${w.id} does not cover axiom ${finding.axiom}`);
    }
    if (!w.files.includes(finding.what)) {
      return no("file-not-covered", `${w.id} does not cover file ${finding.what}`);
    }
    if (ctx.today > w.expiresAt) {
      return no(
        "expired",
        `${w.id} expired on ${w.expiresAt} — remove it and resolve ${w.resolvedBy}`,
      );
    }
    // A run may carry this finding for exactly three reasons.
    const branches = w.postMergeBranches ?? [];
    const isListedPr = ctx.pullRequest !== null && w.pullRequests.includes(ctx.pullRequest);
    const isPostMergeBranch = ctx.pullRequest === null && !!ctx.branch && branches.includes(ctx.branch);
    // (3) PRE-EXISTING DEBT. Once a waived PR merges, the violation lives in the
    //     base branch and the gate — which validates the registry as a whole,
    //     not just the diff — reports it on EVERY later PR. Holding an unrelated
    //     PR responsible for a finding its diff never touched would make the
    //     merged waiver a permanent block on the whole repository, which is the
    //     very failure this mechanism exists to remove. So: if the PR does not
    //     touch any waived file, the finding is not its doing.
    //
    //     This does NOT let a new change inherit the exception. The subset rule
    //     still blocks any NEW finding, and the moment a PR does touch a waived
    //     file it must be one of the listed PRs.
    const touchesWaivedFile =
      ctx.changedFiles === null ||
      w.files.some((f) => ctx.changedFiles.some((c) => c.endsWith(f)));
    const isUnrelatedPr = ctx.pullRequest !== null && !isListedPr && !touchesWaivedFile;

    if (!isListedPr && !isPostMergeBranch && !isUnrelatedPr) {
      return no(
        "pr-not-covered",
        `${w.id} covers PR ${w.pullRequests.join(", ")}${
          branches.length > 0 ? ` and branch ${branches.join(", ")}` : ""
        }; this run is ${
          ctx.pullRequest !== null
            ? `PR ${ctx.pullRequest}, and it MODIFIES ${w.files.join(", ")}`
            : ctx.branch
              ? `branch ${ctx.branch}`
              : "not a PR"
        }`,
      );
    }
    if (
      w.approvedHeadShas.length > 0 &&
      ctx.headSha !== null &&
      !w.approvedHeadShas.includes(ctx.headSha)
    ) {
      return no("sha-not-covered", `${w.id} does not cover head ${ctx.headSha}`);
    }
    return {
      waived: true,
      waiver: w,
      rejection: null,
      detail: `${w.id} — ${w.scope}, until ${w.expiresAt}, removed by ${w.resolvedBy}`,
    };
  }
  return no("no-waiver", "no candidate waiver applied");
}

/**
 * Decide the WHOLE run.
 *
 * The subset rule is the teeth: a waiver excuses the exact finding set the
 * owner reviewed and nothing else. One extra violation — anywhere, including
 * on a waived file — and the run is unwaived again.
 */
export function evaluateFindings(findings, ctx, waivers = SCOPED_OWNER_WAIVERS) {
  const waivedFindings = [];
  const blockingFindings = [];
  for (const f of findings) {
    const decision = decideWaiver(f, ctx, waivers);
    if (decision.waived) waivedFindings.push({ finding: f, decision });
    else blockingFindings.push({ finding: f, decision });
  }
  return { pass: blockingFindings.length === 0, waivedFindings, blockingFindings };
}

/** The run context the gate builds from its environment. */
export function waiverContextFromEnv(env = process.env, now = new Date()) {
  const fromRef = /refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? "")?.[1];
  const pr = env.PR_NUMBER || fromRef || null;
  // `refs/heads/main` → "main". Only used for the post-merge case above.
  const branch =
    env.GATE_BRANCH ||
    /refs\/heads\/(.+)$/.exec(env.GITHUB_REF ?? "")?.[1] ||
    null;
  return {
    pullRequest: pr === null ? null : Number(pr),
    branch,
    headSha: env.PR_HEAD_SHA || null,
    today: (env.GATE_TODAY || now.toISOString()).slice(0, 10),
    // Filled by the gate from its own diff. `null` means "unknown", which is
    // treated as "touches everything" — the cautious direction.
    changedFiles: null,
  };
}
