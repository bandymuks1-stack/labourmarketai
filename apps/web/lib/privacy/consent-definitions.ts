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
  "partner_supply_representation",
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

/**
 * Partner-network supply representation.
 *
 * A SEPARATE purpose on purpose. `profile_discoverability` names its
 * recipients as "registered and signed-in companies and staffing agencies on
 * LabourMarket.ai" — people inside this product, looking at this product.
 * Representing the same person as available supply inside the partner
 * opportunity network that searches employers OUTSIDE LabourMarket.ai is a
 * different recipient category and therefore a different purpose. Reusing the
 * discoverability grant for it would extend a consent past the sentence the
 * person actually read, and no amount of care in the emitter repairs that.
 *
 * What crosses the boundary is a PROJECTION, never the profile: an opaque
 * reference, trades, availability, languages, credential classes and validity,
 * geography, agreed markets, and a completeness number. The type on the other
 * side has no field for a name, an email, a phone number or an address, which
 * is why this text can promise their absence rather than merely intend it.
 */
export const PARTNER_SUPPLY_REPRESENTATION_V1: ConsentDefinition = {
  purpose: "partner_supply_representation",
  version: "2026-09-04.v1",
  recipientCategory:
    "Approved partner infrastructure that LabourMarket.ai uses to find work for registered people with employers and projects outside this product. It receives the de-identified projection only, and processes it solely on the controller's instructions",
  dataCategories: [
    "an opaque reference that identifies you only inside LabourMarket.ai",
    "profession(s) and trades your evidence supports",
    "skills and capability areas",
    "an experience summary (years, no employer names)",
    "credential classes and whether they are currently valid (no files)",
    "languages",
    "countries you can legally work in",
    "countries you agreed to be offered work in",
    "current availability and start date",
    "mobility and work-condition preferences you entered",
    "a completeness number describing how established the record is",
  ],
  privacyNoticeRoute: "/privacy",
  texts: {
    lt: {
      title: "Leisti pristatyti mano prieinamumą partnerių galimybių tinkle",
      summary:
        "Pasirinkę šią parinktį leidžiate LabourMarket.ai pristatyti jūsų profesinį prieinamumą partnerių galimybių tinkle, kuris ieško darbo pasiūlymų ir už šios platformos ribų.",
      visibleData:
        "Perduodama tik neasmenizuota profesinė santrauka: neatpažįstama nuoroda, profesijos, įgūdžiai, patirties metai, pažymėjimų klasės ir jų galiojimas, kalbos, šalys, kuriose galite dirbti, šalys, kuriose sutinkate būti siūlomi, prieinamumas ir pradžios data.",
      invisibleData:
        "Vardas, pavardė, el. paštas, telefonas, adresas, CV failas, dokumentų kopijos ir darbo žurnalo turinys NĖRA perduodami. Partneris techniškai negali jų gauti — tokių laukų perduodamame įraše apskritai nėra.",
      freedom:
        "Šis pasirinkimas nėra būtinas paskyrai, CV, darbo žurnalui ar paieškai LabourMarket.ai viduje. Jo neįjungus jūsų prieinamumas partnerių tinkle nerodomas.",
      withdrawal:
        "Sutikimą galite bet kada atšaukti privatumo nustatymuose. Atšaukus, jūsų įrašas dingsta iš kito partnerių tinklo atnaujinimo — jis kuriamas iš naujo kiekvieną kartą, todėl atšauktas sutikimas nelieka kaip istorinis įrašas.",
      controller:
        "Duomenų valdytoja — UAB „Nonstop Group“ (įmonės kodas 302676973, Lietuva). Privatumo kontaktas: info@labourmarket.ai. Partnerių infrastruktūra duomenis tvarko tik valdytojos nurodymu ir gauna tik šią neasmenizuotą santrauką; programinės įrangos savininkė Labour Market AI Sp. z o.o. jūsų asmens duomenų negauna.",
    },
    en: {
      title: "Allow my availability to be represented in the partner opportunity network",
      summary:
        "By choosing this option you allow LabourMarket.ai to represent your professional availability inside the partner opportunity network, which looks for work opportunities outside this platform as well.",
      visibleData:
        "Only a de-identified professional summary is passed on: an opaque reference, your professions, skills, years of experience, credential classes and whether they are currently valid, languages, the countries you can work in, the countries you agreed to be offered work in, your availability and start date.",
      invisibleData:
        "Your name, email address, phone number, address, CV file, document copies and work-journal content are NOT passed on. The partner cannot technically receive them — the record that crosses over has no fields for them at all.",
      freedom:
        "This choice is not required to use your account, CV, work journal or to be found inside LabourMarket.ai. If you do not enable it, your availability does not appear in the partner network.",
      withdrawal:
        "You can withdraw this at any time in your privacy settings. Once withdrawn, your record disappears from the next partner-network rebuild — that view is rebuilt whole each time, so a withdrawn consent is not left behind as a historical entry.",
      controller:
        "The data controller is UAB “Nonstop Group” (company code 302676973, Lithuania). Privacy contact: info@labourmarket.ai. The partner infrastructure processes data only on the controller’s instructions and receives only this de-identified summary; the software owner Labour Market AI Sp. z o.o. does not receive your personal data.",
    },
    ru: {
      title: "Разрешить представлять мою доступность в партнёрской сети возможностей",
      summary:
        "Выбрав эту настройку, вы разрешаете LabourMarket.ai представлять вашу профессиональную доступность в партнёрской сети возможностей, которая ищет предложения работы в том числе за пределами этой платформы.",
      visibleData:
        "Передаётся только обезличенная профессиональная сводка: непрозрачная ссылка, профессии, навыки, годы опыта, классы удостоверений и их текущая действительность, языки, страны, где вы можете работать, страны, где вы согласны получать предложения, доступность и дата начала.",
      invisibleData:
        "Ваше имя, электронная почта, телефон, адрес, файл CV, копии документов и содержимое рабочего журнала НЕ передаются. Партнёр технически не может их получить — в передаваемой записи таких полей нет вообще.",
      freedom:
        "Эта настройка не обязательна для использования аккаунта, CV, рабочего журнала или для поиска внутри LabourMarket.ai. Если вы её не включите, ваша доступность в партнёрской сети не показывается.",
      withdrawal:
        "Вы можете отозвать согласие в любой момент в настройках приватности. После отзыва ваша запись исчезает при следующем обновлении партнёрской сети — представление собирается заново каждый раз, поэтому отозванное согласие не остаётся историческим следом.",
      controller:
        "Контролёр данных — UAB «Nonstop Group» (код компании 302676973, Литва). Контакт по приватности: info@labourmarket.ai. Партнёрская инфраструктура обрабатывает данные только по указанию контролёра и получает только эту обезличенную сводку; владелец программного обеспечения Labour Market AI Sp. z o.o. ваши персональные данные не получает.",
    },
    nl: {
      title: "Mijn beschikbaarheid laten vertegenwoordigen in het partnernetwerk",
      summary:
        "Met deze keuze staat u LabourMarket.ai toe uw professionele beschikbaarheid te vertegenwoordigen in het partnernetwerk voor werkgelegenheid, dat ook buiten dit platform naar werk zoekt.",
      visibleData:
        "Alleen een geanonimiseerde professionele samenvatting wordt doorgegeven: een niet-herleidbare referentie, uw beroepen, vaardigheden, jaren ervaring, certificaatklassen en of ze nu geldig zijn, talen, de landen waar u mag werken, de landen waar u akkoord gaat aangeboden te worden, uw beschikbaarheid en startdatum.",
      invisibleData:
        "Uw naam, e-mailadres, telefoonnummer, adres, cv-bestand, documentkopieën en werkjournaal worden NIET doorgegeven. De partner kan ze technisch niet ontvangen — het overgedragen record heeft daar helemaal geen velden voor.",
      freedom:
        "Deze keuze is niet nodig om uw account, cv of werkjournaal te gebruiken of om binnen LabourMarket.ai gevonden te worden. Zonder deze keuze verschijnt uw beschikbaarheid niet in het partnernetwerk.",
      withdrawal:
        "U kunt dit op elk moment intrekken in uw privacy-instellingen. Na intrekking verdwijnt uw record bij de volgende opbouw van het partnernetwerk — dat overzicht wordt telkens volledig opnieuw gebouwd, dus een ingetrokken toestemming blijft niet als historische vermelding achter.",
      controller:
        "De verwerkingsverantwoordelijke is UAB “Nonstop Group” (bedrijfscode 302676973, Litouwen). Privacycontact: info@labourmarket.ai. De partnerinfrastructuur verwerkt gegevens uitsluitend in opdracht van de verwerkingsverantwoordelijke en ontvangt alleen deze geanonimiseerde samenvatting; de software-eigenaar Labour Market AI Sp. z o.o. ontvangt uw persoonsgegevens niet.",
    },
    de: {
      title: "Meine Verfügbarkeit im Partner-Chancennetzwerk vertreten lassen",
      summary:
        "Mit dieser Auswahl erlauben Sie LabourMarket.ai, Ihre berufliche Verfügbarkeit im Partner-Chancennetzwerk zu vertreten, das auch außerhalb dieser Plattform nach Arbeit sucht.",
      visibleData:
        "Weitergegeben wird nur eine anonymisierte berufliche Zusammenfassung: eine nicht auflösbare Referenz, Ihre Berufe, Fähigkeiten, Berufsjahre, Nachweisklassen und deren aktuelle Gültigkeit, Sprachen, die Länder, in denen Sie arbeiten dürfen, die Länder, in denen Sie Angebote erhalten möchten, Ihre Verfügbarkeit und das Startdatum.",
      invisibleData:
        "Ihr Name, Ihre E-Mail-Adresse, Telefonnummer, Anschrift, Lebenslauf-Datei, Dokumentkopien und Arbeitsjournal-Inhalte werden NICHT weitergegeben. Der Partner kann sie technisch nicht erhalten — der übertragene Datensatz hat dafür überhaupt keine Felder.",
      freedom:
        "Diese Auswahl ist nicht erforderlich, um Ihr Konto, Ihren Lebenslauf oder Ihr Arbeitsjournal zu nutzen oder innerhalb von LabourMarket.ai gefunden zu werden. Ohne sie erscheint Ihre Verfügbarkeit nicht im Partnernetzwerk.",
      withdrawal:
        "Sie können dies jederzeit in den Datenschutzeinstellungen widerrufen. Nach dem Widerruf verschwindet Ihr Datensatz beim nächsten Neuaufbau des Partnernetzwerks — diese Ansicht wird jedes Mal vollständig neu erzeugt, ein widerrufenes Einverständnis bleibt also nicht als historischer Eintrag zurück.",
      controller:
        "Verantwortliche ist die UAB „Nonstop Group“ (Unternehmenscode 302676973, Litauen). Datenschutzkontakt: info@labourmarket.ai. Die Partnerinfrastruktur verarbeitet Daten ausschließlich auf Weisung der Verantwortlichen und erhält nur diese anonymisierte Zusammenfassung; die Software-Eigentümerin Labour Market AI Sp. z o.o. erhält Ihre personenbezogenen Daten nicht.",
    },
  },
};

export const CONSENT_DEFINITIONS: readonly ConsentDefinition[] = [
  PROFILE_DISCOVERABILITY_V1,
  EMPLOYER_DATA_DISCLOSURE_V1,
  PARTNER_SUPPLY_REPRESENTATION_V1,
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
