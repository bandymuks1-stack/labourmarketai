# Gamification terminology audit — 2026-09-30

**Owner decision (2026-09-30, "REBUILD /lt/about. REMOVE GAMIFICATION COMPLETELY"):**
LabourMarket.ai is not a game. These are real people, professions, companies,
projects, responsibilities, working hours, evidence and income. No user-facing
string may describe workers, employers, projects, skills or labour-market
participation with a game or sports metaphor.

This supersedes the "sports operating model" wording of WAGON 6 (Commercial
Readiness train, audit area 10) that `/about` and the projects board carried.
The clause that "divisions/leagues are grouping layers, never a ranking"
(constitution §10) is not violated by the removal: the ranking prohibition
stays, and is now stated in plain terms ("no star ratings, no points, no
worker leaderboards") on `/about` and pinned by guards.

## What was searched

Every string VALUE in all 11 locale catalogues (`apps/web/messages/*.json`) and
every per-locale module (`messages/<locale>/*.json`), plus all `app/`,
`components/` and `lib/` source for hard-coded user-facing strings. Terms, per
language:

| Concept | EN | LT | RU | DE | NL | PL | DA/NO/SV | ET/LV/FI |
|---|---|---|---|---|---|---|---|---|
| player / player card | player card | žaidėjas, žaidėjo kortelė | игрок, карточка игрока | Spielerkarte | spelerskaart | karta gracza | spillerkort, spelarkort | mängijakaart, spēlētāja karte, pelaaja |
| playing field | playing field, field of play | žaidimo aikštė | игровое поле | Spielfeld | speelveld | boisko | spillefelt, spelplan | mänguväli, spēles laukums, pelikenttä |
| league | league | lyga, lygos | лига | Liga | competitie | liga | liga | liiga, līga |
| division | division | divizionai | дивизион | Division | divisie | dywizja | – | – |
| game / gamification | game, gamif* | žaidimas | игра | Spiel | spel | gra | – | – |
| score / XP / level / ranking | score, XP, level, ranking | balas, reitingas | балл, рейтинг | Score, Ranking | score, ranglijst | wynik, ranking | – | – |

## Classification of every occurrence

### A. REMOVED — game/sports vocabulary naming real workers, projects or participation

| Where (key) | Was | Now | Locales |
|---|---|---|---|
| `about.sportsModel.*` (whole section) | "player cards, teams and objects", "playing field", "divisions / leagues", "the product borrows sports vocabulary" | **deleted**; `/about` rebuilt (see below) | LT EN RU NL DE PL |
| `about.loops[0].points[0]` | "your player card" | rewritten inside the new `about` copy | LT EN RU NL DE PL |
| `projects.model.note` | "workers' player cards are assigned to objects (projects)" | "workers' professional profiles are assigned to objects (projects)" | LT EN RU NL DE PL |
| `projectOps.worker.playerCardLink` | "Player card" / "Spielerkarte" / "Spelerskaart" | "Profile" / "Profil" / "Profiel" | LT EN RU NL DE PL |
| `projectOps.notes.candidateSkill` | "…on the worker's own player card" | "…on the worker's own professional profile" | LT EN RU NL DE PL |
| `todayScreen.layout.sections.playerCard` | "Player card" / "Spillerkort" / "[EN] Player card" | "Professional profile" (localised) | all 11 |
| `marketRecognition.action.complete_player_card` | "Complete your Player Card" | "Complete your professional profile" | LT EN RU NL DE PL |
| `admin.launch.items.worker_profile_player_card` | "Worker profile / player card" | "Worker professional profile" | all 11 |
| `talentPreview.workers.description` | "player-card-style worker tiles" | "worker profile tiles" | all 11 |
| `labour-market.workerPathBody` | "…CV and player card over time" | "…CV and professional profile over time" | DA DE ET LV NL NO SV |

### B. RENAMED — the same concept under a neutral "card" label, now the professional term

The worker's identity view was labelled "My card / Professional card / Worker
card". It is the person's **professional profile** (experience, work history,
competencies, evidence, confirmations). Renamed everywhere it names that view:
`playerCard.pageTitle`, `playerCard.title`, `auth.dashboard.tabs.playerCard`,
`auth.dashboard.menuLinks.playerCard`, `conversation.results.playerCard.title`,
`livingWorkerHero.cardLabel`, `quickNav.identity`, `conversation.chat.chipMyCard`
and the four chat sentences (`playerCardAfterLog / Blocked / Opened / Error`) —
LT EN RU NL DE PL (labels/opened-sentence also DA ET LV NO SV).

