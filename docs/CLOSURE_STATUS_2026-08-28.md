# CLOSURE STATUS — 2026-08-28

> Companion to [`docs/CAPABILITY_INVENTORY.md`](CAPABILITY_INVENTORY.md), not a
> replacement. The inventory says WHAT is proven. This says why the remaining
> `PARTIAL`s are partial, in terms specific enough to act on, and presents the
> one owner gate that blocks a whole branch of the roadmap.
>
> A status word with no mechanism behind it is a label. Every entry below names
> the measurement or the missing thing.

---

## 1. PAYMENT_SYSTEM_READY — the offline chain is proven, the online leg is not configured

**103 tests pass** across `lib/billing` and `app/api/billing`. That is not a
formality: every one of the five proofs the closure brief asked for is among
them, and each is real rather than a stub.

| required proof | where it is proven |
|---|---|
| bad signature refused | `webhook-signature.integration.test.ts` — a real Stripe SDK signature via `webhooks.generateTestHeaderString`, then a tampered/wrong-secret variant refused |
| `livemode: true` refused | `assertTestEvent` — "a live event is rejected (test-only chain)" |
| replay safe | `subscription-store.test.ts` — fresh / duplicate-processed / duplicate-unprocessed / unreadable-state → error, never silent |
| failed payment leaves no phantom credit | `webhook-core` maps a failed invoice to `last_payment_status=failed`; `entitlements-v1` keeps `cancelled`/`expired`/`unpaid` on free |
| cancel / re-subscribe | `entitlements-v1.test.ts` — active, trialing, `past_due` as flagged grace, cancelled → free |

The signature test deserves its own line because it is the part people assume
cannot be done offline: it uses the real SDK signing scheme, with **no Stripe
account, no keys in env, and no network call**.

### What is missing is configuration, and it is exact

**None of the eight variables exists** — not in `apps/web/.env.local`, not in
the shell:

```
BILLING_PROVIDER            (= stripe)
STRIPE_MODE                 (= test)
STRIPE_SECRET_KEY           (sk_test_…)
STRIPE_WEBHOOK_SECRET       (whsec_…)
STRIPE_PUBLISHABLE_KEY      (pk_test_…)
STRIPE_PRICE_WORKER_PLUS    (price_… test)
STRIPE_PRICE_COMPANY_PILOT  (price_… test)
STRIPE_PRICE_AGENCY_PILOT   (price_… test)
```

Without them there is no test-mode checkout session to create, no Stripe-
delivered webhook to receive, and therefore no end-to-end round trip to prove.
The step-by-step is already written:
[`docs/audits/stripe-test-activation-runbook.md`](audits/stripe-test-activation-runbook.md).

**Status: `PAYMENT_SYSTEM_READY = PARTIAL`, blocked on external configuration.**
Not on code, and not on a decision about the code. `LIVE_REAL_MONEY_ENABLED`
stays **NO** and nothing here changes that: `live_payments_enabled` and
`stripe_lmc_topups_enabled` are `owner_only`, and the shared setter refuses
every caller for them by design.

---

## 2. LIVING_CV — closed, and it was hiding a real defect

The spec was wrong about WHERE, and repointing it at the right surface
uncovered something the old spec could never have seen.

### The rotted spec (as diagnosed)

`cv-upload-authenticated` navigated to `/lt/dashboard/profile` and waited for a
file input. Measured there: **0 `cv-import-upload`, 0 file inputs**. That page
has never hosted a CV upload control; `CvImportUpload` is mounted in the chat CV
flow and in the marketing `/create-cv` panel. This is the #1319 class in its
second form — #1319 found selectors that could never FAIL, this one could never
PASS.

The fix was NOT to restore an obsolete profile control to satisfy a test. The
spec now drives what a person actually does:

```
/lt/dashboard → "Įkelk mano CV" in the composer
  → the import control APPEARS in the conversation (intent → surface)
  → a real DOCX → POST /api/cv/extract (mammoth)
  → parseCvSections proposes the job as its own reviewable row
  → NOTHING saved yet
  → one explicit per-item confirm → confirmCvWorkHistoryAction
  → a FRESH navigation to /lt/cv finds it in cv-work-history
```

Both tests pass against the local stack.

### The defect the repoint exposed: every PDF CV lost its line structure

`lib/cv/extract.ts` called unpdf's `extractText(pdf, { mergePages: true })`.
That option does not merely join pages — it runs `.replace(/\s+/g, " ")` over
the joined result, **destroying every newline pdf.js produced**. Downstream,
`parseCvSections` splits on newlines.

So a PDF CV reached the parser as ONE line. Measured on a four-line CV:

| | with `mergePages: true` | without it |
|---|---|---|
| lines reaching the parser | **1** | 4 |
| work-history proposals | **0** | 1, correct |
| education proposals | 1, institution `"Jonas Petraitis UAB Statybos meistrai"` | 1, correct |

PDF is the commonest CV format there is, and no job could be imported from one.
Text arrived, so nothing looked broken — only structure was gone, and only a
structural assertion can see that. It was invisible to every existing test
because the one PDF assertion in the suite checked that a *word* came back.

Fixed by requesting the per-page array (`extractText(pdf)`) and joining the
pages ourselves — the call site already handled that shape.

### Guarded, and the guards were observed failing

Neither guard is a grep, and neither is taken on trust:

* `lib/cv/extract.test.ts` — a four-line PDF must reach the parser as four
  lines and yield the job. It carries its own **negative control**: the same
  text with newlines collapsed must yield **zero** jobs, otherwise the
  assertion would be measuring nothing. Reintroducing the flag: *"a 4-line CV
  must not arrive as 1 line: expected 1 to be 4"*.
