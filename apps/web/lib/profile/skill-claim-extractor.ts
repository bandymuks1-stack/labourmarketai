/**
 * Rule-based extractor for SELF-DECLARED profile skill claims (NOT verified).
 *
 * Input: free-text narrative the user typed into the profile composer
 *   (`profiles.profile_text`, owner-only, migration 0014).
 *
 * Output: a small set of editable, owner-only claim suggestions the user
 *   can confirm before they are persisted into `profile_skill_claims`
 *   (migration 0015). Nothing here is asserted as a verified fact — the
 *   downstream UI must always show the "not verified" disclaimer.
 *
 * Why a SECOND extractor (not the existing `extract-profile-suggestions`):
 *   The existing extractor maps to `skill_id`/`profession_slug` rows that
 *   the user already holds in their worker catalogue. Suggestions that
 *   don't match a catalogued skill_id are silently filtered out — e.g.
 *   "Moku programuoti" produces no chip if the user signed up as a
 *   builder. This extractor proposes the user's OWN WORDS as claim
 *   labels, regardless of whether a canonical skill row exists yet.
 *
 * Vocabulary is intentionally small. v1 covers the LT/EN examples named
 * in the slice goal; future PRs can extend `DICTIONARY` row-by-row.
 */

export type SkillClaimSuggestion = {
  /** Display label shown to the user (canonical form, localised LT). */
  label: string;
  /** Lowercased/trimmed form used for dedupe; matches DB `normalized_label`. */
  normalizedLabel: string;
  /** The text fragment/needle that triggered the suggestion — so every chip can
   *  show WHY it appeared (no suggestion without a reason from the text). */
  reason?: string;
  /** True when this suggestion is one of several mutually-exclusive readings of
   *  an ambiguous phrase (e.g. LT "svetainės dizainas" = website OR living-room
   *  design). The UI presents these as a clarification to confirm, not a fact. */
  ambiguous?: boolean;
};

type DictionaryRow = {
  /** Lowercased substrings; ANY match in the user's lowercased text counts. */
  needles: readonly string[];
  /** Canonical LT display label (UI-visible). */
  label: string;
};

/**
 * Lithuanian (and a few English) needles → canonical label. Kept inline,
 * not in a separate JSON, so adding a row is a one-PR change with a guard
 * test alongside. Match is case-insensitive substring against the
 * lowercased input — cheap, deterministic, and easy to reason about.
 *
 * Adding a needle: prefer the morphological STEM (e.g. "programuot"
 * matches "programuoti", "programuotojas", "programuotum"). If the stem
 * is ambiguous with an unrelated word, use a longer fragment.
 */
