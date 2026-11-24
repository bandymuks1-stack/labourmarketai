# e2e-archive

Screenshot scripts that used to live in `tests/e2e/` but are not tests:
no assertions, a hard-coded production URL, or assertions on surfaces that
no longer exist (`live-product-demo`). They stay for the walk recipes that
reference them; Playwright's `testDir` is `tests/e2e`, so nothing here runs
or counts toward the CI floor. Run one by hand with
`npx playwright test --config playwright.config.ts tests/e2e-archive/<file>`
only after pointing it at a live server you own.
