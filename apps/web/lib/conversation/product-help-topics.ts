/**
 * PRODUCT HELP — the questions a person asks about HOW to use the product
 * ("Kaip pridėti žmogų?", "Kur mano valandos?", "Kodėl atsirado šis
 * perspėjimas?"). Pure data, no imports: the intent router builds its rule
 * from `sources` and the chat handler reads the same topic back from the same
 * sources, so the two can never disagree about what a sentence asked.
 *
 * One answer per topic, in plain words, ALWAYS with the door that does the
 * thing (a chip to the existing surface) — never prose alone. The answers
 * live in the message catalogue (`conversation.chat.help.<id>`), in every
 * locale. Nothing here names a route, a table or an internal state to the
 * reader: `chips` carries link targets only for the chat to turn into buttons.
 *
 * Sources are written in folded (diacritic-free, lower-case) form; the router's
 * `p()` and the reader fold both sides anyway.
 */
export type HelpTopicId =
  | "projectUse"
  | "addPerson"
  | "hours"
  | "offerService"
  | "warning"
  | "forecast"
  | "scheduleWorker"
  | "doneWork";

export type HelpChip = {
  /** `link:` target the chat renders as a button. */
  readonly target: string;
  /** Key under `conversation.chat.help.chips`, or an existing label key. */
  readonly label: string;
  /** Only in this identity ("company" | "person"); omitted = both. */
  readonly only?: "company" | "person";
};

