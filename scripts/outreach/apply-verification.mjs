#!/usr/bin/env node
// Apply recency-verification results to raw leads.
// For each verification record with a real found_date, set the matching lead's
// hiring_signal_date + source_date_visible="yes" so the build step can bucket it.
// Never sets a date that wasn't actually found. Writes merged leads to --outDir.
// Usage:
//   node scripts/outreach/apply-verification.mjs --leadsDir <in> --verifyDir <in> --outDir <out>

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, c, i, arr) => { if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1]]); return a; }, [])
);
const { leadsDir, verifyDir, outDir } = args;
if (!leadsDir || !verifyDir || !outDir) { console.error('need --leadsDir --verifyDir --outDir'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const isDate = (s) => /^\d{4}-\d{2}(-\d{2})?$/.test(s || '');

// Load verification records into a map keyed by normalized company name.
const vmap = new Map();
for (const f of readdirSync(verifyDir).filter((f) => f.endsWith('.json'))) {
  for (const r of JSON.parse(readFileSync(join(verifyDir, f), 'utf8'))) {
    if (isDate(r.found_date)) vmap.set(norm(r.company_name), r);
  }
}

let promoted = 0, total = 0;
for (const f of readdirSync(leadsDir).filter((f) => f.endsWith('.json'))) {
  const arr = JSON.parse(readFileSync(join(leadsDir, f), 'utf8'));
  for (const lead of arr) {
    total++;
    if (String(lead.source_date_visible).toLowerCase() === 'yes') continue;
    const v = vmap.get(norm(lead.company_name));
    if (v) {
      lead.hiring_signal_date = v.found_date;
      lead.source_date_visible = 'yes';
      lead.signal = (lead.signal || '') + ` | recency-verified ${v.found_date}${v.evidence_url ? ' (' + v.evidence_url + ')' : ''}`;
      promoted++;
    }
  }
  writeFileSync(join(outDir, f), JSON.stringify(arr, null, 0), 'utf8');
}
console.log(JSON.stringify({ total, promoted, verificationRecords: vmap.size }, null, 2));
