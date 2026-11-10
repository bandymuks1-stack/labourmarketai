/**
 * Worker acquisition guides — COUNTRY facts, written natively in Russian and
 * Turkish (owner P0 2026-11-09, global worker acquisition SEO/GEO).
 *
 * Each country carries only facts that are true for that country and that a
 * worker already living in Europe actually needs before moving for work: who
 * may work there, which registration follows arrival, which site cards or
 * declarations are common, and where the official source lives. No salaries,
 * no vacancy counts, no promises — those would go stale or be invented.
 *
 * Every fact is backed by an official source listed with it and checked on
 * `GUIDE_SOURCES_CHECKED_AT`. Wording is AI-drafted and pending native review
 * (doctrine §7.4) — see `GUIDE_REVIEW_STATE` in lib/seo/worker-guides.ts.
 */

export type GuideCountry =
  | "de"
  | "nl"
  | "be"
  | "lu"
  | "at"
  | "pl"
  | "se"
  | "dk"
  | "fi"
  | "fr";

export type GuideLanguage = "ru" | "tr";

export interface GuideSource {
  readonly label: string;
  readonly url: string;
}

export interface CountryCopy {
  /** URL slug of the country guide in this language (ASCII, kebab-case). */
  readonly slug: string;
  /** Country name, nominative ("Германия", "Almanya"). */
  readonly name: string;
  /** "in {country}" form used in headings ("в Германии", "Almanya'da"). */
  readonly inName: string;
  /** SEO title WITHOUT the brand (brandedTitle appends it). */
  readonly title: string;
  /** Meta description, 70–160 characters. */
  readonly description: string;
  /** H1 of the country guide. */
  readonly h1: string;
  /** Direct short answer shown first (search + AI friendly). */
  readonly lede: string;
  /** Country-specific work-rights facts (the EU-wide rules are shared). */
  readonly rights: readonly string[];
  /** What is usually needed on arrival / on site in this country. */
  readonly onSite: readonly string[];
}

export interface CountryEntry {
  readonly code: GuideCountry;
  readonly ru: CountryCopy;
  readonly tr: CountryCopy;
  readonly sources: readonly GuideSource[];
}

export const GUIDE_SOURCES_CHECKED_AT = "2026-11-09";

const YOUR_EUROPE: GuideSource = {
  label: "Your Europe — Work and retirement in the EU (European Union)",
  url: "https://europa.eu/youreurope/citizens/work/index_en.htm",
};
const EURES: GuideSource = {
  label: "EURES — European Job Mobility Portal (European Union)",
  url: "https://eures.europa.eu",
};

