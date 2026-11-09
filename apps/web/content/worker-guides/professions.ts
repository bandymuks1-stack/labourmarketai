/**
 * Worker acquisition guides — PROFESSION × COUNTRY pages and the shared copy
 * every guide uses, in Russian and Turkish.
 *
 * A profession × country page exists ONLY where there is something true and
 * specific to say about that profession in that country (a licence, a site
 * card, a regulated activity). A combination without such a note is not
 * written, because it would be the country page with a word swapped — the
 * doorway pattern the owner forbade. Add a combination by adding a real note.
 */
import type { GuideCountry, GuideLanguage, GuideSource } from "./countries";

/** Profession clusters of the first acquisition wave (owner list, 2026-11-09). */
export type GuideProfession =
  | "electrician"
  | "plumber"
  | "welder"
  | "tiler"
  | "bricklayer"
  | "roofer"
  | "concrete"
  | "carpenter"
  | "installer"
  | "construction";

export interface ProfessionCopy {
  /** Cluster name as a worker would say it ("Электрики", "Elektrikçiler"). */
  readonly name: string;
}

export interface ProfessionEntry {
  readonly key: GuideProfession;
  /**
   * The public job board's profession filter slug (messages/en/professions.json),
   * or null when the catalogue has no single matching profession.
   */
  readonly jobsSlug: string | null;
  readonly ru: ProfessionCopy;
  readonly tr: ProfessionCopy;
}

export const GUIDE_PROFESSIONS: readonly ProfessionEntry[] = [
  { key: "electrician", jobsSlug: "electrician", ru: { name: "Электрики" }, tr: { name: "Elektrikçiler" } },
  { key: "plumber", jobsSlug: "plumber", ru: { name: "Сантехники и монтажники спринклеров" }, tr: { name: "Tesisatçılar ve sprinkler montajcıları" } },
  { key: "welder", jobsSlug: "welder", ru: { name: "Сварщики и трубопроводчики" }, tr: { name: "Kaynakçılar ve borucular" } },
  { key: "tiler", jobsSlug: "tiler", ru: { name: "Плиточники" }, tr: { name: "Fayansçılar" } },
  { key: "bricklayer", jobsSlug: "mason", ru: { name: "Каменщики" }, tr: { name: "Duvarcılar" } },
  { key: "roofer", jobsSlug: "roofer", ru: { name: "Кровельщики" }, tr: { name: "Çatı ustaları" } },
  { key: "concrete", jobsSlug: "concrete_worker", ru: { name: "Бетонщики и арматурщики" }, tr: { name: "Betoncular ve demirciler" } },
  { key: "carpenter", jobsSlug: "carpenter", ru: { name: "Плотники" }, tr: { name: "Marangozlar ve kalıpçılar" } },
  { key: "installer", jobsSlug: null, ru: { name: "Монтажники" }, tr: { name: "Montajcılar" } },
  { key: "construction", jobsSlug: "builder", ru: { name: "Строительные рабочие" }, tr: { name: "İnşaat işçileri" } },
];

export interface ComboCopy {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lede: string;
  /** What is specific to this profession in this country. */
  readonly notes: readonly string[];
}

export interface ComboEntry {
  readonly profession: GuideProfession;
  readonly country: GuideCountry;
  readonly ru: ComboCopy;
  readonly tr: ComboCopy;
  /** Official sources for the profession-specific notes (country sources are added). */
  readonly sources: readonly GuideSource[];
}

