/**
 * Conversation intent router — DETERMINISTIC (no LLM).
 *
 * The conversation-first control layer must work with the LLM entirely OFF
 * (doctrine §7 / brief §10): the deterministic layer alone has to cover CV,
 * profile, work-time, calendar, offers, message drafting, confirmations,
 * navigation and next-action. This module is that layer's front door: it maps a
 * free-text sentence to ONE conversation intent using weighted keyword/phrase
 * matching across ALL FIVE routed locales (LT / EN / RU / NL / DE — G3 of the
 * chat-first audit closed the nl/de gap) plus common variants of the other
 * launch markets.
 *
 * It NEVER executes anything and NEVER writes: it only classifies. The chat
 * surface takes the returned intent and routes to an existing real flow
 * (CV import, employer search, work-log, booking, profile forms, navigation).
 * When the LLM is later switched on it may only PROPOSE a registry action id +
 * fields; this deterministic router remains the always-on floor.
 *
 * Pure module: no server-only imports, no IO — safe on client and trivially
 * unit-testable.
 */

export type ConversationIntent =
  | "log-work" // "šiandien dirbau nuo 8 iki 17" — record a work-journal entry
  | "find-work" // "rask man darbą Nyderlanduose" — employer/opportunity search
  | "write-employer" // "parašyk šiai įmonei" — draft a human message
  | "translate" // "išversk žinutę į olandų kalbą" — translate text
  | "calendar-view" // "kada turiu kitą susitikimą?" — show the plan
  | "reminder" // "primink rytoj 8 val." — set a reminder
  | "cv" // "įkelk šį CV" / "parodyk mano CV"
  | "profile" // "pridėk kalbą / įgūdį / patirtį"
  | "offers" // "ką man siūlo" — incoming booking offers
  | "need-workers" // "reikia darbuotojų" — employer demand intake (rebuild W4)
  | "criteria" // "kokie kriterijai pas mane nurodyti?" — search-criteria readback
  | "next-action" // "ką dar turiu padaryti?"
  | "resume" // "kur sustojau?"
  // ── AI workspace (W4): goals stated in words, executed as workflows ──────
  | "skill-gap" // "kokių įgūdžių man trūksta?"
  | "journal-recent" // "parodyk paskutinius žurnalo įrašus"
  | "figures" // "parodyk patvirtintas valandas" / "paruošk ataskaitą"
  | "open-project" // "atidaryk šį projektą"
  // ── G8 (chat-first audit 2026-08-30): the chip surfaces, reachable by
  //    sentence. Same handler as the chip — one engine, never a second path. ─
  | "projects" // "mano projektai" / "meine Projekte" — the projects result
  | "candidates" // "parodyk kandidatus" / "my candidates" — demand review
  | "find-workers" // "surask darbuotojų" — scouting, NOT demand intake
  | "need-service" // "reikia, kad kas nors sutaisytų stogą" — a JOB done, not a job
  | "context" // "ką tu apie mane žinai?"
  | "switch-context" // "perjunk į įmonę X" / "grįžk į asmeninį" — ONE ACTIVE CONTEXT
  | "opportunities" // "kokias galimybes man gali pasiūlyti?" — the OWN board
  | "interest-inbox" // "kas susidomėjo mano poreikiu?" — who raised a hand
  | "admin-approvals" // "ką turiu patvirtinti?" — the approvals area
  | "admin-requests" // "noriu pateikti atostogų prašymą" — the requests area
  | "timesheets" // "parodyk mano tabelį" — the timesheets area of planning
  // ── §9 chat-first coverage: whole domains that EXIST in the product but
  //    could only be reached by knowing their URL. Route-class, one `link:`
  //    chip each, never a second view inside the chat. ─────────────────────
  | "hours-import" // "įkelk tabelį" — the historical timesheet import surface
  | "work-hours" // "atidaryk darbo valandas" — the daily hours screen
  | "absences" // "kiek atostogų dienų man liko?" — leave & absence
  | "documents" // "parodyk mano dokumentus" — the document centre
  | "market-map" // "parodyk rinkos žemėlapį" — the labour-market map
  | "activity" // "parodyk pranešimus" — the unified activity centre
  | "messages-view" // "parodyk žinutes" — open the human-messages projection
  | "player-card" // "parodyk mano kortelę" — the card as a chat projection
  | "experiences" // "palikti patirtį" / "patirtys apie mane" — W6 slice 3D
  | "engagements" // "su kuo dirbu" / "baigti darbo santykį" — §7.1
  | "company-overview" // "kas vyksta mano įmonėje?" — the company hub
  | "create-organization" // "sukurk įmonę" — START one, not look at one
  | "lmc" // "kiek turiu LMC?" / "už ką buvo nuskaičiuota?" — the credit ledger
  // ── V9 value-intent: a stated OFFER of value (goods to sell, free
  //    capacity) — the structurer (lib/structuring/value-statement.ts)
  //    refines it; the router only opens the door. ─────────────────────────
  | "offer-value" // "turiu 30 kg agurkų ir noriu parduoti" / "turiu dvi laisvas dienas"
  // ── AGENCY (real recruiter pilot, 2026-09-04). The first real recruiter
  //    typed "noriu pakviesti klientą" and got the generic fallback: the
  //    agency's whole vocabulary was missing here, although the canonical
  //    actions (`agency.invite-client`, `agency.propose-candidate`) already
  //    existed behind the dashboard. Chat-first doctrine: the sentence IS the
  //    entry point; the workspace is the secondary view. ─────────────────
  | "invite-client" // "noriu pakviesti klientą" — agency ↔ client connection
  | "invite-candidate" // "pakviesk darbuotoją į komandą" — roster invitation
  | "client-demand" // "ką klientas pasidalino?" — the requests clients shared
  | "propose-candidate" // "pasiūlyk kandidatą" — offer a roster worker
  | "proposal-status" // "kaip sekasi mano pasiūlymams?" — the client's decisions
  // ── STUDENT / EDUCATION INSTITUTION — route-class: the canonical surfaces
  //    exist (compass, programmes, learner invite); the chat answers with the
  //    one chip to them until an executor exists. ───────────────────────────
  | "learning-compass" // "parodyk mano mokymosi kompasą"
  | "invite-student" // "pakviesk studentą" — learner invitation (relationship student)
  | "programmes" // "sukurk programą / grupę" — programmes & cohorts
  | "unknown";

export type IntentMatch = {
  intent: ConversationIntent;
  /** Sum of matched pattern weights (0 when nothing matched). */
  score: number;
  /** The patterns that fired — surfaced for transparency + tests. */
  matched: string[];
};

type Pattern = { re: RegExp; weight: number };
type IntentRule = { intent: ConversationIntent; patterns: Pattern[] };

/**
 * A Unicode-aware word boundary. JS `\b` is ASCII-only, so it misfires at every
 * non-ASCII boundary (Lithuanian ąčęėįšųūž, Cyrillic): `darbą\b` never matches
 * after `ą`, and `\bcv\b` still lets `zxcv` match. This asserts a real
 * letter↔non-letter transition using Unicode letter/number classes (requires
 * the `u` flag), so short stems like `cv`/`job` stay properly bounded across
 * every launch language.
 */
export const UNICODE_WORD_BOUNDARY =
  "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";

const UB = UNICODE_WORD_BOUNDARY;

/**
 * DIACRITIC FOLDING — found in production during the owner-acceptance
 * verification (§16): a Lithuanian user typing "Parodyk zinutes" instead of
 * "Parodyk žinutes" hit the generic fallback, because every LT pattern here
 * demanded the diacritic. On phone keyboards and on many desktop layouts
 * typing without diacritics is the NORM, not an edge case, so the router
 * matched a spelling most people do not use.
 *
 * The fix folds BOTH sides: the incoming sentence and the pattern source are
 * reduced to their base letters before matching, so `žurnalas` and `zurnalas`
 * are the same word to the router — while the message catalogue keeps the
 * correct spelling everywhere the user READS it.
 *
 * NFD + combining-mark strip covers Lithuanian (ąčęėįšųūž), Latvian,
 * Estonian, Polish and German umlauts. Two letters need an explicit map
 * because they are not decomposable: `ł` and `ø`. Cyrillic `ё`→`е` is folded
 * for the same reason (it is routinely typed as `е`).
 */
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .replace(/ø/gi, "o")
    .replace(/ё/gi, "е")
    .toLowerCase();
}

/** Build a word/phrase pattern. The source is DIACRITIC-FOLDED (so it matches
 *  the folded query) and each ASCII `\b` becomes the Unicode-safe boundary. */
function p(source: string, weight = 1): Pattern {
  return { re: new RegExp(fold(source).replace(/\\b/g, UB), "iu"), weight };
}

/**
 * Rule table. Ordered by specificity of the *signal*, not by intent priority —
 * scoring resolves overlaps (e.g. the word "darbas"/"work" appears in both
 * find-work and log-work; the PAST-TENSE verb + a TIME span tips it to
 * log-work, the SEEKING verb tips it to find-work).
 */
