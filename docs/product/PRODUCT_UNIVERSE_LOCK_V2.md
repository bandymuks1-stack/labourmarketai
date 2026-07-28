# PRODUCT UNIVERSE LOCK V2 — CANONICAL WORLD ARCHITECTURE

| Field | Value |
|---|---|
| Status | **HIGHEST PRODUCT AUTHORITY.** No further product reinterpretation allowed |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1** |
| Supersedes | `PRODUCT_VISION_LOCK_V1` — which stays valid as the element detail UNDER the four pillars. **Nothing was removed** |
| Machine half | `apps/web/lib/product-gate/universal-object-model.ts` |
| Enforced by | `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts` |

## Authority order

```
PRODUCT_UNIVERSE_LOCK_V2      ← world architecture (this document)
  └─ PRODUCT_VISION_LOCK_V1    (the twelve elements, under the four pillars)
      └─ PRODUCT_CONSTITUTION   (axioms + Product Gate)
          └─ everything else
```
`PLATFORM_DOCTRINE` remains supreme for technical/legal safety only.

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **MISSION** — Nuo šio momento Labourmarket.ai vystomas kaip viena vientisa AI
> valdoma darbo rinkos operacinė sistema. **Produktas nėra modulių rinkinys.
> Produktas yra vienas gyvas pasaulis.** Visi būsimi sprendimai turi plėsti šį
> pasaulį. Negalima kurti naujų produktų produkto viduje.
>
> **PAGRINDINĖ FILOSOFIJA** — Labourmarket.ai nėra: Job Board · CRM · ATS ·
> ERP · HR sistema · paprastas žemėlapis. Labourmarket.ai yra AI valdoma darbo
> rinkos operacinė sistema su vienu bendru skaitmeniniu pasauliu.
>
> **KETURI PAGRINDINIAI RAMSČIAI** — 1. AI Conversation · 2. Avatar ·
> 3. World Map · 4. Work Journal. **Visa kita yra tik šių keturių plėtiniai.**
>
> **WORLD MAP** — Map nėra darbo paieškos puslapis. Map nėra navigacijos
> ekranas. **Map nėra modulis.** Map yra pagrindinis visos darbo rinkos pasaulio
> vaizdas. Visi objektai egzistuoja vienoje bendroje erdvėje.
>
> **WORLD MAP YRA PLATFORMA** — Tai yra vienas svarbiausių architektūros
> principų. World Map negali būti projektuojamas konkrečioms šiandienos
> funkcijoms. Jis projektuojamas taip, kad po 5 ar 10 metų galėtų priimti naujus
> pasaulio objektų tipus nekeisdamas savo architektūros. **Naujas objektų tipas
> turi būti registruojamas, o ne reikalauti Map perprojektavimo.**
> **Jeigu naujo objekto įdiegimui reikia keisti pačią World Map architektūrą, architektūra laikoma neteisinga.**
>
> **UNIVERSAL OBJECT MODEL** — Visi pasaulio elementai paveldi bendrą objektų
> modelį. Minimaliai kiekvienas objektas turi: Object ID · Object Type ·
> Location · Geometry · Status · History · Relationships · Permissions · Events ·
> Documents · Media · Timeline · Metadata · Actions · Visibility · Tags ·
> Custom Extensions. **Objektų tipai nėra užkoduojami logikoje. Jie
> registruojami.**
>
> **WORLD OBJECT TYPES** — Avatar · Company · Construction Site · Factory ·
> Warehouse · Office · Project · Job · Training · Event · League · Partner ·
> Vehicle · Meeting Point · AI Agent · Temporary Zone · Future Objects.
> **Sistema privalo būti pasirengusi priimti neribotą objektų tipų skaičių.**
>
> **AVATAR** — Avatar nėra paveikslėlis. Avatar yra aktyvus pasaulio dalyvis.
> Avatar turi: poziciją; istoriją; darbo žurnalą; įgūdžius; reputaciją; komandas;
> organizacijas; projektus; būsenas; galimus veiksmus. **Visi naudotojo veiksmai
> atliekami avataro vardu.**
>
> **GYVAS PASAULIS** — World Map nėra statinis. Pasaulis turi būti projektuojamas
> kaip gyva sistema. Objektai gali: atsirasti; išnykti; keisti būseną; judėti;
> bendrauti; kviesti; priimti; vykdyti veiksmus; kaupti istoriją. **AI agentai
> taip pat yra pasaulio objektai.**
>
> **AI** — Vienas AI. Vienas pokalbis. AI yra pagrindinis operatorius. Visi
> veiksmai inicijuojami per pokalbį.
>
> **WORK JOURNAL** — Work Journal yra pagrindinis profesinės istorijos šaltinis.
> Iš jo formuojami: Skills · Experience · Reputation · Recommendations ·
> Achievements.
>
> **REPUTATION** — Reputacija skaičiuojama tik iš realių įrodymų.
>
> **LEAGUES** — Lygos yra reputacijos sluoksnis. Jos nėra žaidimas.
>
> **DASHBOARD** — Dashboard nėra darbo vieta. Dashboard yra trumpa būsena prieš
> pereinant į AI arba World Map.
>
> **DRAUDŽIAMA** — Kurti: naujus produktus produkto viduje; naujus dashboard;
> antrą AI; architektūrą, kuri priklauso nuo konkrečių objektų tipų; World Map
> sprendimus, kuriuos reikia perprojektuoti kiekvieną kartą atsiradus naujam
> objektų tipui.

