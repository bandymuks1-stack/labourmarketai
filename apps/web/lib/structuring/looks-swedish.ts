/**
 * IS THIS SENTENCE SWEDISH? (pure)
 *
 * The chat router and its readers are SHARED: one sentence, whatever the
 * person's language, runs past every language's vocabulary. Swedish joined on
 * 2026-11-12, and its short everyday words are other languages' words too —
 * `visa` is Lithuanian "visą" and the English "visa", `lag` is an English
 * noun and the Dutch "lagen", `timm…` opens the Dutch "timmerman", `till` sits
 * inside "still", `i` is the English "I" and the Polish "and", `min` is a
 * minute, `st` ends "31st". Added to the shared patterns, they changed how
 * Lithuanian, English, German, Dutch and Polish sentences were routed and read
 * (independent review of PR 3261, findings 1–12).
 *
 * THE RULE this module exists for: a Swedish addition may never change how a
 * non-Swedish sentence is routed or read. So Swedish vocabulary applies only
 * to a sentence that IS Swedish, and this is the ONE place that decides it —
 * from evidence no other served language produces:
 *
 *   • a Swedish function or everyday word that is not a word in lt / en / ru /
 *     de / nl / pl ("jag", "och", "är", "inte", "söker", "timmar" …),
 *   • a word START or END only Swedish has ("arbets…", "företag…", "svets…",
 *     "…arbetare", "…snickare"),
 *   • two words that are Swedish only together ("i dag", "vi har"), or
 *   • the letter å in an ordinary (lower-case) word.
 *
 * Every marker was run against the product's own text in the six other
 * languages (about 91 000 sentences of the lt / en / ru / de / nl / pl message
 * catalogues) and against the pinned corpus; a marker that fired on any of it
 * was dropped or tightened — "projekten" and "etappen" are German plurals,
 * "rapporten" a Dutch one, "schemat" Polish, "schema" English, "ja" German
 * and Finnish, "okej" Polish.
 *
 * Deliberately NOT evidence: every word the review found colliding (`visa`,
 * `min`, `mina`, `till`, `lag`, `klar`, `kan`, `med`, `en`, `den`, `om`,
 * `som`, `var`, `har`, `vi`, `tack`, `hej`, `ledig`, `privat`, `personal`,
 * `semester`, `chef`, `pass` …), an å inside a capitalised word ("Håkan",
 * "Luleå", "Århus" are names in any language's sentence), and the bare
 * letters ä / ö (German, Finnish, Estonian).
 *
 * A sentence carrying Danish / Norwegian evidence (æ, ø, "jeg", "ikke", "og")
 * is not Swedish, although it shares "på" and "har" with it.
 *
 * A MISS IS SAFE, A FALSE HIT IS NOT. A short Swedish input with no marker
 * ("CV", "Okej", "Kontakta Jonas", "8 tim") is read exactly as every other
 * language's sentence is — the language-neutral behaviour. A non-Swedish
 * sentence read as Swedish is the defect, and
 * `lib/conversation/other-languages-unchanged-by-sv.test.ts` pins that none
 * of its 2 000+ non-Swedish sentences is.
 *
 * Reads the RAW sentence — never the diacritic-folded one: folded, "är" is
 * the Lithuanian "ar", "för" the English "for", "på" the Dutch "pa".
 */

