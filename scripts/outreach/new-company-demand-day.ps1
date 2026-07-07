<#
.SYNOPSIS
  Scaffold a new daily company-demand outreach folder for LabourMarket.ai.
.DESCRIPTION
  Creates runtime/outreach/labourmarketai-company-demand/<Date>/ with the
  23-column companies.csv header and all six required report templates, and
  ensures the master dedupe ledger exists. File creation only — NO network,
  NO sending. Implements the master spec
  (LABOURMARKETAI_COMPANY_DEMAND_OUTREACH_MASTER_V1.md).
.EXAMPLE
  pwsh scripts/outreach/new-company-demand-day.ps1 -Date 2026-07-08
#>
param(
  [Parameter(Mandatory = $false)]
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd')
)

if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  Write-Error "Date must be YYYY-MM-DD (got '$Date')"; exit 1
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$base = Join-Path $repoRoot 'runtime/outreach/labourmarketai-company-demand'
$dayDir = Join-Path $base $Date
New-Item -ItemType Directory -Force -Path $dayDir | Out-Null

# Master dedupe ledger (create header only if absent — never overwrite).
$ledger = Join-Path $base 'company-dedupe-ledger.csv'
if (-not (Test-Path $ledger)) {
  'first_seen_date,last_seen_date,normalized_company_name,official_domain,country,contact_value,last_hiring_signal_date,last_source_url,last_outreach_status,notes' |
    Set-Content -Path $ledger -Encoding utf8
}

# companies.csv — 23-column header (do not clobber an existing day file).
$companies = Join-Path $dayDir 'companies.csv'
if (-not (Test-Path $companies)) {
  'date,company_name,normalized_company_name,official_domain,country,city_or_region,sector,company_type,hiring_signal,hiring_signal_date,recency_bucket,source_date_visible_yes_no,roles_needed,source_url,contact_method,contact_value,outreach_angle,priority_score_1_5,language_recommended,duplicate_status,previous_contact_status,ready_for_owner_review_yes_no,notes' |
    Set-Content -Path $companies -Encoding utf8
}

# Report templates.
$templates = @{
  'email-drafts.md'              = "# Email Drafts — $Date`n`n> One draft per ready company. NOT_SENT. Owner approval required before any send.`n"
  'daily-report.md'              = "# Daily Report — $Date`n`n(raw leads, unique ready, by country, by sector, recency breakdown, top 10 opportunities, next-day focus, compliance notes, best queries)`n"
  'owner-review-next-actions.md' = "# Owner Review — Next Actions — $Date`n`n(ready for owner-approved send / need better contact discovery / skip / company-need page gaps)`n"
  'dedupe-report.md'             = "# Dedupe Report — $Date`n`n(raw found, duplicates removed, merged, previously-contacted skipped, moved to recheck, final unique, confirmation no company got multiple drafts)`n"
  'excluded-or-watchlist.md'     = "# Excluded / Watchlist — $Date`n`n(older than 6 months / undated / hidden-company ads / no public contact route / duplicates not used — with reason)`n"
  'recheck-existing-companies.md'= "# Recheck Existing Companies — $Date`n`n(already-known companies with a new signal; follow-up useful?; why no 2nd email drafted)`n"
}
foreach ($name in $templates.Keys) {
  $path = Join-Path $dayDir $name
  if (-not (Test-Path $path)) { $templates[$name] | Set-Content -Path $path -Encoding utf8 }
}

Write-Host "Scaffolded company-demand outreach day: $dayDir"
Write-Host "Ledger: $ledger"