---

## 2. The four pillars, and where the twelve elements live

Nothing from V1 was deleted — the twelve elements are now **extensions of the
four pillars**:

| Pillar | Elements it carries |
|---|---|
| **AI Conversation** | ai_conversation · communication |
| **Avatar** | user_avatar · skills · reputation · documents · teams · organizations |
| **World Map** | market_world_map · objects · projects |
| **Work Journal** | work_journal |

---

## 3. The nine mandatory answers

Every PR must answer all nine. **A "no" or "unknown" on a blocking question
stops the PR for human review** — the owner's rule, implemented literally.

| # | Question | Field | Blocking |
|---|---|---|---|
| 1 | Which pillar does it extend? | `pillar` | **yes** |
| 2 | Which world object type? | `objectType` | **yes** |
| 3 | Registered in the Universal Object Model? | `registeredInObjectModel` | **yes** |
| 4 | Shown on the World Map? | `mapEffect` | no |
| 5 | Does it have a Timeline? | `hasTimeline` | **yes** |
| 6 | Does it have History? | `hasHistory` | **yes** |
| 7 | Does it change Avatar state? | `avatarEffect` | no |
| 8 | Does it leave a Work Journal record? | `journalRelation` | no |
| 9 | Addable WITHOUT changing World Map architecture? | `addableWithoutMapChange` | **yes** |

Together with V1's six and the Constitution's five, a new surface now carries
**seventeen answers**. That is deliberate friction: it is cheaper than a second
product growing inside the product.

### New RED rules

| Rule | Fires when |
|---|---|
| `map_architecture_change` | a world object type is added by editing World Map architecture (`lib/market-map/spatial-entities.ts` and friends) |
| `not_registered_object_type` | the object type is not registered in the Universal Object Model |
| `requires_map_architecture_change` | `addableWithoutMapChange: false` |
| `unanswered_universe_question` | any of the nine is missing |
| `unknown_pillar` | the declared pillar is not one of the four |

---

## 4. THE HONEST STATE OF THE WORLD MAP TODAY

**The map is not yet a platform.** Verified 2026-07-28 in
`apps/web/lib/market-map/spatial-entities.ts`:

| Property | Required by the lock | Today |
|---|---|---|
| Object types are registered, not hardcoded | yes | **no** — `SPATIAL_ENTITY_KINDS` is a closed 3-value union |
| Render contract is data | yes | **no** — `SpatialRenderContract` is a closed union bound 1:1 to those three kinds ("The three kinds NEVER share a rendering contract") |
| A new type needs no map edit | yes | **no** — a construction site, training event or vehicle cannot be added without editing the map's own unions |
| Universal Object Model (17 properties) | yes | **partial** — spatial entities carry kind/visibility/render, not timeline, history, relationships, permissions, events, media, actions, tags or custom extensions |

**By the owner's own definition, the current architecture is wrong.** That is
recorded, not fixed: this slice migrates nothing. The Product Gate now blocks
the *next* type from being added the old way — proven by a probe that added a
fourth kind and produced `map_architecture_change`, merge blocked.

The map has one thing right already: `SPATIAL_ENTITY_REGISTRY` exists as a
registry shape. The work is to make the type list **data** and the render
contract **a property of the registered type**, not a union.

---

## 5. What this changes for every future PR

**Before:** "which of the twelve does it extend?"
**Now:** "which pillar, which object type, is that type registered, does it have
a timeline and history, and can it be added without touching the map?"

A feature that needs the map re-architected is not a feature — it is a sign the
architecture must be fixed first.

---

*Locked. Amended only by explicit owner decision recorded here. Execution plan:
`docs/product/one-world-execution-plan-v1.md`.*
