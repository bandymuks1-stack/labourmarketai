/**
 * THE THREE PLATFORM E-MAILS OF A COMPANY'S FIRST CONTACT (owner P0 2026-11-13). PURE:
 * no I/O, no env, no clock — every caller passes what it knows.
 *
 *   1. `companyRegistrationNotice` — internal, to the owner mailbox, when a company
 *      has registered and its organization exists.
 *   2. `companyWelcomeEmail` — to the company, in the language it chose.
 *   3. `intakeAlertEmail` — internal, when a no-signup request was stored.
 *
 * THE LITHUANIAN WELCOME TEXT IS THE OWNER'S, VERBATIM. It is not to be reworded,
 * re-punctuated or "improved"; `company-registration-emails.test.ts` compares it
 * byte for byte with the approved text. The other five are faithful translations in
 * the polite form of address (British English for `en`).
 *
 * NOTHING HERE PROMISES A RESPONSE TIME, A PRICE OR A PAYMENT, and nothing is
 * advertising: an e-mail built here states a fact or offers help, nothing else.
 */

export const WELCOME_LOCALES = ["lt", "en", "ru", "pl", "de", "nl"] as const;
export type WelcomeLocale = (typeof WELCOME_LOCALES)[number];

/** A locale the welcome e-mail is written in, or English for any other UI locale. */
export function welcomeLocaleFor(locale: string | null | undefined): WelcomeLocale {
  const two = (locale ?? "").trim().toLowerCase().slice(0, 2);
  return WELCOME_LOCALES.find((l) => l === two) ?? "en";
}

type WelcomeCopy = {
  readonly subject: string;
  /** Paragraphs; a paragraph may hold line breaks (the sign-off). */
  readonly paragraphs: readonly string[];
};

