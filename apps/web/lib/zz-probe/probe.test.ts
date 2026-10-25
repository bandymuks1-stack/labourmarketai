import { it } from "vitest";
import { appendFileSync } from "node:fs";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { deriveIntakeWorkTime } from "@/lib/journal/intake-work-time";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
const OUT =
  "C:/Users/Mano/AppData/Local/Temp/claude/C--Users-Mano-Documents-claud-darbai-labourmarketai-labourmarket-project-takeover-1b3eb1/dfa7fd15-1aab-4899-83a1-7ce9cea981f1/scratchpad/probe.out";
const DAY_TEXT: Record<string, string> = {
  lt: "šiandien 6 valandas mūrijau blokelių sieną objekte",
  en: "today I laid a block wall on site for 6 hours",
  ru: "сегодня 6 часов клал стену из блоков на объекте",
  nl: "vandaag 6 uur een blokkenmuur gemetseld op de bouwplaats",
  de: "heute 6 Stunden eine Blockmauer auf der Baustelle gemauert",
  pl: "dzisiaj przez 6 godzin murowałem ścianę z bloczków na budowie",
};
it("probe", () => {
  for (const [l, t] of Object.entries(DAY_TEXT)) {
    const p = extractWorkLog(t, "2026-10-24");
    const w = deriveIntakeWorkTime(t, "2026-10-24");
    appendFileSync(
      OUT,
      `PROBE ${l} ` +
        JSON.stringify({
          site: p.site,
          worked: p.workedMinutes,
          frags: w.fragments.map((f) => [f.rawPhrase, f.timeValue, f.activitySlug, f.activityLabel]),
          q: w.quantityMinutes,
          skills: recognizeSkills(t, 4).map((s) => s.slug + ":" + s.via),
        }) +
        "\n",
    );
  }
});
