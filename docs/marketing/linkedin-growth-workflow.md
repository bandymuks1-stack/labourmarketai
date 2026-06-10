# LinkedIn Growth Workflow — Labourmarket.ai

> Binding companion rules: [`linkedin-safe-claims-and-publish-gates.md`](./linkedin-safe-claims-and-publish-gates.md).
> If anything in this workflow appears to conflict with that document, the safe-claims document wins.

Official profile: <https://www.linkedin.com/in/labour-marketai-3b56a0394/>

## Operating mode (non-negotiable)

- **Draft-only by default.** Every artifact produced by this workflow is a draft until the owner approves it.
- **No auto-publish.** Nothing is ever posted to LinkedIn by an agent or a script.
- **No auto-messaging.** No connection requests, DMs, InMails, or comments are ever sent automatically.
- **No scraping.** No automated collection of LinkedIn pages, profiles, or search results.
- **No bypassing.** No login automation, no captcha solving, no rate-limit evasion, no session-cookie reuse, no headless-browser impersonation of the owner.
- All research uses public, permitted sources (own product docs, public industry reports, owner-provided notes) — never automated LinkedIn extraction.

## The five-stage loop

Each cycle (weekly by default) runs the stages below. Stages 1–4 produce drafts; **nothing crosses to "live" without Stage G (Owner Review Gate)**.

### Stage 1 — Research

Inputs: product reality (repo docs, shipped features), owner notes, public labour-market sources.

- Confirm what is actually shipped vs. in progress (check the repo, not memory) so every claim is current and true.
- Collect topical hooks: EU labour-market news, construction-sector workforce themes, staffing-industry conversations.
- Identify audience segments for the week: workers, construction companies, staffing/recruitment agencies (core pillar), customers with labour demand.
- Output: a short research brief per planned post — topic, audience, the true product facts it can lean on, and the honest status of each feature mentioned.

### Stage 2 — Content

- Draft posts from the research briefs, following the calendar (`linkedin-30-day-content-calendar.md`) and the voice rules in `linkedin-profile-optimization.md`.
- Every draft carries an **honest-status note** stating which allowed status phrase applies ("early product build", "in progress", "not live yet", "preparing first customers").
- Run the banned-token self-check from the safe-claims doc before handing the draft onward.
- Output: full post text, ready to paste, plus alt-text for any visual.

### Stage 3 — Design

- Specify visuals only: carousel outlines, banner direction, simple diagram briefs (trust chain, marketplace circle, role model).
- Visuals must show the product as it is. Screenshots of in-progress UI are allowed only when labelled "in progress" or "not live yet" inside the image or caption. Never depict invented users, invented numbers, or a fake live marketplace.
- Output: design brief or finished static asset, with the same honesty labelling as the text.

### Stage 4 — Outreach-prepare (prepare only — never send)

- Build a **suggestion list** of people/organizations worth connecting with (construction companies, staffing agencies, labour-market researchers, EU workforce policy voices), sourced from owner knowledge and public, permitted channels — not from scraping.
- Draft a personalized message **per individual recipient**. Templates may exist, but each draft must name the exact recipient and the exact final text.
- Output: a review packet — recipient, why them, exact proposed message. It stops here. Sending is exclusively a manual owner action after Stage G approval of that exact recipient + exact message.

### Stage G — OWNER REVIEW GATE (hard stop)

Nothing goes live without this gate. The owner reviews:

1. **Posts:** the exact, final post text (and final visual). Approval applies to that exact text only — any edit re-enters the gate.
2. **Outreach:** the exact recipient AND the exact message, as a pair. Approval of one pair never extends to another recipient.
3. **Profile changes:** exact new field text (headline, about, featured links).

Decisions: `APPROVE` (owner pastes/sends it manually), `EDIT` (returns to Stage 2/4), `REJECT` (logged, dropped). Silence = not approved. There is no timeout-auto-approve.

If publishing is blocked only because it awaits the owner's LinkedIn login/action, report status as:
`BLOCKED_FOR_PUBLISH_ONLY — drafts ready, publishing requires owner action.`

### Stage 5 — Reporting

- After each cycle: a short report — drafts produced, gate decisions, what was published manually by the owner, qualitative observations the owner shares (comments, conversations started).
- Metrics come only from what the owner observes in their own LinkedIn account and chooses to share. No invented or estimated numbers ever appear in reports or posts.
- Report format: `STATUS / Repo / Branch / Result / Files / Next`.

## Draft storage

Drafts awaiting review live under `runtime/marketing/linkedin/owner-review/` (local, gitignored). Approved-and-published texts may be archived in docs if the owner wants a public record.

## Cadence (suggested, owner-adjustable)

- 3 posts per week from the 30-day calendar.
- 1 outreach review packet per week (max 10 prepared messages).
- 1 report per week.
