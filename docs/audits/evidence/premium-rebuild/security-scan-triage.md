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

## Alert #9 — `oauth-trace.ts:66` — READ, and it is a FALSE POSITIVE (2026-07-31)

`js/clear-text-storage-of-sensitive-data`, high, raised 2026-07-27. The flagged
line is `window.sessionStorage.setItem(STORAGE_KEY, traceId)`.

The first pass called this "likely a false positive" and refused to close on
that. Here is the reading, and what makes it a conclusion rather than a guess.

**The scanner told us what it thinks the source is.** The alert message is:
*"This stores sensitive data returned by a call to `generateOauthTraceId` as
clear text."* So the question is precisely: what does that function return?

**1. The value has exactly one origin, and it is a CSPRNG.**
`generateOauthTraceId()` takes **no parameters**. Its whole body is
`crypto.getRandomValues(new Uint8Array(8))` rendered as 16 hex characters, with
a `Math.random()` fallback. It therefore *cannot* be derived from the OAuth
code, the PKCE verifier, an access or refresh token, a cookie, a session or a
user identity — there is no input to derive one from.

**2. The only production caller generates it before any credential exists.**
`components/app/google-button.tsx:112-113` — `generateOauthTraceId()` then
`rememberOauthTraceId(...)`, at click time, *before* the redirect to Google. At
that instant no token, code or session has been issued, so there is nothing
sensitive in scope to leak into it.

**3. It is not a user identifier.** A fresh value per login attempt, held in
`sessionStorage`, which is per-tab. It identifies an *attempt*, not a person,
and does not survive the tab.

**4. Nothing treats it as an authentication or authorization factor.** Every
use in `app/[locale]/auth/callback/route.ts` (lines 29, 32, 37, 54, 75, 85, 110,
120) is either a log field or the `trace` query param propagated back to the
login URL. The only branch on it anywhere is `if (traceId)` — a presence check
that decides whether to attach the param. No comparison, no lookup, no grant.

**5. The trigger is the NAME, not the data.** CodeQL's sensitive-data heuristic
matches identifiers against patterns including `auth`; `generateOauthTraceId`
contains "auth" inside "Oauth". The rule matched the identifier and never had a
way to see that the value is 8 random bytes.

**Residual risk: none that this alert describes.** Reading `sessionStorage`
already requires XSS, and the trace id confers no capability — it is not
accepted anywhere as proof of anything.

**One adjacent observation, recorded rather than quietly folded in:** the
`Math.random()` fallback is a non-cryptographic RNG. For a debug correlation id
whose collision cost is "two log lines are harder to tell apart" that is
acceptable, and the file says so. It is *not* what this alert flags and it
grants nothing — but it is the kind of thing that must be named, not skipped
past, when signing off on an auth-adjacent file.

**Action taken: none in code, and the alert is NOT dismissed in GitHub.** The
finding is answered with evidence here; leaving the alert open costs nothing and
keeps the scanner's own record honest. Nothing was disabled, suppressed or
filtered to make this go away.

## Open work — this file is not finished

- [x] Read `oauth-trace.ts:66` — false positive, evidence above, alert left open.
- [ ] Triage the 5 `js/incomplete-sanitization` sites individually.
- [ ] Anchor the 8 regexes; they are cheap and they are in guards, where a
      loose pattern quietly weakens an assertion.
- [ ] Decide on the `file-system-race` sites (test-time, low risk, still noise).
- [ ] Re-run and record the count once the queue is worked.

**No alert has been dismissed.** None is claimed to be a false positive on the
strength of the first pass alone — alert #9 is called one only after the
code-path reading recorded above, and even it stays open in GitHub.

## Count as of 2026-07-31

24 open alerts, all raised 2026-07-27, none introduced by any W3 or gate branch.
One (#9) is now read and answered; 23 remain in the queue in the priority order
above. No P0 or P1 found so far, so W3 is not blocked by this backlog — which is
the owner's instruction, and also what the evidence supports.
