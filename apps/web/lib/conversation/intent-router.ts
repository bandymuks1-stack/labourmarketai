/**
 * Conversation intent router — DETERMINISTIC (no LLM).
 *
 * The conversation-first control layer must work with the LLM entirely OFF
 * (doctrine §7 / brief §10): the deterministic layer alone has to cover CV,
 * profile, work-time, calendar, offers, message drafting, confirmations,
 * navigation and next-action. This module is that layer's front door: it maps a
 * free-text sentence to ONE conversation intent using weighted keyword/phrase
 * matching across the ACTIVE locales (LT / EN / RU) plus common variants of the
 * other launch markets.
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
  | "find-workers" // "surask darbuotojų" — scouting, NOT demand intake
  | "context" // "ką tu apie mane žinai?"
  | "opportunities" // "kokias galimybes man gali pasiūlyti?" — the OWN board
  | "interest-inbox" // "kas susidomėjo mano poreikiu?" — who raised a hand
  | "messages-view" // "parodyk žinutes" — open the human-messages projection
  | "player-card" // "parodyk mano kortelę" — the card as a chat projection
  | "experiences" // "palikti patirtį" / "patirtys apie mane" — W6 slice 3D
  | "engagements" // "su kuo dirbu" / "baigti darbo santykį" — §7.1
  // ── V9 value-intent: a stated OFFER of value (goods to sell, free
  //    capacity) — the structurer (lib/structuring/value-statement.ts)
  //    refines it; the router only opens the door. ─────────────────────────
  | "offer-value" // "turiu 30 kg agurkų ir noriu parduoti" / "turiu dvi laisvas dienas"
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
function fold(input: string): string {
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
    ],
  },
  {
    intent: "journal-recent",
    patterns: [
      p("(parodyk|rodyk|show|покажи)\\s*.{0,20}(žurnal|journal|дневник)", 5),
      p("(paskutin|latest|last|последн)\\s*.{0,18}(įraš|entr|запис)", 5),
      p("(mano|my|мой)\\s+(žurnal|journal|дневник)", 4),
      // A QUESTION about hours worked is a journal READ, not a log-work
      // intake. "Kiek valandų dirbau šiandien?" used to score log-work via
      // the bare past-tense verb and answered with the log-work template —
      // the assistant asking you to record the very thing it should be
      // reporting (owner visual acceptance P0-5). The interrogative +
      // hours/worked pairing outweighs log-work's verb+today signals.
      p("(kiek|how\\s+(many|much)|сколько)\\s*.{0,24}(valand|hour|час)", 7),
      p("(kiek|how\\s+(many|much)|сколько)\\s*.{0,24}(dirbau|dirbome|worked|работал)", 7),
    ],
  },
  {
    intent: "figures",
    patterns: [
      // "approved hours" is the owner's phrasing; the product records
      // CONFIRMED entries, and the workflow says so rather than inventing a
      // number. Recognising the question is what lets it answer honestly.
      p("(patvirtint|approved|confirmed|подтвержд)\\s*.{0,18}(valand|hour|час|įraš|entr|запис)", 5),
      p("\\bataskait", 4),
      p("\\breport\\b", 4),
      p("(отчёт|отчет)", 4),
      p("(bericht|rapport)", 3),
    ],
  },
  {
    intent: "open-project",
    patterns: [
      // `projekt` is the LT/DE stem and `project` the EN spelling — both are
      // needed, or "Open this project" silently classifies as unknown.
      p("(atidaryk|atidaryti|atverk|open|открой|öffne)\\s*.{0,15}(projekt|project|проект)", 5),
      p("(šį|šitą|this|этот)\\s+(projekt|project|проект)", 4),
      // ASKING TO SEE THEM IS THE SAME INTENT AS OPENING ONE. "Parodyk mano
      // projektus" / "mano projektai" / "show my projects" scored 0 and hit
      // the generic fallback (owner audit defect D) because only the OPEN
      // verbs were listed. `runOpenProject` already answers a nameless
      // request by listing the real candidates, and `listManagedProjects` is
      // RLS-scoped, NOT workspace-scoped -- so the answer spans every
      // organization the person may manage. Being in the personal space is
      // never a reason to tell somebody their projects do not exist.
      p("(parodyk|rodyk|show|list|\\u043f\\u043e\\u043a\\u0430\\u0436\\u0438|zeig)\\s*.{0,15}(projekt|project|\\u043f\\u0440\\u043e\\u0435\\u043a\\u0442)", 5),
      p("(mano|my|\\u043c\\u043e\\u0438|meine)\\s+(projekt|project|\\u043f\\u0440\\u043e\\u0435\\u043a\\u0442)", 5),
      p("\\bprojekt(ai|us|ų|uose)\\b", 3),
      p("\\bprojects\\b", 3),
      p("\\b\\u043f\\u0440\\u043e\\u0435\\u043a\\u0442(\\u044b|\\u043e\\u0432|\\u0430\\u0445)\\b", 3),
    ],
  },
  {
    // Scouting the SUPPLY side — deliberately NOT the same as employer demand
    // intake. "reikia darbuotojų" / "ieškau darbuotojų" stay `need-workers`
    // (the product decided that already, and a guard pins it); this fires on
    // an explicit SEARCH-FOR-PEOPLE framing, and on the word "candidates",
    // which never means anything else.
    intent: "find-workers",
    patterns: [
      p("\\bkandidat", 5),
      p("кандидат", 5),
      p("\\bcandidates?\\b", 5),
      p("(find|search\\s+for|show|list)\\s+(me\\s+)?(the\\s+)?(workers|people)", 6),
      p("(surask|parodyk|rodyk|peržiūrėk)\\s*.{0,12}(darbuotoj|žmoni)", 6),
      p("(найди|покажи)\\s*.{0,12}(работник)", 6),
      p("\\bscouting\\b", 4),
    ],
  },
  {
    intent: "context",
    patterns: [
      p("(ką\\s+tu\\s+(apie\\s+mane\\s+)?žinai|what\\s+do\\s+you\\s+know|что\\s+ты\\s+знаешь)", 5),
      p("(kokiame\\s+kontekst|current\\s+context|мой\\s+контекст)", 4),
      p("(kur\\s+aš\\s+dabar\\s+esu|where\\s+am\\s+i\\s+now)", 4),
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
      p("\\bshowed\\s+interest", 6),
      p("(kas|ar\\s+kas)\\s+.{0,24}(atsakė|atsiliepė)", 5),
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
      // "8 valandas / hours / часов"
      p("\\d{1,2}\\s*(val\\.?|valand|hour|hrs?|час)", 2),
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
      p("\\bsiūlau\\b", 3),
      p("предлагаю", 3),
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
      p("\\b(hire|hiring|recruit(ing|ment)?|staffing)\\b", 3),
      p("(нанять|наним|найм)", 3),
      p("\\breikia\\s+žmoni", 3), // "reikia žmonių"
      p("(darbuotojų\\s+)?poreik", 2), // "darbuotojų poreikis"
      p("\\bbrigad", 2), // team/brigade need
      // V9 audit finding: "kitą mėnesį trūks keturių suvirintojų" carried no
      // worker-plural stem and landed `unknown`. A SEEK VERB co-occurring
      // with an occupation stem (the most common WORK_TYPE_RULES needles) is
      // employer demand — while a bare "esu suvirintojas" (no seek verb)
      // deliberately stays out of this intent.
      p(
        "(reikia|reikės|trūks(ta)?|ieškau|ieškom(e)?|need(s|ed)?|looking\\s+for|нужн|ищем|требу(ется|ются))\\s*.{0,30}(suvirin|elektrik|santechnik|stali(aus|ų|u)|mūrinink|dažytoj|stogden|plytel|vairuotoj|krautuv|ekskavator|virėj|padavėj|valytoj|pakuotoj|rinkėj|slaug|welder|electrician|plumber|carpenter|painter|driver|cleaner|cook|сварщик|электрик|сантехник|водител|повар|уборщ|маляр|плотник|каменщик)",
        6,
      ),
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
      p("(parodyk|rodyk|atidaryk|show|open|покажи|открой)\\s*.{0,14}(kortel|card\\b|карточк)", 7),
      p("(mano|my|моя)\\s+(kortel|card\\b|карточк)", 6),
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
      p("(who)\\s+(do\\s+i|am\\s+i)\\s+(work|working)\\s+(with|for)", 7),
      p("(who\\s+works\\s+for\\s+(us|me|this))", 7),
      p("(baigti|nutraukti|užbaigti|end|terminate|завершить|прекратить)\\s*.{0,20}(darbo\\s+santyk|engagement|рабочие\\s+отношени)", 8),
      p("\\bengagements?\\b", 6),
    ],
  },
  {
    // The Messages projection, asked for in words (owner audit §4.4: with
    // the tab row gone the conversation is how projections open). Outweighs
    // write-employer's weak "žinut" stem — SHOWING messages is not WRITING.
    intent: "messages-view",
    patterns: [
      p("(parodyk|rodyk|atidaryk|open|show|покажи|открой)\\s*.{0,14}(žinut|messages?|сообщени|berichten|nachrichten)", 6),
      p("(mano|my|мои)\\s+(žinut|messages?|сообщени)", 5),
      p("(neperskaityt|unread|непрочитан)", 4),
    ],
  },
  {
    intent: "translate",
    patterns: [
      p("\\bišversk\\b", 3),
      p("\\bversti\\b", 2),
      p("\\btranslate\\b", 3),
      p("переведи", 3),
      p("перевод", 2),
      p("\\bvertimą\\b", 2),
      p("(į|to|на)\\s+(olandų|nyderland|dutch|nederlands|немецк|anglų|english)", 1),
    ],
  },
  {
    intent: "write-employer",
    patterns: [
      p("\\bparašyk\\b", 3),
      p("\\bparašok\\b", 2),
      p("(write|send|message)\\s+(to\\s+)?(this\\s+)?(employer|company|them)", 3),
      p("напиши", 3),
      p("сообщение", 1),
      p("(šiai\\s+įmonei|darbdaviui|to\\s+the\\s+employer|работодател)", 2),
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
    ],
  },
  {
    intent: "calendar-view",
    patterns: [
      p("(kada|when).{0,20}(susitikim|meeting|pamain|shift|event|įvyk)", 3),
      p("\\bkalendor", 3),
      p("\\bcalendar\\b", 3),
      p("календар", 3),
      p("(mano|šios savaitės|today'?s|this week'?s)\\s+(plan|tvarkaraš|schedule|расписани)", 2),
      // Context Intelligence (rebuild phase 3): "what do I have to do TODAY"
      // is the work-context readback, not a profile question. The pairing of
      // a question word / doing-verb with the TODAY word is the signal —
      // "šiandien dirbau…" (past tense, log-work) never matches these.
      p("(ką|what|что).{0,30}(šiandien|today|сегодня)", 3),
      p("(šiandien|today|сегодня).{0,30}(padaryti|daryti|nuveikti|to\\s+do|сделать|делать)", 3),
      p("(dienos|šiandienos)\\s+plan", 3),
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
      p("\\bįgūd", 2),
      p("\\bskill", 2),
      p("навык", 2),
      p("(pridėk|add|добавь)\\s+.{0,12}(kalb|language|язык|patirt|experience|опыт|išsilavin|education|образовани)", 2),
      p("\\bkalb(a|ą|as|os)\\b", 1),
      p("\\blanguage", 1),
    ],
  },
  {
    intent: "offers",
    patterns: [
      p("\\bpasiūlym", 3),
      p("\\boffer", 3),
      p("\\bbooking\\b", 2),
      p("предложени", 3),
      p("\\bangebot\\b", 2),
      p("(ką\\s+man\\s+siūlo|what.{0,8}offered|что.{0,8}предлага)", 2),
    ],
  },
  {
    // MUST outrank `profile` and `find-work` for "kokie kriterijai …" — the
    // stems are weighted 4 so a criteria question with the word "paieškos"
    // (search) or "darbo" in it still lands here, not in find-work.
    intent: "criteria",
    patterns: [
      p("\\bkriterij", 4),
      p("\\bcriteria\\b", 4),
      p("критери", 4),
      p("(paieškos|search)\\s+(nustatym|settings|filtr)", 3),
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
      p("\\bnext\\s+step", 2),
      p("\\bkitas\\s+žingsn", 2),
    ],
  },
  {
    intent: "resume",
    patterns: [
      p("(kur\\s+(aš\\s+)?sustojau|kur\\s+likau|kur\\s+baigiau)", 3),
      p("(where\\s+(did\\s+)?i\\s+(stop|leave\\s+off|left\\s+off))", 3),
      p("на\\s+чём\\s+я\\s+остановил", 3),
      p("\\bcontinue\\b", 1),
      p("\\btęsti\\b", 1),
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
  p("record\\s+(my\\s+)?work").re,
  p("записать\\s+работу").re,
];

export function isExplicitJournalRequest(text: string): boolean {
  const q = fold(text ?? "");
  if (!q.trim()) return false;
  return JOURNAL_REQUEST_PATTERNS.some((re) => re.test(q));
}
