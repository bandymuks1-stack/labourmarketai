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
import {
  OCCUPATION_STEM_SOURCE,
  OWN_PEOPLE_SOURCE,
  DURATION_UNIT_SOURCE,
  TRADE_STEM_SOURCE,
  PROFESSION_STATEMENT_ANCHOR_SOURCE,
  ROLE_NOUN_EXCLUSION_SOURCE,
  ROLE_SUFFIX_GENITIVE_SOURCE,
  ROLE_SUFFIX_INSTRUMENTAL_SOURCE,
  ROLE_SUFFIX_NOMINATIVE_SOURCE,
  SEEK_VERB_SOURCE,
} from "@/lib/structuring/role-label";
import { PRESENT_ACTIVITY_VERB_SOURCE } from "@/lib/structuring/value-statement";

export type ConversationIntent =
  | "log-work" // "šiandien dirbau nuo 8 iki 17" — record a work-journal entry
  // ── AVAILABILITY (window 6 follow-up, 2026-09-06): "galiu dirbti nuo
  //    spalio 1 d." was read as a search with no criteria. A stated date from
  //    which the person can work is the availability fact the work card
  //    holds; the sentence opens that door with the date already in it. ────
  | "availability"
  | "find-work" // "rask man darbą Nyderlanduose" — employer/opportunity search
  | "write-employer" // "parašyk šiai įmonei" — draft a human message
  | "translate" // "išversk žinutę į olandų kalbą" — translate text
  | "calendar-view" // "kada turiu kitą susitikimą?" — show the plan
  | "reminder" // "primink rytoj 8 val." — set a reminder
  | "cv" // "įkelk šį CV" / "parodyk mano CV"
  | "profile" // "pridėk kalbą / įgūdį / patirtį"
  | "offers" // "ką man siūlo" — incoming booking offers
  // ── ACCEPT BY SENTENCE (launch completion 2026-09-20, GREEN_COMPLETE):
  //    "priimu pasiūlymą" landed on the offers LIST and a bare "priimu"
  //    scored 0. The sentence now resolves to the ONE thing waiting (the
  //    proposed offer, or the pending invitation) and shows its existing
  //    accept card — the button stays the commitment; a sentence never
  //    performs the irreversible accept itself. ──────────────────────────
  | "accept-offer"
  | "need-workers" // "reikia darbuotojų" — employer demand intake (rebuild W4)
  | "criteria" // "kokie kriterijai pas mane nurodyti?" — search-criteria readback
  | "next-action" // "ką dar turiu padaryti?"
  | "resume" // "kur sustojau?"
  // ── AI workspace (W4): goals stated in words, executed as workflows ──────
  | "skill-gap" // "kokių įgūdžių man trūksta?"
  | "journal-recent" // "parodyk paskutinius žurnalo įrašus"
  // ── Work intelligence by sentence (issue #1689, owner lines 2–7): the
  //    questions the work-in-numbers section answers, asked in words. ──────
  | "journal-skill" // "kiek programavau?" / "kur naudojau programavimo įgūdį?"
  | "journal-skills-top" // "kokius įgūdžius naudoju daugiausia?"
  | "journal-activities-top" // "kokia veikla užima daugiausia mano laiko?"
  | "journal-confirmed" // "kas patvirtinta?"
  | "journal-growth" // "kur yra didžiausias augimo potencialas?" (owner line 8)
  | "figures" // "parodyk patvirtintas valandas" / "paruošk ataskaitą"
  | "open-project" // "atidaryk šį projektą"
  // ── G8 (chat-first audit 2026-08-30): the chip surfaces, reachable by
  //    sentence. Same handler as the chip — one engine, never a second path. ─
  | "projects" // "mano projektai" / "meine Projekte" — the projects result
  | "candidates" // "parodyk kandidatus" / "my candidates" — demand review
  | "find-workers" // "surask darbuotojų" — scouting, NOT demand intake
  | "need-service" // "reikia, kad kas nors sutaisytų stogą" — a JOB done, not a job
  | "context" // "ką tu apie mane žinai?"
  /**
   * "Ką galiu padaryti šioje paskyroje?" — WHAT CAN I ACHIEVE FROM HERE.
   *
   * Distinct from `context` ("what do you know about me" — state) and from
   * `next-action` ("ką dar TURIU padaryti" — obligation). This is CAN, and it
   * is the question a person asks when they do not yet know the product.
   *
   * WHY THIS ID HAS TO EXIST AT ALL. The sentence scored 0, so it fell to the
   * generic fallback — and the LLM proposer could not rescue it either,
   * because `llm-proposal.ts` re-validates the model's answer against
   * `INTENT_REGISTRY` and returns "not understood" for anything else. A
   * question with no id in this vocabulary is therefore unanswerable by BOTH
   * routers, forever. The id is the seam; the ANSWER is derived entirely from
   * the active context and the workspace's real state, and nothing about it
   * is written down here.
   */
  | "capabilities"
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
  | "my-team" // "parodyk mano komandą" — the people the speaker works with
  | "messages-view" // "parodyk žinutes" — open the human-messages projection
  | "invitations" // "mano kvietimai" — invitations addressed to me (4D)
  | "player-card" // "parodyk mano kortelę" — the card as a chat projection
  | "experiences" // "palikti patirtį" / "patirtys apie mane" — W6 slice 3D
  | "engagements" // "su kuo dirbu" / "baigti darbo santykį" — §7.1
  | "company-overview" // "kas vyksta mano įmonėje?" — the company hub
  | "create-organization" // "sukurk įmonę" — START one, not look at one
  // ── RENAME the ACTIVE organization (owner program 2026-09-23, CASE 3/4).
  //    "Pervadink šią agentūrą į Nonstop Group UAB." scored 0 on every rule
  //    in six locales, and the model proposer had no id to pick either — so
  //    the owner's rename request was answered with CV / profile / job chips.
  | "rename-organization" // "pervadink agentūrą į X" / "rename my company to X"
  | "lmc" // "kiek turiu LMC?" / "už ką buvo nuskaičiuota?" — the credit ledger
  // ── V9 value-intent: a stated OFFER of value (goods to sell, free
  //    capacity) — the structurer (lib/structuring/value-statement.ts)
  //    refines it; the router only opens the door. ─────────────────────────
  | "offer-value" // "turiu 30 kg agurkų ir noriu parduoti" / "turiu dvi laisvas dienas"
  // ── PROFESSIONAL LANGUAGE (window 6, 2026-09-06): the person names their
  //    profession or a past job — "esu buhalteris", "dirbu inžinieriumi",
  //    "dirbau projektų vadovu 5 metus". Measured on production: the first
  //    two answered nothing and the third opened the PROJECTS list. ────────
  | "profession-statement"
  // ── AGENCY (real recruiter pilot, 2026-09-04). The first real recruiter
  //    typed "noriu pakviesti klientą" and got the generic fallback: the
  //    agency's whole vocabulary was missing here, although the canonical
  //    actions (`agency.invite-client`, `agency.propose-candidate`) already
  //    existed behind the dashboard. Chat-first doctrine: the sentence IS the
  //    entry point; the workspace is the secondary view. ─────────────────
  // ── SUPPLY DIRECTION (owner window 7 §4, 2026-09-06). The market has TWO
  //    sides and this product only ever heard one of them. Measured on the
  //    real router before this rule existed, the owner's own example
  //    "Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose." resolved
  //    to `find-work` — a staffing agency with twenty welders was read as one
  //    person looking for a job. "Ieškome darbo savo darbuotojams" and "We
  //    have workers and we are looking for employers" resolved to
  //    `need-workers`, the exact inversion: WE HAVE read as WE NEED.
  //
  //    MAN REIKIA ↔ AŠ TURIU / GALIU. This is the second side.
  | "offer-capacity" // "turime 20 suvirintojų, ieškome jiems darbo" — capacity offered to the market
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
  | "create-project" // "sukurk projektą Roterdame" — the SITE as a project object (F2)
  | "agency-offers" // "kokius kandidatus pasiūlė agentūra?" — the client's side of the bridge
  | "agency-invites" // "agentūra mane pakvietė" / "pasidalink poreikiu su agentūra" — the client accepts a connection or shares a request
  | "propose-booking" // "pasiūlyti darbą kandidatui" — the direct employer's offer, by sentence, from the candidates panel
  | "add-document" // "turiu naują A1 iki 2027-03" — record a document, by sentence
  | "cv-export" // "atsisiųsk / išspausdink mano CV" — take the sheet OUT
  // ── THE CV IS FIVE DIFFERENT REQUESTS (owner window 11 §5/§30) ──────────
  //    VIEW ≠ UPLOAD ≠ IMPORT ≠ EDIT ≠ REPLACE ≠ GENERATE ≠ EXPORT. Measured
  //    2026-09-07 on this router: of 22 ordinary CV sentences only three
  //    reached `cv-export`; "noriu pamatyti savo CV", "atidaryk mano CV",
  //    "kur mano CV", "I want to see my CV", "открой моё резюме" and six more
  //    all scored 3 on the bare `\bcv\b` noun and landed on `cv` — the
  //    IMPORT flow. A person asking to SEE what the system holds was answered
  //    with "Įkelk savo CV." That is a read turned into a write, which §5
  //    forbids by name.
  | "cv-view" // "noriu pamatyti savo CV" — open the CV the product already holds
  | "cv-choose" // the CV named with no verb that separates the five — ASK, never guess
  // ── THE PHOTO SHOWN BACK (issue #1689, defect G). "Parodyk įkeltą
  //    nuotrauką, ar tikrai išsisaugojo" scored 0 — the router had no photo,
  //    file or gallery word at all — so the proposer picked the nearest CV
  //    door and the chat said the CV was empty about a photo that WAS
  //    stored. A read over the ONE personal-gallery projection. ──────────
  | "evidence-photos" // "parodyk įkeltą nuotrauką" / "did my photo save" — the stored work photos
  | "add-task" // "pridėk užduotį projektui …" — a work package, by sentence
  | "who-available" // "kas laisvas šią savaitę?" — capacity from the roster + absences
  | "stage-status" // "etapas pamatai baigtas" — a project stage moved to a real status
  | "move-worker" // "perkelk Joną į projektą Y" — a person between projects, what-if first
  | "task-status" // "užduotis sumontuoti pastolius atlikta" — a task moved to a real status (§14 RESULT)
  | "project-risk" // "kuris projektas rizikoje?" — every live project's real signals, most first
  | "project-readiness" // "kas trūksta projektui X?" — the people on a live project and what each still needs
  | "confirm-work" // "patvirtink Jono darbą" — the employer confirms a work entry; verified skills follow (§14)
  // THE WORKER'S SIDE OF THE SAME LOOP. "Kam pateikti atliktą darbą?" is not
  // a job search and not the employer's confirm command — it is a person
  // asking WHO CAN VERIFY the work they already did. Before this it scored 1
  // on `find-work`'s bare `(darbo|darbą)` and was answered with job adverts.
  | "who-verifies-work" // "kam pateikti atliktą darbą?", "kas gali patvirtinti mano darbą?"
  // ── EMPLOYER VISIBILITY (capability matrix P0, 2026-09-23). 57 of 59
  //    production workers were invisible to all supply matching because the
  //    profile-discoverability consent was reachable only through the
  //    profile's closed "More". "Kas mato mano profilį?" scored 0. The answer
  //    is the current state, read, then the EXISTING consent — never a write
  //    by sentence. ─────────────────────────────────────────────────────────
  | "employer-visibility" // "kas mato mano profilį?" / "make me visible to employers"
  | "unknown";

export type IntentMatch = {
  intent: ConversationIntent;
  /** Sum of matched pattern weights (0 when nothing matched). */
  score: number;
  /** The patterns that fired — surfaced for transparency + tests. */
  matched: string[];
};

type Pattern = {
  re: RegExp;
  weight: number;
  /**
   * "…unless the sentence also asks for work or for workers." Evaluated ONCE
   * per sentence by `classifyIntent`, not folded into the pattern.
   *
   * ── WHY THIS IS NOT A LOOKAHEAD (measured 2026-09-09) ──────────────────
   *
   * It used to be written inline, as
   * `^(?![^]*(?:SEEK_GUARD_SOURCE))[^]*?…`. That form is correct and very
   * expensive to WARM UP, in the exact case that matters: when the sentence
   * does NOT contain a seek verb, the lookahead has to walk the whole
   * alternation at every position of `[^]*` and fail at all of them — and
   * `SEEK_GUARD_SOURCE` contains `\b`, which `p()` expands into the long
   * `UNICODE_WORD_BOUNDARY` look-around group. A sentence WITH a seek verb
   * is fast, because the lookahead fails immediately.
   *
   * Measured on the FIRST `classifyIntent` call in a fresh process:
   *
   *   "ieškau darbo Norvegijoje"              1 ms  (seek verb → fails fast)
   *   "Parodyk ką šiandien turiu padaryti"  3937 ms  ← no seek verb
   *   "pakviesk studentą į programą"        1457 ms  ←
   *   "I am a welder"                       1017 ms  ←
   *
   * BE PRECISE ABOUT WHAT THIS COST IS, because the first reading of it was
   * wrong. It is cold-start regex compilation and JIT, NOT a per-message
   * price: the same three sentences measured 46/0.3/0.6 ms on the second
   * call and ~1/0.3/0.5 ms on the third. Steady-state classification is well
   * under a millisecond and always was, so there is no production latency
   * defect here and none is being claimed.
   *
   * What it DID break is test processes, which pay cold start once and get
   * 5 s. Three rules already carried the inline guard, so most of this cost
   * predates today (`main` measures 1857 ms for the first sentence);
   * extending it to the twelve availability patterns pushed three unrelated
   * unit tests over their timeout. A flag checked once means exactly the
   * same thing, restores the previous cold start, and removes the trap for
   * whoever adds the next guarded pattern.
   */
  noSeek?: true;
};
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
 *  the folded query) and each ASCII `\b` becomes the Unicode-safe boundary.
 *
 *  No `i` flag, by construction: `fold` lower-cases BOTH sides — this source
 *  here and every query in `classifyIntent` — so case-insensitivity adds
 *  nothing to a match. It did add cost: with `u`, an `i` pattern makes V8
 *  build the case-folding closure of every `\p{L}`/`\p{N}` class in the
 *  boundary, across ~600 patterns, on the first calls of every fresh
 *  process — about 2.8 s before the router answered at its normal 1–5 ms
 *  (measured 2026-09-24; 1.5 s without `i`). The chat pays that on its
 *  first sentences, and CI's intent suites timed out on it. */
function p(source: string, weight = 1): Pattern {
  return { re: new RegExp(fold(source).replace(/\\b/g, UB), "u"), weight };
}

/** `p()`, but the pattern only counts when the sentence is NOT also asking
 *  for work or for workers — see `Pattern.noSeek` for why this is a flag and
 *  not a lookahead. */
function pNoSeek(source: string, weight = 1): Pattern {
  return { ...p(source, weight), noSeek: true };
}

/**
 * Rule table. Ordered by specificity of the *signal*, not by intent priority —
 * scoring resolves overlaps (e.g. the word "darbas"/"work" appears in both
 * find-work and log-work; the PAST-TENSE verb + a TIME span tips it to
 * log-work, the SEEKING verb tips it to find-work).
 */
/**
 * A SENTENCE THAT ALSO SEEKS keeps its seek route. The statement-shaped
 * intents (profession, availability, present-tense activity) open with a
 * negative lookahead over these seek forms, so "esu buhalteris, ieškau darbo"
 * / "I am an accountant looking for work in Vilnius" / "Я бухгалтер, ищу
 * работу" / "Ik ben accountant en zoek werk" / "Ich bin Buchhalterin und
 * suche Arbeit" stay `find-work` — the search runs and the statement is read
 * beside it. One list for the three, all routed locales (lane F landing
 * examples, 2026-09-06).
 */
const SEEK_GUARD_SOURCE =
  // 2026-09-20: `szuka` / `poszukuj` / `potrzebuj` join the list for Polish —
  // "Jestem spawaczem, szukam pracy" must run the search exactly like its lt /
  // en / ru / nl / de twins do, instead of stopping at the self-introduction.
  "iesk|surask|\\brask\\b|noriu\\s+(?:dirbti|darbo)|reikia|truksta|looking\\s+for|\\bwant\\s+(?:a\\s+)?(?:job|work)|\\bneed\\b|ищу|ищем|хочу\\s+работ|нужн|\\bzoek|\\bsuche\\b|\\bbrauch|\\bszuka|\\bposzukuj|\\bpotrzebuj";

/**
 * AN OPTIONAL PLACE PHRASE, between a verb and the time word after it.
 *
 * "I can work IN GERMANY from Monday" — one sentence carrying both mobility
 * and availability, which is exactly how people state them together. Every
 * non-Lithuanian availability pattern required the time word to follow the
 * verb immediately, so naming the country silenced the whole rule (owner
 * readiness window 2026-09-09; the measurements are on the `availability`
 * rule below).
 *
 * A PLACE PHRASE, NOT A WILDCARD. It admits only a locative preposition plus
 * a token or two — `in Germany`, `в Германии`, `in Duitsland`. A bare
 * `.{0,20}` would have read "I can work WITH PEOPLE from Poland" as a stated
 * availability, which is a fluent wrong answer (§14) and the kind of quiet
 * over-match that turns a fix into the next regression.
 *
 * Prepositions only from the routed locales, and only ones that introduce a
 * PLACE: lt `-` (Lithuanian marks the locative in the ending, so no
 * preposition is needed — the LT patterns never had this problem), en
 * `in/at`, de `in/bei`, nl `in/bij`, ru `в/во/на`.
 */
const WHERE_GAP = "(?:(?:in|at|bei|bij|в|во|на)\\s+[^\\s]+\\s+){0,2}";

/** Does the sentence ask for work or for workers? Compiled once, tested once
 *  per `classifyIntent` call — the cheap half of what used to be an inline
 *  negative lookahead on every guarded pattern (`Pattern.noSeek`). */
const SEEK_GUARD_RE = new RegExp(
  fold(SEEK_GUARD_SOURCE).replace(/\\b/g, UB),
  "iu",
);

/**
 * The ORGANISATION nouns and CHANGE verbs the `rename-organization` rule binds
 * together, per locale. Stems, folded like every pattern source. `firm` is
 * word-bounded so "confirm" can never supply the noun.
 */
const RENAME_ORG_LT = "(įmon|organizacij|agentūr|bendrov|\\bfirm|kompanij|erdv)";
const RENAME_CHANGE_LT = "(pakei|keis|atnaujin|pataisy|nustaty|nurody|suteik|įrašyk)";
const RENAME_ORG_EN = "(company|organi[sz]ation|agency|business|\\bfirm|workspace)";
const RENAME_ORG_RU = "(компани|организаци|агентств|фирм)";
const RENAME_CHANGE_RU = "(смен|измен|помен|обнов|исправ|установ)";
const RENAME_ORG_NL = "(bedrijf|organisatie|bureau|firma|werkruimte)";
/** "bedrijfsnaam" / "de naam van mijn bedrijf" — the name bound to the org. */
const RENAME_NAMED_NL =
  "(bedrijfsnaam|organisatienaam|bureaunaam|naam\\s+van\\s+[^?]{0,24}(bedrijf|organisatie|bureau|firma))";
const RENAME_ORG_DE = "(firma|unternehmen|agentur|organisation|betrieb)";
/** "Firmenname" / "den Namen meiner Firma" — the name bound to the org. */
const RENAME_NAMED_DE =
  "(firmenname|unternehmensname|namen\\s+(der|des|meiner|meines|unserer|unseres|dieser|dieses)\\s+[^?]{0,20}(firma|unternehmen|agentur|organisation|betrieb))";
const RENAME_ORG_PL = "(\\bfirm|agencj|organizacj|sp[oó][lł]k)";

