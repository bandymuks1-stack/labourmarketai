#!/usr/bin/env node
// Build a SEPARATE dated regional promotions/leads batch (e.g. Benelux) and its
// tally, deduped within-batch and against the master ledger. Appends new uniques
// to the ledger (append, never overwrite the whole thing). No network, no sending.
// Lead schema (per file, array): company_name, country, sector, demand_summary,
//   evidence_url, source_type, posting_date (YYYY-MM-DD), contact_route,
//   confidence, promotion_of_existing.
// Usage:
//   node scripts/outreach/build-region-promo-batch.mjs --leadsDir <in> --outDir <out> \
//     --ledger <master ledger csv> --region Benelux --date YYYY-MM-DD

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => { if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1]]); return a; }, []));
const { leadsDir, outDir, ledger, region = 'Region', date } = args;
if (!leadsDir || !outDir || !ledger || !date) { console.error('need --leadsDir --outDir --ledger --date'); process.exit(1); }

const TODAY = new Date(date + 'T00:00:00Z');
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function daysSince(d) { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d || ''); if (!m) return null; return Math.round((TODAY - new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 15))) / 86400000); }
function bucket(d) { const n = daysSince(d); if (n === null) return 'undated_needs_verification'; if (n <= 14) return 'last_14_days'; if (n <= 30) return 'last_30_days'; if (n <= 90) return 'last_90_days'; if (n <= 180) return 'last_180_days'; return 'older_than_180_days_excluded'; }

// Existing ledger names (for cross-batch dedup).
const seen = new Set();
if (existsSync(ledger)) {
  const lines = readFileSync(ledger, 'utf8').split('\n').slice(1).filter(Boolean);
  for (const ln of lines) {
    const m = ln.match(/^"[^"]*","[^"]*","([^"]*)","[^"]*","([^"]*)"/);
    if (m) seen.add(m[1] + '|' + (m[2] || '').toLowerCase());
  }
}

// Load leads.
let leads = [];
for (const f of readdirSync(leadsDir).filter((f) => f.endsWith('.json'))) leads.push(...JSON.parse(readFileSync(join(leadsDir, f), 'utf8')));

const HEADER = ['date','region','company_name','normalized_company_name','country','sector','demand_summary','evidence_url','source_type','posting_date','recency_bucket','contact_route','contact_is_direct','confidence','promotion_of_existing','duplicate_status','ready_for_owner_review_yes_no','notes'];
const rows = [HEADER.map(csvCell).join(',')];
const ledgerAppend = [];
const tally = {}, batchSeen = new Set();
let unique = 0, dupBatch = 0, dupLedger = 0, ready = 0;

for (const l of leads) {
  const key = norm(l.company_name) + '|' + (l.country || '').toLowerCase();
  let dup = 'new_unique_company';
  if (batchSeen.has(key)) { dup = 'duplicate_same_day_merged'; dupBatch++; }
  else if (seen.has(key)) { dup = 'duplicate_previous_batch_skipped'; dupLedger++; }
  else { batchSeen.add(key); unique++; }

  const b = bucket(l.posting_date);
  const contactDirect = l.contact_route && !/vdab\.be|jobs\.lu|indeed|skywalker|zaplata|cvkeskus|cvbankas|profesia|profession|jooble|finn\.no/i.test(l.contact_route) ? 'yes' : 'no';
  const inWindow = ['last_14_days', 'last_30_days', 'last_90_days', 'last_180_days'].includes(b);
  const isReady = dup === 'new_unique_company' && inWindow && Boolean(l.contact_route);
  if (isReady) ready++;
  const notes = [contactDirect === 'no' ? 'contact route is job board — company-direct contact discovery recommended' : '', dup !== 'new_unique_company' ? 'duplicate — not counted' : ''].filter(Boolean).join(' | ');

  rows.push([date, region, l.company_name, norm(l.company_name), l.country, l.sector, l.demand_summary, l.evidence_url, l.source_type, l.posting_date, b, l.contact_route, contactDirect, l.confidence, l.promotion_of_existing, dup, isReady ? 'yes' : 'no', notes].map(csvCell).join(','));

  if (dup === 'new_unique_company') {
    tally[l.country] = (tally[l.country] || 0) + 1;
    ledgerAppend.push([date, date, norm(l.company_name), '', l.country, l.contact_route, l.posting_date, l.evidence_url, isReady ? 'ready_draft_prepared' : 'watchlist', region + ' batch'].map(csvCell).join(','));
  }
}

writeFileSync(join(outDir, 'companies.csv'), rows.join('\n') + '\n', 'utf8');
if (ledgerAppend.length) appendFileSync(ledger, ledgerAppend.join('\n') + '\n', 'utf8');

const summary = { region, date, totalLeads: leads.length, uniqueNew: unique, dupWithinBatch: dupBatch, dupAgainstLedger: dupLedger, ready, byCountry: tally };
writeFileSync(join(outDir, 'batch-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
