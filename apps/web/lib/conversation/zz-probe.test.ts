import { it } from "vitest";
import { classifyIntent } from "@/lib/conversation/intent-router";

it("probe", () => {
  for (const s of [
    "Per draugų susibūrimus mėgstu kepti kepsnius.",
    "Esu pastolininkas, bet kartais dirbu virtuvėje ir man tai patinka.",
    "Norėčiau išbandyti darbą virtuvėje.",
    "Dirbau restorano virtuvėje 6 mėnesius.",
    "Šiandien 5 valandas virtuvėje ruošiau maistą klientams.",
    "Namuose taisau automobilius.",
  ]) {
    const r = classifyIntent(s);
    console.log("PROBE", s, "=>", r.intent, JSON.stringify(r).slice(0, 160));
  }
});