const RULES: IntentRule[] = [
  /**
   * ── SUPPLY DIRECTION — "AŠ TURIU / GALIU" (owner window 7 §4, 2026-09-06)
   *
   * FIRST, and weighted above every demand-side rule, because the words
   * overlap almost completely with them: a supply sentence contains "darbo",
   * "ieškome" and a profession exactly like a job search does, and contains
   * "turime" and a headcount exactly like a roster question does. Read one
   * word at a time it is indistinguishable; read as a whole it is the
   * opposite of both.
   *
   * THE DISCRIMINATOR IS THE SHAPE, NOT A KEYWORD: someone states that they
   * HAVE people (a count, or a word for people) AND that those people are
   * being offered to the market (work is sought FOR THEM, they are available,
   * or they are explicitly offered). Either half alone stays where it was —
   * "turiu patirties ir ieškau darbo" is still one person's job search, and
   * "Turime laisvų darbuotojų" with no count is still the employer's own
   * roster question (`who-available`).
   *
   * Deliberately NOT identity-gated here. The router is identity-blind by
   * design; a company that also supplies, and an agency that also hires, must
   * both be understood. The HANDLER decides what the sentence can do.
   */
  {
    intent: "offer-capacity",
    patterns: [
      // HAVE + (count | people) … SEEKING … WORK/EMPLOYER/PROJECT.
      // "Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose."
      // "We have workers and we are looking for employers."
      // "Мы имеем 20 сварщиков и ищем для них работу."
      // 2026-09-20 pl: `\bmam` (mam / mamy), `szuka` (szukam / szukamy) and
      // `prac` (pracy / pracę) — "Mamy 20 spawaczy i szukamy dla nich pracy."
      p(`(turim|turiu|disponuoj|have|hebben|haben|имеем|располага|\\bmam|posiadam)\\w*\\s*.{0,20}([0-9]{1,4}|${OWN_PEOPLE_SOURCE})\\w*\\s*.{0,40}(ieško|ieškau|ieškom|paieška|looking|search|seeking|zoek|such|szuka|poszukuj|ищем|ищу|reikia|nodig|brauch|potrzebuj|нужн)\\w*\\s*.{0,30}(darb|work|job|projekt|project|employer|užsakym|werk|opdracht|werkgever|arbeit|auftrag|arbeitgeb|prac|zlecen|работ|проект|заказ)`, 10),
      // SEEKING WORK **FOR OUR PEOPLE** — the possessive is what makes it
      // supply. "Ieškome darbo savo darbuotojams", "looking for work for our
      // people", "Arbeit für unsere Mitarbeiter".
      p(
        // THE SEEK VERB INCLUDES THE IMPERATIVE. "Rask projektą mūsų 12
        // žmonių brigadai" and "Find a project for our 12-person crew" are
        // how someone actually asks, and neither `rask`/`surask` nor `find`
        // was here — the first measured `find-work` (one person job-hunting)
        // and the second `unknown`. The possessive + own-people clause below
        // is what keeps this SUPPLY, so widening the verb cannot turn "find
        // me a job" into an offer: that sentence has no "our <people>".
        `(ieško|ieškau|ieškom|paieška|rask|surask|looking|search|seeking|\\bfind\\b|zoek|such|ищем|ищу|найди|найти)\\w*\\s*.{0,20}(darb|work|job|projekt|project|werk|opdracht|arbeit|auftrag|работ|проект)\\w*\\s*.{0,24}(savo|mūsų|our|onze|unser|наш|для\\s+наш)\\w*\\s*.{0,24}(${OWN_PEOPLE_SOURCE})`,
        10,
      ),
      // WORK **FOR THEM** — the pronoun carries the same possession.
      // "turim 20 suvirintoju, reikia jiems projektu".
      // The two-letter Russian `им` is WORD-BOUNDED (2026-09-23): unbounded it
      // matched inside "видИМым", so "сделай меня видимым для работодателей"
      // — one person asking to be visible to employers — was read as an
      // agency offering capacity, on "им" + "работ(одателей)".
      p("(jiems|joms|them|voor\\s+hen|für\\s+sie|ihnen|dla\\s+nich|для\\s+них|\\bим\\b)\\s*.{0,20}(darb|work|job|projekt|project|werk|opdracht|arbeit|prac|работ|проект)", 10),
      // WE CAN OFFER … "Galime pasiūlyti 15 statybininkų", "we can offer",
      // "wir können … anbieten", "we kunnen … aanbieden".
      //
      // THE SUBJECT IS LOAD-BEARING, and both halves cost a real regression:
      //   * `galim` without a closing boundary also matches "galimYBES", so
      //     "Kokias galimybes man gali pasiūlyti?" — the owner's own phrase
      //     for the opportunity board — was read as an agency offering
      //     capacity;
      //   * a bare `can` matches "CAN YOU offer me…", which is a question TO
      //     us, not an offer FROM anyone.
      // Hence: closed first-person forms, each fully bounded.
      p("\\b(galime|galim|galiu|we\\s+can|we\\s+kunnen|wij\\s+kunnen|wir\\s+können|wir\\s+konnen|можем|могу)\\b\\s*.{0,16}(pasiūl|siūl|offer|provide|supply|aanbied|leveren|anbiet|bereitstell|предлож|предостав)", 10),
      // HAVE + COUNT … AVAILABLE. The COUNT is required: "Turime laisvų
      // darbuotojų" without one is the employer's own roster question and
      // must stay `who-available`.
      //
      // FOUR LOCALES WERE MISSING THE ORDINARY WORD FOR "FREE" (measured
      // 2026-09-07, owner window 11 §18). The adjective list held `laisv`,
      // `available`, `beschikbaar`, `verfügbar`, `свобод`, `доступ` — the
      // FORMAL register only. Nobody says "wir haben 7 Elektriker verfügbar";
      // they say **frei**. Likewise `vrij` (nl), plain `free` (en), and the
      // Russian possessive **у нас**, which is how the sentence begins in
      // Russian at all — `имеем` is bureaucratic. Result: the SUPPLY
      // direction — the whole point of window 7 — was reachable in Lithuanian
      // and `unrecognised` in the other four active locales for the single
      // most ordinary way to say it. Found by putting the sentence on the
      // landing in five languages, not by a test.
      p("(turim|turiu|have|hebben|haben|имеем|располага|у\\s+нас|у\\s+меня|\\bmam)\\w*\\s*.{0,10}[0-9]{1,4}\\s*.{0,30}(laisv|available|\\bfree\\b|beschikbaar|\\bvrij|verfügbar|verfuegbar|\\bfrei\\b|свобод|доступ|\\bwoln|dost[eę]pn)", 10),
      // …and the same sentence with the adjective BEFORE the noun, which is
      // where Lithuanian, Russian and Dutch put it: "Turime 7 LAISVUS
      // elektrikus", "У нас 7 СВОБОДНЫХ электриков", "Wij hebben 7 VRIJE
      // elektriciens". Covered by the rule above only when the adjective
      // follows the count closely enough; this states it plainly.
      p("(turim|turiu|have|hebben|haben|имеем|у\\s+нас|у\\s+меня|\\bmam)\\w*\\s*.{0,10}[0-9]{1,4}\\s+(laisv|free|vrij|frei|свобод|beschikbar|verfügbar|\\bwoln|dost[eę]pn)", 10),
      // AN AGENCY SAYING IT HAS PEOPLE. Only a supplier describes itself this
      // way, so the sentence needs no second market-facing clause.
      // `turi` — the THIRD person — was missing, so "mūsų agentūra turi 15
      // montuotojų" (our agency has 15 fitters) measured `unknown`. An agency
      // speaks about itself in the third person as readily as the first.
      p("(agent[uū]r|agency|uitzend|bureau|agentur|агент)\\w*\\s*.{0,40}(turim|turiu|turi|have|has|hebben|heeft|haben|hat|имеем|располага)", 9),
      // ── HAVE + COUNT + A TRADE. The plainest capacity sentence there is ──
      //
      // "turime 20 pastolininkų" and "turim 8 suvirintojus nuo pirmadienio"
      // measured `unknown` on 2026-09-08 — no market clause, no availability
      // adjective, nothing but WE HAVE, HOW MANY and WHAT TRADE. That is how
      // a subcontractor actually opens.
      //
      // It could not be written before, because the trades vocabulary lived
      // INSIDE the employer-demand rule: the demand side knew every trade and
      // the supply side knew none, so "reikia 12 pastolininkų" was understood
      // and "turime 20 pastolininkų" was not. `TRADE_STEM_SOURCE` is now
      // shared, and both directions read the same list.
      //
      // The COUNT is required, and the noun must be a TRADE. "Turime 20
      // darbuotojų" — the generic worker noun, no trade — is deliberately not
      // matched: it is as likely to be an employer describing its own payroll
      // as an agency offering people, and `darbuotoj` is absent from this
      // vocabulary for that reason.
      //
      // THE COUNT MUST BE A HEADCOUNT, NOT A DURATION (2026-09-09). As first
      // written this rule asked only for HAVE, a number and a trade within 24
      // characters — and "I have 3 years experience as a welder" satisfies all
      // three. It was answered as an agency offering welders: a PERSON
      // describing themselves, read as an organisation describing its
      // workforce. `turiu 3 metus patirties suvirintoju` did the same in
      // Lithuanian. The demand rule below has excluded time units since the
      // day before this rule was written; this one copied its shape and not
      // its guard, so the exclusion is now SHARED vocabulary
      // (`DURATION_UNIT_SOURCE`) rather than a second list that can drift.
      //
      // Two lookaheads, and BOTH are load-bearing. `(?![0-9])` forbids a
      // partial digit run: without it the engine matches "1" of "10", leaving
      // the time-unit test looking at "0 metu" where it finds nothing and
      // passes. The second swallows its own whitespace, so the `\s*` after it
      // cannot backtrack past the unit either. The first dodge was caught by
      // the control for "turiu 10 metu patirties elektriku", not by reading.
      p(
        `(turim|turiu|turi|have|has|hebben|heeft|haben|hat|имеем|у\\s+нас|располага)\\w*\\s*.{0,16}[0-9]{1,4}(?![0-9])(?!\\s*(?:${DURATION_UNIT_SOURCE})\\w*\\b)\\s*.{0,24}(?:${TRADE_STEM_SOURCE})`,
        9,
      ),
      // …and the same capacity stated as AVAILABILITY, with no verb at all:
      // "nuo spalio 5 d. laisvi 3 elektrikai". A date, an availability word, a
      // count and a trade — no "we have" anywhere. Same duration guard, for
      // the same reason: "laisvas 3 menesius, suvirintojas" is one person
      // saying how long they are free, not three welders on offer.
      p(
        `(laisv|available|\\bfree|beschikba|verfügbar|verfuegbar|\\bfrei|\\bvrij|свобод)\\w*\\s*.{0,12}[0-9]{1,4}(?![0-9])(?!\\s*(?:${DURATION_UNIT_SOURCE})\\w*\\b)\\s*.{0,24}(?:${TRADE_STEM_SOURCE})`,
        9,
      ),
      // ── WE HAVE WORKERS **FOR** A COUNTRY ───────────────────────────────
      //
      // "turim sandėlio darbuotojų Vokietijai" measured `need-workers` on
      // 2026-09-08 — WE HAVE warehouse workers FOR Germany read as an
      // employer NEEDING them. It carried no seek verb at all: it scored 4 on
      // the bare `darbuotoj` noun, which the demand side weights on its own.
      // A noun-only rule cannot tell a direction, and this is what that costs.
      //
      // The HAVE verb is the discriminator, and the destination is what makes
      // it market-facing: supply is offered INTO a place. "reikia sandėlio
      // darbuotojų Vokietijoje" keeps the same country and stays demand,
      // because it opens with a need verb rather than a have verb.
      //
      // Weight 6 — above the bare noun's 4, and deliberately BELOW the
      // employer's own roster question: "turime laisvų darbuotojų" scores 8
      // on `who-available` and must keep it, because a company asking who is
      // free on its own bench is not offering anyone to the market.
      p(
        "(turim|turiu|turi|have|has|hebben|heeft|haben|hat|имеем|у\\s+нас|располага)" +
          "\\w*\\s*.{0,30}(darbuotoj|worker|werknemer|medewerk|mitarbeit|arbeitskr|работник|людей)" +
          "\\w*\\s*.{0,24}(vokietij|nyderland|olandij|belgij|švedij|svedij|norvegij|danij|lenkij|" +
          "suomij|airij|prancūzij|prancuzij|germany|netherlands|holland|belgium|sweden|norway|" +
          "denmark|poland|finland|ireland|france|deutschland|niederlande|schweden|norwegen|" +
          "belgien|polen|frankreich|германи|нидерланд|швеци|норвеги|польш|duitsland|zweden|" +
          "noorwegen|belgie|polen)",
        6,
      ),
      // …AND THE WAY AN AGENCY ACTUALLY INTRODUCES ITSELF (measured
      // 2026-09-08 on the public entry). The rule above requires a HAVE verb,
      // but nobody writes "we are an agency and we have 30 workers" — they
      // write "we ARE an agency WITH 30 available workers". So:
      //
      //   en "We are a staffing agency with 30 available workers to offer"
      //        -> `who-available`, an employer's roster QUESTION — the exact
      //           direction inversion this intent exists to prevent
      //   nl "Wij zijn een uitzendbureau met 30 beschikbare werknemers" -> unknown
      //   de "Wir sind eine Zeitarbeitsfirma mit 30 verfügbaren Mitarbeitern" -> unknown
      //
      // German additionally had NO agency noun here at all: `agentur` does
      // not appear in Zeitarbeitsfirma, Personaldienstleister or
      // Arbeitnehmerüberlassung, which is what German actually calls this.
      //
      // The self-description alone is deliberately NOT enough. An agency also
      // speaks as DEMAND ("we are an agency looking for 12 welders for our
      // client"), so a COUNT or an availability word is required — the supply
      // signal — and even then the employer reading outscores this one on
      // such a sentence, which is pinned as a negative control.
      p(
        "(\\bwe\\s+are|\\bwij\\s+zijn|\\bwir\\s+sind|\\besame\\b|\\bмы\\b)\\s*.{0,24}" +
          "(agent[uū]r|agency|uitzend|bureau|agentur|zeitarbeit|personaldienstleist|" +
          "arbeitnehmer[uü]berlassung|personeelsbemiddel|detacheer|агент|кадров)" +
          "\\w*\\s*.{0,40}" +
          // AN AVAILABILITY WORD, NOT A BARE COUNT. The first draft accepted
          // a number here and the negative control caught it immediately:
          // "We are a staffing agency looking for 12 welders for our client"
          // matched, and won at weight 9 over the employer reading's 6 — an
          // agency HIRING would have been filed as an agency OFFERING. A
          // count says how many people are mentioned; only the availability
          // word says they are on offer.
          //
          // Stems, not whole words: German inflects ("freien", "verfügbaren")
          // and Dutch drops a letter ("beschikbare" is not "beschikbaar"), so
          // a trailing \\b here would silently match nothing.
          "(laisv|available|\\bfree|beschikba|verfügbar|verfuegbar|\\bfrei|" +
          "\\bvrij|свобод|доступ)",
        9,
      ),
    ],
  },
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
      // Owner contract 2026-09-04 §16 — the bare question "what am I
      // missing?" names no domain; the answer compares skills AND the
      // required documents of the countries the person wants to work in.
      // "kas man trūksta?" is how people actually ask it (real-user walk
      // 2026-09-06: three runs, every one rescued only by the proposer).
      p("^\\s*(ko|ką|kas)\\s+(man\\s+)?tr[ūu]ksta\\s*\\??\\s*$", 6),
      p("^\\s*what\\s+am\\s+i\\s+(missing|lacking)\\s*\\??\\s*$", 6),
      p("^\\s*чего\\s+(мне\\s+)?не\\s+хватает\\s*\\??\\s*$", 6),
      p("^\\s*was\\s+fehlt(\\s+mir)?(\\s+noch)?\\s*\\??\\s*$", 6),
      p("^\\s*wat\\s+(mis\\s+ik|ontbreekt\\s+er)\\s*\\??\\s*$", 6),
      // pl (2026-09-20) — "Jakich umiejętności mi brakuje?" / "Czego mi
      // brakuje?". The GAP verb is required, exactly as in de/nl above, so
      // "jakie mam umiejętności" stays a profile question.
      p("(jakich|jakie|kt[oó]rych)\\s+.{0,12}(umiej[eę]tno|kwalifikacj|kompetencj)", 5),
      p("brakuje\\s+mi\\s*.{0,16}(umiej[eę]tno|kwalifikacj|kompetencj)", 5),
      p("^\\s*czego\\s+mi\\s+brakuje\\s*\\??\\s*$", 6),
    ],
  },
  {
    intent: "journal-recent",
    patterns: [
      p("(parodyk|rodyk|show|покажи|zeig|toon|laat|poka[zż]|wy[sś]wietl)\\s*.{0,20}(žurnal|journal|дневник|tagebuch|dagboek|dziennik)", 5),
      p("(paskutin|latest|last|последн|letzte|laatste|ostatni)\\s*.{0,18}(įraš|entr|запис|eintrag|einträge|wpis)", 5),
      p("(mano|my|мой|mein|mijn|m[oó]j)\\s+(žurnal|journal|дневник|tagebuch|dagboek|dziennik)", 4),
      // A QUESTION about hours worked is a journal READ, not a log-work
      // intake. "Kiek valandų dirbau šiandien?" used to score log-work via
      // the bare past-tense verb and answered with the log-work template —
      // the assistant asking you to record the very thing it should be
      // reporting (owner visual acceptance P0-5). The interrogative +
      // hours/worked pairing outweighs log-work's verb+today signals.
      p("(kiek|how\\s+(many|much)|сколько|hoeveel|wie\\s+viele?|\\bile\\b)\\s*.{0,24}(valand|hour|час|stunden|uur|uren|godzin)", 7),
      p("(kiek|how\\s+(many|much)|сколько|hoeveel|wie\\s+viele?|\\bile\\b)\\s*.{0,24}(dirbau|dirbome|worked|работал|gearbeitet|gewerkt|pracowa[lł])", 7),
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
        "\\b(ką|what|что|was|wat|co)\\b\\s*.{0,24}(dariau|dirbau|dirbome|nuveikiau|did\\s+i\\s+do|делал|сделал|gemacht|getan|gedaan|gewerkt|gearbeitet|robi[lł]em|zrobi[lł]em|pracowa[lł]em)",
        7,
      ),
    ],
  },
  /**
   * WORK INTELLIGENCE BY SENTENCE (issue #1689, re-audit 2026-09-11, owner
   * chat lines 2–7). Measured through this router before the rules below:
   * "Kiek programavau?" → unknown; "Kur naudojau programavimo įgūdį?" →
   * `profile` (profile COMPLETENESS — the wrong answer); "Kokia veikla užima
   * daugiausia mano laiko?" → unknown; "Kokius įgūdžius naudoju daugiausia?"
   * → `profile`; "Kas patvirtinta?" → unknown. The data behind every one of
   * them already existed in the work-in-numbers model; only the door did
   * not. Each rule outweighs `profile` (2) and `skill-gap` (5) by design —
   * a question about RECORDED work is a journal read, not a profile edit.
   *
   * The SUBJECT of a "how much did I <verb>" question ("programavau",
   * "klojau plyteles") is not read here: the journal recognizer reads it in
   * the handler, the same way it reads an intake sentence. A subject it
   * cannot recognise falls back to the plain period answer — so a broad
   * verb rule costs nothing wrong. The "dirb-" verbs are excluded so "kiek
   * dirbau šiandien?" keeps its own intent (journal-recent).
   */
  {
    intent: "journal-skill",
    patterns: [
      // lt — "Kiek programavau?", "Kiek klojau plyteles?", "kiek valandų
      // klojau plyteles šį mėnesį?" — an interrogative + a first-person
      // past-tense verb (-au) other than dirbau/uždirbau. Folded text, so
      // `[^\s]` not `\S` (the folder lower-cases pattern sources).
      p("^\\s*kiek\\s+(?:valand[^\\s]*\\s+)?(?:[^\\s]+\\s+){0,2}?(?!dirb|uzdirb|gav|turej|siunt|issiunt|mokej|sumokej)[^\\s]+au\\b", 8),
      // en — "How much did I program?", "how often did I do tiling"
      p("^\\s*how\\s+(much|many|often|long)\\s+(did|have)\\s+i\\s+(?!work)[^\\s]+", 8),
      // ru — "Сколько я программировал?"
      p("^\\s*сколько\\s+(я\\s+)?(?!работал|отработал)[^\\s]+(л|ла)\\b", 8),
      // de — "Wie viel habe ich programmiert?"
      p("^\\s*wie\\s+(viel|oft|lange)\\s+habe\\s+ich\\s+(?!gearbeitet)[^\\s]+", 8),
      // nl — "Hoeveel heb ik geprogrammeerd?"
      p("^\\s*hoeveel\\s+heb\\s+ik\\s+(?!gewerkt)[^\\s]+", 8),
      // pl (2026-09-20) — "Ile programowałem?", "Ile godzin układałem
      // płytki?". Polish marks the first-person past in the ending (-łem /
      // -łam), which folds to -lem / -lam; `pracowa` is excluded so "Ile
      // godzin pracowałem?" keeps `journal-recent`, exactly as `dirb` is
      // excluded from the Lithuanian shape above.
      p("^\\s*ile\\s+(?:godzin[^\\s]*\\s+)?(?:[^\\s]+\\s+){0,2}?(?!pracowa|zarobi|dosta|mia)[^\\s]+[lł](em|am)\\b", 8),
      // WHERE was a skill used — the contexts / entries it sits on. The
      // en/de/nl shapes carry the past-tense auxiliary ("where did I use",
      // "wo habe ich … verwendet"), so "where can I use my skills" — a
      // question about the future — is not pulled into a journal read.
      p("(kur|где|gdzie)\\s*.{0,24}(naudoj|использ|u[zż]ywa[lł]|wykorzysta[lł])", 8),
      p("(where|wo|waar)\\s+(did|have|habe|heb)\\s+(i|ich|ik)\\b.{0,24}(use|verwend|benutz|eingesetzt|gebruik|ingezet)", 8),
      p("(kur|где|gdzie)\\s*.{0,30}(įgūd|навык|umiej[eę]tno)", 4),
      p("(where|wo|waar)\\s+(did|have|habe|heb)\\s+(i|ich|ik)\\b.{0,30}(skill|fähigkeit|vaardigh)", 4),
    ],
  },
  {
    intent: "journal-skills-top",
    patterns: [
      // "Kokius įgūdžius naudoju daugiausia?" / "Which skills do I use most?"
      // / "Какие навыки я использую больше всего?" / "Welche Fähigkeiten
      // nutze ich am meisten?" / "Welke vaardigheden gebruik ik het meest?"
      // Interrogative-gated, so "use my skills in Germany" stays a search.
      p(
        "(kokius|kokiu|kurius|kuriu|which|what|какие|каких|welche|welke|jakich|jakie|kt[oó]rych)\\s+.{0,12}(įgūd|skill|навык|fähigkeit|kompetenz|vaardigh|competent|umiej[eę]tno|kompetencj)[^\\s]*\\s*.{0,20}(naudoj|use|использ|nutze|benutze|verwende|gebruik|u[zż]ywam|u[zż]ywa|korzystam|wykorzystuj)",
        8,
      ),
    ],
  },
  {
    intent: "journal-activities-top",
    patterns: [
      // "Kokia veikla užima daugiausia mano laiko?" / "Which activity takes
      // most of my time?" / "Какая деятельность занимает больше всего
      // времени?" / "Welche Tätigkeit nimmt die meiste Zeit?" / "Welke
      // activiteit kost de meeste tijd?"
      p(
        "(veikl|activit|деятельност|занят|tätigkeit|activiteit|bezigheid|czynno[sś]|aktywno[sś])[^\\s]*\\s*.{0,40}(daugiausia|most|больше\\s+всего|meiste|meest|najwi[eę]cej)",
        8,
      ),
      // "Kur praleidžiu daugiausia laiko?" / "Womit verbringe ich die meiste
      // Zeit?" / "Waar besteed ik de meeste tijd aan?"
      p("(daugiausia|most\\s+of|больше\\s+всего|meiste|meeste|najwi[eę]cej)\\s*.{0,24}(laik|time|времен|zeit|tijd|czasu|czas\\b)", 8),
      // "Ką daugiausia dirbau?" — outweighs journal-recent's ką…dirbau (7).
      p(
        "\\b(ką|what|что|was|wat|co)\\b\\s*.{0,16}(daugiausia|most|больше\\s+всего|meisten|meest|najwi[eę]cej)\\s*.{0,16}(dirbau|dariau|did|делал|gemacht|gedaan|robi[lł]em|pracowa[lł]em)",
        8,
      ),
    ],
  },
  {
    intent: "journal-confirmed",
    patterns: [
      // "Kas patvirtinta?" / "What is confirmed?" / "Что подтверждено?" /
      // "Was ist bestätigt?" / "Wat is bevestigd?"
      p("^\\s*(kas|what|что|was|wat|co)\\s+(yra\\s+|is\\s+|ist\\s+|jest\\s+)?(jau\\s+|already\\s+|уже\\s+|schon\\s+|al\\s+|ju[zż]\\s+)?(patvirtint|confirmed|подтвержд|bestätigt|bevestigd|potwierdz)", 8),
      // "kiek valandų patvirtinta?" — outweighs journal-recent's kiek…valand
      // (7); "show my approved hours" stays `figures` (no interrogative).
      p("(kiek|how\\s+(much|many)|сколько|wie\\s+viel|hoeveel|\\bile\\b)\\s*.{0,24}(patvirtint|confirmed|подтвержд|bestätigt|bevestigd|potwierdz)", 8),
      // "kurie įrašai patvirtinti?" / "which entries are confirmed?"
      p(
        "(kurie|kuriuos|which|какие|welche|welke|kt[oó]re|jakie)\\s*.{0,16}(įraš|entr|запис|eintr|invoer|registr|wpis)[^\\s]*\\s*.{0,12}(patvirtint|confirmed|подтвержд|bestätigt|bevestigd|potwierdz)",
        8,
      ),
    ],
  },
  {
    intent: "journal-growth",
    patterns: [
      // Owner line 8 — "Kur yra didžiausias augimo potencialas?" / "Where
      // is my biggest growth potential?" / "Где потенциал роста?" / "Wo
      // liegt mein Wachstumspotenzial?" / "Waar zit mijn groeipotentieel?"
      // The noun alone is enough: a person asking about growth potential is
      // asking for the reading of their own evidence, not for a course
      // (learning-compass) and not for a gap list (skill-gap, 5).
      p("(augimo|growth|роста|wachstums|groei|rozwoju|rozwojow)[^\\s]*\\s*.{0,6}(potencial|potential|потенциал|potenzial|potentieel|potencja)", 8),
      p("(potencial|potential|потенциал|potenzial|potentieel|potencja)[^\\s]*\\s*.{0,10}(aug|grow|рост|wachs|groei|rozwoj|rozwij)", 8),
      // "Kur galėčiau augti / tobulėti?", "Where could I grow?", "Где я
      // могу расти?", "Wo kann ich wachsen?", "Waar kan ik groeien?" — an
      // interrogative + a first-person modal + the growth verb, so
      // "augalai" and "the company grows" never land here.
      p("(kur|kaip|kame|where|how|где|куда|как|wo|wie|waar|hoe|gdzie|\\bjak\\b)\\s*.{0,24}(galėčiau|galiu|galėsiu|could\\s+i|can\\s+i|might\\s+i|могу|мог\\s+бы|kann\\s+ich|könnte\\s+ich|kan\\s+ik|zou\\s+ik|mog[eę]|m[oó]g[lł]bym)\\s*.{0,16}(augti|tobulėti|gilinti|plėsti|grow|deepen|expand|develop|расти|углуб|развива|wachsen|vertiefen|erweitern|groeien|verdiepen|uitbreiden|rozwija|rozwin|pog[lł][eę]bi|poszerzy)", 8),
      // "Ką galėčiau gilinti / plėsti?", "What could I deepen?"
      p("(ką|ka|what|что|was|wat|\\bco\\b)\\s*.{0,10}(galėčiau|galiu|could\\s+i|can\\s+i|могу|kann\\s+ich|könnte\\s+ich|kan\\s+ik|zou\\s+ik|mog[eę]|m[oó]g[lł]bym)\\s*.{0,10}(gilinti|plėsti|deepen|expand|углуб|расшир|vertiefen|erweitern|verdiepen|uitbreiden|pog[lł][eę]bi|poszerzy|rozwin)", 8),
    ],
  },
  {
    intent: "figures",
    patterns: [
      // "approved hours" is the owner's phrasing; the product records
      // CONFIRMED entries, and the workflow says so rather than inventing a
      // number. Recognising the question is what lets it answer honestly.
      p(
        "(patvirtint|approved|confirmed|подтвержд|bestätigt|bevestigd|potwierdzon)\\s*.{0,18}(valand|hour|час|įraš|entr|запис|stunden|uren|uur|godzin)",
        5,
      ),
      p("\\bataskait", 4),
      p("\\breport\\b", 4),
      p("(отчёт|отчет)", 4),
      p("\\braport", 4), // pl — "przygotuj raport" (not the nl `rapport`)
      p("(bericht|rapport)", 3),
      // pl — "przygotuj zestawienie godzin"
      p("(przygotuj|zr[oó]b|wygeneruj)\\s*.{0,16}(raport|zestawieni|podsumowani)", 5),
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
      p("(parodyk|rodyk|show|list|покажи|zeig|toon|laat|poka[zż]|wy[sś]wietl)\\s*.{0,15}(projekt|project|проект)", 6),
      p("(mano|my|мои|meine|mijn|moje|moich)\\s+(projekt|project|проект)", 6),
      p("(kur|where\\s+are|где|wo\\s+sind|waar\\s+zijn|gdzie\\s+s[aą])\\s*.{0,10}(projekt|project|проект)", 5),
      // Bare plural — LT projektai/projektus + DE Projekte(n) + PL projekty.
      p("\\bprojekt(ai|us|ų|uose|e|en|y|ach|[oó]w)\\b", 3),
      p("\\bproject(s|en)\\b", 3), // en + nl projecten
      p("\\bпроект(ы|ов|ах)\\b", 3),
    ],
  },
  {
    intent: "open-project",
    patterns: [
      // `projekt` is the LT/DE stem and `project` the EN/NL spelling — both
      // are needed, or "Open this project" silently classifies as unknown.
      p("(atidaryk|atidaryti|atverk|open|открой|öffne|otw[oó]rz)\\s*.{0,15}(projekt|project|проект)", 5),
      p("(šį|šitą|this|этот|dit|dieses|\\bten\\b|\\bt[eę]\\b)\\s+(projekt|project|проект)", 4),
      // "Kas vyksta mano objekte?" — an OBJEKTAS is a project in this
      // product, and the sentence is a QUESTION about it. It used to reach
      // log-work on the bare `objekt` stem (weight 1) and open the work-log
      // flow: the person asked what is happening and was handed a form to
      // write down hours. Asking about a site is opening it. The "kas vyksta"
      // prefix is required, so "dirbau objekte" still records work.
      p(
        "(kas\\s+vyksta|kas\\s+naujo|what.{0,12}(happening|going\\s+on)|что\\s+происходит|was\\s+passiert|wat\\s+gebeurt|co\\s+si[eę]\\s+dzieje|co\\s+nowego)\\s*.{0,20}(objekt|statyb|projekt|project|объект|проект|budow)",
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
      p("\\bkandydat", 6), // pl — the y-spelling never reaches `kandidat`
      p("кандидат", 6), // ru
      p("\\bcandidates?\\b", 6), // en
      p("(bewerber|sollicitant)", 5), // de Bewerber / nl sollicitanten
      // "who is waiting (on my need)" — the employer's other way to ask.
      // Deliberately NO Lithuanian "kas laukia" here: it usually means "what
      // awaits (me)" — a day question, not a hiring one.
      p("(who\\s+is\\s+waiting|wer\\s+wartet|wie\\s+wacht|кто\\s+(ждет|ожидает)|kto\\s+czeka)", 4),
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
      // pl — the SCOUTING imperative, exactly like "surask darbuotojų".
      // "Potrzebujemy pracowników" carries no find/show verb and stays
      // `need-workers`, the same split the lt/de/nl rules above keep.
      p("(znajd[zź]|poka[zż]|wyszukaj|wyszuka[cć]|przeszukaj)\\s*.{0,24}(pracownik|robotnik|ludzi|fachowc)", 6), // pl
      p("\\bscouting\\b", 4),
      // ── A BRIGADE FOR A SITE IS DEMAND, NOT A JOB SEARCH ────────────────
      // Owner window 11 §18 names "Ieškau brigados objektui" as a landing
      // example. Measured 2026-09-07: it classified `find-work` at weight 3 —
      // the person looking to HIRE a team was read as a person looking for
      // work. SEP-4 (DEMAND ≠ SUPPLY), one rule below the surface.
      //
      // The team noun ALONE is not enough and deliberately does not appear
      // here: "ieškau brigados, prie kurios prisijungti" is a worker seeking
      // a team to JOIN, and the product may not guess between the two. What
      // resolves it is the WORK OBJECT the team is wanted for — a site, a
      // project, named work — so all three parts are required.
      p("(iesk|ieškau|ieškom|surask|reikia|need|looking\\s+for|search|suche|zoek|ищу|ищем|нужн|szuka|poszukuj|potrzebuj)\\w*\\s*.{0,20}(brigad|komand|\\bteam\\b|\\bcrew\\b|ploeg|kolonne|бригад|brygad|ekip)\\w*\\s*.{0,24}(objekt|projekt|statyb|darbam|darbams|\\bsite\\b|\\bjob\\s+site\\b|project|baustelle|bouwplaats|объект|стройк|budow)", 8),
      // …and the same sentence with the object first: "objektui ieškau
      // brigados", "voor het project zoek ik een ploeg".
      p("(objekt|projekt|statyb|\\bsite\\b|baustelle|bouwplaats|объект|стройк|budow)\\w*\\s*.{0,24}(iesk|ieškau|surask|reikia|need|looking\\s+for|suche|zoek|ищу|нужн|szuka|poszukuj|potrzebuj)\\w*\\s*.{0,20}(brigad|komand|\\bteam\\b|\\bcrew\\b|ploeg|kolonne|бригад|brygad|ekip)", 8),
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
        "(kas\\s+vyksta|kas\\s+naujo|what.{0,12}(happening|going\\s+on)|что\\s+происходит|was\\s+passiert|wat\\s+gebeurt|co\\s+si[eę]\\s+dzieje|co\\s+nowego)\\s*.{0,20}(įmon|organizacij|company|компани|firm|unternehmen|bedrijf)",
        6,
      ),
      p(
        "(kaip\\s+sekasi|how\\s+is|wie\\s+geht\\s+es|wie\\s+läuft|hoe\\s+gaat\\s+het|jak\\s+idzie|jak\\s+sobie\\s+radzi)\\s*.{0,16}(įmon|company|компани|firm|unternehmen|bedrijf)",
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
        "(sukur|uzregistruo|registruo|isteig|pradėti(?=\\s+versl)|noriu\\s+sukurti|create|register|set\\s+up|start(?=\\s+a?\\s*(company|business|firm))|создать|создай|создам|зарегистрир|aanmaken|oprichten|registreren|erstellen|anlegen|gründen|utw[oó]rz|stw[oó]rz|za[lł][oó][zż]|zarejestruj)\\s*.{0,24}(įmon|organizacij|firm|bendrov|versl|company|organisation|organization|business|компани|организаци|фирм|bedrijf|unternehmen|sp[oó][lł]k|dzia[lł]alno[sś])",
        6,
      ),
      // noun -> verb: "imone sukurti", "bedrijf aanmaken", "Firma anlegen"
      p(
        "(įmon|organizacij|firm|bendrov|versl|company|organisation|organization|business|компани|организаци|фирм|bedrijf|unternehmen|sp[oó][lł]k|dzia[lł]alno[sś])\\w*\\s*.{0,24}(sukurti|uzregistruoti|įsteigti|create|register|aanmaken|oprichten|registreren|erstellen|anlegen|gründen|создать|зарегистрировать|utworzy[cć]|za[lł]o[zż]y[cć]|zarejestrowa[cć])",
        6,
      ),
    ],
  },
  {
    /**
     * RENAME THE ACTIVE ORGANIZATION (owner program 2026-09-23, CASE 3/4).
     *
     * WHY THIS EXISTS. The owner, standing in an unnamed agency workspace,
     * typed "Pervadink šią agentūrą į Nonstop Group UAB." It scored 0 here in
     * all six locales (19 variants measured), the model proposer had no id to
     * choose, and the not-understood answer showed CV / profile / job chips.
     *
     * CLOSED, VERB + NOUN. Every pattern needs a RENAME verb with an
     * organisation noun, or a CHANGE verb with a NAME noun bound to an
     * organisation noun (or directly to its target: "pakeisk pavadinimą į X",
     * "change the name to X"). So "pakeisk mano profilį", "change my CV",
     * "pakeisk darbo žurnalo įrašą" and a bare "Nonstop Group UAB" (a
     * reference — see utterance-understanding.ts) never reach it, and
     * "pakeisk projekto pavadinimą" does not either: a project is not an
     * organisation. A question ("Koks mano įmonės pavadinimas?") carries no
     * change verb and no target marker, so it stays out as well.
     *
     * Weight 9 per pattern: above every noun-only rule an organisation word
     * can trip (`company-overview` 6, `create-organization` 6 — which needs a
     * CREATE verb anyway, `switch-context` 5 on "change my workspace").
     *
     * Sources are folded like the sentence (lower-case, no diacritics): no
     * `\S` (it would fold to `\s`) and no `\p{L}` (it would fold to `\p{l}`);
     * `[^\s]` and `[^?]` bridge instead. The router only CLASSIFIES — which
     * organisation, and whether this person may rename it, is decided by the
     * server (lib/company/organization-rename.ts).
     */
    intent: "rename-organization",
    patterns: [
      // lt — "Pervadink šią agentūrą į X", "Pas mane yra agentūra … Pervadink
      // ją X", "Noriu pakeisti agentūros pavadinimą", "Agentūros pavadinimas: X"
      p(`pervadin[^?]{0,60}${RENAME_ORG_LT}`, 9),
      p(`${RENAME_ORG_LT}[^?]{0,80}pervadin`, 9),
      p(`${RENAME_CHANGE_LT}[^?]{0,40}${RENAME_ORG_LT}[^?]{0,24}pavadinim`, 9),
      p(`${RENAME_CHANGE_LT}[^?]{0,24}pavadinim[^?]{0,40}${RENAME_ORG_LT}`, 9),
      p(`${RENAME_ORG_LT}[^\\s]{0,6}\\s+pavadinim[^\\s]*\\s*(:|\\bi\\b)`, 9),
      p("(pakei|keis)[^\\s]*\\s+(musu\\s+|mano\\s+|sios\\s+|sitos\\s+)?pavadinim[^\\s]*\\s+i\\b", 9),
      // en — "rename my company to X", "Change the agency name to X",
      // "change the name of our organisation", "change the name to X"
      p(`\\brenam[^?]{0,40}${RENAME_ORG_EN}`, 9),
      p(`${RENAME_ORG_EN}[^?]{0,60}\\brenam`, 9),
      p(`\\b(change|update|set|edit|fix|correct)\\b[^?]{0,30}${RENAME_ORG_EN}(?:['’]s)?\\s+name\\b`, 9),
      p(`\\b(change|update|set|edit|fix|correct)\\b[^?]{0,20}\\bname\\s+of\\s+[^?]{0,20}${RENAME_ORG_EN}`, 9),
      // The bare "name to X" forms carry NO first-person singular possessive
      // (en `my`, nl `mijn`, de `meinen`): "change my name to Jonas" is the
      // PERSON's name, and routing it here answered a person with "you have no
      // organization" or prefilled the org form with their own name. `name` /
      // `naam` / `Namen` is ambiguous between a person and an organisation;
      // lt `pavadinimas`, ru `название`, pl `nazwa` name a THING (a person's
      // is `vardas` / `имя` / `imię`), so those forms keep their possessives.
      p("\\b(change|update|set)\\s+(the\\s+|our\\s+|its\\s+)?name\\s+to\\b", 9),
      // ru — "Переименуй агентство в X", "Смени название компании на X"
      p(`переимен[^?]{0,40}${RENAME_ORG_RU}`, 9),
      p(`${RENAME_ORG_RU}[^?]{0,60}переимен`, 9),
      p(`${RENAME_CHANGE_RU}[^?]{0,20}(назван|наименован)[^?]{0,30}${RENAME_ORG_RU}`, 9),
      p(`${RENAME_CHANGE_RU}[^?]{0,30}${RENAME_ORG_RU}[^?]{0,20}(назван|наименован)`, 9),
      p("(смени|измени|поменяй|обнови)\\s+(наше\\s+|моё\\s+|своё\\s+)?(название|наименование)\\s+на\\b", 9),
      // nl — "Hernoem mijn bedrijf naar X", "Wijzig de bedrijfsnaam",
      // "de naam van het bureau veranderen"
      p(`hernoem[^?]{0,40}${RENAME_ORG_NL}`, 9),
      p(`${RENAME_ORG_NL}[^?]{0,60}hernoem`, 9),
      p(`(wijzig|verander|aanpass|\\bpas\\b)[^?]{0,20}${RENAME_NAMED_NL}`, 9),
      p(`${RENAME_NAMED_NL}[^?]{0,30}(wijzig|verander|aanpass|aan\\s+te\\s+passen)`, 9),
      // No `mijn`: "wijzig mijn naam naar Jan" is the person's name (see en).
      p("(wijzig|verander)[^\\s]*\\s+(de\\s+|onze\\s+)?naam\\s+(naar|in)\\b", 9),
      // de — "Firma umbenennen", "Benenne meine Firma in X um",
      // "Ändere den Firmennamen", "Namen der Firma ändern"
      p(`umbenenn[^?]{0,40}${RENAME_ORG_DE}`, 9),
      p(`${RENAME_ORG_DE}[^?]{0,60}umbenenn`, 9),
      p(`\\bbenenne[^?]{0,40}${RENAME_ORG_DE}[^?]{0,60}\\bum\\b`, 9),
      p(`(ändere|ändern|aendere|aendern|aktualisier|korrigier)[^?]{0,30}${RENAME_NAMED_DE}`, 9),
      p(`${RENAME_NAMED_DE}[^?]{0,30}(ändern|aendern|aktualisieren|korrigieren)`, 9),
      // No `meinen`: "ändere meinen Namen zu Hans" is the person's name (see en).
      p("(ändere|aendere)\\s+(den\\s+|unseren\\s+)?namen\\s+(zu|auf|in)\\b", 9),
      // pl — "Zmień nazwę firmy na X", "przemianuj agencję na X"
      p(`zmie[nń][^?]{0,12}nazw[^?]{0,30}${RENAME_ORG_PL}`, 9),
      p(`${RENAME_ORG_PL}[^?]{0,30}zmie[nń][^?]{0,12}nazw`, 9),
      p(`nazw[^?]{0,30}${RENAME_ORG_PL}[^?]{0,30}zmie[nń]`, 9),
      p(`przemianuj[^?]{0,40}${RENAME_ORG_PL}`, 9),
      p(`${RENAME_ORG_PL}[^?]{0,60}przemianuj`, 9),
      p("zmie[nń][^\\s]*\\s+nazw[^\\s]*\\s+na\\b", 9),
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
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|prijung|prisijung|add|invite|connect|onboard|einlad|hinzuf|verbind|uitnodig|toevoeg|koppel|приглас|добав|подключ|zapro[sś]|zaprasza|pod[lł][aą]cz)\\w*\\s*.{0,30}(klient|client|kunde|klant|užsakov|клиент|заказчик|zleceniodawc)", 8),
      // client → verb: "klientą pakviesti", "Kunde hinzufügen", "клиента добавить"
      p("(klient|client|kunde|klant|užsakov|клиент|заказчик|zleceniodawc)\\w*\\s*.{0,24}(pakvies|kviest|prijung|prid[eė]t|invite|add|einlad|hinzuf|uitnodig|toevoeg|приглас|добав|zapro[sś]|zaprosi|doda[cć])", 8),
    ],
  },
  {
    intent: "invite-candidate",
    patterns: [
      // "pakviesk darbuotoją / kandidatą", "pridėti darbuotoją į komandą",
      // "invite a worker", "Mitarbeiter einladen", "medewerker uitnodigen",
      // "пригласить работника"
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|prijung|add|invite|einlad|hinzuf|uitnodig|toevoeg|приглас|добав|zapro[sś]|zaprasza)\\w*\\s*.{0,30}(kandidat|darbuotoj|specialist|worker|employee|candidate|mitarbeiter|arbeiter|medewerker|werknemer|kandida|работник|сотрудник|кандидат|pracownik|kandydat)", 8),
      // "į komandą" / "to the team" / "zum Team" / "aan het team" / "в команду"
      p("(pakvies|pakviesk|kviesk|prid[eė]|add|invite|einlad|uitnodig|приглас|добав|zapro[sś])\\w*\\s*.{0,24}(į\\s+komand|komandos\\s+nar|to\\s+(the\\s+)?team|team\\s+member|zum\\s+team|aan\\s+het\\s+team|в\\s+команд|do\\s+zespo[lł]|do\\s+ekip)", 8),
      // noun → verb (DE/NL word order, LT object-first): "Mitarbeiter
      // einladen", "medewerker uitnodigen", "darbuotoją pakviesti"
      p("(kandidat|darbuotoj|worker|employee|candidate|mitarbeiter|arbeiter|medewerker|werknemer|kandida|работник|сотрудник|pracownik|kandydat)\\w*\\s*.{0,20}(pakvies|kviest|prid[eė]t|invite|einlad|hinzuf|uitnodig|toevoeg|приглас|добав|zapro[sś]|zaprosi)", 8),
    ],
  },
  {
    intent: "client-demand",
    patterns: [
      // "kliento poreikis", "klientų užklausos", "client demand / requests",
      // "Kundenbedarf", "aanvraag van de klant", "запрос клиента"
      p("(klient|client|kunde|klant|užsakov|клиент|заказчик)\\w*\\s*.{0,24}(poreik|užklaus|paklaus|demand|need|request|order|bedarf|anfrage|auftrag|aanvra|vraag|behoefte|потребн|запрос|заявк|zapotrzebowan|zapytani|zlecen)", 7),
      p("(poreik|užklaus|demand|request|bedarf|anfrage|aanvra|запрос|zapotrzebowan|zapytani|zlecen)\\w*\\s*.{0,24}(klient|client|kunde|klant|užsakov|клиент|заказчик)", 7),
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
      // pl: `zaproponuj` / `proponu` only — the INFINITIVE `zaproponować`
      // deliberately stays out, so "Chcę zaproponować pracę kandydatowi"
      // keeps `propose-booking` (the direct employer's job offer) below.
      p("(pasiūl|siūl|propose|offer|suggest|put\\s+forward|vorschlag|schlage|voorstel|voordragen|предлож|предлага|zaproponuj|proponu)\\w*\\s*.{0,24}(kandidat|darbuotoj|žmog|specialist|worker|candidate|person|mitarbeiter|kandida|medewerker|работник|кандидат|kandydat|pracownik)", 8),
      // noun → verb: "Kandidaten vorschlagen", "kandidaat voorstellen",
      // "kandidatą pasiūlyti", "кандидата предложить"
      p("(kandidat|darbuotoj|worker|candidate|mitarbeiter|kandida|medewerker|работник|кандидат|kandydat)\\w*\\s*.{0,20}(pasiūl|siūl|propose|vorschlag|voorschlag|voorstel|voordrag|предлож|zaproponuj|proponu)", 8),
    ],
  },
  {
    intent: "proposal-status",
    patterns: [
      // "pasiūlymų būsena", "kaip sekasi mano pasiūlymams", "proposal status",
      // "Stand der Vorschläge", "status van mijn voorstellen", "статус предложений"
      p("(pasiūlym|proposal|offer|vorschl|voorstel|предлож|propozycj)\\w*\\s*.{0,20}(būsen|status|eig|progress|stadij|stand|состоян|статус)", 7),
      p("(būsen|status|статус|stand)\\w*\\s*.{0,20}(pasiūlym|proposal|offer|vorschl|voorstel|kandidat|candidate|предлож|кандидат|propozycj|kandydat)", 7),
      p("(kaip\\s+sekasi|how\\s+(are|is)\\s+.{0,12}(going|doing)|wie\\s+steht|hoe\\s+staat|как\\s+(идут|дела)|jak\\s+(id[aą]|idzie|stoj[aą]))\\s*.{0,24}(pasiūlym|kandidat|proposal|candidate|offer|vorschl|kandida|предлож|кандидат|propozycj|kandydat)", 7),
    ],
  },
  // ── STUDENT / EDUCATION INSTITUTION (route-class) ─────────────────────────
  {
    intent: "learning-compass",
    patterns: [
      p("(mokymosi|learning|lern|leer|обучени|учебн)\\w*\\s*.{0,10}(kompas|compass|kompass|компас)", 8),
      p("\\b(kompas|compass|kompass|компас)", 5),
      // Owner contract 2026-09-04 §15 — the student's own questions, in
      // their own words: "what should I learn / study", "what am I
      // becoming". Answered in the chat from the same compass read.
      p("(ką|ka|what|was|wat|что)\\s+(man|turėčiau|should\\s+i|soll\\s+ich|moet\\s+ik|мне)\\s*.{0,10}(mokytis|studijuoti|learn|study|lernen|studieren|leren|studeren|учить|изучать)", 8),
      p("(kuo|what)\\s+(aš\\s+)?(tampu|tapsiu|am\\s+i\\s+becoming)", 7),
    ],
  },
  {
    intent: "invite-student",
    patterns: [
      // "pakviesk studentą / mokinį", "invite a learner", "Schüler einladen",
      // "student uitnodigen", "пригласить студента"
      p("(pakvies|pakviesk|kviesk|kviesti|prid[eė]|invite|add|einlad|hinzuf|uitnodig|toevoeg|приглас|добав|zapro[sś]|zaprasza)\\w*\\s*.{0,24}(student|mokin|besimokan|learner|studier|schüler|leerling|студент|учащ|ученик|ucze[nń]|uczni|s[lł]uchacz)", 8),
      // noun → verb: "Leerling uitnodigen", "Schüler einladen", "studentą pakviesti"
      p("(student|mokin|besimokan|learner|schüler|leerling|студент|учащ|ucze[nń]|uczni)\\w*\\s*.{0,20}(pakvies|kviest|invite|einlad|uitnodig|приглас|zapro[sś]|zaprosi)", 8),
    ],
  },
  {
    intent: "programmes",
    patterns: [
      // "sukurk programą", "nauja grupė / kohorta", "create a cohort",
      // "Programm anlegen", "nieuwe opleiding", "создать программу"
      // REGISTER is how an institution says it (measured 2026-09-08, public
      // entry). "We are a training provider and want to register a
      // programme" scored 0 here and landed `unknown` — as did the lt, ru and
      // nl forms, and the de one resolved to `opportunities`, the WORKER
      // board. The fourth actor's opening sentence reached nothing in four of
      // the five routed locales. The verb family was create/new/add only; an
      // institution does not "create" its programme, it registers it.
      // Collision-safe: every one of these still requires a programme noun
      // within 20 characters, so "registruoti darbo laiką" cannot reach here.
      p("(sukur|kurti|prid[eė]|nauj|create|new|add|erstell|anleg|maak|nieuw|создать|создай|нов|registruo|[iį]registr|register|registrier|registreer|registrer|регистр|utw[oó]rz|stw[oó]rz|za[lł][oó][zż]|zarejestruj)\\w*\\s*.{0,20}(program|kurs|grup|kohort|cohort|kursus|opleiding|программ|курс|групп|когорт|szkoleni|nab[oó]r)", 7),
      p("(mano|mūsų|my|our|meine|unsere|mijn|onze|мои|наши|moje|nasze|moich|naszych)\\s+(program|kurs|grup|kohort|cohort|opleiding|программ|курс|групп|когорт|szkoleni)", 6),
      // noun → verb: "Programm anlegen", "opleiding aanmaken", "programą sukurti"
      // Same verb family in the noun-first order German and Dutch actually
      // use: "Ausbildungsprogramm registrieren", "opleidingsprogramma
      // registreren".
      p("(program|kurs|grup|kohort|cohort|opleiding|программ|курс|групп|когорт|szkoleni)\\w*\\s*.{0,16}(sukur|kurti|create|erstell|anleg|aanmak|создать|создай|registruo|register|registrier|registrer|registreer|utworzy[cć]|za[lł]o[zż]y[cć]|zarejestrowa[cć])", 7),
      // Owner contract 2026-09-04 §15 — the institution's other two commands
      // by sentence: "priskirk studentą grupei" (assign a learner to a
      // cohort) and "parodyk programas / grupes" (read). Both land here; the
      // handler reads the sentence's verb to pick the form or the list.
      p("(priskir|assign|zuweis|toewijz|назнач|zapisz)\\w*\\s*.{0,24}(student|mokin|learner|schüler|leerling|студент|учащ)\\w*\\s*.{0,24}(grup|kohort|cohort|groep|gruppe|групп|поток)", 8),
      p("(parodyk|rodyk|show|zeig|toon|покажи|список)\\s*.{0,12}(program|grup|kohort|cohort|opleiding|программ|групп)", 6),
      // Window 6 (lane C, prod walk 2026-09-06): the questions a lecturer asks
      // ABOUT THEIR STUDENTS — "kokių įgūdžių trūksta mano studentams?",
      // "kurie studentai tinka šiam darbdaviui?", "kur mano studentai gali
      // atlikti praktiką?", "rodyk programos rezultatus" — fell to the
      // WORKER handlers (the owner's own skill gap, a message to an employer,
      // the owner's own internship search). "My students" is the institution
      // speaking; the handler reads the question and answers from the
      // institution's real reads (outcomes) or states the privacy boundary.
      p("(mano|mūsų|my|our|meine|unsere|mijn|onze|мои|моих|наши|наших|moje|moich|nasi|naszych)\\s+(student|mokin|besimokan|learner|schüler|leerling|студент|учащ|ucze[nń]|uczni)", 9),
      p("(kurie|kuris|which|welche|welke|какие|кто\\s+из|kt[oó]rzy|kt[oó]ry)\\s+(student|mokin|besimokan|learner|schüler|leerling|студент|учащ|ucze[nń]|uczni)", 9),
      p("(student|mokin|besimokan|learner|absolvent|schüler|leerling|студент|program|opleiding|программ)\\w*\\s*.{0,24}(rezultat|outcome|result|ergebnis|resultat|uitkomst|результат)", 8),
      p("(rezultat|outcome|result|ergebnis|resultat|uitkomst|результат)\\w*\\s*.{0,24}(student|mokin|besimokan|learner|absolvent|schüler|leerling|студент|program|opleiding|программ)", 8),
    ],
  },
  {
    intent: "context",
    patterns: [
      p("(ką\\s+tu\\s+(apie\\s+mane\\s+)?žinai|what\\s+do\\s+you\\s+know|что\\s+ты\\s+знаешь)", 5),
      // pl — "Co o mnie wiesz?" / "Co wiesz o mnie?"
      p("(co\\s+o\\s+mnie\\s+wiesz|co\\s+wiesz\\s+o\\s+mnie)", 5),
      // de "Was weißt du über mich?" (also typed "weisst") / nl "Wat weet je
      // over mij?"
      p("(was\\s+wei(ß|ss)t\\s+du|wat\\s+weet\\s+je)", 5),
      p("(kokiame\\s+kontekst|current\\s+context|мой\\s+контекст|mein\\s+kontext|mijn\\s+context)", 4),
      p("(kur\\s+aš\\s+dabar\\s+esu|where\\s+am\\s+i\\s+now)", 4),
    ],
  },
  {
    // WHAT CAN I ACHIEVE FROM HERE — the question a person asks before they
    // know the product. It scored 0 and fell to the generic fallback, whose
    // composed capability sentence answers a PERSON with nothing at all.
    //
    // Deliberately narrower than it looks. EVERY form pairs a CAN verb
    // ("galiu", "can i", "могу", "kan ik", "kann ich") with a DO verb. That
    // is what keeps it out of `next-action` ("ką dar TURIU padaryti" —
    // obligation, not capability) and out of the value-intent family ("ką
    // galiu PASIŪLYTI" — an offer, not a question about the account).
    // Diacritics are folded on both sides, so the undiacriticked spellings
    // people actually type match without separate variants.
    //
    // THE "POSSIBILITIES" FAMILY IS DELIBERATELY ABSENT, in all five locales.
    // "Kokias galimybes man gali pasiūlyti?" / "Какие возможности у меня
    // есть?" / "Welche Möglichkeiten habe ich?" already mean the OPPORTUNITY
    // BOARD in this product — the first of those is an owner-pinned phrase
    // contract (`owner-phrase-contract.test.ts`). A first draft of this rule
    // claimed that family and silently re-routed three locales away from the
    // owner's own recorded meaning; the guards caught it. It is dropped
    // UNIFORMLY rather than in the three locales that happened to fail, so
    // the vocabulary cannot become reachable by a phrasing in one language
    // and not the others.
    intent: "capabilities",
    patterns: [
      p("(ką|kas)\\s+(aš\\s+)?galiu\\s+(čia\\s+|šioje\\s+|šitoje\\s+|dabar\\s+)?[^.]{0,24}(padaryti|daryti|nuveikti)", 6),
      p("(ką|kas)\\s+(čia|šioje\\s+paskyroje|šioje\\s+sistemoje)\\s+galima\\s+(pa)?daryti", 6),
      p("kam\\s+skirta\\s+(ši|šita)\\s+(paskyra|sistema|platforma)", 4),
      // ── AND THE SAME QUESTION ASKED ABOUT THE ORGANIZATION (E, 2026-09-10).
      // "Ką gali mūsų agentūra?" scored 0. The capability answer already
      // reads the ACTIVE organization, so this needed a way in, not a second
      // answer. A CAN verb plus an organisation noun, same shape as above.
      p("(ką|ka)\\s+gali\\s+(mūsų|musu|ši|si|šita|šios|mano)\\s+[^.]{0,16}(agentūra|agentura|įmonė|imone|imon|organizacij|mokykl|bendrov|kompanij)", 6),
      p("what\\s+can\\s+(our|this|my)\\s+[^.]{0,16}(agency|company|organi[sz]ation|school|business|firm)\\s+do", 6),
      p("что\\s+может\\s+(наше|наша|наш|эта|это)\\s+[^.]{0,16}(агентство|компани|организаци|школа|фирма)", 6),
      p("wat\\s+kan\\s+(ons|onze|dit|deze)\\s+[^.]{0,16}(bureau|bedrijf|organisatie|school)\\s+doen", 6),
      p("was\\s+kann\\s+(unser|unsere|diese|dieses)\\s+[^.]{0,16}(agentur|firma|unternehmen|organisation|schule)", 6),
      p("what\\s+can\\s+i\\s+do", 6),
      p("what\\s+can\\s+(this|the|my)\\s+(account|workspace|platform|system|space)\\s+do", 5),
      p("что\\s+я\\s+могу\\s+[^.]{0,20}(сделать|делать)", 6),
      p("что\\s+(здесь|тут)\\s+можно\\s+(с)?делать", 6),
      p("wat\\s+kan\\s+ik\\s+(hier\\s+)?doen", 6),
      p("was\\s+kann\\s+ich\\s+(hier\\s+)?(machen|tun)", 6),
      // pl — "Co mogę tutaj zrobić?" / "Co można tu zrobić?". A CAN verb
      // bound to a DO verb, exactly like the four above, so "Co powinienem
      // zrobić dalej?" (obligation) stays `next-action` and "Jakie mam
      // możliwości?" stays the opportunity board.
      p("co\\s+(ja\\s+)?mog[eę]\\s*.{0,20}(zrobi[cć]|robi[cć])", 6),
      p("co\\s+(tu|tutaj)\\s+mo[zż]na\\s*.{0,12}(zrobi[cć]|robi[cć])", 6),
      p("co\\s+mo[zż]e\\s+(nasza|nasz|moja|m[oó]j|ta)\\s+[^.]{0,16}(agencj|firm|organizacj|szko[lł]|sp[oó][lł]k)", 6),
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
      // pl — the switching verb itself, and the way back to the personal
      // space. "Przenieś …" (move a worker) is a different verb and keeps
      // its own intent.
      p("(prze[lł][aą]cz|przelacz)", 5),
      p("(wr[oó][cć]|powr[oó][tć])\\s*.{0,12}(do\\s+)?(mojej\\s+)?(przestrzeni\\s+)?(osobist|prywatn)", 5),
      p("(pracuj[eę]|dzia[lł]am)\\s+(teraz\\s+)?jako\\s+(firm|pracownik|organizacj|osob)", 5),
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
      p("(praktik|stažuot|stazuot|internship|apprentice|trainee|praktikum|ausbildung|\\bstage\\b|stagiair|стажир|практик|praktyk|\\bsta[zż]\\b|\\bsta[zż]u\\b)", 4),
      p("(what|which)\\s+.{0,12}(suits?|fits?)\\s+me", 3),
      p("что\\s+мне\\s+подходит", 3),
      p("co\\s+(mi|dla\\s+mnie)\\s+.{0,12}(pasuje|odpowiada)", 3), // pl
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
      // pl — "Kto jest zainteresowany moim zapotrzebowaniem?" / "kto się
      // zainteresował". The interest stem carries the signal, exactly as
      // `susidomėj` and `заинтересовал` do.
      p("zainteresowa", 6),
      p("(kto|kt[oó]ra?)\\s+.{0,24}(odpowiedzia[lł]|zg[lł]osi)", 5),
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
      // pl — "Co muszę zatwierdzić?" / "zatwierdzenia". The APPROVE verb is
      // `zatwierdz`, never `potwierdz` (that is `confirm-work` /
      // `who-verifies-work`), so the two loops cannot swap sentences.
      p("(co|kt[oó]re)\\s+.{0,16}(zatwierdzi|zaakceptowa)", 6),
      p("zatwierdz", 4),
      p("akceptacj", 4),
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
      // pl — both orders: "zaimportuj ewidencję czasu pracy" / "ewidencję
      // czasu pracy zaimportuj". The IMPORT verb is required exactly as
      // above, so "Otwórz moją ewidencję czasu pracy" stays `timesheets`.
      p("(zaimportuj|importuj|wgraj|wgra[cć]|za[lł]aduj|prze[sś]lij|wczytaj)\\s*.{0,20}(ewidencj|kart[eęy]\\s+czasu|godzin|excel|xlsx|arkusz)", 8),
      p("(ewidencj|kart[aeęy]\\s+czasu|godzin|excel)\\w*\\s*.{0,20}(zaimportowa|zaimportuj|wgra[cć]|wczyta)", 8),
      // ── "I WANT TO BRING MY PAST WORK IN" ───────────────────────────────
      //
      // Every rule above needs the word TIMESHEET (or hours, or excel). Nobody
      // says that first. Measured 2026-09-08:
      //
      //   lt "noriu įkelti senus darbo duomenis"          -> find-work
      //   de "ich möchte meine alten Arbeitsdaten hochladen" -> find-work
      //   en "i want to upload my old work history"       -> unknown
      //   ru "хочу загрузить старые данные о работе"      -> unknown
      //   nl "ik wil mijn oude werkgegevens uploaden"     -> unknown
      //
      // The two that answered are worse than the three that did not: a person
      // asking to UPLOAD their history was shown JOB ADVERTS. They landed on
      // `find-work`'s bare `darbo` / `arbeit` noun at weight 1–3 — a fallback
      // artefact, not a reading. J-IMPORT-HISTORY is a canonical journey and
      // it had no front door in four of the five routed locales.
      //
      // Three shapes, because the languages build the sentence differently:
      // verb-first (lt/en/ru), verb-last (de/nl), and no verb at all.
      //
      // An "old / previous" marker is REQUIRED. Without it "upload my CV"
      // would be captured from the CV family, which is a different request
      // with its own five-way split.
      p(
        "(įkel|importuo|perkel|upload|import|загруз|импортир|перенес|hochlad|importier|einles|importeer|inlez)" +
          "\\w*\\s*.{0,28}(sen|ankstesn|buvusi|istorin|old|previous|past|earlier|former|historical|" +
          "стар|прежн|предыдущ|прошл|alte|früher|fruher|bisherig|vergangen|oude|vorige|eerdere)" +
          "\\w*\\s*.{0,20}(darb|valand|duomen|work|job|hour|data|histor|данн|работ|час|arbeit|beruf|stunden|werk|uren)",
        8,
      ),
      // Verb-last, which is how German and Dutch actually say it:
      // "meine alten Arbeitsdaten hochladen", "mijn oude werkgegevens uploaden".
      p(
        "(sen|ankstesn|old|previous|past|стар|прежн|прошл|alte|früher|fruher|bisherig|vergangen|oude|vorige|eerdere)" +
          "\\w*\\s*.{0,24}(darb|valand|duomen|work|job|hour|data|histor|данн|работ|час|arbeit|beruf|stunden|werk|uren)" +
          "\\w*\\s*.{0,24}(įkel|importuo|perkel|upload|import|загруз|импортир|hochlad|importier|einles|importeer|inlez)",
        8,
      ),
      // No verb at all — the person describes what they are holding:
      // "i have my previous jobs in a spreadsheet".
      p(
        "(sen|ankstesn|old|previous|past|стар|прежн|прошл|alte|früher|fruher|oude|vorige|eerdere)" +
          "\\w*\\s*.{0,24}(darb|work|job|hour|valand|работ|час|arbeit|stunden|werk|uren)" +
          "\\w*\\s*.{0,24}(spreadsheet|excel|xlsx|csv|эксел|табел)",
        8,
      ),
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
      // pl — "ewidencja czasu pracy" / "karta czasu pracy". The compound is
      // required: a bare "karta" is the player card, exactly as a bare
      // "Karte" / "kaart" is in de/nl.
      p("ewidencj\\w*\\s+czasu", 6),
      // Weight 8: a bare "kartę" is the player card (7), so the timesheet
      // COMPOUND has to outscore it — the same trick `market-map` uses for
      // "Arbeitsmarktkarte" against `player-card`'s bare "Karte".
      p("kart[aeęy]\\s+czasu\\s+pracy", 8),
      p("lista\\s+obecno[sś]ci", 6),
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
      p("godzin\\w*\\s+pracy", 5), // pl — "godziny pracy" / "godzin pracy"
      p("(rejestr|ewidencj)\\w*\\s+godzin", 5), // pl
      // The OPEN framing, deliberately weaker than the document rules above.
      p("(atidaryk|atverk|open|открой|öffne|otw[oó]rz)\\s*.{0,12}(valand|hour|час|stunden|uren|uur|godzin)", 4),
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
      // pl — the BALANCE half. `admin-requests` keeps FILING a leave
      // request ("Chcę złożyć wniosek urlopowy"), which carries no "ile"
      // and no balance noun, exactly as in the four locales above.
      p("(\\bile\\b|zosta[lł]o)\\s*.{0,24}(urlop|dni\\s+wolnego|dni\\s+wolnych)", 8),
      p("(urlopu|urlopowych)\\s+(zosta|dni|saldo)", 8),
      p("kto\\s+(jest\\s+)?(na\\s+urlopie|nieobecn|chory|choruje)", 8),
      p("nieobecno[sś]", 5),
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
      p("\\burlop", 5), // pl — urlop / urlopowy / urlopu
      p("\\bwniosek\\b|\\bwniosk", 4), // pl
      p("(z[lł]o[zż]y[cć]|napisa[cć]|sk[lł]ada[cć]|chc[eę])\\s*.{0,16}wniosek", 6), // pl
      p("\\bzwolnieni[ea]\\s+lekarskie", 5), // pl — sick note
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
      p("(pažymėjim|sertifikat|certificate|zertifikat|certificaat|certyfikat|za[sś]wiadczeni)", 4),
      p("\\bсертификат", 4),
      // Owner contract 2026-09-04 §12 — "what expires / what document am I
      // missing": expiry and permit words are document questions even when
      // the folder is not named. Answered from the person's own rows.
      p("(baigia|baigsis|pasibaig)\\s+galio", 5),
      p("\\b(expir(es|ing|y|ed)|runs?\\s+out)\\b", 5),
      p("(истека|заканчива).{0,12}(срок|действ)", 5),
      p("\\b(verloopt|verlopen|läuft\\s+ab|laeuft\\s+ab|abgelaufen)\\b", 5),
      p("\\b(wygasa|wygasaj|wyga[sś]|traci\\s+wa[zż]no[sś])", 5), // pl
      p("(leidim|permit|a1\\b|razrešen|разрешени|pozwoleni)", 4),
      // ── WHAT A COUNTRY REQUIRES (owner P0 2026-09-22 §5) ────────────────
      //
      // "Ką turiu pateikti darbui Norvegijoje?" scored 0 everywhere, while
      // `/dashboard/documents` already computes exactly that answer
      // (`computeCountryReadiness` + `?country=`): the person asking what a
      // market requires of them was answered by the not-understood menu.
      // The shape is closed — a WHAT + a must/need word + a submit/have
      // word — so it cannot swallow a general question, and the country
      // itself is read downstream from the same sentence.
      p(
        "(k[aą]|what|что|was|wat|co)\\s+(?:[^\\s]+\\s+){0,3}?" +
          "(turiu|reikia|reikės|need|must|нужно|должен|brauche|muss|moet|" +
          "potrzebuj|musz[eę])\\s*.{0,24}" +
          "(pateikt|tur[eė]t|paruo[sš]t|submit|provide|bring|have|show|" +
          "предостав|подат|иметь|vorlegen|mitbringen|haben|indienen|" +
          "meenemen|hebben|z[lł]o[zż]y[cć]|przedstawi[cć]|mie[cć])",
        5,
      ),
      // …and the PURPOSE phrase, as a second independent signal. "for work
      // in Norway" / "darbui Norvegijoje" says the question is about what
      // working THERE requires. Measured: the English sentence also matched
      // find-work's "I need … work" seek shape (10) — "need to submit for
      // work" is not seeking work — so the requirement reading needs both
      // signals to outrank it (5 + 6 = 11). A real job search ("I'm looking
      // for work in Norway") matches only THIS pattern (6) and stays on
      // find-work: that is the control which keeps the pair honest.
      p(
        "(pateikt|paruo[sš]t|tur[eė]t|submit|provide|bring|have|show|" +
          "предостав|подат|иметь|vorlegen|mitbringen|haben|indienen|meenemen|" +
          "hebben|z[lł]o[zż]y[cć]|przedstawi[cć]|mie[cć])\\s*.{0,16}" +
          "(darbui|darbo\\s+vietai|for\\s+work|for\\s+a\\s+job|для\\s+работы|" +
          "f[uü]r\\s+die\\s+arbeit|zum\\s+arbeiten|voor\\s+werk|do\\s+pracy)",
        6,
      ),
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
      // pl — "mapa rynku pracy". The compound is required for the same
      // reason as in de/nl: a bare "kartę" is the player card.
      p("map[aeęy]\\s*.{0,16}(rynku|pracy|rynek)", 8),
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
    intent: "my-team",
    patterns: [
      p(
        "(mano|my|моя|мою|meine|mijn|moj[aąeę])\\s*.{0,12}" +
          "(komand|team\\b|brigad|команд|бригад|ploeg|mannschaft|zesp[oó][lł]|za[lł]og)",
        6,
      ),
      p(
        "(parodyk|rodyk|atidaryk|show|open|покажи|открой|zeig|toon|laat|poka[zż]|wy[sś]wietl)" +
          "\\s*.{0,14}(komand|team\\b|brigad|команд|бригад|ploeg|mannschaft|zesp[oó][lł]|za[lł]og)",
        6,
      ),
      // The people themselves, named as a relationship rather than a noun
      // the whole product uses ("kolegos", "colleagues", "коллеги").
      p("(koleg[oaų]|colleague|коллег|kollege|collega|wsp[oó][lł]pracownik)", 5),
    ],
  },
  {
    /**
     * MY TEAM (owner P0 2026-09-22 §5) is the rule ABOVE this one.
     * `/dashboard/network` — the relationships surface the primary nav
     * carries and the invitation answers already chip to — is the answer to
     * "Parodyk mano komandą", which scored 0 everywhere before. A possessive
     * (or a show-verb) plus a team word; never a bare "žmonės/people", which
     * would swallow half the product's sentences.
     */
    intent: "activity",
    patterns: [
      p("\\bpranešim", 5), // lt
      p("\\bnotification", 5), // en
      p("\\bуведомлени", 5), // ru
      p("\\bmelding", 5), // nl — bounded, so "aanmelding" is not a notification
      p("benachrichtigung", 7), // de — see the trap above
      // pl — the SAME trap as German: "poWIADOMienia" is not "wiadomości".
      // The two stems share no prefix, so the split needs no weight trick.
      p("\\bpowiadomieni", 5),
      p("(veiklos\\s+sraut|activity\\s+(centre|center|feed)|лента\\s+событ|activiteitencentrum|aktivitäten|centrum\\s+aktywno[sś])", 5),
      p(
        "(ką\\s+reikia\\s+peržiūrėti|needs\\s+my\\s+attention|требует\\s+внимания|erfordert\\s+meine\\s+aufmerksamkeit|vraagt\\s+mijn\\s+aandacht)",
        6,
      ),
      // A bare "what's new?" with no company/project noun after it — the
      // rules above keep those, because they name what is being asked about.
      p("(kas\\s+naujo|what'?s\\s+new|что\\s+нового|was\\s+ist\\s+neu|wat\\s+is\\s+er\\s+nieuw|co\\s+nowego)", 4),
    ],
  },
  {
    intent: "create-project",
    patterns: [
      // F2 — "sukurk projektą Roterdame", "naujas objektas Vilniuje", "new
      // project in Rotterdam", "neues Projekt / Baustelle anlegen", "nieuw
      // project", "создай проект / объект": a SITE as a project object.
      p("(sukur|kurti|prid[eė]|prad[eė]|nauj|create|new|add|start|erstell|anleg|maak|nieuw|создать|создай|нов|utw[oó]rz|stw[oó]rz|za[lł][oó][zż])\\w*\\s*.{0,20}(projekt|project|проект|objekt|statybviet|baustelle|bouwplaats|стройплощад|объект|budow)", 8),
      // noun → verb: "projektą sukurti", "Projekt anlegen", "project aanmaken"
      p("(projekt|project|проект|objekt|baustelle|bouwplaats|объект|budow)\\w*\\s*.{0,16}(sukur|kurti|prad[eė]|create|erstell|anleg|aanmak|создать|создай|utworzy[cć]|za[lł]o[zż]y[cć])", 8),
    ],
  },
  {
    intent: "agency-invites",
    patterns: [
      // The CLIENT's other two bridge edges (2026-09-19): an agency invited
      // this company ("agentūra pakvietė", "agency invitation", "агентство
      // пригласило", "bureau heeft uitgenodigd", "Agentur hat eingeladen"),
      // and sharing a need WITH an agency ("pasidalinti poreikiu su
      // agentūra", "share the request with the agency", "поделиться
      // запросом с агентством", "deel de aanvraag met het bureau",
      // "Anfrage mit der Agentur teilen"). Same weight class as the offers
      // read; the agency's own "invite a CLIENT" keeps its client noun.
      p("(agent[uū]r|agency|agencies|агент|uitzend|bureau|agentur|agencj)\\w*\\s*.{0,24}(pakviet|kviet|invit|приглас|приглаш|uitnodig|uitgenodigd|einlad|eingeladen|zaprosi|zaprasza|zapro[sś])", 12),
      p("(pakviet|kviet|invit|приглас|приглаш|uitnodig|uitgenodigd|einlad|eingeladen|zaprosi|zaprasza|zapro[sś])\\w*\\s*.{0,24}(agent[uū]r|agency|agencies|агент|bureau|agentur|agencj)", 12),
      p("(pasidal|dalin|dalink|share|подел|deel|teil|podziel|udost[eę]pni)\\w*\\s*.{0,40}(agent[uū]r|agency|agencies|агент|bureau|agentur|agencj)", 12),
      p("(agent[uū]r|agency|agencies|агент|bureau|agentur|agencj)\\w*\\s*.{0,30}(pasidal|dalin|dalink|share|подел|deel|teil|podziel|udost[eę]pni)", 12),
    ],
  },
  {
    intent: "propose-booking",
    patterns: [
      // The DIRECT employer offers work, by sentence ("pasiūlyti darbą
      // kandidatui", "offer the job to a worker", "предложить работу
      // кандидату", "werk aanbieden aan een kandidaat", "einem Kandidaten
      // Arbeit anbieten", "rezervuoti darbuotoją"). The sentence reaches
      // the candidates panel of the open need; the offer itself is the
      // panel's token-confirmed button — a sentence never picks a person.
      // pl (2026-09-20): the offer verb group gains `zaproponow` /
      // `zaoferow` and the work-noun group gains `prac` — "Chcę
      // zaproponować pracę kandydatowi". `propose-candidate` above keeps
      // only `zaproponuj` / `proponu`, which do not match the infinitive,
      // so the two agency acts cannot swap sentences.
      p("(pasi[uū]lyt|pasi[uū]lyk|si[uū]l|offer|propos|предлож|aanbied|bied|anbiet|biete|zaproponow|zaoferow)\\w*\\s*.{0,24}(darb[aąo]|work|job|booking|rezerv|работ|бронир|werk|baan|arbeit|auftrag|prac[aeęy])\\w*\\s*.{0,24}(darbuotoj|worker|candidate|kandida|работник|кандидат|werknemer|arbeiter|kandydat|pracownik)", 14),
      p("(booking|rezervuo|užsakyt|book|бронир|забронир|boek|buch|zarezerwuj|zarezerwowa)\\w*\\s*.{0,20}(darbuotoj|worker|kandida|candidate|работник|кандидат|werknemer|arbeiter|kandydat|pracownik)", 14),
      p("(darbuotoj|worker|kandida|candidate|работник|кандидат|werknemer|arbeiter)\\w*\\s*.{0,24}(pasi[uū]lyt|pasi[uū]lyk|offer|propos|предлож|aanbied|anbiet)\\w*\\s*.{0,16}(darb|work|job|работ|werk|arbeit)", 14),
      p("(darb[aąo]|work|job|работ|werk|baan|arbeit)\\w*\\s*.{0,16}(pasi[uū]lyt|pasi[uū]lyk|si[uū]l|offer|propos|предлож|aanbied|bied|anbiet|biete)\\w*\\s*.{0,24}(darbuotoj|worker|candidate|kandida|работник|кандидат|werknemer|arbeiter)", 14),
      p("(darbuotoj|worker|candidate|kandida|работник|кандидат|werknemer|arbeiter)\\w*\\s*.{0,24}(darb[aąo]|work|job|работ|werk|baan|arbeit)\\w*\\s*.{0,16}(pasi[uū]lyt|pasi[uū]lyk|si[uū]l|offer|propos|предлож|aanbied|bied|anbiet|biete)", 14),
    ],
  },
  {
    intent: "agency-offers",
    patterns: [
      // The CLIENT asks what an agency proposed: "kokius kandidatus pasiūlė
      // agentūra?", "agentūros pasiūlymai", "agency offers", "offered
      // candidates", "предложенные кандидаты", "aangeboden kandidaten",
      // "vorgeschlagene Kandidaten". Identity-routed in the chat: an agency
      // workspace reads it as its own proposal status.
      p("(agent[uū]r|agency|agencies|агент|uitzend|bureau|agentur|agencj)\\w*\\s*.{0,24}(pasi[uū]l|si[uū]lo|kandidat|offer|propos|candidate|предлож|кандидат|voorstel|aanbod|kandida|vorschl|angebot|kandydat|propozycj|zaproponow)", 9),
      p("(pasi[uū]lyt|si[uū]lom|offered|proposed|предложен|aangeboden|voorgesteld|vorgeschlagen|angebotene|zaproponowa|zg[lł]oszon)\\w*\\s*.{0,12}(kandidat|candidate|кандидат|kandida|kandydat)", 9),
      // noun first: "kandidatus pasiūlė agentūra", "Kandidaten … die Agentur",
      // "kandidaten … het bureau", "кандидатов предложило агентство",
      // "kandydatów zaproponowała agencja"
      p("(kandidat|candidate|кандидат|kandida|kandydat)\\w*\\s*.{0,28}(agent[uū]r|agency|agencies|агент|bureau|agentur|agencj)", 9),
      p("(pasi[uū]l|si[uū]l|offer|propos|предлож|aangebod|aanbied|vorschl|vorgeschlag|zaproponow|zaoferow)\\w*\\s*.{0,20}(agent[uū]r|agency|agencies|агент|bureau|agentur|agencj)", 9),
    ],
  },
  {
    intent: "add-document",
    patterns: [
      // "turiu naują A1 iki 2027-03", "gavau leidimą dirbti", "pratęsiau
      // pažymėjimą", "I have a new VCA", "renewed my certificate", "habe
      // einen neuen Ausweis", "ik heb een nieuwe vergunning", "получил
      // разрешение": a document to RECORD, not the documents folder to open.
      p("(turiu|gavau|atsinaujin|prat[eę]s|prid[eė]|[iį]kel|u[zž]ra[sš]|užregistr|have|got|renewed|add|upload|record|habe|bekommen|erneuert|hinzuf|heb|gekregen|verlengd|toevoeg|получил|продлил|добав|загруз|запиш|\\bmam\\b|otrzyma|przed[lł]u[zż]y|dosta[lł])\\w*\\s*.{0,24}(dokument|pa[zž]ym|sertifik|certif|certyfik|za[sś]wiadczeni|leidim|permit|pozwoleni|pas[aą]\\b|passport|\\ba1\\b|\\bvca\\b|zertifik|ausweis|vergunning|paspoort|документ|сертиф|разрешен|паспорт)", 9),
      p("(nauj|new|neu|nieuw|нов|\\bnow)\\w*\\s*.{0,10}(pa[zž]ym|sertifik|certificate|zertifikat|certificaat|certyfik|za[sś]wiadczeni|сертификат|leidim|permit|pozwoleni|vergunning|\\ba1\\b|\\bvca\\b)", 9),
    ],
  },
  /**
   * ── THE PHOTO SHOWN BACK (issue #1689, defect G) ─────────────────────────
   *
   * BEFORE the CV rules and weighted level with them (8), because this is
   * the sentence that used to fall INTO them: with no photo / file /
   * gallery vocabulary anywhere in this table, "Parodyk įkeltą nuotrauką ar
   * tikrai išsisaugojo" scored 0, the proposer chose `cv-view` from the
   * catalogue, and a worker whose photo WAS persisted was told the CV held
   * nothing. Every pattern requires a PHOTO / FILE noun or a second-person
   * "what you saved", so a CV sentence, a document sentence or a work entry
   * cannot land here by a verb alone.
   *
   * A READBACK, never a deposit: "įkeltą" / "uploaded" / "загруженное" /
   * "hochgeladene" / "geüploade" are PAST forms — the person is asking about
   * a file already handed over, not handing one over. `readFileIntent`
   * ignores those forms for the same reason (file-subject.ts).
   */
  {
    intent: "evidence-photos",
    patterns: [
      // SHOW / SEE / CHECK … PHOTO. "parodyk (įkeltą) nuotrauką", "show the
      // photo I just uploaded", "покажи загруженное фото", "laat de foto
      // zien", "zeig das Foto", "Foto anzeigen".
      p("(parodyk|rodyk|pamaty|matyt|perzi[uū]r|peržiūr|patikrin|atidaryk|show|see\\b|view|check|open|покаж|посмотр|провер|открой|laat|toon|bekijk|zeig|anzeig|ansehen|sehen|pr[uü]f|poka[zż]|zobacz|obejrz|sprawd[zź]|wy[sś]wietl)\\w*\\s*.{0,24}(nuotrauk|\\bfoto|photo|picture|\\bimage|фото|снимк|afbeelding|\\bbild|zdj[eę]ci)", 8),
      // PHOTO … SHOW (verb last: "die Fotos anzeigen", "de foto's bekijken",
      // "nuotrauką parodyk").
      p("(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci)\\w*\\s*.{0,16}(parodyk|rodyk|pamaty|perzi[uū]r|peržiūr|show|see\\b|view|open|bekijk|zien|tonen|anzeig|ansehen|zeig|покаж|посмотр|poka[zż]|zobacz|obejrz)", 8),
      // DID IT SAVE? "ar nuotrauka išsisaugojo", "did my photo save", "is the
      // file saved", "сохранилось ли фото", "is de foto opgeslagen", "wurde
      // das Foto gespeichert" — in both orders.
      p("(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci|\\bfail[aąuoi]|\\bfile|\\bfailas|файл|bestand|datei|\\bplik)\\w*\\s*.{0,24}(issisaugo|išsisaugo|issaugo|išsaugo|isliko|išliko|ikelt|įkelt|\\bsave|uploaded|сохран|загруж|opgeslagen|ge[uü]pload|gespeichert|hochgeladen|zapisa|wgran|przes[lł]an)", 8),
      p("(issisaugo|išsisaugo|issaugo|išsaugo|isliko|išliko|\\bsaved|\\bsave\\b|сохрани|opgeslagen|gespeichert|zapisa)\\w*\\s*.{0,24}(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci|\\bfail[aąuoi]|\\bfile|файл|bestand|datei|\\bplik)", 8),
      // THE ONE JUST UPLOADED: "ką tik įkeltas failas", "the photo I just
      // uploaded", "загруженный файл", "das hochgeladene Foto", "de
      // geüploade foto" — a past form beside a photo / file noun.
      p("(ikelt|įkelt|uploaded|загружен|hochgeladen|ge[uü]pload|wgran|przes[lł]an|za[lł]adowan)\\w*\\s*.{0,16}(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci|\\bfail[aąuoi]|\\bfile|файл|bestand|datei|\\bplik)", 8),
      p("(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci|\\bfail[aąuoi]|\\bfile|файл|bestand|datei|\\bplik)\\w*\\s*.{0,24}(ikelt|įkelt|uploaded|загружен|hochgeladen|ge[uü]pload|wgran|przes[lł]an|za[lł]adowan)", 8),
      // THAT / THIS PHOTO — the demonstrative alone points at the one just
      // handed over: "ta nuotrauka", "šita nuotrauka", "that photo", "это
      // фото", "die foto", "das Bild".
      p("\\b(ta|toji|sita|šita|si|ši|that|this|та|эта|это|dat|die|deze|das|dieses|jenes|to|tamto)\\s+(nuotrauk|\\bfoto|photo|picture|фото|снимк|afbeelding|\\bbild|zdj[eę]ci)", 8),
      // WHAT YOU SAVED — second person, so "parodyk išsaugotus kriterijus"
      // (a criteria readback) stays where it is: "parodyk ką išsaugojai",
      // "show what you saved", "покажи что сохранил", "laat zien wat je hebt
      // opgeslagen", "zeig was du gespeichert hast".
      p("(parodyk|rodyk|show|покаж|laat|toon|zeig|poka[zż])\\w*\\s*.{0,16}(issaugojai|išsaugojai|issaugojote|išsaugojote|you\\s+saved|you\\s+(just\\s+)?stored|сохранил|je\\s+(hebt|had)\\s+opgeslagen|opgeslagen\\s+hebt|du\\s+gespeichert\\s+hast|gespeichert\\s+hast|co\\s+zapisa[lł]e[sś])", 8),
      // THE GALLERY BY NAME: "mano galerija", "open the gallery", "галерея".
      p("(galerij|gallery|галере|galerie|galeri)", 8),
    ],
  },
  /**
   * ── THE CV, AS FIVE SEPARATE REQUESTS (owner window 11 §5 / §30) ─────────
   *
   * These four rules come BEFORE the noun-only `cv` rule further down and are
   * weighted 8 against its 3, because the distinction they carry is the one
   * the owner names first: an ambiguous READ must never become a WRITE.
   *
   * Reached destination, per rule:
   *   cv-export → /cv, framed as taking the sheet out (download / print)
   *   cv-view   → /cv, framed as looking at what the product already holds
   *   cv        → the CV IMPORT flow — only ever with an explicit write verb
   *   cv-choose → one question with the three real doors; nothing happens
   *
   * `cv-view` and `cv-export` land on the SAME existing page. That is not a
   * duplicate capability: `/cv` IS the person's CV, and printing it is what
   * that page does. What differs is the sentence the product answers with,
   * and §5 says the distinction has to survive in what the person is told.
   */
  {
    intent: "cv-export",
    patterns: [
      // TAKING IT OUT: "atsisiųsk CV", "CV PDF", "eksportuok CV", "download /
      // export / print my CV", "скачай моё резюме", "Lebenslauf herunterladen".
      // `parodyk`/`show` moved to `cv-view` below — showing is not exporting,
      // and the page reached is the same either way.
      p("(atsisi[uų]s|atsisiųsk|eksportuo|spausdin|download|export|print|скача|экспорт|распечат|exporteer|print|herunterlad|exportier|druck|pobierz|pobra[cć]|wyeksportuj|wydrukuj)\\w*\\s*.{0,16}(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)", 8),
      p("(\\bcv\\b|résumé|resume|резюме|lebenslauf|[zż]yciorys)\\w*\\s*.{0,8}(pdf|atsisi[uų]st|export|herunterlad|скача|pobra|pobierz)", 8),
    ],
  },
  {
    intent: "cv-view",
    patterns: [
      // SEEING / OPENING what already exists. Every verb here was measured
      // against the live router on 2026-09-07 and reached the IMPORT flow.
      // LT: pamatyti / peržiūrėti / atidaryti / atverti / rodyk / parodyk
      // EN: see / view / open / look at / check
      // RU: посмотреть / увидеть / открой / глянуть / покажи
      // NL: bekijken / zien / openen / tonen   DE: sehen / ansehen / öffnen / zeigen
      p("(pamaty|maty[ct]|perzi[uū]r|peržiūr|atidary|atvert|atverk|rodyk|parodyk|see\\b|view|open|show|look\\s+at|check|посмотр|увидет|открой|открыт|гляну|покаж|bekijk|zien|openen|tonen|toon|sehen|ansehen|anschau|[oö]ffnen|zeig|zobacz|obejrz|przejrz|przegl[aą]d|otw[oó]rz|poka[zż]|wy[sś]wietl|sprawd[zź])\\w*\\s*.{0,16}(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)", 8),
      // VERB LAST — Dutch and German put it there ("Ik wil mijn cv BEKIJKEN",
      // "Ich möchte meinen Lebenslauf ANSEHEN"), and Lithuanian often does
      // too ("Mano CV parodyk"). Measured: both nl/de parity sentences fell
      // through to `cv-choose` with only the verb-first rule above, which is
      // the exact G3 failure mode — a capability reachable in three languages
      // and silently unreachable in the other two.
      p("(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)\\w*\\s*.{0,16}(pamaty|perzi[uū]r|peržiūr|atidary|atvert|rodyk|parodyk|\\bsee\\b|view|open|show|bekijk|zien|openen|tonen|sehen|ansehen|anschau|[oö]ffnen|zeig|посмотр|увидет|открыт|zobacz|obejrz|otworzy)", 8),
      // LOCATING it: "kur mano CV", "where is my CV", "где моё резюме",
      // "waar is mijn cv", "wo ist mein Lebenslauf", "gdzie jest moje cv".
      p("(\\bkur\\b|\\bwhere\\b|\\bгде\\b|\\bwaar\\b|\\bwo\\b|\\bgdzie\\b)\\s*.{0,20}(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)", 8),
      // READING BACK its content: "ką dabar rodo mano CV", "what does my CV
      // say", "что показывает моё резюме" — a question about the state, in
      // both word orders.
      p("(rodo|rodys|shows|says|показыв|говорит|zeigt|laat\\s+zien|staat|pokazuje)\\s*.{0,16}(\\bcv\\b|résumé|resume|резюме|lebenslauf|[zż]yciorys)", 8),
      p("(\\bcv\\b|résumé|resume|резюме|lebenslauf|[zż]yciorys)\\w*\\s*.{0,16}(rodo|rodys|shows|says|показыв|говорит|zeigt|staat|pokazuje)", 8),
    ],
  },
  {
    intent: "add-task",
    patterns: [
      // PROJECT → WORK: "pridėk užduotį", "nauja užduotis projektui", "add a
      // task", "neue Aufgabe", "nieuwe taak", "добавь задачу" — a work
      // package on the company's project, by sentence.
      p("(prid[eė]|sukur|nauj|u[zž]ra[sš]|create|add|new|erstell|neu|maak|nieuw|добав|создай|нов|dodaj|doda[cć]|utw[oó]rz|nowe\\s+zadan)\\w*\\s*.{0,16}(u[zž]duot|task|aufgabe|taak|задач|zadani)", 9),
      p("(u[zž]duot|task|aufgabe|taak|задач|zadani)\\w*\\s*.{0,12}(prid[eė]|sukur|create|add|erstell|anleg|toevoeg|aanmak|добав|создай|dodaj|doda[cć])", 9),
    ],
  },
  {
    intent: "who-available",
    patterns: [
      // ── A HAVE VERB PLUS A WORKER NOUN IS NEVER EMPLOYER DEMAND ─────────
      //
      // "Turime 20 darbuotojų" measured `need-workers` on 2026-09-08: WE HAVE
      // 20 employees read as WE NEED 20. There is no seek verb anywhere in
      // that sentence — it scored 4 on the bare `darbuotoj` noun, which the
      // demand side weights on its own. A noun-only rule cannot carry a
      // direction, and this is the second inversion it produced.
      //
      // It lands HERE rather than on the supply side on purpose. Who those
      // people are is genuinely ambiguous — a company describing its own
      // payroll and an agency describing its bench write the same sentence —
      // and the roster is the reading that assumes least: it shows the
      // speaker their own people rather than publishing an offer they did not
      // make. Naming a destination is what turns it into an offer, and that
      // rule sits on `offer-capacity` at a higher weight.
      //
      // Weight 5: above the bare noun's 4, below every real capacity rule.
      p(
        "(turim|turiu|turi|have|has|hebben|heeft|haben|hat|имеем|у\\s+нас|располага|\\bmamy\\b|\\bmam\\b)" +
          "\\w*\\s*.{0,30}(darbuotoj|worker|werknemer|medewerk|mitarbeit|arbeitskr|работник|pracownik)",
        5,
      ),
      // CAPACITY: "kas laisvas šią savaitę?", "kas gali dirbti rytoj?", "kas
      // atostogauja?", "who is available / free", "who can work", "wer ist
      // frei / verfügbar", "wie is beschikbaar / vrij", "кто свободен".
      // EVERY WHICH-WORD IS BOUNDED ON BOTH SIDES. Measured 2026-09-07 with
      // the owner's own §18 example: "Vandaag heb ik 8 uur op de Green TOWER
      // gewerkt" and "Heute habe ich 8 Stunden an der Green TOWER gearbeitet"
      // both classified `who-available` at weight 9 — a worker recording
      // their own day was read as a company asking who is free. The cause is
      // two unbounded stems meeting: `wer` sits inside **to-wer**, and the
      // present-tense verbs `werkt` / `arbeitet` sit inside the past
      // participles **ge-werkt** / **ge-arbeitet**. Neither half is unusual;
      // together they invert the direction of the sentence. `\b` here is the
      // Unicode-safe boundary, so the launch alphabets are covered too.
      p("(\\bkas\\b|\\bwho\\b|\\bwer\\b|\\bwie\\b|\\bкто\\b|\\bkto\\b)\\s+.{0,24}?(laisv|gali\\s+dirb|atostog|nedirb|available|free|can\\s+work|verfügbar|frei|kann\\s+arbeit|beschikbaar|vrij|kan\\s+werk|свобод|может\\s+работ|в\\s+отпуск|dost[eę]pn|wolny|wolni|mo[zż]e\\s+pracowa|na\\s+urlopie)", 9),
      p("(laisv\\w*\\s+(žmon|darbuotoj|komand)|available\\s+(people|workers|team)|verfügbare\\s+(leute|mitarbeiter)|beschikbare\\s+(mensen|medewerkers)|свободные\\s+(люди|работники)|dost[eę]pni\\s+(ludzie|pracownic))", 8),
      // Prod walk D1 (2026-09-05): "Sužinok, kurie darbuotojai nebus užimti
      // per artimiausias dienas" scored 0 here — the first rule needs "kas /
      // who" and the second needs "laisvi" BEFORE the noun — and the bare
      // `darbuotoj` stem (weight 4) in `need-workers` took a capacity
      // question for demand intake. WHICH-word + people-noun + free /
      // not-busy stem, in that order, is the same capacity question with
      // its subject named. Weight 9 so the bare noun stems cannot pull it
      // back. JS \w is ASCII-only, so the LT noun endings are consumed by
      // the gap, not by \w.
      p("(\\bkurie\\b|\\bkuris\\b|\\bkas\\b|\\bwhich\\b|\\bwho\\b|\\bwer\\b|\\bwelche|\\bwie\\b|\\bкто\\b|\\bкакие\\b|\\bkt[oó]rzy\\b|\\bkto\\b)\\s+.{0,24}?(darbuotoj|žmon|komand|worker|people|staff|mitarbeiter|leute|medewerker|mensen|работник|люди|pracownic|pracownik|ludzie)\\w*\\s*.{0,24}?(laisv|neužimt|nebus\\s+užimt|available|free|not\\s+busy|frei|verfügbar|vrij|beschikbaar|свобод|не\\s+занят|dost[eę]pn|wolni|nie\\s+b[eę]d[aą]\\s+zaj[eę])", 9),
      // Prod walk O1 (2026-09-06): "Kas rytoj dirba objekte X?" — a company
      // asking WHO IS ON a site tomorrow — scored 0 on every rule above (it
      // says "dirba", not "gali dirbti" and not "laisvas") and 1 on `log-work`,
      // whose bare "objekt" stem then answered the COMPANY with "Kurią dieną
      // ir kiek laiko dirbai?": a question about OTHER people, answered as a
      // request to record the asker's OWN hours. That is the same inversion as
      // the supply defect — someone else's state read as mine.
      //
      // WHICH-word + a present/future WORK verb is a coordination question,
      // never a work record: nobody writes down their own past day by asking
      // "who works". The verb group is present/future ONLY — "dirbau",
      // "dirbome", "worked" are absent — so a past-tense statement keeps its
      // journal route. Weight 9 so the bare site and day stems in `log-work`
      // cannot pull it back.
      // Both halves bounded — see the note on the first rule. The verbs are
      // the load-bearing half here: `\bwerkt\b` no longer matches inside
      // "gewerkt", so a Dutch or German worker's PAST-TENSE day keeps its
      // journal route, which is exactly what this rule's own comment already
      // promised ("dirbau", "dirbome", "worked" are absent) and did not
      // deliver for the two languages whose past tense is a prefix.
      p("(\\bkas\\b|\\bkurie\\b|\\bkuris\\b|\\bwho\\b|\\bwer\\b|\\bwelche|\\bwie\\b|\\bкто\\b|\\bkto\\b)\\s+.{0,24}?(\\bdirba\\b|\\bdirbs\\b|\\bworks\\b|\\bworking\\b|\\barbeitet\\b|\\bwerkt\\b|\\bработает\\b|\\bpracuje\\b)", 9),
    ],
  },
  {
    intent: "move-worker",
    patterns: [
      // §11 WHAT-IF: "perkelk Joną į projektą Vilnius", "move John to project
      // Riga", "verplaats Jan naar project Utrecht", "versetze Jan in das
      // Projekt Berlin", "переведи Ивана на проект Рига", "przenieś Jana do projektu".
      p("(perkel|perkelk|move|verplaats|versetz|перевед|перевес|перемест|przenie|przenies)[^\\s]*\\s+.{0,40}(projekt|project|проект)", 12),
    ],
  },
  {
    intent: "who-verifies-work",
    patterns: [
      // THE WORKER ASKS WHO CAN VERIFY. Owner P0 2026-09-06.
      //
      // Measured: "Kam pateikti atliktą darbą?" matched `find-work` on the
      // bare noun `darbą` (weight 1) and the person was shown job adverts —
      // they had asked who receives work they had ALREADY done.
      //
      // What separates this from every neighbour is the QUESTION WORD plus a
      // possessive/completed marker, never the noun `darbas` alone:
      //   · `confirm-work` is the employer's IMPERATIVE ("patvirtink Jono
      //     darbą") — it names another person and commands; it never asks KAM.
      //   · `find-work` is about work not yet done; this is about work done.
      // Weight 12 so the bare noun in `find-work` (1) cannot pull it back.

      // "kam pateikti / kam siųsti / kam rodyti … darbą" — TO WHOM do I submit.
      p("(kam|kur|who|whom|wem|aan\\s+wie|кому|komu)\\s+.{0,24}?(pateik|pateikt|si[uų]s|siunt|teik|submit|send|hand|einreich|indien|stuur|отправ|пода|prze[sś]l|sk[lł]ada)[^\\s]*\\s*.{0,24}?(darb|work|arbeit|werk|работ|prac|valand|hours|uren|stunden|часов)", 12),

      // "kas gali patvirtinti mano darbą?" — WHO CAN confirm my work.
      //
      // `gal[eė]t` was added 2026-09-07: the owner's own §12/§46 phrasing
      // "Kas galėtų patvirtinti mano patirtį?" uses the CONDITIONAL, and
      // `gali` is not a prefix of `galėtų` — measured, the sentence scored 6
      // on the bare `patirt` stem and opened the EXPERIENCES list instead of
      // the verifier route. The person asking who could vouch for them was
      // shown what other people had written about them.
      // Dutch SPLITS its conditional — "Wie ZOU mijn ervaring KUNNEN
      // bevestigen?" — so `zou kunnen` as one token never matched and the
      // sentence fell through. Both halves are listed separately, and the
      // gap before the confirm verb is widened to 28 because the object sits
      // between them in Dutch and German word order.
      p("(kas|kur|who|wer|wie|кто|kto)\\s+.{0,20}?(gali|gal[eė]t|can|could|kann|k[oö]nnte|\\bkan\\b|\\bzou\\b|kunnen|может|мог|mo[zż]e)\\w*\\s*.{0,28}?(patvirtin|confirm|verif|best[aä]tig|bevestig|подтверд|potwierd)", 12),

      // "kas patvirtins mano darbą?" — future tense, no modal verb.
      p("(kas|who|wer|wie|кто|kto)\\s+.{0,20}?(patvirtins|patvirtina|confirms?|verifies|will\\s+confirm|best[aä]tigt|bevestigt|подтвердит|potwierdzi)\\s*.{0,20}?(mano|my|mein|mijn|мо[юей]|m[oó]j|darb|work|arbeit|werk|работ|prac)", 12),

      // "kam reikia patvirtinti mano darbą" / "who needs to confirm my work"
      p("(kam|who|wer|кому|komu)\\s+.{0,16}?(reikia|needs?|muss|moet|нужно|trzeba)\\s*.{0,16}?(patvirtin|confirm|best[aä]tig|bevestig|подтверд|potwierd)", 12),
    ],
  },
  {
    intent: "confirm-work",
    patterns: [
      // §14 EMPLOYER CONFIRMATION: "patvirtink Jono darbą", "ką reikia
      // patvirtinti?", "confirm John's work", "what needs my confirmation",
      // "bestätige Jans Arbeit", "bevestig het werk van Jan", "подтверди
      // работу Ивана", "potwierdź pracę Jana". "Ką turiu patvirtinti?" stays
      // the approvals area (owner phrase contract). JS \w is ASCII-only, so
      // the verb stems are followed by \S* not \w*.
      p("(patvirtink|patvirtinti|patvirtinu|confirm|approve|best[aä]tig|bevestig|подтверд|potwierd[zź])[^\\s]*\\s*.{0,30}?(darb|work|įraš|entr|journal|arbeit|werk|работ|prac)", 10),
      p("(k[aą]|what|was|wat|что|co)\\s+.{0,12}?(reikia|needs?|muss|moet|нужно|trzeba|awaits?)\\s+.{0,12}?(patvirtin|confirm|best[aä]tig|bevestig|подтверд|potwierd)", 12),
      p("(reikia|needs?|awaiting|laukia)\\s+.{0,8}?(patvirtinim|confirmation|approval|bestätigung|bevestiging|подтвержден|potwierdzen)", 9),
    ],
  },
  {
    intent: "project-readiness",
    patterns: [
      // READINESS by sentence (§11 / §12 / §16): "kas trūksta projektui X?",
      // "ar komanda pasiruošusi?", "projekto parengtis", "what is missing for
      // the project", "is the team ready", "was fehlt dem Projekt", "is het
      // team klaar", "чего не хватает проекту", "czego brakuje projektowi".
      // The worker's own "ko man trūksta?" has no project / team word and
      // keeps its intent.
      p("(kas|ko|what|was|wat|что|чего|czego)\\s+.{0,12}?(tr[uū]ksta|missing|fehlt|ontbreekt|не\\s+хватает|brakuje)\\s*.{0,30}?(projekt|project|проект|komand|team|объект|objekt)", 12),
      p("(ar|is|ist|zijn|are|czy)\\s+.{0,14}?(komanda|team|mannschaft|ploeg|команда|zesp[oó]|[zž]mon[eė]s|people|darbuotoj)\\w*\\s*.{0,16}?(pasiruo[sš]|paruo[sš]|ready|bereit|klaar|gereed|готов|gotow)", 12),
      p("(pasiruo[sš]im|parengt|readiness|bereitschaft|gereedheid|готовност|gotowo[sś][cć])\\w*\\s*.{0,24}?(projekt|project|проект)", 11),
      p("(projekt|project|проект)\\w*\\s*.{0,24}?(pasiruo[sš]im|parengt|readiness|bereitschaft|gereedheid|готовност|gotowo[sś][cć])", 11),
    ],
  },
  {
    intent: "task-status",
    patterns: [
      // WORK PERFORMED → RESULT (§14): "užduotis sumontuoti pastolius atlikta",
      // "pradėjau užduotį", "užduotis užstrigo", "task scaffolding done",
      // "Aufgabe Gerüst erledigt", "taak steiger klaar", "задача выполнена",
      // "zadanie wykonane". The stage words are a different noun, so the two
      // intents never share a sentence; add-task's verbs (pridėk / create)
      // are absent here, so "pridėk užduotį" keeps its own intent.
      p("(u[zž]duot|task|aufgabe|taak|задач|zadani)\\w*\\s*.{0,60}?(baigt|atlikt|u[zž]baig|padaryt|done|finished|complet|fertig|abgeschlossen|erledigt|klaar|afgerond|заверш|готов|сделан|выполн|wykonan|zakończ|prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz|u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok)", 10),
      p("(baigiau|atlikau|u[zž]baigiau|padariau|finished|completed|done\\s+with|erledigt|abgeschlossen|afgerond|klaar\\s+met|заверш|выполн|сделал|wykonał|skończył|prad[eė]jau|pradedu|prasid[eė]jo|started|begonnen|angefangen|начал|rozpocz|u[zž]strigo|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok)\\w*\\s*.{0,20}?(u[zž]duot|task|aufgabe|taak|задач|zadani)", 10),
    ],
  },
  {
    intent: "project-risk",
    patterns: [
      // PROGRESS / READINESS / RISK by sentence (§4A "Which project is at
      // risk?", §11, §16): "kuris projektas rizikoje?", "kaip sekasi
      // projektams?", "projektų būklė", "which project is at risk", "welches
      // Projekt ist gefährdet", "welk project loopt risico", "какой проект
      // под угрозой", "który projekt jest zagrożony".
      // Prod walk D1 (2026-09-05): "Norėčiau sužinoti, kuriems mano
      // objektams gresia problemos" scored 0 here — the subject group knew
      // only "projekt" and the risk stems lacked "gresia / grėsmė" — so the
      // sentence fell to `log-work` (score 1) on that rule's bare site stem
      // "objekt". A company calls its projects OBJECTS, and "gresia" is the
      // everyday verb for "is at risk"; both belong to this rule.
      p("(projekt|project|проект|objekt|объект)\\w*\\s*.{0,24}?(rizik|risk|risiko|risico|gef[aä]hrd|угроз|риск|zagro[zż]|gresia|gr[eė]sm|v[eė]luoj|atsilie?k|behind|late|verz[oö]ger|achter|отста|op[oó][zź]ni)", 11),
      p("(rizik|risk|risiko|risico|gef[aä]hrd|угроз|риск|zagro[zż])\\w*\\s*.{0,24}?(projekt|project|проект)", 11),
      p("(kaip\\s+sekasi|how\\s+(are|is)|wie\\s+(l[aä]uft|laufen|steht|stehen)|hoe\\s+(gaat|staat|lopen)|как\\s+(идут|идёт|дела)|jak\\s+(idą|idzie))\\s*.{0,20}?(projekt|project|проект)", 10),
      p("(projekt[uų]|projects|projekte|projecten|проектов|projektów)\\s+(b[uū]kl|b[uū]sen|status|stand|state|состоян|статус|stan\\b)", 10),
      // Prod walk O3 (2026-09-06): "Kokie darbai vėluoja?" scored 0 here — the
      // subject group knew only "projekt / objekt", never the everyday word
      // for the WORK itself — and 2 on `find-work`, whose plural noun
      // `darb(ai)` fired. So a company asking WHICH WORK IS LATE was answered
      // "Darbo paieška yra tavo asmeninis veiksmas — persijunk į asmeninę
      // erdvę": a coordination question turned into a personal job hunt.
      //
      // A WORK/TASK noun beside a LATE/BEHIND stem is a delay question in all
      // of these languages, and no job search is phrased that way — the
      // seeking verbs (ieškau / rask / suche / zoek) are absent from both
      // groups, so a real job search cannot be pulled in here. Weight 11,
      // matching the risk rules above, so a bare noun cannot pull it back.
      p("(darb|u[zž]duot|task|work|arbeit|werk|работ|задач|prac|zadani)\\w*\\s*.{0,24}?(v[eė]luoj|v[eė]lav|atsilie|behind\\s+schedule|\\blate\\b|overdue|delayed|verz[oö]ger|versp[aä]tet|achterstand|te\\s+laat|отста|просроч|задерж|op[oó][zź]ni|sp[oó][zź]ni)", 11),
      p("(v[eė]luoj|atsilie|behind\\s+schedule|overdue|delayed|verz[oö]gert|achterstand|отста|просроч|op[oó][zź]ni)\\w*\\s*.{0,24}?(darb|u[zž]duot|task|work|arbeit|werk|работ|задач|prac|zadani)", 11),
    ],
  },
  {
    intent: "stage-status",
    patterns: [
      // PROJECT → PROGRESS: "etapas pamatai baigtas", "pradėjome stogo etapą",
      // "etapas užstrigo", "stage foundations done", "Phase Rohbau fertig",
      // "fase fundering afgerond", "этап фундамент завершён".
      p("(etap|stage|phase|fase|этап)\\w*\\s+.{0,40}(baigt|atlikt|u[zž]baig|done|finished|complet|fertig|abgeschlossen|erledigt|klaar|afgerond|заверш|готов|сделан|zako[nń]cz|uko[nń]cz|gotow|prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz|u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok|utkn)", 9),
      p("(baigt|atlikt|u[zž]baig|done|finished|complet|fertig|abgeschlossen|erledigt|klaar|afgerond|заверш|готов|zako[nń]cz|uko[nń]cz|prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz|u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok)\\w*\\s+.{0,20}(etap|stage|phase|fase|этап)", 9),
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
      p("\\b(prze)?pracowa[lł](em|am|i|y|o|a)?\\b", 3), // pl — (prze)pracowałem
      p("\\b(prze)?pracowali[sś]my\\b", 3), // pl
      // an explicit worked-time span "nuo 8 iki 17", "from 8 to 5", "с 8 до 17"
      p("\\bnuo\\s*\\d{1,2}\\D{0,4}iki\\s*\\d{1,2}", 3),
      p("\\bfrom\\s*\\d{1,2}\\D{0,4}to\\s*\\d{1,2}", 3),
      p("с\\s*\\d{1,2}\\D{0,4}до\\s*\\d{1,2}", 3),
      p("\\bvon\\s*\\d{1,2}\\D{0,4}bis\\s*\\d{1,2}", 3), // de "von 8 bis 17"
      p("\\bvan\\s*\\d{1,2}\\D{0,4}tot\\s*\\d{1,2}", 3), // nl "van 8 tot 17"
      p("\\bod\\s*\\d{1,2}\\D{0,4}do\\s*\\d{1,2}", 3), // pl "od 8 do 17"
      // "8 valandas / hours / часов / Stunden / uur / godzin"
      p("\\d{1,2}\\s*(val\\.?|valand|hour|hrs?|час|stunden|std|uur|uren|godz)", 2),
      // break / lunch minutes
      p("(pertrauk|pietūs|pietus|break|lunch|обед|перерыв|przerw|obiad)", 1),
      // "objekte / site / на объекте" — a work site
      p("(objekt|statyb|site|site\\b|стройк|объект|budow)", 1),
      // explicit journal words. The LT stem was the only one here, so an
      // English "fill in my work journal" or a Russian "запиши работу в
      // журнал" fell through to the unknown fallback while the identical
      // Lithuanian sentence reached the flow — the journal was LT-only
      // through its own single intake. The other launch locales' words for
      // the journal belong here for the same reason.
      p("(žurnal|journal|журнал|tagebuch|dagboek)", 2),
      p("(įrašyk\\s+darb|log\\s+work|record\\s+work|записать\\s+работу|zapisz\\s+prac)", 2),
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
      // pl — "zapisz pracę", "wprowadź godziny", "wpisz dzisiejszą pracę"
      p("(zapisz|zapisa[cć]|wpisz|wprowad[zź]|odnotuj|zanotuj)\\s*.{0,20}(prac|godzin)", 4),
      p("(prac[eęy]|godzin)\\w*\\s*.{0,16}(zapisa[cć]|wprowadzi[cć]|odnotowa[cć])", 4),
      p("(dziennik\\s+pracy|w\\s+dzienniku)", 2), // pl — the journal by name
      // ── A MEASURED OUTPUT IS RECORDED WORK (owner P0 2026-09-22 §5) ──────
      //
      // "Šiandien sumontavau 24 m²" scored 0 everywhere and was answered by
      // the not-understood menu, although the units it names are a shipped
      // capability (`messages/<locale>/productivity-units.json`, #1696) and
      // the journal stores exactly this. The hours case was already covered
      // one rule up; every OTHER unit was not, so the person who states an
      // area, a distance or a count was refused while the person who states
      // hours was served.
      //
      // The signal is the NUMBER + a canonical unit, never a verb list: a
      // verb list is the vocabulary trap this file keeps re-learning, and
      // the unit set is closed, owned by the taxonomy, and cannot be typed
      // by accident. Weight 3 = the "worked" stems; a sentence that also
      // SEEKS keeps find-work through the seek guard, and "Ieškau 5
      // suvirintojų" is untouched because a profession is not a unit.
      p(
        "\\d+([.,]\\d+)?\\s*(m²|m2|kv\\.?\\s*m|m\\s*²|km\\b|vnt\\.?|kg\\b|" +
          "palet|padėkl|pakuot|pcs\\b|szt\\.?|stuks|st[uü]ck|paczek|palett|" +
          "м²|м2|кв\\.?\\s*м|км\\b|шт\\.?|кг\\b|паллет|поддон)",
        3,
      ),
    ],
  },
  {
    /**
     * AVAILABILITY STATED IN WORDS (production ca96605b, 2026-09-06): "galiu
     * dirbti nuo spalio 1 d." scored 0 everywhere and was answered as a job
     * search with no criteria set. The person said WHEN they can work — the
     * availability fact the work card already holds (`available_from`,
     * `availability_status`), reachable until now only by the chip "Nurodyti,
     * kada galiu dirbti". The shapes are closed: "can (start) work" / "am
     * free" bound to a from-word or a time word, in every routed locale.
     * Weight 5 beats the bare `galiu` capacity reading (3) and the `darbo`
     * noun (1); a sentence that also SEEKS ("galiu dirbti, ieškau darbo")
     * keeps find-work through the guard.
     *
     * ── SAYING WHERE BROKE SAYING WHEN (owner readiness window, 2026-09-09)
     *
     * §5A's probe is "I can work in Germany from Monday." — one sentence
     * carrying BOTH facts §5B asks a person for, mobility and availability.
     * Measured on this router before the change:
     *
     *   lt "Galiu dirbti Vokietijoje nuo pirmadienio"    → availability
     *   en "I can work in Germany from Monday"           → UNKNOWN
     *   de "Ich kann in Deutschland ab Montag arbeiten"  → find-work (!)
     *   nl "Ik kan in Duitsland vanaf maandag werken"    → UNKNOWN
     *   ru "Могу работать в Германии с понедельника"     → UNKNOWN
     *
     * Drop the country and all five worked. The Lithuanian pattern binds
     * `galiu … dirbti` with no from-word, so a place between them is free;
     * every other locale required the time word to sit IMMEDIATELY after the
     * verb, and naming a country pushed it out of reach. German was the worst
     * of the five: it did not fall silent, it answered a person stating their
     * availability with a JOB SEARCH.
     *
     * `WHERE_GAP` (above) is the fix, and it is deliberately a PLACE phrase
     * rather than a wildcard: a bare `.{0,20}` would have swallowed "I can
     * work with people from Poland" as an availability statement. Pinned,
     * both directions, in `lib/guards/availability-survives-a-place.test.ts`.
     */
    intent: "availability",
    patterns: [
      pNoSeek(
        `\\b(galiu|galeciau|galesiu|galiu\\s+pradeti|galesiu\\s+pradeti)\\s+(pradeti\\s+)?dirbti\\b`,
        5,
      ),
      // ── THE SEEK GUARD BELONGS ON ALL OF THEM (2026-09-09) ──────────────
      //
      // Only the FIRST pattern carried it, so "galiu dirbti nuo pirmadienio,
      // ieškau darbo" correctly ran the search while its English, German,
      // Dutch and Russian equivalents answered with a bare acknowledgement of
      // the availability — the person asked for work and was told what they
      // had just told us. `pNoSeek` applies the same guard uniformly: it can
      // only ever NARROW a pattern, so no sentence changes meaning, and the
      // five locales finally behave the same way.
      pNoSeek(`\\b(galiu|galesiu|galeciau)\\s+(pradeti|pradeciau)\\s+(nuo|kita|sia|rytoj|poryt|po|iki)\\b`, 5),
      pNoSeek(`\\b(esu|busiu)\\s+laisv[a-z]{0,4}\\s+(nuo|iki|rytoj|ryt|kita|sia|po|visa)\\b`, 5),
      pNoSeek(`\\b(i\\s+am|i'm|i\\s+will\\s+be)\\s+(available|free)\\s+${WHERE_GAP}(from|starting|on|next|this|after|until)\\b`, 5),
      pNoSeek(`\\b(available|can\\s+start|can\\s+work)\\s+${WHERE_GAP}(from|starting|on|next|this|after)\\b`, 5),
      pNoSeek(`могу\\s+(начать\\s+)?работать\\s+${WHERE_GAP}(с|со|после|через)\\b`, 5),
      pNoSeek(`могу\\s+(выйти|приступить|начать)\\s+${WHERE_GAP}(с|со|после|через)\\b`, 5),
      pNoSeek(`(свободен|свободна)\\s+${WHERE_GAP}(с|со|после|до)\\b`, 5),
      pNoSeek(`\\bkann\\s+${WHERE_GAP}(ab|von|nach)\\b.{0,20}(arbeiten|anfangen|beginnen)`, 5),
      pNoSeek(`\\b(bin|ware)\\s+${WHERE_GAP}(ab|von)\\s*.{0,20}\\b(verfugbar|frei)\\b`, 5),
      pNoSeek(`\\bverfugbar\\s+${WHERE_GAP}(ab|von)\\b`, 5),
      pNoSeek(`\\bkan\\s+${WHERE_GAP}(vanaf|per|na)\\b.{0,20}(werken|beginnen|starten)`, 5),
      pNoSeek(`\\bbeschikbaar\\s+${WHERE_GAP}(vanaf|per)\\b`, 5),
      // pl (2026-09-20) — "Mogę pracować od października", "Mogę zacząć od
      // poniedziałku", "Jestem dostępny od 1 marca". Same closed shape as
      // the four locales above: a CAN/AM-FREE verb bound to a from-word,
      // with the optional place phrase between them.
      pNoSeek(`\\bmog[eę]\\s+(zacz[aą][cć]\\s+)?pracowa[cć]\\s+${WHERE_GAP}(od|po|za)\\b`, 5),
      pNoSeek(`\\bmog[eę]\\s+(zacz[aą][cć]|zaczyna[cć]|wyj[sś][cć])\\s+${WHERE_GAP}(od|po|za)\\b`, 5),
      pNoSeek(`\\b(jestem|b[eę]d[eę])\\s+(dost[eę]pn|woln)[a-z]{0,4}\\s+${WHERE_GAP}(od|po|do)\\b`, 5),
      pNoSeek(`\\bdost[eę]pn[a-z]{0,4}\\s+${WHERE_GAP}(od|po)\\b`, 5),
      // ── "PAKEISK MANO PRIEINAMUMĄ" (owner P0 2026-09-22, section A) ──────
      //
      // Every pattern above binds an availability word to a FROM/UNTIL time
      // word, because each states a DATE. The owner's own example states
      // none: "Pakeisk mano prieinamumą" is a request to CHANGE the fact,
      // not a statement of it. Measured 2026-09-22: `unknown`, score 0 — one
      // of the six sentences the owner listed as the chat-first minimum, and
      // the only one with no route at all.
      //
      // Nothing new is built for it. The `availabilityStatement` handler
      // already opens the canonical `worker.save-work-card` form, the ONE
      // business action that writes availability; this is the missing door,
      // not a second one. The handler tells a change REQUEST from a
      // statement (`isAvailabilityChangeRequest`) so a person who said
      // "change" is never recorded as having said "available".
      //
      // A CHANGE VERB BOUND TO AN AVAILABILITY NOUN, in the six served
      // locales. Both halves are required: a bare "pakeisk" is every other
      // edit in the product, and a bare "prieinamumas" is the noun in a
      // dozen honest questions.
      p(`\\b(pakeisk|pakeisti|keisk|atnaujink|atnaujinti|nustatyk)\\b.{0,24}(prieinamum|galimum|laisvum)`, 6),
      p(`\\b(change|update|set|edit)\\b.{0,24}(availability|when\\s+i\\s+can\\s+(work|start))`, 6),
      p(`\\b(измени|изменить|обнови|обновить|поменять|установи)\\b.{0,24}(доступност|занятост)`, 6),
      p(`\\b(wijzig|verander|aanpassen)\\w*\\b.{0,24}(beschikbaarheid)`, 6),
      p(`\\b(ändere|andere|aktualisiere|setze)\\b.{0,24}(verfügbarkeit)`, 6),
      p(`\\b(zmień|zmienić|zaktualizuj|ustaw)\\b.{0,24}(dostępność|dostępnosc)`, 6),
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
      // A PRESENT-TENSE trade activity in the first person ("remontuoju
      // automobilius", "kerpu plaukus", "I repair cars", "ремонтирую машины")
      // is a stated SERVICE — the ONE verb list the value structurer reads,
      // so the router and the reader cannot drift. A sentence that also
      // seeks ("remontuoju automobilius, ieškau darbo") keeps find-work.
      pNoSeek(
        `\\b(?:${PRESENT_ACTIVITY_VERB_SOURCE})\\b`,
        5,
      ),
      p("parduo", 4), // parduodu / parduoti / noriu parduoti
      p("прода(м|ю|ем)", 4),
      p("\\bsell(ing)?\\b", 4),
      p("verkauf", 4), // de verkaufen / zu verkaufen / Verkauf
      p("(verkopen|verkoop|te\\s+koop)", 4), // nl
      p("(sprzeda[cćjmę]|sprzedaw|na\\s+sprzeda)", 4), // pl sprzedać / sprzedam
      p("\\bsiūlau\\b", 3),
      p("предлагаю", 3),
      // ── "NORIU PASIŪLYTI SAVO PASLAUGAS" ────────────────────────────────
      // Owner window 11 §18 names this sentence verbatim as a landing
      // example. Measured 2026-09-07: `unknown`, score 0 — the whole SUPPLY
      // side of the service market was unreachable in the most ordinary
      // phrasing anyone uses, because only the present-tense "siūlau" was
      // matched and never the infinitive it is nearly always said with.
      // Weight 6 so an explicit offer outranks the 5 of the activity-verb
      // rule; the SEEK guard above still keeps "siūlau paslaugas, ieškau
      // klientų" in its own lane.
      p("(pasi[uū]ly|pasi[uū]lyt|offer|aanbied|anbiet|предлож|oferuj|oferow|zaoferow)\\w*\\s*.{0,24}(paslaug|service|dienst|услуг|us[lł]ug)", 6),
      p("(noriu|galiu|want\\s+to|would\\s+like\\s+to|m[oö]chte|wil|хочу|могу|chc[eę]|mog[eę])\\s*.{0,16}(pasi[uū]ly|offer|aanbied|anbiet|предлож|zaoferow|oferow)", 6),
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
      // Real-user fitness walk 2026-09-06: an OFFER VERB bound to an everyday
      // service activity — "galiu kirpti plaukus namuose", "galiu mokyti
      // matematikos", "siūlau valyti butus" — landed in the not-understood
      // menu although the services door (/dashboard/services) exists. The
      // verb is required in the SAME regex: a bare "reikia 2 valytojų" keeps
      // scoring need-workers. `mokyt[iu]\b` excludes "mokytis" (to learn).
      p("\\b(galiu|siulau|siulyti|teikiu|can|могу|biete|bied)\\b\\s+(?:[^\\s]+\\s+){0,2}?(kirp|dazy|valy|mokyt[iu]\\b|tvarky|siuv|montuo|pjau|priziur|programuo|konsultuo|apskait|vez[tu]|remont|taisy|paint|clean|teach|tutor|mow|install|sew|babysit|garden|\\bfix\\b)", 5),
      // "noriu siūlyti buhalterijos paslaugas" — the service NOUN with an
      // offer verb is an offer of a service, whatever the service is.
      // `oferuj` is NOT listed here: `\b…\b` closes the token and Polish
      // inflects it ("oferuję", "oferujemy"). The verb+service rule above
      // carries the Polish offer, stem-anchored, at weight 6.
      p("\\b(siulau|siulyti|siulome|teikiu|teikiame|offer|предлага|biete|bied)\\b.{0,40}(paslaug|\\bservices?\\b|услуг|dienst|us[lł]ug)", 5),
      p("free\\s+days?", 3),
      p("(freie?\\s+tage|vrije\\s+dag(en)?|wolne\\s+dni|wolnych\\s+dni)", 3), // de / nl / pl free days
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
      p("(pracownik|robotnik|pracownic)", 4), // pl — pracownicy / pracowników
      p("\\b(hire|hiring|recruit(ing|ment)?|staffing)\\b", 3),
      p("(нанять|наним|найм)", 3),
      p("\\beinstellen\\b", 3), // de "Leute einstellen"
      p("\\baannemen\\b", 3), // nl "mensen aannemen"
      p("(zatrudni|rekrutacj|rekrutuj)", 3), // pl
      p("\\breikia\\s+žmoni", 3), // "reikia žmonių"
      // SOMEBODY, WITHOUT NAMING A TRADE — in the other four locales. The
      // line above has covered Lithuanian since the demand path was built;
      // "we need people in rotterdam" measured `unknown` on 2026-09-08, as
      // did its de/nl/ru forms. An employer who has not yet decided the trade
      // is the FIRST sentence of a demand, not an unrecognisable one.
      //
      // The seek verb is the shared vocabulary, so this cannot drift from the
      // rest of the demand side. The noun list is generic PERSON words only:
      // "work"/"job" are deliberately absent, because "I need work" is the
      // opposite direction and belongs to find-work.
      p(
        // `žmoni` joins the list 2026-09-08. Lithuanian was already covered
        // — but by `\breikia\s+žmoni`, bound to ONE verb. "ieškome 10 žmonių
        // klientui" (an agency buying for a client) uses a different verb and
        // measured `unknown`. Reading the shared seek vocabulary instead of a
        // single hard-coded verb is the point of this rule.
        `(?:${SEEK_VERB_SOURCE})\\s+(?:[^\\s]+\\s+){0,3}?(people|mensen|leute|personen|personeel|люд|человек|рабочих|žmoni|zmoni)`,
        5,
      ),
      // pl (2026-09-20). `SEEK_VERB_SOURCE` lives in lib/structuring and
      // carries no Polish, so the Polish need verbs are stated here beside
      // the generic person nouns — "Potrzebujemy ludzi w Rotterdamie".
      p("(potrzebuj|poszukuj|szuka|brakuje\\s+nam)\\w*\\s*(?:[^\\s]+\\s+){0,3}?(ludzi|os[oó]b|pracownik|pracownic|robotnik|r[aą]k\\s+do\\s+pracy)", 5),
      // …and the same verbs beside a TRADE, which is the vocabulary
      // `TRADE_STEM_SOURCE` already shares with the supply direction.
      p(`(potrzebuj|poszukuj|szukam[y]?|brakuje\\s+nam|zatrudni)\\w*\\s*.{0,30}(?:${TRADE_STEM_SOURCE})`, 6),
      // DUTCH PUTS THE VERB LAST. "wij hebben 12 lassers nodig" is the
      // ordinary way to say "we need 12 welders", and it measured `unknown`:
      // every demand rule here expects the seek verb BEFORE the noun, which
      // is simply not how the sentence is built.
      //
      // Restricted to the PLURAL `hebben` on purpose. "Ik heb een baan nodig"
      // — I need a JOB — is a worker, the opposite direction, and it uses
      // `heb`. Pinned as a negative control.
      // Weight 10, above the supply side's HAVE + COUNT + TRADE rule. "wij
      // hebben 12 lassers nodig" satisfies BOTH readings on its face — it
      // literally says HAVE, 12, LASSERS — and the supply rule matched it
      // first, turning "we need 12 welders" into "we are offering 12
      // welders". `nodig` closing the clause is what settles it: in Dutch the
      // verb-final "nodig" means NEED and nothing else, so it outranks the
      // pattern it would otherwise be mistaken for. Caught by the supply
      // guard's cross-check, not in production.
      p("\\bhebben\\b\\s*.{0,30}\\bnodig\\b", 10),
      // ── A NEED VERB AND A HEADCOUNT, WHATEVER THE TRADE IS CALLED ───────
      //
      // "reikia 12 TIG kitai savaitei" measured `unknown` on 2026-09-08. TIG
      // is a welding PROCESS, not a job title, so no trade stem matched and
      // an employer stating a real order got nothing back. The product cannot
      // hold every trade, process, certificate and local word people use for
      // the work — but a NUMBER after a need verb is a headcount, and that is
      // enough to know the direction and open the demand form, which then
      // asks what the 12 are.
      //
      // Weight 3, deliberately low: this is the weakest reading of the
      // sentence and must lose to every rule that actually recognises the
      // work. It exists to replace SILENCE, not to overrule knowledge.
      //
      // The time units are excluded, because "reikia 12 valandų" (12 hours),
      // "2 dienų" (2 days) and their translations are a duration, not people.
      // Without that exclusion this rule would confidently answer a question
      // about time with an employer demand form.
      p(
        `(?:${SEEK_VERB_SOURCE})\\s+[0-9]{1,4}\\s+(?!(?:${DURATION_UNIT_SOURCE})\\w*\\b)`,
        3,
      ),
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
        // `ищу` beside `ищем`: "Ищу сантехника" (public entry, lane F) read
        // as the person's OWN job search on the bare Russian seek verb.
        `(reikia|reikės|trūks(ta)?|ieškau|ieškom(e)?|need(s|ed)?|looking\\s+for|нужн|ищем|ищу|требу(ется|ются)|brauch(e|en)?|benötig|suche(n)?|zoek(en)?|nodig)\\s*.{0,30}(${TRADE_STEM_SOURCE})`,
        6,
      ),
      // PROFESSIONAL LANGUAGE (window 6, 2026-09-06). The alternation above
      // is the manual-trades vocabulary; "Reikia projektų vadovo." scored 0
      // here and 3 on `projects` (the bare "projektų"), so an employer
      // asking for a project manager was shown their project list. An
      // occupation is recognised by its GRAMMAR — a seek verb followed by a
      // noun in the genitive with an agentive suffix ("buhalterio",
      // "inžinieriaus", "teisininko", "dizainerio", "specialisto") — or by a
      // professional stem no catalogue row covers. The suffix, stem and
      // exclusion sources are the SAME the value structurer reads
      // (`lib/structuring/role-label.ts`): one vocabulary, nothing to drift.
      // Generic person nouns and equipment ("kompiuterio") are excluded.
      p(
        `(?:${SEEK_VERB_SOURCE})\\s+(?:[^\\s]+\\s+){0,3}?(?!${ROLE_NOUN_EXCLUSION_SOURCE})[^\\s]*?(?:${ROLE_SUFFIX_GENITIVE_SOURCE})\\b`,
        6,
      ),
      p(`(?:${SEEK_VERB_SOURCE})\\s+(?:[^\\s]+\\s+){0,3}?(?:${OCCUPATION_STEM_SOURCE})`, 6),
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
      // PL — "Potrzebuję kogoś do naprawy dachu", "Szukam kogoś, kto
      // pomaluje ściany". A named TRADE ("potrzebuję dekarza") carries no
      // indefinite agent and keeps the employer route above.
      p("(kogo[sś]|kto[sś]|fachowc|z[lł]ot[aą]\\s+r[aą]czk)\\w*\\s*.{0,25}(napraw|remont|sprz[aą]ta|posprz[aą]ta|malow|pomalow|instal|zainstal|wymian|wymien|koszen|czyszcz|wyczy[sś]ci|pod[lł][aą]cz)", 6),
      // PL — a seek verb bound to the SERVICE itself, the same shape as the
      // shared-vocabulary rule below ("potrzebuję usług księgowych").
      p("(potrzebuj|poszukuj|szuka|zam[oó]wi)\\w*\\s*(?:[^\\s]+\\s+){0,3}?(us[lł]ug|remont|sprz[aą]tani|naprawy|malowani)", 13),
      // A seek verb followed by the SERVICE itself — "reikia valymo
      // paslaugų", "reikia automobilio remonto", "need a repair" — is a job
      // to be done. A named TRADE ("reikia valytojo", "reikia dažytojo")
      // carries no service stem and keeps its employer route above. Weight 13:
      // "reikia buhalterio paslaugų" names both a PROFESSION (the accountant,
      // scoring 6 + 6 above through the genitive suffix AND the professional
      // stem) and the SERVICE — the service is what is asked for, in the
      // company context as much as in the personal one (company walk
      // 2026-09-06: it opened the HIRING form). The weight is set above the
      // largest sum the occupation rules can reach, not tuned to one sentence.
      p(
        `(?:${SEEK_VERB_SOURCE})\\s+(?:[^\\s]+\\s+){0,3}?(?:paslaug|remont|valym|dazym|korepetitor|услуг|ремонт|уборк|\\bservices?\\b|\\bcleaning\\b|\\brepair)`,
        13,
      ),
    ],
  },
  {
    intent: "find-work",
    patterns: [
      // ── THE PERSON SEEKS WORK, NOT A WORKER (SEP-4: DEMAND ≠ SUPPLY) ────
      //
      // Measured 2026-09-08 on the PUBLIC ENTRY, the first sentence a visitor
      // ever types. "Ieškau darbo suvirintoju Vokietijoje" classified as
      // `need-workers` — a person looking for a welding job was read as an
      // employer hiring welders. The same inversion held in ru, nl and de;
      // only en escaped, and only by accident (its occupation list has
      // "welder" and the sentence said "welding").
      //
      // The mechanism: `need-workers` scores 6 for a seek verb within 30
      // characters of an occupation stem, and that alternation includes the
      // FIRST-PERSON SINGULAR forms (ieškau / ищу / suche / zoek) added to
      // catch "Ieškau santechniko" — a person who needs a plumber. Both
      // sentences open identically. The discriminator is the WORK NOUN: one
      // seeks a PLUMBER, the other seeks WORK.
      //
      // So this is a direction rule, not a deny-list. It fires only when a
      // first-person-singular seeker names WORK, and it must outrank the 6
      // above, because naming the work noun is strictly more specific than
      // naming a trade.
      //
      // FIRST PERSON SINGULAR ONLY, deliberately. "Ieškome darbo savo
      // darbuotojams" and "We are looking for work for our welders" are an
      // AGENCY offering capacity, and an earlier fix (see the offer-capacity
      // note above) exists precisely because they once resolved to
      // `find-work`. `ieškome`, `zoeken`, `suchen` and "we are looking" all
      // fail this pattern, so that fix cannot be undone here.
      p(
        "(\\bieškau\\b|\\bищу\\b|\\bik\\s+zoek\\b|\\bich\\s+suche\\b|" +
          // "im looking for a job as a welder" — measured 2026-09-08. Without
          // the apostrophe "i'm" is a SINGLE token, so `\\bi\\s+` never fired
          // and the sentence fell back to the employer reading: the same
          // demand/supply inversion this rule exists to prevent, reachable by
          // nothing more than typing the way people type.
          "\\bi'?m\\b|\\bi\\s+(am\\s+)?(looking\\s+for|seeking|want|need))" +
          "\\s*(?:[^\\s]+\\s+){0,3}?" +
          "(darb(o|ą|us|ai|ą)\\b|работ(у|ы)\\b|\\bwerk\\b|\\bbaan\\b|" +
          "\\barbeit\\b|\\bstelle\\b|\\bjob\\b|\\bwork\\b)",
        // Top of the table on purpose. "Ieškau darbo suvirintoju" scores 12 on
        // the employer side, because the occupation stem fires TWO weight-6
        // seek rules at once; anything lower loses to it and leaves the
        // inversion in place for exactly the sentences that name a trade.
        // Weighting is safe here in a way it would not be elsewhere: this
        // pattern fires ONLY on a first-person-singular seeker who names WORK
        // as the object, which is unambiguously supply, so a high weight
        // cannot capture an employer sentence — it can only decide one that
        // was already decided wrongly.
        10,
      ),
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
      p("\\bvacancy|vacature|vakans|wakat", 1),
      // ── pl (2026-09-20) ────────────────────────────────────────────────
      // FIRST PERSON SINGULAR + the WORK noun, the same direction rule the
      // weight-10 pattern at the top of this list encodes: `\bszukam\b` is
      // closed, so the agency plural "szukamy" (supply, `offer-capacity`)
      // can never reach it.
      p("\\bszukam\\b\\s*(?:[^\\s]+\\s+){0,3}?\\bprac", 3),
      p("\\b(chc[eę]|potrzebuj[eę])\\s+(pracowa[cć]|pracy|prac[eę])", 3),
      p("\\bprac(a|y|e|ę|ach)\\b", 1),
      p("\\boferty?\\s+pracy\\b", 2),
      // "in the Netherlands / country" — a search location
      p("(nyderland|olandij|netherland|holland|holandi|нидерланд|deutschland|germanij|niemcz|norwegi|niderland)", 1),
    ],
  },
  {
    /**
     * THE PERSON NAMES THEIR PROFESSION OR A PAST JOB (window 6, 2026-09-06).
     *
     * Measured on production ca96605b: "esu programuotojas", "esu
     * dėstytojas" and "dirbu inžinieriumi" answered NOTHING (no intent), and
     * "dirbau projektų vadovu 5 metus" — a person telling their work history
     * — opened the projects list on the bare project stem. The sentence
     * shapes are closed: "esu <occupation-nominative>", "dirbu / dirbau
     * <occupation-instrumental>", "I am a <professional noun>", "я
     * <profession>". A sentence that ALSO asks for work ("esu buhalteris,
     * ieškau darbo") keeps `find-work` — the search runs and the chat reads
     * the profession beside it — so the guard below excludes seek verbs.
     * The suffix / stem / exclusion sources are shared with the reader in
     * `lib/structuring/role-label.ts`.
     *
     * ── A TRADE COULD ONLY INTRODUCE ITSELF IN LITHUANIAN ─────────────────
     * (owner readiness window, 2026-09-09 — §5A's probe "I am a welder.")
     *
     * Measured on this router before the change, one sentence per language:
     *
     *   "I am an accountant"   → profession-statement    "I am a welder"     → UNKNOWN
     *   "Ich bin Buchhalter"   → profession-statement    "Ich bin Schweisser"→ UNKNOWN
     *   "Ik ben boekhouder"    → profession-statement    "Ik ben lasser"     → UNKNOWN
     *   "Я бухгалтер"          → profession-statement    "Я сварщик"         → UNKNOWN
     *   "Esu buhalteris"       → profession-statement    "Esu suvirintojas"  → OK
     *
     * The office professions live in `OCCUPATION_STEM_SOURCE`, which this
     * rule read. The manual trades live in `TRADE_STEM_SOURCE`, which it did
     * not — so a welder, electrician, plumber, carpenter, painter, driver,
     * cook, cleaner or scaffolder could not say what they were in four of the
     * five routed languages. Lithuanian passed only by ACCIDENT OF GRAMMAR:
     * "suvirintojas" ends in `-tojas`, so it matched the nominative suffix,
     * not any vocabulary. The moment the ending is not Lithuanian the person
     * disappears — and these are the professions this product is for.
     *
     * It is the #1669 defect exactly one layer up. There the trades were
     * readable by DEMAND and not by SUPPLY; here they are readable by both
     * market directions and not by a PERSON describing themselves. The fix is
     * the same fix: read the ONE shared list instead of a second copy.
     *
     * WHY THIS CANNOT BECOME A SUPPLY OR DEMAND SENTENCE (§13/§28, and the
     * regression #1675 fixed). Three independent guards, none added here:
     *   · EVERY anchor in `PROFESSION_STATEMENT_ANCHOR_SOURCE` is FIRST
     *     PERSON SINGULAR — "esu", "dirbu", "i am", "i'm", "я", "ich bin",
     *     "ik ben". "We have 20 welders" and "we need welders" contain no
     *     anchor and cannot reach this rule at all.
     *   · `SEEK_GUARD_SOURCE` still fails the whole pattern when the sentence
     *     also asks for work or for workers.
     *   · `offer-capacity` requires a DIGIT that is not followed by a
     *     duration unit; a bare self-introduction carries no number, and
     *     "I have 3 years of experience as a welder" carries one that is a
     *     duration — which is what #1675 settled and this does not touch.
     * The opposite-direction controls are pinned in
     * `lib/guards/a-trade-can-say-what-it-is.test.ts`.
     */
    intent: "profession-statement",
    patterns: [
      pNoSeek(
        // NB `[^\s]`, never `\S`: pattern sources are lower-cased and `\S`
        // would silently become `\s`.
        `\\b(?:as\\s+)?(?:${PROFESSION_STATEMENT_ANCHOR_SOURCE})\\b\\s+(?:[^\\s]+\\s+){0,3}?(?!${ROLE_NOUN_EXCLUSION_SOURCE})(?:[^\\s]*?(?:${ROLE_SUFFIX_NOMINATIVE_SOURCE}|${ROLE_SUFFIX_INSTRUMENTAL_SOURCE})\\b|(?:${OCCUPATION_STEM_SOURCE})|(?:${TRADE_STEM_SOURCE}))`,
        6,
      ),
      // ── pl (2026-09-20) ────────────────────────────────────────────────
      //
      // `PROFESSION_STATEMENT_ANCHOR_SOURCE` lives in lib/structuring and
      // carries no Polish anchor, and the Polish profession nouns inflect
      // in ways neither the Lithuanian suffix lists nor the shared trade
      // stems reach ("księgowym", "elektrykiem" — `elektrik` is the LT
      // spelling, `elektryk` the Polish one). So the Polish shape is stated
      // here, in the SAME closed form: a FIRST-PERSON-SINGULAR anchor
      // ("jestem", "pracuję jako") plus a professional or trade noun.
      //
      // It is `pNoSeek` like the rule above, so "Jestem księgowym i szukam
      // pracy w Wilnie" runs the search and the statement is read beside
      // it — `SEEK_GUARD_SOURCE` gained `szuka` / `poszukuj` / `potrzebuj`
      // for exactly that sentence.
      pNoSeek(
        "\\b(jestem|pracuj[eę]\\s+jako|pracowa[lł](em|am)\\s+jako)\\s+(?:[^\\s]+\\s+){0,2}?" +
          "(ksi[eę]gow|prawnik|adwokat|in[zż]ynier|projektant|architekt|analityk|ekonomist|" +
          "konsultant|doradc|programist|programuj|deweloper|nauczyciel|wyk[lł]adowc|" +
          "\\btechnik|specjalist|mened[zż]er|kierownik|magazynier|operator|mechanik|" +
          "spawacz|elektryk|hydraulik|stolarz|cie[sś]l|malarz|dekarz|murarz|glazurnik|" +
          "kierowc|kucharz|kelner|sprz[aą]tacz|monter|zbrojarz|betoniarz|tynkarz)",
        6,
      ),
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
        "(parodyk|rodyk|atidaryk|show|open|покажи|открой|zeig|toon|laat|poka[zż]|otw[oó]rz|wy[sś]wietl)\\s*.{0,14}(kortel|card\\b|карточк|karte\\b|kaart\\b|kart[aeoy]\\b|kart[eę]\\b)",
        7,
      ),
      p("(mano|my|моя|meine|mijn|moj[aą]|moja)\\s+(kortel|card\\b|карточк|karte\\b|kaart\\b|kart[aeoy]\\b)", 6),
      p("player\\s*card", 6),
      p("(darbuotojo|worker|pracownika)\\s+(kortel|card\\b|kart[aeoy]\\b)", 5),
      // CHANGING WHAT THE CARD HOLDS IS OPENING THE CARD (owner P0
      // 2026-09-22 §5). "Pakeisk mano pasirengimą darbui" scored 0: the
      // work-card editor lives IN the player-card result
      // (`/dashboard?result=player-card`), and the person who asks to change
      // their readiness was answered by the not-understood menu. A read that
      // carries the editor is the honest answer to an edit request — nothing
      // is written by the sentence.
      p(
        "(pakeisk|pakeisti|atnaujink|atnaujinti|redaguok|change|update|edit|" +
          "измени|обнови|[aä]ndere|aktualisiere|wijzig|werk\\s+bij|zmie[nń]|zaktualizuj)" +
          "\\s*.{0,24}(pasirengim|pasiruošim|readiness|готовност|bereitschaft|" +
          "gereedheid|gotowo[sś])",
        6,
      ),
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
      p("(patirt|experienc|опыт\\s+взаимодейств|ervaring|erfahrung|do[sś]wiadczeni)", 6),
      p("(palikti|parašyti|pateikti|leave|write|submit|оставить|zostawi|napisa[cć]\\s+opini|wystawi)\\s*.{0,14}(patirt|experienc|отзыв\\s+о\\s+взаимодейств|opini|do[sś]wiadczeni)", 7),
      p("(patirtys|patirtis)\\s+(apie|about)\\s+(mane|me)", 7),
      p("(opini|do[sś]wiadczeni)\\w*\\s+(o\\s+mnie|o\\s+wsp[oó][lł]prac)", 7), // pl
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
      p("(darbo\\s+santyk|work\\s+relationship|working\\s+relationship|рабочие\\s+отношени|werkrelatie|arbeitsbeziehung|stosunek\\s+pracy|relacj\\w*\\s+zawodow)", 7),
      p("(su\\s+kuo)\\s*.{0,14}(dirb)", 7),
      p("(z\\s+kim)\\s*.{0,14}(pracuj|wsp[oó][lł]prac)", 7), // pl
      p("(kto\\s+(u\\s+mnie|dla\\s+mnie|w\\s+mojej\\s+firmie))\\s*.{0,14}pracuj", 7), // pl
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
        "(parodyk|rodyk|atidaryk|open|show|покажи|открой|zeig|toon|laat|poka[zż]|otw[oó]rz|wy[sś]wietl)\\s*.{0,14}(žinut|messages?|сообщени|berichten|nachrichten|wiadomo[sś]c)",
        6,
      ),
      p("(mano|my|мои|meine|mijn|moje|moich)\\s+(žinut|messages?|сообщени|nachrichten|berichten|wiadomo[sś]c)", 5),
      p("(neperskaityt|unread|непрочитан|ungelesen|ongelezen|nieprzeczytan)", 4),
    ],
  },
  {
    // Invitations addressed to ME (owner contract §4D — someone is waiting on
    // you): "mano kvietimai", "kas mane kviečia?", "gavau kvietimą". Outweighs
    // the employer's INVITE verbs on purpose: being invited is not inviting.
    intent: "invitations",
    patterns: [
      p("(mano|my|мои|meine|mijn|moje)\\s+(kvietim|invitation|приглашени|einladung|uitnodiging|zaproszeni)", 6),
      p("(kas|who|кто|wer|wie|kto)\\s+(mane|me|меня|mich|mij|mnie)\\s+(kvie|invit|пригла|einl|uitnod|zapr)", 6),
      p("(gavau|gavome|i got|i received|получил|erhalten|ontvangen|otrzymał)[^\\s]{0,4}\\s+(kvietim|invitation|приглашени|einladung|uitnodiging|zaproszeni)", 6),
    ],
  },
  {
    intent: "translate",
    patterns: [
      p("\\bišversk\\b", 3),
      p("\\bversti\\b", 2),
      p("\\btranslate\\b", 3),
      p("(przet[lł]umacz|t[lł]umacz)", 4), // pl — przetłumacz / tłumaczenie
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
      p("\\bnapisz\\b", 3), // pl
      p("(napisz|napisa[cć]|wy[sś]lij)\\s*.{0,24}(pracodawc|firm|klient)", 3), // pl
      p("(šiai\\s+įmonei|darbdaviui|to\\s+the\\s+employer|работодател|dem\\s+arbeitgeber|de\\s+werkgever|pracodawc|do\\s+tej\\s+firmy)", 2),
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
      p("przypomn", 3), // pl "przypomnij mi" / przypomnienie
    ],
  },
  {
    intent: "calendar-view",
    patterns: [
      p("(kada|when|wann|wanneer|kiedy).{0,20}(susitikim|meeting|pamain|shift|event|įvyk|termin|afspraak|spotkani|zmian[aęy]\\b|wydarzeni)", 3),
      p("\\bkalendor", 3),
      p("\\bcalendar\\b", 3),
      p("календар", 3),
      p("\\bkalender\\b", 3), // de / nl
      p("\\bkalendarz", 3), // pl
      p("\\bagenda\\b", 2), // nl — the schedule itself
      p("(mano|šios savaitės|today'?s|this week'?s)\\s+(plan|tvarkaraš|schedule|расписани)", 2),
      // Context Intelligence (rebuild phase 3): "what do I have to do TODAY"
      // is the work-context readback, not a profile question. The pairing of
      // a question word / doing-verb with the TODAY word is the signal —
      // "šiandien dirbau…" (past tense, log-work) never matches these.
      p("(ką|what|что|was|wat|\\bco\\b).{0,30}(šiandien|today|сегодня|heute|vandaag|dzisiaj|\\bdzi[sś]\\b)", 3),
      p("(šiandien|today|сегодня|heute|vandaag|dzisiaj|\\bdzi[sś]\\b).{0,30}(padaryti|daryti|nuveikti|to\\s+do|сделать|делать|zu\\s+tun|te\\s+doen|do\\s+zrobieni|zrobi[cć])", 3),
      p("(dienos|šiandienos)\\s+plan", 3),
      p("(dzisiejsz|jutrzejsz)\\w*\\s+(plan|grafik|harmonogram)", 3), // pl
      // TOMORROW. Every pattern here read TODAY or a bare "mano planas", so
      // "Parodyk mano rytojaus planą" — the owner's own example for this
      // workflow — matched nothing at all and reached the not-understood
      // fallback. The agenda reader already answers for any day; only the
      // word for the next one was missing.
      p("(rytoj|rytojaus|tomorrow|завтра|morgen|morgendlich|jutro|jutrzejsz)\\s*.{0,24}(plan|tvarkaraš|grafik|schedule|agenda|расписани|darb|harmonogram)", 3),
      p("(my|мой|m[oó]j)\\s+(plan|план)\\b", 2),
      p("\\bmano\\s+planas\\b", 2),
      p("\\bsusitikim", 1),
      p("\\bmeeting\\b", 1),
      p("планы", 1),
      p("\\bspotkani", 1), // pl
    ],
  },
  /**
   * CV IMPORT — an explicit WRITE verb, always.
   *
   * The four noun-only patterns this rule used to carry (weight 3 each, on
   * `cv` / `gyvenimo aprašymas` / `резюме` / `lebenslauf`) are what turned
   * every ordinary read into an upload: naming the object was treated as
   * asking to replace it. They now live on `cv-choose` below, which ASKS.
   * Weight 8 so an explicit "įkelk CV" still beats that question outright.
   */
  {
    intent: "cv",
    patterns: [
      p("(įkel|ikel|[iį]ked|prisek|prisegt|prikabin|importuo|nuskaityk|upload|uploaden|import|attach|hochlad|einles|загруз|прикреп|импортир|wgra|za[lł]aduj|prze[sś]lij|do[lł][aą]cz)\\w*\\s*.{0,16}(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)", 8),
      p("(\\bcv\\b|gyvenimo\\s+apraš|curriculum|résumé|resume|резюме|lebenslauf|[zż]yciorys)\\w*\\s*.{0,16}(įkel|ikel|upload|uploaden|import|прикреп|загруз|hochlad|wgra|za[lł]adowa|prze[sś]la)", 8),
    ],
  },
  /**
   * THE CV NAMED, AND NOTHING ELSE — the question, not a guess.
   *
   * "mano CV", "my CV", "моё резюме" carry no verb that separates VIEW from
   * UPLOAD from EDIT, and neither does "noriu pakeisti savo CV": REPLACE has
   * no flow of its own, because the CV is derived from the living profile
   * rather than stored as a document. Owner §5: *"If uncertain, ask. Never
   * turn an ambiguous read request into a write."* So this rule exists to be
   * answered with a question and three real doors, and it deliberately keeps
   * the weight-3 the noun always had — every rule above outranks it, and a
   * sentence that is genuinely about something else still wins on its own.
   */
  {
    intent: "cv-choose",
    patterns: [
      p("\\bcv\\b", 3),
      p("(gyvenimo\\s+apraš|curriculum|résumé|resume)", 3),
      p("резюме", 3),
      p("\\blebenslauf\\b", 3),
      p("\\b[zż]yciorys", 3), // pl
    ],
  },
  /**
   * EMPLOYER VISIBILITY — "who can see my profile", "make me visible to
   * employers" (capability matrix P0, 2026-09-23).
   *
   * THE DISCRIMINATOR IS THE VISIBILITY WORD, NEVER THE PROFILE NOUN. `profile`
   * owns "mano profilis" / "show my profile" at weight 2, and must keep them:
   * every pattern here needs a visibility stem (matom-, visib-, видим-,
   * zichtba-, sichtbar-, widoczn-), a WHO-SEES question over the profile, the
   * employer as the one who sees, or a hide verb over the profile. So "Parodyk
   * mano profilį" stays `profile` and "noriu pamatyti savo profilį" stays
   * `profile` — `\bmatyt` is bounded, so it can never fire inside "pamatyti".
   *
   * LT `matom` is spelled with its endings (matomas / matoma / matomą /
   * matomi / matomumas) so "matome" (we see) is not a visibility word. Stems
   * are ASCII-`\w`-free: `\w` does not match Lithuanian or Cyrillic letters, so
   * every gap is `.{0,N}` or `[^\s]*` (never `\S`: pattern sources are folded
   * to lower case, which turns `\S` into `\s`).
   */
  {
    intent: "employer-visibility",
    patterns: [
      // lt — "matomumas darbdaviams", "padaryk mane matomą darbdaviams",
      // "ar mano profilis matomas įmonėms?"
      p("\\bmatom(as|a|ą|i|os|umas|umą|umo|ų)\\b", 5),
      p("\\b(matom|matyt|mato|matys)[^\\s]*\\s*.{0,30}(darbdav|įmon|kompanij)", 2),
      p("(darbdav|įmon)[^\\s]*\\s*.{0,24}\\b(mato|matė|matys|matyti|matytų|matoma|matomas|matomi)\\b", 6),
      p("kas\\s+(mato|matys|gali\\s+matyti|galės\\s+matyti)\\s*.{0,20}profil", 7),
      p("(paslėp|slėpk|slėpti|nerodyk)[^\\s]*\\s*.{0,20}(profil|darbdav)", 6),
      // en — "make me visible to employers", "who can see my profile",
      // "can employers see my profile?", "hide my profile"
      p("\\bvisib(le|ility)\\b", 5),
      p("\\bvisib(le|ility)\\b\\s*.{0,30}(employer|compan|recruit|profile)", 2),
      p("\\bwho\\s+(can\\s+|could\\s+)?(sees?|views?)\\s*.{0,12}profile", 7),
      p("(employer|compan|recruiter)[a-z]*\\s+(can\\s+)?(see|find|view)\\s+(me|my\\s+profile)", 7),
      p("\\b(hide|unhide)\\s*.{0,16}profile", 6),
      // ru — "кто видит мой профиль", "сделай меня видимым для работодателей"
      p("(видим|видн)[^\\s]*\\s*.{0,30}(работодател|компани|профил)", 6),
      p("видимост", 5),
      p("кто\\s+(видит|увидит|может\\s+(видеть|увидеть))\\s*.{0,16}профил", 7),
      p("(работодател|компани)[^\\s]*\\s*.{0,20}(видят|видит|увидят)", 6),
      p("(скрой|скрыть|спрячь)\\s*.{0,16}профил", 6),
      // nl — "wie ziet mijn profiel", "maak mij zichtbaar voor werkgevers"
      p("zichtba", 5),
      p("\\bwie\\s+(ziet|kan\\s+.{0,12}zien)\\s*.{0,16}profiel", 7),
      p("werkgever[^\\s]*\\s*.{0,24}(zien|ziet)", 6),
      p("(verberg|verstop)\\s*.{0,16}profiel", 6),
      // de — "wer sieht mein Profil", "mach mich für Arbeitgeber sichtbar"
      p("sichtbar", 5),
      p("\\bwer\\s+(sieht|kann\\s+.{0,12}sehen)\\s*.{0,16}profil", 7),
      p("arbeitgeber[^\\s]*\\s*.{0,24}(sehen|sieht)", 6),
      p("(verberg|versteck)[^\\s]*\\s*.{0,16}profil|profil\\s*.{0,16}(verbergen|verstecken)", 6),
      // pl — "kto widzi mój profil", "widoczność dla pracodawców"
      p("widoczn", 5),
      p("\\bkto\\s+(widzi|zobaczy|mo[zż]e\\s+.{0,10}(widzie[cć]|zobaczy[cć]))\\s*.{0,16}profil", 7),
      p("pracodawc[^\\s]*\\s*.{0,24}(widz|zobacz)", 6),
      p("(ukryj|schowaj)\\s*.{0,16}profil", 6),
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
      p("(umiej[eę]tno|kompetencj)", 2), // pl skills
      p(
        "(pridėk|add|добавь|füge|voeg|dodaj)\\s+.{0,12}(kalb|language|язык|patirt|experience|опыт|išsilavin|education|образовани|sprache|taal|erfahrung|ervaring|ausbildung|opleiding|j[eę]zyk|wykszta[lł]ceni)",
        2,
      ),
      p("\\bkalb(a|ą|as|os)\\b", 1),
      p("\\blanguage", 1),
      p("\\b(sprache|taal)\\b", 1),
      p("\\bj[eę]zyk", 1), // pl
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
        "(kiek|how\\s+much|сколько|wie\\s+viel|hoeveel|\\bile\\b)\\s*.{0,20}(kredit|credit|likut|balans|баланс|guthaben|saldo|krediet|tegoed)",
        4,
      ),
      p("(kredit|credit|likut|balans|баланс|guthaben|saldo|krediet|tegoed)\\s*.{0,20}(istorij|history|истори|verlauf|geschiedenis|histori)", 4),
      p("(papildy|top\\s*up|пополн|auflad|opwaarder|do[lł]aduj|zasil)", 4),
      // "what was I charged for" — the question a debited user actually asks.
      p(
        "(už\\s+ką|for\\s+what|за\\s+что|wofür|waarvoor|za\\s+co)\\s*.{0,20}(nuskait|charg|списал|сняли|abgebucht|abgezogen|afgeschreven|pobran|naliczon)",
        5,
      ),
    ],
  },
  {
    // ACCEPT what is waiting (launch completion 2026-09-20). Placed BEFORE
    // `offers` so the accept verb outranks the list: "priimu pasiūlymą" is a
    // decision, "ką man siūlo" is a question. The verb needs the THING it
    // accepts (offer / invitation / booking / job) — except for the bare
    // one-word sentence, where the verb IS the whole message. The bare forms
    // deliberately leave out the words the goal layer already reads as a
    // plain YES to an in-flight question ("sutinku", "akkoord",
    // "einverstanden" — see `conversation-goal.ts` CONFIRMATION), so a yes
    // to "search all of Europe?" is not turned into an acceptance of an
    // offer nobody mentioned. `\w` is ASCII-only: every stem is spelled out.
    intent: "accept-offer",
    patterns: [
      // No bare "darbą" / "работу" object: "priimu į darbą" / "принять на
      // работу" is the EMPLOYER hiring, not the worker accepting.
      p("\\b(priimu|priimam|priimame|priimsiu|priimk|priimti|sutinku|sutinkam|sutinkame|sutikti|patvirtinu)\\b\\s*.{0,30}(pasiulym|kvietim|uzsakym|rezervacij|booking)", 6), // lt
      p("\\b(accept|accepting|i'?ll\\s+take|i\\s+take)\\s*.{0,30}\\b(offer|invitation|invite|booking|job|it)\\b", 6), // en
      p("(принимаю|принять|приму|соглас(ен|на|ны)|беру)\\s*.{0,30}(предложени|приглашени|бронировани)", 6), // ru
      p("\\b(accepteer|aanvaard|neem)\\s*.{0,30}(aanbod|aanbieding|uitnodiging|boeking|baan|aan\\b)", 6), // nl
      p("\\bakkoord\\s+met\\s*.{0,30}(aanbod|aanbieding|uitnodiging|boeking)", 6), // nl
      p("\\b(nehme|nimm|akzeptiere|annehmen|akzeptieren)\\s*.{0,30}(angebot|einladung|buchung|stelle|an\\b)", 6), // de
      p("(angebot|einladung|buchung)\\s*.{0,20}(annehmen|akzeptieren|angenommen)", 6), // de
      // pl — "przyjmuję ofertę" / "akceptuję zaproszenie" / "zgadzam się na rezerwację"
      // (2026-09-20, #1810). No bare "pracę" object: "przyjmuję do pracy" is the employer hiring.
      p("\\b(przyjmuj[eę]|przyjm[eę]|akceptuj[eę]|zgadzam\\s+si[eę]\\s+na)\\s*.{0,30}(ofert|zaproszeni|rezerwacj)", 6), // pl
      // The whole sentence is the verb: "Priimu." / "Accept" / "Принимаю" / "Przyjmuję".
      p("^\\s*(priimu|priimam|priimame|accept|accepted|i\\s+accept|принимаю|соглас(ен|на)|ik\\s+accepteer|accepteer|ich\\s+nehme\\s+an|ich\\s+akzeptiere|akzeptiere|annehmen|przyjmuj[eę]|akceptuj[eę])\\s*[.!]*\\s*$", 5),
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
      p("\\bofert", 3), // pl — oferta / oferty / ofert
      p("(ką\\s+man\\s+siūlo|what.{0,8}offered|что.{0,8}предлага|was\\s+wird\\s+mir\\s+angeboten|wat\\s+wordt\\s+mij\\s+aangeboden|co\\s+mi\\s+(proponuj|oferuj))", 2),
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
      p("kryteri", 4), // pl — the y-spelling never reaches `kriteri`
      p("(paieškos|search)\\s+(nustatym|settings|filtr)", 3),
      p("(such|zoek)(einstellung|instelling|filter)", 3), // de / nl compounds
      p("(wyszukiwani|wyszukiwan)\\w*\\s*.{0,12}(ustawieni|filtr)", 3), // pl
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
      // pl — "Co powinienem zrobić dalej?", "Co jeszcze muszę zrobić?"
      p("co\\s+(jeszcze|dalej|powinienem|powinnam|musz[eę])\\b", 3),
      p("\\bnext\\s+step", 2),
      p("\\bkitas\\s+žingsn", 2),
      p("(nächste(r)?\\s+schritt|volgende\\s+stap)", 2),
      p("(nast[eę]pny\\s+krok|kolejny\\s+krok)", 2), // pl
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
      // pl — "Gdzie skończyłem?" / "Na czym stanąłem?"
      p("gdzie\\s+(sko[nń]czy|przerwa|zosta[lł]em|stan[aą][lł]em)", 3),
      p("na\\s+czym\\s+(sko[nń]czy|stan[aą][lł])", 3),
      p("\\bcontinue\\b", 1),
      p("\\btęsti\\b", 1),
      p("(weitermachen|verdergaan|doorgaan)", 1),
      p("(kontynuuj|kontynuowa[cć])", 1), // pl
    ],
  },
];

