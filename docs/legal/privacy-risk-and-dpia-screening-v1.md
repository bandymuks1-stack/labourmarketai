# Privacy Risk & DPIA Screening — v1 (2026-07-11)

Screening self-assessment for the consent-and-disclosure v1 build.
**NOT a lawyer-approved DPIA.** It records what the processing is, the
risks seen, the technical controls shipped, and the residual risk the
owner must take to legal review.

## Nature of the processing

A two-sided labour marketplace: workers store professional profiles, CVs,
work journals and documents; companies/agencies post needs; a human
operator coordinates matching. The new system introduces (1) worker-chosen
discoverability of a limited professional summary to registered
companies/agencies and (2) worker-approved per-company data transfers,
both recorded in append-only ledgers.

## Data categories

- Identity/contact (profiles): name, email, phone — self+admin only, never
  in discovery, transferable only via explicit per-company approval.
- Professional (workers, skills, professions, journal): discovery-visible
  subset only after consent; journal visible only to the worker and
  managers of an ACTIVE accepted engagement.
- Documents (worker_documents, storage): owner+admin only; no cross-user
  signed URLs exist.
- Consent/disclosure ledgers: purpose, action, text version/hash, locale,
  timestamps; deliberately NO IP, NO user agent (data minimisation).
- Special categories: not collected by design; free-text fields could
  incidentally contain them (see risks).

## Recipients

Registered companies/agencies (limited summary, consent-gated); one named
company per approved transfer; the platform operator (superadmin, internal);
processors: Supabase (eu-west-1), Vercel, Google OAuth (per
docs/compliance/gdpr-readiness-v1.md — draft). No transfers outside the
EEA are set up by this build; the owner must confirm processor DPAs and any
third-country sub-processing before stating this bindingly.

## Risks and shipped controls

| Risk | Control | Residual |
|---|---|---|
| Directory scraping of workers by any employer account | RLS consent gate (default OFF), no anon access, no public routes/indexing | Low: a consenting worker's summary is visible to ALL registered employers — stated in the consent text |
| Over-broad transfer (payload wider than approved) | `PAYLOAD_WIDER_THAN_CONSENT` fail-closed comparison at execution | Low |
| Recipient/context substitution, replay | grant is bound to recipient org + context id + type; guard compares all three + version | Low |
| Consent spoofing / acting for another user | RPCs derive subject from auth.uid() only; no user-id parameter | Low |
| Ledger tampering (incl. by admin) | append-only triggers for every role; no UPDATE/DELETE policies; admin has no ledger SELECT | Low |
| Stale consent silently widened after text change | version+hash pinning; stale grant ≠ current (auto-off) | Low; UX shows "new choice needed" |
| Dark patterns | no checkbox, equal buttons, no Terms bundling, decline = no-op, one-click withdrawal | Low (guard-tested) |
| Free-text PII in bio/journal reaching employers | bio in discovery only after consent; journal never in discovery; disclosure whitelist has no free-text field | Medium-low: consenting worker's own bio content is their authored text |
| Race: withdrawal vs concurrent transfer | guard reads newest ledger row at execution time inside the same statement; disclosure INSERT happens after the check in one definer function | Low (window is a single transaction) |
| Legacy `consents` table misuse | deprecated in docs; no write path; readiness no longer reads legacy boolean | Low |
| Operator over-exposure | operator sees current state only (no history), cannot grant; internal pool labelled "Awaiting worker permission" | Accepted (Art. 6(1)(f), documented) |

## Open items for legal review (owner)

1. **Controller identity, address, privacy contact** — unresolved; outward
   disclosure execution deliberately not wired until fixed
   (legal-basis-matrix-v1 §Controller identity).
2. Final wording review of the five-locale consent texts + privacy policy
   sections (NL/DE/RU pending native review like the rest of the catalogs).
3. Retention periods for ledgers and account data (policy currently says
   "kept as audit trail" — a lawyer should set/confirm durations).
4. Supervisory-authority reference and complaint-rights text.
5. Whether wider AUTOMATED matching (beyond the human operator) needs a
   full DPIA before launch — this screening says YES, do a full DPIA before
   any automated cross-user matching/decision feature ships.

## Conclusion

Technical risk controls are in production shape and fail closed. The
remaining risk is documentation/identity (who is the controller, final
texts), not data exposure. Until legal review completes, the system's
posture is: nothing is discoverable or transferable without a real,
recorded, current user choice.
