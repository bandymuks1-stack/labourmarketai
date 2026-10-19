"""LabourMarket.ai PRODUCT MASTER MAP — generator.

Reads the canonical register (docs/master/LABOURMARKET-FUNCTIONAL-AUDIT.md), applies the
production evidence gathered since it was last written, adds the commercial model and the
priorities, and writes ONE self-contained HTML page. Re-run it after every audit update:
the map is a view of the canonical documents, never a second source of truth.

    python build.py <audit.md> <out.html> <source-sha> [private-facts.json]
"""
import html
import json
import re
import sys

AUDIT, OUT, SHA = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(AUDIT, encoding="utf8").read()

# ── 1. The register ────────────────────────────────────────────────────────────────────
AREA_LT = {
    1: "Registracija, tapatybė, rolės, organizacijos, kvietimai",
    2: "Darbuotojo profilis, Living CV, Work Journal, patvirtinta patirtis",
    3: "Darbdavio erdvė: projektai, objektai, komandos, užduotys, valandos",
    4: "Poreikiai, paieška, matching, scouting, sutikimai",
    5: "Pokalbiai, pranešimai, kalendorius, pokalbiu valdoma sistema",
    6: "Universali prekyvietė: paslaugos, prekės, užsakymai, rezervacijos",
    7: "Planai, limitai, VIP, LMC, mokėjimai",
    8: "Daugiakalbystė, rinkos, SEO, mobilioji versija",
    9: "Administravimas, saugumas, RLS, API, duomenų apsauga",
    10: "AI, MCP, agentai ir integracijos",
    11: "Švietimas, institucijos, pripažinimas (RPL)",
    12: "Žemėlapis ir rinkos įžvalgos",
    13: "Platformos operacijos ir valdymas",
}
rows = []
area = 0
for line in src.split("## 2. Per-area status", 1)[1].split("## 3.", 1)[0].splitlines():
    m = re.match(r"### Area (\d+)", line)
    if m:
        area = int(m.group(1))
        continue
    m = re.match(r"\|\s*(\d+\.\d+)\s*\|(.*)\|\s*$", line)
    if not m:
        continue
    cells = [c.strip() for c in m.group(2).split("|")]
    feature, status_cell, blocker, action = (cells + ["", "", "", ""])[:4]
    word = re.match(r"[A-Z_]+", status_cell)
    raw = word.group(0) if word else "UNKNOWN"
    rows.append({
        "id": m.group(1), "area": area, "feature": feature, "raw": raw,
        "evidence": status_cell[len(raw):].strip(" ()"), "blocker": blocker if blocker != "—" else "",
        "action": action if action != "—" else "",
    })

# Production evidence after the audit snapshot (2026-10-18/19, real production; see report).
EVIDENCE = {
    "1.2": ("LIVE_PROVEN", "Savininkas prisijungė per Google produkcijoje 2026-10-18 ir 10-19; #2482, #2488"),
    "1.12": ("CODE_READY", "Nonstop slaptas raktas atkurtas abiejose pusėse 2026-10-18; laukiantis lead perdavimas – savininko veiksmas"),
    "4.29": ("LIVE_PROVEN", "Perdavimo užduotis produkcijoje: HTTP 200, authFailed 0, sutikimo neturintis įrašas sulaikytas"),
    "6.16": ("LIVE_PROVEN", "Komercinis perdavimas Nonstop atkurtas ir paleistas produkcijoje 2026-10-18"),
    "9.16": ("CODE_READY", "Durys sukonfigūruotos (atsako unauthorized); pilnas siuntimas dar neįvykdytas"),
    "10.22": ("CODE_READY", "Abi kryptys suporuotos; perdavimas veikia, referalo siuntimas laukia savininko"),
    "13.16": ("LIVE_PROVEN", "Naršyklės klaidų pranešimai įdiegti, durys atsako 204 (#2484)"),
}
for r in rows:
    if r["id"] in EVIDENCE:
        r["raw"], note = EVIDENCE[r["id"]]
        r["evidence"] = note

def bucket(r):
    raw = r["raw"]
    if raw == "LIVE_PROVEN":
        return "LIVE_PROVEN"
    if raw == "BROKEN":
        return "BROKEN"
    if raw == "PLANNED":
        return "PLANNED"
    if raw == "DORMANT":
        return "BLOCKED"
    if raw == "PARTIAL":
        b = (r["blocker"] + " " + r["evidence"]).lower()
        return "BLOCKED" if re.search(r"owner|savinink|red #|approval|key|token|secret", b) else "CODE_READY"
    return "CODE_READY"

