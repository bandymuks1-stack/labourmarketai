/**
 * Renders the platform e-mails (company welcome in six languages, the registration
 * notice, the request alert) to HTML files from SYNTHETIC data, for a visual check.
 * Sends nothing and reads no database:
 *
 *   pnpm -F web exec tsx scripts/render-platform-emails.ts <out-dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  WELCOME_LOCALES,
  companyRegistrationNotice,
  companyWelcomeEmail,
  intakeAlertEmail,
} from "../lib/email/company-registration-emails";

const out = resolve(process.argv[2] ?? "rendered-emails");
const siteUrl = process.env.RENDER_SITE_URL ?? "https://labourmarket.ai";
mkdirSync(out, { recursive: true });

const files: Record<string, string> = {};
for (const locale of WELCOME_LOCALES) files[`welcome-${locale}.html`] = companyWelcomeEmail({ locale, siteUrl }).html;
files["registration-notice.html"] = companyRegistrationNotice({
  organizationName: "QA-SYNTHETIC Statyba UAB",
  countryCode: "LT",
  registeredAtIso: "2026-11-13T19:40:00.000Z",
  contactName: "QA-SYNTHETIC Vardenis Pavardenis",
  contactEmail: "qa.synthetic@example.test",
  adminUrl: `${siteUrl}/lt/dashboard/admin/company-verification#company-00000000-0000-4000-8000-000000000001`,
  publishedNeeds: 0,
  siteUrl,
}).html;
files["request-alert.html"] = intakeAlertEmail({
  title: "B2B bendradarbiavimo užklausa",
  queueUrl: `${siteUrl}/lt/dashboard/admin/company-need-intakes#00000000-0000-4000-8000-000000000002`,
  siteUrl,
}).html;

for (const [name, html] of Object.entries(files)) writeFileSync(join(out, name), html, "utf8");
console.log(`rendered ${Object.keys(files).length} e-mails to ${out}`);