const DICTIONARY: readonly DictionaryRow[] = [
  {
    label: "Programavimas",
    needles: [
      "programuot",
      "programavim",
      "programuoj",
      "coding",
      "software",
      "frontend",
      "front-end",
      "backend",
      "back-end",
      "developer",
      // Common journal phrasings for fixing/building a site or app feature —
      // so "sutvarkiau React svetainės klaidą" / "taisiau kodą" is recognised
      // as IT work (never construction). "klaid" stays anchored to the
      // code/site context so it does not fire on a generic "klaida".
      "react",
      "javascript",
      "typescript",
      "svetainės klaid",
      "svetaines klaid",
      "kodo klaid",
      "kodo pataisym",
      "programos klaid",
    ],
  },
  {
    label: "Namų statyba",
    needles: [
      "statyti nam",
      "namų staty",
      "namu staty",
      "house build",
      "home build",
    ],
  },
  {
    label: "Statybos darbai",
    needles: [
      "statyb",
      "construction",
      "renovation",
      "renovacij",
    ],
  },
  {
    label: "Mūrijimas",
    needles: ["mūryt", "muryt", "masonry", "bricklay"],
  },
  {
    label: "Dažymas",
    needles: ["dažyt", "dazyt", "painting", "painter"],
  },
  {
    label: "Elektros darbai",
    needles: ["elektros darb", "elektrik", "electrical", "electrician"],
  },
  {
    label: "Santechnika",
    needles: ["santechnik", "vandentiek", "plumbing", "plumber"],
  },
  {
    // Renamed from "Stogo darbai" → "Stogų dengimas" to mirror the
    // active-verb form the owner's narrative used ("dengti stogus") and
    // to match the owner-preferred wording in the PR #46 follow-up
    // hotfix spec. "stog" stays as the broad needle so anything
    // roof-related still surfaces.
    label: "Stogų dengimas",
    needles: ["dengti stog", "stogdeng", "stog", "roofing", "roofer"],
  },
  {
    // New row — owner's narrative was "...gaminti lietuviškos virtuvės
    // patiekalus" which previously produced 0 self-declared chips. Stems
    // are picked to match the morphology of LT verbs ("gaminti" → "gamin",
    // "virėjas" → "virėj") + the obvious EN equivalents.
    // Parent — broad cooking/kitchen competence. "patiekal" added so
    // phrases like "lietuviškos virtuvės patiekalus" surface this
    // parent even when "gaminti patiekal" isn't adjacent (the
    // specialization "Lietuviškos virtuvės gamyba" below ALSO matches
    // on the same text — parent + specialization is the intent).
    label: "Maisto gamyba",
    needles: [
      "gaminti patiekal",
      "gaminti maist",
      "virtuvės patiek",
      "virtuvės darb",
      "patiekal",
      "maisto gamy",
      "maisto ruoš",
      "virėj",
      "virim",
      "cooking",
      "chef",
      "kitchen work",
    ],
  },
  {
    // SPECIALIZATION of Maisto gamyba. Triggers on the explicit LT
    // cuisine domain; the parent chip continues to surface via the
    // "patiekal" needle.
    label: "Lietuviškos virtuvės gamyba",
    needles: [
      "lietuvišk virtuv",
      "lietuviškos virtuv",
      "lietuvišką virtuv",
      "lietuviška virtuv",
      "lietuvišk patiekal",
      "lithuanian cuisine",
      "lithuanian dishes",
    ],
  },
  {
    label: "Vadovavimas komandai",
    needles: [
      "vadovauj",
      "vadovavim",
      "vadovavau",
      "team lead",
      "foreman",
      "brigad",
    ],
  },

  // ─── Idea-based capability rows ─────────────────────────────────────
  // Added in feat/cc/profile-save-state-and-idea-extraction. Each row
  // is grouped by the kind of mention the dictionary recognises:
  //
  //   - Activity phrase → capability (e.g. "drožti iš medžio" → Medienos
  //     apdirbimas)
  //   - Tool mention → capability (Word / Excel / PDF → Dokumentų
  //     tvarkymas)
  //   - Business-tool mention → capability (Rivilė → Apskaitos sistemos)
  //   - Responsibility phrase → capability (koordinuoti komandą → Komandos
  //     koordinavimas; ieškoti darbuotojų → Darbuotojų paieška)
  //
  // Adding a needle should follow the morphological-stem convention used
  // by the earlier rows: prefer a stem that catches the most LT case
  // endings (e.g. "drož" matches "drožti", "drožiu", "drožyba",
  // "drožinėju") rather than a single fully inflected form.

  {
    // Parent: any material-based wood work. "medž" matches medžio /
    // medžiagą; "medien" matches medieną; "medžio darb" / "carpentry"
    // / "woodwork" are unambiguous.
    label: "Medienos apdirbimas",
    needles: [
      "medž",
      "medien",
      "medžio darb",
      "medzio darb",
      "carpentry",
      "woodwork",
    ],
  },
  {
    // SPECIALIZATION of Medienos apdirbimas. "drož" matches drožti /
    // drožy / drožinė / drožinėju. Owner's "drožti iš medžio" yields
    // BOTH Drožyba (via "drož") AND Medienos apdirbimas (via "medž"),
    // so the user sees both the general material competence and the
    // specific specialization.
    label: "Drožyba",
    needles: [
      "drož",
      "wood carv",
      "carving",
    ],
  },
  {
    // Parent. Generic document-handling competence. "dokument" stem
    // covers dokumentai / dokumentų / dokumentus / dokumentais.
    label: "Dokumentų tvarkymas",
    needles: [
      "dokument",
      "office",
      "biuro dokumen",
      "document management",
    ],
  },
  {
    // SPECIALIZATION — specific office tool. Padded with leading
    // space so it doesn't match unrelated words. The user typing
    // "Word" / "word" / " word " surfaces this AND the parent
    // Dokumentų tvarkymas via the "dokument" stem when both phrases
    // appear in the narrative.
    label: "Word dokumentai",
    needles: [
      " word ",
      " word,",
      " word.",
      "microsoft word",
      "ms word",
      "word, excel",
      "word ir excel",
      "word and excel",
    ],
  },
  {
    label: "Excel / Skaičiuoklės",
    needles: ["excel", "spreadsheet", "skaičiuokl", "skaiciuokl"],
  },
  {
    label: "PDF dokumentai",
    needles: ["pdf"],
  },
  {
    // Parent — any accounting / business-admin tool. Rivilė is broken
    // out as its own specialization chip below so the user sees the
    // system recognised the specific product.
    label: "Apskaitos sistemos",
    needles: [
      "rivilė",
      "rivile",
      "apskait",
      "buhalter",
      "verslo administr",
      // Real-world audit: bare "erp" is a substring of unrelated LT words
      // ("čerpėmis" = roof tiles → false "Apskaitos sistemos"). Require the
      // ERP-system framing instead; "apskait"/"buhalter" cover the rest.
      "erp sistem",
      "erp program",
      "bookkeep",
      "accounting software",
    ],
  },
  {
    // SPECIALIZATION. Triggered only by the explicit product name —
    // the parent already covers any other ERP/accounting framing.
    label: "Rivilė",
    needles: ["rivilė", "rivile"],
  },
  {
    // Responsibility phrase — coordination is intentionally separate
    // from `Vadovavimas komandai` (above). A coordinator routes work
    // and unblocks; a lead/foreman commands. The two CAN coexist on
    // the same chip (a foreman who also coordinates) so we let both
    // chips surface when both phrasings are present.
    label: "Komandos koordinavimas",
    needles: [
      "koordinuot",
      "koordinuoj",
      "koordinavim",
      "koordinuoti komand",
      "koordin komand",
      "team coordination",
      "team coordinator",
    ],
  },
  {
    // Recruitment phrase. Catches LT verbs (ieškoti / ieškau /
    // ieškojau) when they appear in the context of finding workers,
    // plus the formal "atrank" / "atranka" (selection) and EN
    // "recruit"/"hiring" / "staffing".
    label: "Darbuotojų paieška",
    needles: [
      "ieškoti darbuotoj",
      "ieskoti darbuotoj",
      "ieškoti žmoni",
      "ieskoti zmoni",
      "ieškoti naujų žmoni",
      "ieskoti nauju zmoni",
      "darbuotojų paiešk",
      "darbuotoju paiesk",
      "atrank", // atranka / atrankos
      "atrenk", // atrenku / atrenka / atrenkti
      "naujus darbuotoj",
      "naujus žmoni",
      "naujus zmoni",
      "personalo paiešk",
      "personalo paiesk",
      "recruit",
      "hiring",
      "staffing",
    ],
  },

  // ─── Specialization + new-domain rows (feat/cc/profile-max-capability-capture) ──

  {
    // SPECIALIZATION of Santechnika. When the text says "santechnikos
    // montavimas" or "montuoju santechniką", both chips surface — the
    // user sees that the system caught the specific install activity,
    // not just the field.
    label: "Santechnikos montavimas",
    needles: [
      "santechnik montav",
      "santechnikos montav",
      "santechnikos darb",
      "santechnikos instal",
      "montuoju santechnik",
      "montuoti santechnik",
      "montavau santechnik", // "montavau santechniką"
      "montavo santechnik",
      "plumbing instal",
    ],
  },
  {
    // Activity verb — broad driving competence. Specialization chip
    // for the specific category sits below; both can match.
    label: "Vairavimas",
    needles: [
      "vairav", // vairavau / vairavo / vairavimas
      "vairuot",
      "vairuoj",
      "vairavim",
      "vairuoja",
      "driving",
      "driver",
    ],
  },
  {
    // SPECIALIZATION — passenger-car driving. Owner's narrative
    // mentioned "lengvąjį automobilį"; the specialization tells the
    // employer it is specifically a B-category driver, not e.g. heavy
    // truck.
    label: "Lengvojo automobilio vairavimas",
    needles: [
      "lengvąjį automobil",
      "lengvasis automobil",
      "lengvojo automobil",
      "lengvąja automobil",
      "lengv. automobil",
      "b kategorij",
      "passenger car driv",
    ],
  },
  {
    // Activity / role. Catches sales verbs ("parduodu", "pardaviau")
    // and the role noun ("pardavėjas", "pardavė").
    label: "Pardavimai",
    needles: [
      "pardav",
      "parduod",
      "parduoda",
      "selling",
      "sales",
      "salesperson",
    ],
  },
  {
    // Domain — legal / contract document work. Triggered by "sutart"
    // (sutartis / sutartys / sutartys) OR "teisin dokument" (teisinius
    // dokumentus) so it doesn't fire on every generic "dokument"
    // mention.
    label: "Sutarčių ruošimas",
    needles: [
      "sutarč",
      "sutart",
      "teisin dokument",
      "teisin patir",
      "teisin darb",
      "legal document",
      "contract draft",
      "contract prep",
    ],
  },

  // ─── Soft / cross-domain capabilities the owner smoke flagged as missed ──
  // (automation / motivation / communication). Stems are picked to match LT
  // morphology while staying specific enough to avoid firing on unrelated
  // words ("motyvas" = a reason is excluded — only the verb/role forms below).
  {
    // Automation — RPA / workflow / "automatizuoju procesus".
    label: "Automatizavimas",
    needles: [
      "automatizav",
      "automatizuoj",
      "automatiz",
      "automation",
      "automate",
      "automating",
      "n8n",
      "zapier",
    ],
  },
  {
    // Motivation — motivating / coaching a team ("motyvuoju komandą").
    label: "Motyvavimas",
    needles: [
      "motyvav",
      "motyvuoj",
      "motyvacij",
      "motivation",
      "motivating",
      "motivate",
    ],
  },
  {
    // Communication — client/team communication competence, plus the
    // public-speaking / presentation / negotiation / oratory family (P0 audit:
    // these were unrecognised even though generic "komunikacija" matched).
    // Review-only suggestion under one honest label — no new taxonomy slug.
    label: "Komunikacija",
    needles: [
      "komunikac",
      "komunikav",
      "bendrav", // bendravau / bendravimas / bendravo
      "bendrauj",
      "communication",
      "communicating",
      "communicate",
      // presentations / public speaking
      "prezentac", // prezentacija / prezentavau / prezentaciją
      "prezentav",
      "kalbėjim", // viešas kalbėjimas
      "kalbejim",
      "viešas kalb",
      "viesas kalb",
      "presentation",
      "public speaking",
      "презентац",
      "публичн", // публичные выступления
      // negotiation
      "deryb", // derybos / derybose
      "derėj", // derėjausi
      "derej",
      "negotiat",
      "переговор",
      // oratory
      "orator",
      "oratoryst",
      "оратор",
    ],
  },
  {
    // Client-facing work handover / presentation — a real work signal the owner
    // flagged ("pristačiau darbą klientui"). Distinct from generic Komunikacija:
    // it is specifically presenting/handing over/explaining DONE WORK to a
    // client. Needles are deliberately ANCHORED to a client context
    // ("...darbą/darbus klient...", "...klientui ... darb...", or an explicit
    // present/hand-over/explain verb adjacent to "klient...") so they never fire
    // on unrelated delivery ("pristačiau plyteles") or construction. Label-only,
    // no fake sales/management taxonomy slug (§7).
    label: "Darbų pristatymas klientui",
    needles: [
      // LT — work + client co-occurrence (verb may sit between the two words).
      "darbą klient",
      "darba klient",
      "darbus klient",
      "darbų klient",
      "darbu klient",
      "klientui atliktus darb",
      "klientui darb",
      "klientui atliktus",
      // LT — explicit present / hand-over / explain verb adjacent to the client.
      "pristačiau klient",
      "pristaciau klient",
      "pristatymas klient",
      "perdaviau klient",
      "perdaviau darbus klient",
      "perdavimas klient",
      "paaiškinau klient",
      "paaiskinau klient",
      // EN
      "handed over the work",
      "work handover",
      "client handover",
      "handed over to the client",
      "presented the work to",
      "presented the work to the client",
      // RU
      "сдал работу клиент",
      "сдал работы клиент",
      "сдача работ клиент",
      "передал работы клиент",
      "передал работу клиент",
      "сдал клиенту работ",
      "показал клиенту работ",
    ],
  },

  // ─── Sector-neutral creative / language / logistics rows (cross-sector) ──
  // Labourmarket.ai is sector-neutral: these are real non-construction work
  // kinds the journal must recognise, not leave "unknown". (LT "svetainė" =
  // BOTH "website" and "living room" — disambiguated below by the resolver.)
  {
    // Web / website design — fires when the text makes "website" explicit.
    label: "Interneto svetainės dizainas",
    needles: [
      "interneto svetain",
      "internetin svetain",
      "internetinės svetain",
      "tinklapio dizain",
      "tinklalapio dizain",
      "web dizain",
      "web design",
      "website design",
      "ux dizain",
      "ui dizain",
    ],
  },
  {
    // Interior / room design — fires when the text makes "interior/room" explicit.
    label: "Interjero dizainas",
    needles: [
      "interjer",
      "kambario dizain",
      "kambario interjer",
      "patalpų dizain",
      "patalpos dizain",
      "interior design",
    ],
  },
  {
    // Gardening / grounds keeping — real cross-sector day-work the journal
    // must recognise (owner reality: "pjausčiau gyvatvorę sode"). Label-only,
    // no fake taxonomy slug. Needles are specific stems so they do not collide
    // with unrelated words (no bare "sode" — it can ride inside other words).
    label: "Sodininkystė / aplinkos tvarkymas",
    needles: [
      "gyvatvor",
      "vejos pjov",
      "žolės pjov",
      "zoles pjov",
      "vejos pjaut",
      "genėj",
      "genej",
      "ravėj",
      "ravej",
      "sodinim",
      "sodininky",
      "želdin",
      "zeldin",
      "aplinkos tvark",
      "krūm geneji",
      "gardening",
      "mowing",
      "hedge trim",
      "pruning",
      "landscaping",
      "газон",
      "садов",
      "стрижк",
    ],
  },
  {
    // Heavy machinery / earthmoving equipment operation ("kasiau žemes su
    // ekskavatoriumi"). Label-only — there is no fake verified operator skill
    // behind it (§7). Earthworks itself stays a recognised SKILL via
    // SKILL_HINTS_LT; this row names the MACHINE so the entry is understood
    // rather than flagged "Nesuprasta".
    label: "Sunkiosios technikos operavimas",
    needles: [
      "ekskavator",
      "buldoz",
      "greider",
      "autokrautuv",
      "ratinis krautuv",
      "frontalinis krautuv",
      // Real-world audit: bare forklift ("dirbau su krautuvu") and crane
      // ("valdžiau kraną") were unrecognised. "krautuv" is forklift/loader
      // specific. Crane needles stay operator-anchored ("kran" alone = water
      // tap in RU), so only the explicit operate-a-crane phrasings.
      "krautuv",
      "valdžiau kran",
      "valdziau kran",
      "dirbau su kran",
      "kraninink",
      "bokštinis kran",
      "bokstinis kran",
      "technikos operat",
      "sunkiąja technik",
      "sunkiaja technik",
      "excavator",
      "bulldozer",
      "wheel loader",
      "экскаватор",
      "бульдозер",
      "погрузчик",
    ],
  },
  {
    // Translation / languages.
    label: "Vertimas",
    needles: [
      "vertėjav",
      "vertėj",
      "vertimo darb",
      "vertimą",
      "vertima",
      "vertimas",
      "translat",
    ],
  },
  {
    // Pet care / dog walking.
    label: "Gyvūnų priežiūra",
    needles: [
      "vedžiojau šun",
      "vedziojau sun",
      "šunį",
      "šuns",
      "šunų",
      "augintin",
      "gyvūnų priežiūr",
      "gyvunu prieziur",
      "dog walk",
      "pet care",
      "выгул собак",
      "уход за животн",
    ],
  },
  {
    // Utility-meter replacement / maintenance ("keičiau skaitliuką").
    label: "Skaitiklių keitimas / priežiūra",
    needles: [
      "skaitliuk",
      "skaitlik",
      "skaitik",
      "counter replac",
      "meter replac",
      "utility meter",
      "счётчик",
      "счетчик",
    ],
  },
  {
    // Fence painting / maintenance ("dažiau tvorą").
    label: "Tvoros priežiūra / dažymas",
    needles: [
      "tvoros daž",
      "tvorą daž",
      "tvora daz",
      "dažiau tvor",
      "daziau tvor",
      "fence paint",
      "fence repair",
      "забор",
    ],
  },
  {
    // SPECIALIZATION of Vairavimas — heavy goods / CE-category truck driving.
    label: "Sunkvežimio vairavimas",
    needles: [
      "sunkvežim",
      "sunkvezim",
      "vilkik",
      "ce kategorij",
      "c kategorij",
      "truck driv",
      "lorry",
    ],
  },
];