/**
 * Classify a sentence into a single conversation intent. Returns `unknown`
 * (score 0) when nothing matched, so the caller can degrade to an honest
 * fallback + starter chips (never a fabricated action).
 */
/** The change-REQUEST shapes of the availability intent, mirroring the
 *  patterns beside them. Built with `p()` — the SAME helper the patterns
 *  use — so the diacritic fold and the Unicode word boundary are applied
 *  identically. A hand-rolled `new RegExp` here kept ASCII , which does not
 *  match before Cyrillic, so "Измени мою доступность" routed correctly and
 *  then failed this check: one rule, two boundary conventions. */
const AVAILABILITY_CHANGE_REQUEST = p(
    "\\b(pakeisk|pakeisti|keisk|atnaujink|atnaujinti|nustatyk" +
      "|change|update|set|edit" +
      "|измени|изменить|обнови|обновить|поменять|установи" +
      "|wijzig|verander|aanpassen" +
      "|ändere|andere|aktualisiere|setze" +
      "|zmień|zmienić|zaktualizuj|ustaw)\\b" +
      ".{0,24}" +
      "(prieinamum|galimum|laisvum|availability|доступност|занятост" +
      "|beschikbaarheid|verfügbarkeit|dostępność|dostępnosc)",
).re;

/**
 * Is this a request to CHANGE availability rather than a statement of it?
 *
 * An honesty distinction, not a routing one — both land on the same intent
 * and the same business action. "I can work from Monday" STATES that the
 * person is available; "change my availability" states nothing, so
 * pre-filling the card with "available" would put words in their mouth and
 * record a fact they never gave. The caller uses this to open the card with
 * no presumed status.
 */