for r in rows:
    r["s"] = bucket(r)
    r["partial"] = r["raw"] == "PARTIAL"

# ── 2. The value chain (owner's chain) and which features live on each link ─────────────
CHAIN = [
    ("person", "Žmogus / įmonė", "Paskyra, rolės, organizacija, kalba", [1, 8], None),
    ("need", "Poreikis", "Darbuotojų, paslaugų ar prekių poreikis", [4, 6], r"demand|need|request|intake|vacanc|listing"),
    ("match", "Paieška ir AI matching", "Rasti tinkamus žmones, komandas, pasiūlymus", [4, 12], r"search|match|scout|map|discover|supply|jobs|recommend"),
    ("offer", "Pasiūlymas", "Kandidatai, komandos, paslaugos, kaina", [4, 6, 3], r"offer|shortlist|candidate|propos|team|brigade|agency"),
    ("talk", "Bendravimas", "Pokalbiai, kvietimai, pranešimai", [5, 1], r"conversation|chat|message|notif|invit|thread"),
    ("deal", "Susitarimas", "Sutikimai, rezervacija, sąlygos, derybos", [4, 6, 5], r"consent|booking|engagement|terms|negotiat|disclos|contract"),
    ("order", "Užsakymas / projektas", "Projektai, objektai, užduotys, komandos", [3, 6], r"project|object|site|task|order|assign"),
    ("run", "Vykdymas", "Darbo laikas, kalendorius, Work Journal", [3, 2, 5], r"hour|time|calendar|plan|journal|shift|absence"),
    ("proof", "Įrodymai", "Patvirtinimai, Living CV, istorija, pripažinimas", [2, 11], r"cv|evidence|confirm|history|review|skill|recogn|portfolio|credential"),
    ("pay", "Atsiskaitymas", "Planai, LMC, mokėjimai, sąskaitos", [7], None),
    ("next", "Naujos galimybės", "Patirtis grįžta į paiešką; AI ir integracijos", [10, 12, 2], r"ai|mcp|agent|integration|growth|feed|potential|opportunit"),
]

def chain_features(areas, rx):
    out = []
    for r in rows:
        if r["area"] not in areas:
            continue
        if rx is None or re.search(rx, r["feature"], re.I):
            out.append(r["id"])
    return out

# Which customer-funnel stage each link of the chain moves (public: labels only; the measured
# numbers and the current blocker per link come from the private facts file, key "impact").
CHAIN_STAGE = {
    "person": "Pritraukimas", "need": "Aktyvacija", "match": "Aktyvacija", "offer": "Konversija",
    "talk": "Konversija", "deal": "Konversija", "order": "Išlaikymas", "run": "Išlaikymas",
    "proof": "Išlaikymas", "pay": "Pajamos", "next": "Augimas",
}
chain = []
for key, name, desc, areas, rx in CHAIN:
    ids = chain_features(areas, rx)
    chain.append({"key": key, "name": name, "desc": desc, "ids": ids, "stage": CHAIN_STAGE.get(key, "")})

