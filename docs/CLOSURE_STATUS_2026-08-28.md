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

## 4. AUTH-CORE API BOUNDARY — approved, built, and proven

The gate presented in the previous revision of this document was approved. The
boundary exists: **`lib/api/api-identity.ts`, one resolver, `app/api/**` only.**
Server actions are untouched and stay a browser transport by design.

### What it does, and what it refuses to do

```
AUTHENTICATION / TRANSPORT   →  establish WHO is calling   ← the resolver
DATABASE / RLS / DOMAIN      →  decide WHAT they may do    ← unchanged
```

The resolver returns the caller's own RLS-scoped Supabase client and nothing
else. It re-implements no scope, no role and no organization authority — those
already live in the database and in the domain helpers the routes already call.
Both transports produce an **anon-key** client carrying that person's own JWT,
so Postgres evaluates the same policies for both, and there is no service-role
path on either. The property to protect is one sentence: *a bearer caller can
never do more than the same person's web session.*

Verification uses the platform's own mechanism (`auth.getUser(jwt)`) rather
than a private signature check — one call validates signature, expiry and the
user still existing, with no second copy of the project's key material to keep
in step.

### The classification, which is the product decision

`lib/guards/api-auth-boundary.test.ts` holds every route and fails CI if a new
one appears without an answer:

| route | class |
|---|---|
| `billing/webhook`, `waitlist` | `public` |
| `billing/portal`, `billing/test-checkout` | `cookie-only` — money surfaces that redirect a browser |
| `cv/extract`, `professions/:id/skills`, `workers/:id/skills`, `documents/file/:id` | **`shared`** |
| `dashboard-search` | **`shared-blocked`** |

`dashboard-search` is the honest one. Adding the header there would be a lie:
`getDashboardSearchGroups()` takes no client and fans out to helpers that each
call `createClient()` themselves, so the search would run as the cookie session
while the route reported the bearer caller's identity. The coupling is *below*
the route layer — **257 of 892 `lib/` modules resolve their own cookie client**
— and that is the shared-core refactor, not a header.

### Twelve controls against the real stack, and the one that mattered

No mocks: real GoTrue, real JWTs, real PostgREST, real RLS.

| | control | result |
|---|---|---|
| A | no credentials | 401 |
| B | malformed `Authorization` | 401 |
| C | well-formed token, **foreign signature** | 401 |
| D | correctly signed but **expired** | 401 |
| E | user A reads user B's skills | 403 |
| F | user A writes user B's skills | 403, **and B's rows unchanged** |
| G | valid token, own resource | 200 |
| H | **bearer authority == cookie authority** | identical on both, and the two answers differ |
| I | **bad token WITH a valid session cookie** | 401 |
| | CV import over bearer / closed without | 200 / 401 |
| | document door, unknown file, valid token | 404 — no existence oracle |
| | the cookie path | unchanged, 200 |

C, D and H each carry their own positive control, so none of them can pass by
accident: the untampered token must work, the same self-signed claims with a
*future* `exp` must be accepted, and the own/foreign answers must genuinely
differ.

**I is the only one that catches the worst bug, and that was measured rather
than argued.** A–H are all sent without cookies, so a boundary that quietly
fell back to the cookie session on a bad token would answer 401 to every one of
them and the file would read green. Building exactly that fallback: A–H and the
cookie regression **all still passed, and I was the only failure.**

One control from the design sketch was deliberately NOT built — *"a token whose
`sub` is not a profile"*. Rejecting that at the transport would make bearer
**stricter** than cookie, which has never required a profile row and which a
just-registered user legitimately lacks. The rule is parity, and an extra check
breaks it as surely as a missing one.

### Web regression

Cookie identity is resolved by the same `createClient()` → `getUser()` as
before; only its call site moved. Proven, not assumed: the cookie half of H,
the standalone cookie-path test, and a 26-test authenticated browser pass
across the conversation, documents, profile, opportunities and shell specs.

**Status: `AUTH_CORE_API_READY = YES`.** `ANDROID_` / `IOS_IMPLEMENTATION_READY`
are no longer blocked on the seam — they are blocked on there being no client,
which is a build decision. `CHATGPT_APP_BACKEND_READY = PARTIAL`: the transport
is there and three canonical capabilities are reachable over it; the rest wait
on the shared-core refactor above.

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