const WELCOME: Record<WelcomeLocale, WelcomeCopy> = {
  lt: {
    subject: "Sveiki prisijungę prie LabourMarket.ai – esame pasiruošę padėti",
    paragraphs: [
      "Sveiki,",
      "Dėkojame, kad užregistravote savo įmonę LabourMarket.ai platformoje.",
      "Čia galite nemokamai skelbti darbuotojų paieškos ir kitus verslo poreikius, ieškoti specialistų bei bendradarbiavimo galimybių įvairiose profesinėse srityse.",
      "Jeigu registruojantis, pildant įmonės profilį, skelbiant poreikį ar naudojantis bet kuria platformos funkcija iškiltų klausimų arba techninių sunkumų, prašome nedelsiant susisiekti su mumis el. paštu info@labourmarket.ai.",
      "Mums svarbu, kad galėtumėte sklandžiai pradėti naudotis platforma. Jūsų pastabos taip pat padeda mums ją tobulinti.",
      "Pagarbiai,\nLabourMarket.ai komanda\ninfo@labourmarket.ai",
    ],
  },
  en: {
    subject: "Welcome to LabourMarket.ai – we are ready to help",
    paragraphs: [
      "Hello,",
      "Thank you for registering your company on the LabourMarket.ai platform.",
      "Here you can post staff searches and other business needs free of charge, and look for specialists and opportunities to work together across a range of professional fields.",
      "If you have any questions or meet technical difficulties while registering, completing your company profile, posting a need or using any feature of the platform, please contact us straight away by e-mail at info@labourmarket.ai.",
      "It matters to us that you can start using the platform smoothly. Your comments also help us to improve it.",
      "Kind regards,\nThe LabourMarket.ai team\ninfo@labourmarket.ai",
    ],
  },
  ru: {
    subject: "Добро пожаловать на LabourMarket.ai – мы готовы помочь",
    paragraphs: [
      "Здравствуйте,",
      "Благодарим Вас за регистрацию Вашей компании на платформе LabourMarket.ai.",
      "Здесь Вы можете бесплатно публиковать запросы на поиск работников и другие потребности бизнеса, искать специалистов и возможности сотрудничества в различных профессиональных областях.",
      "Если при регистрации, заполнении профиля компании, публикации запроса или использовании любой функции платформы у Вас возникнут вопросы или технические трудности, просим незамедлительно связаться с нами по электронной почте info@labourmarket.ai.",
      "Нам важно, чтобы Вы могли без затруднений начать пользоваться платформой. Ваши замечания также помогают нам её совершенствовать.",
      "С уважением,\nКоманда LabourMarket.ai\ninfo@labourmarket.ai",
    ],
  },
  pl: {
    subject: "Witamy na LabourMarket.ai – jesteśmy gotowi pomóc",
    paragraphs: [
      "Dzień dobry,",
      "Dziękujemy za zarejestrowanie Państwa firmy na platformie LabourMarket.ai.",
      "Mogą tu Państwo bezpłatnie publikować ogłoszenia o poszukiwaniu pracowników i inne potrzeby biznesowe, a także szukać specjalistów oraz możliwości współpracy w różnych dziedzinach zawodowych.",
      "Jeżeli podczas rejestracji, uzupełniania profilu firmy, publikowania potrzeby lub korzystania z dowolnej funkcji platformy pojawią się pytania albo trudności techniczne, prosimy o niezwłoczny kontakt z nami pod adresem e-mail info@labourmarket.ai.",
      "Zależy nam na tym, aby mogli Państwo bez przeszkód rozpocząć korzystanie z platformy. Państwa uwagi pomagają nam również ją ulepszać.",
      "Z poważaniem\nZespół LabourMarket.ai\ninfo@labourmarket.ai",
    ],
  },
  de: {
    subject: "Willkommen bei LabourMarket.ai – wir helfen Ihnen gern",
    paragraphs: [
      "Guten Tag,",
      "vielen Dank, dass Sie Ihr Unternehmen auf der Plattform LabourMarket.ai registriert haben.",
      "Hier können Sie kostenlos Personalgesuche und andere geschäftliche Anliegen veröffentlichen sowie nach Fachkräften und Kooperationsmöglichkeiten in verschiedenen Berufsfeldern suchen.",
      "Sollten bei der Registrierung, beim Ausfüllen des Unternehmensprofils, beim Veröffentlichen eines Bedarfs oder bei der Nutzung einer beliebigen Funktion der Plattform Fragen oder technische Schwierigkeiten auftreten, wenden Sie sich bitte umgehend per E-Mail an info@labourmarket.ai.",
      "Uns ist wichtig, dass Sie reibungslos mit der Nutzung der Plattform beginnen können. Ihre Anmerkungen helfen uns außerdem, sie zu verbessern.",
      "Mit freundlichen Grüßen\nIhr LabourMarket.ai-Team\ninfo@labourmarket.ai",
    ],
  },
  nl: {
    subject: "Welkom bij LabourMarket.ai – wij staan klaar om u te helpen",
    paragraphs: [
      "Goedendag,",
      "Hartelijk dank voor het registreren van uw bedrijf op het platform LabourMarket.ai.",
      "Hier kunt u kosteloos personeelsvragen en andere zakelijke behoeften plaatsen en zoeken naar specialisten en samenwerkingsmogelijkheden in uiteenlopende vakgebieden.",
      "Mocht u bij het registreren, het invullen van uw bedrijfsprofiel, het plaatsen van een behoefte of het gebruik van een functie van het platform vragen hebben of technische problemen ondervinden, neem dan direct contact met ons op via e-mail: info@labourmarket.ai.",
      "Wij vinden het belangrijk dat u soepel met het platform aan de slag kunt. Uw opmerkingen helpen ons bovendien om het te verbeteren.",
      "Met vriendelijke groet,\nHet team van LabourMarket.ai\ninfo@labourmarket.ai",
    ],
  },
};

export type BuiltEmail = { readonly subject: string; readonly text: string; readonly html: string };

/** The mailbox named in the owner's text. A link target only; never a recipient here. */
const SUPPORT_ADDRESS = "info@labourmarket.ai";
/** The original LM mark as shipped at the site root (apps/web/public/icon-192.png). */
const LOGO_PATH = "/icon-192.png";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text with the support address as a mailto link and line breaks kept. */
function htmlParagraph(text: string): string {
  return escapeHtml(text)
    .split(SUPPORT_ADDRESS)
    .join(`<a href="mailto:${SUPPORT_ADDRESS}" style="color:#7a5c10;text-decoration:underline;">${SUPPORT_ADDRESS}</a>`)
    .replace(/\n/g, "<br>");
}

