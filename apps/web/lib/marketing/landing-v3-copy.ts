/**
 * LANDING V3 — PREVIEW COPY (prototype branch `evidence/landing-v3-preview`).
 *
 * NOT the message catalogs: this file exists so the owner can look at the
 * structure in Lithuanian and English before anything is approved. When the
 * direction is approved these lines move into `messages/*.json` for lt, en,
 * ru, pl, de and nl and this file is deleted.
 */
export type LandingV3Copy = {
  lead: string;
  moreChoices: string;
  or: string;
  need: {
    title: string;
    body: string;
    free: string;
  };
  market: {
    title: string;
    /** {adverts} {employers} {date} */
    line: string;
    source: string;
    link: string;
    none: string;
  };
  how: {
    title: string;
    points: readonly { title: string; body: string }[];
    links: { workers: string; companies: string; data: string };
  };
};

const en: LandingV3Copy = {
  lead: "For every profession and sector. Signing up and posting a need are free.",
  moreChoices: "More choices",
  or: "or say what you need",
  need: {
    title: "Submit a need",
    body: "Tell us what you need — workers, a business service or a single project. A person reads every request and replies.",
    free: "Free · no sign-up needed",
  },
  market: {
    title: "The job market right now",
    line: "{adverts} active public job adverts, naming {employers} employers.",
    source:
      "These are public job adverts collected from job-advert sources — not employers registered on LabourMarket.ai. Updated {date}.",
    link: "See the adverts",
    none: "Market figures are not available at the moment.",
  },
  how: {
    title: "How it works",
    points: [
      { title: "Agree", body: "Find work or people and agree in one conversation." },
      { title: "Record", body: "Work done is written into a work journal as it happens." },
      { title: "Confirm", body: "A manager confirms it; confirmed work becomes proof of skill in your CV." },
      { title: "Stay in control", body: "The assistant suggests, a person decides. You choose who sees your records." },
    ],
    links: {
      workers: "For workers",
      companies: "For companies",
      data: "Your data and who can see it",
    },
  },
};

const lt: LandingV3Copy = {
  lead: "Visoms profesijoms ir sektoriams. Registracija ir poreikio paskelbimas nemokami.",
  moreChoices: "Daugiau pasirinkimų",
  or: "arba pasakykite, ko reikia",
  need: {
    title: "Pateikti poreikį",
    body: "Parašykite, ko reikia: darbuotojų, verslo paslaugos ar vieno projekto. Kiekvieną užklausą perskaito žmogus ir atsako.",
    free: "Nemokamai · registruotis nereikia",
  },
  market: {
    title: "Darbo rinka šiuo metu",
    line: "{adverts} aktyvių viešų darbo skelbimų, kuriuose nurodyta {employers} darbdavių.",
    source:
      "Tai vieši darbo skelbimai, surinkti iš darbo skelbimų šaltinių, o ne LabourMarket.ai užsiregistravę darbdaviai. Atnaujinta {date}.",
    link: "Žiūrėti skelbimus",
    none: "Rinkos skaičiai šiuo metu nepasiekiami.",
  },
  how: {
    title: "Kaip tai veikia",
    points: [
      { title: "Susitarkite", body: "Raskite darbą ar žmones ir susitarkite viename pokalbyje." },
      { title: "Užrašykite", body: "Atliktas darbas įrašomas į darbo žurnalą tada, kai vyksta." },
      { title: "Patvirtinkite", body: "Vadovas patvirtina; patvirtintas darbas tampa įgūdžių įrodymu jūsų CV." },
      { title: "Valdykite patys", body: "Asistentas pasiūlo, sprendžia žmogus. Jūs renkatės, kas mato jūsų įrašus." },
    ],
    links: {
      workers: "Darbuotojams",
      companies: "Įmonėms",
      data: "Jūsų duomenys ir kas juos mato",
    },
  },
};

export function landingV3Copy(locale: string): LandingV3Copy {
  return locale === "lt" ? lt : en;
}
