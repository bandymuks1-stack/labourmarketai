import type { HelpRequestType } from "@/lib/help/help-request-model";

/**
 * LT MASTER explanations for the typed help requests (CR train WAGON 10 —
 * same owner LT-first rule as WAGON 9's lt-master-guidance):
 * legal / accounting / document-help explanation wording exists in
 * LITHUANIAN ONLY until the owner approves it. Non-LT locales render only
 * the short "prepared from the Lithuanian master" pending notice — never a
 * translated explanation (guard-pinned leak probes).
 *
 * Wording rules: conservative and honest — the platform gives NO legal or
 * accounting advice; a request only creates an internal record a human
 * reviews; no specialist is assigned automatically and nothing here claims
 * one is.
 */
export const HELP_EXPLANATIONS_LT: Record<HelpRequestType, string> = {
  recruiter:
    "Užregistruosime vidinę užklausą dėl pagalbos ieškant darbuotojų. Ją peržiūrės žmogus ir susisieks per platformą. Joks rekruteris nėra priskiriamas automatiškai.",
  accounting:
    "Užregistruosime vidinę užklausą dėl buhalterijos klausimų (pvz., komandiravimo dokumentai, apskaitos tvarka). Tai nėra buhalterinė konsultacija — užklausą peržiūrės žmogus. Atsakymai informacinio pobūdžio; sprendimus reikia pasitikrinti su savo buhalteriu.",
  legal:
    "Užregistruosime vidinę užklausą dėl teisinių ar dokumentų klausimų. Platforma neteikia teisinių konsultacijų — užklausą peržiūrės žmogus ir, jei galėsime, nukreipsime informacinio pobūdžio gaires. Teisinius sprendimus reikia pasitikrinti su teisininku.",
  documents:
    "Užregistruosime vidinę užklausą patikrinti, kokių dokumentų gali reikėti jūsų situacijoje (šalis, darbo pobūdis). Užklausą peržiūrės žmogus; atsakymas bus informacinio pobūdžio — tikslią tvarką reikia pasitikrinti oficialiuose šaltiniuose.",
  demand_filling:
    "Užregistruosime vidinę užklausą padėti užpildyti ar patikslinti jūsų darbuotojų poreikį, kad jis būtų aiškus ir pasiektų tinkamus žmones. Užklausą peržiūrės žmogus.",
};

/** Every explanation is a DRAFT awaiting owner review (WAGON 9 pipeline). */
export const HELP_EXPLANATIONS_STATUS = "LT_DRAFT_READY" as const;
export const HELP_EXPLANATIONS_NEED_LEGAL_REVIEW = true as const;