/** Whole words, lower-cased, compared against the raw sentence's tokens. */
const SWEDISH_WORDS: ReadonlySet<string> = new Set([
  // pronouns, conjunctions, particles
  "jag", "och", "inte", "eller", "också", "ocksa", "ett", "det", "vill", "ingen",
  "är", "när", "här", "där", "från", "på", "för", "så", "då", "åt", "även", "än",
  "hur", "vad", "vem", "vilka", "vilken", "vilket", "varför", "varfor",
  "vår", "vårt", "våra", "någon", "något", "några",
  "måste", "skulle", "kunna", "finns", "blev", "gör", "göra", "gjorde",
  // time
  "idag", "igår", "imorgon", "morgon", "förrgår", "härnäst", "nästa", "förra",
  "timmar", "timme", "timmars", "timmarna", "vecka", "veckan", "veckor", "veckors",
  "månad", "månaden", "månader", "år", "året", "dagar", "dagars",
  "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag",
  // work verbs
  "söker", "soker", "behöver", "behover", "letar", "jobbar", "jobbade", "jobbat", "jobba",
  "arbetar", "arbetade", "arbetat", "arbeta", "talar", "pratar",
  "skapa", "öppna", "ändra", "lägg", "skriv", "skicka", "hitta", "bjud",
  "påminn", "översätt", "bekräfta", "godkänn", "registrera", "ladda", "föreslå",
  "accepterar", "erbjuder", "erbjuda", "säljer", "sälja", "hyr",
  // work nouns
  "jobb", "jobbet", "arbete", "arbetet", "företag", "foretag", "företaget", "företagets",
  "bolag", "bolaget", "bemanningsföretag", "bemanningsföretaget",
  "medarbetare", "anställda", "anställd", "arbetslag", "arbetsgivare", "arbetsgivaren",
  "projektet", "teamet", "bygget", "uppgift", "uppgiften", "uppgifter",
  "inlägg", "möte", "mötet", "lön", "lönen",
  "kronor", "erfarenhet", "utbildning", "färdighet", "färdigheter", "kompetenser",
  "yrke", "yrken", "språk", "meddelande", "meddelanden", "erbjudande", "erbjudandet",
  "erbjudanden", "inbjudan", "inbjudningar", "kunder", "kollegor",
  "tidrapport", "tidrapporten", "certifikat", "intyg", "körkort",
  "svetsare", "snickare", "målare", "murare", "städare", "rörmokare",
  "lediga", "tillgänglig", "tillgängliga", "tillgänglighet", "färdig",
  "svenska", "engelska", "tyska", "sverige",
  "boende", "bostad", "semesterdagar", "frånvaro", "sjuk",
  "nej", "japp", "visst", "gärna", "snälla",
  // more imperatives and nouns the chat is asked with
  "flytta", "tilldela", "växla", "montera", "senast", "personer", "programmet",
  "chatta", "exportera", "importera", "ansök", "ansöka", "ansöker", "notiser", "notis",
  "aviseringar", "förslag", "förslaget", "nytt", "bifogar", "bifoga", "bifogat",
  "totalt", "sammanlagt", "avtal", "avtalet", "högst", "fortsätt", "acceptera",
  "grävmaskin", "grävmaskinen", "blockerad", "försenad", "försenade", "fastnat",
  "kandidater", "kandidaterna", "lärkompass", "lärkompassen",
]);

/**
 * Word STARTS no other served language has — Swedish compounds put the head
 * last, so the first part is what stays recognisable ("arbetsmarknadskartan",
 * "ställningsbyggare", "redovisningsekonom"). German writes "Arbeits…",
 * Norwegian "arbeids…", Danish "arbejds…".
 */
const SWEDISH_WORD_START_RE =
  /(?<![\p{L}\p{N}])(?:arbets(?!förmedling)|företag|foretag|anställ|utbildning|yrkes|färdighet|tillgänglig|erbjud|inbjud|meddeland|uppgift|svets|snickar|rörmok|ställning|plattsätt|taklägg|lastbil|sjuksköt|undersköt|förskol|redovisning|bokför|översätt|bekräft|godkän|möjlighet|löne|lärling|semesterdag|semesteransök|hjälp)\p{L}*/u;

/**
 * Word ENDS only Swedish has — the HEAD of an occupation compound, which is
 * how a role is typed alone ("Lagerarbetare", "Byggnadssnickare",
 * "Ställningsbyggare", "Lastbilsförare", "Undersköterska"). German writes
 * "…arbeiter", Danish "…arbejder", Norwegian "…arbeider".
 */
const SWEDISH_WORD_END_RE =
  /\p{L}*(?:arbetare|snickare|byggare|läggare|sättare|montör|förare|sköterska|biträde|mokare|plockare|operatör|installatör|servitör|servitris)(?![\p{L}\p{N}])/u;

/**
 * Words that are Swedish only TOGETHER: each half is somebody else's word
 * ("i" + "dag", "vi" + "har", "den" + "här"), the pair is not.
 */
