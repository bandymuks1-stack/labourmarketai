# Public-repo historical-data exposure — risk assessment & safe plan (2026-10-25)

Per owner directive: identify the concrete risk, its scope, and a safe remediation
plan **before** any git-history rewrite. **No history is rewritten here.** This
assessment deliberately contains **no** sensitive values — only file paths, the
nature of the exposure, and options.

## 1. What is exposed, and where (nature, not values)
This repository is PUBLIC (`AGENTS.md`). Some committed Markdown under `docs/`
contains **business/operational production evidence** — aggregate record/hours/
people figures, import session identifiers, source filenames, a third-party
client/site identity, and corporate registry numbers — which `AGENTS.md` reserves
for the owner's private Internal Brain.

Severity framing: the exposed content is **commercial / operational
confidentiality** (counts, hours, entity and site identifiers). It is **not** a
credential/secret class — no API keys, tokens, passwords or connection strings
were part of the historical-data docs. A separate secret scan is recommended as a
belt-and-braces check (see §4), but the exposure assessed here is confidentiality,
not account compromise. No individual worker's name is published in these docs.

## 2. Scope — in-scope (this cleanup) vs owner-decision
**In scope — sanitized at HEAD by the paired cleanup PR:**
- `docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md`
- `docs/launch/HISTORICAL_IMPORT_TRACE_2026-09-16.md`
- `docs/launch/HISTORICAL_DATA_TRACEABILITY_2026-10-25.md` (sanitized separately)

**Owner-decision — NOT touched here** (owner-authored legal/corporate instruments,
a different category than historical worker-data docs; altering them could damage
legitimate legal records): the `docs/legal/*` suite (IP chain-of-title, inter-
company IP licence agreements and resolutions, transfer-pricing and tax memos,
corporate-identity source-of-truth) and references in `docs/DECISIONS/0025-*` and
`docs/design/final/*`. These name corporate entities by design. The owner should
decide whether any of these also require sanitization.

## 3. The history limitation (why HEAD sanitization is not enough on its own)
Sanitizing at HEAD removes the content from the current files but **prior commits
still contain it** in git history (and in any existing clones/forks/caches). Fully
removing it from history requires rewriting history.

## 4. Safe remediation options (owner decides; nothing done automatically)
1. **HEAD sanitization only (done in the cleanup PR).** Lowest risk, reversible,
   no disruption. Removes the content from the live tree and from fresh shallow
   clones' default view; **does not** remove it from full history.
2. **Make the repository private.** Fastest way to stop public exposure of both
   HEAD and history, with zero history rewrite. Reversible. Recommended if public
   visibility is not required.
3. **History rewrite** (`git filter-repo` to redact the specific paths/blobs, then
   force-push). **Owner-only, disruptive, not done here.** Consequences: every
   commit SHA after the first rewritten commit changes; all clones/worktrees/open
   PRs must re-sync or are invalidated; signed commits lose signatures; branch
   protection and force-push must be temporarily enabled; forks keep the old
   history. Must be scheduled, announced, and run by the owner on a quiesced repo.
4. **Belt-and-braces secret scan** of history (`gh secret-scanning`, or a
   `git log -p` scan for key patterns) to confirm no credential class is present —
   independent of the confidentiality cleanup.

## 5. Recommendation
Do option 1 now (the cleanup PR). Then the owner chooses between option 2 (private
repo — simplest full fix) and option 3 (history rewrite — only if the repo must
stay public and history must be scrubbed). Run option 4 regardless. Treat the
`docs/legal/*` category (§2) as a separate owner decision. This repo's own policy
already states production evidence must not be committed here, so the durable fix
is procedural: keep such detail in the Internal Brain going forward (as the
sanitized docs now direct).