# ── 3. Commercial model per area ────────────────────────────────────────────────────────
COMMERCIAL = {
    1: ("Žmogus ar įmonė negali pradėti be patikimos paskyros ir aiškios rolės.", "Niekas tiesiogiai (darbuotojui nemokama)", "Įėjimas į mokamą įmonės planą", "Mažos: Supabase Auth, el. paštas", "Pritraukimas", "Dabar"),
    2: ("Darbuotojo tikra patirtis neužfiksuojama ir neįrodoma.", "Darbuotojas nemoka; vertę gauna įmonė", "Netiesioginė: patvirtinta istorija didina įmonių plano vertę", "Mažos–vidutinės: saugykla, nuotraukos", "Išlaikymas, diferenciacija", "Dabar"),
    3: ("Įmonė valdo žmones, objektus ir valandas skaičiuoklėse.", "Įmonė (planas €99/mėn.)", "Prenumerata", "Vidutinės: DB užklausos, našumas", "Išlaikymas, pajamos", "Dabar"),
    4: ("Įmonė neranda patikimų darbuotojų ar komandų laiku.", "Įmonė, agentūra", "Prenumerata; vėliau profilių peržiūros / LMC", "Vidutinės: paieška, vakansijų importas", "Konversija, pajamos", "Dabar"),
    5: ("Susitarimai išsibarsto telefonuose ir žinutėse.", "Įtraukta į planą", "Netiesioginė (išlaikymas)", "Mažos", "Išlaikymas", "Dabar"),
    6: ("Paslaugos, prekės ir nuoma tarp šalių neturi patikimos vietos.", "Pirkėjas / pardavėjas", "Vėliau: komisiniai ar LMC (dar nepatvirtinta)", "Vidutinės–didelės: užsakymai, ginčai, logistika", "Pritraukimas, pajamos", "Vėliau"),
    7: ("Be veikiančio atsiskaitymo nėra pajamų.", "Įmonė", "Prenumerata €99, LMC kreditai (1 LMC = €1)", "Stripe mokesčiai; webhook, sąskaitos", "Pajamos", "Atidėta (savininkas, 2026-10-19): pirma esamos Stripe integracijos ir perkėlimo auditas"),
    8: ("Darbuotojai ir įmonės kalba skirtingomis kalbomis ir yra skirtingose šalyse.", "Niekas tiesiogiai", "Netiesioginė: tarptautinis pritraukimas, SEO", "Mažos–vidutinės: vertimai", "Pritraukimas", "Dabar"),
    9: ("Pasitikėjimas, privatumas ir teisinė atitiktis (GDPR).", "Niekas tiesiogiai", "Būtina sąlyga pardavimui įmonėms", "Vidutinės: auditai, priežiūra", "Pasitikėjimas, rizikos mažinimas", "Dabar"),
    10: ("Rankinis darbas ir izoliuoti partneriai lėtina srautą.", "Įmonė, partneris (Nonstop)", "Netiesioginė; partnerių perdavimai", "AI kaina (šiuo metu išjungta), integracijų priežiūra", "Pritraukimas, efektyvumas", "Dalis dabar, AI vėliau"),
    11: ("Neformaliai įgyti įgūdžiai nepripažįstami.", "Institucija, darbdavys", "Vėliau: institucijų planai (nepatvirtinta)", "Vidutinės", "Diferenciacija", "Vėliau"),
    12: ("Įmonė nemato, kur yra darbuotojai ir poreikis.", "Įmonė", "Netiesioginė (plano vertė)", "Mažos–vidutinės", "Konversija", "Vėliau"),
    13: ("Platforma turi veikti stabiliai, būti stebima ir atkuriama.", "Niekas", "Būtina sąlyga", "VPS, Supabase (viršyta nemokama kvota), stebėsena", "Rizikos mažinimas", "Dabar (P0)"),
}

# ── 4. Facts (production, 2026-10-19, aggregates only) ──────────────────────────────────
# Production facts are telemetry and never live in the public repository: pass them as a
# private JSON file (a list of [label, value, note]) — output/ is gitignored.
FACTS, FUNNEL, IMPACT, ACQ_NOW = [], [], {}, {}
if len(sys.argv) > 4:
    _private = json.load(open(sys.argv[4], encoding="utf8"))
    if isinstance(_private, dict):
        FACTS, FUNNEL = _private.get("facts", []), _private.get("funnel", [])
        IMPACT = _private.get("impact", {})
        ACQ_NOW = _private.get("acquisition", {})
    else:
        FACTS = _private
for _link in chain:
    _measured = IMPACT.get(_link["key"])
    if _measured:
        _link["metric"], _link["blocker"] = _measured[0], _measured[1]