### C. RENAMED — staff-only "league" (not public, cleaned for consistency)

`admin.hub.league`, `admin.league.eyebrow|title|empty` ("Country league",
"Labour market league", "Šalies lyga", "Länderliga", "Лига стран", …) are the
platform-admin market-intelligence page. Renamed "Labour market by country".
The admin URL `/dashboard/admin/league` is unchanged (internal).

### D. KEPT — legitimate, not gamification

* **Negations that promise there is no ranking** (`no scores`, `no rankings`, `no star ratings`, `No worker leaderboards` on `/about`). These are the platform's honesty commitments; banning the words would delete them.
* **Technical measurement labels**: "Stored confidence score", "operations readiness score" (admin), "confidence".
* **Media/UI words**: "Play" (audio/video), "delegate".
* **Neutral "card" nouns that are not the profile**: payment card, ID card, fuel card, health-and-safety card, "dashboard card", "trust card", "job need card".
* **Lithuanian "Liga"** = sickness (`requests.absenceType.sickness`) and **Swedish "-liga"** adjectives (verkliga, ärliga) — the guard is written not to trip on them.

### E. NOT changed — internal identifiers, no user-visible text (recommended follow-up)

Route `/dashboard/player-card` (redirect), query `?card=`, component/file names
(`WorkerPlayerCard`, `player-card-*.tsx`), i18n KEY names (`playerCard.*`),
capability id `player-card`, admin route `/dashboard/admin/league`, test ids.
Renaming them is code churn with no user effect; tracked as a follow-up.

### F. BORDERLINE — recorded, not changed here

`kortelė` / "card" still appears in running sentences as the everyday word for
"the person's page" (e.g. LT "darbo kortelė" = the availability-and-pay form).
It is not sports or game vocabulary, so it is outside this decision, but it is
the inheritance of the old metaphor. Recommended next slice: replace those
sentences with "profesinis profilis" / "darbo pasirengimo anketa" copy by
copy, with the native-speaker review LT/RU/PL need.

## Proof

* `apps/web/lib/guards/no-gamification-terms.test.ts` scans every string value of every locale catalogue and module for the banned vocabulary in 11 languages: **0 offenders**, with negative controls proving it catches "Player card", "Žaidėjo kortelė", "žaidimo aikštė", "Divizionai / lygos", "Darbo rinkos lyga", "Labour market league", "Карточка игрока", "Spielerkarte", "Arbeitsmarkt-Liga", "spelerskaart", "karta gracza", "Spillerkort" — and does not trip on "sąlygos" (conditions), "Liga" (sickness), "verkliga".
* `about.sportsModel` is asserted absent in all six catalogues that carry `/about`.
* The old `sports-operating-model.test.ts` was renamed `project-staffing-model.test.ts`; its vocabulary pins were replaced, its real-rows / one-identity / real-actions pins were kept.

## /about — what changed

Rebuilt as a visual explanation of the system (LT, EN, RU, NL, DE, PL). Sections:
hero with two rails (person: people → opportunities → real work → evidence →
professional growth; company: companies → people → projects → verified work →
organisational capability), the full lifecycle, for people, for employers, for
agencies and other participants, the evidence graph (one record, several
views), why use it after being hired, fact ≠ derived ≠ confirmed, privacy,
the European labour market, what the platform does not do, data links.

Removed: the blanket "everything described here works in the product today"
sentence (replaced by a status note that the page explains logic, not
deployment status); every number (no vacancy count is shown); the whole sports
section.

URLs: `/{locale}/about` (lt, en, ru, nl, de, pl; other locales fall back to
English exactly as before). Anchor `/about#sports-model` removed;
`/about#evidence` is the new target of the projects-board link.
