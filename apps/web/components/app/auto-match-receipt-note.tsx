import type { AutoMatchReceipt } from "@/lib/scouting/auto-match-receipt";

/**
 * One calm line on the scouting page: when the automatic internal search last
 * ran for this need and what it covered. Wording is deliberately narrow: it
 * speaks only of candidates already in LabourMarket.ai, and never implies that
 * anyone was contacted. Copy is inline (lt / en) because this slice must not
 * touch the shared message catalogues; other locales fall back to English.
 */
const COPY = {
  en: {
    ran: (n: number, rel: number, when: string) =>
      `Last automatic search of relevant candidates in LabourMarket.ai: ${when}. ${n} candidates evaluated, ${rel} relevant. Nobody was contacted.`,
    none: (n: number, when: string) =>
      `Last automatic search of relevant candidates in LabourMarket.ai: ${when}. ${n} candidates evaluated, none relevant yet. Nobody was contacted.`,
    notStructured: (when: string) =>
      `Automatic search ${when}: the need has too little detail to match yet. Add skills or a profession to search.`,
    failed: (when: string) =>
      `Automatic search ${when} could not finish. The list below is still computed live.`,
    capped: " The candidate pool was capped.",
  },
  lt: {
    ran: (n: number, rel: number, when: string) =>
      `Paskutinė automatinė tinkamų kandidatų paieška LabourMarket.ai: ${when}. Įvertinta kandidatų: ${n}, tinkamų: ${rel}. Niekas nebuvo kontaktuotas.`,
    none: (n: number, when: string) =>
      `Paskutinė automatinė tinkamų kandidatų paieška LabourMarket.ai: ${when}. Įvertinta kandidatų: ${n}, tinkamų kol kas nėra. Niekas nebuvo kontaktuotas.`,
    notStructured: (when: string) =>
      `Automatinė paieška ${when}: poreikis dar per menkai aprašytas. Pridėkite įgūdžių ar profesiją.`,
    failed: (when: string) =>
      `Automatinė paieška ${when} nebaigta. Žemiau esantis sąrašas vis tiek skaičiuojamas gyvai.`,
    capped: " Kandidatų kiekis buvo apribotas.",
  },
} as const;

export function AutoMatchReceiptNote({
  receipt,
  locale,
}: {
  receipt: AutoMatchReceipt | null;
  locale: string;
}) {
  if (!receipt) return null;
  const c = locale === "lt" ? COPY.lt : COPY.en;
  const when = new Date(receipt.finishedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  let text: string;
  if (receipt.status === "failed") text = c.failed(when);
  else if (receipt.status === "not_structured") text = c.notStructured(when);
  else if (receipt.status === "no_candidates") text = c.none(receipt.poolSize ?? 0, when);
  else text = c.ran(receipt.poolSize ?? 0, receipt.relevantCount ?? 0, when);
  if (receipt.poolCapped && (receipt.status === "completed" || receipt.status === "no_candidates")) {
    text += c.capped;
  }
  return (
    <p className="text-xs leading-relaxed text-text-muted" data-testid="scouting-auto-match-receipt">
      {text}
    </p>
  );
}