# ── 4a. Company acquisition and demand generation — only channels that already work ─────
# (owner command 2026-10-19). Each row: channel, what flows through it, the existing capability
# rows it uses, the measure that proves it moves, who acts. Measured numbers per channel come
# from the private facts file (key "acquisition"), never from this public file.
ACQUISITION = [
    ("A1", "Nonstop Group užklausos → LabourMarket poreikis",
     "Įmonių užklausos dabar ateina į Nonstop paštą. Nonstop kaip agentūra paskelbia poreikį kliento vardu ir pasiūlo savo brigadas ar žmones",
     "4.15, 4.1, 4.6", "Užklausos → paskelbti poreikiai → pasiūlymai per savaitę", "Savininkas (Nonstop) + agentas"),
    ("A2", "Darbuotojų susidomėjimas viešais skelbimais → Nonstop susisiekia su darbdaviu",
     "Realus darbuotojas pažymi skelbimą; perdavimas Nonstop; Nonstop pasiūlo darbdaviui žmones ir LabourMarket paskyrą",
     "6.16, 4.29", "Perdavimai → susisiekta → darbdavio paskyra → poreikis", "Nonstop"),
    ("A3", "Esami Nonstop klientai ir importuota istorija",
     "Importuota projektų istorija ir žmonės: kvietimai pasiimti savo istoriją; buvę klientai kviečiami kaip įmonės",
     "1.9, 2.4", "Pasiimta istorija; pakviesta ir aktyvuota įmonių", "Savininkas"),
    ("A4", "Savininko B2B susirašinėjimas (partneriai, kurie atsakė)",
     "Atsakę partneriai gauna įmonės ar agentūros paskyrą ir pirmą poreikį ar pasiūlymą kartu su agentu",
     "1.5, 4.1, 4.15", "Atsakymai → paskyros → pirmas poreikis", "Savininkas"),
    ("A5", "Viešos svetainės (LabourMarket, darbo skelbimai, nonstopgroup.eu)",
     "Nuorodos „Paskelbti poreikį“ sekamos nuo #2515, išskyrus pradinio puslapio duris (pradinis puslapis įšaldytas iki jo plano); vieša poreikio forma veikia be paskyros",
     "4.1, 9.14", "Įmonės mygtukų paspaudimai → pateikti poreikiai", "Agentas (matavimas), savininkas (turinys)"),
    ("A6", "Aktyvacija per 24 val.",
     "Kiekvienam naujam poreikiui – kandidatai ir brigados iš esamos paieškos ir pasiūlymų, žinutė per pokalbius",
     "4.6, 4.7, 5.4", "Poreikis → pirmas pasiūlymas ≤ 24 val.", "Agentas + Nonstop"),
]

# ── 4b. First paying customer: the activation queue (dependency order) ─────────────────
# Each step names the register rows it closes, who acts, and what it depends on.
ACTIVATION = [
    ("1", "Pajamų piltuvo matavimas", "Kainų puslapio peržiūra, plano mygtuko paspaudimas, checkout pradžia ir pabaiga kaip įvykiai", "7.1, 7.4", "Agentas", "—"),
    ("2", "Stripe raktai ir webhook", "Slaptas raktas, webhook paslaptis, kainos ID; webhook adresas /api/billing/webhook Stripe pusėje", "7.4", "Savininkas (Stripe)", "—"),
    ("3", "Mokėjimų jungikliai", "PAYMENTS_ENABLED, BILLING_PROVIDER=stripe, STRIPE_MODE=live, STRIPE_LIVE_ACTIVATION VPS aplinkoje", "7.5", "Agentas (po 2)", "2"),
    ("4", "Antras savininko veiksmas", "live_payments_enabled duomenų bazėje (jei sujungtas #2441)", "7.5", "Savininkas", "3"),
    ("5", "Vienas apmokėjimas iki galo", "Tikras €99 apmokėjimas produkcijoje, webhook atnaujina prenumeratą, planas įsijungia (7.3)", "7.3, 7.4, 7.5", "Savininkas + agentas", "4"),
    ("6", "Įmonės kelias iki mokėjimo", "Poreikis → kandidatai → kontaktas → riba (1 aktyvi pozicija) → €99 pasiūlymas tinkamu momentu", "4.10, 4.16, 4.18, 7.2", "Agentas", "5"),
    ("7", "Pirmo kliento pasiūlymas", "Šiltas tinklas: įmonės, kurios jau paskelbė poreikį ar pakvietė žmones", "—", "Savininkas", "6"),
    ("A", "Alternatyva be Stripe", "Sąskaita faktūra + rankinis plano suteikimas (7.7) – galima jau dabar", "7.7", "Savininkas + agentas", "—"),
]

