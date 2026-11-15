# Audience page contract

One system for the five audience pages (workers, companies, agencies, service
providers, education institutions). Owner P0, 2026-11-13.

Component: `apps/web/components/marketing/audience-page.tsx` (`AudiencePage`).
It renders inside the public shell (`app/[locale]/(marketing)/layout.tsx`),
which already provides the header, the goal bar and the footer.

## The four parts, in this order

| Part | Prop | Rule |
|---|---|---|
| Hero | `eyebrow`, `title`, `lead` | The eyebrow is the audience's name in plain words. One `h1`. One lead sentence: what this audience does here. No slogan, no second paragraph. |
| What you can do today | `todayHeading`, `today[]` | Three to six items. Each is something that works in production today: a short title and one line. No "soon", no plan, no number that is not read from data. An item may carry `href` to the function it names. |
| Price line | `priceLabel`, `price` | What it costs this audience today, worded like the pricing page. Today: people use the platform free; an organization runs one active position free. Never a figure the pricing page does not show. |
| Start | `start`, optional `secondary` | One primary button: the next action for this audience (sign up, or describe a need). At most one quiet second link. |

Anything else (a market list, questions, a form) goes after these four, as
`children`.

## Rules

- The page passes translated strings; the component reads no catalog. Every
  string exists in all catalogs of the active locales; the word "demo" is not
  used.
- One `h1` per page (the component's). Section headings below it are `h2`.
- Colours, type and radii come from the tokens through the shared classes
  already used here; no new colour, no hero image, no illustration.
- The start button is a link to a real route. A route behind sign-in is fine:
  the visitor is sent to sign in and returns to it.
- Phone first: check 320, 375, 390, 768 and 1440px, light and dark; no
  sideways scroll; the start button is not clipped.
- Do not copy the component to change it. If a page needs something it lacks,
  say so in the launch register and Lane A extends it in place.

## Example

```tsx
<AudiencePage
  eyebrow={t("eyebrow")}
  title={t("title")}
  lead={t("lead")}
  todayHeading={t("todayHeading")}
  today={[
    { id: "cv", title: t("today.cv.title"), body: t("today.cv.body"), href: "/create-cv" },
    { id: "jobs", title: t("today.jobs.title"), body: t("today.jobs.body"), href: "/jobs" },
  ]}
  priceLabel={t("priceLabel")}
  price={t("price")}
  start={{ label: t("start"), href: "/auth/signup" }}
/>
```
