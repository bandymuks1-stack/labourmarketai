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
     *
     * ── #1131 (2026-08-12) ──────────────────────────────────────────────────
     * OWNER APPROVAL, PUBLIC BETA TRAIN V6_4 §1 "OWNER APPROVAL B", verbatim:
     *   "The owner explicitly authorizes adding PR 1131 to
     *    public-acquisition-route-create-cv ... pullRequests list."
     *   "This approval is ONLY for the six already-known /create-cv A-01
     *    findings described in the V6.3 report."
     * and, equally binding, what it is NOT: not permission for future waivers,
     * not for unrelated product-gate findings, not to weaken the product
     * constitution, not to expand the waiver scope, not to change the expected
     * findings. None of those were touched.
     *
     * The owner's pre-conditions were checked by RUNNING the gate, not by
     * reasoning about it — the CI run on head `7809272d` is the evidence:
     *   * "product-gate: 0 new product surface(s) in this diff" — its own words;
     *   * exactly SIX findings, all `/create-cv`, all axiom A-01, byte-identical
     *     to `expectedFindings` below — the subset rule satisfied with nothing
     *     left over, and no unrelated finding anywhere in the run;
     *   * the sole rejection was `pr-not-covered`, i.e. the waiver was working
     *     correctly and simply did not list this PR;
     *   * PR head unchanged from the one the owner approved (`7809272d`);
     *   * `expiresAt` unchanged.
     *
     * WHAT #1131 ACTUALLY DOES to this route: two CTA hrefs gain
     * `?next=/dashboard/profile` (from one named constant), so a visitor who
     * came to build a free CV is no longer dropped on the generic dashboard
     * after signup. The route's existence, purpose and copy are untouched —
     * the same class of change as #1123, which is why the ruling that approved
     * the route still covers it.
     */
    pullRequests: [1119, 1123, 1131],
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

  {
    id: "public-acquisition-route-jobs",
    axioms: ["A-01"],
    /**
     * PUBLIC JOB BOARD — `/jobs`, `/jobs/[id]`, and the row card.
     *
     * OWNER RULING, 2026-08-18 directive §5 "CANONICAL JOB VISIBILITY POLICY",
     * verbatim:
     *   "Owner decision is final. Jobs must be publicly discoverable."
     *   "Every eligible active vacancy should have a stable indexable public URL
     *    where source terms permit."
     *   "But anonymous users MUST NOT receive the complete vacancy."
     * and the funnel it mandates (§6): "SEARCH ENGINE / SOCIAL / DIRECT → PUBLIC
     * JOB SEARCH → PUBLIC JOB PREVIEW → REGISTER / LOGIN → RETURN TO SAME JOB".
     *
     * This is a NEW owner ruling about a NEW surface. It does not inherit
     * anything from `public-acquisition-route-create-cv`, whose own record
     * states its approvals were "NOT a general authority to self-approve future
     * waivers" — that constraint is respected here by citing the owner's own
     * 2026-08-18 words rather than the 2026-08-10 ones.
     *
     * WHAT IS ACTUALLY BEING EXCUSED — the same CATEGORY ERROR as /create-cv,
     * not the axiom. A-01's five World-State questions describe a surface INSIDE
     * the authenticated workspace. The audience for this one is a person with no
     * account arriving from a search engine: no World State, no avatar, no map,
     * no assistant. All five answers are therefore honestly "no", and
     * `worldStateCanControlIt` is "no" for the same reason. The declarations in
     * `surface-registry.ts` record them as "no" rather than rewriting them to
     * green — A-06 forbids that lie more strongly than A-01 forbids the page.
     *
     * WHY THE PRODUCT ANSWER IS NOT "PUT IT IN THE CHAT". Members already reach
     * these vacancies inside the workspace via /dashboard/opportunities, which
     * the assistant does drive. This adds no second board: it adds the pre-auth
     * doorway to the same supply, and hands off with `?next=` so the workspace
     * resumes the visitor's actual intent.
     *
     * WHY THIS IS BOUNDED AND NOT A HOLE. All six gate constraints bind: the six
     * codes, axiom A-01, the five file entries, PR #1184, the expiry, and the
     * subset rule. A nineteenth finding anywhere — including on these three
     * surfaces — un-waives the whole run. No other route, PR or axiom inherits
     * anything.
     *
     * WHAT REMOVES IT (`resolvedBy`) — identical to the /create-cv record: the
     * gate does not model a pre-auth public acquisition route as a distinct
     * kind, so it judges one by workspace rules. Teaching it that category is a
     * CONSTITUTION change and therefore an owner decision. This train had
     * authority over the product surface (the owner ordered it explicitly), not
     * over the constitution.
     */
    /**
     * #1184 OPENED the surface. #1193 completes the funnel the SAME owner
     * ruling mandated, and stops it dead-ending.
     *
     * OWNER RULING, 2026-08-18 priority override, verbatim:
     *   "The only vacancy work that remains P0 now is the PRODUCT FUNNEL:
     *    public vacancy → registration/login → exact same vacancy →
     *    authenticated safe unlock → useful next action"
     *   "Security and cache isolation remain mandatory."
     *
     * That is the same funnel §6 already described ("REGISTER / LOGIN → RETURN
     * TO SAME JOB"), and #1193 implements its last step: the page was
     * auth-blind, so a visitor who registered was returned to the identical
     * "create an account" card.
     *
     * NOTHING ELSE ABOUT THIS RECORD CHANGES — not the axiom, not the six
     * codes, not the five files, not the expiry, not the reason. Only the PR
     * binding widens, and the finding set #1193 produces is byte-identical to
     * `expectedFindings` below: verified by running
     *   BASE_SHA=origin/main PR_NUMBER=1193 node .github/scripts/product-gate.mjs
     * which rejected all 18 for `pr-not-covered` and for NO other reason. The
     * subset rule therefore still binds — one new violation anywhere, including
     * on these three surfaces, re-blocks the run.
     *
     * THE CATEGORY ERROR BEING EXCUSED IS UNCHANGED. #1193 adds an
     * authenticated branch to a pre-auth acquisition route, so the five
     * World-State answers stay honestly "no" for the anonymous caller this
     * surface exists for, and the authenticated caller is handed into the
     * workspace — which is what `chatIntegration` above already promised.
     *
     * ── #1203 (2026-08-19) ──────────────────────────────────────────────────
     * OWNER APPROVAL, verbatim (2026-08-19):
     *   "OWNER APPROVAL: patvirtinu scoped product-gate waiver išplėtimą
     *    PR #1203. Įtrauk tik #1203 į jau egzistuojančią /jobs waiver
     *    taisyklę, nekeisk pačių product-gate kriterijų ir jų nesilpnink."
     * ("I approve extending the scoped product-gate waiver to PR #1203.
     *  Add ONLY #1203 to the existing /jobs waiver rule; do not change the
     *  product-gate criteria themselves and do not weaken them.")
     *
     * Exactly that was done: one number added to `pullRequests`. The axiom,
     * the six codes per surface, the three surfaces, the file list, the
     * expected finding set, the expiry and the subset rule are byte-unchanged,
     * and `product-gate.mjs` itself is not touched by this PR at all.
     *
     * The pre-conditions were checked by RUNNING the gate on this head rather
     * than reasoning about it — the same head, twice, differing only in the PR
     * number:
     *   BASE_SHA=origin/main PR_NUMBER=1193 → PRODUCT_GATE_PASS_WITH_SCOPED_TRANSITIONAL_WAIVER
     *   BASE_SHA=origin/main PR_NUMBER=1203 → 24 violations, every one rejected
     *                                         for `pr-not-covered` and no other
     *                                         reason.
     * So the diff adds ZERO findings; the waiver was working correctly and
     * simply did not list this PR.
     *
     * WHAT #1203 ACTUALLY DOES to these surfaces: a signed-in worker gets a
     * PRIVATE BOOKMARK — Save/Saved/Unsave on `/jobs/[id]`, and the return path
     * that makes a bookmark a bookmark: a saved tab on `/jobs` plus a "Saved"
     * marker on the card. It is not an application, not a shortlist, not
     * employer interest and not candidate disclosure — nobody but the saving
     * worker ever learns a save happened. The route's existence, purpose and
     * anonymous copy are untouched, which is the same class of change as #1193.
     *
     * ── #1208 (2026-08-19) ──────────────────────────────────────────────────
     * OWNER APPROVAL, verbatim (2026-08-19):
     *   "Patvirtinu scoped /jobs product-gate waiver PR #1208: pridėk tik
     *    `1208` prie esamo `pullRequests` sąrašo. Nekeisk ir nesilpnink pačių
     *    gate kriterijų. Drive-to-green ir merge tik su visais required checks
     *    GREEN."
     * ("I approve the scoped /jobs product-gate waiver for PR #1208: add ONLY
     *  `1208` to the existing `pullRequests` list. Do not change or weaken the
     *  gate criteria themselves. Drive to green and merge only with every
     *  required check GREEN.")
     *
     * Exactly that was done, and nothing else: ONE number added to
     * `pullRequests`. The axiom, the six codes per surface, the three
     * surfaces, the file list, the expected finding set, the expiry and the
     * subset rule are byte-unchanged, and `product-gate.mjs` is not touched by
     * this PR at all.
     *
     * The pre-conditions were checked by RUNNING the gate on this head, not by
     * reasoning about it — the same head, twice, differing only in the PR
     * number:
     *   BASE_SHA=origin/main PR_NUMBER=1203 → PRODUCT_GATE_PASS_WITH_SCOPED_TRANSITIONAL_WAIVER
     *   BASE_SHA=origin/main PR_NUMBER=1208 → 24 violations, 18 `not waived`
     *                                         lines, every one `pr-not-covered`
     *                                         and no other reason.
     * So the diff adds ZERO findings; the waiver was working correctly and
     * simply did not list this PR.
     *
     * WHAT #1208 ACTUALLY DOES to these surfaces: a profession filter the
     * board could always have passed. `search_public_vacancy_previews_v1` has
     * taken `p_profession_slug` since it shipped and 17,145 browsable rows
     * carry a slug, so a Lithuanian worker had to guess the Swedish word to
     * reach ads the platform had already classified. Plus `lang` on the
     * publisher's own words (WCAG 3.1.2), which were being read aloud with the
     * reader's phonetics. No new route, no new page, no new component family,
     * no auth change, no schema. The five World-State answers stay honestly
     * "no" for the anonymous visitor this surface exists for — same class of
     * change as #1193 and #1203.
     *
     * ── #1255 (2026-08-24) ──────────────────────────────────────────────────
     * OWNER APPROVAL (MASTER ORDER, 2026-08-24): "WAIVER APPROVAL IS STRICTLY
     * SCOPED: Push ONLY the described #1255 extension to the ... EXISTING
     * owner-waiver records ... Allowed: add PR #1255 to those existing scoped
     * waiver PR lists; add the dated explanatory comments ... NOT allowed:
     * changing Product Constitution axioms; creating a global waiver;
     * broadening the affected surfaces; deleting findings; suppressing new
     * findings; weakening the product gate."
     *
     * Exactly that was done, and nothing else: ONE number added to
     * `pullRequests`. The axiom, the six codes per surface, the file list,
     * the expected finding set, the expiry and the subset rule are
     * byte-unchanged, and `product-gate.mjs` is not touched by this PR.
     *
     * Pre-condition from the ACTUAL CI run on head `21c813d` (quality job
     * 97363265872): 30 violations — the six codes on exactly these five file
     * entries — and every `not waived` line carried the single reason
     * `pr-not-covered` ("covers PR 1184, 1193, 1203, 1208 and branch main;
     * this run is PR 1255"). The diff adds ZERO findings; the waiver was
     * working correctly and simply did not list this PR.
     *
     * WHAT #1255 ACTUALLY DOES to these surfaces: it NARROWS what an
     * anonymous visitor can see — the P0 identity/location boundary (owner
     * directive 2026-08-24): anonymous cards/detail stop echoing raw titles
     * that leaked employer names, cities and street addresses, attribution
     * stops naming the source country, and search stops matching the hidden
     * title (a probe oracle). Members keep the full detail via their own RLS
     * read path. No new route, no new page, no new component family, no auth
     * change; the DB half is the already-applied `20260824120000` SECDEF
     * narrowing. Same surfaces, strictly less exposure — the World-State
     * answers stay honestly "no" for the anonymous visitor.
     */
    pullRequests: [1184, 1193, 1203, 1208, 1255],
    // Empty for the same reason as the record above: the waiver must live IN
    // the branch whose CI honours it, so writing the head SHA down changes it.
    approvedHeadShas: [],
    postMergeBranches: ["main"],
    // Route ids are what `decideWaiver` matches (`files.includes(finding.what)`);
    // the real paths are what `touchesWaivedFile` compares against the diff.
    // Both halves are load-bearing — see the /create-cv note above.
    files: [
      "/jobs",
      "/jobs/[id]",
      "components/marketing/public-vacancy-card.tsx",
      "apps/web/app/[locale]/(marketing)/jobs/page.tsx",
      "apps/web/app/[locale]/(marketing)/jobs/[id]/page.tsx",
    ],
    // EXACTLY the finding set produced by
    //   BASE_SHA=origin/main PR_NUMBER=1184 node .github/scripts/product-gate.mjs
    // on 2026-08-18, AFTER the three declarations were added (which is what
    // removed the four `undeclared_surface` findings). Verified by running the
    // gate, not by reading the rules.
    expectedFindings: [
      { code: "not_world_state_driven", file: "/jobs" },
      { code: "not_reflected_on_map", file: "/jobs" },
      { code: "not_ai_controlled", file: "/jobs" },
      { code: "requires_leaving_workspace", file: "/jobs" },
      { code: "requires_new_page", file: "/jobs" },
      { code: "world_state_cannot_control_it", file: "/jobs" },
      { code: "not_world_state_driven", file: "/jobs/[id]" },
      { code: "not_reflected_on_map", file: "/jobs/[id]" },
      { code: "not_ai_controlled", file: "/jobs/[id]" },
      { code: "requires_leaving_workspace", file: "/jobs/[id]" },
      { code: "requires_new_page", file: "/jobs/[id]" },
      { code: "world_state_cannot_control_it", file: "/jobs/[id]" },
      { code: "not_world_state_driven", file: "components/marketing/public-vacancy-card.tsx" },
      { code: "not_reflected_on_map", file: "components/marketing/public-vacancy-card.tsx" },
      { code: "not_ai_controlled", file: "components/marketing/public-vacancy-card.tsx" },
      { code: "requires_leaving_workspace", file: "components/marketing/public-vacancy-card.tsx" },
      { code: "requires_new_page", file: "components/marketing/public-vacancy-card.tsx" },
      { code: "world_state_cannot_control_it", file: "components/marketing/public-vacancy-card.tsx" },
    ],
    reason:
      "A pre-authentication public acquisition route cannot satisfy questions that presuppose an authenticated workspace. The owner ordered the surface in the 2026-08-18 directive §5; the declarations answer all six 'no' honestly; this record excuses those six answers on these three surfaces and nothing else.",
    resolvedBy: "gate-learns-public-acquisition-route-category (owner constitution decision)",
    expiresAt: "2026-12-31",
    owner:
      "Owner directive 2026-08-18 §5 — 'Owner decision is final. Jobs must be publicly discoverable.' with the anonymous-field restriction it mandates.",
  },

  /**
   * PUBLIC LANDING V1 — canonical `/` acquisition surface.
   *
   * OWNER RULING, 2026-08-20, verbatim title and decision:
   *   "OWNER DECISION — SHIP THIS LANDING AS V1."
   * The same ruling requires the Europe-first living-market composition,
   * Work → Evidence → Opportunity chain, real-data panel, canonical CTAs,
   * responsive QA and shipping through the normal safe merge/deploy workflow.
   *
   * WHAT IS EXCUSED. Only the gate's existing category mismatch: an anonymous
   * acquisition page exists before World State, the avatar, the map workspace
   * and AI conversation exist, so its six workspace answers are honestly no.
   * The declaration records those no values; this waiver does not rewrite the
   * answers, alter the gate, or cover the `/live-market-review` alias (which is
   * a redirect and therefore not a second product surface).
   *
   * WHY THIS CANNOT LEAK. It is bound to one route, one implementation file,
   * PR #1221, A-01, the exact six findings below and a fixed expiry. Any extra
   * finding remains blocking through the existing subset rule.
   */
  {
    id: "public-acquisition-route-landing-v1",
    axioms: ["A-01"],
    scope:
      "The canonical public landing at / approved by the owner — the restored previous production landing as the DEFAULT FOCUS arm and the living-market V1 as the optional LIVE arm, both behind one URL",
    pullRequests: [1221, 1231, 1232, 1380],
    approvedHeadShas: [],
    postMergeBranches: ["main"],
    files: ["/", "apps/web/app/[locale]/page.tsx"],
    expectedFindings: [
      { code: "not_world_state_driven", file: "/" },
      { code: "not_reflected_on_map", file: "/" },
      { code: "not_ai_controlled", file: "/" },
      { code: "requires_leaving_workspace", file: "/" },
      { code: "requires_new_page", file: "/" },
      { code: "world_state_cannot_control_it", file: "/" },
    ],
    reason:
      "A pre-authentication public landing cannot satisfy workspace-only questions. The owner explicitly approved and ordered this V1 to ship; the declaration answers all six no honestly; this record excuses those six findings for this one route and nothing else. Extended to #1231 on 2026-08-22: the owner approved restoring the ACTUAL previous production landing as the FOCUS arm of this same canonical route, while LIVE stays unchanged. That adds no route, no seventh finding and no new axiom — both arms answer the same six workspace questions the same honest no, and a crawler still receives exactly one indexed landing at /. The waiver is NOT broadened to anything else. Extended again to #1232 on the same day: FOCUS became the DEFAULT arm and both arms were bound to the one canonical market reader. That moves which arm an unknown visitor sees and where its numbers come from — it adds no route, no seventh finding and no new axiom, and the six answers stay the same honest no for whichever arm renders. Extended to #1380 on 2026-08-31 under the owner's explicit P0 order of that day ('Investigate this as a real production performance/reliability regression … fix root cause if reproducible … no disabling functionality'): the fresh-visit entry was function-bound and cold-start-exposed, so the DEFAULT FOCUS arm became static/CDN-cached and the explicit-LIVE choice moved to a middleware rewrite of the SAME canonical route. Rendering strategy only — no route added, no arm removed, no seventh finding, no new axiom; the six answers stay the same honest no.",
    resolvedBy:
      "gate-learns-public-acquisition-route-category (owner constitution decision)",
    expiresAt: "2026-12-31",
    owner: "Product owner — OWNER DECISION: SHIP THIS LANDING AS V1 (2026-08-20)",
  },

  /**
   * ORGANIZATION MULTI-CAPABILITY CARD — the education pilot's registration
   * surface.
   *
   * OWNER RULING, 2026-08-27, verbatim:
   *   "APPROVED as a temporary PR-scoped waiver ONLY for: not_reflected_on_map,
   *    not_ai_controlled. Scope: components/app/organization-capabilities-card.tsx.
   *    Axiom: A-01. PR: 1299."
   *   "The organization multi-capability UI is required to close the
   *    education/institution pilot cycle now. The underlying multi-role
   *    architecture is canonical and already production-backed. World Map
   *    reflection and conversational AI control remain required follow-up
   *    integrations; absence of those two secondary representations must not
   *    block the real organization capability workflow."
   *   "This waiver MUST NOT waive any other Product Gate finding. Do not
   *    broaden its scope."
   *
   * WHAT IS BEING EXCUSED — two SECONDARY REPRESENTATIONS, not the surface.
   * The card's declaration answers `reflectedOnMap: false` and
   * `aiControlled: false` HONESTLY (A-06 outranks the temptation to rewrite
   * them green): nothing renders an organization's training capability on the
   * market map today, and the assistant cannot yet open the card. The three
   * remaining World-State answers — `changesWorldState`,
   * `usableWithoutLeavingWorkspace`, `needsNoNewPage` — are real YES, so this
   * is a partial, two-answer debt on an existing surface, not a new page
   * escaping the lock.
   *
   * WHY IT CANNOT LEAK. All six gate constraints bind: the two codes, axiom
   * A-01, the single file, PR #1299, the expiry, and the subset rule. A third
   * finding anywhere — including on this same card — un-waives the entire run.
   * No other surface, PR or axiom inherits anything.
   *
   * ENABLING STEPS (owner-required; either one landing removes half of this
   * record, both remove it entirely):
   *   1. MAP — reflect organization capabilities on the canonical World Map /
   *      state representation, so declared education supply is visible where
   *      the market is read. `mapEffect` in the declaration then becomes a real
   *      effect and `reflectedOnMap` a real yes.
   *   2. CONVERSATION — make capability declaration and change reachable
   *      through the canonical conversational action layer WITHOUT creating a
   *      parallel write path: the assistant must call the SAME
   *      `add_organization_role_v1` the card calls. A second writer would be a
   *      doctrine violation that costs more than the waiver it removes.
   *
   * WHY THE ARCHITECTURE ALREADY SUPPORTS BOTH. `organization_roles`
   * (20260827050000, applied) is a registry-keyed, many-valued fact — neither
   * enabling step needs a schema change, which is why they are integrations
   * and not redesigns.
   */
  {
    id: "organization-multi-capability-card",
    axioms: ["A-01"],
    scope:
      "The organization multi-capability declaration card (education pilot P0.1) — its map reflection and conversational control ONLY",
    pullRequests: [1299],
    approvedHeadShas: [],
    /**
     * Once #1299 merges the debt lives in `main`, and the gate validates the
     * whole registry on every run rather than only the diff. Without this the
     * merged waiver would turn `main` red and block every later PR — the exact
     * failure the mechanism exists to remove. Every other constraint still
     * binds; only `main` is listed.
     */
    postMergeBranches: ["main"],
    files: ["components/app/organization-capabilities-card.tsx"],
    expectedFindings: [
      { code: "not_reflected_on_map", file: "components/app/organization-capabilities-card.tsx" },
      { code: "not_ai_controlled", file: "components/app/organization-capabilities-card.tsx" },
    ],
    reason:
      "An education institution cannot register honestly without a way to state that it educates, and the single-value company_type field cannot carry it. The multi-role architecture behind the card is canonical and production-backed. The two failing answers are missing SECONDARY representations of a fact the card records truthfully — a map layer and a conversational entry point — and the owner ruled that their absence must not block the real organization capability workflow. Both are recorded as NO in the declaration rather than rewritten to YES.",
    resolvedBy:
      "organization-capabilities-on-map + capability-declaration-via-canonical-conversational-action-layer (the two enabling steps above; no schema change needed for either)",
    expiresAt: "2026-11-30",
    owner:
      "Product owner — OWNER RULING 2026-08-27 §3, PR-scoped waiver for #1299, axiom A-01, codes not_reflected_on_map + not_ai_controlled only",
  },

  /**
   * OAUTH CONSENT SCREEN — the human-only step of the client ecosystem.
   *
   * OWNER RULING, 2026-08-29 execution order §4, verbatim:
   *   "Prepare and perform the minimum configuration required for
   *    LabourMarket.ai to act as the OAuth authorization server for
   *    MCP/ChatGPT IF the currently authorized Supabase tooling allows this
   *    safely."
   * The Supabase OAuth 2.1 server REQUIRES the product to host the
   * authorization UI at a fixed URL (Authorization Path); this screen IS the
   * minimum configuration, so the ruling that ordered the configuration
   * ordered the surface.
   *
   * WHAT IS BEING EXCUSED — a THIRD category, distinct from the pre-auth
   * acquisition records above: STANDARDS-SHAPED AUTH INFRASTRUCTURE. OAuth
   * 2.1 defines this screen's existence, URL-stability and redirect flow, so
   * `needsNoNewPage` and `usableWithoutLeavingWorkspace` are honestly "no"
   * by specification, not by design preference. And `aiControlled` /
   * `aiCanWorkWithIt` are "no" as a SECURITY PROPERTY: the one step where a
   * person grants an external agent standing access must never itself be
   * agent-drivable — an assistant that could operate this screen could be
   * prompt-injected into granting itself access. Waiving the A-09 finding
   * here is therefore not excusing a gap; it is refusing to close one that
   * must stay open. All answers are recorded as "no" in the declaration
   * rather than rewritten (A-06).
   *
   * WHY THIS CANNOT LEAK. All six gate constraints bind: the seven codes,
   * axioms A-01 + A-09 (A-09 for the single `ai_cannot_work_with_entity`
   * code only), the two file entries, PR #1347, the expiry, and the subset
   * rule — an eighth finding anywhere un-waives the whole run. No other
   * surface, PR or axiom inherits anything.
   *
   * WHAT REMOVES IT (`resolvedBy`): the gate learning an
   * auth-infrastructure category (a constitution change, owner-only) — the
   * same resolution path as the acquisition records, plus one honest
   * difference: for THIS surface `aiControlled` must never become "yes", so
   * category-learning is the only resolution that can exist.
   */
  {
    id: "oauth-consent-auth-infrastructure",
    axioms: ["A-01", "A-09"],
    scope:
      "The OAuth 2.1 consent screen /oauth/consent (owner directive 2026-08-29 §4) — the delegated Supabase Authorization Path UI",
    pullRequests: [1347],
    approvedHeadShas: [],
    postMergeBranches: ["main"],
    files: [
      "/oauth/consent",
      "apps/web/app/[locale]/oauth/consent/page.tsx",
    ],
    // EXACTLY the finding set produced by
    //   BASE_SHA=origin/main PR_NUMBER=1347 node .github/scripts/product-gate.mjs
    // on 2026-08-29, after the declaration was added. Verified by running the
    // gate, not by reading the rules.
    expectedFindings: [
      { code: "not_world_state_driven", file: "/oauth/consent" },
      { code: "not_reflected_on_map", file: "/oauth/consent" },
      { code: "not_ai_controlled", file: "/oauth/consent" },
      { code: "requires_leaving_workspace", file: "/oauth/consent" },
      { code: "requires_new_page", file: "/oauth/consent" },
      { code: "ai_cannot_work_with_entity", file: "/oauth/consent" },
      { code: "world_state_cannot_control_it", file: "/oauth/consent" },
    ],
    reason:
      "OAuth 2.1 and the Supabase Authorization Path contract require a consent screen at a fixed URL, outside the workspace, that no AI may operate — the last property being the security point of the screen, not a debt. The owner ordered the minimum OAuth-server configuration on 2026-08-29; this screen is that configuration's product half. All seven answers are declared honestly and excused for this one route and nothing else.",
    resolvedBy:
      "gate-learns-auth-infrastructure-category (owner constitution decision; note aiControlled must remain 'no' for this surface permanently)",
    expiresAt: "2026-12-31",
    owner:
      "Owner ruling 2026-08-29 execution order §4 — 'Prepare and perform the minimum configuration required for LabourMarket.ai to act as the OAuth authorization server for MCP/ChatGPT.'",
  },

  {
    id: "work-hours-allocation-surface",
    axioms: ["A-01"],
    /**
     * WORK-HOUR ALLOCATIONS — `/dashboard/hours` (M3, PR #1344).
     *
     * OWNER APPROVAL, 2026-08-31 closure session, verbatim:
     *   "M3_MIGRATION_APPROVAL: APPROVE
     *    HOURS_PRODUCT_GATE_WAIVER: APPROVE
     *    Approval scope is limited strictly to the fresh #1344 / package 0010
     *    implementation described in the closure report."
     *
     * WHAT IS BEING EXCUSED. The surface declares three honest "no" answers:
     * it is a structured per-day hour ledger (numeric facts per worker ×
     * object × date), not yet reflected on the workspace map, not yet
     * AI-operable, and it needs its own page because a dense editable grid
     * does not fit a chat turn. The declaration refuses to claim otherwise;
     * this record excuses exactly those three answers for this one route,
     * per the /jobs precedent (the surface must not waive itself — the
     * waiver arrives WITH the owner approval, not before).
     */
    scope:
      "The manager hour-allocation surface /dashboard/hours (M3, decision package docs/DECISIONS/0010-owner-migration-decision-package-2026-08-31.md Item 2)",
    pullRequests: [1344],
    // Deliberately empty — the waiver lives IN the branch whose CI must
    // honour it, so pinning the head SHA would change the head SHA.
    approvedHeadShas: [],
    // After the squash-merge the gate re-validates the whole registry on
    // `main`, so the post-merge branch run must be covered too.
    postMergeBranches: ["main"],
    files: [
      "/dashboard/hours",
      "apps/web/app/[locale]/dashboard/hours/page.tsx",
    ],
    // EXACTLY the finding set produced by
    //   BASE_SHA=origin/main PR_NUMBER=1344 node .github/scripts/product-gate.mjs
    // on 2026-08-31 (post main-merge at 371c0eaa). Verified by running the
    // gate, not by reading the rules.
    expectedFindings: [
      { code: "not_reflected_on_map", file: "/dashboard/hours" },
      { code: "not_ai_controlled", file: "/dashboard/hours" },
      { code: "requires_new_page", file: "/dashboard/hours" },
    ],
    reason:
      "The canonical row-level work-hour fact (work_hour_allocations) needs a dense per-day editing surface that cannot honestly claim map reflection or AI operability on day one. The owner reviewed package 0010 and approved both the RED migration and these three declared 'no' answers for this one route and nothing else.",
    resolvedBy:
      "hours-surface-reaches-map-and-chat (reflect allocations on the workspace map and expose an AI/chat write path, then delete this record)",
    expiresAt: "2026-12-31",
    owner:
      "Owner decision, 2026-08-31 closure session — 'HOURS_PRODUCT_GATE_WAIVER: APPROVE' (scope: fresh #1344 / package 0010 only).",
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
