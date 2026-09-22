import { classifyEntryRecognition } from "../lib/structuring/recognition-tiers";
import { deriveJournalRecognition } from "../lib/journal/journal-recognition";
import { extractJournalSuggestions } from "../lib/structuring/extract-journal-suggestions";
for (const t of [
  "5 hours tiling in the kitchen", "Klijavau plyteles virtuvėje", "Dėjau plytelę", "Dejau plytele", "Klijavau plytelę virtuvėje",
  "Programavau ofise 5 val.", "Ploviau grindis sandėlyje", "Dirbau virtuvėje 5 val.", "5 val. virtuvėje", "Kepiau duoną kepykloje",
  "5 uur getegeld in de keuken", "4 Std. gestrichen im Lager", "клал плитку на кухне", "9 val. klijavau plyteles: 5 val. virtuvėje, 4 val. vonioje",
]) {
  const c = classifyEntryRecognition(t, new Set());
  const d = deriveJournalRecognition(t, { declaredSlugs: new Set(), entryRejections: { slugs: new Set(), claimLabels: new Set() } });
  const s = extractJournalSuggestions(t);
  console.log(t.padEnd(56), "| card=" + c.autoSignalSlugs.join(","), "| pipeline=" + d.recognizedSkills.map((r) => r.slug).join(","), "| acts=" + s.fragments.map((f) => f.activitySlug ?? "-").join(","));
}
