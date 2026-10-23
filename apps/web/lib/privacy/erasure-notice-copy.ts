/**
 * The two letters the erasure runner sends (plain text, from the one mailbox).
 * Lithuanian and English; every other locale gets English. Facts only: what
 * happened, what is kept and why, where to write. No name, no id, no link
 * that would need the deleted account.
 */
export type NoticeCopy = { subject: string; text: string };

const LT = {
  erasure_completed: {
    subject: "Jūsų LabourMarket.ai paskyra ištrinta",
    text: [
      "Sveiki,",
      "",
      "pagal Jūsų prašymą Jūsų LabourMarket.ai paskyra ištrinta (BDAR 17 straipsnis).",
      "",
      "Ištrinta: paskyra ir prisijungimo duomenys, profilis, darbo žurnalo įrašai ir jų tekstas, asmeniniai pranešimai, pokalbių su asistentu istorija, naudojimo įvykiai ir Jūsų įkelti failai.",
      "",
      "Išsaugota tik tai, ką privalome saugoti, atskirta nuo Jūsų vardo ir kontaktų, pavyzdžiui: sutikimų istorija (įrodymas, kad sutikimai buvo duoti ir atšaukti, 6 metai), šio prašymo įrašas (atskaitomybė, 3 metai) ir saugumo žurnalas (6 metai). Šie įrašai nenaudojami jokiam kitam tikslui.",
      "",
      "Šis laiškas išsiųstas automatiškai, užbaigus ištrynimą. Jei turite klausimų, parašykite info@labourmarket.ai.",
      "",
      "LabourMarket.ai",
    ].join("\n"),
  },
  erasure_review: {
    subject: "Jūsų paskyros ištrynimo prašymas perduotas peržiūrai",
    text: [
      "Sveiki,",
      "",
      "gavome Jūsų patvirtintą prašymą ištrinti LabourMarket.ai paskyrą. Automatinis ištrynimas sustabdytas, nes paskyroje yra duomenų, kuriuos gali tekti saugoti dėl teisinės prievolės (pvz., darbdavio darbo laiko apskaita) arba kurie susiję su kitais žmonėmis.",
      "",
      "Prašymą peržiūrės žmogus ir per vieną mėnesį nuo prašymo gavimo praneš sprendimą bei jo priežastis. Tuo metu Jūsų profilis nerodomas paieškoje.",
      "",
      "Jei turite klausimų, parašykite info@labourmarket.ai.",
      "",
      "LabourMarket.ai",
    ].join("\n"),
  },
};

const EN = {
  erasure_completed: {
    subject: "Your LabourMarket.ai account has been deleted",
    text: [
      "Hello,",
      "",
      "as you requested, your LabourMarket.ai account has been deleted (GDPR Article 17).",
      "",
      "Deleted: the account and sign-in data, your profile, your work journal entries and their text, personal notifications, assistant conversation history, usage events and the files you uploaded.",
      "",
      "Kept only where we are obliged to, separated from your name and contact details, for example: the consent history (proof that consents were given and withdrawn, 6 years), the record of this request (accountability, 3 years) and the security log (6 years). They are used for no other purpose.",
      "",
      "This message was sent automatically after the deletion was completed. Questions: info@labourmarket.ai.",
      "",
      "LabourMarket.ai",
    ].join("\n"),
  },
  erasure_review: {
    subject: "Your account deletion request is under review",
    text: [
      "Hello,",
      "",
      "we received your confirmed request to delete your LabourMarket.ai account. Automatic deletion has been paused because the account holds data that may have to be kept under a legal obligation (for example an employer's working-time records) or that concerns other people.",
      "",
      "A person will review the request and tell you the decision and its reasons within one month of receiving it. Meanwhile your profile is not shown in search.",
      "",
      "Questions: info@labourmarket.ai.",
      "",
      "LabourMarket.ai",
    ].join("\n"),
  },
};

export function noticeFor(kind: string, locale: string): NoticeCopy {
  const book = locale === "lt" ? LT : EN;
  return kind === "erasure_review" ? book.erasure_review : book.erasure_completed;
}
