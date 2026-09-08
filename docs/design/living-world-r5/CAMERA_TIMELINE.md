# R5 — Camera timeline (storyboard authored BEFORE build)

R5 §6: *storyboard before build; if the still is bad, motion will not save it.*
This file is the contract the prototypes are built against.

The camera is the navigation instrument. There is **one continuous space**.
Every beat below is a position of the same camera inside the same nested
world — not a page section, not a slide, not a new scene. Scroll drives the
camera; the camera never cuts.

---

## Flagship — GÖTEBORG · "One consignment"

Chosen by evidence (see `data/world-snapshot.json` → `citySelection`), not by
taste: 2nd-largest real inventory (3,078 active), **highest profession
evenness among high-volume cities (0.841)**, 17 professions with ≥20 live
vacancies, and a single continuous geography — river mouth → quay → city
block — that needs no impossible adjacency to hold every profession.

The story is deliberately **one object moving through a city**: a consignment
lands at the port, is handled in a warehouse, driven across town, received in
a restaurant kitchen, cooked, served — in a building an electrician wired and
a carpenter fitted out, next to a shop that sells the same goods. That is the
economic-interaction test answered *in the world*, with no arrows and no
diagram.

| t | Scale | Camera | World state | Real data on screen | User meaning |
|---|---|---|---|---|---|
| 00:00 | MACRO | Held wide. Northern Europe at first light, Sweden turned toward the camera. No motion but atmosphere. | Whole country, dawn. Nothing is highlighted yet. | `41,432` active opportunities · `21` regions · `290` cities · supplier + last-refresh timestamp | "This is a real country with real work in it, right now." |
| 00:02 | MACRO→MESO | Slow push toward the west coast; horizon tilts as the camera descends. | Västra Götaland resolves out of the country plate. | `6,289` active in Västra Götalands län across `49` cities | "It is not an abstraction. It goes down to where I live." |
| 00:05 | MESO | Descent continues to a real aerial: the Göta älv mouth, quays, gantry cranes, the city behind. **Economic activity is already in the establishing frame** (Ref 4/5's crane trick). | Göteborg, one light, one hour. | `3,078` active · `1,036` employers · `36` professions | "A city is not a dot. It is an economy." |
| 00:08 | MESO | Camera settles over the quay. The consignment is set down. Nothing is labelled yet — the world is read before it is annotated. | Port. Container, quay, water. | `warehouse_worker` `98` open, `40` employers *(counted inside this city)* | "Something real just arrived, and there is work attached to it." |
| 00:11 | HUMAN | Push into the warehouse doorway; the camera drops to standing height beside a person working. | Warehouse interior, same daylight coming through the door. | — (the frame carries no numbers; the world is the subject) | "There is a person here, not a data point." |
| 00:14 | DETAIL | Close. Hands on the pallet wrap; the scanner reads the label. Shallow depth of field, real material. | The work itself. | — | This is the **quality bar** frame (Ref 6's craft close-ups). |
| 00:16 | DETAIL→MICRO PRODUCT | The camera does not leave the workplace. The result is photographed, and the photograph becomes the entry. | A Work Journal entry forms *in place*, over the work it describes. | Entry text; skills recognised as `work_journal` tier | "What I just did is now part of my history." |
| 00:18 | MICRO PRODUCT | Held. The match is recomputed **with its basis visible**. | Fit changes: `5/7 → 7/7` of the warehouse need's canonical skills. Two skills newly evidenced: `forklift-operation`, `barcode-scanning`. | Fit shown only WITH its basis (§ fit.ts rule: a % without its basis does not exist). Evidence tier named, never a score. | "The system understands my work better — and it can show me exactly why." |
| 00:20 | MICRO→MESO | The camera rises off the bench and turns. | The same skill opens a **different** door: `forklift-operation` also belongs to `driver`. Honest partial coverage is shown as partial. | `driver` in Göteborg: `78` open, `61` employers. Coverage `1/4` — stated plainly, not flattered. | "A new direction opened, and I am not being lied to about how close I am." |
| 00:23 | MESO | The camera follows the consignment out of the door and across the city — one continuous move, road level. | Göteborg street, same light, later hour. | `driver` `78` · the goods are the through-line | "The chain is physical. It is the same world." |
| 00:26 | MESO→HUMAN | Into a restaurant's back door with the delivery. Kitchen. Steam, service. | The goods arrive where they are needed. | `kitchen_helper` `55` · `cook` `72` · `waiter` `51` — all in this city | "Someone else's work begins where mine ended." |
| 00:29 | MESO | Camera pulls back through the dining room to the street; the building itself is now the subject. | The restaurant sits in a building with wiring, fit-out, a shop at street level. | `electrician` `71` · `carpenter` `38` · `sales_assistant` `62` | "Every job here exists because another one did." |
| 00:32 | MACRO | The camera rises off the street, back over the river, back to the country plate — but the world is now **annotated by what was walked through**. | Return to the opening frame, changed. | Country totals again, with the walked chain retained | "I have seen how one country's work actually connects." |

**Never parks in aerial mode** (R5 §2): the ladder returns to macro only after
the human and detail scales have been earned, and the closing macro frame
carries the memory of the walk.

### Freeze-frame candidates
`00:05` (city establishing), `00:14` (hands / detail), `00:26` (kitchen
receiving) — each must survive the freeze-frame test with logo and UI removed.

---

## Second domain — "30 kg" (agriculture / product realization)

Deliberately contrasting with port-and-logistics, and deliberately **not a
job**. This is the cucumber test built as a first-class journey (Ref 3's
small-producer panel, Ref 7's ūkio column), not a footnote.

| t | Scale | Camera | World state | Real system behaviour | User meaning |
|---|---|---|---|---|---|
| 00:00 | MESO | Same country, different thread. Low morning sun on a greenhouse outside the city. | Rural Västra Götaland. Not a farm stock photo — one greenhouse, one person. | — | "The world is not only cities and vacancies." |
| 00:03 | HUMAN | Into the greenhouse; a person is picking. | The work is ordinary and real. | — | "This is the same world, at a different scale of enterprise." |
| 00:06 | DETAIL | Close on the crate. Weight written by hand. | 30 kg exists as a physical fact before it is a data structure. | — | "I have a thing. I want to sell it." |
| 00:09 | MICRO PRODUCT | The camera turns to the statement, in plain words. | `"Turiu 30 kg agurkų iš savo daržo ir noriu juos parduoti."` | Parsed as `subject: goods`, `quantity: 30 kg` — **not** a CV, **not** a vacancy. | "I did not have to learn a system to say this." |
| 00:12 | MICRO PRODUCT | Held. The four real channels are assessed. | The **actual** `assessChannelEligibility()` verdicts, computed by the production module, are shown one per channel. | `internal_marketplace_listings` → `LEGAL_CHECK_REQUIRED` (`food_sale_rules`); the other three → `UNSUPPORTED` (`value_type_not_supported`) | "It told me the truth instead of inventing a buyer." |
| 00:15 | MESO | The camera lifts, and the honest gap is left visible. | No fake buyer appears. The world states what would have to be true. | Named check + the note that no approved produce channel exists yet | "This system does not pretend." |

The pass condition here is **architectural, not visual**: the engine reached
PRODUCT → QUANTITY → LEGAL/CHANNEL CONTEXT → verdict without ever attempting
`worker → vacancy`. If the second domain had produced a glossy fake buyer, it
would have failed R5 §7 and PRODUCT_CONSTITUTION §5.

---

## Mobile direction (9:16 — not a desktop crop)

R5 §6 requires its own direction. Vertical depth replaces lateral travel; the
camera **pushes in** rather than panning, and each beat owns a full viewport
height so the phone never shows two scales at once.

```
WORLD ↓ COUNTRY ↓ CITY ↓ WORKPLACE ↓ PERSON ↓ HANDS ↓ RESULT ↓ JOURNAL ↓ OPPORTUNITY
```

Differences from desktop, deliberate:
- the chain (00:23–00:29) becomes a **vertical descent through the building**
  — kitchen above, shop below — instead of a lateral drive;
- data never overlays the subject; it occupies the lower third against the
  darkened base of the frame;
- the return-to-macro beat is a single fast pull-back, not a slow rise.

---

## Motion law

Slow, controlled, physically legible. Nothing bounces. Nothing pulses.
No particles, no orbs, no glowing network lines. The only continuous motion
in the world is atmospheric (haze, water, steam) — everything else moves
because the **camera** moves.

Reduced motion (`prefers-reduced-motion: reduce`): the camera stops being
scroll-driven and every beat renders as a composed static frame in document
order, with all data present. Nothing is only available in animation.

## Progressive enhancement ladder

| Level | What runs | Requirement |
|---|---|---|
| L0 | Premium static first frame, full text, all data | No JS. Must already look expensive. |
| L1 | CSS scroll-linked camera (transform/opacity only) | Compositor-only properties. |
| L2 | Layered depth parallax + masked reveals | Still CSS/DOM. |
| L3 | — | WebGL was **not** used: it did not earn its place (see README §Technology). |