export type HelpTopic = {
  readonly id: HelpTopicId;
  readonly sources: readonly string[];
  readonly chips: readonly HelpChip[];
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "projectUse",
    sources: [
      "\\bkaip\\s+(?:as\\s+)?(?:naudotis|naudoti|pradeti)\\s+(?:siuo\\s+|situ\\s+|siuo\\s+)?projekt",
      "\\bhow\\s+(?:do\\s+i|to|can\\s+i)\\s+use\\s+(?:this\\s+|the\\s+)?project",
      "как\\s+пользоваться\\s+(?:этим\\s+)?проект",
      "\\bhoe\\s+(?:gebruik|werk)\\s+ik\\s+(?:met\\s+)?(?:dit\\s+|het\\s+)?project",
      "\\bwie\\s+(?:benutze|nutze|verwende)\\s+ich\\s+(?:dieses\\s+|das\\s+)?projekt",
      "\\bjak\\s+korzystac\\s+z\\s+(?:tego\\s+)?projekt",
    ],
    chips: [{ target: "/dashboard/projects", label: "chipHelpProjects" }],
  },
  {
    id: "addPerson",
    sources: [
      "\\bkaip\\s+(?:as\\s+)?(?:prideti|pakviesti|ipraseyti)\\s+(?:nauja\\s+)?(?:zmog|darbuotoj|zmones|nari|asmen)",
      "\\bhow\\s+(?:do\\s+i|to|can\\s+i)\\s+(?:add|invite)\\s+(?:a\\s+|an\\s+|new\\s+)?(?:person|people|worker|member|employee|someone|teammate)",
      "как\\s+(?:мне\\s+)?(?:добавить|пригласить)\\s+(?:человека|сотрудник|работник|участник)",
      "\\bhoe\\s+voeg\\s+ik\\s+[^.]{0,20}(?:persoon|medewerker|werknemer|mensen|teamlid)",
      "\\bwie\\s+f(?:u|ue)ge\\s+ich\\s+[^.]{0,20}(?:person|mitarbeiter|mitglied|leute)",
      "\\bjak\\s+dodac\\s+(?:osobe|pracownik|czlowiek|czlonk)",
    ],
    chips: [{ target: "/dashboard/network", label: "chipHelpPeople" }],
  },
  {
    id: "hours",
    sources: [
      "\\bkur\\s+(?:yra\\s+|matau\\s+|rasti\\s+)?(?:mano\\s+|musu\\s+)?(?:darbo\\s+)?(?:valandos|valandu|valandas|tabeli)",
      "\\bwhere\\s+(?:are|can\\s+i\\s+(?:see|find))\\s+(?:my\\s+|our\\s+)?(?:work\\s+)?(?:hours|timesheets?)",
      "где\\s+(?:мои\\s+|посмотреть\\s+)?(?:часы|часов|табель)",
      "\\bwaar\\s+(?:zijn|zie\\s+ik|vind\\s+ik)\\s+(?:mijn\\s+)?uren",
      "\\bwo\\s+(?:sind|sehe\\s+ich|finde\\s+ich)\\s+(?:meine\\s+)?(?:arbeits)?stunden",
      "\\bgdzie\\s+(?:sa\\s+|zobacze\\s+)?(?:moje\\s+)?godzin",
    ],
    chips: [{ target: "/dashboard/hours", label: "workHoursChip" }],
  },
  {
    id: "offerService",
    sources: [
      "\\bkaip\\s+(?:as\\s+)?pasiulyti\\s+paslaug",
      "\\bhow\\s+(?:do\\s+i|to|can\\s+i)\\s+offer\\s+(?:a\\s+|my\\s+)?service",
      "как\\s+(?:мне\\s+)?предложить\\s+услуг",
      "\\bhoe\\s+bied\\s+ik\\s+(?:een\\s+)?dienst",
      "\\bwie\\s+biete\\s+ich\\s+(?:eine\\s+)?(?:dienstleistung|leistung)",
      "\\bjak\\s+zaoferowac\\s+usluge",
    ],
    chips: [{ target: "/dashboard/services", label: "chipHelpServices" }],
  },
  {
    id: "warning",
    sources: [
      "\\bkodel\\s+(?:atsirado|pasirode|matau|gavau)\\s+[^.]{0,16}(?:perspejim|ispejim)",
      "\\bwhy\\s+(?:did\\s+i\\s+(?:get|see)|do\\s+i\\s+(?:get|see)|is\\s+there)\\s+(?:this\\s+|a\\s+)?(?:warning|alert)",
      "почему\\s+(?:появилось|возникло|я\\s+вижу)\\s+(?:это\\s+)?(?:предупреждение|оповещение)",
      "\\bwaarom\\s+(?:zie\\s+ik|is\\s+er|krijg\\s+ik)\\s+(?:deze\\s+|een\\s+)?waarschuwing",
      "\\bwarum\\s+(?:erscheint|sehe\\s+ich|gibt\\s+es|bekomme\\s+ich)\\s+(?:diese\\s+|eine\\s+)?warnung",
      "\\bdlaczego\\s+(?:pojawilo\\s+sie|widze|jest)\\s+(?:to\\s+|ta\\s+)?ostrzezeni",
    ],
    chips: [{ target: "/dashboard/activity", label: "activityChip" }],
  },
  {
    id: "forecast",
    sources: [
      "\\bka\\s+reiskia\\s+(?:si\\s+|sita\\s+)?prognoz",
      "\\bwhat\\s+does\\s+(?:this\\s+|the\\s+)?forecast\\s+mean",
      "что\\s+означает\\s+(?:этот\\s+|данный\\s+)?прогноз",
      "\\bwat\\s+betekent\\s+(?:deze\\s+|de\\s+)?prognose",
      "\\bwas\\s+bedeutet\\s+(?:diese\\s+|die\\s+)?prognose",
      "\\bco\\s+oznacza\\s+(?:ta\\s+)?prognoza",
    ],
    chips: [{ target: "/dashboard/planning", label: "chipHelpPlanning" }],
  },
  {
    id: "scheduleWorker",
    sources: [
      "\\bkaip\\s+(?:as\\s+)?(?:suplanuoti|planuoti)\\s+(?:darbuotoj|zmog|zmones|brigad)",
      "\\bhow\\s+(?:do\\s+i|to|can\\s+i)\\s+schedule\\s+(?:a\\s+|an\\s+)?(?:worker|person|employee|people|crew)",
      "как\\s+(?:мне\\s+)?запланировать\\s+(?:сотрудник|работник|человека)",
      "\\bhoe\\s+plan\\s+ik\\s+(?:een\\s+)?(?:medewerker|werknemer|persoon)",
      "\\bwie\\s+plane\\s+ich\\s+(?:einen\\s+|eine\\s+)?(?:mitarbeiter|person)",
      "\\bjak\\s+zaplanowac\\s+(?:pracownik|osobe)",
    ],
    chips: [{ target: "/dashboard/planning", label: "chipHelpPlanning" }],
  },
  {
    id: "doneWork",
    sources: [
      "\\bkur\\s+(?:matau|rasti|yra|galiu\\s+matyti)\\s+(?:mano\\s+)?(?:atlikt|padaryt)\\w*\\s+darb",
      "\\bwhere\\s+(?:can\\s+i\\s+)?(?:see|find)\\s+(?:the\\s+|my\\s+)?(?:completed|finished|done)\\s+work",
      "\\bwhere\\s+(?:is|are)\\s+(?:the\\s+|my\\s+)?(?:completed|finished|done)\\s+work",
      "где\\s+(?:посмотреть|увидеть|найти)\\s+(?:мою\\s+)?выполненн",
      "\\bwaar\\s+(?:zie|vind)\\s+ik\\s+(?:het\\s+)?(?:uitgevoerde|gedane|afgeronde)\\s+werk",
      "\\bwo\\s+(?:sehe|finde)\\s+ich\\s+(?:die\\s+)?(?:erledigte|geleistete|abgeschlossene)\\s+arbeit",
      "\\bgdzie\\s+(?:zobacze|widze)\\s+wykonan",
    ],
    chips: [
      { target: "/dashboard/journal", label: "chipHelpJournal", only: "person" },
      { target: "/dashboard/hours", label: "workHoursChip", only: "company" },
    ],
  },
];

/** The help-topic ids the message catalogue must carry a text for. */
export const HELP_TOPIC_IDS: readonly HelpTopicId[] = HELP_TOPICS.map((t) => t.id);
