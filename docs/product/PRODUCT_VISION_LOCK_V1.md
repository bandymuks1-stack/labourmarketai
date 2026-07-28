# PRODUCT VISION LOCK V1 — CANONICAL PRODUCT ARCHITECTURE

| Field | Value |
|---|---|
| Status | **THE HIGHEST PRODUCT DESIGN AUTHORITY.** Above every other product/UX/architecture document |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1.** Nothing in §1 is paraphrased, summarised or added to |
| Machine half | `apps/web/lib/product-gate/world-elements.ts` |
| Enforced by | `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts` |
| Subordinate to this | `docs/PRODUCT_CONSTITUTION.md` · `docs/product/labour-market-os-constitution-v1.md` · `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` · every other product doc |

## Authority order

```
PRODUCT_VISION_LOCK_V1        ← this document (product design)
  └─ PRODUCT_CONSTITUTION      (§12 axioms, §13 Product Gate)
      └─ labour-market-os-constitution-v1, canonical product vision, UX docs
          └─ everything else
```

`docs/PLATFORM_DOCTRINE.md` remains supreme for **technical/legal** doctrine
(RLS, migrations, privacy, honesty). Where a product-design question conflicts,
**this document wins**. Where a technical-safety question conflicts, the
doctrine wins. Neither may be overridden by a feature PR.

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **PAGRINDINĖ PRODUKTO IDĖJA**
>
> Labourmarket.ai nėra darbo skelbimų portalas.
> Labourmarket.ai nėra CRM.
> Labourmarket.ai nėra ATS.
> Labourmarket.ai nėra HR sistema.
> **Labourmarket.ai yra AI valdoma darbo rinkos operacinė sistema.**
>
> **PAGRINDINIAI PASAULIO ELEMENTAI**
>
> Produktas susideda tik iš šių pagrindinių elementų:
> 1. AI Conversation · 2. User Avatar · 3. Market World Map · 4. Objects ·
> 5. Organizations · 6. Projects · 7. Teams · 8. Work Journal · 9. Skills ·
> 10. Reputation · 11. Documents · 12. Communication
>
> Visos būsimos funkcijos turi būti vieno ar kelių šių elementų plėtiniai.
>
> **AI**
>
> AI yra pagrindinė vartotojo sąsaja. AI: veda dialogą; supranta tikslą;
> atlieka veiksmus; atidaro reikalingą kontekstą; uždaro jį; grįžta į pokalbį.
> **Negali būti antro AI. Negali būti lygiaverčio valdymo būdo.**
>
> **AVATARAS**
>
> Avataras nėra iliustracija. Avataras yra vartotojo skaitmeninė tapatybė.
> Avataras turi: profilį; įgūdžius; darbo istoriją; darbo žurnalą; reputaciją;
> dokumentus; sertifikatus; prieinamumą; organizacijas; komandas.
> **Visi veiksmai vykdomi avataro vardu.**
>
> **MARKET WORLD MAP**
>
> Map nėra darbo paieškos ekranas. Map yra vizualus darbo rinkos pasaulis.
> Žemėlapyje gali egzistuoti: žmonės; avatarai; įmonės; projektai; objektai;
> darbo vietos; paklausos signalai; komandos; mokymai; renginiai; lygos;
> partneriai; AI objektai; kiti pasaulio elementai. **Visi jie yra sluoksniai.
> Map tampa pagrindiniu pasaulio atvaizdavimu.**
>
> **OBJECTS**
>
> Objektas nėra adresas. Objektas gali būti: statybvietė; gamykla; sandėlis;
> biuras; projektas; mokymų centras; renginys; bet kuri kita veiklos vieta.
> **Objektai turi savo istoriją.**
>
> **WORK JOURNAL**
>
> Darbo žurnalas yra pagrindinis įgūdžių šaltinis. **Jis nėra atskiras
> produktas.** Jis integruotas į pokalbį ir avatarą. Iš jo formuojami: įgūdžiai;
> patirtis; reputacija; pasiekimai; AI rekomendacijos.
>
> **SKILLS**
>
> Įgūdžiai negeneruojami iš CV. Pagrindinis šaltinis yra darbo žurnalas.
> CV yra tik papildomas informacijos šaltinis.
>
> **LEAGUES**
>
> Lygos nėra žaidimas. Jos yra reputacijos ir motyvacijos sistema.
> Jos remiasi tik realia veikla.
>
> **COMMUNICATION**
>
> **Inbox nėra produktas. Bookings nėra produktas. Requests nėra produktas.
> Candidates nėra produktas.** Visa komunikacija vyksta per AI.
> AI tik laikinai atveria reikalingą kontekstą.
>
> **DASHBOARD**
>
> Dashboard nėra darbo vieta. Dashboard tik parodo: dabartinę būseną; dienos
> suvestinę; aktyvias užduotis; pokalbį.
>
> **DRAUDŽIAMA**
>
> Negalima kurti: naujų dashboard; naujų wizard; naujų nuolatinių modulių;
> naujų AI; dubliuojančių funkcijų; naujų produktų produkto viduje.
>
> **PRIVALOMA — kiekvienas naujas PR privalo atsakyti:**
> Kuris pagrindinis pasaulio elementas plečiamas? Kodėl negalima panaudoti jau
> esamo elemento? Kaip ši funkcija integruojasi į AI pokalbį? Kaip ji atsispindės
> Avataro būsenoje? Kaip ji atsispindės World Map? Kaip ji susijusi su Work
> Journal?

