import type { LanguageFixtures } from "../types";

/**
 * RU phrase fixtures — moved VERBATIM from
 * lib/guards/multilingual-phrase-recognition.test.ts (same families as the
 * owner's LT pack). Measured against the recognizer, then pinned.
 */
export const RU_FIXTURES: LanguageFixtures = {
  language: "ru",
  phrases: [
    { text: "Работал на складе, упаковывал товары и грузил паллеты.", expects: ["warehouse-operations", "packaging"] },
    { text: "Возил груз в Германию с категорией B.", expects: ["cargo-transport"] },
    { text: "Работал на кассе и обслуживал клиентов.", expects: ["cashier", "customer-service"] },
    { text: "Заполнял счета и документы.", expects: ["document-handling", "bookkeeping"] },
    { text: "Работал на кухне, готовил еду и мыл посуду.", expects: ["cooking"] },
    { text: "Ухаживал за пожилым человеком и помогал по дому.", expects: ["elderly-care"] },
    { text: "Присматривал за ребёнком после школы.", expects: ["childcare"] },
    { text: "Работал в саду, косил траву и сажал растения.", expects: ["gardening"] },
    { text: "Программировал сайт и исправлял ошибки.", expects: ["programming"] },
    { text: "Собирал мебель и пользовался электроинструментом.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
    { text: "Убирал офис и общие помещения.", expects: ["cleaning-services"] },
    { text: "Общался с клиентами на английском и немецком языках.", expects: ["customer-service"] },
    { text: "Организовывал подготовку мероприятия.", expects: ["event-setup"] },
    { text: "Работал на погрузчике на складе.", expects: ["forklift-operation", "warehouse-operations"] },
    { text: "Клал кирпичную стену и мешал раствор.", expects: ["bricklaying"] },
    // Wave-2 catalogue expansion (2026-07-04).
    { text: "Работал с Excel и вводил данные.", expects: ["office-software", "data-entry"] },
    { text: "Мыл посуду в ресторане.", expects: ["dishwashing"] },
    { text: "Помогал на кухне как помощник повара.", expects: ["kitchen-help"] },
    { text: "Сканировал товары и складывал паллеты.", expects: ["barcode-scanning", "pallet-handling"] },
    { text: "Проводил инвентаризацию на складе.", expects: ["stock-taking"] },
    { text: "Ремонтировал машины в автосервисе.", expects: ["auto-repair"] },
    { text: "Чинил холодильники и стиральные машины.", expects: ["appliance-repair"] },
    { text: "Мелкий ремонт по дому.", expects: ["handyman-work"] },
    { text: "Стриг волосы клиентам.", expects: ["hairdressing"] },
    { text: "Работал барбером, брил бороды.", expects: ["barbering"] },
    { text: "Делала маникюр и педикюр.", expects: ["nail-care"] },
    { text: "Отвечал на звонки в колл-центре.", expects: ["call-centre"] },
    { text: "Работал на ресепшн и принимал посетителей.", expects: ["reception"] },
    { text: "Подбирал персонал и проводил собеседования.", expects: ["recruitment"] },
    { text: "Вёл кадровое делопроизводство.", expects: ["personnel-admin"] },
    { text: "Пёк хлеб в пекарне.", expects: ["baking"] },
    { text: "Выкладывал товар на полки.", expects: ["merchandising"] },
    { text: "Стирал и гладил бельё.", expects: ["laundry"] },
    { text: "Работал бариста, варил кофе.", expects: ["barista-work"] },
    // "проКЛАДКа кабеля" must never fire masonry (review PR3D: the bare
    // "кладк" needle was anchored to "кладка/кладку/кладкой стен").
    { text: "Прокладка кабеля в офисе.", expects: ["cable-pulling"], forbids: ["bricklaying"] },
  ],
  falsePositives: [
    // Worker-side interview is NOT recruitment work.
    { text: "Был на собеседовании по поводу работы.", forbids: ["recruitment"] },
    // Power tools alone are not electrical installation (context guard).
    { text: "Пользовался электроинструментом на даче.", forbids: ["electrical-install"] },
    // Washing floors is cleaning, never the flooring trade (context guard).
    { text: "Помыл полы дома.", forbids: ["flooring"] },
    // LEARNING at work is not teaching work.
    { text: "Учился новому на работе.", forbids: ["teaching"] },
    // A private phone call is not call-centre/customer-service work.
    { text: "Разговаривал с другом по телефону.", forbids: ["call-centre", "customer-service"] },
  ],
};