/**
 * One layout for all three: a black band with the original mark, a white card, a
 * plain footer. Tables and inline styles only (mail clients ignore the rest); the
 * card is fluid up to 600px, so the same markup reads on a phone and a desktop.
 */
function layout(input: { readonly lang: string; readonly title: string; readonly siteUrl: string; readonly bodyHtml: string }): string {
  const site = input.siteUrl.replace(/\/+$/, "");
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(input.lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    "</head>",
    '<body style="margin:0;padding:0;background-color:#f3f3f1;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3f1;">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e0da;">',
    '<tr><td style="background-color:#070706;padding:20px 24px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td style="vertical-align:middle;"><img src="${escapeHtml(site)}${LOGO_PATH}" width="44" height="44" alt="LabourMarket.ai" style="display:block;border:0;"></td>`,
    '<td style="vertical-align:middle;padding-left:12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;font-weight:bold;color:#d4af37;">LabourMarket.ai</td>',
    "</tr></table>",
    "</td></tr>",
    `<tr><td style="padding:28px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#1c1c1a;">${input.bodyHtml}</td></tr>`,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

/** The welcome e-mail in the company's language. The text part is the approved text itself. */
export function companyWelcomeEmail(input: { readonly locale: string | null | undefined; readonly siteUrl: string }): BuiltEmail & {
  readonly locale: WelcomeLocale;
} {
  const locale = welcomeLocaleFor(input.locale);
  const copy = WELCOME[locale];
  const text = copy.paragraphs.join("\n\n");
  const bodyHtml = copy.paragraphs.map((p) => `<p style="margin:0 0 16px 0;">${htmlParagraph(p)}</p>`).join("\n");
  return { locale, subject: copy.subject, text, html: layout({ lang: locale, title: copy.subject, siteUrl: input.siteUrl, bodyHtml }) };
}

export type RegistrationNoticeInput = {
  readonly organizationName: string;
  /** ISO-3166 alpha-2 as stored, or null when the organization has none yet. */
  readonly countryCode: string | null;
  /** When the organization row was created (ISO 8601). */
  readonly registeredAtIso: string;
  /** Null when not lawfully available; the e-mail then says so instead of guessing. */
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  /** Absolute link to the organization in the administrator's view. */
  readonly adminUrl: string;
  /** null = could not be read (never shown as "no"). */
  readonly publishedNeeds: number | null;
  readonly siteUrl: string;
};

/** Whitespace collapsed, length capped: a name can never break the layout or a header. */
function clip(value: string | null | undefined, max: number): string {
  const s = (value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function countryLabelLt(code: string | null): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "nenurodyta";
  try {
    const name = new Intl.DisplayNames(["lt"], { type: "region" }).of(c);
    return name && name !== c ? `${name} (${c})` : c;
  } catch {
    return c;
  }
}

/**
 * "2026-11-13 19:40 UTC". Every time the platform shows is UTC and says so
 * (lib/time/display.ts); the instant is sliced, never formatted in an ambient zone.
 */
export function utcDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "nežinoma";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function rowsHtml(rows: readonly (readonly [string, string])[]): string {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    ...rows.map(
      ([label, valueHtml]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eceae4;font-size:13px;line-height:18px;color:#6b6a65;">${escapeHtml(label)}<br><span style="font-size:16px;line-height:23px;color:#1c1c1a;word-break:break-word;">${valueHtml}</span></td></tr>`,
    ),
    "</table>",
  ].join("\n");
}

const NOTICE_FOOTER = "Automatinis LabourMarket.ai pranešimas administratoriui. Tai ne kliento laiškas.";

/** Internal notice, Lithuanian, to the owner mailbox. Subject as the owner worded it. */
export function companyRegistrationNotice(input: RegistrationNoticeInput): BuiltEmail {
  const name = clip(input.organizationName, 160) || "be pavadinimo";
  const subject = `LabourMarket.ai – užsiregistravo nauja įmonė: ${name}`;
  const contactName = clip(input.contactName, 160) || "nepateikta";
  const contactEmail = clip(input.contactEmail, 254) || "nepateikta";
  const needs =
    input.publishedNeeds === null ? "nepavyko nustatyti" : input.publishedNeeds > 0 ? `Taip (${input.publishedNeeds})` : "Dar ne";
  const rows: readonly (readonly [string, string])[] = [
    ["Įmonės pavadinimas", name],
    ["Šalis", countryLabelLt(input.countryCode)],
    ["Registracijos data ir laikas", utcDateTime(input.registeredAtIso)],
    ["Kontaktinis asmuo", contactName],
    ["Darbo el. paštas", contactEmail],
    ["Ar įmonė jau paskelbė poreikį", needs],
    ["Organizacijos profilis administratoriui", input.adminUrl],
  ];
  const text = ["Užsiregistravo nauja įmonė.", "", ...rows.map(([l, v]) => `${l}: ${v}`), "", NOTICE_FOOTER].join("\n");
  const htmlRows = rows.map(([l, v]) =>
    l.startsWith("Organizacijos profilis")
      ? ([l, `<a href="${escapeHtml(v)}" style="color:#7a5c10;text-decoration:underline;">${escapeHtml(v)}</a>`] as const)
      : ([l, escapeHtml(v)] as const),
  );
  const bodyHtml = [
    '<p style="margin:0 0 16px 0;font-size:18px;line-height:26px;font-weight:bold;">Užsiregistravo nauja įmonė</p>',
    rowsHtml(htmlRows),
    `<p style="margin:20px 0 0 0;font-size:13px;line-height:19px;color:#6b6a65;">${escapeHtml(NOTICE_FOOTER)}</p>`,
  ].join("\n");
  return { subject, text, html: layout({ lang: "lt", title: subject, siteUrl: input.siteUrl, bodyHtml }) };
}

/**
 * The mark a test walk puts at the start of the company name it submits
 * (`NEED_WALK_MARK` in lib/testing). A LABEL, NEVER AN EXEMPTION: a marked request
 * is still alerted, recorded and counted as unhandled — only its subject says it is
 * a test. Anyone can type the mark; all it can do is label their own request.
 */
export const SYNTHETIC_INTAKE_MARK = "QA-SYNTHETIC";

export function isSyntheticIntake(companyName: string | null | undefined): boolean {
  return (companyName ?? "").trimStart().startsWith(SYNTHETIC_INTAKE_MARK);
}

/**
 * Internal alert for one stored no-signup request: its type and a link to the queue.
 * Never a name, a contact or the request's text — those stay behind the admin sign-in.
 * It says the request is waiting; it promises no time by which it will be answered.
 */
export function intakeAlertEmail(input: {
  readonly title: string;
  readonly queueUrl: string;
  readonly siteUrl: string;
  /** The stored request is a marked test (`isSyntheticIntake`): the subject says so. */
  readonly synthetic?: boolean;
}): BuiltEmail {
  const title = `${input.synthetic ? `[${SYNTHETIC_INTAKE_MARK}] ` : ""}${clip(input.title, 120)}`;
  const subject = `LabourMarket.ai – nauja užklausa: ${title}`;
  const text = [`${title} laukia peržiūros.`, "", input.queueUrl, "", NOTICE_FOOTER].join("\n");
  const bodyHtml = [
    '<p style="margin:0 0 16px 0;font-size:18px;line-height:26px;font-weight:bold;">Nauja užklausa</p>',
    `<p style="margin:0 0 16px 0;">${escapeHtml(title)} laukia peržiūros.</p>`,
    `<p style="margin:0 0 16px 0;"><a href="${escapeHtml(input.queueUrl)}" style="color:#7a5c10;text-decoration:underline;">Atidaryti užklausų eilę</a></p>`,
    `<p style="margin:20px 0 0 0;font-size:13px;line-height:19px;color:#6b6a65;">${escapeHtml(NOTICE_FOOTER)}</p>`,
  ].join("\n");
  return { subject, text, html: layout({ lang: "lt", title: subject, siteUrl: input.siteUrl, bodyHtml }) };
}
