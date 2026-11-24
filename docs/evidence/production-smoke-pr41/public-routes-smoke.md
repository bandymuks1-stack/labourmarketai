# Public routes smoke — production after PR #41

> Captured against the live `https://app.labourmarket.ai` deploy of
> `main @ 28b9a88` (PR #41). All checks are unauthenticated.

## HTTP status

| Route | Status |
| --- | --- |
| `https://app.labourmarket.ai/lt` | 200 |
| `https://app.labourmarket.ai/en` | 200 |
| `https://app.labourmarket.ai/lt/vision` | 200 |
| `https://app.labourmarket.ai/en/vision` | 200 |

```bash
$ curl -s -o /dev/null -w "%{http_code}  %{url_effective}\n" -L https://app.labourmarket.ai/lt
200  https://app.labourmarket.ai/lt
$ curl -s -o /dev/null -w "%{http_code}  %{url_effective}\n" -L https://app.labourmarket.ai/en
200  https://app.labourmarket.ai/en
$ curl -s -o /dev/null -w "%{http_code}  %{url_effective}\n" -L https://app.labourmarket.ai/lt/vision
200  https://app.labourmarket.ai/lt/vision
$ curl -s -o /dev/null -w "%{http_code}  %{url_effective}\n" -L https://app.labourmarket.ai/en/vision
200  https://app.labourmarket.ai/en/vision
```

## Robots meta — `/vision` is noindex/nofollow on both locales

```bash
$ curl -s -L https://app.labourmarket.ai/lt | grep -i -o 'name="robots"[^>]*'
(no match — landing remains indexable)

$ curl -s -L https://app.labourmarket.ai/lt/vision | grep -i -o 'name="robots"[^>]*'
name="robots" content="noindex, nofollow"/

$ curl -s -L https://app.labourmarket.ai/en/vision | grep -i -o 'name="robots"[^>]*'
name="robots" content="noindex, nofollow"/
```

**Verdict:** the public landings (`/lt`, `/en`) remain normally
indexable. Both `/vision` pages carry the noindex+nofollow meta. The
PR #41 gate is live in production.

## Public nav — `/vision` not surfaced

```bash
$ curl -s -L https://app.labourmarket.ai/lt | grep -o 'href="/lt/[^"]*"' | sort -u
href="/lt/auth/login"
href="/lt/auth/signup"
href="/lt/for-agencies"
href="/lt/for-companies"
href="/lt/for-workers"
href="/lt/legal/cookies"
href="/lt/legal/privacy"
href="/lt/legal/terms"
href="/lt/pricing"

$ curl -s -L https://app.labourmarket.ai/en | grep -o 'href="/en/[^"]*"' | sort -u
href="/en/auth/login"
href="/en/auth/signup"
href="/en/for-agencies"
href="/en/for-companies"
href="/en/for-workers"
href="/en/legal/cookies"
href="/en/legal/privacy"
href="/en/legal/terms"
href="/en/pricing"
```

**Verdict:** no `href="/lt/vision"` or `href="/en/vision"` on the
public landings. The link is filtered out at render time by
`isVisionPublic()` from `lib/config/vision-publication.ts`.

## Internal-preview banner — present on direct URL

```bash
$ curl -s -L https://app.labourmarket.ai/lt/vision \
    | grep -o 'data-testid="vision-internal-preview"' \
    | head -1
data-testid="vision-internal-preview"

$ curl -s -L https://app.labourmarket.ai/lt/vision \
    | grep -o "Vidinė peržiūra" \
    | head -1
Vidinė peržiūra

$ curl -s -L https://app.labourmarket.ai/en/vision \
    | grep -o 'data-testid="vision-internal-preview"' \
    | head -1
data-testid="vision-internal-preview"

$ curl -s -L https://app.labourmarket.ai/en/vision \
    | grep -o "Internal preview" \
    | head -1
Internal preview
```

**Verdict:** the banner is server-rendered into the HTML on both
locales' `/vision` direct URLs. Owner / pilot reviewers who paste the
link still see the "do not share publicly until smoke PASSED" notice
above the hero.

## Playwright iPhone 13 captures

Screenshots in `screenshots/` (7 PNGs, 390 × 844, `lt-LT` browser
locale, hitting the live production deploy). The most owner-relevant:

| # | File | What it confirms |
| --- | --- | --- |
| 01 | `01-lt-landing-no-vision-in-nav.png` | LT landing header has no "Vizija" link. |
| 02 | `02-en-landing-no-vision-in-nav.png` | EN landing header has no "Vision" link. |
| 03 | `03-lt-vision-internal-preview-banner.png` | "VIDINĖ PERŽIŪRA" badge + full banner copy at the top of the LT vision page. |
| 04 | `04-en-vision-internal-preview-banner.png` | Same on EN. |
| 05 | `05-lt-vision-control-room.png` | The catalogue-driven control-room section visible. Counts derived from the catalogue (PR #18 BLOCKED, owner smoke PENDING). |
| 06 | `06-en-vision-control-room.png` | Same on EN. |
| 07 | `07-lt-vision-full-page.png` | Full-page mobile capture of `/lt/vision` end-to-end. |

## Fake-claim spot check

Visual scan of the landing + vision pages on production mobile (LT +
EN). No occurrence of any of the forbidden phrases:

- "AI verified" / "AI matched" / "automatic approval" /
  "guaranteed match" / "instant hiring" / "trust score" / "patent"
- Pricing / checkout / subscription CTAs

The guard test (`apps/web/lib/guards/product-readiness.test.ts`) is
the authoritative source for the static invariant; this visual spot
check is a second layer.

## What this smoke does NOT cover

- Authenticated dashboard pages. See `owner-authenticated-smoke.md`.
- Production database state. Out of agent scope.
- Vercel / DNS / SSL certificate health.
- Behaviour after the owner flips `VISION_PUBLIC` to `true` — that's
  its own follow-up PR + its own smoke pass.
