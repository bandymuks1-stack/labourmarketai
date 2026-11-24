# LabourMarket.ai — Incident response v1

> Draft for owner review — 2026-07-06. Extends
> `docs/policies/risk-monitoring-and-fraud-response-v1.md` (manual-review-
> first posture) to security incidents. Notification wording and legal
> timelines need lawyer review before any real incident communication.

## 1. What counts as a security incident

- Unauthorized access to any account (including admin/superadmin).
- Data exposure: RLS gap, leaked secret/key, misdirected email, publicly
  reachable storage object that should be scoped.
- Integrity events: journal hash-chain mismatch, tampered confirmations.
- Availability events with security cause (not plain Vercel/Supabase
  outage).
- A vulnerability report from any user or researcher.

## 2. Response steps (single-operator scale, honest)

1. **Contain** — rotate the affected secret (Supabase dashboard / Vercel
   env), revoke sessions if account-level (`auth.admin.signOut`), take the
   affected surface read-only if data-level (feature-availability flag).
2. **Assess** — what data, whose, since when. Supabase auth/api logs via
   MCP (`get_logs`), Vercel logs, `pilot_events` traces. Write timestamps
   down as you go — the timeline is the incident record.
3. **Record** — one file per incident: `runtime/incidents/<date>-<slug>.md`
   with timeline, scope, affected users, fix, follow-ups. Facts only; no
   speculation in the record.
4. **Fix root cause** — patch + a guard test that would have caught it
   (the repo's existing pattern: every incident becomes a pinned contract).
5. **Notify** — see §3.
6. **Review** — within a week: what would have caught this earlier;
   update this doc if a step was missing.

## 3. Notification (legal review needed — do not improvise wording)

- **Affected users**: plainly, quickly, in their locale, saying what
  happened, what of THEIRS was touched, what we did, what (if anything)
  they should do. Benefit framing applies here too: the message exists to
  protect them, not the platform's image. Never announce publicly before
  affected users know.
- **GDPR**: personal-data breaches may trigger supervisory-authority
  notification within 72h of awareness (see `gdpr-readiness-v1.md` §5) —
  the exact threshold assessment is a lawyer call; the owner makes it with
  counsel, not a Claude session.
- **No breach theater**: if nothing user-affecting happened, say nothing
  publicly; if something did, never minimize it in copy.

## 4. Prevention hooks already in place

- Secret scanning guards (`no-secret-leakage`, `no-provider-secret-leak`).
- Migration human gate + rollback files (`APPLIED_LEDGER.md` discipline).
- OAuth diagnostics without PII (`oauth-trace-and-safe-diagnostics`).
- Manual-review-first fraud posture (no auto-actions to be abused).

## 5. Gaps to close (sequenced with the auth plan)

- No user-facing "security events" surface (auth plan step 5).
- No formal vulnerability-disclosure contact published — small PR: add a
  security contact (email) to the legal pages once owner picks the address.
- No automated secret rotation runbook — document per-secret rotation
  steps as they are first exercised.
