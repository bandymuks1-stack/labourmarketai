/**
 * WHAT AN UNCLEAR SENTENCE MAY CARRY OFF THE PLATFORM (owner decision
 * 2026-11-22, Cloudflare Workers AI for `propose_conversation_intent`).
 *
 * The model's only job is to pick ONE existing intent id for a sentence the
 * deterministic router could not read. It needs the action words, not the
 * people. So the filter is an ALLOW-LIST, not a detector: a word leaves only
 * when it is product or everyday action vocabulary (LT / EN / RU stems below);
 * every other word — a name typed in lower case, a street, a company, a
 * code — becomes an opaque token that is restored only locally. Detecting
 * names by capital letters failed for lower-case chat and for first words
 * (R2 review of #3583), so capitalisation plays no part here.
 *
 * Not sent at all (`null`), fail closed:
 *   - longer than MAX_SENT_CHARS (a long text is content, not an intent);
 *   - more than MAX_TOKENS words outside the vocabulary (mostly private data);
 *   - fewer than MIN_WORDS vocabulary words left;
 *   - any special-category or credential word (health, beliefs, sexuality,
 *     union membership, criminal record, passwords, card numbers) — such a
 *     sentence never leaves, whatever else it says.
 *
 * E-mails, URLs and phones are tokenised first (the vacancy redactor's
 * patterns); every number is a token too, as the privacy text says (a
 * quantity stays on the platform and is restored locally).
 *
 * Pure. No IO, no server-only, no provider.
 */
import { redactContactData } from "@/lib/vacancy-store/vacancy-redaction";

export const MAX_SENT_CHARS = 160;
const MAX_TOKENS = 3;
const MIN_WORDS = 2;

export interface RedactedSentence {
  /** What may leave the platform. */
  readonly text: string;
  /** token index → the person's own characters; never sent. */
  readonly tokens: readonly string[];
}

const TOKEN_RE = /\[\[(\d+)\]\]/g;
const IS_TOKEN = /^\[\[\d+\]\]$/;

/**
 * Special-category and credential stems (lower case, prefix match). A hit
 * anywhere means the sentence is not sent.
 */
const NEVER_SEND: readonly string[] = [
  // health
  "serg", "susirg", "liga", "ligos", "ligon", "vėž", "covid", "kovid", "nėšč", "diagnoz", "neįgal", "depres", "psichik", "nedarbing",
  "sick", "illness", "disease", "cancer", "pregnan", "diagnos", "hiv", "disab", "depress", "mental",
  "болен", "болез", "заболе", "рак", "беремен", "диагноз", "ковид", "инвалид", "депресс",
  // beliefs, sexuality, ethnicity, union, criminal record
  "relig", "религ", "tikėjim", "seksual", "sexual", "сексуал", "gay", "gėj", "lesbi", "гей", "etnin", "ethnic", "этнич", "rasin", "racial", "расов",
  "profsąjung", "union", "профсоюз", "teistum", "criminal", "судим", "politin", "political", "полит",
  // credentials and payment data
  "password", "slaptažod", "пароль", "passcode", "iban", "kortelės numer", "card number", "номер карты", "pin",
];
const NEVER_SEND_EXACT = new Set(["ill", "pin", "рак", "gay", "гей"]);

/**
 * Allowed vocabulary: stems (prefix match, ≥ 3 letters) of product and
 * everyday action words, and exact short function words. Lower case.
 */