export const GUIDE_COMBOS: readonly ComboEntry[] = [
  {
    profession: "electrician",
    country: "de",
    ru: {
      slug: "rabota-elektrikom-v-germanii",
      title: "Работа электриком в Германии",
      description:
        "Работа электриком в Германии: признание квалификации, правила для Elektrofachkraft, регистрация и бесплатный профиль электрика на LabourMarket.ai.",
      h1: "Работа электриком в Германии",
      lede:
        "В Германии с электроустановками работают квалифицированные специалисты (Elektrofachkraft). Чтобы работодатель понял ваш уровень, иностранную квалификацию электрика стоит официально признать — обычно через Handwerkskammer или IHK.",
      notes: [
        "Работать с электроустановками разрешено квалифицированному электрику (Elektrofachkraft) или под его руководством — это правило охраны труда, которое проверяют работодатели.",
        "Профессия «Elektroniker» — ремесло, для которого признание квалификации обычно проводит Handwerkskammer; промышленные профили — IHK FOSA.",
        "Открыть собственную электромонтажную фирму можно только при выполнении требований ремесленного реестра (для этого ремесла действует обязательная мастерская квалификация).",
        "В профиле укажите, с каким напряжением и какими системами вы работали (жилые, промышленные, слаботочные) — это то, что работодатель спрашивает первым.",
      ],
    },
    tr: {
      slug: "almanyada-elektrikci-olarak-calismak",
      title: "Almanya'da elektrikçi olarak çalışmak",
      description:
        "Almanya'da elektrikçi olarak çalışmak: yeterlilik tanıma, Elektrofachkraft kuralları, kayıt ve LabourMarket.ai'de ücretsiz elektrikçi profili.",
      h1: "Almanya'da elektrikçi olarak çalışmak",
      lede:
        "Almanya'da elektrik tesisatlarında nitelikli uzmanlar (Elektrofachkraft) çalışır. İşverenin seviyenizi anlaması için yabancı elektrikçi yeterliliğinizi resmi olarak tanıtmanız faydalıdır — genellikle Handwerkskammer veya IHK üzerinden.",
      notes: [
        "Elektrik tesisatlarında çalışmaya nitelikli elektrikçi (Elektrofachkraft) ya da onun gözetimindeki kişiler yetkilidir; bu, işverenlerin denetlediği bir iş güvenliği kuralıdır.",
        "«Elektroniker» mesleği bir zanaattır; tanıma işlemini genellikle Handwerkskammer yapar, sanayi profillerinde ise IHK FOSA.",
        "Kendi elektrik firmanızı kurmak, zanaat siciline kayıt şartlarına bağlıdır (bu zanaat için ustalık şartı vardır).",
        "Profilinizde hangi gerilim ve sistemlerle çalıştığınızı (konut, sanayi, zayıf akım) yazın — işverenin ilk sorduğu budur.",
      ],
    },
    sources: [
      { label: "IHK FOSA — recognition of foreign vocational qualifications", url: "https://www.ihk-fosa.de" },
    ],
  },
  {
    profession: "electrician",
    country: "nl",
    ru: {
      slug: "rabota-elektrikom-v-niderlandah",
      title: "Работа электриком в Нидерландах",
      description:
        "Работа электриком в Нидерландах: нормы NEN 3140 и NEN 1010, сертификат VCA, оценка диплома IDW и бесплатный профиль электрика на LabourMarket.ai.",
      h1: "Работа электриком в Нидерландах",
      lede:
        "Электрику в Нидерландах обычно нужны сертификат безопасности VCA и знание норм NEN 3140 (безопасная эксплуатация) и NEN 1010 (монтаж). Иностранный диплом можно оценить через IDW.",
      notes: [
        "Работодатели спрашивают о знании норм NEN 3140 и NEN 1010 и о том, в какой роли вы работали по NEN 3140 (например, «vakbekwaam persoon»).",
        "Сертификат VCA нужен почти на каждом объекте; без него вас часто не допустят на площадку.",
        "Оценка IDW покажет работодателю, какому нидерландскому уровню (MBO) соответствует ваше образование электрика.",
      ],
    },
    tr: {
      slug: "hollandada-elektrikci-olarak-calismak",
      title: "Hollanda'da elektrikçi olarak çalışmak",
      description:
        "Hollanda'da elektrikçi olarak çalışmak: NEN 3140 ve NEN 1010 normları, VCA sertifikası, IDW diploma değerlendirmesi ve ücretsiz elektrikçi profili.",
      h1: "Hollanda'da elektrikçi olarak çalışmak",
      lede:
        "Hollanda'da bir elektrikçiden genellikle VCA güvenlik sertifikası ve NEN 3140 (güvenli işletme) ile NEN 1010 (tesisat) normlarını bilmesi beklenir. Yabancı diplomanız IDW ile değerlendirilebilir.",
      notes: [
        "İşverenler NEN 3140 ve NEN 1010 bilgisini ve NEN 3140'a göre hangi rolde çalıştığınızı (örneğin «vakbekwaam persoon») sorar.",
        "VCA sertifikası neredeyse her sahada gerekir; olmadan sahaya çoğu zaman alınmazsınız.",
        "IDW değerlendirmesi, elektrikçi eğitiminizin hangi Hollanda seviyesine (MBO) denk geldiğini işverene gösterir.",
      ],
    },
    sources: [{ label: "NEN — Dutch standards body", url: "https://www.nen.nl" }],
  },
  {
    profession: "plumber",
    country: "be",
    ru: {
      slug: "rabota-santehnikom-v-belgii",
      title: "Работа сантехником в Бельгии",
      description:
        "Работа сантехником в Бельгии: кто может работать, сертификация Cerga для газовых работ, Limosa и Checkin@Work и бесплатный профиль на LabourMarket.ai.",
      h1: "Работа сантехником в Бельгии",
      lede:
        "Сантехник в Бельгии работает по общим правилам права на работу. Если работа включает газовые установки, работодатели и заказчики часто требуют сертификацию установщика (например, Cerga).",
      notes: [
        "Для газовых работ в Бельгии распространена сертификация установщиков Cerga — укажите в профиле, есть ли она у вас.",
        "Монтаж спринклерных систем обычно ведут специализированные фирмы; опишите в профиле системы и нормы, с которыми вы работали.",
        "Если вас направляет иностранная фирма, до начала работ она подаёт декларацию Limosa.",
      ],
    },
    tr: {
      slug: "belcikada-tesisatci-olarak-calismak",
      title: "Belçika'da tesisatçı olarak çalışmak",
      description:
        "Belçika'da tesisatçı olarak çalışmak: çalışma hakkı, gaz işleri için Cerga sertifikası, Limosa ve Checkin@Work ve LabourMarket.ai'de ücretsiz profil.",
      h1: "Belçika'da tesisatçı olarak çalışmak",
      lede:
        "Belçika'da tesisatçı, genel çalışma hakkı kurallarına göre çalışır. İş gaz tesisatını kapsıyorsa işverenler ve müşteriler sıklıkla montajcı sertifikası (örneğin Cerga) ister.",
      notes: [
        "Belçika'da gaz işleri için Cerga montajcı sertifikası yaygındır — profilinizde olup olmadığını belirtin.",
        "Sprinkler sistemlerinin montajını genellikle uzman firmalar yapar; profilinizde çalıştığınız sistemleri ve normları yazın.",
        "Yabancı bir firma sizi gönderiyorsa, işe başlamadan önce Limosa bildirimini yapar.",
      ],
    },
    sources: [{ label: "Cerga (gas installer quality label, Belgium)", url: "https://www.cerga.be" }],
  },
  {
    profession: "construction",
    country: "de",
    ru: {
      slug: "rabota-stroitelem-v-germanii",
      title: "Работа строителем в Германии",
      description:
        "Работа строителем в Германии: документы на объекте, проверки таможни, касса SOKA-BAU, минимальная оплата и бесплатный профиль строителя.",
      h1: "Работа строителем в Германии",
      lede:
        "На немецкой стройке у каждого работника при себе должен быть паспорт или удостоверение личности: таможня (FKS) проверяет занятость и минимальную оплату прямо на объекте. Работодатели в строительстве участвуют в кассе SOKA-BAU.",
      notes: [
        "Обязанность иметь при себе документ, удостоверяющий личность, действует в строительстве для всех работников — в том числе командированных.",
        "Через SOKA-BAU, в частности, оплачиваются отпуска строителей; командированные работники иностранных фирм тоже в ней учитываются.",
        "В Германии действует законный минимальный размер оплаты труда; проверяйте условия договора до начала работы.",
      ],
    },
    tr: {
      slug: "almanyada-insaat-isi",
      title: "Almanya'da inşaat işi: belgeler ve kayıt",
      description:
        "Almanya'da inşaat işi: şantiyede gereken belgeler, gümrük denetimleri, SOKA-BAU fonu, asgari ücret ve LabourMarket.ai'de ücretsiz işçi profili.",
      h1: "Almanya'da inşaat işi",
      lede:
        "Alman şantiyesinde her çalışanın yanında pasaport veya kimlik bulunmalıdır: gümrük (FKS) kayıt dışı çalışmayı ve asgari ücreti şantiyede denetler. İnşaat işverenleri SOKA-BAU fonuna katılır.",
      notes: [
        "Kimlik belgesi taşıma yükümlülüğü inşaatta tüm çalışanlar için geçerlidir — görevlendirilenler dahil.",
        "İnşaat işçilerinin yıllık izin ödemeleri SOKA-BAU üzerinden yürür; yabancı firmaların görevlendirdiği işçiler de buna dahildir.",
        "Almanya'da yasal asgari ücret geçerlidir; işe başlamadan önce sözleşme şartlarını kontrol edin.",
      ],
    },
    sources: [{ label: "Zoll — Finanzkontrolle Schwarzarbeit (German Customs)", url: "https://www.zoll.de" }],
  },
  {
    profession: "construction",
    country: "nl",
    ru: {
      slug: "rabota-stroitelem-v-niderlandah",
      title: "Работа строителем в Нидерландах",
      description:
        "Работа строителем в Нидерландах: сертификат VCA, номер BSN, работа через агентство, жильё по норме SNF и бесплатный профиль строителя.",
      h1: "Работа строителем в Нидерландах",
      lede:
        "Строителю в Нидерландах почти всегда нужен сертификат VCA и номер BSN. Многие начинают через кадровое агентство — тогда важно проверить договор и жильё.",
      notes: [
        "Сертификат VCA Basis — минимальное требование на большинстве строек; бригадиру обычно нужен VCA VOL.",
        "Если жильё предоставляет агентство, проверьте сертификацию по норме SNF и то, как стоимость жилья удерживается из зарплаты.",
        "Работа через агентство регулируется коллективным договором для заёмного труда — спросите, какой договор применяется к вам.",
      ],
    },
    tr: {
      slug: "hollandada-insaat-isi",
      title: "Hollanda'da inşaat işi: VCA, BSN ve ajanslar",
      description:
        "Hollanda'da inşaat işi: VCA sertifikası, BSN numarası, ajans üzerinden çalışma, SNF normunda konaklama ve LabourMarket.ai'de ücretsiz profil.",
      h1: "Hollanda'da inşaat işi",
      lede:
        "Hollanda'da bir inşaat işçisinin neredeyse her zaman VCA sertifikasına ve BSN numarasına ihtiyacı vardır. Birçok kişi işe bir istihdam ajansı üzerinden başlar — o zaman sözleşmeyi ve konaklamayı kontrol etmek önemlidir.",
      notes: [
        "VCA Basis sertifikası çoğu şantiyede asgari şarttır; ustabaşılar için genellikle VCA VOL istenir.",
        "Konaklamayı ajans sağlıyorsa SNF sertifikasını ve konut bedelinin maaştan nasıl kesildiğini kontrol edin.",
        "Ajans üzerinden çalışma, geçici işçiler için toplu iş sözleşmesine tabidir — size hangi sözleşmenin uygulandığını sorun.",
      ],
    },
    sources: [],
  },
  {
    profession: "welder",
    country: "se",
    ru: {
      slug: "rabota-svarshchikom-v-shvecii",
      title: "Работа сварщиком в Швеции",
      description:
        "Работа сварщиком в Швеции: сертификаты ISO 9606, допуск Heta arbeten, карта ID06 и реальные вакансии сварщиков на LabourMarket.ai.",
      h1: "Работа сварщиком в Швеции",
      lede:
        "Шведские работодатели обычно ждут от сварщика действующих сертификатов по EN ISO 9606 для нужных методов и положений, а для работ на объекте — допуск к огневым работам «Heta arbeten» и карту ID06.",
      notes: [
        "Укажите в профиле методы сварки (например, 111, 135, 136, 141), материалы и положения из ваших сертификатов EN ISO 9606 и срок их действия.",
        "Допуск «Heta arbeten» выдаётся после короткого курса и нужен для сварки вне цеха.",
        "На LabourMarket.ai уже есть реальные объявления из Швеции — фильтр по профессии «сварщик» показывает текущие.",
      ],
    },
    tr: {
      slug: "isvecte-kaynakci-olarak-calismak",
      title: "İsveç'te kaynakçı olarak çalışmak",
      description:
        "İsveç'te kaynakçı olarak çalışmak: ISO 9606 sertifikaları, Heta arbeten belgesi, ID06 kartı ve LabourMarket.ai'deki gerçek kaynakçı ilanları.",
      h1: "İsveç'te kaynakçı olarak çalışmak",
      lede:
        "İsveçli işverenler bir kaynakçıdan genellikle gerekli yöntem ve pozisyonlar için geçerli EN ISO 9606 sertifikaları, sahadaki işler için de «Heta arbeten» sıcak iş belgesi ve ID06 kartı bekler.",
      notes: [
        "Profilinizde EN ISO 9606 sertifikalarınızdaki kaynak yöntemlerini (örneğin 111, 135, 136, 141), malzemeleri, pozisyonları ve geçerlilik süresini yazın.",
        "«Heta arbeten» belgesi kısa bir kursun ardından verilir ve atölye dışında kaynak için gerekir.",
        "LabourMarket.ai'de İsveç'ten gerçek ilanlar bulunur — «kaynakçı» meslek filtresi güncel olanları gösterir.",
      ],
    },
    sources: [
      { label: "Brandskyddsföreningen — Heta arbeten", url: "https://www.brandskyddsforeningen.se" },
    ],
  },
];

