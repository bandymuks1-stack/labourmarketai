# Cookie and Storage Policy — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Draft for lawyer review. Not final, not legally valid yet, not certified.
>
> **Source facts used:**
> - Audit 2026-10-15 `02-processors-transfers-cookies-ai.md` §2.1-2.5 (every cookie and storage key, with its code location) and D5, D12; `03-rights-consent-legal-pages.md` §2, L3, L4
> - Code lifetimes checked 2026-10-15: `lm_active_workspace` 180 days (`apps/web/lib/company/organization-actions.ts:54`); `lm_hide_admin_ui` 365 days (`apps/web/lib/auth/admin-ui-actions.ts:20`)
> - Current page: `apps/web/messages/en.json` → `legal.cookies`
>
> **Open decisions:**
> 1. [OWNER DECISION: add a consent banner before the analytics items in §4 are written, OR make telemetry strictly necessary / aggregate-only and remove `lm.attr.first`, `lm.funnel.*` and `lm.pilot.session`. **Today these items are written without consent and no banner exists.** This policy must not be published as written until one option is implemented.]
> 2. [LAWYER: whether any analytics exemption applies under Lithuanian law. Default reading: none for profile-linked analytics]
> 3. [LAWYER: classification of the "functional" items in §3 that the user did not explicitly request (usage counters, recently viewed jobs)]
> 4. [OWNER: confirm the sign-in cookie lifetime — library default, not set in our code]
> 5. [OWNER: confirm whether payment uses Stripe-hosted Checkout pages, and say so in §5]
> 6. [LAWYER: verify the article reference for the Lithuanian Law on Electronic Communications (Art. 61(3), cited in the audit) against the version in force]

---

## 1. What this policy covers

The platform stores small items in your browser:
- **cookies**;
- **local storage**, which stays until you clear it;
- **session storage**, which is deleted when you close the tab.

Some functions also make your browser contact other services directly (§5).

Storing or reading anything on your device needs your **consent**, unless it is **strictly necessary** for a service you asked for. This rule comes from the ePrivacy Directive 2002/58/EC, Art. 5(3), as implemented in Lithuania by the Law on Electronic Communications (Art. 61). [LAWYER: verify article]

We do not use third-party advertising cookies. We use no third-party analytics service and no session recording. We **do** have our own (first-party) product analytics, described in §4.

## 2. Strictly necessary items

These items do not need consent. Without them the service you asked for cannot work.

| Name | Type | Lifetime | Purpose |
|---|---|---|---|
| `sb-<project>-auth-token` (may be split into `.0`, `.1`, …) | cookie | while you stay signed in; refreshed automatically [OWNER: verify maximum lifetime] | keeps you signed in |
| `sb-<project>-auth-token-code-verifier` | cookie | short, for the sign-in step only | secures sign-in with Google (PKCE) |
| `lm_active_workspace` | cookie (not readable by page scripts) | 180 days | remembers which workspace (personal or organisation) you are working in |
| `lmai:command-finder-speech-consent:v1` | local storage | until you clear it | records that you accepted the voice-dictation notice |
| `lm.oauth.trace` | session storage | until the tab closes | a random ID that helps us trace a failed sign-in |
| `lm-chunk-reload` | session storage | until the tab closes | stops the page reloading in a loop after an update |

## 3. Preference and functional items

These remember choices you made, or keep your work while you use a feature.

| Name | Type | Lifetime | Purpose |
|---|---|---|---|
| `NEXT_LOCALE` | cookie | 1 year | your language |
| `lm_tz` | cookie | 1 year | your time zone, so days and times show correctly |
| `lm_hide_admin_ui` | cookie | 1 year | administrators only: whether admin controls are hidden. Changes no permissions |
| `theme` | local storage | until you clear it | light or dark theme |
| `lm.communication.writeLanguage` | local storage | until you clear it | the language you write messages in |
| `lmai:voice-speech-language` | local storage | until you clear it | dictation language |
| `lm.search-location.v1` | local storage | until you clear it | the search location you chose. It can be precise, and it stays on your device |
| `lm.opportunities.recentlyViewed.v1` | local storage | until you clear it | jobs you viewed recently [LAWYER: classification] |
| `lm.commandFinder.recentCommandIds` | local storage | until you clear it | your recent commands |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | local storage | until you clear it | how often you use features, to suggest shortcuts. Stays on your device [LAWYER: classification] |
| `lm.professionRecoveryPrompt.v1.dismissed` | local storage | until you clear it | you closed this prompt |
| `lm.work-card-checks.kept` | local storage | until you clear it | checks you chose to keep |
| `lm.employerVisibilityAsk.v1` | local storage | until you clear it | your answer to the employer-visibility prompt. The consent itself is recorded on our server |
| `lm.chat.continueAfterSwitch` | session storage | until the tab closes | up to 500 characters of a sentence you typed, so it can continue after you switch workspace |
| `lmai:voice-transcript-draft` | session storage | until the tab closes | the draft text of your dictation |

## 4. Analytics items — consent required

We measure how the product is used: which pages and steps people reach, sign-up steps, daily activity, and which campaign brought a visitor. Events are stored on our own servers, linked to your account if you are signed in.

[OWNER DECISION: banner or drop] **These items are set only after you agree.** You can change your choice at any time in [OWNER DECISION: where the choice is changed, e.g. footer link "Cookie settings"].

| Name | Type | Lifetime | Purpose |
|---|---|---|---|
| `lm.attr.first` | local storage | until you clear it | first-visit campaign data (`utm_*` tags, referring site, landing page). At sign-up this is copied into your account record |
| `lm.funnel.last_seen_day` | local storage | until you clear it | the last day you were active, to count daily active users |
| `lm.funnel.signup_pending` | local storage | until you clear it | marks that a sign-up is in progress |
| `lm.pilot.session` | session storage | until the tab closes | a random session ID sent with each analytics event |
| `lm.funnel.*` (for example `landing_fired`, `login_succeeded`) | session storage | until the tab closes | stops the same analytics event being counted twice |

If you do not agree, the product works the same.

The analysis itself is based on our legitimate interest in improving the product (GDPR Art. 6(1)(f)). You can object to it (see the Privacy Policy, §10).

## 5. Services your browser contacts directly

- **OpenStreetMap map tiles** (`tile.openstreetmap.org`). The market map loads its map pieces from the OpenStreetMap Foundation's servers. Your browser sends your IP address, browser details and the map area you are viewing. No cookie of ours is involved. The OpenStreetMap Foundation's own privacy policy applies.
- **Voice dictation.** If you use dictation in the command finder, your browser sends your audio to its maker's speech service (for example Google for Chrome, Apple for Safari). We do not receive the audio. You see a notice before first use.
- **Payment pages.** When an organisation pays, Stripe's own terms and cookies apply on Stripe's pages. [OWNER: confirm hosted Checkout]
- **Fonts** are served from our own site. No call is made to Google Fonts.

## 6. How to control or delete these items

- Your browser settings let you delete cookies and site data (local and session storage) at any time.
- If you delete the sign-in cookies, you are signed out.
- Session storage is cleared when you close the tab.
- [OWNER DECISION: the in-product consent choice for §4, once built]

## 7. Changes

- Version **v2 (draft), 2026-10-15**.
- We update this list before we add a new cookie or storage item.
- Questions: info@labourmarket.ai.
- Controller: UAB „Nonstop Group“, company code 302676973 (see the Privacy Policy, §1).