const STEMS: readonly string[] = [
  // ── LT ──
  "nori", "noriu", "norė", "reiki", "ieško", "ieškau", "ieškot", "rast", "surask", "suraski", "rask", "parod", "atidar", "atver", "sukur", "pridė", "pridėk",
  "užpild", "pildy", "įraš", "išsaug", "pakeis", "pervad", "pavadin", "pataisy", "ištrin", "pašalin", "patvirt", "priim", "atmes", "siųs", "išsiųs", "parašy", "rašy", "atsak",
  "kviest", "pakviest", "pasiūl", "siūl", "susisiek", "kontakt", "padė", "padėk", "pagalb", "išvers", "verst", "priminim", "primin", "sužinot", "žinot", "pradė", "tęs",
  "darb", "dirb", "darbuotoj", "darbinin", "specialist", "meistr", "komand", "brigad", "žmon", "žmog", "kandidat", "atrank", "įdarbin", "samd",
  "įmon", "organizacij", "agentūr", "subrang", "rangov", "tiekėj", "partner", "klient", "užsakov", "užsakym", "paslaug", "projekt", "objekt", "poreik", "skelbim", "vakans", "pareig",
  "žurnal", "ataskait", "valand", "šiandien", "vakar", "rytoj", "savait", "mėnes", "dien", "kalendor", "plan", "grafik", "pamain", "atostog",
  "gyvenimo aprašym", "aprašym", "profil", "patirt", "įgūdž", "kvalifikac", "išsilavin", "kalb", "dokument", "sertifikat", "pažymėjim", "licencij", "leidim",
  "mokym", "kurs", "studij", "student", "praktik", "stažuot", "mokykl", "universitet", "program",
  "žinut", "pokalb", "pranešim", "pasiūlym", "sutart", "sąskait", "kain", "atlygin", "užmokest", "eksport", "statistik", "rezultat", "būsen",
  "nauj", "kaip", "kada", "kiek", "koks", "kokia", "kokių", "kokie", "kuri", "kodėl", "visus", "keli", "penk", "dešimt", "trys", "tris", "vien",
  // ── EN ──
  "want", "need", "look", "search", "find", "show", "open", "creat", "add", "fill", "record", "log", "sav", "chang", "edit", "renam", "fix", "delet", "remov", "confirm", "accept", "declin", "reject", "send", "writ", "repl", "answer",
  "invit", "offer", "propos", "contact", "help", "translat", "remind", "start", "continu", "resum", "download", "export", "print", "upload", "import", "post", "publish", "hir", "recruit", "apply", "join",
  "work", "job", "employ", "staff", "worker", "people", "person", "team", "crew", "candidat", "applicant", "talent", "skill", "experienc", "qualif", "educat", "languag", "document", "certific", "licen", "permit",
  "compan", "organi", "agenc", "subcontract", "contract", "supplier", "partner", "client", "customer", "order", "servic", "project", "site", "need", "vacanc", "position", "role",
  "journal", "report", "timesheet", "hour", "today", "yesterday", "tomorrow", "week", "month", "day", "date", "calendar", "plan", "schedul", "shift", "leav", "holiday", "absen",
  "profil", "resum", "train", "cours", "stud", "intern", "school", "universit", "program", "learn",
  "messag", "chat", "conversat", "notif", "invoic", "price", "pay", "salar", "wage", "statist", "result", "status", "new",
  "my", "me", "mine", "our", "we", "you", "your", "the", "a", "an", "to", "for", "of", "in", "on", "at", "with", "and", "or", "from", "about", "please", "can", "could", "would", "will", "how", "where", "what", "when", "which", "who", "why", "all", "some", "few", "five", "ten", "two", "three", "one", "is", "are", "be", "do", "does", "get", "go", "let", "make", "set", "up", "it", "this", "that", "there", "i", "i'm", "im", "am",
  // ── RU ──
  "хочу", "хотим", "хочется", "хотел", "нужн", "надо", "ищу", "ищем", "иска", "найд", "найт", "покаж", "откр", "созд", "добав", "заполн", "запиш", "запис", "сохран", "измен", "переимен", "назван", "исправ", "удал", "подтвер", "прин", "отклон", "отправ", "напиш", "писа", "ответ",
  "пригла", "предлож", "связ", "контакт", "помог", "помощ", "перевед", "перев", "напомн", "начат", "продолж", "скача", "экспорт", "загруз", "опубли", "наня", "нанима",
  "работ", "сотрудник", "людей", "люди", "человек", "команд", "бригад", "кандидат", "навык", "опыт", "квалиф", "образован", "язык", "документ", "сертификат", "лиценз", "разреш",
  "компан", "организац", "агентств", "субподряд", "подряд", "поставщ", "партнер", "партнёр", "клиент", "заказ", "услуг", "проект", "объект", "потребн", "ваканс", "должност",
  "журнал", "отчет", "отчёт", "часы", "часов", "часа", "сегодня", "вчера", "завтра", "недел", "месяц", "день", "дня", "дата", "дату", "даты", "календар", "план", "график", "смен", "отпуск",
  "профил", "резюме", "обучен", "курс", "студент", "практик", "стажир", "школ", "университет", "программ", "уч",
  "сообщен", "чат", "разговор", "уведом", "счет", "счёт", "цена", "цены", "оплат", "зарплат", "статист", "результат", "статус", "новы", "новое", "новая", "новую",
  "мне", "мой", "моя", "мои", "моё", "мою", "моих", "мы", "наш", "я", "ты", "вы", "ваш", "как", "где", "что", "когда", "какие", "какой", "кто", "почему", "все", "всех", "пять", "пяти", "десять", "два", "две", "три", "один",
];

