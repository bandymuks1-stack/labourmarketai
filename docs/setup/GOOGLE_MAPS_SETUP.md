# Google Maps setup — real market-map locator

The `/dashboard/market-map` locator ("Your location on the map") renders a REAL
Google Maps view and geocodes typed places. It needs ONE browser API key. Until
that key is configured in the deployed environment, the map is **not complete**:
the screen stays usable through manual location entry behind an honest,
non-technical fallback, but the live map tiles and geocoding do not appear.

> The UI never shows the env-var name or any raw API error to users — that is a
> hard guard (`apps/web/lib/guards/map-locator-real.test.ts`). All configuration
> detail lives here and in the PR, never on screen.

## 1. Environment variable

| Variable | Scope | Required for | Where |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Public (browser) | Live map tiles + geolocation marker + address geocoding | Vercel **Production**, **Preview**, and local `.env.local` |

It is already declared OPTIONAL in `apps/web/lib/env.ts` (build/CI pass without
it) and is present (empty) in `.env.example`. Never commit a real key.

## 2. Google Cloud APIs to enable on the key

Enable all three on the same key (Google Cloud Console → APIs & Services):

1. **Maps JavaScript API** — renders the map tiles.
2. **Geocoding API** — reverse geocoding ("use my location" → readable city /
   region) and forward geocoding (typed place → coordinates + marker).
3. **Places API** — loaded via `&libraries=places` for richer address search.

Recommended hardening (does not block launch):

- Restrict the key to an **HTTP referrer** list: `https://app.labourmarket.ai/*`,
  the Vercel preview domains, and `http://localhost:3000/*` for local dev.
- Restrict the key to exactly the three APIs above.

## 3. Add the key

**Vercel** (Project → Settings → Environment Variables): add
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to Production **and** Preview, then redeploy.

**Local** (`apps/web/.env.local`):

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_key_here
```

## 4. Verify

1. Open `/<locale>/dashboard/market-map` on a phone (or 390px viewport).
2. The real map renders in "Your location on the map".
3. **"Use my location"** → browser asks for permission → on allow, the map
   centers on you with a marker and shows a readable place.
4. **Manual** → type a city/address → "Find location" → map centers + marker.
5. Deny geolocation → manual entry still works.
6. With NO key configured: the map area shows the honest fallback message and
   manual entry still records the location — and **no** env-var name or API
   error text appears anywhere on screen.

## Production-readiness note

The map feature is **not considered complete** until
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set in the deployed environment with the
three APIs enabled. Code + UX are shipped and guard-tested; this key is the only
remaining owner/Vercel step.