* `tests/e2e/cv-upload-authenticated.spec.ts` — the PDF test asserts a
  work-history ROW at the real HTTP boundary. Reintroducing the flag:
  *"a PDF CV must yield a work-history proposal, not one collapsed line"*.

**Status: `LIVING_CV = YES` for the import chain.** The one remaining skip in
the CV specs is identified and is not a rot: `quick-confirm-cv-export.spec.ts`
carries an unconditional `test.skip(true, …)` with a written six-step plan,
blocked on a manager+worker session pair sharing an org with
`journal_review_enabled` — cross-actor work, not CV work.

---

## 3. MULTILINGUAL — two halves, and only one of them is a defect

| half | state | closable by code? |
|---|---|---|
| route / UI coverage | **5 of 26** required languages selectable (`lt en ru nl de`) | **No.** 21 catalogues nobody has written. A content and product-scope fact. |
| architectural ceiling | **closed** (#1302) | Yes — and it is what can silently return |

The distinction matters because only the second is an engineering failure.
Before #1302, `expression → concept` had ONE implementation — a hand-maintained
needle list — so a language nobody had hand-written could not be **represented**
at all, and its coverage could not even be reported as zero. Georgian was
missing from the model, not from the data.

Verified today, and now guarded
(`lib/guards/language-ceiling-not-returned.test.ts`):

* `ConceptLanguage` is `string` — an open type, not a closed union. A union
  form is asserted absent, because that is the shape the ceiling would return in.
* an **uncurated** language (`ka`) is representable and reports **zero
  honestly** — it appears in the coverage report with `covered: false` rather
  than vanishing from it. A language missing from the report cannot be
  prioritised.
* a **curated** language really does resolve — otherwise the test above would
  pass on a resolver that reports zero for everything, which is a ceiling
  wearing a report as a disguise.
* coverage is **measured from terms**, never read off `activeLocales`; the
  guard asserts the coverage module does not import the routing list, so adding
  a locale to the router can never silently claim recognition nobody wrote.

**Status: `MULTILINGUAL = PARTIAL` on content, `ARCHITECTURE = OPEN`.** Georgian
and further expansion stay possible. No claim is made that any of the 26 is
complete.

---

## 4. OWNER GATE — AUTH-CORE API BOUNDARY

Everything below is analysis and design. **No insecure interim auth has been
built, and none should be.** The canonical measurement is
[`docs/APP_READINESS_MAP.md`](APP_READINESS_MAP.md) (#1308); this presents its
gate in the form the closure brief asked for.

### The exact boundary

`app/api/**` only — **9 route files, 8 of which resolve identity from
`cookies()`**, and **zero** of which read an `Authorization` header today.
Server actions are explicitly out of scope: they are a browser transport and
stay one.

### Token model

Supabase-issued JWT, presented as `Authorization: Bearer <jwt>`, **in addition
to** cookies rather than instead of them. No new token type, no new signing
authority, no second identity system — the platform already issues exactly this
token to the web client.

### Validation

One resolver, used by every `app/api/**` route: verify signature and expiry
against the project's JWKS, confirm the `sub` resolves to a real `profiles`
row, and fail **closed** on any error. A failed verification is never an
anonymous request — that is the same distinction #1314 drew for roles and #1323
for balances.

### Identity binding, scopes, org/context authorization

Identity binding is the resolved profile, never a client-supplied id. **Scopes
and organization/context authority are not re-implemented**: the database
already holds them (RLS, `belongs_to_organization`, the SECDEF RPCs, the
`grants_worker_visibility` data model). The boundary's job is to establish WHO
is calling; WHAT they may see stays where it is enforced today. Any design that
moves authority up into the API layer should be rejected — it would create a
second permission model, which is the failure this whole seam exists to prevent.

### Revocation, rate limiting, audit

Revocation follows the platform's own session revocation (short-lived access
tokens plus refresh, so a revoked session dies at the next refresh rather than
being separately tracked). Rate limiting reuses `request_rate_limits_v3`,
already in production. Audit reuses `audit_logs`. **No service-role key is ever
exposed to a client, on any path.**

### Negative controls the slice must ship with

1. an **expired** token → refused;
2. a token from **another Supabase project** → refused;
3. a token whose `sub` is **not a profile** → refused;
4. the existing **cookie path unchanged** — the web client must not regress;
5. a valid token for user A **cannot read** user B's rows (RLS still decides).

### Migration and client impact

No schema migration is implied by the resolver itself. Client impact: none for
the web app (cookies keep working); it is the precondition for Android, iOS and
the ChatGPT/MCP app, none of which may be built before it.

> ### APPROVE AUTH-CORE API BOUNDARY
>
> Until this is approved the slice stays **blocked**, and
> `AUTH_CORE_API_READY`, `ANDROID_IMPLEMENTATION_READY`,
> `IOS_IMPLEMENTATION_READY` and `CHATGPT_APP_BACKEND_READY` all stay **NO** —
> not because the domain logic is missing, but because the transport is.

---

## 5. WHAT THIS DOCUMENT DELIBERATELY DOES NOT CLAIM

* That the education chain works in **production**. It is proven on the local
  stack, 7/7 (#1324). Production holds **0** organizations with
  `training_provider`, and no production organization was created to change
  that — fabricating one to turn a matrix green is the dishonesty the whole
  brief is written against.
* That `/dashboard/company` is finished. It measures 8420px desktop and
  12139px mobile across 26 blocks and 18 `<h2>`s. Real, recorded, and an IA
  decision rather than a class-name fix.
* That any of the 26 required languages beyond the routed five is served.