const EXACT: ReadonlySet<string> = new Set([
  // LT function words
  "man", "mano", "kur", "kas", "savo", "visi", "visus", "du", "dvi", "cv", "data", "datą", "datos", "mane", "manęs", "mums", "jums",
  "ir", "ar", "į", "iš", "su", "be", "už", "po", "per", "prie", "pas", "nuo", "iki", "dėl", "ant", "apie", "tai", "šis", "ši", "šią", "šį", "šios", "šio", "šiuo", "tas", "ta", "jau", "dar", "tik", "taip", "ne", "aš", "mes", "jūs", "tu", "jis", "ji", "prašau", "gal", "galiu", "galite", "yra", "būti", "bus", "noriu", "reikia", "reikėtų",
  // RU function words
  "и", "в", "во", "на", "с", "со", "к", "ко", "по", "за", "из", "от", "до", "для", "о", "об", "у", "не", "да", "это", "этот", "эта", "уже", "ещё", "еще", "только", "пожалуйста", "можно", "есть", "быть", "меня",
]);

function normalise(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}[\]]+|[^\p{L}\p{N}[\]]+$/gu, "");
}

/** Endings a SHORT (≤ 3 letters) stem may take; a short stem is never an
 *  open prefix, or "man" would pass "Mantas" and "kur" "Kuraitis". */
const SHORT_STEM_ENDINGS = ["", "s", "es", "ed", "ing", "e", "er", "ers", "d"];

function isVocabulary(word: string): boolean {
  if (EXACT.has(word)) return true;
  return STEMS.some((s) =>
    [...s].length <= 3 ? SHORT_STEM_ENDINGS.some((e) => word === s + e) : word.startsWith(s),
  );
}

function hasNeverSend(lower: string): boolean {
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((w) => NEVER_SEND_EXACT.has(w))) return true;
  return NEVER_SEND.some((s) => !NEVER_SEND_EXACT.has(s) && (s.includes(" ") ? lower.includes(s) : words.some((w) => w.startsWith(s))));
}

export function redactIntentSentence(input: string): RedactedSentence | null {
  const raw = String(input ?? "").trim();
  if (raw.length === 0 || raw.length > MAX_SENT_CHARS) return null;
  if (hasNeverSend(raw.toLowerCase())) return null;

  const first = redactContactData(raw);
  const tokens = [...first.tokens];
  let vocabulary = 0;

  const out = first.text.split(/(\s+)/).map((part) => {
    if (/^\s*$/.test(part) || IS_TOKEN.test(part)) return part;
    const word = normalise(part);
    if (word.length === 0) return part; // punctuation only
    if (IS_TOKEN.test(word)) return part;
    if (isVocabulary(word)) {
      if (/\p{L}/u.test(word)) vocabulary += 1;
      return part;
    }
    tokens.push(part);
    return `[[${tokens.length - 1}]]`;
  });

  if (tokens.length > MAX_TOKENS) return null;
  if (vocabulary < MIN_WORDS) return null;
  return { text: out.join(""), tokens };
}

/** Put the person's own characters back into a span the model copied out. */
export function restoreIntentTokens(span: string, tokens: readonly string[]): string {
  return span.replace(TOKEN_RE, (m, i: string) => tokens[Number(i)] ?? m);
}
