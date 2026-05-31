# Real acceptance smoke — owner checklist (after the functional train)

Human-readable corridor the owner can run by hand to confirm the product works
end-to-end on the live domain. Every step below maps to a **real backend
read/write** — no demo/pilot data. If a step shows a blocked state, the script
says what owner action unblocks it (the flow is intentionally multi-step).

Domain: `https://app.labourmarket.ai` (canonical; apex/www 308-redirect).
Active locales: `lt`, `en`.

## Accounts you need

- **Owner** account with the **company** role active (Įmonė). Admin rights are
  fine — use the account-page "Hide admin UI" toggle to test as a normal user.
- **Worker** account whose email you will invite (can be a second browser /
  incognito). The worker signs in themselves — no email is sent.

## Corridor (run in order)

| # | Step | Where | Expected real result |
|---|---|---|---|
| 1 | Owner uses the company workspace | `/lt/dashboard/company` | "Operacijų erdvė" section with 4 live counts (pending invites / accepted roster / org members / review enabled) |
| 2 | Owner invites the worker by email | `/lt/dashboard/company` → invite form | Result says **"Kvietimas sukurtas"** (created), **not** "sent" — it is not emailed; the worker sees it after signing in with that email. Pending-invites count = 1 |
| 3 | Worker signs in with the invited email | worker browser → `/lt/dashboard` | Worker sees the pending invitation card |
| 4 | Worker accepts | worker dashboard → Accept | Real `company_workers` link created; success shown |
| 5 | Owner sees the worker | `/lt/dashboard/company` | Worker appears in the roster **card** (email + status + role + next action). Accepted-roster count = 1. No misleading "invite first" |
| 6 | Owner adds the worker to the organization | company workspace → OrgMembersPanel → **"Add to organization"** | `add_org_member` creates the canonical `employee` engagement; org-members count = 1 |
| 7 | Owner enables journal review | OrgMembersPanel → **"Įjungti peržiūrą"** | `journal_review_enabled = true`; review-enabled count = 1 |
| 8 | Worker opens the journal | worker → `/lt/dashboard/journal` | Active context shown with a human-readable label; the composer is visible. If review wasn't enabled yet, an honest "review not enabled yet" note appears instead |
| 9 | Worker creates a journal entry | journal composer → save | Entry persists and appears in the worker's entries list with status **Submitted** |
| 10 | Owner reviews the entry | `/lt/dashboard/company` → **"Peržiūrėti įrašus (N)"** → `/lt/dashboard/inbox` | The worker's entry is listed (name/email, date, summary). Owner approves |
| 11 | Worker sees the review origin | worker → `/lt/dashboard/journal` | Entry now shows **"Reviewed by {role} · {date}"** and the confirmed status |
| 12 | Durable proof / readiness | worker profile `/lt/dashboard/profile`; company workspace | Manager-confirmed skill shows the **"✓ Verified"** provenance; the entry stays confirmed (append-only). Profile completion reflects real saved state |
| 13 | Demand request saved + read back | `/lt/dashboard` (company/agency overview) | "Submit your need" persists a `customer_requests` row; it reads back with its real status |
| 14 | No pilot/demo wording | every visible surface above | No "Pilotinė versija / Pilot request / bandomoji prieiga / Tier-2 / Užsakyti pilotą"; admin shows "Operacijų valdymo skydas" |

## What is intentionally NOT here (honest gaps)

- **Projects / tasks** — company workspace shows an honest "Projektai ir užduotys
  ruošiami" card; there is no `tasks` table yet (RED — future data-model slice).
- **Matching "why"** — dormant until the PR #172 migration is owner-applied.
- **Messaging compose** — conversation list is read-only; a worker↔company
  composer is gated on participant-write verification.
- **PDF / report export** — no exporter yet; report preview only.

## Optional lightweight route smoke (anonymous)

Authenticated routes redirect to `/auth/login` when not signed in — that is the
correct anonymous result. Public pages return 200 directly.

```powershell
$urls = @(
  "https://app.labourmarket.ai/lt/pricing",
  "https://app.labourmarket.ai/lt/dashboard",
  "https://app.labourmarket.ai/lt/dashboard/company",
  "https://app.labourmarket.ai/lt/dashboard/journal",
  "https://app.labourmarket.ai/lt/dashboard/inbox",
  "https://app.labourmarket.ai/lt/dashboard/admin"
)
foreach ($url in $urls) {
  Write-Host "`n=== $url ==="
  $r = curl.exe -L -s -o - -w "`nHTTP_STATUS:%{http_code}`nFINAL_URL:%{url_effective}`n" $url
  ($r | Select-String "HTTP_STATUS:").Line
  ($r | Select-String "FINAL_URL:").Line
  foreach ($bad in @("Užsakyti pilotą","bandomoji prieiga","TIK RANKINĖ PERŽIŪRA","Tier-2","Pilotinė versija")) {
    if ($r -match [regex]::Escape($bad)) { Write-Host "FOUND BAD PHRASE:" $bad }
  }
}
```

Expected: pricing → 200; the `/dashboard/*` routes → 200 then redirect to
`/auth/login` (anonymous); no bad phrases on any page.

## Acceptance verdict

The corridor is **accepted** when steps 1–14 pass with a logged-in owner +
worker. Steps 1–13 are all backed by real reads/writes today; step 14 is verified
by the route smoke + the `realumo-no-pilot-framing` guard. The honest gaps above
are explicitly out of scope and surfaced as truthful "ruošiama" / RED-gated work.