# ── 5. Priorities ──────────────────────────────────────────────────────────────────────
PRIORITIES = [
    ("P0", "Įjungti mokėjimus", "Stripe raktai, webhook, €99 planas veikia iki galo", "Savininko raktai (Stripe)", "Pirmas mokantis klientas", "Pajamos"),
    ("P0", "Duomenų bazė po kvota", "Senų vakansijų valymas, ESCO sprendimas (#2461, #2463)", "Savininko GO", "Visos naujos funkcijos", "Stabilumas"),
    ("P0", "Darbalaukio našumas", "Bendras darbalaukio rėmas kiekviename puslapyje daro dešimtis duomenų bazės užklausų", "—", "Aktyvavimas, išlaikymas", "Patirtis"),
    ("P0", "Privatumo paketas", "#2477 tapatybės atskyrimas, tada #2474 (3 peržiūros, VIP)", "Savininko RED patvirtinimas", "Mokamo plano vertė", "Pasitikėjimas, pajamos"),
    ("P1", "Įmonės konversijos kelias", "Poreikis → kandidatai → kontaktas → €99 planas, su 3 nemokamų peržiūrų riba", "P0 mokėjimai, #2474", "Konversija", "Pajamos"),
    ("P1", "Transakciniai el. laiškai", "Kvietimai, priminimai, savaitės suvestinė (nemokamas tiekėjas)", "Savininko DNS", "Aktyvavimas", "Augimas"),
    ("P1", "Istorinių žmonių aktyvavimas", "Dauguma importuotų žmonių dar neperėmė savo istorijos", "El. laiškai", "Pritraukimas", "Augimas"),
    ("P1", "Google prisijungimo prekės ženklas", "Google rodo supabase.co adresą vietoj LabourMarket.ai", "Savininko sprendimas", "Konversija", "Pasitikėjimas"),
    ("P2", "LMC ir agentūrų planai", "Kreditai peržiūroms, agentūrų pakopos", "Savininko kainodaros patvirtinimas", "ARPU", "Pajamos"),
    ("P2", "Tarpvalstybinis matching ir vertimas", "Pasiūla A šalyje ↔ poreikis B šalyje", "Nemokamas vertimo sprendimas", "Tarptautinis augimas", "Plėtra"),
    ("P2", "Mobilioji programėlė parduotuvėse", "Pasirašymas, parduotuvių įrašai", "Savininko paskyros", "Išlaikymas", "Patirtis"),
    ("P3", "Prekyvietės užsakymai ir ginčai", "Užsakymai, saugus atsiskaitymas, ginčų sprendimas", "Verslo ir teisinis pagrindas", "Naujos pajamos", "Plėtra"),
    ("P3", "AI agentai kaip dalyviai", "Tik po tapatybės ir sutikimų užbaigimo", "P0 privatumas", "Efektyvumas", "Ateitis"),
]

SCENARIOS = [
    ("Pirmas mokantis klientas", "1 įmonė × €99", [
        "FAKTAS: pajamų dar nėra, mokėjimai produkcijoje išjungti (trūksta Stripe raktų); skaičiai – privačiuose faktuose.",
        "Būtina: Stripe raktai + webhook (savininkas), tada vienas apmokėjimas iki galo produkcijoje.",
        "PRIELAIDA: pirmas klientas ateina iš esamo tinklo (Nonstop Group, pilotinės įmonės), ne iš reklamos.",
    ]),
    ("€1 000 MRR", "≈ 11 įmonių × €99 (aritmetika)", [
        "PRIELAIDA: dalis esamų organizacijų pereina į mokamą planą, kai 3 nemokamos peržiūros išnaudojamos.",
        "Būtina: įmonės konversijos kelias (P1), el. laiškai, greiti ekranai.",
        "Neprognozuojama data: priklauso nuo konversijos, kurios dar nėra iš ko išmatuoti.",
    ]),
    ("€10 000 MRR", "≈ 101 įmonė × €99 arba €99 + LMC / agentūrų pakopos", [
        "PRIELAIDA: pastovus įmonių srautas iš importuotų vakansijų, SEO puslapių, partnerių perdavimų ir tarptautinio matching.",
        "Būtina: patvirtinta istorija kaip konkurencinis pranašumas, LMC ir agentūrų kainodara (savininko sprendimas).",
        "Rizika: duomenų bazės dydis ir kaina auga kartu su vakansijų importu.",
    ]),
    ("Pelningas augimas", "Pajamos > infrastruktūra + aptarnavimas", [
        "FAKTAS: dabartinės sąnaudos mažos (esamas VPS, Supabase Free, Cloudflare Free, GitHub).",
        "Artimiausia neišvengiama sąnauda: Supabase Pro (~$25/mėn.), jei duomenų bazė nesumažinama po nemokama kvota.",
        "PRIELAIDA: aptarnavimo kaina išlieka maža, nes procesai vyksta pokalbiu ir savitarna.",
    ]),
]

