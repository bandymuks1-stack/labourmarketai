import "server-only";

import { createHash } from "node:crypto";

/**
 * Versioned consent text registry (GDPR Art. 4(11), 7; EDPB Guidelines
 * 05/2020). SINGLE SOURCE OF TRUTH for every consent text shown to a user.
 *
 * Design rules (docs/legal/consent-and-disclosure-design-v1.md):
 * - The legal consent texts live HERE, not in the next-intl catalogs, so the
 *   exact rendered wording is the exact hashed wording — no drift between
 *   what the user saw and what the ledger can prove.
 * - Every purpose+version has a deterministic SHA-256 hash over the canonical
 *   JSON of ALL locale texts. The DB pins the current (version, hash) pair in
 *   `privacy_consent_purposes`; the grant RPCs reject any stale or unknown
 *   version/hash (fail closed).
 * - A consent event therefore proves: which version was in force, which
 *   locale was shown, what the full text was (reproducible from git history
 *   of this file + the hash), when and for which purpose the user acted.
 * - Changing purpose scope, recipients, disclosed data or usage requires a
 *   NEW version here + a DB current-version bump; old grants then stop
 *   counting as current (enforced in SQL, tested).
 * - UI chrome (buttons, nav) stays in the i18n catalogs; only the legal
 *   explanation blocks live here.
 */

export const CONSENT_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
export type ConsentLocale = (typeof CONSENT_LOCALES)[number];

