import json,collections
T={
'en':dict(offer="Propose to the lead agency",offered="Proposed. The lead agency reviews it before its client sees it.",note="Note for the lead agency (optional)",withdraw="Withdraw",returnedWhy="Returned: {reason}",
  ps=dict(proposed="Awaiting the lead's review",forwarded="Forwarded to the client",returned="Returned",withdrawn="Withdrawn"),
  rv=dict(title="Partners' candidates to review",candidate="{worker} · from {agency}",partnerNote="Partner's note, not shown to your client: {note}",forward="Forward to your client",forwardConsequence="Your client sees this candidate as yours, with your note below. You answer to your client for this candidate.",yourNote="Your note to the client (optional)",confirm="Forward",forwarded="Forwarded.",ret="Return to the partner",reason="Reason, shown to the partner (optional)",returned="Returned."),
  err=dict(proposal_not_open="This candidate is no longer awaiting review.",already_offered="This worker is already offered on this need.")),
'lt':dict(offer="Pasiūlyti pagrindinei agentūrai",offered="Pasiūlyta. Pagrindinė agentūra peržiūri kandidatą, kol jo dar nemato jos klientas.",note="Pastaba pagrindinei agentūrai (nebūtina)",withdraw="Atšaukti",returnedWhy="Grąžinta: {reason}",
  ps=dict(proposed="Laukia pagrindinės agentūros peržiūros",forwarded="Perduota klientui",returned="Grąžinta",withdrawn="Atšaukta"),
  rv=dict(title="Partnerių kandidatai peržiūrai",candidate="{worker} · iš {agency}",partnerNote="Partnerio pastaba, klientas jos nemato: {note}",forward="Perduoti savo klientui",forwardConsequence="Jūsų klientas matys šį kandidatą kaip jūsų, su žemiau esančia jūsų pastaba. Už šį kandidatą klientui atsakote jūs.",yourNote="Jūsų pastaba klientui (nebūtina)",confirm="Perduoti",forwarded="Perduota.",ret="Grąžinti partneriui",reason="Priežastis, kurią matys partneris (nebūtina)",returned="Grąžinta."),
  err=dict(proposal_not_open="Šis kandidatas nebelaukia peržiūros.",already_offered="Šis darbuotojas jau pasiūlytas šiam poreikiui.")),
'ru':dict(offer="Предложить ведущему агентству",offered="Предложено. Ведущее агентство проверит кандидата до того, как его увидит клиент.",note="Заметка для ведущего агентства (необязательно)",withdraw="Отозвать",returnedWhy="Возвращено: {reason}",
  ps=dict(proposed="Ожидает проверки ведущим агентством",forwarded="Передано клиенту",returned="Возвращено",withdrawn="Отозвано"),
  rv=dict(title="Кандидаты партнёров на проверку",candidate="{worker} · от {agency}",partnerNote="Заметка партнёра, клиент её не видит: {note}",forward="Передать своему клиенту",forwardConsequence="Ваш клиент увидит этого кандидата как Вашего, с Вашей заметкой ниже. Перед клиентом за этого кандидата отвечаете Вы.",yourNote="Ваша заметка для клиента (необязательно)",confirm="Передать",forwarded="Передано.",ret="Вернуть партнёру",reason="Причина, которую увидит партнёр (необязательно)",returned="Возвращено."),
  err=dict(proposal_not_open="Этот кандидат больше не ожидает проверки.",already_offered="Этот работник уже предложен на эту потребность.")),
'nl':dict(offer="Voorstellen aan het hoofdbureau",offered="Voorgesteld. Het hoofdbureau beoordeelt de kandidaat voordat de klant die ziet.",note="Notitie voor het hoofdbureau (optioneel)",withdraw="Intrekken",returnedWhy="Teruggestuurd: {reason}",
  ps=dict(proposed="Wacht op beoordeling door het hoofdbureau",forwarded="Doorgestuurd naar de klant",returned="Teruggestuurd",withdrawn="Ingetrokken"),
  rv=dict(title="Kandidaten van partners om te beoordelen",candidate="{worker} · van {agency}",partnerNote="Notitie van de partner, niet zichtbaar voor uw klant: {note}",forward="Doorsturen naar uw klant",forwardConsequence="Uw klant ziet deze kandidaat als de uwe, met uw notitie hieronder. U staat tegenover uw klant in voor deze kandidaat.",yourNote="Uw notitie voor de klant (optioneel)",confirm="Doorsturen",forwarded="Doorgestuurd.",ret="Terugsturen naar de partner",reason="Reden, zichtbaar voor de partner (optioneel)",returned="Teruggestuurd."),
  err=dict(proposal_not_open="Deze kandidaat wacht niet meer op beoordeling.",already_offered="Deze medewerker is al aangeboden voor deze behoefte.")),
'de':dict(offer="Der Hauptagentur vorschlagen",offered="Vorgeschlagen. Die Hauptagentur prüft den Kandidaten, bevor ihr Kunde ihn sieht.",note="Notiz für die Hauptagentur (optional)",withdraw="Zurückziehen",returnedWhy="Zurückgegeben: {reason}",
  ps=dict(proposed="Wartet auf Prüfung durch die Hauptagentur",forwarded="An den Kunden weitergeleitet",returned="Zurückgegeben",withdrawn="Zurückgezogen"),
  rv=dict(title="Kandidaten von Partnern zur Prüfung",candidate="{worker} · von {agency}",partnerNote="Notiz des Partners, für Ihren Kunden nicht sichtbar: {note}",forward="An Ihren Kunden weiterleiten",forwardConsequence="Ihr Kunde sieht diesen Kandidaten als Ihren, mit Ihrer Notiz unten. Gegenüber Ihrem Kunden stehen Sie für diesen Kandidaten ein.",yourNote="Ihre Notiz an den Kunden (optional)",confirm="Weiterleiten",forwarded="Weitergeleitet.",ret="An den Partner zurückgeben",reason="Grund, für den Partner sichtbar (optional)",returned="Zurückgegeben."),
  err=dict(proposal_not_open="Dieser Kandidat wartet nicht mehr auf Prüfung.",already_offered="Diese Arbeitskraft ist für diesen Bedarf bereits angeboten.")),
'pl':dict(offer="Zaproponuj agencji wiodącej",offered="Zaproponowano. Agencja wiodąca sprawdzi kandydata, zanim zobaczy go jej klient.",note="Uwaga dla agencji wiodącej (opcjonalnie)",withdraw="Wycofaj",returnedWhy="Zwrócono: {reason}",
  ps=dict(proposed="Oczekuje na sprawdzenie przez agencję wiodącą",forwarded="Przekazano klientowi",returned="Zwrócono",withdrawn="Wycofano"),
  rv=dict(title="Kandydaci partnerów do sprawdzenia",candidate="{worker} · od {agency}",partnerNote="Uwaga partnera, niewidoczna dla Państwa klienta: {note}",forward="Przekaż Państwa klientowi",forwardConsequence="Państwa klient zobaczy tego kandydata jako Państwa, z Państwa uwagą poniżej. Wobec klienta to Państwo odpowiadają za tego kandydata.",yourNote="Państwa uwaga dla klienta (opcjonalnie)",confirm="Przekaż",forwarded="Przekazano.",ret="Zwróć partnerowi",reason="Powód widoczny dla partnera (opcjonalnie)",returned="Zwrócono."),
  err=dict(proposal_not_open="Ten kandydat nie oczekuje już na sprawdzenie.",already_offered="Ten pracownik jest już zaproponowany do tej potrzeby.")),
'sv':dict(offer="Föreslå för den ledande byrån",offered="Föreslagen. Den ledande byrån granskar kandidaten innan dess kund ser den.",note="Anteckning till den ledande byrån (valfritt)",withdraw="Dra tillbaka",returnedWhy="Returnerad: {reason}",
  ps=dict(proposed="Väntar på den ledande byråns granskning",forwarded="Vidarebefordrad till kunden",returned="Returnerad",withdrawn="Tillbakadragen"),
  rv=dict(title="Partners kandidater att granska",candidate="{worker} · från {agency}",partnerNote="Partnerns anteckning, visas inte för din kund: {note}",forward="Vidarebefordra till din kund",forwardConsequence="Din kund ser kandidaten som din, med din anteckning nedan. Du ansvarar inför din kund för den här kandidaten.",yourNote="Din anteckning till kunden (valfritt)",confirm="Vidarebefordra",forwarded="Vidarebefordrad.",ret="Returnera till partnern",reason="Anledning, visas för partnern (valfritt)",returned="Returnerad."),
  err=dict(proposal_not_open="Kandidaten väntar inte längre på granskning.",already_offered="Den här personen är redan erbjuden för det här behovet.")),
'da':dict(offer="Foreslå for det ledende bureau",offered="Foreslået. Det ledende bureau gennemgår kandidaten, før dets kunde ser den.",note="Note til det ledende bureau (valgfrit)",withdraw="Træk tilbage",returnedWhy="Returneret: {reason}",
  ps=dict(proposed="Afventer det ledende bureaus gennemgang",forwarded="Videresendt til kunden",returned="Returneret",withdrawn="Trukket tilbage"),
  rv=dict(title="Partneres kandidater til gennemgang",candidate="{worker} · fra {agency}",partnerNote="Partnerens note, vises ikke for din kunde: {note}",forward="Videresend til din kunde",forwardConsequence="Din kunde ser kandidaten som din, med din note herunder. Du står inde for kandidaten over for din kunde.",yourNote="Din note til kunden (valgfrit)",confirm="Videresend",forwarded="Videresendt.",ret="Returnér til partneren",reason="Årsag, vises for partneren (valgfrit)",returned="Returneret."),
  err=dict(proposal_not_open="Kandidaten afventer ikke længere gennemgang.",already_offered="Denne medarbejder er allerede tilbudt til dette behov.")),
'et':dict(offer="Paku juhtivale agentuurile",offered="Pakutud. Juhtiv agentuur vaatab kandidaadi üle enne, kui tema klient seda näeb.",note="Märkus juhtivale agentuurile (valikuline)",withdraw="Võta tagasi",returnedWhy="Tagastatud: {reason}",
  ps=dict(proposed="Ootab juhtiva agentuuri ülevaatust",forwarded="Kliendile edastatud",returned="Tagastatud",withdrawn="Tagasi võetud"),
  rv=dict(title="Partnerite kandidaadid ülevaatamiseks",candidate="{worker} · agentuurilt {agency}",partnerNote="Partneri märkus, klient seda ei näe: {note}",forward="Edasta oma kliendile",forwardConsequence="Teie klient näeb seda kandidaati teie omana, koos allpool oleva märkusega. Kliendi ees vastutate selle kandidaadi eest teie.",yourNote="Teie märkus kliendile (valikuline)",confirm="Edasta",forwarded="Edastatud.",ret="Tagasta partnerile",reason="Põhjus, mida partner näeb (valikuline)",returned="Tagastatud."),
  err=dict(proposal_not_open="See kandidaat ei oota enam ülevaatust.",already_offered="See töötaja on sellele vajadusele juba pakutud.")),
'lv':dict(offer="Piedāvāt vadošajai aģentūrai",offered="Piedāvāts. Vadošā aģentūra izvērtē kandidātu, pirms to redz tās klients.",note="Piezīme vadošajai aģentūrai (nav obligāta)",withdraw="Atsaukt",returnedWhy="Atgriezts: {reason}",
  ps=dict(proposed="Gaida vadošās aģentūras izvērtējumu",forwarded="Nodots klientam",returned="Atgriezts",withdrawn="Atsaukts"),
  rv=dict(title="Partneru kandidāti izvērtēšanai",candidate="{worker} · no {agency}",partnerNote="Partnera piezīme, klients to neredz: {note}",forward="Nodot savam klientam",forwardConsequence="Jūsu klients redzēs šo kandidātu kā jūsējo, ar jūsu piezīmi zemāk. Klienta priekšā par šo kandidātu atbildat jūs.",yourNote="Jūsu piezīme klientam (nav obligāta)",confirm="Nodot",forwarded="Nodots.",ret="Atgriezt partnerim",reason="Iemesls, ko redzēs partneris (nav obligāts)",returned="Atgriezts."),
  err=dict(proposal_not_open="Šis kandidāts vairs negaida izvērtējumu.",already_offered="Šis darbinieks jau ir piedāvāts šai vajadzībai.")),
'no':dict(offer="Foreslå for det ledende byrået",offered="Foreslått. Det ledende byrået går gjennom kandidaten før kunden deres ser den.",note="Merknad til det ledende byrået (valgfritt)",withdraw="Trekk tilbake",returnedWhy="Returnert: {reason}",
  ps=dict(proposed="Venter på det ledende byråets gjennomgang",forwarded="Videresendt til kunden",returned="Returnert",withdrawn="Trukket tilbake"),
  rv=dict(title="Partneres kandidater til gjennomgang",candidate="{worker} · fra {agency}",partnerNote="Partnerens merknad, vises ikke for kunden din: {note}",forward="Videresend til kunden din",forwardConsequence="Kunden din ser kandidaten som din, med merknaden din nedenfor. Du står ansvarlig overfor kunden din for denne kandidaten.",yourNote="Merknaden din til kunden (valgfritt)",confirm="Videresend",forwarded="Videresendt.",ret="Returner til partneren",reason="Årsak, vises for partneren (valgfritt)",returned="Returnert."),
  err=dict(proposal_not_open="Kandidaten venter ikke lenger på gjennomgang.",already_offered="Denne personen er allerede tilbudt til dette behovet.")),
}
import sys
for loc,v in T.items():
    path=f'messages/{loc}.json'
    raw=open(path,encoding='utf-8').read()
    d=json.loads(raw,object_pairs_hook=collections.OrderedDict)
    ap=d['agencyPartnerships']
    pt=ap['passedToMe']
    pt['offer']=v['offer']; pt['offered']=v['offered']; pt['note']=v['note']; pt['withdraw']=v['withdraw']; pt['returnedWhy']=v['returnedWhy']
    if 'partnerOffers' in ap: del ap['partnerOffers']
    ap['proposalStatus']=collections.OrderedDict(v['ps'])
    rv=collections.OrderedDict()
    for k in ['title','candidate','partnerNote','forward','forwardConsequence','yourNote','confirm','forwarded']: rv[k]=v['rv'][k]
    rv['return']=v['rv']['ret']; rv['reason']=v['rv']['reason']; rv['returned']=v['rv']['returned']
    ap['review']=rv
    for k,val in v['err'].items(): ap['errors'][k]=val
    # keep errors.needs_migration/error last order not required
    indent = 2
    out=json.dumps(d,ensure_ascii=False,indent=indent)+("\n" if raw.endswith("\n") else "")
    open(path,'w',encoding='utf-8').write(out)
print("ok")
