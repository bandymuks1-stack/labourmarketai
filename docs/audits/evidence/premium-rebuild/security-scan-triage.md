# SECURITY SCAN TRIAGE — CodeQL

Opened 2026-07-31 while merging the `EMPLOYEE_BETA_PRODUCTION_GATE` harness
(PR #929), because that PR's aggregate `CodeQL` check was **FAILURE** and a
credentials-handling change is the last place to wave a red scanner through.

## Verdict on PR #929

```text
NOT CAUSED BY THIS PR — pre-existing backlog. Merged.
```

Evidence, not assertion:

| Question | Answer |
|---|---|
| Did the scan itself fail? | **No.** `Analyze (javascript-typescript)` = SUCCESS. The aggregate `CodeQL` status is red because the repository has open alerts. |
| How many open alerts? | **24** |
| When were they created? | **all 2026-07-27** — four days before this work |
| How many touch this PR's files (`prod-qa-*`, `employee-beta-gate`)? | **0** |
| Is `CodeQL` a required check? | **No.** Branch protection on `main` requires `quality` and `migration-safety`; both SUCCESS. That is why the PR was `UNSTABLE`, not `BLOCKED`. |

## The backlog, by rule

| Count | Severity | Rule |
|---:|---|---|
| 8 | high | `js/regex/missing-regexp-anchor` |
| 5 | high | `js/file-system-race` |
| 5 | high | `js/incomplete-sanitization` |
| 2 | high | `js/insecure-temporary-file` |
| 2 | medium | `js/file-access-to-http` |
| 1 | high | `js/incomplete-multi-character-sanitization` |
| 1 | high | `js/clear-text-storage-of-sensitive-data` |

## First-pass reading — NOT a closure

A raw scanner count is not truth, and neither is a raw dismissal. What follows
is a first pass to set priority; each item still needs its own code-path check
before it can be closed.

**`js/clear-text-storage-of-sensitive-data` — `lib/auth/oauth-trace.ts:66`.
Highest priority, and the one genuinely worth reading first.** It is the only
alert that names auth. The value stored is a generated OAuth *trace id* — a
correlation token, not a credential — so the likely outcome is a false positive.
"Likely" is not "verified": this is the top of the triage queue and stays OPEN.

**`js/regex/missing-regexp-anchor` (8) and `js/file-system-race` (5)** are
concentrated in `lib/guards/*.test.ts` and `scripts/*` — build-time and
test-time code with no request path and no untrusted input. Real code smells,
low exploitability. Worth fixing, not launch-blocking.

**`js/incomplete-sanitization` (5)** needs per-site reading; sanitization gaps
can be real. Second in the queue.

**`js/insecure-temporary-file` (2)** and **`js/file-access-to-http` (2)** are in
scripts, including `scripts/telegram-report.mjs`, which is not part of the web
runtime.

## Why the merge went ahead

1. The scan succeeded; the diff introduced no alert.
2. Both required checks were green.
3. Every alert predates the branch by four days, so blocking this PR would not
   have made the repository safer by one line — it would only have delayed a
   harness that is itself a security control.
4. The backlog is now recorded here with an owner-visible priority order rather
   than living invisibly in a scanner tab.

## Open work — this file is not finished

- [ ] Read `oauth-trace.ts:66` and either fix or dismiss with a written reason.
- [ ] Triage the 5 `js/incomplete-sanitization` sites individually.
- [ ] Anchor the 8 regexes; they are cheap and they are in guards, where a
      loose pattern quietly weakens an assertion.
- [ ] Decide on the `file-system-race` sites (test-time, low risk, still noise).
- [ ] Re-run and record the count once the queue is worked.

**No alert has been dismissed.** None is claimed to be a false positive on the
strength of this pass alone.