const RULES: IntentRule[] = [
  // ── AI workspace intents (W4) ────────────────────────────────────────────
  // First, because each one is a MORE SPECIFIC reading of words that a
  // general rule below would otherwise swallow ("įgūdžiai" → profile,
  // "žurnalas" → log-work, "darbuotojai" → need-workers). Their weights are
  // set so the specific reading wins on score, not merely on order.
  {
    intent: "skill-gap",
    patterns: [
      p("(trūksta|nemoku|neturiu)\\s*.{0,20}(įgūd|kvalifik)", 5),
      p("(kokių|kurių)\\s+įgūdž", 5),
      p("(what|which)\\s+skills?\\s*(am\\s+i|do\\s+i)?\\s*(missing|lack|need)", 5),
      p("(каких|какие)\\s+навык", 5),
      p("skill\\s*gap", 4),
      p("(missing|lacking)\\s+skills?", 4),
      p("не\\s+хватает\\s+навык", 5),
      // de — "Welche Fähigkeiten fehlen mir?" — the GAP verb is required, so
      // "welche Fähigkeiten habe ich" stays a profile question.
      p("(fähigkeiten|kompetenzen|qualifikation)\\s*.{0,16}(fehlen|fehlt|brauche)", 5),
      // nl — "Welke vaardigheden mis ik / ontbreken er?"
      p("(vaardigheden|competenties)\\s*.{0,16}(mis|ontbrek|nodig)", 5),
    ],
  },
  {
    intent: "journal-recent",
    patterns: [
      p("(parodyk|rodyk|show|покажи|zeig|toon|laat)\\s*.{0,20}(žurnal|journal|дневник|tagebuch|dagboek)", 5),
      p("(paskutin|latest|last|последн|letzte|laatste)\\s*.{0,18}(įraš|entr|запис|eintrag|einträge)", 5),
      p("(mano|my|мой|mein|mijn)\\s+(žurnal|journal|дневник|tagebuch|dagboek)", 4),
      // A QUESTION about hours worked is a journal READ, not a log-work
      // intake. "Kiek valandų dirbau šiandien?" used to score log-work via
      // the bare past-tense verb and answered with the log-work template —
      // the assistant asking you to record the very thing it should be
      // reporting (owner visual acceptance P0-5). The interrogative +
      // hours/worked pairing outweighs log-work's verb+today signals.
      p("(kiek|how\\s+(many|much)|сколько|hoeveel|wie\\s+viele?)\\s*.{0,24}(valand|hour|час|stunden|uur|uren)", 7),
      p("(kiek|how\\s+(many|much)|сколько|hoeveel|wie\\s+viele?)\\s*.{0,24}(dirbau|dirbome|worked|работал|gearbeitet|gewerkt)", 7),
      // The same rule for the WHAT question. "Ką šiandien dariau?" asks what
      // was RECORDED; it matched calendar-view's (ką + šiandien) pairing and
      // came back with the day's PLAN — the future answering a question about
      // the past. Same shape as the hours question above: an interrogative
      // plus a past-tense doing-verb is a journal read, and it outweighs the
      // today-pairing. "Ką šiandien turiu padaryti" has no past-tense verb
      // and still reads the day.
      // The interrogative is WORD-BOUNDED on both sides. Folded, "ką" is
      // "ka" — an unbounded alternative matches inside "va|ka|r", so
      // "vakar dirbau 8 valandas" (a plain work log) was pulled into the
      // journal read. The boundary is what makes this a question test.
      p(
        "\\b(ką|what|что|was|wat)\\b\\s*.{0,24}(dariau|dirbau|dirbome|nuveikiau|did\\s+i\\s+do|делал|сделал|gemacht|getan|gedaan|gewerkt|gearbeitet)",
        7,
      ),
    ],
  },
  {
    intent: "figures",
    patterns: [
      // "approved hours" is the owner's phrasing; the product records
      // CONFIRMED entries, and the workflow says so rather than inventing a
      // number. Recognising the question is what lets it answer honestly.
      p(
        "(patvirtint|approved|confirmed|подтвержд|bestätigt|bevestigd)\\s*.{0,18}(valand|hour|час|įraš|entr|запис|stunden|uren|uur)",
        5,
      ),
      p("\\bataskait", 4),
      p("\\breport\\b", 4),
      p("(отчёт|отчет)", 4),
      p("(bericht|rapport)", 3),
    ],
  },
  {
    /**
     * THE PROJECTS RESULT, ASKED FOR IN WORDS (chat-first audit gap G8).
     *
     * "Mano projektai" / "show my projects" used to route to `open-project`,
     * whose nameless branch answers with a TEXT list ("which project?") —
     * while the `projects` chip two centimetres away opened the real panel
     * with one chip per project. Same request, two paths, the typed one
     * weaker. These sentences now reach the SAME `startProjects` handler the
     * chip runs — one projects engine, one result surface.
     *
     * `open-project` keeps the OPEN verbs and the named/this-project reading:
     * naming a project is a targeted open, listing them is this.
     */
    intent: "projects",
    patterns: [
      p("(parodyk|rodyk|show|list|покажи|zeig|toon|laat)\\s*.{0,15}(projekt|project|проект)", 6),
      p("(mano|my|мои|meine|mijn)\\s+(projekt|project|проект)", 6),
      p("(kur|where\\s+are|где|wo\\s+sind|waar\\s+zijn)\\s*.{0,10}(projekt|project|проект)", 5),
      // Bare plural — LT projektai/projektus + DE Projekte(n).
      p("\\bprojekt(ai|us|ų|uose|e|en)\\b", 3),
      p("\\bproject(s|en)\\b", 3), // en + nl projecten
      p("\\bпроект(ы|ов|ах)\\b", 3),
    ],
  },
  {
    intent: "open-project",
    patterns: [
      // `projekt` is the LT/DE stem and `project` the EN/NL spelling — both
      // are needed, or "Open this project" silently classifies as unknown.
      p("(atidaryk|atidaryti|atverk|open|открой|öffne)\\s*.{0,15}(projekt|project|проект)", 5),
      p("(šį|šitą|this|этот|dit|dieses)\\s+(projekt|project|проект)", 4),
      // "Kas vyksta mano objekte?" — an OBJEKTAS is a project in this
      // product, and the sentence is a QUESTION about it. It used to reach
      // log-work on the bare `objekt` stem (weight 1) and open the work-log
      // flow: the person asked what is happening and was handed a form to
      // write down hours. Asking about a site is opening it. The "kas vyksta"
      // prefix is required, so "dirbau objekte" still records work.
      p(
        "(kas\\s+vyksta|kas\\s+naujo|what.{0,12}(happening|going\\s+on)|что\\s+происходит|was\\s+passiert|wat\\s+gebeurt)\\s*.{0,20}(objekt|statyb|projekt|project|объект|проект)",
        6,
      ),
    ],
  },
  {
    /**
     * CANDIDATE REVIEW, ASKED FOR IN WORDS (chat-first audit gap G8).
     *
     * The `candidates` chip runs `startEmployerCandidates` — the employer's
     * real demands, then the scouting panel at the chosen demand's depth. But
     * the TYPED sentence "show my candidates" carried the candidate stems in
     * `find-workers` and ran a different engine: same request, two paths.
     * The candidate word — in every launch locale — means the review surface,
     * so it lives here now and routes to the SAME handler the chip runs.
     */
    intent: "candidates",
    patterns: [
      p("\\bkandidat", 6), // lt kandidatai / de Kandidaten / nl kandidaten
      p("кандидат", 6), // ru
      p("\\bcandidates?\\b", 6), // en
      p("(bewerber|sollicitant)", 5), // de Bewerber / nl sollicitanten
      // "who is waiting (on my need)" — the employer's other way to ask.
      // Deliberately NO Lithuanian "kas laukia" here: it usually means "what
      // awaits (me)" — a day question, not a hiring one.
      p("(who\\s+is\\s+waiting|wer\\s+wartet|wie\\s+wacht|кто\\s+(ждет|ожидает))", 4),
    ],
  },
  {
    // Scouting the SUPPLY side — deliberately NOT the same as employer demand
    // intake. "reikia darbuotojų" / "ieškau darbuotojų" stay `need-workers`
    // (the product decided that already, and a guard pins it); this fires on
    // an explicit SEARCH-FOR-PEOPLE framing. The bare candidate NOUN moved to
    // `candidates` (G8): naming candidates asks to REVIEW them, not to scout.
    intent: "find-workers",
    patterns: [
      p("(find|search\\s+for|show|list)\\s+(me\\s+)?(the\\s+)?(workers|people)", 6),
      // The gap between the verb and the noun was 12 characters, which fits
      // "man " but not an adjective: "parodyk tinkamiausius žmones šitam
      // darbui" — the employer's most natural way to ask — put 15 characters
      // between "parodyk" and "žmones" and classified as `unknown`. One
      // qualifier is normal speech, so the window holds one.
      // …and the noun stem was `žmoni`, which does not occur in "žmones" —
      // the ordinary plural. Only "žmonių"/"žmonėms" ever matched, so the
      // most natural phrasing missed on the stem as well as on the gap.
      p("(surask|parodyk|rodyk|peržiūrėk)\\s*.{0,24}(darbuotoj|žmon)", 6),
      p("(найди|покажи)\\s*.{0,24}(работник)", 6),
      // The imperative SHOW/FIND framing in DE/NL — scouting, exactly like
      // "surask darbuotojų". "Wir brauchen/zoeken Mitarbeiter" (a NEED) stays
      // in `need-workers` via the worker-noun stems there.
      p("(finde|zeig)\\s*.{0,24}(arbeiter|leute|mitarbeiter)", 6), // de
      p("(vind|toon|laat)\\s*.{0,24}(arbeiders|mensen|vakmensen|werkers)", 6), // nl
      p("\\bscouting\\b", 4),
    ],
  },
  {
    /**
     * "Kas vyksta mano įmonėje?" — the owner named this sentence and it
     * scored 0 on every rule, so the product's own operator asking about
     * their own company got the not-understood menu.
     *
     * It resolves the way `admin-approvals` does: a hint plus ONE chip to the
     * canonical screen that already answers it (/dashboard/company). Chat is
     * a navigation layer over the same product, not a second company view —
     * so no new surface, no new read model, and no new strings (the chip
     * label `chipCompanyHub` already exists in all eleven locales).
     *
     * The company noun is REQUIRED, so "kas vyksta mano objekte" still opens
     * the project and "kas šiandien pasikeitė" still reads the day.
     */
    intent: "company-overview",
    patterns: [
      p(
        "(kas\\s+vyksta|kas\\s+naujo|what.{0,12}(happening|going\\s+on)|что\\s+происходит|was\\s+passiert|wat\\s+gebeurt)\\s*.{0,20}(įmon|organizacij|company|компани|firma|unternehmen|bedrijf)",
        6,
      ),
      p(
        "(kaip\\s+sekasi|how\\s+is|wie\\s+geht\\s+es|wie\\s+läuft|hoe\\s+gaat\\s+het)\\s*.{0,16}(įmon|company|компани|firma|unternehmen|bedrijf)",
        5,
      ),
    ],
  },
  {
    /**
     * START an organization — the opposite direction from `company-overview`.
     *
     * WHY THIS EXISTS. "Sukurk įmonės profilį" — the owner's own example
     * sentence — carried the word `profil`, so it scored 2 on the `profile`
     * rule and opened the person's PERSONAL profile form. Somebody asking to
     * create a company was handed a form about themselves, and no wording of
     * the request could escape it: no rule in this table meant "create an
     * organization" at all.
     *
     * Weight 6 on the verb+noun combination (never on the noun alone) so it
     * beats `profile` (2) for that sentence while a bare "įmonė" mention —
     * "kas vyksta mano įmonėje" — still reaches `company-overview`. A CREATE
     * verb is required: naming a company is not asking to make one.
     *
     * The verb list is deliberately NARROW. A first cut also accepted `open`
     * and `add`, which turned "Open my company" and "Add a person to the
     * company" into requests to create a second organization — the hub and
     * the assignment step, both hijacked. `start` is kept only when a company
     * noun follows it directly ("start a company"), never on its own.
     */
    intent: "create-organization",
    patterns: [
      // verb -> noun: "sukurk imone", "create a company", "sozdat kompaniyu"
      p(
        "(sukur|uzregistruo|registruo|isteig|pradėti(?=\\s+versl)|noriu\\s+sukurti|create|register|set\\s+up|start(?=\\s+a?\\s*(company|business|firm))|создать|создай|создам|зарегистрир|aanmaken|oprichten|registreren|erstellen|anlegen|gründen)\\s*.{0,24}(įmon|organizacij|firm|bendrov|versl|company|organisation|organization|business|компани|организаци|фирм|bedrijf|unternehmen)",
        6,
      ),
      // noun -> verb: "imone sukurti", "bedrijf aanmaken", "Firma anlegen"
      p(
        "(įmon|organizacij|firm|bendrov|versl|company|organisation|organization|business|компани|организаци|фирм|bedrijf|unternehmen)\\w*\\s*.{0,24}(sukurti|uzregistruoti|įsteigti|create|register|aanmaken|oprichten|registreren|erstellen|anlegen|gründen|создать|зарегистрировать)",
        6,
      ),
    ],
  },
  // ── AGENCY vocabulary (real recruiter pilot, 2026-09-04) ──────────────────
  // Verb + noun, weighted 8 so the bare stems the older rules carry
  // (`kandidat` 6 in `candidates`, `darbuotoj` 4 in `need-workers`, `offer` 3
  // in `offers`) never outrank an explicit agency act. LT/EN/RU/NL/DE, the
  // five routed locales; every pattern is folded like the sentence, so
  // "pakviesti klienta" typed without diacritics lands identically.
  {
    intent: "invite-client",
    patterns: [
      // verb → client: "noriu pakviesti klientą", "pridėti klientą", "noriu
      // prijungti įmonę kaip klientą", "invite a client", "Kunden einladen",
      // "klant uitnodigen", "пригласить клиента"
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|prijung|prisijung|add|invite|connect|onboard|einlad|hinzuf|verbind|uitnodig|toevoeg|koppel|приглас|добав|подключ)\\w*\\s*.{0,30}(klient|client|kunde|klant|užsakov|клиент|заказчик)", 8),
      // client → verb: "klientą pakviesti", "Kunde hinzufügen", "клиента добавить"
      p("(klient|client|kunde|klant|užsakov|клиент|заказчик)\\w*\\s*.{0,24}(pakvies|kviest|prijung|prid[eė]t|invite|add|einlad|hinzuf|uitnodig|toevoeg|приглас|добав)", 8),
    ],
  },
  {
    intent: "invite-candidate",
    patterns: [
      // "pakviesk darbuotoją / kandidatą", "pridėti darbuotoją į komandą",
      // "invite a worker", "Mitarbeiter einladen", "medewerker uitnodigen",
      // "пригласить работника"
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|prijung|add|invite|einlad|hinzuf|uitnodig|toevoeg|приглас|добав)\\w*\\s*.{0,30}(kandidat|darbuotoj|specialist|worker|employee|candidate|mitarbeiter|arbeiter|medewerker|werknemer|kandida|работник|сотрудник|кандидат)", 8),
      // "į komandą" / "to the team" / "zum Team" / "aan het team" / "в команду"
      p("(pakvies|pakviesk|kviesk|prid[eė]|add|invite|einlad|uitnodig|приглас|добав)\\w*\\s*.{0,24}(į\\s+komand|komandos\\s+nar|to\\s+(the\\s+)?team|team\\s+member|zum\\s+team|aan\\s+het\\s+team|в\\s+команд)", 8),
      // noun → verb (DE/NL word order, LT object-first): "Mitarbeiter
      // einladen", "medewerker uitnodigen", "darbuotoją pakviesti"
      p("(kandidat|darbuotoj|worker|employee|candidate|mitarbeiter|arbeiter|medewerker|werknemer|kandida|работник|сотрудник)\\w*\\s*.{0,20}(pakvies|kviest|prid[eė]t|invite|einlad|hinzuf|uitnodig|toevoeg|приглас|добав)", 8),
    ],
  },
  {
    intent: "client-demand",
    patterns: [
      // "kliento poreikis", "klientų užklausos", "client demand / requests",
      // "Kundenbedarf", "aanvraag van de klant", "запрос клиента"
      p("(klient|client|kunde|klant|užsakov|клиент|заказчик)\\w*\\s*.{0,24}(poreik|užklaus|paklaus|demand|need|request|order|bedarf|anfrage|auftrag|aanvra|vraag|behoefte|потребн|запрос|заявк)", 7),
      p("(poreik|užklaus|demand|request|bedarf|anfrage|aanvra|запрос)\\w*\\s*.{0,24}(klient|client|kunde|klant|užsakov|клиент|заказчик)", 7),
      // "pasidalinti poreikiai" / "shared requests" — what the client let the
      // agency see, in the client's own words for it.
      p("(pasidalin|pasidalyt|shared|geteilt|gedeeld|поделил)\\w*\\s*.{0,20}(poreik|užklaus|request|demand|need|bedarf|anfrage|aanvra|запрос)", 7),
      // "what did the client share" / "ką klientas pasidalino" — the client as
      // the subject of sharing, no request noun in the sentence.
      p("(klient|client|kunde|klant|užsakov|клиент)\\w*\\s*.{0,20}(share|dalin|dalij|teilt|geteilt|deelt|gedeeld|подел)", 7),
    ],
  },
  {
    intent: "propose-candidate",
    patterns: [
      // "pasiūlyk kandidatą", "siūlyti darbuotoją", "propose a candidate",
      // "Kandidaten vorschlagen", "kandidaat voorstellen", "предложить кандидата"
      p("(pasiūl|siūl|propose|offer|suggest|put\\s+forward|vorschlag|schlage|voorstel|voordragen|предлож|предлага)\\w*\\s*.{0,24}(kandidat|darbuotoj|žmog|specialist|worker|candidate|person|mitarbeiter|kandida|medewerker|работник|кандидат)", 8),
      // noun → verb: "Kandidaten vorschlagen", "kandidaat voorstellen",
      // "kandidatą pasiūlyti", "кандидата предложить"
      p("(kandidat|darbuotoj|worker|candidate|mitarbeiter|kandida|medewerker|работник|кандидат)\\w*\\s*.{0,20}(pasiūl|siūl|propose|vorschlag|voorschlag|voorstel|voordrag|предлож)", 8),
    ],
  },
  {
    intent: "proposal-status",
    patterns: [
      // "pasiūlymų būsena", "kaip sekasi mano pasiūlymams", "proposal status",
      // "Stand der Vorschläge", "status van mijn voorstellen", "статус предложений"
      p("(pasiūlym|proposal|offer|vorschl|voorstel|предлож)\\w*\\s*.{0,20}(būsen|status|eig|progress|stadij|stand|состоян|статус)", 7),
      p("(būsen|status|статус|stand)\\w*\\s*.{0,20}(pasiūlym|proposal|offer|vorschl|voorstel|kandidat|candidate|предлож|кандидат)", 7),
      p("(kaip\\s+sekasi|how\\s+(are|is)\\s+.{0,12}(going|doing)|wie\\s+steht|hoe\\s+staat|как\\s+(идут|дела))\\s*.{0,24}(pasiūlym|kandidat|proposal|candidate|offer|vorschl|kandida|предлож|кандидат)", 7),
    ],
  },
  // ── STUDENT / EDUCATION INSTITUTION (route-class) ─────────────────────────
  {
    intent: "learning-compass",
    patterns: [
      p("(mokymosi|learning|lern|leer|обучени|учебн)\\w*\\s*.{0,10}(kompas|compass|kompass|компас)", 8),
      p("\\b(kompas|compass|kompass|компас)", 5),
    ],
  },
  {
    intent: "invite-student",
    patterns: [
      // "pakviesk studentą / mokinį", "invite a learner", "Schüler einladen",
      // "student uitnodigen", "пригласить студента"
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|invite|add|einlad|hinzuf|uitnodig|toevoeg|приглас|добав)\\w*\\s*.{0,24}(student|mokin|besimokan|learner|studier|schüler|leerling|студент|учащ|ученик)", 8),
    ],
  },
  {
    intent: "programmes",
    patterns: [
      // "sukurk programą", "nauja grupė / kohorta", "create a cohort",
      // "Programm anlegen", "nieuwe opleiding", "создать программу"
      p("(sukur|kurti|prid[eė]|nauj|create|new|add|erstell|anleg|maak|nieuw|создать|создай|нов)\\w*\\s*.{0,20}(program|kurs|grup|kohort|cohort|kursus|opleiding|программ|курс|групп|когорт)", 7),
      p("(mano|mūsų|my|our|meine|unsere|mijn|onze|мои|наши)\\s+(program|kurs|grup|kohort|cohort|opleiding|программ|курс|групп|когорт)", 6),
    ],
  },
  {
    intent: "context",
    patterns: [
      p("(ką\\s+tu\\s+(apie\\s+mane\\s+)?žinai|what\\s+do\\s+you\\s+know|что\\s+ты\\s+знаешь)", 5),
      // de "Was weißt du über mich?" (also typed "weisst") / nl "Wat weet je
      // over mij?"
      p("(was\\s+wei(ß|ss)t\\s+du|wat\\s+weet\\s+je)", 5),
      p("(kokiame\\s+kontekst|current\\s+context|мой\\s+контекст|mein\\s+kontext|mijn\\s+context)", 4),
      p("(kur\\s+aš\\s+dabar\\s+esu|where\\s+am\\s+i\\s+now)", 4),
    ],
  },
  {
    // ONE ACTIVE CONTEXT (chat-first audit 2026-08-30, gap G1). The state
    // every other answer resolves against — personal space vs organization —
    // was the one piece of product state NO sentence could reach: "Perjunk į
    // Nonstop Group" fell to the generic fallback while a header dropdown two
    // centimetres away did exactly that. The router only classifies; the chat
    // surface resolves WHICH workspace against the caller's real,
    // membership-validated list and asks when the sentence is ambiguous.
    // Verbs are deliberately switching-specific ("perjunk", "переключи",
    // "wechsle zu") and the "work as X" family requires a ROLE noun, so a
    // profession statement ("dirbu kaip plytelių klojėjas") never routes here.
    intent: "switch-context",
    patterns: [
      p("(perjunk|persijunk|persijung|perjung)", 5), // lt — the switching verb itself
      p("(grįžk|grižk|grąžink)\\s+į\\s+(mano\\s+)?asmenin", 5), // lt — back to personal
      p("(dirbu|dirbk|veikiu|veik)\\s+(dabar\\s+)?kaip\\s+(įmon|darbuotoj|asmuo|organizacij)", 5),
      p("\\bswitch\\s+(me\\s+)?to\\b", 5), // en
      p("(change|set)\\s+(my\\s+)?(workspace|context)", 5),
      p("(go\\s+)?back\\s+to\\s+(my\\s+)?personal", 5),
      p("(work|act)\\s+as\\s+(a\\s+|an\\s+|the\\s+)?(company|employer|worker|person|organization)", 5),
      p("переключи(сь)?\\s+(меня\\s+)?(на|в)", 5), // ru
      p("верни(сь)?\\s+в\\s+личн", 5),
      p("(работа(ю|й|ть)|действуй)\\s+как\\s+(компани|работодател|работник|организаци)", 5),
      p("(schakel|wissel)\\s+(over\\s+)?naar", 5), // nl
      p("terug\\s+naar\\s+(mijn\\s+)?persoonlijk", 5),
      p("(wechsle|wechsel|wechseln)\\s+(zu|in|auf)", 5), // de
      p("zurück\\s+zu\\s+(meinem\\s+)?persönlich", 5),
      p("(arbeite|arbeiten|handle)\\s+als\\s+(firma|unternehmen|arbeitgeber|arbeitnehmer|organisation)", 5),
    ],
  },
  {
    // THE PRODUCT'S OWN CENTRAL NOUN. The worker board is literally called
    // "Man tinkamos galimybės", yet "galimybė" / "opportunity" appeared
    // NOWHERE in this table — so "kokias galimybes man gali pasiūlyti?"
    // scored 0 and fell through to the generic four-item fallback, which is
    // exactly the reply the owner audit recorded (defect E). A person must
    // never have to learn our internal wording to reach the board that
    // carries their matches. Routed to the SAME `runFindWork` workflow the
    // search sentence uses — one matching engine, one result surface.
    intent: "opportunities",
    patterns: [
      p("\\bgalimyb", 4), // lt — galimybė / galimybės / galimybių
      p("\\bopportunit", 4), // en
      p("возможност", 4), // ru
      p("\\bmöglichkeit", 4), // de
      p("(mogelijkhed|\\bkansen\\b)", 4), // nl
      p("\\bmuligheder\\b", 4), // da/no
      p("\\bvõimalus", 4), // et
      p("\\biespēj", 4), // lv
      p("\\bmożliwoś", 4), // pl
      // "what suits me / what is there for me" — the same question without
      // the noun. Deliberately NOT "tinkamus darbus", which is a SEARCH and
      // stays in find-work.
      p("(kas|ką)\\s+man\\s+tinka", 3),
      // Student value: an internship / apprenticeship / traineeship IS an
      // opportunity on the same board (opportunity_type is a declared value
      // on the demand) — the same engine answers, never a second one.
      p("(praktik|stažuot|stazuot|internship|apprentice|trainee|praktikum|ausbildung|\\bstage\\b|stagiair|стажир|практик)", 4),
      p("(what|which)\\s+.{0,12}(suits?|fits?)\\s+me", 3),
      p("что\\s+мне\\s+подходит", 3),
    ],
  },
  {
    // "Kas susidomėjo mano poreikiu?" — the employer's half of the interest
    // loop. Before this rule the sentence matched `need-workers` on the bare
    // stem `poreik` (weight 2) and OPENED THE DEMAND-CREATION FORM: an
    // employer asking who raised a hand was handed a blank new-demand form
    // (owner audit defect C). The interest stems outweigh that decisively.
    // Both sides say it: a worker asking the same thing gets their own board,
    // where "Mano susidomėjimai" carries the company's answer.
    intent: "interest-inbox",
    patterns: [
      p("susidomėj", 6), // lt — susidomėjo / susidomėjimas / susidomėjimų
      p("заинтересовал", 6), // ru
      p("(who|kas)\\s+.{0,24}(interested|responded)", 6),
      p("\\binterested\\s+in\\s+(my|our)\\b", 6),
      p("\\binteresse\\s+(an|für)\\b", 5), // de
      // de "Wer hat Interesse gezeigt?" / nl "Wie heeft interesse in mijn
      // aanvraag?" — the question form, both sides of the North Sea.
      p("(wer|wie)\\s+.{0,24}(interesse|geinteresseerd|belangstelling)", 6),
      p("(geinteresseerd|belangstelling)", 5), // nl — geïnteresseerd folds
      p("\\bshowed\\s+interest", 6),
      p("(kas|ar\\s+kas)\\s+.{0,24}(atsakė|atsiliepė)", 5),
    ],
  },
  {
    // THE SURFACES THAT MOVED MUST STILL BE REACHABLE IN WORDS.
    // Approvals, employee requests and leave limits now open on an explicit
    // ?area= instead of unrolling under every visit to /dashboard/network
    // (owner audit: "unacceptable information architecture"). Gating a surface
    // is only half the job — the owner named the other half in the same
    // breath: "Chat must also be able to route users to these functions
    // naturally". So the sentences that mean them route to them, through the
    // EXISTING `link:` chip, which navigates to the one canonical screen and
    // never grows a second view of it.
    intent: "admin-approvals",
    patterns: [
      p("(ką|ka)\\s+(tur(iu|ėsiu)|reikia)\\s*.{0,12}patvirtin", 6),
      p("\\bpatvirtin(ti|imai|imo|imus)\\b", 4),
      p("\\btvirtinim", 4),
      p("(what|which)\\s+.{0,16}(approve|approvals?)\\b", 6),
      p("\\bapprovals?\\b", 4),
      p("(что|чего)\\s+.{0,16}(утвердить|согласовать)", 6),
      p("согласован", 4),
      p("(laukianči(us|ų)|pending)\\s+(sprendim|decision)", 5),
      p("\\bfreigab", 4), // de
      p("genehmig", 4), // de — "Was muss ich genehmigen?" / Genehmigungen
      p("\\bgoedkeuring", 4), // nl
      p("goedkeuren", 4), // nl — the verb form "wat moet ik goedkeuren?"
    ],
  },
  {
    /**
     * IMPORTING a historical timesheet — deliberately ABOVE `timesheets`, and
     * on score, not on order.
     *
     * "Įkelk tabelį" carries the same timesheet noun as "parodyk tabelį", so
     * the reading that decides between them is the VERB: one asks to look at
     * the period documents, the other asks to feed a spreadsheet of past
     * hours into `work_hour_allocations`. Every pattern here therefore
     * REQUIRES an import/upload verb next to the document noun, weighted 8 so
     * it decisively outranks the bare-noun `timesheets` rule (5–6) — while
     * "parodyk mano tabelį", which has no such verb, cannot reach this rule at
     * all and still opens the timesheet area.
     */
    intent: "hours-import",
    patterns: [
      // lt — "įkelk tabelį", "importuok valandas iš excelio"
      p("(įkelk|įkelti|įkeliu|importuok|importuoti|suvesk\\s+iš)\\s*.{0,16}(tabel|žiniarašt|valand|excel|xlsx)", 8),
      // en — "import timesheet", "upload the hours spreadsheet"
      p("(import|upload)\\s*.{0,16}(time\\s?sheet|hours|excel|xlsx|spreadsheet)", 8),
      // ru — "загрузи табель", "импортируй часы из экселя"
      p("(загрузи|загрузить|импортир|выгруз)\\s*.{0,16}(табел|час|excel|xlsx|эксел)", 8),
      // de — both orders: "Stundenzettel importieren" / "importiere die Stunden"
      p("(stundenzettel|arbeitszeitnachweis|stunden|excel)\\w*\\s*.{0,16}(importier|hochlad|einles)", 8),
      p("(importier|lade|lese)\\s*.{0,20}(stundenzettel|arbeitszeitnachweis|stunden|excel)", 8),
      // nl — both orders: "urenstaat importeren" / "importeer de uren"
      p("(urenstaat|urenbriefje|uren|excel)\\w*\\s*.{0,16}(importeren|uploaden|inlezen)", 8),
      p("(importeer|upload|lees)\\s*.{0,20}(urenstaat|urenbriefje|uren|excel)", 8),
    ],
  },
  {
    // The timesheet document area — the period hour documents under
    // /dashboard/planning#timesheets. Same routing rule as the admin areas:
    // the sentence resolves to a `link:` chip to the ONE canonical surface,
    // never to a second view of it inside the chat.
    intent: "timesheets",
    patterns: [
      p("\\btabel(is|i|į|io|iu|y)", 5), // lt — tabelis / tabelį / tabeliai
      p("žiniarašt", 5), // lt — (darbo laiko apskaitos) žiniaraštis
      p("\\btime\\s?sheets?\\b", 6), // en — timesheet / time sheet
      p("табел", 5), // ru — табель / табеля / табели
      p("stundenzettel", 6), // de
      p("arbeitszeitnachweis", 6), // de — the formal word for the same document
      p("urenstaat", 6), // nl
      p("urenbriefje", 6), // nl
    ],
  },
  {
    /**
     * THE DAILY WORK-HOURS SCREEN (/dashboard/hours) — §9 chat-first coverage.
     *
     * A whole domain that only a URL could reach. The hard part is that the
     * hour NOUN is the most overloaded word in this product: it already means
     * "record what I did" (`log-work`), "how many hours did I work"
     * (`journal-recent`, weight 7) and "my confirmed hours" (`figures`). So no
     * pattern here fires on a bare hour word. Two shapes only:
     *
     *   * the unambiguous COMPOUND — "darbo valandos", "work hours",
     *     "рабочие часы", "Arbeitsstunden", "werkuren" — which no other rule
     *     reads, and
     *   * an OPEN verb pointing at an hour noun, weighted 4 so the more
     *     specific document rules above ("Öffne meinen Stundenzettel" → 6,
     *     "Open mijn urenstaat" → 6) keep their own sentences.
     *
     * "Kiek valandų dirbau šiandien?" therefore still reads the journal (7):
     * a QUESTION about recorded hours is a read of what was recorded, not a
     * request to open the entry screen.
     */
    intent: "work-hours",
    patterns: [
      p("darbo\\s+valand", 5), // lt
      p("valandų\\s+(apskait|suvestin)", 5), // lt — "valandų apskaita"
      p("\\bwork\\s*hours\\b", 5), // en
      p("(рабочие\\s+часы|рабочих\\s+часов|учет\\s+часов|учёт\\s+часов)", 5), // ru
      p("(arbeitsstunden|arbeitszeiten)", 5), // de
      p("(werkuren|urenregistratie)", 5), // nl
      // The OPEN framing, deliberately weaker than the document rules above.
      p("(atidaryk|atverk|open|открой|öffne)\\s*.{0,12}(valand|hour|час|stunden|uren|uur)", 4),
    ],
  },
  {
    /**
     * LEAVE & ABSENCE, the OVERVIEW half (/dashboard/absences) — §9.
     *
     * `admin-requests` already owns FILING a leave request and keeps every one
     * of its needles untouched. This is the other question a person asks about
     * the same domain and had no door at all: how much leave is left, and who
     * is away. Each pattern pairs the leave noun with a BALANCE or an
     * ABSENT-WHO reading and is weighted 8, so it wins over the bare leave
     * stems in `admin-requests` (5) for those sentences only — "Noriu pateikti
     * atostogų prašymą" matches nothing here and still opens the request area.
     */
    intent: "absences",
    patterns: [
      // lt — "Kiek atostogų dienų man liko?", "atostogų likutis"
      p("(kiek|liko)\\s*.{0,20}atostog", 8),
      p("atostogų\\s+(likut|balans|dien)", 8),
      p("(kas\\s+(šiandien\\s+)?(nedirba|atostogauja|serga))", 8),
      // en
      p("(leave|holiday|vacation)\\s+(balance|days\\s+left|entitlement)", 8),
      p("how\\s+(many|much)\\s*.{0,20}(leave|holiday|vacation)", 8),
      p("(who\\s+is\\s+(absent|away|off|on\\s+leave))", 8),
      p("\\babsences?\\b", 5),
      // ru
      p("(сколько)\\s*.{0,20}(отпуск|отгул)", 8),
      p("(остаток|баланс)\\s+отпуск", 8),
      p("кто\\s+(в\\s+отпуске|отсутствует|болеет)", 8),
      p("\\bотсутстви", 5),
      // de
      p("(urlaubskonto|urlaubstage|resturlaub|abwesenheit)", 6),
      p("wer\\s+ist\\s+(abwesend|krank|im\\s+urlaub)", 8),
      // nl
      p("(verlofsaldo|verlofdagen|vakantiedagen|afwezigheid)", 6),
      p("wie\\s+is\\s+(afwezig|ziek|met\\s+verlof)", 8),
    ],
  },
  {
    // The worker's half of the same engine: filing a request (leave, trip,
    // expense) rather than deciding one.
    intent: "admin-requests",
    patterns: [
      p("\\batostog", 5), // lt — atostogos / atostogų prašymas
      p("\\bprašym(ą|a|as|ai|ų)\\b", 4),
      p("(pateikti|parašyti|noriu)\\s*.{0,16}prašym", 6),
      p("\\bleave\\s+(request|application)", 6),
      p("\\b(holiday|vacation|time\\s*off)\\b", 5),
      p("\\bотпуск", 5),
      p("\\bзаявлени", 4),
      p("\\burlaub", 5), // de
      p("\\bverlof", 5), // nl
    ],
  },
  {
    /**
     * THE DOCUMENT CENTRE (/dashboard/documents) — §9 chat-first coverage.
     *
     * Named in the capability audit as one of the domains that was
     * "sentence-unreachable": contracts, certificates and identity documents
     * all live on one canonical screen, and the only way in was typing the
     * URL. The document word carries the whole signal in every active locale
     * and collides with nothing else in this table, so no verb is required —
     * naming your documents IS asking for them.
     */
    intent: "documents",
    patterns: [
      p("\\bdokument", 5), // lt dokumentai / de Dokumente
      p("\\bdocument", 5), // en documents / nl documenten
      p("\\bдокумент", 5), // ru
      // The things people actually keep there, when they name the thing
      // rather than the folder.
      p("(pažymėjim|sertifikat|certificate|zertifikat|certificaat)", 4),
      p("\\bсертификат", 4),
    ],
  },
  {
    /**
     * THE LABOUR-MARKET MAP (/dashboard/market-map) — §9 chat-first coverage.
     *
     * WHY EVERY PATTERN CARRIES THE MARKET WORD. `player-card` reads a bare
     * "Karte" / "kaart" / "card" (weight 7): "Zeig meine Karte" means the
     * person's own card, and it must keep meaning that. So the map is reached
     * through the COMPOUND the market is actually called by — Arbeitsmarkt-
     * karte, arbeidsmarktkaart, market map, карта рынка — weighted 8, which
     * beats the card rule for those sentences and cannot touch any other.
     * Lithuanian needs no compound: `žemėlapis` is a map and nothing else.
     */
    intent: "market-map",
    patterns: [
      p("žemėlap", 6), // lt
      p("(labour|labor|work|market)\\s*market\\s*map\\b", 8), // en
      p("\\bmarket\\s+map\\b", 8), // en
      p("карт(а|у|ы|е)\\s*.{0,16}(рынк|труд)", 8), // ru — "карта рынка труда"
      p("(arbeitsmarkt|markt)karte", 8), // de
      p("karte\\s+(des|vom)\\s+arbeitsmarkt", 8), // de
      p("(arbeidsmarkt|markt)kaart", 8), // nl
      p("kaart\\s+van\\s+de\\s+arbeidsmarkt", 8), // nl
    ],
  },
  {
    /**
     * THE UNIFIED ACTIVITY CENTRE (/dashboard/activity) — §9.
     *
     * Everything that wants the caller's attention, on one cross-module
     * screen fed by the notification spine — and no sentence could open it.
     *
     * THE GERMAN TRAP, measured: "Benachrichtigungen" CONTAINS "Nachrichten",
     * so `messages-view` (weight 6) matched "Zeig meine Benachrichtigungen"
     * and answered a request for notifications with the message thread. The
     * notification word is therefore weighted 7 in German specifically — the
     * longer, more specific word wins, and a plain "Zeig meine Nachrichten"
     * still opens messages because it never reaches this rule.
     */
    intent: "activity",
    patterns: [
      p("\\bpranešim", 5), // lt
      p("\\bnotification", 5), // en
      p("\\bуведомлени", 5), // ru
      p("\\bmelding", 5), // nl — bounded, so "aanmelding" is not a notification
      p("benachrichtigung", 7), // de — see the trap above
      p("(veiklos\\s+sraut|activity\\s+(centre|center|feed)|лента\\s+событ|activiteitencentrum|aktivitäten)", 5),
      p(
        "(ką\\s+reikia\\s+peržiūrėti|needs\\s+my\\s+attention|требует\\s+внимания|erfordert\\s+meine\\s+aufmerksamkeit|vraagt\\s+mijn\\s+aandacht)",
        6,
      ),
      // A bare "what's new?" with no company/project noun after it — the
      // rules above keep those, because they name what is being asked about.
      p("(kas\\s+naujo|what'?s\\s+new|что\\s+нового|was\\s+ist\\s+neu|wat\\s+is\\s+er\\s+nieuw)", 4),
    ],
  },
  {
    intent: "log-work",
    patterns: [
      // past-tense "worked" across LT/EN/RU/other launch stems
      p("\\bdirbau\\b", 3),
      p("\\bdirbome\\b", 3),
      p("\\bworked\\b", 3),
      p("работал", 3),
      p("\\bgewerkt\\b", 3), // nl
      p("\\bgearbeitet\\b", 3), // de
      // an explicit worked-time span "nuo 8 iki 17", "from 8 to 5", "с 8 до 17"
      p("\\bnuo\\s*\\d{1,2}\\D{0,4}iki\\s*\\d{1,2}", 3),
      p("\\bfrom\\s*\\d{1,2}\\D{0,4}to\\s*\\d{1,2}", 3),
      p("с\\s*\\d{1,2}\\D{0,4}до\\s*\\d{1,2}", 3),
      p("\\bvon\\s*\\d{1,2}\\D{0,4}bis\\s*\\d{1,2}", 3), // de "von 8 bis 17"
      p("\\bvan\\s*\\d{1,2}\\D{0,4}tot\\s*\\d{1,2}", 3), // nl "van 8 tot 17"
      // "8 valandas / hours / часов / Stunden / uur"
      p("\\d{1,2}\\s*(val\\.?|valand|hour|hrs?|час|stunden|std|uur|uren)", 2),
      // break / lunch minutes
      p("(pertrauk|pietūs|pietus|break|lunch|обед|перерыв)", 1),
      // "objekte / site / на объекте" — a work site
      p("(objekt|statyb|site|site\\b|стройк|объект)", 1),
      // explicit journal words. The LT stem was the only one here, so an
      // English "fill in my work journal" or a Russian "запиши работу в
      // журнал" fell through to the unknown fallback while the identical
      // Lithuanian sentence reached the flow — the journal was LT-only
      // through its own single intake. The other launch locales' words for
      // the journal belong here for the same reason.
      p("(žurnal|journal|журнал|tagebuch|dagboek)", 2),
      p("(įrašyk\\s+darb|log\\s+work|record\\s+work|записать\\s+работу)", 2),
      // ADDING work is recording it, not searching for it. "Pridėk šiandienos
      // darbą" scored 0 here and 1 on find-work (whose noun list holds a bare
      // "darbą"), so a person asking to write down what they did today was
      // answered with a JOB SEARCH — the opposite of the request, on the
      // product's most-used worker action. The add-verbs carry weight 4 so
      // the sentence cannot be pulled back by a bare noun match.
      p("(pridėk|pridėti|pridedu|įdėk|įtrauk)\\s*.{0,20}darb", 4),
      p("(add|enter)\\s*.{0,20}(work|hours)", 4),
      p("(добавь|добавить)\\s*.{0,20}(работ|час)", 4),
      // Same defect as the add-verbs above, one grammatical form further out:
      // "Įrašyti šiandienos darbą" is the INFINITIVE, and the imperative-only
      // `įrašyk\\s+darb` above demands adjacency, so the owner's own example
      // sentence for this workflow scored 0 here and 1 on find-work — a person
      // asking to write down today's work was handed a job search. Weight 4
      // for the same reason: a bare noun match must not pull it back.
      p("(įrašyti|įrašau|užfiksuo|užrašy|suvesti|fiksuoti)\\s*.{0,20}darb", 4),
      p("(record|log|enter)\\s*.{0,20}(work|day)", 4),
      p("(записать|записывать|зафиксир)\\s*.{0,20}(работ|день)", 4),
      // de "Arbeit/Stunden eintragen", nl "werk/uren invoeren|registreren" —
      // both noun→verb (the native order) and verb→noun.
      p("\\b(arbeit|stunden)\\b\\s*.{0,16}(eintragen|erfassen|notieren)", 4),
      p("(trage|erfasse|notiere)\\s*.{0,20}\\b(arbeit|stunden)\\b", 4),
      p("\\b(werk|uren)\\b\\s*.{0,16}(invoeren|registreren|noteren|vastleggen)", 4),
      p("(registreer|noteer|voer)\\s*.{0,20}\\b(werk|uren)\\b", 4),
    ],
  },
  {
    // V9 value-intent: a stated OFFER of value — goods to sell or free work
    // capacity. Kept SIMPLE on purpose (the structurer refines): strong sell
    // verbs, have+unit co-occurrence, free-days phrasing. Placed before
    // log-work/find-work so the specific reading wins ties; the weights make
    // it win on score anyway.
    intent: "offer-value",
    patterns: [
      p("parduo", 4), // parduodu / parduoti / noriu parduoti
      p("прода(м|ю|ем)", 4),
      p("\\bsell(ing)?\\b", 4),
      p("verkauf", 4), // de verkaufen / zu verkaufen / Verkauf
      p("(verkopen|verkoop|te\\s+koop)", 4), // nl
      p("\\bsiūlau\\b", 3),
      p("предлагаю", 3),
      p("\\bbiete\\b", 3), // de "ich biete …"
      p("\\bbied\\b|aanbieden", 3), // nl "ik bied … aan"
      p("\\bturiu\\b\\s*.{0,24}\\b(kg|vnt|tonn|litr|ha)", 4),
      p("\\bhave\\b\\s*.{0,24}\\b(kg|tonnes?|litres?|pieces)", 3),
      // "laisvas dienas" AND the counted form "laisvas trims dienoms" —
      // one intervening word allowed (V10: the equipment-availability
      // fixture routed `unknown` without it).
      p("laisv\\w{0,4}\\s+(?:\\S+\\s+)?dien", 3),
      p("\\bturiu\\b\\s*.{0,16}laisv", 3),
      // V10: a MACHINE stated free is an offer of its capacity.
      p("(ekskavator|krautuv|traktor|kran|pastoli|stakl|generator|kompresor|priekab|excavator|forklift|scaffold|экскаватор|погрузчик)\\w*.{0,16}(laisv|available|free|свободн)", 4),
      // V10: "galiu versti / suremontuoti" is an OFFER of a service — it must
      // outrank the translate-REQUEST intent ("išversk…" stays translate).
      p("(galiu|siulau|\\bcan\\b|могу)\\s+.{0,6}(vers|isvers|remontuo|taisy|projektuo|translat|repair|перевести|отремонтир)", 5),
      p("free\\s+days?", 3),
      p("(freie?\\s+tage|vrije\\s+dag(en)?)", 3), // de / nl free days
      p("\\b(habe|heb)\\b\\s*.{0,24}\\b(kg|stück|tonnen|liter|paletten|stuks)", 3),
      // `.{0,4}` (not \w): the Cyrillic inflection ("свободные") is outside
      // ASCII \w, and the folded text keeps Cyrillic letters as-is.
      p("свободн.{0,4}\\s+(день|дня|дней|дни)", 3),
    ],
  },
  {
    // Employer demand (rebuild W4): "I need WORKERS" must beat "I'm looking
    // for WORK" — the worker-plural stems carry the decisive weight, so
    // "ieškau darbuotojų" routes here while "ieškau darbo" stays find-work.
    intent: "need-workers",
    patterns: [
      p("darbuotoj", 4), // LT worker stem (darbuotojas/-ų/-o…)
      p("\\bworkers\\b", 4),
      p("работник", 4),
      p("сотрудник", 4),
      p("\\b(mitarbeiter|arbeiter|arbeitskräfte|fachkräfte)\\b", 4), // de
      p("\\b(medewerkers|personeel|arbeiders|arbeidskrachten|vakmensen)\\b", 4), // nl
      p("\\b(hire|hiring|recruit(ing|ment)?|staffing)\\b", 3),
      p("(нанять|наним|найм)", 3),
      p("\\beinstellen\\b", 3), // de "Leute einstellen"
      p("\\baannemen\\b", 3), // nl "mensen aannemen"
      p("\\breikia\\s+žmoni", 3), // "reikia žmonių"
      p("(darbuotojų\\s+)?poreik", 2), // "darbuotojų poreikis"
      p("\\bbrigad", 2), // team/brigade need
      // V9 audit finding: "kitą mėnesį trūks keturių suvirintojų" carried no
      // worker-plural stem and landed `unknown`. A SEEK VERB co-occurring
      // with an occupation stem (the most common WORK_TYPE_RULES needles) is
      // employer demand — while a bare "esu suvirintojas" (no seek verb)
      // deliberately stays out of this intent.
      // SOMEBODY TO WORK, WITHOUT NAMING A TRADE. "Reikia, kad kas nors
      // dirbtu sandelyje" carries no occupation stem and no worker-plural
      // stem, so it scored 0 on every rule and landed in the not-understood
      // fallback - on the demand-intake path that has produced nothing since
      // 13 July. The WORK verb is what makes it employment; `need-service`
      // deliberately holds no `dirb` stem, so the two cannot collide.
      p("(kas\\s+nors|kazkas|kas\\s+galetu)\\s*.{0,25}(dirbt|dirba)", 6),
      p("\\b(some(one|body))\\s+to\\s+work\\b", 6),
      p("(кто|кого)-нибудь\\s*.{0,25}(работа)", 6),
      p(
        "(reikia|reikės|trūks(ta)?|ieškau|ieškom(e)?|need(s|ed)?|looking\\s+for|нужн|ищем|требу(ется|ются)|brauch(e|en)?|benötig|suche(n)?|zoek(en)?|nodig)\\s*.{0,30}(suvirin|elektrik|santechnik|stali(aus|ų|u)|mūrinink|dažytoj|stogden|plytel|vairuotoj|krautuv|ekskavator|virėj|padavėj|valytoj|pakuotoj|rinkėj|slaug|welder|electrician|plumber|carpenter|painter|driver|cleaner|cook|сварщик|электрик|сантехник|водител|повар|уборщ|маляр|плотник|каменщик|schweißer|schweisser|klempner|maler|fahrer|koch|lasser|loodgieter|schilder|chauffeur|schoonmaker|kok\\b|tischler|timmerman)",
        6,
      ),
    ],
  },
  {
    /**
     * SOMEBODY TO DO A JOB — not somebody to fill a job (§33, services are
     * first-class).
     *
     * Measured before writing this: "Reikia, kad kas nors sutaisytų stogą",
     * "Reikia meistro rytoj suremontuoti dušą" and "Need someone to repair the
     * roof" all classified `unknown`, and "Ieškau, kas galėtų nuvalyti langus"
     * classified `find-work` — sending somebody who wants to HIRE a window
     * cleaner into a job search, the opposite direction.
     *
     * Every pattern binds an INDEFINITE AGENT to a WORK VERB in one regex
     * rather than scoring the two independently. That is deliberate: a bare
     * verb stem would fire on "šiandien taisiau stogą", which is a journal
     * entry, and additive scoring would have let it outrank `log-work`.
     *
     * No occupation stem appears here, so a sentence that NAMES a trade
     * ("reikia dviejų santechnikų") keeps scoring 6 on `need-workers` and is
     * untouched — employment intake is the one path that already works and
     * this must not quietly reroute it.
     */
    intent: "need-service",
    patterns: [
      // LT: "kad kas nors sutaisytu / kas galetu nuvalyti"
      p(
        "(kas\\s+nors|kazkas|kas\\s+galetu)\\s*.{0,25}(sutais|suremont|remontuo|taisyt|nuvalyt|valyt|dazyt|montuot|pajungt|pakeist|nupjaut|iskast)",
        6,
      ),
      // LT: "reikia meistro ..." - a handyman is the work, not a hire.
      p("\\breikia\\s+meistr", 5),
      // EN
      p(
        "\\b(need|looking\\s+for)\\s+(some(one|body)|a\\s+person)\\s+to\\s+(repair|fix|clean|paint|install|mount|replace|mow|move)",
        6,
      ),
      // RU
      p("(кто|кого)-нибудь\\s*.{0,25}(почин|отремонт|убра|покрас|устано)", 6),
      // NL
      p("\\biemand\\s*.{0,20}(repareren|schoonmaken|schilderen|installeren)", 6),
      // DE
      p("jemand(en)?\\s*.{0,20}(reparier|putz|streich|installier)", 6),
    ],
  },
  {
    intent: "find-work",
    patterns: [
      p("\\brask\\b", 3),
      p("\\bieškau\\b", 3),
      p("\\bieškok\\b", 3),
      p("(find|look(ing)?\\s+for)\\s+(me\\s+)?(a\\s+)?(job|work)", 3),
      // "I want work in Germany" — stating the GOAL, not issuing a command, is
      // how most people actually ask (W4: goals in words). Without these the
      // sentence classified as `unknown` and fell through to the fallback.
      p("\\bwant\\s+(to\\s+work|work|a\\s+job)", 3),
      p("\\bnoriu\\s+(dirbti|darbo)", 3),
      p("хочу\\s+(работать|работу)", 3),
      p("\\bwil\\s+werk", 3), // nl
      p("(ich\\s+)?(will|möchte)\\s+.{0,12}arbeit", 3), // de
      // de "Ich suche Arbeit / einen Job / eine Stelle" — the single most
      // common German job-seek sentence; nl "ik zoek werk / een baan".
      p("(ich\\s+)?suche\\s+.{0,12}(arbeit\\b|job\\b|stelle\\b)", 3),
      p("\\bzoek\\s+.{0,12}(baan|werk)\\b", 3),
      p("\\bbaan\\b", 1), // nl job noun
      p("\\bstelle\\b", 1), // de job noun
      p("найди", 3),
      p("ищу", 3),
      p("(darbo|darbą)\\b", 1),
      // "Surask man tinkamus darbus" scored 0: `\brask\b` does not fire
      // inside "surask", and the noun list covered only the singular
      // "darbo/darba". The employer-side stem is `darbuotoj`, which the
      // need-workers / find-workers rules weight far higher, so widening the
      // WORKER-side noun here cannot steal an employer sentence.
      p("\\bsurask\\b", 3),
      p("\\bdarb(us|ai|ų|ams|uose)\\b", 2),
      p("\\bjob\\b", 1),
      p("работу", 2),
      p("\\bvacancy|vacature|vakans", 1),
      // "in the Netherlands / country" — a search location
      p("(nyderland|olandij|netherland|holland|нидерланд|deutschland|germanij)", 1),
    ],
  },
  {
    // The Player Card, asked for in words (owner audit §5.1) — MUST outrank
    // `profile` and the work-card FORM intent: showing the card is a read,
    // not an edit. "kortel" alone is decisive; the save-work-card flow is
    // reached through its explicit chip, never through this sentence.
    intent: "player-card",
    patterns: [
      p(
        "(parodyk|rodyk|atidaryk|show|open|покажи|открой|zeig|toon|laat)\\s*.{0,14}(kortel|card\\b|карточк|karte\\b|kaart\\b)",
        7,
      ),
      p("(mano|my|моя|meine|mijn)\\s+(kortel|card\\b|карточк|karte\\b|kaart\\b)", 6),
      p("player\\s*card", 6),
      p("(darbuotojo|worker)\\s+(kortel|card\\b)", 5),
    ],
  },
  {
    // W6 slice 3D. Saying it is how the domain is REACHED — the answer is
    // always the person's real state (what is about them, what they submitted,
    // and which finished interactions they could describe). Saying "I want to
    // leave an experience" never conjures a form: it lists the real eligible
    // interactions, and the form belongs to one of those.
    intent: "experiences",
    patterns: [
      p("(patirt|experienc|опыт\\s+взаимодейств|ervaring|erfahrung)", 6),
      p("(palikti|parašyti|pateikti|leave|write|submit|оставить)\\s*.{0,14}(patirt|experienc|отзыв\\s+о\\s+взаимодейств)", 7),
      p("(patirtys|patirtis)\\s+(apie|about)\\s+(mane|me)", 7),
    ],
  },
  {
    /**
     * §7.1 — the work RELATIONSHIPS, asked for in words.
     *
     * This is how the domain is reached at all: the greeting is capped at
     * three starters (owner ruling §D) and both employer and worker slots are
     * already spent, so a sentence and a contextual chip are the two doors.
     *
     * WEIGHTED ABOVE `experiences`, deliberately. "Su kuo aš dirbu" and
     * "patirtys apie mane" are different questions, but "dirb…" stems are
     * everywhere in this product, so the decisive patterns here are the ones
     * that name the RELATIONSHIP or the ENDING of it — never a bare work stem,
     * which would steal `log-work`.
     *
     * Asking to end something never conjures a confirmation: the sentence
     * opens the LIST, and the confirmation belongs to one real row in it.
     */
    intent: "engagements",
    patterns: [
      p("(darbo\\s+santyk|work\\s+relationship|working\\s+relationship|рабочие\\s+отношени|werkrelatie|arbeitsbeziehung)", 7),
      p("(su\\s+kuo)\\s*.{0,14}(dirb)", 7),
      p("(kas)\\s+(pas\\s+mane|man)\\s+dirba", 7),
      // de "Mit wem arbeite ich?" / nl "Met wie werk ik?" — and the roster
      // question "wer arbeitet für uns / wie werkt er voor ons".
      p("(mit\\s+wem|met\\s+wie)\\s*.{0,14}(arbeit|werk)", 7),
      p("(wer\\s+arbeitet|wie\\s+werkt)\\s+(für|bei|voor|er\\s+voor)", 7),
      p("(who)\\s+(do\\s+i|am\\s+i)\\s+(work|working)\\s+(with|for)", 7),
      p("(who\\s+works\\s+for\\s+(us|me|this))", 7),
      p(
        "(baigti|nutraukti|užbaigti|end|terminate|завершить|прекратить|beende|beëindig)\\s*.{0,20}(darbo\\s+santyk|engagement|рабочие\\s+отношени|arbeitsbeziehung|werkrelatie)",
        8,
      ),
      p("\\bengagements?\\b", 6),
    ],
  },
  {
    // The Messages projection, asked for in words (owner audit §4.4: with
    // the tab row gone the conversation is how projections open). Outweighs
    // write-employer's weak "žinut" stem — SHOWING messages is not WRITING.
    intent: "messages-view",
    patterns: [
      p(
        "(parodyk|rodyk|atidaryk|open|show|покажи|открой|zeig|toon|laat)\\s*.{0,14}(žinut|messages?|сообщени|berichten|nachrichten)",
        6,
      ),
      p("(mano|my|мои|meine|mijn)\\s+(žinut|messages?|сообщени|nachrichten|berichten)", 5),
      p("(neperskaityt|unread|непрочитан|ungelesen|ongelezen)", 4),
    ],
  },
  {
    intent: "translate",
    patterns: [
      p("\\bišversk\\b", 3),
      p("\\bversti\\b", 2),
      p("\\btranslate\\b", 3),
      // Weight 4, not 3: "Vertaal dit bericht" must beat the figures rule's
      // bare (bericht|rapport) stem — a translation request names a message,
      // and the report stem must not steal it on a tie.
      p("übersetz", 4), // de
      p("vertaal|vertalen", 4), // nl
      p("переведи", 3),
      p("перевод", 2),
      p("\\bvertimą\\b", 2),
      p("(į|to|на)\\s+(olandų|nyderland|dutch|nederlands|немецк|anglų|english)", 1),
      p("(auf|ins|naar(\\s+het)?)\\s+(deutsch|englisch|niederländisch|nederlands|engels|duits|litouws)", 1),
    ],
  },
  {
    intent: "write-employer",
    patterns: [
      p("\\bparašyk\\b", 3),
      p("\\bparašok\\b", 2),
      p("(write|send|message)\\s+(to\\s+)?(this\\s+)?(employer|company|them)", 3),
      p("напиши", 3),
      // de "Schreib der Firma / dem Arbeitgeber", nl "Schrijf naar dit
      // bedrijf / de werkgever" — the message TARGET is required, so a bare
      // "schreiben" never claims unrelated sentences.
      p("(schreib|schrijf)\\s*.{0,24}(firma|unternehmen|arbeitgeber|bedrijf|werkgever)", 3),
      p("сообщение", 1),
      p("(šiai\\s+įmonei|darbdaviui|to\\s+the\\s+employer|работодател|dem\\s+arbeitgeber|de\\s+werkgever)", 2),
      p("\\bžinut", 1),
    ],
  },
  {
    intent: "reminder",
    patterns: [
      p("\\bprimink\\b", 3),
      p("\\bpriminim", 2),
      p("\\bremind\\b", 3),
      p("\\breminder\\b", 2),
      p("напомни", 3),
      p("напоминани", 2),
      p("erinner", 3), // de "erinnere mich" / Erinnerung
      p("herinner", 3), // nl "herinner me eraan" / herinnering
    ],
  },
  {
    intent: "calendar-view",
    patterns: [
      p("(kada|when|wann|wanneer).{0,20}(susitikim|meeting|pamain|shift|event|įvyk|termin|afspraak)", 3),
      p("\\bkalendor", 3),
      p("\\bcalendar\\b", 3),
      p("календар", 3),
      p("\\bkalender\\b", 3), // de / nl
      p("\\bagenda\\b", 2), // nl — the schedule itself
      p("(mano|šios savaitės|today'?s|this week'?s)\\s+(plan|tvarkaraš|schedule|расписани)", 2),
      // Context Intelligence (rebuild phase 3): "what do I have to do TODAY"
      // is the work-context readback, not a profile question. The pairing of
      // a question word / doing-verb with the TODAY word is the signal —
      // "šiandien dirbau…" (past tense, log-work) never matches these.
      p("(ką|what|что|was|wat).{0,30}(šiandien|today|сегодня|heute|vandaag)", 3),
      p("(šiandien|today|сегодня|heute|vandaag).{0,30}(padaryti|daryti|nuveikti|to\\s+do|сделать|делать|zu\\s+tun|te\\s+doen)", 3),
      p("(dienos|šiandienos)\\s+plan", 3),
      // TOMORROW. Every pattern here read TODAY or a bare "mano planas", so
      // "Parodyk mano rytojaus planą" — the owner's own example for this
      // workflow — matched nothing at all and reached the not-understood
      // fallback. The agenda reader already answers for any day; only the
      // word for the next one was missing.
      p("(rytoj|rytojaus|tomorrow|завтра|morgen|morgendlich)\\s*.{0,24}(plan|tvarkaraš|grafik|schedule|agenda|расписани|darb)", 3),
      p("(my|мой)\\s+(plan|план)\\b", 2),
      p("\\bmano\\s+planas\\b", 2),
      p("\\bsusitikim", 1),
      p("\\bmeeting\\b", 1),
      p("планы", 1),
    ],
  },
  {
    intent: "cv",
    patterns: [
      p("\\bcv\\b", 3),
      p("(gyvenimo\\s+apraš|curriculum|résumé|resume)", 3),
      p("резюме", 3),
      p("\\blebenslauf\\b", 3),
      p("(įkelk|upload|загрузи|прикрепи)\\s+.{0,10}(cv|резюме)", 2),
    ],
  },
  {
    intent: "profile",
    patterns: [
      p("\\bprofil", 2),
      p("\\bprofile\\b", 2),
      // Cyrillic `профиль` shares no letters with the Latin `profil`, so the
      // stem above could never reach it. Measured: "Покажи мой профиль"
      // classified as `unknown` while the LT and EN forms both resolved — a
      // Russian-speaking worker asking for their profile in the most ordinary
      // way got the generic fallback.
      p("профил", 2),
      p("profiel", 2), // nl — `profil` never reaches the ie-spelling
      p("\\bįgūd", 2),
      p("\\bskill", 2),
      p("навык", 2),
      p("(fähigkeit|vaardighed|competen)", 2), // de / nl skills
      p(
        "(pridėk|add|добавь|füge|voeg)\\s+.{0,12}(kalb|language|язык|patirt|experience|опыт|išsilavin|education|образовани|sprache|taal|erfahrung|ervaring|ausbildung|opleiding)",
        2,
      ),
      p("\\bkalb(a|ą|as|os)\\b", 1),
      p("\\blanguage", 1),
      p("\\b(sprache|taal)\\b", 1),
    ],
  },
  /**
   * LMC — the platform credit a person holds.
   *
   * DELIBERATELY DETERMINISTIC, and the reason is doctrine rather than thrift:
   * "how much LMC do I have" is a balance lookup. There is nothing for a model
   * to interpret, the answer comes from `lmc_account_balances`, and a regex
   * resolves it in every locale at zero cost and zero egress.
   *
   * WHY AN INTENT AND NOT JUST A SEARCH TERM. The command registry already
   * carries an `lmc_balance` entry, and it answers a SHORT query — "lmc",
   * "kiek turiu lmc". It is a search matcher, so a full sentence walks past it:
   * measured, "Parodyk mano LMC istoriją" and "How much LMC do I have?" both
   * matched nothing while the bare terms matched fine. Sentences are what
   * people type at a conversation, and the conversation had no LMC intent at
   * all — so the ledger was reachable by search and unreachable by asking.
   */
  {
    intent: "lmc",
    patterns: [
      // The unit itself is the strongest possible signal and is
      // language-invariant, which is exactly why it is not in the message
      // catalogue either.
      p("\\blmc\\b", 5),
      p(
        "(kiek|how\\s+much|сколько|wie\\s+viel|hoeveel)\\s*.{0,20}(kredit|credit|likut|balans|баланс|guthaben|saldo|krediet|tegoed)",
        4,
      ),
      p("(kredit|credit|likut|balans|баланс|guthaben|saldo|krediet|tegoed)\\s*.{0,20}(istorij|history|истори|verlauf|geschiedenis)", 4),
      p("(papildy|top\\s*up|пополн|auflad|opwaarder)", 4),
      // "what was I charged for" — the question a debited user actually asks.
      p(
        "(už\\s+ką|for\\s+what|за\\s+что|wofür|waarvoor)\\s*.{0,20}(nuskait|charg|списал|сняли|abgebucht|abgezogen|afgeschreven)",
        5,
      ),
    ],
  },
  {
    intent: "offers",
    patterns: [
      p("\\bpasiūlym", 3),
      p("\\boffer", 3),
      p("\\bbooking\\b", 2),
      p("предложени", 3),
      p("angebot", 3), // de Angebot / Angebote
      p("(aanbieding|\\baanbod\\b)", 3), // nl
      p("(ką\\s+man\\s+siūlo|what.{0,8}offered|что.{0,8}предлага|was\\s+wird\\s+mir\\s+angeboten|wat\\s+wordt\\s+mij\\s+aangeboden)", 2),
    ],
  },
  {
    // MUST outrank `profile` and `find-work` for "kokie kriterijai …" — the
    // stems are weighted 4 so a criteria question with the word "paieškos"
    // (search) or "darbo" in it still lands here, not in find-work.
    intent: "criteria",
    patterns: [
      // Unbounded stems on purpose: NL compounds ("zoekcriteria") and DE
      // compounds ("Suchkriterien") glue the noun to the search word, so a
      // boundary would never fire there.
      p("kriteri", 4), // lt kriterijai / de Kriterien
      p("criteri", 4), // en criteria / nl (zoek)criteria
      p("критери", 4),
      p("(paieškos|search)\\s+(nustatym|settings|filtr)", 3),
      p("(such|zoek)(einstellung|instelling|filter)", 3), // de / nl compounds
      p("(pagal\\s+ką\\s+(man\\s+)?ieško)", 3),
      p("(what\\s+am\\s+i\\s+search(ing)?\\s+(by|with))", 3),
      p("(по\\s+каким\\s+(параметрам|критериям))", 3),
    ],
  },
  {
    intent: "next-action",
    patterns: [
      p("(ką\\s+dar|ką\\s+man).{0,20}(padaryti|daryti|reikia)", 3),
      p("(what|what'?s)\\s+(next|else|left|should\\s+i\\s+do)", 3),
      p("что\\s+(дальше|ещё|еще)\\b", 3),
      // de "Was soll/muss ich noch / als Nächstes tun?"
      p("was\\s+(soll|muss)\\s+ich\\s+(noch|als\\s+nächstes|jetzt)", 3),
      // nl "Wat moet ik nog / nu / hierna doen?"
      p("wat\\s+moet\\s+ik\\s+(nog|nu|hierna)", 3),
      p("\\bnext\\s+step", 2),
      p("\\bkitas\\s+žingsn", 2),
      p("(nächste(r)?\\s+schritt|volgende\\s+stap)", 2),
    ],
  },
  {
    intent: "resume",
    patterns: [
      p("(kur\\s+(aš\\s+)?sustojau|kur\\s+likau|kur\\s+baigiau)", 3),
      p("(where\\s+(did\\s+)?i\\s+(stop|leave\\s+off|left\\s+off))", 3),
      p("на\\s+чём\\s+я\\s+остановил", 3),
      p("wo\\s+(war|bin)\\s+ich\\s+(stehen|zuletzt)", 3), // de "…stehengeblieben"
      p("waar\\s+was\\s+ik\\s+(gebleven|gestopt)", 3), // nl
      p("\\bcontinue\\b", 1),
      p("\\btęsti\\b", 1),
      p("(weitermachen|verdergaan|doorgaan)", 1),
    ],
  },
];