---

## 2. The twelve world elements (machine-readable)

`apps/web/lib/product-gate/world-elements.ts` carries the same twelve with their
definitions and the owner's per-element rules. A guard asserts the two halves
list exactly the same elements.

| # | Element | id | The rule that bites |
|---|---|---|---|
| 1 | AI Conversation | `ai_conversation` | **No second AI. No equally-ranked way to operate the product** |
| 2 | User Avatar | `user_avatar` | Every action is performed in the avatar's name |
| 3 | Market World Map | `market_world_map` | The map is the primary representation of the world; everything else is a **layer** |
| 4 | Objects | `objects` | An object is a place of activity **with its own history**, not an address |
| 5 | Organizations | `organizations` | — |
| 6 | Projects | `projects` | — |
| 7 | Teams | `teams` | — |
| 8 | Work Journal | `work_journal` | **Not a separate product**; integrated into the conversation and the avatar |
| 9 | Skills | `skills` | Source is the journal; **CV is only additional** |
| 10 | Reputation | `reputation` | Leagues rest **only on real activity** |
| 11 | Documents | `documents` | — |
| 12 | Communication | `communication` | **Inbox / bookings / requests / candidates are NOT products** |

---

## 3. The six mandatory answers (enforced)

Every new surface must answer all six in
`apps/web/lib/product-gate/surface-registry.ts`. A blank is not an answer.

| # | Question | Field |
|---|---|---|
| 1 | Which world element is extended? | `worldElement` |
| 2 | Why can an existing element not be used? | `whyNotExistingElement` |
| 3 | How does it integrate into the AI conversation? | `chatIntegration` |
| 4 | How is it reflected in the Avatar's state? | `avatarEffect` |
| 5 | How is it reflected in the World Map? | `mapEffect` |
| 6 | How is it related to the Work Journal? | `journalRelation` |

Plus the five the Product Constitution already required (`origin_axiom`,
`purpose`, `why_not_chat`, `why_not_existing_component`, `owner`) —
**eleven answers total** before a new surface can exist.

### New RED rules added by this lock

| Rule | Fires when | Certainty |
|---|---|---|
| `unanswered_vision_question` | any of the six answers is missing | certain |
| `no_world_element` | the declared element is not one of the twelve | certain |
| `second_ai` | an assistant/copilot/agent surface appears that is not the conversation | heuristic |

---

## 4. What this changes for every future PR

**Before:** "does this feature work, and is it safe?"
**Now:** "which of the twelve does it extend, and why can none of them carry it?"

A feature that extends none of the twelve is, in the owner's words, *a new
product inside the product*. The gate refuses it.

---

*Locked. Amended only by explicit owner decision recorded here. The current-state
assignment of every existing screen to an element is in
`docs/audits/product-vision-surface-assignment-v1.md`.*