const SWEDISH_PAIRS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])i\s+(?:dag|går|morgon|kväll|övermorgon|förrgår)(?![\p{L}\p{N}])/u,
  // No "vi kan": "Fase VI kan starten" is Dutch. No "de": "de kan" is a Dutch jug.
  /(?<![\p{L}\p{N}])(?:vi|du|ni)\s+(?:har|ska|vill|är|behöver|söker)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:du|ni)\s+kan(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:har|kan|ska|vill)\s+(?:vi|du|ni|jag)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:den|det)\s+här(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])som\s+heter(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:sitter|står|kört)\s+fast(?![\p{L}\p{N}])/u,
  // No "till den": "Schreib Till den Bericht" is German (Till is a first name).
  /(?<![\p{L}\p{N}])till\s+(?:salu|mitt|vårt)(?![\p{L}\p{N}])/u,
  // No bare "byt" (a Polish noun) and no bare "minst" (Dutch "least").
  /(?<![\p{L}\p{N}])byt\s+(?:till|namn|ut)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:minst|lägst)\s+\d[\d\s.]*\s*(?:kr|kronor|sek)(?![\p{L}\p{N}])/u,
  // The possessive beside its noun. `min` alone is a minute, a minimum and a
  // given name, so it counts only beside a noun that is itself Swedish-shaped.
  /(?<![\p{L}\p{N}])(?:mina|mitt)\s+(?:profil|cv|journal|projekt|kort|team|timmar|program|kurser|studenter|elever|schema|konto|jobb|namn)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])min\s+(?:profil|journal|kalender|historik|chef)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:visa|lista)\s+(?:mina|mitt|våra)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])tack\s+(?:så|ja|nej)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:ja|nej)\s+tack(?![\p{L}\p{N}])/u,
  // "fr.o.m. 1 december" / "t.o.m. 20 december" — from / up to and including.
  /(?<![\p{L}\p{N}])(?:fr\.o\.m|t\.o\.m)\.?(?![\p{L}\p{N}])/u,
  // The WHOLE sentence is the two-word Swedish command. `visa` alone is the
  // Lithuanian "visą" and the English "visa", so it is evidence only when the
  // sentence is nothing but "show" + a Swedish noun form.
  /^\s*visa\s+(?:projekt|projekten|teamet|journalen)\s*[.!]*\s*$/u,
];

/** "mitt" is Swedish in the middle of a sentence; capitalised it is also a
 *  first name ("Mitt Romney"), so the sentence-initial form needs its noun
 *  (see the possessive pair above). Read on the RAW sentence. */
const LOWERCASE_MITT_RE = /(?<![\p{L}\p{N}])mitt(?![\p{L}\p{N}])/u;

/** Danish / Norwegian — shares "på", "har", "vi" with Swedish, is not Swedish. */
const NOT_SWEDISH_RE = /[æø]|(?<![\p{L}\p{N}])(?:jeg|ikke|og|af|hvad|hvor|hvem)(?![\p{L}\p{N}])/u;

/** A word of ordinary lower-case letters holding å ("två", "gång", "språk"). */
const LOWERCASE_A_RING_RE = /(?<![\p{L}\p{N}])\p{Ll}*å\p{Ll}*(?![\p{L}\p{N}])/u;

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export function looksSwedish(text: string | null | undefined): boolean {
  const raw = (text ?? "").normalize("NFC");
  if (raw.trim() === "") return false;
  const lower = raw.toLowerCase();
  if (NOT_SWEDISH_RE.test(lower)) return false;
  // RAW, not lower-cased: "Håkan" and "Luleå" keep their capital and are names.
  if (LOWERCASE_A_RING_RE.test(raw) || LOWERCASE_MITT_RE.test(raw)) return true;
  for (const m of lower.matchAll(TOKEN_RE)) {
    if (SWEDISH_WORDS.has(m[0])) return true;
  }
  return (
    SWEDISH_WORD_START_RE.test(lower) ||
    SWEDISH_WORD_END_RE.test(lower) ||
    SWEDISH_PAIRS.some((re) => re.test(lower))
  );
}
