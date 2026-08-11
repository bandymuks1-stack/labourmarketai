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
 * The active waivers.
 *
 * The list was EMPTY from W6 (the `w3-w4-context-panel-not-on-map` record was
 * removed the moment the workspace map shipped and `reflectedOnMap` became a
 * real yes — exactly the self-expiry the owner demanded) until the record
 * below, which is a NEW owner ruling and not a leftover.
 */
export const SCOPED_OWNER_WAIVERS = [
  /**
   * PUBLIC ACQUISITION ROUTE — `/create-cv`.
   *
   * OWNER RULING, PUBLIC BETA TRAIN V3 §2.1 (2026-08-10), verbatim:
   *   "YES — labourmarket.ai SHOULD have a dedicated public FREE CV creation /
   *    acquisition surface. The public CV builder is intentional. Do NOT fold
   *    it invisibly into /worker-intake merely to avoid adding a page."
   *   "If the Product Constitution requires an explicit scoped owner waiver for
   *    #1119, this command supplies the PRODUCT DECISION: APPROVED: dedicated
   *    public /create-cv route."
   *
   * WHAT IS ACTUALLY BEING EXCUSED. Not the axiom — the CATEGORY ERROR. A-01's
   * five World-State questions describe a surface inside the AUTHENTICATED
   * workspace. An anonymous visitor arriving from a search result or an advert
   * has no World State, no avatar, no map and no assistant, so all five answers
   * are honestly "no", and `worldStateCanControlIt` is "no" for the same
   * reason. The declaration in `surface-registry.ts` records them as "no"
   * rather than rewriting them to green — A-06 forbids the lie more strongly
   * than A-01 forbids the page.
   *
   * WHY THIS IS BOUNDED AND NOT A HOLE. The gate's own six constraints all
   * bind: the six codes, the axiom A-01, the file `/create-cv`, PR #1119, the
   * expiry, and the subset rule. A seventh finding anywhere — including on
   * `/create-cv` itself — un-waives the whole run. No other route, PR or axiom
   * inherits anything, which is exactly what the owner meant by "Do not
   * interpret this as permission to waive unrelated landing/page rules."
   *
   * WHAT REMOVES IT (`resolvedBy`). The gate does not model a pre-auth public
   * acquisition route as a distinct kind, so it judges one by workspace rules.
   * The 118 grandfathered BASELINE screens — `/`, `/for-workers`,
   * `/for-companies`, `/pricing` — fail the same five questions and escape only
   * by being older, not by being compliant. Teaching the gate that category is
   * a CONSTITUTION CHANGE and therefore an owner decision; this train had
   * authority over the product surface, not over the constitution, so it took
   * the bounded waiver and left the amendment to the owner.
   *
   * KNOWN PROPERTY THE OWNER SHOULD SEE. `decideWaiver` tests `expiresAt`
   * BEFORE the unrelated-PR escape. After `expiresAt` these six findings block
   * EVERY pull request in the repository, not just ones touching `/create-cv`,
   * because rule 6c re-validates the whole registry on every run. That is the
   * mechanism's designed pressure to resolve the debt rather than renew it —
   * but it is a repo-wide deadline, not a local one, and it is written down
   * here so nobody meets it by surprise.
   */
  {
    id: "public-acquisition-route-create-cv",
    axioms: ["A-01"],
    scope: "The public free-CV acquisition route /create-cv (PUBLIC BETA TRAIN V3 §2.1)",
    /**
     * #1119 CREATED the route under the ruling above. #1123 changes its CTA
     * markup and nothing else, so the owner extended the same ruling to it —
     * OWNER APPROVAL, PUBLIC BETA TRAIN V5_1 §1 (2026-08-11), verbatim:
     *   "OWNER APPROVES extending the existing /create-cv
     *    product-constitution waiver to PR #1123."
     *   "This approval is specifically for #1123. It is NOT a general
     *    authority to self-approve future waivers."
     *
     * The four conditions the owner attached were checked before this line was
     * written, by RUNNING the gate at head `bd5ab221` rather than reasoning
     * about it:
     *   * "0 new product surface(s) in this diff" — the gate's own words;
     *   * the diff adds exactly ONE file, a Playwright spec — no route, no
     *     page, no surface-registry entry;
     *   * the six findings are byte-identical to `expectedFindings` below,
     *     same codes, same `/create-cv`, same axiom A-01 — the subset rule is
     *     satisfied with nothing left over;
     *   * PR head unchanged from the one the owner reviewed.
     *
     * WHAT #1123 ACTUALLY DOES to this route: a <button> nested inside the
     * anchor is removed, and the anchor itself carries the CTA grammar. The
     * route's existence, purpose and copy are untouched, which is why the
     * ruling that approved the route still covers it.
     *
     * Nothing is loosened. The six codes, axiom A-01, the file list, the
     * expiry and the subset rule all still bind; a seventh finding anywhere
     * still un-waives the whole run; and no other PR, route or axiom inherits
     * anything from this line.
     */
    pullRequests: [1119, 1123],
    // Deliberately empty: the waiver must live IN the branch whose CI honours
    // it, so writing the head SHA down changes the head SHA. The PR number is
    // the binding key; see the module header.
    approvedHeadShas: [],
    // After the squash-merge the gate re-validates the whole registry on
    // `main`, so the post-merge branch run must be covered too.
    postMergeBranches: ["main"],
    // TWO entries, and both are load-bearing — this is the subtle one.
    //
    //  • "/create-cv" is the finding's `what` (a ROUTE id), and `decideWaiver`
    //    requires `files.includes(finding.what)`.
    //  • the page PATH is what `touchesWaivedFile` compares against the real
    //    diff. Without it, no changed file would ever end with "/create-cv",
    //    every unlisted PR would look "unrelated", and the "nothing new can
    //    inherit this waiver" guarantee would silently evaporate. Proven by the
    //    negative-control test that puts the page in an unlisted PR's diff and
    //    expects `pr-not-covered`.
    files: ["/create-cv", "apps/web/app/[locale]/(marketing)/create-cv/page.tsx"],
    // EXACTLY the finding set produced by
    //   BASE_SHA=origin/main PR_NUMBER=1119 node .github/scripts/product-gate.mjs
    // on 2026-08-10. Verified by running the gate, not by reading the rules.
    expectedFindings: [
      { code: "not_world_state_driven", file: "/create-cv" },
      { code: "not_reflected_on_map", file: "/create-cv" },
      { code: "not_ai_controlled", file: "/create-cv" },
      { code: "requires_leaving_workspace", file: "/create-cv" },
      { code: "requires_new_page", file: "/create-cv" },
      { code: "world_state_cannot_control_it", file: "/create-cv" },
    ],
    reason:
      "A pre-authentication public acquisition route cannot satisfy questions that presuppose an authenticated workspace. The owner approved the surface; the honest declaration answers all six 'no'; this record excuses those six answers for this one route and nothing else.",
    resolvedBy: "gate-learns-public-acquisition-route-category (owner constitution decision)",
    expiresAt: "2026-12-31",
    owner:
      "Owner ruling, PUBLIC BETA TRAIN V3 §2.1 (2026-08-10) — APPROVED: dedicated public /create-cv route.",
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
