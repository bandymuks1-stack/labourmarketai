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
export const SCOPED_OWNER_WAIVERS = [
  {
    id: "w3-w4-context-panel-not-on-map",
    // Nothing outside A-01 / A-09 is waivable.
    axioms: ["A-01", "A-09"],
    scope: "W3 (Context Panel) + W4 (AI Workspace)",
    // THE BINDING KEY. A PR not listed here matches nothing.
    pullRequests: [909, 912],
    // Audit trail; enforced only when a run supplies a SHA to check.
    approvedHeadShas: [],
    // The only files whose findings may be excused.
    files: ["components/app/world-state/context-panel.tsx"],
    // The EXACT finding set the owner reviewed. A run producing anything more
    // is out of scope and must go back to review.
    expectedFindings: [
      { code: "not_reflected_on_map", file: "components/app/world-state/context-panel.tsx" },
      { code: "transitional_waiver_in_use", file: "components/app/world-state/context-panel.tsx" },
    ],
    reason:
      "The Context Panel cannot be reflected on the World Map before the map is part of the workspace. The owner's own W3-W8 sequence puts the Context Panel at W3 and the operational World Map at W6, so 'not yet' is the true answer and claiming 'yes' would be the fabrication this gate exists to catch. The selection already lives in World State, which is what makes W6 a subscription rather than a rewrite.",
    // The work whose arrival makes this unnecessary. Not a date — a THING.
    resolvedBy: "W6-map-slice",
    // ISO date, inclusive. After it, the waiver is dead.
    expiresAt: "2026-10-31",
    owner:
      "Owner ruling 2026-07-29 — scoped transitional waiver approved for the existing W3/W4 scope only; explicitly NOT inheritable by W5 or any new change.",
  },
];

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
    if (ctx.pullRequest === null || !w.pullRequests.includes(ctx.pullRequest)) {
      return no(
        "pr-not-covered",
        `${w.id} covers PR ${w.pullRequests.join(", ")}; this run is ${ctx.pullRequest ?? "not a PR"}`,
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
  return {
    pullRequest: pr === null ? null : Number(pr),
    headSha: env.PR_HEAD_SHA || null,
    today: (env.GATE_TODAY || now.toISOString()).slice(0, 10),
  };
}