/** Shared copy every guide renders, per guide language. */
export interface GuideChrome {
  readonly eyebrow: string;
  readonly shortAnswer: string;
  readonly rightsTitle: string;
  readonly euRules: readonly string[];
  readonly onSiteTitle: string;
  readonly professionTitle: (country: string) => string;
  readonly journeyTitle: string;
  readonly journey: readonly string[];
  readonly ctaRegister: string;
  readonly ctaJobs: string;
  readonly jobsNote: string;
  readonly professionsTitle: string;
  readonly professionsNote: string;
  readonly faqTitle: string;
  readonly faq: readonly { readonly q: string; readonly a: string }[];
  readonly sourcesTitle: string;
  readonly sourcesNote: (checkedAt: string) => string;
  readonly relatedCountriesTitle: string;
  readonly relatedProfessionTitle: string;
  readonly hubTitle: string;
  readonly breadcrumbHome: string;
  readonly breadcrumbHub: string;
  readonly disclaimer: string;
  /** Shown only where the guide language has no UI of its own (TR). */
  readonly uiLanguageNote: string | null;
  readonly reviewNote: string;
}

export const GUIDE_CHROME: Readonly<Record<GuideLanguage, GuideChrome>> = {
  ru: {
    eyebrow: "Гид для работников в Европе",
    shortAnswer: "Коротко",
    rightsTitle: "Кто может здесь работать",
    euRules: [
      "Граждане ЕС, ЕЭЗ и Швейцарии могут работать в любой стране ЕС без разрешения на работу.",
      "Вид на жительство или разрешение на работу в одной стране ЕС, как правило, не даёт права работать в другой. Для новой страны обычно нужно отдельное разрешение — проверьте правила до переезда.",
      "Временная защита для граждан Украины действует в стране, которая её предоставила; переезд на работу в другую страну не переносит этот статус автоматически.",
    ],
    onSiteTitle: "Что обычно нужно на месте",
    professionTitle: (country) => `Что важно для профессии ${country}`,
    journeyTitle: "Как начать на LabourMarket.ai",
    journey: [
      "Зарегистрируйтесь — для работника это бесплатно.",
      "Выберите профессию и навыки.",
      "Добавьте опыт работы и документы, которые у вас уже есть (сертификаты, допуски, дипломы).",
      "Укажите, в какой стране вы сейчас и где хотите работать.",
      "Заполните профессиональный профиль — из него собирается ваше CV.",
      "Записывайте реально выполненную работу в рабочий журнал — это доказательство опыта, а не просто слова.",
      "Становитесь видимы для подходящих предложений — в пределах настроек видимости, которые выбираете вы.",
    ],
    ctaRegister: "Создать бесплатный профиль работника",
    ctaJobs: "Смотреть текущие вакансии",
    jobsNote:
      "На доске вакансий — только реальные объявления с указанием источника. Если по вашей стране объявлений пока нет, профиль всё равно делает вас видимыми для работодателей, которые ищут вашу профессию.",
    professionsTitle: "Профессии, с которыми можно начать",
    professionsNote: "Профессию и навыки вы выбираете при регистрации; список ниже — не ограничение.",
    faqTitle: "Частые вопросы",
    faq: [
      {
        q: "Регистрация для работника платная?",
        a: "Нет. Профиль работника, CV и рабочий журнал на LabourMarket.ai бесплатны.",
      },
      {
        q: "LabourMarket.ai гарантирует работу или визу?",
        a: "Нет. Платформа помогает показать реальный опыт и найти подходящие предложения, но не гарантирует трудоустройство, визу или разрешение на работу.",
      },
      {
        q: "Кто видит мой профиль?",
        a: "Только зарегистрированные работодатели и агентства, для которых вы видимы, — видимостью вы управляете сами. Ваше CV и контакты не индексируются поисковыми системами.",
      },
      {
        q: "Можно ли пользоваться сайтом на русском?",
        a: "Да. Интерфейс LabourMarket.ai доступен на русском языке.",
      },
    ],
    sourcesTitle: "Официальные источники",
    sourcesNote: (checkedAt) =>
      `Ссылки проверены ${checkedAt}. Правила меняются — перед переездом сверяйтесь с официальным источником.`,
    relatedCountriesTitle: "Другие страны",
    relatedProfessionTitle: "Эта профессия в других странах",
    hubTitle: "Все гиды по работе в Европе",
    breadcrumbHome: "Главная",
    breadcrumbHub: "Работа за границей",
    disclaimer:
      "Это общая информация, а не юридическая консультация. LabourMarket.ai не является государственным органом и не оформляет разрешения на работу.",
    uiLanguageNote: null,
    reviewNote: "Текст подготовлен редакцией LabourMarket.ai и ожидает проверки носителем языка.",
  },
  tr: {
    eyebrow: "Avrupa'daki çalışanlar için rehber",
    shortAnswer: "Kısaca",
    rightsTitle: "Burada kimler çalışabilir",
    euRules: [
      "AB, AEA ve İsviçre vatandaşları herhangi bir AB ülkesinde çalışma izni olmadan çalışabilir.",
      "Bir AB ülkesindeki oturum veya çalışma izni, kural olarak başka bir AB ülkesinde çalışma hakkı vermez. Yeni bir ülke için genellikle ayrı bir izin gerekir — taşınmadan önce kuralları kontrol edin.",
      "Türk vatandaşlarının Ankara Anlaşması'ndan doğan çalışma hakları, kural olarak yalnızca hâlihazırda yasal olarak çalıştıkları AB ülkesinde geçerlidir.",
    ],
    onSiteTitle: "Yerinde genellikle neler gerekir",
    professionTitle: (country) => `${country} bu meslek için önemli olanlar`,
    journeyTitle: "LabourMarket.ai'de nasıl başlanır",
    journey: [
      "Kaydolun — çalışanlar için ücretsizdir.",
      "Mesleğinizi ve becerilerinizi seçin.",
      "İş deneyiminizi ve elinizdeki belgeleri ekleyin (sertifikalar, yetki belgeleri, diplomalar).",
      "Şu an hangi ülkede olduğunuzu ve nerede çalışmak istediğinizi belirtin.",
      "Mesleki profilinizi tamamlayın — CV'niz bu profilden oluşur.",
      "Gerçekten yaptığınız işleri iş günlüğüne kaydedin — bu, sözden öte bir deneyim kanıtıdır.",
      "Uygun fırsatlar için görünür olun — sizin seçtiğiniz görünürlük ayarları dahilinde.",
    ],
    ctaRegister: "Ücretsiz işçi profili oluştur",
    ctaJobs: "Güncel iş ilanlarına bak",
    jobsNote:
      "İlan panosunda yalnızca kaynağı belirtilen gerçek ilanlar yer alır. Ülkeniz için henüz ilan yoksa da profiliniz, mesleğinizi arayan işverenlere sizi görünür kılar.",
    professionsTitle: "Başlayabileceğiniz meslekler",
    professionsNote: "Mesleğinizi ve becerilerinizi kayıt sırasında seçersiniz; aşağıdaki liste bir sınır değildir.",
    faqTitle: "Sık sorulan sorular",
    faq: [
      {
        q: "Çalışanlar için kayıt ücretli mi?",
        a: "Hayır. LabourMarket.ai'de işçi profili, CV ve iş günlüğü ücretsizdir.",
      },
      {
        q: "LabourMarket.ai iş veya vize garantisi veriyor mu?",
        a: "Hayır. Platform gerçek deneyiminizi göstermenize ve uygun fırsatları bulmanıza yardımcı olur, ancak iş, vize veya çalışma izni garanti etmez.",
      },
      {
        q: "Profilimi kimler görür?",
        a: "Yalnızca sizi görebilen kayıtlı işverenler ve ajanslar — görünürlüğü siz yönetirsiniz. CV'niz ve iletişim bilgileriniz arama motorlarında dizine eklenmez.",
      },
      {
        q: "Site Türkçe kullanılabiliyor mu?",
        a: "Bu rehber Türkçedir; LabourMarket.ai arayüzü şu an İngilizce, Almanca, Lehçe, Felemenkçe, Rusça ve Litvanca dillerinde kullanılabilir. Türkçe arayüz henüz yok.",
      },
    ],
    sourcesTitle: "Resmi kaynaklar",
    sourcesNote: (checkedAt) =>
      `Bağlantılar ${checkedAt} tarihinde kontrol edildi. Kurallar değişebilir — taşınmadan önce resmi kaynağı kontrol edin.`,
    relatedCountriesTitle: "Diğer ülkeler",
    relatedProfessionTitle: "Bu meslek diğer ülkelerde",
    hubTitle: "Avrupa'da çalışma rehberlerinin tümü",
    breadcrumbHome: "Ana sayfa",
    breadcrumbHub: "Yurt dışında çalışmak",
    disclaimer:
      "Bu genel bir bilgidir, hukuki danışmanlık değildir. LabourMarket.ai bir devlet kurumu değildir ve çalışma izni düzenlemez.",
    uiLanguageNote:
      "Bu rehber Türkçedir. Kayıt ve profil ekranları şu an İngilizce açılır; dili sayfanın üst kısmından değiştirebilirsiniz.",
    reviewNote: "Bu metin LabourMarket.ai editörlüğü tarafından hazırlanmıştır ve anadili Türkçe olan bir kişinin kontrolünü beklemektedir.",
  },
};