// Bumped from 12 → 24 for the max-capture upgrade: owner's expanded
// narrative now reliably yields 15+ chips when it touches multiple
// domains. Cap stays so an extreme adversarial CV-paste doesn't blow
// up the bucket grid.
const MAX_SUGGESTIONS = 24;
const MAX_INPUT_CHARS = 4000;

/**
 * Extract candidate claim suggestions from free-text profile narrative.
 *
 * Pure function — no IO, no auth. The caller is responsible for showing
 * the result behind a confirm step before persistence (Rule 3 of the
 * slice spec).
 */
export function extractProfileSkillClaims(
  rawText: string | null | undefined,
): SkillClaimSuggestion[] {
  if (typeof rawText !== "string") return [];
  const text = rawText.trim();
  if (text.length === 0) return [];

  const haystack = text.slice(0, MAX_INPUT_CHARS).toLowerCase();
  const found = new Map<string, SkillClaimSuggestion>();
  const add = (label: string, reason: string, ambiguous = false): void => {
    const normalized = label.toLowerCase();
    if (!found.has(normalized)) {
      found.set(normalized, { label, normalizedLabel: normalized, reason, ambiguous });
    }
  };

  for (const row of DICTIONARY) {
    for (const needle of row.needles) {
      if (needle && haystack.includes(needle)) {
        add(row.label, needle);
        break;
      }
    }
    if (found.size >= MAX_SUGGESTIONS) break;
  }

  // LT "svetainė" can mean BOTH "website" AND "living room", but the compound
  // "svetainės dizainas" overwhelmingly means WEBSITE design in modern use, so
  // it defaults to that single honest IT/design suggestion. The interior /
  // living-room reading is surfaced ONLY by its own explicit needles (interjero
  // / kambario / patalpų dizainas) in the main loop above — so plain
  // "svetainės dizainas" never yields an unrelated interior / construction
  // skill (owner P0 false-positive fix: "Dirbau su svetainės dizainu" must not
  // produce construction skills).
  if (haystack.includes("svetain") && haystack.includes("dizain")) {
    const webish =
      /interneto svetain|internetin\w* svetain|web ?dizain|web ?design|website|tinklap|tinklalap|ux dizain|ui dizain/.test(
        haystack,
      );
    const interiorish = /interjer|kambar|patalp|interior/.test(haystack);
    if (!webish && !interiorish) {
      add("Interneto svetainės dizainas", "svetainės dizain");
    }
  }

  return [...found.values()].slice(0, MAX_SUGGESTIONS);
}

/**
 * Normalize a label the user typed/edited before it goes into
 * `profile_skill_claims.normalized_label` (the UNIQUE key column).
 *
 * Lowercase + collapse internal whitespace. Kept here so the UI and the
 * server action use the same rule and dedupes line up.
 */
export function normalizeClaimLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
