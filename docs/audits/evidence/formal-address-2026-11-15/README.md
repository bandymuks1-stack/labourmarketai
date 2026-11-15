# Formal address — Lithuanian "jūs", Dutch "u", Russian "вы"

Owner decision 2026-11-15, recorded in the launch register (#3265): **"Jūs"** is the default
professional form of address after sign-up and **"u"** in Dutch; every language keeps a natural,
respectful tone. It supersedes the owner order of 2026-10-28 that had moved the Lithuanian
interface to the informal "tu".

This text contains no personal data, no secrets, no security-vulnerability detail, no commercial
facts.

## What changed

| | Strings changed | Of |
|---|---|---|
| `messages/lt.json` | 3,198 | 15,729 |
| `messages/nl.json` | 2,284 | 15,729 |
| `messages/ru.json` | 64 | 15,729 |
| `messages/en.json`, `de.json`, `pl.json` and the five non-routed catalogs | 0 | |
| Hard-coded copy outside the catalogs (SEO titles and descriptions, three public pages, the global error page, the connection notice, the answer-engine links) | 47 replacements in 9 files | |
| Mobile app catalog (`apps/mobile/src/i18n/messages.ts`) | 121 Lithuanian, 112 Dutch | 344 each |

German already uses "Sie" throughout. Polish uses the capitalised "Ty/Twój", the usual polite form
in Polish software, and is unchanged.

## How

1. Every string with an informal marker was listed: pronouns (tu/tavo/tau/tave; je/jij/jouw;
   ты/твой), second-person verb forms and imperatives.
2. A second pass listed every Lithuanian string whose English says "you" or whose Russian is polite
   but which had no formal marker; it caught past and present forms the first list missed.
3. Each batch was converted by the same written rules (below), then checked mechanically:
   - placeholders, ICU plural/select syntax, rich-text tags, quotes and edge spaces are
     byte-identical;
   - texts that were identical before are identical after;
   - no informal pronoun, conditional or imperative is left outside the user's own words;
   - a re-scan for past-tense forms whose formal twin exists elsewhere in the catalog found the
     last four, now fixed.

## Rules applied

- Only the form of address and the grammar it requires. No rephrasing, no terminology change.
- Lithuanian: tu → jūs, tavo → jūsų, tau → jums, tave → jus; verbs to the 2nd person plural
  (gali → galite, pasirink → pasirinkite, galėsi → galėsite, galėtum → galėtumėte, dirbai →
  dirbote). Lower-case "jūs/jūsų/jums" mid-sentence, as the formal texts already did.
- Gendered words that referred to the reader ("esi prisijungęs", "pats", "tavo paties") were
  rephrased neutrally ("Prisijungta …", "jūsų", "savarankiškai"), never to a plural used for one
  person and never with slashes. Role nouns ("narys", "administratorius") stay.
- Dutch: je/jij → u, jouw → uw, jezelf → uzelf, with -t verbs ("u heeft", "kunt u"); imperatives
  stay in the stem form.
- Russian: ты/твой → вы/ваш, imperatives to the -те form.
- Greetings follow the register: "Labas" → "Sveiki", "Hoi" → "Hallo".

## Kept as written — the user's own words

| Where | Why |
|---|---|
| LT and RU `conversation.chat.user*` (5 each) | the user's own chat bubbles ("Parodyk mano profilį") |
| NL `instructions.card.clarifyBody` | the worker's own message to a manager, sent word for word |
| User-input examples inside the intent router and its tests | what people type; the router must keep matching them |

## Judgement calls worth a native reader's look

- Buttons worded as the user's request: "Atsiųskite man vienkartinę nuorodą", "Sutinku —
  atstovaukite man" (formal, addressed to the platform or agency), "Pasiūlyti struktūrą" and
  "Paaiškinti paprastai" (infinitive, the neutral button form).
- The landing's sample employer message: "Ar galėtumėte pradėti spalio 6 d.?"
- Dutch "{hours} je" was a mistranslation of the hour unit and is now "{hours} u".

## Not changed here

- `app/[locale]/(marketing)/jobs/page.tsx` and `jobs/[id]/page.tsx` carry hard-coded informal LT
  and NL lines; they are covered by a product-gate waiver bound to other PRs, so they wait for that
  surface's own change.
- Code comments that quote old wording (they do not render).

## Not done, not claimed

- No native speaker has read the converted texts. Usability with people: NOT TESTED.