export const CONSENT_PURPOSES = [
  "profile_discoverability",
  "employer_data_disclosure",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Marketing communications: the product sends NO optional marketing
 * messages today, so per the privacy plan no public marketing consent
 * surface is created. Add a third purpose + version here IF that changes. */

export interface ConsentTextBlocks {
  /** Short title of the choice. */
  readonly title: string;
  /** One-paragraph plain-language summary (no GDPR jargon). */
  readonly summary: string;
  /** What the recipient WILL see. */
  readonly visibleData: string;
  /** What the recipient will NOT get without a separate confirmation. */
  readonly invisibleData: string;
  /** Statement that the choice is optional and what works without it. */
  readonly freedom: string;
  /** How to withdraw and what withdrawal does / does not do. */
  readonly withdrawal: string;
  /** Who the data controller is (GDPR Art. 13(1)(a)) and who is NOT. */
  readonly controller: string;
}

export interface ConsentDefinition {
  readonly purpose: ConsentPurpose;
  readonly version: string;
  /** Who receives the data under this purpose. */
  readonly recipientCategory: string;
  /** Data categories that may become visible/transferable under this purpose. */
  readonly dataCategories: readonly string[];
  /** Route of the fuller privacy notice. */
  readonly privacyNoticeRoute: string;
  readonly texts: Readonly<Record<ConsentLocale, ConsentTextBlocks>>;
}

/** Fields a worker may approve for a single employer-specific disclosure.
 * Server-side whitelist — the DB RPC enforces the same closed set. */
export const DISCLOSABLE_FIELDS = [
  "full_name",
  "phone",
  "email",
  "cv_document",
  "preferred_locations",
  "availability_details",
  "salary_expectation",
] as const;
export type DisclosableField = (typeof DISCLOSABLE_FIELDS)[number];

export const PROFILE_DISCOVERABILITY_V1: ConsentDefinition = {
  purpose: "profile_discoverability",
  version: "2026-07-11.v2",
  recipientCategory:
    "Registered and signed-in companies and staffing agencies on LabourMarket.ai",
  dataCategories: [
    "chosen display name",
    "profession(s)",
    "experience years",
    "skills and safely published work-evidence descriptions",
    "preferred work region (approximate)",
    "availability status",
    "languages",
    "pay expectation (only if the worker entered it)",
  ],
  privacyNoticeRoute: "/privacy",
  texts: {
    lt: {
      title: "Leisti įmonėms rasti mano profesinį profilį",
      summary:
        "Pasirinkę šią parinktį leisite registruotoms įmonėms ir agentūroms matyti ribotą jūsų profesinio profilio informaciją darbo pasiūlymų ir atrankos tikslu.",
      visibleData:
        "Įmonės galės matyti jūsų profesiją, patirtį, įgūdžius, pageidaujamą darbo regioną, prieinamumą, kalbas ir kitą peržiūroje aiškiai nurodytą profesinę informaciją.",
      invisibleData:
        "Jūsų telefono numeris, el. pašto adresas, pilnas CV, tikslus adresas ir privatūs dokumentai nebus perduoti be atskiro jūsų patvirtinimo.",
      freedom:
        "Šis pasirinkimas nėra būtinas paskyrai, CV ar darbo žurnalui naudoti. Jo neįjungus profilis liks privatus.",
      withdrawal:
        "Sutikimą galite bet kada išjungti privatumo nustatymuose. Išjungus, profilis nebebus rodomas naujose įmonių paieškose.",
      controller:
        "Duomenų valdytoja — UAB „Nonstop Group“ (įmonės kodas 302676973, Lietuva). Privatumo kontaktas: info@labourmarket.ai. Programinės įrangos savininkė Labour Market AI Sp. z o.o. jūsų asmens duomenų negauna.",
    },
    en: {
      title: "Allow companies to find my professional profile",
      summary:
        "By choosing this option you allow registered companies and agencies to see a limited part of your professional profile for job offers and candidate selection.",
      visibleData:
        "Companies will be able to see your profession, experience, skills, preferred work region, availability, languages and the other professional information clearly listed in the preview.",
      invisibleData:
        "Your phone number, email address, full CV, exact address and private documents will not be shared without your separate confirmation.",
      freedom:
        "This choice is not required to use your account, CV or work journal. If you do not enable it, your profile stays private.",
      withdrawal:
        "You can switch this off at any time in your privacy settings. Once switched off, your profile no longer appears in new company searches.",
      controller:
        "The data controller is UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The software owner Labour Market AI Sp. z o.o. does not receive your personal data.",
    },
    ru: {
      title: "Разрешить компаниям находить мой профессиональный профиль",
      summary:
        "Выбрав эту настройку, вы разрешаете зарегистрированным компаниям и агентствам видеть ограниченную часть вашего профессионального профиля для предложений работы и подбора кандидатов.",
      visibleData:
        "Компании смогут видеть вашу профессию, опыт, навыки, предпочитаемый регион работы, доступность, языки и другую профессиональную информацию, ясно указанную в предпросмотре.",
      invisibleData:
        "Ваш номер телефона, адрес электронной почты, полное CV, точный адрес и личные документы не будут переданы без вашего отдельного подтверждения.",
      freedom:
        "Эта настройка не обязательна для использования аккаунта, CV или рабочего журнала. Если вы её не включите, профиль останется приватным.",
      withdrawal:
        "Вы можете отключить согласие в любой момент в настройках приватности. После отключения профиль больше не показывается в новых поисках компаний.",
      controller:
        "Контролёр данных — UAB «Nonstop Group» (код компании 302676973, Литва). Контакт по приватности: info@labourmarket.ai. Владелец программного обеспечения Labour Market AI Sp. z o.o. ваши персональные данные не получает.",
    },
    nl: {
      title: "Bedrijven toestaan mijn professionele profiel te vinden",
      summary:
        "Met deze keuze staat u toe dat geregistreerde bedrijven en uitzendbureaus een beperkt deel van uw professionele profiel zien voor vacatures en kandidaatselectie.",
      visibleData:
        "Bedrijven kunnen uw beroep, ervaring, vaardigheden, gewenste werkregio, beschikbaarheid, talen en de overige professionele informatie zien die duidelijk in de voorvertoning staat.",
      invisibleData:
        "Uw telefoonnummer, e-mailadres, volledige cv, exacte adres en privédocumenten worden niet gedeeld zonder uw afzonderlijke bevestiging.",
      freedom:
        "Deze keuze is niet vereist om uw account, cv of werkdagboek te gebruiken. Als u haar niet inschakelt, blijft uw profiel privé.",
      withdrawal:
        "U kunt dit op elk moment uitzetten in uw privacy-instellingen. Daarna verschijnt uw profiel niet meer in nieuwe zoekopdrachten van bedrijven.",
      controller:
        "De verwerkingsverantwoordelijke is UAB “Nonstop Group” (bedrijfscode 302676973, Litouwen). Privacycontact: info@labourmarket.ai. De software-eigenaar Labour Market AI Sp. z o.o. ontvangt uw persoonsgegevens niet.",
    },
    de: {
      title: "Unternehmen erlauben, mein berufliches Profil zu finden",
      summary:
        "Mit dieser Auswahl erlauben Sie registrierten Unternehmen und Agenturen, einen begrenzten Teil Ihres beruflichen Profils für Stellenangebote und Kandidatenauswahl zu sehen.",
      visibleData:
        "Unternehmen können Ihren Beruf, Ihre Erfahrung, Fähigkeiten, bevorzugte Arbeitsregion, Verfügbarkeit, Sprachen und die weiteren in der Vorschau klar aufgeführten beruflichen Angaben sehen.",
      invisibleData:
        "Ihre Telefonnummer, E-Mail-Adresse, Ihr vollständiger Lebenslauf, Ihre genaue Adresse und private Dokumente werden ohne Ihre gesonderte Bestätigung nicht weitergegeben.",
      freedom:
        "Diese Auswahl ist für die Nutzung Ihres Kontos, Lebenslaufs oder Arbeitstagebuchs nicht erforderlich. Ohne sie bleibt Ihr Profil privat.",
      withdrawal:
        "Sie können die Einwilligung jederzeit in den Datenschutzeinstellungen deaktivieren. Danach erscheint Ihr Profil nicht mehr in neuen Unternehmenssuchen.",
      controller:
        "Verantwortliche für die Datenverarbeitung ist die UAB „Nonstop Group“ (Unternehmenscode 302676973, Litauen). Datenschutzkontakt: info@labourmarket.ai. Die Softwareeigentümerin Labour Market AI Sp. z o.o. erhält Ihre personenbezogenen Daten nicht.",
    },
  },
};

export const EMPLOYER_DATA_DISCLOSURE_V1: ConsentDefinition = {
  purpose: "employer_data_disclosure",
  version: "2026-07-11.v2",
  recipientCategory:
    "One specific company or agency named in the confirmation, for one specific need, offer, booking or application",
  dataCategories: [
    "only the fields explicitly listed and approved in the confirmation",
    "possible fields: full name, phone, email, CV document, preferred locations, availability details, salary expectation",
  ],
  privacyNoticeRoute: "/privacy",
  texts: {
    lt: {
      title: "Patvirtinti duomenų perdavimą įmonei",
      summary:
        "Jūs leidžiate LabourMarket.ai perduoti žemiau nurodytus duomenis įmonei „{companyName}“ dėl „{contextTitle}“.",
      visibleData:
        "Bus perduoti tik patvirtinimo lange išvardyti laukai (pvz., vardas, kontaktai ar CV failas). Nieko daugiau neperduodama.",
      invisibleData:
        "Visi kiti jūsų duomenys lieka neperduoti. Kitoms įmonėms ar kitiems poreikiams šis patvirtinimas negalioja.",
      freedom:
        "Perdavimas įvyksta tik po jūsų aktyvaus patvirtinimo. Nepatvirtinus, duomenys įmonei neperduodami, o jūsų paskyra veikia toliau.",
      withdrawal:
        "Leidimą galite atšaukti privatumo nustatymuose. Atšaukus, nauji perdavimai sustabdomi ir platformos sugeneruotos prieigos nuorodos panaikinamos, tačiau įmonė galėjo matyti duomenis, kol leidimas galiojo — apie tai informuojame sąžiningai.",
      controller:
        "Perdavimą vykdo duomenų valdytoja UAB „Nonstop Group“ (įmonės kodas 302676973, Lietuva). Privatumo kontaktas: info@labourmarket.ai. Duomenys perduodami tik patvirtinime nurodytai įmonei — ne Labour Market AI Sp. z o.o.",
    },
    en: {
      title: "Confirm data transfer to a company",
      summary:
        "You allow LabourMarket.ai to transfer the data listed below to “{companyName}” for “{contextTitle}”.",
      visibleData:
        "Only the fields listed in this confirmation (for example name, contact details or a CV file) will be transferred. Nothing else is shared.",
      invisibleData:
        "All your other data stays private. This confirmation is not valid for other companies or other needs.",
      freedom:
        "The transfer happens only after your active confirmation. Without it, no data is passed to the company and your account keeps working.",
      withdrawal:
        "You can revoke this permission in your privacy settings. New transfers stop and platform-generated access links are cancelled, but the company may have seen the data while the permission was valid — we state this honestly.",
      controller:
        "The transfer is performed by the data controller UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. Data goes only to the company named in the confirmation — not to Labour Market AI Sp. z o.o.",
    },
    ru: {
      title: "Подтвердить передачу данных компании",
      summary:
        "Вы разрешаете LabourMarket.ai передать указанные ниже данные компании «{companyName}» в связи с «{contextTitle}».",
      visibleData:
        "Будут переданы только поля, перечисленные в этом подтверждении (например, имя, контакты или файл CV). Больше ничего не передаётся.",
      invisibleData:
        "Все остальные ваши данные остаются закрытыми. Это подтверждение не действует для других компаний или других запросов.",
      freedom:
        "Передача происходит только после вашего активного подтверждения. Без него данные компании не передаются, а ваш аккаунт продолжает работать.",
      withdrawal:
        "Вы можете отозвать разрешение в настройках приватности. Новые передачи прекращаются, а созданные платформой ссылки доступа аннулируются, однако компания могла видеть данные, пока разрешение действовало — мы честно об этом сообщаем.",
      controller:
        "Передачу выполняет контролёр данных UAB «Nonstop Group» (код компании 302676973, Литва). Контакт по приватности: info@labourmarket.ai. Данные передаются только компании, названной в подтверждении, — не Labour Market AI Sp. z o.o.",
    },
    nl: {
      title: "Gegevensoverdracht aan een bedrijf bevestigen",
      summary:
        "U staat LabourMarket.ai toe de hieronder vermelde gegevens over te dragen aan “{companyName}” in verband met “{contextTitle}”.",
      visibleData:
        "Alleen de in deze bevestiging vermelde velden (bijvoorbeeld naam, contactgegevens of een cv-bestand) worden overgedragen. Verder wordt niets gedeeld.",
      invisibleData:
        "Al uw overige gegevens blijven privé. Deze bevestiging geldt niet voor andere bedrijven of andere aanvragen.",
      freedom:
        "De overdracht vindt alleen plaats na uw actieve bevestiging. Zonder bevestiging worden geen gegevens aan het bedrijf doorgegeven en blijft uw account gewoon werken.",
      withdrawal:
        "U kunt deze toestemming intrekken in uw privacy-instellingen. Nieuwe overdrachten stoppen en door het platform gegenereerde toegangslinks worden ingetrokken, maar het bedrijf kan de gegevens hebben gezien zolang de toestemming geldig was — dat vermelden wij eerlijk.",
      controller:
        "De overdracht wordt uitgevoerd door de verwerkingsverantwoordelijke UAB “Nonstop Group” (bedrijfscode 302676973, Litouwen). Privacycontact: info@labourmarket.ai. Gegevens gaan alleen naar het in de bevestiging genoemde bedrijf — niet naar Labour Market AI Sp. z o.o.",
    },
    de: {
      title: "Datenübermittlung an ein Unternehmen bestätigen",
      summary:
        "Sie erlauben LabourMarket.ai, die unten aufgeführten Daten an „{companyName}“ im Zusammenhang mit „{contextTitle}“ zu übermitteln.",
      visibleData:
        "Übermittelt werden nur die in dieser Bestätigung aufgeführten Felder (zum Beispiel Name, Kontaktdaten oder eine Lebenslauf-Datei). Sonst wird nichts weitergegeben.",
      invisibleData:
        "Alle Ihre übrigen Daten bleiben privat. Diese Bestätigung gilt nicht für andere Unternehmen oder andere Anfragen.",
      freedom:
        "Die Übermittlung erfolgt nur nach Ihrer aktiven Bestätigung. Ohne sie werden keine Daten an das Unternehmen weitergegeben, und Ihr Konto funktioniert weiter.",
      withdrawal:
        "Sie können diese Erlaubnis in den Datenschutzeinstellungen widerrufen. Neue Übermittlungen stoppen und vom System erzeugte Zugriffslinks werden zurückgezogen; das Unternehmen kann die Daten jedoch gesehen haben, solange die Erlaubnis galt — das sagen wir ehrlich.",
      controller:
        "Die Übermittlung führt die Verantwortliche UAB „Nonstop Group“ (Unternehmenscode 302676973, Litauen) durch. Datenschutzkontakt: info@labourmarket.ai. Daten gehen nur an das in der Bestätigung genannte Unternehmen — nicht an die Labour Market AI Sp. z o.o.",
    },
  },
};

export const CONSENT_DEFINITIONS: readonly ConsentDefinition[] = [
  PROFILE_DISCOVERABILITY_V1,
  EMPLOYER_DATA_DISCLOSURE_V1,
];

/** Deterministic SHA-256 over the canonical JSON of a definition's version +
 * all locale texts. This exact value is pinned in
 * `public.privacy_consent_purposes` — the grant RPCs reject mismatches. */
export function consentTextHash(def: ConsentDefinition): string {
  const canonical = JSON.stringify({
    purpose: def.purpose,
    version: def.version,
    texts: CONSENT_LOCALES.map((l) => [l, def.texts[l]]),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function getConsentDefinition(
  purpose: ConsentPurpose,
): ConsentDefinition {
  const def = CONSENT_DEFINITIONS.find((d) => d.purpose === purpose);
  if (!def) throw new Error(`Unknown consent purpose: ${purpose}`);
  return def;
}