RECO = {
    "Užbaigti": ["Mokėjimai ir €99 planas iki galo", "Privatumo paketas #2477 → #2474", "Darbalaukio rėmo našumas", "Laukiančio Nonstop lead perdavimas", "Pokalbių tęstinumo testas (workspace perjungimas)"],
    "Supaprastinti": ["Viena įmonės tapatybė (companies → organizations)", "Viena komandos tiesa (engagement_contexts)", "Vienas dėmesio centras vietoj kelių pranešimų vietų", "Pokalbio komponentas (~8 300 eilučių) į modulius"],
    "Sujungti": ["Įgūdžių saugyklos (candidate_skills → viena)", "Seni pokalbių ir poreikių modeliai (threads, job_demands)", "Trys patvirtinimo žetonų įgyvendinimai"],
    "Atidėti": ["Prekyvietės logistika ir ginčai", "AI agentai kaip dalyviai", "Pamainos / grafikai", "Institucijų RPL planai"],
}

def section(name):
    try:
        part = src.split(name, 1)[1]
        return re.split(r"\n## ", part, maxsplit=1)[0].strip()
    except IndexError:
        return ""

def md_list(txt):
    items = []
    for l in txt.splitlines():
        l = l.strip()
        if l.startswith(("- ", "* ")) or re.match(r"\d+\. ", l):
            items.append(re.sub(r"^(- |\* |\d+\. )", "", l))
    return items

GAPS = {
    "Sukurta, bet nepasiekiama ar išjungta": md_list(section("## 4. Built but unreachable, dormant or dead"))[:14],
    "Dubliavimai": md_list(section("## 5. Duplicates and overlapping implementations"))[:12],
    "Dokumentuota, bet nesukurta": md_list(section("## 3. Documented but not built"))[:12],
}

JOURNEYS = [
    ("Darbuotojas", [("Registracija", "1.1"), ("Darbo kortelė", "2.2"), ("Work Journal", "2.19"), ("Vadovo patvirtinimas", "2.20"), ("Living CV", "2.4"), ("Matomumas įmonėms", "2.35"), ("Galimybės", "4.3"), ("Pokalbis", "5.4")]),
    ("Įmonė", [("Registracija", "1.1"), ("Organizacija", "1.6"), ("Poreikis", "4.1"), ("Kandidatai", "4.11"), ("Trumpasis sąrašas", "4.12"), ("Kontaktas", "4.16"), ("Projektas", "3.2"), ("Valandos", "3.33"), ("Mokamas planas", "7.5")]),
    ("Agentūra", [("Registracija", "1.1"), ("Agentūros ir kliento ryšys", "4.15"), ("Komanda", "3.7"), ("Komandos pasiūlymas", "4.6"), ("Derybos", "4.7"), ("Valandos", "3.33")]),
    ("Prekyvietė", [("Paslauga", "6.1"), ("Skelbimas", "6.2"), ("Paieška", "6.3"), ("Rezervacija", "6.5"), ("Užsakymas", "6.13"), ("Atsiskaitymas", "7.5")]),
    ("Partneris (Nonstop)", [("Lead Nonstop svetainėje", "1.12"), ("Referalas į LM", "9.16"), ("Kvietimas", "1.9"), ("Interesas → perdavimas", "4.29"), ("Komercinis perdavimas", "6.16")]),
]

byid = {r["id"]: r for r in rows}
journeys = []
for name, steps in JOURNEYS:
    journeys.append({"name": name, "steps": [{"label": l, "id": i, "s": byid[i]["s"] if i in byid else "PLANNED", "feature": byid[i]["feature"] if i in byid else "—"} for l, i in steps]})

counts = {}
for r in rows:
    counts[r["s"]] = counts.get(r["s"], 0) + 1

DATA = {
    "sha": SHA, "rows": rows, "areas": AREA_LT, "chain": chain, "counts": counts,
    "commercial": {str(k): v for k, v in COMMERCIAL.items()}, "facts": FACTS, "priorities": PRIORITIES,
    "funnel": FUNNEL, "activation": ACTIVATION, "acquisition": ACQUISITION, "acq_now": ACQ_NOW,
    "scenarios": SCENARIOS, "reco": RECO, "gaps": GAPS, "journeys": journeys,
}

page = open(sys.argv[0].replace("build.py", "template.html"), encoding="utf8").read()
page = page.replace("/*__DATA__*/null", json.dumps(DATA, ensure_ascii=False).replace("</", "<\\/"))
open(OUT, "w", encoding="utf8", newline="\n").write(page)
print("rows", len(rows), "counts", counts, "chain", {c["key"]: len(c["ids"]) for c in chain})