/**
 * Classify a sentence into a single conversation intent. Returns `unknown`
 * (score 0) when nothing matched, so the caller can degrade to an honest
 * fallback + starter chips (never a fabricated action).
 */
export function classifyIntent(text: string): IntentMatch {
  // Folded to base letters so a sentence typed WITHOUT diacritics — the norm
  // on most keyboards — reaches exactly the same intent as one typed with
  // them. `fold` also lowercases.
  const q = fold(text ?? "");
  if (!q.trim()) return { intent: "unknown", score: 0, matched: [] };

  let best: IntentMatch = { intent: "unknown", score: 0, matched: [] };
  for (const rule of RULES) {
    let score = 0;
    const matched: string[] = [];
    for (const { re, weight } of rule.patterns) {
      if (re.test(q)) {
        score += weight;
        matched.push(re.source);
      }
    }
    // Strictly-greater keeps the earliest rule on ties, which encodes our
    // specificity ordering (log-work before find-work, etc.).
    if (score > best.score) best = { intent: rule.intent, score, matched };
  }
  return best;
}

/**
 * Does the sentence ASK for the Work Journal itself, rather than merely
 * mention work?
 *
 * WHY THIS EXISTS. `extractWorkLog` reports `hasSignal: false` for a sentence
 * that carries no date and no hours — which is true of every *request* ("O
 * žurnalo neužpildysi?", "Užpildyk darbo žurnalą"). The chat used to answer
 * every such sentence with the one clarify question, so a worker who asked for
 * the journal was told to state a day and a duration, and asking again got the
 * SAME sentence back. The journal was unreachable through the only intake the
 * product has (chat-first, owner audit §6.1): a real tester hit exactly this
 * loop.
 *
 * A request is not ambiguous — it is a decision. When the user names the
 * journal, the flow opens and collects the missing facts in its own fields;
 * the clarify question stays for a genuinely vague work mention ("dirbau"),
 * where the product really does not know what is being asked.
 *
 * Pure and diacritic-folded like the rest of this module, so "uzpildyk zurnala"
 * typed without diacritics behaves identically.
 */
const JOURNAL_REQUEST_PATTERNS: readonly RegExp[] = [
  // the journal named directly (LT žurnalas / EN journal / RU журнал /
  // DE Tagebuch / NL dagboek — the launch locales' own word)
  p("(zurnal|journal|журнал|tagebuch|dagboek)").re,
  // an imperative to record work, with no journal word ("įrašyk darbą")
  p("(irasyk|uzfiksuok|uzrasyk|log)\\s+(mano\\s+)?darb").re,
  p("(irasyti|irasau|uzfiksuoti|uzrasyti|suvesti|fiksuoti)\\s*.{0,20}darb").re,
  p("record\\s+(my\\s+)?work").re,
  p("записать\\s+работу").re,
];

export function isExplicitJournalRequest(text: string): boolean {
  const q = fold(text ?? "");
  if (!q.trim()) return false;
  return JOURNAL_REQUEST_PATTERNS.some((re) => re.test(q));
}