export function isAvailabilityChangeRequest(text: string): boolean {
  return AVAILABILITY_CHANGE_REQUEST.test(fold(text));
}

export function classifyIntent(text: string): IntentMatch {
  // Folded to base letters so a sentence typed WITHOUT diacritics — the norm
  // on most keyboards — reaches exactly the same intent as one typed with
  // them. `fold` also lowercases.
  const q = fold(text ?? "");
  if (!q.trim()) return { intent: "unknown", score: 0, matched: [] };

  // Asked ONCE, then answered in O(1) for every `noSeek` pattern below.
  const seeks = SEEK_GUARD_RE.test(q);

  let best: IntentMatch = { intent: "unknown", score: 0, matched: [] };
  for (const rule of RULES) {
    let score = 0;
    const matched: string[] = [];
    for (const { re, weight, noSeek } of rule.patterns) {
      if (noSeek && seeks) continue;
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
  p("(zurnal|journal|журнал|tagebuch|dagboek|dziennik)").re,
  // an imperative to record work, with no journal word ("įrašyk darbą")
  p("(irasyk|uzfiksuok|uzrasyk|log)\\s+(mano\\s+)?darb").re,
  p("(irasyti|irasau|uzfiksuoti|uzrasyti|suvesti|fiksuoti)\\s*.{0,20}darb").re,
  p("record\\s+(my\\s+)?work").re,
  p("записать\\s+работу").re,
  // pl — "zapisz pracę", "wprowadź godziny", "uzupełnij dziennik pracy"
  p("(zapisz|zapisa[cć]|wpisz|wprowad[zź]|uzupe[lł]nij|odnotuj)\\s*.{0,20}(prac|godzin)").re,
];

export function isExplicitJournalRequest(text: string): boolean {
  const q = fold(text ?? "");
  if (!q.trim()) return false;
  return JOURNAL_REQUEST_PATTERNS.some((re) => re.test(q));
}
