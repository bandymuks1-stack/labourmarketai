#!/usr/bin/env node
// Build companies.csv + ledger rows + summary from raw lead JSON files.
// Applies the master spec's strict recency bucketing and dedup.
// Usage:
//   node scripts/outreach/build-companies-csv.mjs --leadsDir <dir> --date YYYY-MM-DD --outDir <dir>
// Each *.json in leadsDir is an array of lead objects with keys:
//   company_name, country, city_or_region, sector, company_type, signal,
//   roles_needed, hiring_signal_date, source_date_visible, source_url,
//   official_domain, contact_page_url, language
// NO network, NO sending. Pure transform. Real signals only — nothing invented.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const leadsDir = args.leadsDir;
const date = args.date;
const outDir = args.outDir;
if (!leadsDir || !date || !outDir) {
  console.error('Missing --leadsDir / --date / --outDir');
  process.exit(1);
}

const TODAY = new Date(date + 'T00:00:00Z');
// Job-board / aggregator domains: a lead whose only domain is one of these has
// no company-direct contact route yet → cannot be "ready" (needs discovery).
const AGGREGATORS = new Set([
  'zaplata.bg', 'skywalker.gr', 'cvkeskus.ee', 'indeed.com', 'cvbankas.lt',
  'cv.lv', 'pracuj.pl', 'finn.no', 'jobindex.dk',
]);

function daysSince(dstr) {
  // dstr: YYYY-MM-DD or YYYY-MM. Returns integer days, or null if unparseable.
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(dstr || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 15));
  return Math.round((TODAY - d) / 86400000);
}

function bucketFor(lead) {
  const visible = String(lead.source_date_visible).toLowerCase() === 'yes';
  const days = visible ? daysSince(lead.hiring_signal_date) : null;
  if (days === null) return { bucket: 'undated_needs_verification', prio: 1, days: null };
  if (days <= 14) return { bucket: 'last_14_days', prio: 5, days };
  if (days <= 30) return { bucket: 'last_30_days', prio: 4, days };
  if (days <= 90) return { bucket: 'last_90_days', prio: 3, days };
  if (days <= 180) return { bucket: 'last_180_days', prio: 2, days };
  return { bucket: 'older_than_180_days_excluded', prio: 1, days };
}

const READY_BUCKETS = new Set(['last_14_days', 'last_30_days', 'last_90_days', 'last_180_days']);

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(gmbh|ou|uab|mb|sia|s\.r\.o\.|sro|d\.o\.o\.|doo|kft|a\.s\.|as|ab|oy|lda|eood|ead|ead|b\.v\.|bv|sp\. z o\.o\.|sp z oo|s\.p\.a\.|spa|ltd|limited|plc|aps|a\/s)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

// ---- Load ----
const files = readdirSync(leadsDir).filter((f) => f.endsWith('.json'));
let leads = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(leadsDir, f), 'utf8'));
  for (const l of arr) leads.push(l);
}

// ---- Dedup by normalized name + country ----
const seen = new Map();
for (const l of leads) {
  const key = normalizeName(l.company_name) + '|' + (l.country || '').toLowerCase();
  l._key = key;
  if (!seen.has(key)) { l._dup = 'new_unique_company'; seen.set(key, l); }
  else { l._dup = 'duplicate_same_day_merged'; }
}

// ---- Build rows ----
const HEADER = ['date','company_name','normalized_company_name','official_domain','country','city_or_region','sector','company_type','hiring_signal','hiring_signal_date','recency_bucket','source_date_visible_yes_no','roles_needed','source_url','contact_method','contact_value','outreach_angle','priority_score_1_5','language_recommended','duplicate_status','previous_contact_status','ready_for_owner_review_yes_no','notes'];

const rows = [HEADER.map(csvCell).join(',')];
const ledgerRows = [];
const summary = { total: leads.length, unique: 0, ready: 0, byBucket: {}, byCountry: {}, bySector: {}, byType: {}, datedNeedContact: 0, excludedOld: 0, dupes: 0 };

for (const l of leads) {
  const { bucket, prio } = bucketFor(l);
  const isDup = l._dup !== 'new_unique_company';
  if (isDup) summary.dupes++; else summary.unique++;

  const domain = (l.official_domain || '').toLowerCase();
  const isAggregatorOnly = domain && AGGREGATORS.has(domain) && !l.contact_page_url;
  const hasContact = Boolean(l.contact_page_url) || (Boolean(l.source_url) && !isAggregatorOnly && domain && !AGGREGATORS.has(domain));

  const ready = !isDup && READY_BUCKETS.has(bucket) && hasContact ? 'yes' : 'no';
  if (ready === 'yes') summary.ready++;
  if (READY_BUCKETS.has(bucket) && !hasContact) summary.datedNeedContact++;
  if (bucket === 'older_than_180_days_excluded') summary.excludedOld++;

  summary.byBucket[bucket] = (summary.byBucket[bucket] || 0) + 1;
  if (!isDup) {
    summary.byCountry[l.country] = (summary.byCountry[l.country] || 0) + 1;
    summary.bySector[l.sector] = (summary.bySector[l.sector] || 0) + 1;
    summary.byType[l.company_type] = (summary.byType[l.company_type] || 0) + 1;
  }

  const contactMethod = l.contact_page_url ? 'careers_or_contact_page' : (l.source_url ? 'public_vacancy_page' : 'none');
  const contactValue = l.contact_page_url || l.source_url || '';
  const firstRoles = (l.roles_needed || '').split(',').slice(0, 2).join(',').trim();
  const where = l.city_or_region || l.country;
  const angle = firstRoles ? `Currently advertising ${firstRoles} in ${where}` : `Active hiring signal in ${where}`;
  const notesParts = [];
  if (bucket === 'undated_needs_verification') notesParts.push('no explicit posting date visible — verify recency before send');
  if (isAggregatorOnly) notesParts.push('signal seen on job-board; needs company-direct contact discovery');
  if (bucket === 'older_than_180_days_excluded') notesParts.push('signal older than 6 months — excluded from ready');
  if (isDup) notesParts.push('duplicate of earlier lead this batch');
  notesParts.push(l.signal || '');

  const row = [
    date, l.company_name, normalizeName(l.company_name), l.official_domain, l.country,
    l.city_or_region, l.sector, l.company_type, l.signal, l.hiring_signal_date,
    bucket, l.source_date_visible, l.roles_needed, l.source_url, contactMethod,
    contactValue, angle, prio, l.language, l._dup, 'none', ready, notesParts.filter(Boolean).join(' | '),
  ];
  rows.push(row.map(csvCell).join(','));

  if (!isDup) {
    ledgerRows.push([
      date, date, normalizeName(l.company_name), l.official_domain, l.country,
      contactValue, (String(l.source_date_visible).toLowerCase() === 'yes' ? l.hiring_signal_date : 'undated'),
      l.source_url, (ready === 'yes' ? 'ready_draft_prepared' : (bucket === 'older_than_180_days_excluded' ? 'excluded_old' : 'watchlist_undated')), '',
    ].map(csvCell).join(','));
  }
}

writeFileSync(join(outDir, 'companies.csv'), rows.join('\n') + '\n', 'utf8');

const LEDGER_HEADER = 'first_seen_date,last_seen_date,normalized_company_name,official_domain,country,contact_value,last_hiring_signal_date,last_source_url,last_outreach_status,notes';
writeFileSync(join(outDir, '..', 'company-dedupe-ledger.csv'), LEDGER_HEADER + '\n' + ledgerRows.join('\n') + '\n', 'utf8');

writeFileSync(join(outDir, 'run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

console.log(JSON.stringify(summary, null, 2));
