/**
 * Owner-review evidence for Work Journal capability/specialization recognition
 * (fix/owner-smoke-map-skills-journal-edit-v1, bug 2).
 *
 * The journal now surfaces explicit named capabilities as review-only chips via
 * the SAME dictionary the profile uses (`extractProfileSkillClaims`). This
 * harness renders the exact chips that appear for the owner-flagged inputs —
 * proving specializations are preserved, not flattened to a generic parent.
 *
 * Run: npx tsx scripts/owner-evidence/render-journal-evidence.mts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractProfileSkillClaims } from "../../apps/web/lib/profile/skill-claim-extractor.ts";

const CASES: { title: string; text: string }[] = [
  {
    title: "Ambiguity — 'svetainės dizainas' surfaces BOTH readings (web + interior)",
    text: "Dirbau su svetainės dizainu 9 h",
  },
  {
    title: "Sector-neutral — driving/logistics, translation, cooking (no construction)",
    text: "Vairavau CE kategorijos sunkvežimį 10 h; vertėjavau iš rusų į lietuvių; gaminau lietuviškus patiekalus",
  },
  {
    title: "Flattening fix — culinary specialization is preserved",
    text: "Šiandien gaminau lietuviškos virtuvės patiekalus.",
  },
  {
    title: "Broad entry — every owner-flagged capability is captured",
    text:
      "Šiandien vairavau lengvąjį automobilį po objektus, vežiojau medžiagas. " +
      "Po pietų dirbau pardavimuose — pardaviau klientams paslaugas. " +
      "Montavau santechniką vonioje. Ruošiau sutartis ir tvarkiau dokumentus. " +
      "Automatizavau dalį proceso, motyvavau komandą ir daug bendravau su klientais. " +
      "Vakare gaminau lietuviškos virtuvės patiekalus.",
  },
];

const chip = (s: string): string =>
  `<span style="display:inline-block;margin:3px;padding:5px 10px;border:1px solid rgb(37 99 235 / .5);background:rgb(37 99 235 / .12);border-radius:999px;font:600 12px system-ui;color:rgb(147 197 253)">${s}<span style="margin-left:6px;font:10px system-ui;color:rgb(148 163 184)">+ profilis</span></span>`;

const panels = CASES.map((c) => {
  const labels = extractProfileSkillClaims(c.text).map((x) => x.label);
  return `
  <div style="background:rgb(13 18 26);border:1px solid rgb(30 41 59);border-radius:12px;padding:16px;margin-bottom:16px">
    <div style="font:600 14px system-ui;color:rgb(226 232 240);margin-bottom:8px">${c.title}</div>
    <div style="font:13px system-ui;color:rgb(148 163 184);background:rgb(10 14 20);border:1px solid rgb(51 65 85);border-radius:8px;padding:10px;margin-bottom:10px">“${c.text}”</div>
    <div style="font:600 11px system-ui;color:rgb(148 163 184);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Galimi gebėjimai (savideklaruoti, nepatvirtinti) — ${labels.length}</div>
    <div>${labels.map(chip).join("")}</div>
  </div>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:rgb(2 6 12);padding:20px;font-family:system-ui}</style></head>
<body data-testid="journal-evidence">
  <h1 style="font:700 18px system-ui;color:rgb(226 232 240)">Work Journal — capability &amp; specialization recognition (owner evidence)</h1>
  <p style="font:13px system-ui;color:rgb(148 163 184)">Chips are self-declared, unverified suggestions; the worker confirms each (one tap adds it to the profile). Note both parent AND specialization appear for cuisine — no flattening.</p>
  ${panels}
</body></html>`;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "docs", "audits", "evidence", "owner-smoke-map-skills-journal-edit-v1");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "journal-skills.html");
writeFileSync(outFile, html, "utf8");
console.log("WROTE", outFile);
