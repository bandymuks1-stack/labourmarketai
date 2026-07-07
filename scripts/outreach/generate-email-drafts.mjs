#!/usr/bin/env node
// Generate one personalized B2B invitation draft per READY company from companies.csv.
// Draft-only. NOT_SENT. Each draft cites >=2 company-specific details from source
// evidence (roles + location), per the master spec's email structure.
// Usage: node scripts/outreach/generate-email-drafts.mjs --csv <companies.csv> --out <email-drafts.md>

import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => { if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1]]); return a; }, []));
const { csv, out } = args;
if (!csv || !out) { console.error('need --csv --out'); process.exit(1); }

// Minimal CSV parser for fully-quoted fields with "" escaping.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(readFileSync(csv, 'utf8')).filter((r) => r.length > 1);
const header = rows.shift();
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const get = (r, k) => r[idx[k]] || '';

const localeFor = (lang) => (lang === 'lt' ? 'lt' : lang === 'ru' ? 'ru' : 'en');
const firstRoles = (s, n = 3) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, n).join(', ');

const ready = rows.filter((r) => get(r, 'ready_for_owner_review_yes_no') === 'yes');

let md = `# Email Drafts — 2026-07-07 (recency-verified ready set)

> **NOT_SENT.** ${ready.length} B2B invitation drafts for owner review — one per
> company, one contact route each. Every company below has a hiring signal with a
> real posting date verified within the last 6 months (see \`hiring_signal_date\`
> in companies.csv). Bodies are English working drafts; **Recommended send
> language** flags the local language to localise before send. Sending is an
> owner-only gate. Do not overclaim platform traffic/liquidity.

`;

ready.sort((a, b) => Number(get(b, 'priority_score_1_5')) - Number(get(a, 'priority_score_1_5')) || get(a, 'country').localeCompare(get(b, 'country')));

let n = 0;
for (const r of ready) {
  n++;
  const name = get(r, 'company_name');
  const country = get(r, 'country');
  const where = get(r, 'city_or_region') || country;
  const roles = firstRoles(get(r, 'roles_needed'));
  const type = get(r, 'company_type') === 'staffing_agency' ? 'staffing agency' : 'company';
  const lang = get(r, 'language_recommended');
  const locale = localeFor(lang);
  const contact = get(r, 'contact_value');
  const date = get(r, 'hiring_signal_date');
  const bucket = get(r, 'recency_bucket');
  const verb = get(r, 'company_type') === 'staffing_agency' ? 'is currently advertising' : 'recently listed';

  md += `---

## ${n}. ${name} — ${country} (${get(r, 'company_type')})
- Recommended send language: **${lang}** · Landing: https://labourmarket.ai/${locale}/company-need
- Contact route: ${contact || '(needs discovery)'} · Signal date: ${date} (${bucket})
- Evidence: ${get(r, 'hiring_signal')}

**Subject:** Invitation to publish your staffing needs on LabourMarket.ai

Hello,

I noticed ${name} ${verb} roles for ${roles || 'workers'} in ${where}. That kind of active staffing demand is exactly what LabourMarket.ai is being prepared to support.

LabourMarket.ai is a new labour-market project where companies and agencies can publish real staffing needs and workers present clearer, AI-structured CV information: work history, practical skills, availability and location preferences.

For a ${type} working in this sector, the long-term value is not just receiving names, but getting clearer context on each worker before deciding whom to contact — so matching becomes less random than reading unstructured CVs.

You are welcome to publish your first need here: https://labourmarket.ai/${locale}/company-need — or reply with the roles you are recruiting for and we can help prepare the first listing.

If this is not relevant, just reply "no" and we will not contact you again.

Best regards,
LabourMarket.ai team

`;
}

writeFileSync(out, md, 'utf8');
console.log(`Wrote ${ready.length} drafts to ${out}`);