export const GUIDE_COUNTRIES: readonly CountryEntry[] = [
  {
    code: "de",
    ru: {
      slug: "rabota-v-germanii",
      name: "Германия",
      inName: "в Германии",
      title: "Работа в Германии для русскоговорящих",
      description:
        "Кто может работать в Германии, какие документы и регистрация нужны на месте и как создать бесплатный профиль работника на LabourMarket.ai.",
      h1: "Работа в Германии для русскоговорящих",
      lede:
        "Граждане ЕС работают в Германии без разрешения на работу; остальным нужен немецкий вид на жительство с правом на работу. После въезда жильё регистрируют в течение двух недель, а иностранную профессиональную квалификацию можно официально признать.",
      rights: [
        "Гражданам стран вне ЕС нужен немецкий вид на жительство, который разрешает работу. Немецкий портал Make it in Germany описывает пути для квалифицированных работников.",
        "Иностранный диплом или профессиональное образование можно признать: портал Anerkennung in Deutschland подскажет, какое ведомство отвечает за вашу профессию (для ремёсел — обычно Handwerkskammer).",
      ],
      onSite: [
        "Регистрация места жительства (Anmeldung) — в течение двух недель после заселения.",
        "На стройке нужно иметь при себе паспорт или удостоверение личности: таможня (FKS) проверяет занятость и минимальную оплату прямо на объекте.",
        "В строительстве работодатели участвуют в отраслевой кассе SOKA-BAU, через которую, в частности, оплачиваются отпуска строителей.",
      ],
    },
    tr: {
      slug: "almanyada-calismak",
      name: "Almanya",
      inName: "Almanya'da",
      title: "Almanya'da çalışmak: çalışma hakkı ve belgeler",
      description:
        "Almanya'da kimler çalışabilir, varışta hangi kayıt ve belgeler gerekir ve LabourMarket.ai'de ücretsiz işçi profili nasıl oluşturulur.",
      h1: "Almanya'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Almanya'da çalışma izni olmadan çalışabilir; diğerlerinin çalışmaya izin veren bir Alman oturum iznine ihtiyacı vardır. Taşındıktan sonra adres kaydı iki hafta içinde yapılır ve yabancı meslek yeterlilikleri resmi olarak tanıtılabilir.",
      rights: [
        "AB dışından gelenlerin, çalışmaya izin veren bir Alman oturum iznine ihtiyacı vardır. Resmi Make it in Germany portalı nitelikli çalışanlar için yolları anlatır.",
        "Yabancı diploma veya meslek eğitimi tanınabilir: Anerkennung in Deutschland portalı mesleğiniz için hangi kurumun yetkili olduğunu gösterir (zanaatlarda genellikle Handwerkskammer).",
      ],
      onSite: [
        "Adres kaydı (Anmeldung) — eve yerleştikten sonra iki hafta içinde.",
        "İnşaat sahasında pasaport veya kimlik yanınızda olmalı: gümrük (FKS) kayıt dışı çalışmayı ve asgari ücreti şantiyede denetler.",
        "İnşaat sektöründe işverenler SOKA-BAU sektör fonuna katılır; inşaat işçilerinin yıllık izin ödemeleri bu fon üzerinden yürür.",
      ],
    },
    sources: [
      { label: "Make it in Germany (Federal Government of Germany)", url: "https://www.make-it-in-germany.com" },
      { label: "Anerkennung in Deutschland (BIBB)", url: "https://www.anerkennung-in-deutschland.de" },
      { label: "SOKA-BAU", url: "https://www.soka-bau.de" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "nl",
    ru: {
      slug: "rabota-v-niderlandah",
      name: "Нидерланды",
      inName: "в Нидерландах",
      title: "Работа в Нидерландах для русскоговорящих",
      description:
        "Работа в Нидерландах: право на работу, номер BSN, сертификат VCA на стройке, жильё через агентство и бесплатный профиль на LabourMarket.ai.",
      h1: "Работа в Нидерландах для русскоговорящих",
      lede:
        "Граждане ЕС работают в Нидерландах без разрешения; для работников из стран вне ЕС работодатель обычно оформляет разрешение (TWV через UWV или единое разрешение GVVA через IND). Для работы нужен номер BSN, а на стройке почти всегда спрашивают сертификат VCA.",
      rights: [
        "Для работника из страны вне ЕС разрешение обычно получает работодатель: TWV в UWV или комбинированное разрешение на проживание и работу (GVVA) в IND.",
        "Иностранный диплом можно оценить через службу IDW (Nuffic и SBB) — работодатель увидит, какому нидерландскому уровню он соответствует.",
      ],
      onSite: [
        "Номер BSN выдаёт муниципалитет при регистрации; при пребывании до четырёх месяцев — регистрация в RNI.",
        "Сертификат безопасности VCA (Basis или VOL) — обычное требование на строительных и монтажных объектах.",
        "Если жильё даёт агентство, проверьте, сертифицировано ли оно по норме SNF.",
      ],
    },
    tr: {
      slug: "hollandada-calismak",
      name: "Hollanda",
      inName: "Hollanda'da",
      title: "Hollanda'da çalışmak: BSN, VCA ve çalışma izni",
      description:
        "Hollanda'da çalışmak: çalışma hakkı, BSN numarası, şantiyede VCA sertifikası, ajans konaklaması ve LabourMarket.ai'de ücretsiz işçi profili.",
      h1: "Hollanda'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Hollanda'da izinsiz çalışabilir; AB dışından gelen çalışanlar için izni genellikle işveren alır (UWV'den TWV veya IND'den GVVA tek izin). Çalışmak için BSN numarası gerekir ve şantiyelerde neredeyse her zaman VCA sertifikası istenir.",
      rights: [
        "AB dışından bir çalışan için izni genellikle işveren alır: UWV'den TWV ya da IND'den oturum ve çalışma için birleşik izin (GVVA).",
        "Yabancı diplomanız IDW (Nuffic ve SBB) aracılığıyla değerlendirilebilir; işveren diplomanın hangi Hollanda seviyesine denk geldiğini görür.",
      ],
      onSite: [
        "BSN numarasını belediye kayıt sırasında verir; dört aya kadar kalışlarda RNI kaydı yapılır.",
        "VCA güvenlik sertifikası (Basis veya VOL) inşaat ve montaj sahalarında olağan bir şarttır.",
        "Konaklamayı ajans sağlıyorsa, konutun SNF normuna göre sertifikalı olup olmadığını kontrol edin.",
      ],
    },
    sources: [
      { label: "UWV — tewerkstellingsvergunning (TWV)", url: "https://www.uwv.nl" },
      { label: "IND — Immigration and Naturalisation Service", url: "https://ind.nl" },
      { label: "IDW — Internationale Diplomawaardering", url: "https://www.idw.nl" },
      { label: "SNF — Stichting Normering Flexwonen", url: "https://www.normeringflexwonen.nl" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "be",
    ru: {
      slug: "rabota-v-belgii",
      name: "Бельгия",
      inName: "в Бельгии",
      title: "Работа в Бельгии для русскоговорящих",
      description:
        "Работа в Бельгии: кто может работать, регистрация в коммуне, декларация Limosa для командированных, Checkin@Work на стройке и бесплатный профиль.",
      h1: "Работа в Бельгии для русскоговорящих",
      lede:
        "Граждане ЕС работают в Бельгии без разрешения и регистрируются в коммуне по месту жительства. Работникам из стран вне ЕС нужно единое разрешение, которое запрашивает работодатель. Если вас командирует иностранная фирма, она подаёт декларацию Limosa до начала работ.",
      rights: [
        "Для работника из страны вне ЕС работодатель запрашивает единое разрешение (на проживание и работу) в своём регионе — Фландрии, Валлонии или Брюсселе.",
        "Командированный работник иностранной фирмы работает в Бельгии только после того, как работодатель подал декларацию Limosa.",
      ],
      onSite: [
        "При пребывании дольше трёх месяцев граждане ЕС регистрируются в коммуне по месту жительства.",
        "На многих стройках присутствие каждого работника ежедневно регистрируется в системе Checkin@Work.",
      ],
    },
    tr: {
      slug: "belcikada-calismak",
      name: "Belçika",
      inName: "Belçika'da",
      title: "Belçika'da çalışmak: izinler, Limosa, Checkin@Work",
      description:
        "Belçika'da çalışmak: kimler çalışabilir, belediye kaydı, görevlendirilen işçiler için Limosa, şantiyede Checkin@Work ve ücretsiz işçi profili.",
      h1: "Belçika'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Belçika'da izinsiz çalışabilir ve oturdukları belediyeye kaydolur. AB dışından gelen çalışanlar için işveren tek izin başvurusu yapar. Yabancı bir firma sizi görevlendiriyorsa, işe başlamadan önce Limosa bildirimi yapar.",
      rights: [
        "AB dışından bir çalışan için işveren, bulunduğu bölgede (Flandre, Valonya veya Brüksel) oturum ve çalışmayı kapsayan tek izin başvurusu yapar.",
        "Yabancı bir firmanın görevlendirdiği işçi, Belçika'da ancak işveren Limosa bildirimini yaptıktan sonra çalışabilir.",
      ],
      onSite: [
        "Üç aydan uzun kalan AB vatandaşları oturdukları belediyeye kaydolur.",
        "Birçok şantiyede her çalışanın varlığı Checkin@Work sistemine günlük olarak kaydedilir.",
      ],
    },
    sources: [
      { label: "Limosa (Belgian social security)", url: "https://www.limosa.be" },
      { label: "Checkin@Work (Belgian social security)", url: "https://www.socialsecurity.be" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "lu",
    ru: {
      slug: "rabota-v-lyuksemburge",
      name: "Люксембург",
      inName: "в Люксембурге",
      title: "Работа в Люксембурге для русскоговорящих",
      description:
        "Работа в Люксембурге: право на работу, регистрация в коммуне, работа с проживанием в соседней стране и социальный бейдж для командированных.",
      h1: "Работа в Люксембурге для русскоговорящих",
      lede:
        "Граждане ЕС работают в Люксембурге без разрешения; при пребывании дольше трёх месяцев они регистрируются в коммуне. Многие работают в Люксембурге, а живут во Франции, Бельгии или Германии. Работникам из стран вне ЕС нужно разрешение на проживание для работы по найму.",
      rights: [
        "Работнику из страны вне ЕС нужно разрешение на проживание для наёмного работника; порядок описан на государственном портале Guichet.lu.",
        "Если вы живёте в соседней стране и ездите на работу в Люксембург, ваш статус и налоги зависят от обеих стран — уточните это до подписания договора.",
      ],
      onSite: [
        "Командированные работники иностранных фирм получают социальный бейдж; работодатель заранее декларирует командировку в инспекции труда ITM.",
        "Признание иностранных дипломов и квалификаций — через государственный портал Guichet.lu.",
      ],
    },
    tr: {
      slug: "luksemburgda-calismak",
      name: "Lüksemburg",
      inName: "Lüksemburg'da",
      title: "Lüksemburg'da çalışmak: izinler ve sınır ötesi iş",
      description:
        "Lüksemburg'da çalışmak: çalışma hakkı, belediye kaydı, komşu ülkede yaşayıp çalışmak, görevlendirilenler için sosyal kart ve ücretsiz işçi profili.",
      h1: "Lüksemburg'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Lüksemburg'da izinsiz çalışabilir; üç aydan uzun kalırlarsa belediyeye kaydolurlar. Birçok kişi Lüksemburg'da çalışıp Fransa, Belçika veya Almanya'da yaşar. AB dışından gelenlerin ücretli çalışma için oturum iznine ihtiyacı vardır.",
      rights: [
        "AB dışından bir çalışanın ücretli çalışan oturum iznine ihtiyacı vardır; süreç resmi Guichet.lu portalında anlatılır.",
        "Komşu bir ülkede yaşayıp Lüksemburg'a çalışmaya gidiyorsanız, statünüz ve vergileriniz iki ülkeye bağlıdır — sözleşmeyi imzalamadan önce netleştirin.",
      ],
      onSite: [
        "Yabancı firmaların görevlendirdiği işçiler sosyal kart (badge social) alır; işveren görevlendirmeyi önceden çalışma müfettişliği ITM'ye bildirir.",
        "Yabancı diploma ve yeterliliklerin tanınması resmi Guichet.lu portalı üzerinden yapılır.",
      ],
    },
    sources: [
      { label: "Guichet.lu (Government of Luxembourg)", url: "https://guichet.public.lu" },
      { label: "ITM — Inspection du travail et des mines", url: "https://itm.public.lu" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "at",
    ru: {
      slug: "rabota-v-avstrii",
      name: "Австрия",
      inName: "в Австрии",
      title: "Работа в Австрии для русскоговорящих",
      description:
        "Работа в Австрии: право на работу, регистрация Meldezettel за три дня, касса строителей BUAK, признание квалификации и бесплатный профиль работника.",
      h1: "Работа в Австрии для русскоговорящих",
      lede:
        "Граждане ЕС работают в Австрии без разрешения; работникам из стран вне ЕС обычно нужна карта Rot-Weiß-Rot. Место жительства регистрируют в течение трёх дней после заселения, а строители состоят в отраслевой кассе BUAK.",
      rights: [
        "Для работников из стран вне ЕС основной путь — карта Rot-Weiß-Rot; условия описаны на официальном портале migration.gv.at.",
        "Иностранную квалификацию можно признать или оценить; портал anerkennung.gv.at подскажет, куда обращаться по вашей профессии.",
      ],
      onSite: [
        "Регистрация места жительства (Meldezettel) — в течение трёх дней после заселения.",
        "Строители в Австрии состоят в кассе BUAK, которая ведёт отпуска и выходные пособия в отрасли.",
        "Иностранная фирма, командирующая работников в Австрию, заранее уведомляет координационный центр ZKO.",
      ],
    },
    tr: {
      slug: "avusturyada-calismak",
      name: "Avusturya",
      inName: "Avusturya'da",
      title: "Avusturya'da çalışmak: izinler, Meldezettel, BUAK",
      description:
        "Avusturya'da çalışmak: çalışma hakkı, üç gün içinde Meldezettel kaydı, inşaat işçileri fonu BUAK, yeterlilik tanıma ve ücretsiz işçi profili.",
      h1: "Avusturya'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Avusturya'da izinsiz çalışabilir; AB dışından gelenler için genellikle Rot-Weiß-Rot kartı gerekir. Adres kaydı yerleştikten sonra üç gün içinde yapılır ve inşaat işçileri BUAK sektör fonuna bağlıdır.",
      rights: [
        "AB dışından gelen çalışanlar için temel yol Rot-Weiß-Rot kartıdır; şartlar resmi migration.gv.at portalında anlatılır.",
        "Yabancı yeterlilikler tanınabilir veya değerlendirilebilir; anerkennung.gv.at portalı mesleğiniz için nereye başvuracağınızı gösterir.",
      ],
      onSite: [
        "Adres kaydı (Meldezettel) — yerleştikten sonra üç gün içinde.",
        "Avusturya'da inşaat işçileri, sektördeki izin ve kıdem ödemelerini yürüten BUAK fonuna bağlıdır.",
        "Avusturya'ya işçi görevlendiren yabancı firma, bunu önceden ZKO koordinasyon merkezine bildirir.",
      ],
    },
    sources: [
      { label: "migration.gv.at (Republic of Austria)", url: "https://www.migration.gv.at" },
      { label: "anerkennung.gv.at (Republic of Austria)", url: "https://www.anerkennung.gv.at" },
      { label: "BUAK — Bauarbeiter-Urlaubs- und Abfertigungskasse", url: "https://www.buak.at" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "pl",
    ru: {
      slug: "rabota-v-polshe",
      name: "Польша",
      inName: "в Польше",
      title: "Работа в Польше для русскоговорящих",
      description:
        "Работа в Польше: кто может работать, разрешение на работу для граждан вне ЕС, номер PESEL, допуски SEP для электриков и бесплатный профиль работника.",
      h1: "Работа в Польше для русскоговорящих",
      lede:
        "Граждане ЕС работают в Польше без разрешения. Работникам из стран вне ЕС обычно нужно разрешение на работу, а для граждан некоторых стран действуют упрощённые процедуры — правила недавно менялись, поэтому проверяйте их на официальном портале.",
      rights: [
        "Для граждан стран вне ЕС работодатель обычно оформляет разрешение на работу (zezwolenie na pracę); для отдельных стран действуют упрощённые процедуры. Актуальные правила — на портале praca.gov.pl.",
        "Граждане Украины с временной защитой в Польше работают по отдельным правилам, которые действуют только в Польше.",
      ],
      onSite: [
        "Номер PESEL нужен для многих формальностей — налогов, медицины, банка.",
        "Для работ с электроустановками в Польше нужно свидетельство квалификации (świadectwo kwalifikacyjne, известное как «допуск SEP»).",
      ],
    },
    tr: {
      slug: "polonyada-calismak",
      name: "Polonya",
      inName: "Polonya'da",
      title: "Polonya'da çalışmak: çalışma izni ve belgeler",
      description:
        "Polonya'da çalışmak: kimler çalışabilir, AB dışı vatandaşlar için çalışma izni, PESEL numarası, elektrikçiler için SEP belgesi ve ücretsiz profil.",
      h1: "Polonya'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Polonya'da izinsiz çalışabilir. AB dışından gelenler için genellikle çalışma izni gerekir; bazı ülkelerin vatandaşları için basitleştirilmiş prosedürler vardır. Kurallar yakın zamanda değişti, bu yüzden resmi portalda kontrol edin.",
      rights: [
        "AB dışı vatandaşlar için işveren genellikle çalışma izni (zezwolenie na pracę) alır. Güncel kurallar resmi praca.gov.pl portalındadır.",
        "Türk vatandaşları için ayrı bir kolaylık yoktur; çalışma izni süreci genel kurallara göre yürür.",
      ],
      onSite: [
        "PESEL numarası vergi, sağlık ve banka gibi birçok işlem için gerekir.",
        "Polonya'da elektrik tesisatında çalışmak için yeterlilik belgesi (świadectwo kwalifikacyjne, yaygın adıyla SEP belgesi) gerekir.",
      ],
    },
    sources: [
      { label: "praca.gov.pl (Republic of Poland)", url: "https://www.praca.gov.pl" },
      { label: "gov.pl — PESEL", url: "https://www.gov.pl" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "se",
    ru: {
      slug: "rabota-v-shvecii",
      name: "Швеция",
      inName: "в Швеции",
      title: "Работа в Швеции для русскоговорящих",
      description:
        "Работа в Швеции: право на работу, разрешение Migrationsverket, карта ID06 на стройке, допуск электриков и реальные вакансии на LabourMarket.ai.",
      h1: "Работа в Швеции для русскоговорящих",
      lede:
        "Граждане ЕС работают в Швеции без разрешения; работникам из стран вне ЕС обычно нужно разрешение на работу от Migrationsverket до начала работы. На шведских стройках требуют карту ID06, а электромонтаж выполняют под авторизацией Elsäkerhetsverket.",
      rights: [
        "Работнику из страны вне ЕС разрешение на работу выдаёт Migrationsverket, как правило ещё до въезда и до начала работы.",
        "При переезде больше чем на год вы регистрируетесь в шведском регистре населения (Skatteverket) и получаете personnummer; иначе используется координационный номер.",
      ],
      onSite: [
        "Карта ID06 — обычное требование для входа на строительный объект.",
        "На стройках ведётся электронный журнал присутствия персонала (personalliggare).",
        "Сварочные и другие огневые работы обычно требуют сертификата «Heta arbeten».",
      ],
    },
    tr: {
      slug: "isvecte-calismak",
      name: "İsveç",
      inName: "İsveç'te",
      title: "İsveç'te çalışmak: çalışma izni, ID06 ve ilanlar",
      description:
        "İsveç'te çalışmak: çalışma hakkı, Migrationsverket izni, şantiyede ID06 kartı, elektrikçi yetkisi ve LabourMarket.ai'deki gerçek iş ilanları.",
      h1: "İsveç'te çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları İsveç'te izinsiz çalışabilir; AB dışından gelenler için genellikle işe başlamadan önce Migrationsverket'ten çalışma izni gerekir. İsveç şantiyelerinde ID06 kartı istenir ve elektrik tesisatı Elsäkerhetsverket yetkisi altında yapılır.",
      rights: [
        "AB dışından gelen bir çalışanın çalışma iznini Migrationsverket verir; kural olarak ülkeye girişten ve işe başlamadan önce.",
        "Bir yıldan uzun süre için taşınırsanız İsveç nüfus kaydına (Skatteverket) girer ve personnummer alırsınız; aksi halde koordinasyon numarası kullanılır.",
      ],
      onSite: [
        "ID06 kartı inşaat sahasına girmek için olağan bir şarttır.",
        "Şantiyelerde personelin elektronik devam kaydı (personalliggare) tutulur.",
        "Kaynak ve diğer sıcak işler genellikle «Heta arbeten» sertifikası gerektirir.",
      ],
    },
    sources: [
      { label: "Migrationsverket (Swedish Migration Agency)", url: "https://www.migrationsverket.se" },
      { label: "Skatteverket — folkbokföring", url: "https://www.skatteverket.se" },
      { label: "ID06", url: "https://id06.se" },
      { label: "Elsäkerhetsverket (National Electrical Safety Board)", url: "https://www.elsakerhetsverket.se" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "dk",
    ru: {
      slug: "rabota-v-danii",
      name: "Дания",
      inName: "в Дании",
      title: "Работа в Дании для русскоговорящих",
      description:
        "Работа в Дании: право на работу, номер CPR, разрешение SIRI для граждан вне ЕС, реестр RUT для иностранных фирм и авторизация электриков.",
      h1: "Работа в Дании для русскоговорящих",
      lede:
        "Граждане ЕС работают в Дании без разрешения, а при пребывании дольше трёх месяцев оформляют регистрацию и номер CPR. Работникам из стран вне ЕС нужно разрешение на работу от SIRI. Электромонтаж и сантехнику выполняют фирмы с авторизацией Sikkerhedsstyrelsen.",
      rights: [
        "Работнику из страны вне ЕС нужно разрешение на работу от SIRI; варианты описаны на официальном портале nyidanmark.dk.",
        "Иностранная фирма, которая выполняет работы в Дании, регистрирует себя и своих работников в реестре RUT.",
      ],
      onSite: [
        "Номер CPR нужен для налогов, банка и медицины; его оформляют после регистрации проживания.",
        "Электромонтажные, сантехнические и газовые работы в Дании выполняют только авторизованные фирмы (Sikkerhedsstyrelsen).",
      ],
    },
    tr: {
      slug: "danimarkada-calismak",
      name: "Danimarka",
      inName: "Danimarka'da",
      title: "Danimarka'da çalışmak: CPR, SIRI ve RUT kaydı",
      description:
        "Danimarka'da çalışmak: çalışma hakkı, CPR numarası, AB dışı vatandaşlar için SIRI izni, yabancı firmalar için RUT kaydı ve elektrikçi yetkisi.",
      h1: "Danimarka'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Danimarka'da izinsiz çalışabilir ve üç aydan uzun kalırlarsa kayıt ile CPR numarası alır. AB dışından gelenlerin SIRI'den çalışma iznine ihtiyacı vardır. Elektrik ve sıhhi tesisat işlerini Sikkerhedsstyrelsen yetkili firmalar yapar.",
      rights: [
        "AB dışından gelen bir çalışanın SIRI'den çalışma iznine ihtiyacı vardır; seçenekler resmi nyidanmark.dk portalında anlatılır.",
        "Danimarka'da iş yapan yabancı bir firma, kendisini ve çalışanlarını RUT siciline kaydeder.",
      ],
      onSite: [
        "CPR numarası vergi, banka ve sağlık için gerekir; ikamet kaydından sonra alınır.",
        "Danimarka'da elektrik, sıhhi tesisat ve gaz işlerini yalnızca yetkili firmalar yapar (Sikkerhedsstyrelsen).",
      ],
    },
    sources: [
      { label: "New to Denmark — SIRI (Danish Agency for International Recruitment and Integration)", url: "https://www.nyidanmark.dk" },
      { label: "Virk — RUT register (Danish Business Authority)", url: "https://virk.dk" },
      { label: "Sikkerhedsstyrelsen (Danish Safety Technology Authority)", url: "https://www.sik.dk" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "fi",
    ru: {
      slug: "rabota-v-finlyandii",
      name: "Финляндия",
      inName: "в Финляндии",
      title: "Работа в Финляндии для русскоговорящих",
      description:
        "Работа в Финляндии: право на работу, налоговый номер и фото-карта на стройке, карта охраны труда, допуски электриков Tukes и бесплатный профиль.",
      h1: "Работа в Финляндии для русскоговорящих",
      lede:
        "Граждане ЕС работают в Финляндии без разрешения и при пребывании дольше трёх месяцев регистрируют право проживания в Migri. На финской стройке у каждого работника должна быть видимая карта с фото и налоговым номером (veronumero).",
      rights: [
        "Работнику из страны вне ЕС нужно разрешение на проживание для работы; его выдаёт Migri. Портал Work in Finland описывает основные пути.",
        "Граждане ЕС, остающиеся дольше трёх месяцев, регистрируют право проживания в Migri и получают финский личный код.",
      ],
      onSite: [
        "На стройке обязательна видимая идентификационная карта с фото и налоговым номером (veronumero) из реестра налоговой службы.",
        "Обычно требуют карту охраны труда (työturvallisuuskortti), а для огневых работ — tulityökortti.",
        "Электромонтажные работы требуют подтверждённой квалификации (sähköpätevyys) по правилам Tukes.",
      ],
    },
    tr: {
      slug: "finlandiyada-calismak",
      name: "Finlandiya",
      inName: "Finlandiya'da",
      title: "Finlandiya'da çalışmak: vergi numarası ve kartlar",
      description:
        "Finlandiya'da çalışmak: çalışma hakkı, şantiyede vergi numaralı fotoğraflı kart, iş güvenliği kartı, Tukes elektrik yeterliliği ve ücretsiz profil.",
      h1: "Finlandiya'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Finlandiya'da izinsiz çalışabilir ve üç aydan uzun kalırlarsa oturum haklarını Migri'ye kaydettirir. Fin şantiyelerinde her çalışanın görünür bir fotoğraflı kartı ve vergi numarası (veronumero) olmalıdır.",
      rights: [
        "AB dışından gelen bir çalışanın çalışma amaçlı oturum iznine ihtiyacı vardır; izni Migri verir. Work in Finland portalı temel yolları anlatır.",
        "Üç aydan uzun kalan AB vatandaşları oturum haklarını Migri'ye kaydettirir ve Fin kişisel kimlik kodu alır.",
      ],
      onSite: [
        "Şantiyede fotoğraflı ve vergi idaresi sicilindeki vergi numarasını (veronumero) gösteren kimlik kartı zorunludur.",
        "Genellikle iş güvenliği kartı (työturvallisuuskortti), sıcak işler için de tulityökortti istenir.",
        "Elektrik tesisatı işleri Tukes kurallarına göre belgelenmiş yeterlilik (sähköpätevyys) gerektirir.",
      ],
    },
    sources: [
      { label: "Migri (Finnish Immigration Service)", url: "https://migri.fi" },
      { label: "Work in Finland (Business Finland)", url: "https://www.workinfinland.com" },
      { label: "Vero — tax number for construction sites", url: "https://www.vero.fi" },
      { label: "Tukes (Finnish Safety and Chemicals Agency)", url: "https://tukes.fi" },
      YOUR_EUROPE,
    ],
  },
  {
    code: "fr",
    ru: {
      slug: "rabota-vo-francii",
      name: "Франция",
      inName: "во Франции",
      title: "Работа во Франции для русскоговорящих",
      description:
        "Работа во Франции: право на работу, разрешение для граждан вне ЕС, обязательная карта BTP на стройке, допуск по электробезопасности и бесплатный профиль.",
      h1: "Работа во Франции для русскоговорящих",
      lede:
        "Граждане ЕС работают во Франции без разрешения и без вида на жительство. Для работника из страны вне ЕС работодатель обычно запрашивает разрешение на работу. На французских стройках у каждого работника должна быть профессиональная карта BTP.",
      rights: [
        "Для работника из страны вне ЕС работодатель обычно запрашивает разрешение на работу (autorisation de travail) через государственную платформу.",
        "Командированный работник иностранной фирмы работает во Франции после того, как работодатель подал декларацию SIPSI.",
      ],
      onSite: [
        "Карта BTP (carte d'identification professionnelle) обязательна для каждого работника на стройке, включая командированных.",
        "Перед электромонтажными работами работодатель выдаёт допуск по электробезопасности (habilitation électrique, NF C 18-510).",
      ],
    },
    tr: {
      slug: "fransada-calismak",
      name: "Fransa",
      inName: "Fransa'da",
      title: "Fransa'da çalışmak: çalışma izni ve BTP kartı",
      description:
        "Fransa'da çalışmak: çalışma hakkı, AB dışı vatandaşlar için çalışma izni, şantiyede zorunlu BTP kartı, elektrik güvenlik yetkisi ve ücretsiz profil.",
      h1: "Fransa'da çalışmak — Avrupa'da yaşayan Türkçe konuşanlar için",
      lede:
        "AB vatandaşları Fransa'da izinsiz ve oturum belgesi olmadan çalışabilir. AB dışından gelen bir çalışan için işveren genellikle çalışma izni başvurusu yapar. Fransız şantiyelerinde her çalışanın BTP mesleki kimlik kartı olmalıdır.",
      rights: [
        "AB dışından gelen bir çalışan için işveren genellikle resmi platform üzerinden çalışma izni (autorisation de travail) başvurusu yapar.",
        "Yabancı bir firmanın görevlendirdiği işçi, işveren SIPSI bildirimini yaptıktan sonra Fransa'da çalışabilir.",
      ],
      onSite: [
        "BTP kartı (carte d'identification professionnelle), görevlendirilenler dahil şantiyedeki her çalışan için zorunludur.",
        "Elektrik işlerinden önce işveren elektrik güvenlik yetkisi (habilitation électrique, NF C 18-510) verir.",
      ],
    },
    sources: [
      { label: "Carte BTP (official)", url: "https://www.cartebtp.fr" },
      { label: "Service-Public.fr (French administration)", url: "https://www.service-public.fr" },
      { label: "Ministère du Travail — détachement / SIPSI", url: "https://travail-emploi.gouv.fr" },
      YOUR_EUROPE,
    ],
  },
];

export const GUIDE_EU_SOURCES: readonly GuideSource[] = [YOUR_EUROPE, EURES];
