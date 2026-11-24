# ESCO apply review — the 67 proposed writes (2026-08-30)

> **Purpose:** the owner approves or strikes rows BEFORE
> `supabase/migrations/20260830100000_esco_canonical_linkage_67.sql` is applied.
> To strike a row: delete its line from the migration's VALUES list (and from
> the rollback list); the guard `lib/guards/esco-linkage-migration.test.ts`
> cross-checks migration ↔ artifact so an artifact correction must land with it.
> Source of truth: [`esco-mapping-dryrun-2026-08-30.json`](esco-mapping-dryrun-2026-08-30.json).
> Pre-apply verification against prod (read-only, 2026-08-30): 0 pre-existing
> non-null conflicts, 0 missing source rows, 0 missing corpus references,
> 0 wrong-namespace references, 1 known many-to-one URI, 67 total.
> Rows marked ⚠ carry a semantic divergence visible in the official labels —
> the classification is deterministic, the ⚠ is reviewer guidance.

## Table 1 — the 67 proposed writes

| TYPE | SLUG | LM LABEL (en) | ESCO_URI | ESCO EN | ESCO LT | CLASS | REASON |
|---|---|---|---|---|---|---|---|
| skill | `bookkeeping` | Bookkeeping | `…/skill/ecc18804-a466-40d9-98b4-fba5cd67dd4b` | accounting | apskaita | HIGH_CONFIDENCE | exact-label:en:alternative; exact-label:lt:preferred |
| skill | `bricklaying` | Bricklaying | `…/skill/13e1c0a2-b90d-46f4-be51-11730360b38d` | lay bricks | mūryti plytas | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `bulldozer-operator` | Bulldozer operation | `…/skill/597d6a3a-0283-4945-8001-4719d210433d` | operate bulldozer | valdyti buldozerį | HIGH_CONFIDENCE | exact-label:en:alternative; verb-template:en:preferred(operate bulldozer) |
| skill | `cargo-transport` | Cargo transport | `…/skill/932c9ed1-3197-4b13-a558-bf147313fe88` | cargo industry | krovinių sektorius | HIGH_CONFIDENCE | exact-label:en:alternative ⚠ ESCO 'cargo industry' is a knowledge domain, not an activity; verify |
| skill | `carpentry` | Carpentry | `…/skill/19858dd3-a5fe-4855-b644-6ecfefd1c384` | carpentry | dailidystė | HIGH_CONFIDENCE | exact-label:en:preferred |
| skill | `concrete-finishing` | Concrete finishing | `…/skill/2d28964f-0a2d-4aa2-bc2d-c73f7a4442d6` | apply finish to concrete | apdailinti betono paviršių | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `concrete-pouring` | Concrete pouring | `…/skill/46994031-5490-4a02-9937-c61f6e2d4fc9` | pour concrete | lieti betoną | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `customer-service` | Customer service | `…/skill/15a33d76-4640-438d-ae64-fdc0c1d3eebc` | customer service | klientų aptarnavimas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| skill | `demolition` | Demolition | `…/skill/a68d4de0-99a3-4c26-b84a-040e706e4714` | demolish structures | griauti statinius | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `drainage` | Drainage systems | `…/skill/f7626ae8-eecf-41f4-bc4f-de9e57ed30a6` | rainwater management | lietaus vandens tvarkymas | HIGH_CONFIDENCE | exact-label:en:alternative ⚠ ESCO 'rainwater management' vs our LT name 'nuotekų sistemų montavimas' (sewage install); verify |
| skill | `excavator-operator` | Excavator operator | `…/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de` | operate excavator | valdyti ekskavatorių | HIGH_CONFIDENCE | verb-template:en:preferred(operate excavator) |
| skill | `first-aid` | First aid | `…/skill/f7464f30-662b-4177-85a0-3df9693e9e58` | first aid | pirmoji pagalba | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| skill | `forklift-operation` | Forklift operation | `…/skill/28cb374e-6261-4133-8371-f9a5470145da` | operate forklift | valdyti keltuvą | HIGH_CONFIDENCE | verb-template:en:preferred(operate forklift) |
| skill | `forklift-operator` | Forklift operator | `…/skill/28cb374e-6261-4133-8371-f9a5470145da` | operate forklift | valdyti keltuvą | HIGH_CONFIDENCE | verb-template:en:preferred(operate forklift) |
| skill | `grader-operator` | Grader operation | `…/skill/7692b391-9dab-4523-9b8d-93971c48502a` | operate grader | valdyti greiderį | HIGH_CONFIDENCE | exact-label:en:alternative; verb-template:en:preferred(operate grader) |
| skill | `graphic-design` | Graphic design | `…/skill/7fb699d9-182a-430e-b7a0-6d8ed05c284b` | graphic design | grafinis dizainas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| skill | `grouting` | Tile grouting | `…/skill/5bfdfb74-91dd-408b-a013-670d6961efc1` | fill tile joints | užpildyti plytelių sandūras | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `gutter-install` | Gutter installation | `…/skill/1f1f1090-b9ab-4373-b44e-ca3d0e3f86af` | install gutters | įrengti stoglatakius | HIGH_CONFIDENCE | exact-label:en:alternative; verb-template:en:preferred(install gutters) |
| skill | `hairdressing` | Hairdressing | `…/skill/d2c5d356-43d9-4118-827c-6801e32a452a` | hairdressing | sušukavimas | HIGH_CONFIDENCE | exact-label:en:preferred ⚠ ESCO LT 'sušukavimas' (styling) narrower than our hairdressing; verify |
| skill | `lighting-install` | Lighting installation | `…/skill/6f8d750e-aba4-459c-b4d7-220bddff9f58` | install lighting | įrengti apšvietimą | HIGH_CONFIDENCE | verb-template:en:preferred(install lighting) |
| skill | `loader-operator` | Wheel loader operation | `…/skill/621c6430-46ba-4793-a1b8-a2d30cb816ba` | operate front loader | valdyti priekinį krautuvą | HIGH_CONFIDENCE | verb-template:en:alternative(operate loader) |
| skill | `mobile-crane` | Mobile crane operation | `…/skill/9fe699e9-3490-4f3d-a50d-9f9d31c98698` | operate mobile crane | valdyti mobilųjį kraną | HIGH_CONFIDENCE | exact-label:en:alternative; verb-template:en:preferred(operate mobile crane) |
| skill | `office-software` | Office software (Excel, Word) | `…/skill/cf310cff-0d28-4dbc-9dbb-cc500a3196c2` | office software | biuro programinė įranga | HIGH_CONFIDENCE | exact-label:en:preferred |
| skill | `personnel-admin` | Personnel administration | `…/skill/88b406d0-72e2-4087-be19-d5992d259473` | personnel management | personalo valdymas | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `plastering` | Plastering | `…/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1` | plaster surfaces | tinkuoti paviršius | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `programming` | Programming | `…/skill/b105ec9b-0857-41d6-8d07-a83e58b73d90` | ICT system programming | informacinių ir ryšių technologijų sistemų programavimas | HIGH_CONFIDENCE | exact-label:lt:alternative ⚠ ESCO 'ICT system programming' is narrower than generic programming; verify |
| skill | `surveying` | Site surveying | `…/skill/1cca610d-2afc-44a7-97fc-f2262fb5fc75` | surveying | techniniai matavimai | HIGH_CONFIDENCE | exact-label:en:preferred ⚠ ESCO LT 'techniniai matavimai' vs our 'geodeziniai matavimai'; mild |
| skill | `tower-crane` | Tower crane operation | `…/skill/b6426791-8bca-4241-b7a8-716f1f21cec5` | operate tower crane | valdyti bokštinį kraną | HIGH_CONFIDENCE | exact-label:en:alternative; verb-template:en:preferred(operate tower crane) |
| skill | `ventilation` | Ventilation systems | `…/skill/539edd73-5c9b-4498-96f2-68a9cd2e6073` | ventilation systems | vėdinimo sistemos | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| skill | `wallpapering` | Wallpapering | `…/skill/3816bddd-0765-48d6-b972-0f9aa7296a46` | hang wallpaper | klijuoti tapetus | HIGH_CONFIDENCE | exact-label:en:alternative |
| skill | `warehouse-operations` | Warehouse operations | `…/skill/089ddb19-1c7a-43ff-ba64-070f7ce4787a` | warehouse operations | sandėliavimo veikla | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `auto_mechanic` | Car mechanic | `…/occupation/4ad4024e-d1d3-4dea-b6d1-2c7948111dce` | vehicle technician | transporto priemonių mechanikas | HIGH_CONFIDENCE | exact-label:en:alternative |
| profession | `baker` | Baker | `…/occupation/1aadb308-432a-4d01-b54b-b4f7f76dd419` | baker | kepėjas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `barber` | Barber | `…/occupation/4e0c14d6-b170-40f1-bcdc-703c0b92109b` | barber | vyrų kirpėjas | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `barista` | Barista | `…/occupation/bf7d8b16-4e2c-48ef-b44e-dc25b2d0ab61` | barista | barista | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `builder` | Builder | `…/occupation/59cc9783-7289-4e1d-b80b-93c1776f49cc` | house builder | gyvenamųjų pastatų statybininkas | HIGH_CONFIDENCE | exact-label:en:alternative; exact-label:lt:alternative ⚠ ESCO 'house builder' is narrower than our generic builder; mild |
| profession | `call_centre_agent` | Call centre agent | `…/occupation/0ededdc2-050a-4ec3-8e70-6295105fcd19` | call centre agent | skambučių centro operatorius | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `caregiver` | Caregiver | `…/occupation/d5954a2b-a525-45b7-b6d9-b62efafc6c78` | companion | patarnautojas | HIGH_CONFIDENCE | exact-label:en:alternative ⚠ ESCO 'companion' — narrower than our caregiver; verify or strike |
| profession | `carpenter` | Carpenter | `…/occupation/2a22ff9e-de3b-408d-b312-5034896cc4f4` | carpenter | dailidė | HIGH_CONFIDENCE | exact-label:en:preferred; exact-label:lt:alternative |
| profession | `concrete_worker` | Concrete worker | `…/occupation/a9068f84-cecd-4cbb-9acb-e20c714435ec` | concrete finisher | betonuotojas | HIGH_CONFIDENCE | exact-label:lt:preferred |
| profession | `cook` | Cook | `…/occupation/90f75f67-495d-49fa-ab57-2f320e251d7e` | cook | virėjas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `customer_service_specialist` | Customer service specialist | `…/occupation/9c9752b7-3e3b-4a08-8553-b63a013f8072` | customer experience manager | klientų aptarnavimo vadovas | HIGH_CONFIDENCE | exact-label:lt:alternative ⚠ ESCO 'customer experience manager' — seniority mismatch; verify |
| profession | `electrician` | Electrician | `…/occupation/4910419f-b4af-4f59-b544-9dbebc8a74f0` | electrician | elektrikas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `farm_worker` | Farm worker | `…/occupation/c9191f7f-28b5-4df8-991d-804c53009b83` | crop production worker | kultūrinių augalų ūkio darbininkas | HIGH_CONFIDENCE | exact-label:en:alternative |
| profession | `furniture_assembler` | Furniture assembler | `…/occupation/d7f3d76b-23e8-447e-93d5-da13ff9bc102` | furniture assembler | baldų surinkėjas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `hairdresser` | Hairdresser | `…/occupation/099c6bb0-22d3-4c5d-8bf5-70910af381ef` | hairdresser | kirpėjas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `handyman` | Handyman | `…/occupation/f4a25243-b06a-42a9-9c69-246853df63ad` | handyperson | namų ūkio meistras | HIGH_CONFIDENCE | exact-label:en:alternative |
| profession | `kitchen_helper` | Kitchen helper | `…/occupation/f756fdab-7726-4c48-bfcc-94ff8810fc08` | kitchen porter | pagalbinis virtuvės darbininkas | HIGH_CONFIDENCE | exact-label:lt:alternative |
| profession | `laundry_worker` | Laundry worker | `…/occupation/0da51178-e386-4534-ae71-15ba789ad756` | laundry worker | skalbyklos darbininkas | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `mason` | Mason | `…/occupation/05f321f8-055b-407d-bf19-e0ddabda56b7` | bricklayer | mūrininkas | HIGH_CONFIDENCE | exact-label:lt:preferred |
| profession | `merchandiser` | Merchandiser | `…/occupation/f1fcad3b-fdf0-444a-81b0-e50e96f8966a` | merchandiser | pirkimo specialistas | HIGH_CONFIDENCE | exact-label:en:preferred ⚠ ESCO LT label 'pirkimo specialistas' diverges from our merchandising sense; verify |
| profession | `nail_technician` | Nail technician | `…/occupation/bced9b86-d4e7-42f8-bb47-acb2001b9bd0` | manicurist | manikiūrininkas | HIGH_CONFIDENCE | exact-label:en:alternative; exact-label:lt:preferred |
| profession | `office_administrator` | Office administrator | `…/occupation/6e6839b6-099c-4802-906e-7f2c8203ee69` | office manager | biuro administratorius | HIGH_CONFIDENCE | exact-label:lt:preferred |
| profession | `plumber` | Plumber | `…/occupation/ed3cf43d-c2c1-4c46-82fc-1375e27e0290` | plumber | vandentiekininkas | HIGH_CONFIDENCE | exact-label:en:preferred; exact-label:lt:alternative |
| profession | `production_worker` | Production worker | `…/occupation/af2f3615-63ab-44dc-957d-c9660410d336` | metal products assembler | metalo gaminių surinkėjas | HIGH_CONFIDENCE | exact-label:en:alternative |
| profession | `receptionist` | Receptionist | `…/occupation/f7b04542-d8c7-42db-8475-e63b507cce82` | receptionist | priimamojo administratorius | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `roofer` | Roofer | `…/occupation/b4c6d1b0-929e-48be-9f67-47bd8c30658b` | roofer | stogdengys | EXACT | exact-label:en:preferred; exact-label:lt:preferred |
| profession | `sales_assistant` | Sales assistant | `…/occupation/9ba74e8a-c40c-4228-9998-eb3c7a5c11df` | sales assistant | pardavėjas | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `site_engineer` | Site engineer | `…/occupation/2a914d26-42aa-46b5-acf3-097d51ba4617` | construction engineer | statybos inžinierius | HIGH_CONFIDENCE | exact-label:en:alternative ⚠ ESCO 'construction engineer' — close but not identical; mild |
| profession | `site_manager` | Site Manager | `…/occupation/faed05c0-c1d1-4e34-b575-0dea96459e56` | construction manager | statybų vadovas | HIGH_CONFIDENCE | exact-label:lt:preferred |
| profession | `software_developer` | Software developer | `…/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1` | software developer | programinės įrangos kūrėjas | HIGH_CONFIDENCE | exact-label:en:preferred |
| profession | `teacher` | Teacher | `…/occupation/c593ded7-2e97-44a5-a5f3-f6115ff98233` | politics lecturer | politikos dėstytojas | HIGH_CONFIDENCE | exact-label:en:alternative ⚠ ESCO concept is 'politics lecturer' — matched via alternative label 'teacher'; almost certainly too narrow, consider striking |
| profession | `tiler` | Tiler | `…/occupation/02447817-ea01-4d8b-b09c-8bc128e447e6` | tile fitter | plytelių klojėjas | HIGH_CONFIDENCE | exact-label:en:alternative; exact-label:lt:preferred |
| profession | `translator` | Translator | `…/occupation/1a07bd7d-2e1d-4930-a84a-1a442b8f2a44` | translator | vertėjas raštu | HIGH_CONFIDENCE | exact-label:en:preferred; exact-label:lt:alternative |
| profession | `waiter` | Waiter | `…/occupation/d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471` | waiter/waitress | padavėjas | HIGH_CONFIDENCE | exact-label:en:alternative; exact-label:lt:preferred |
| profession | `warehouse_worker` | Warehouse worker | `…/occupation/bea705fe-06ac-4147-b8e0-6e8ac1208d8f` | warehouse worker | sandėlio darbininkas | HIGH_CONFIDENCE | exact-label:en:preferred; exact-label:lt:alternative |
| profession | `welder` | Welder | `…/occupation/7aedaa07-3884-4c5b-88f9-80997b2aa54b` | welder | suvirintojas | EXACT | exact-label:en:preferred; exact-label:lt:preferred |

## Table 2 — rows requiring owner judgment (NOT written by the migration unless stated)

| TYPE | SLUG | LM LABEL | WHY HERE | DETAIL | CANDIDATES |
|---|---|---|---|---|---|
| skill | `roof-tiling` | Tile roofing | AMBIGUOUS | 2 concepts matched, none via a preferred label | …/skill/4a4f3c77-6fbb-451b-b6b1-f1f247869379<br>…/skill/a1c3797a-b6b8-43d7-aed6-1686373d1a1a |
| skill | `roofing` | Roofing | AMBIGUOUS | 2 concepts matched, none via a preferred label | …/skill/4a4f3c77-6fbb-451b-b6b1-f1f247869379<br>…/skill/a1c3797a-b6b8-43d7-aed6-1686373d1a1a |
| skill | `tiling` | Tiling | AMBIGUOUS | 3 concepts matched, none via a preferred label | …/skill/4a4f3c77-6fbb-451b-b6b1-f1f247869379<br>…/skill/504d99c7-395b-479c-815b-2f77ef769e75<br>…/skill/a1c3797a-b6b8-43d7-aed6-1686373d1a1a |
| skill | `web-design` | Web design | AMBIGUOUS | hidden-label-only match | …/skill/21d2f96d-35f7-4e3f-9745-c533d2dd6e97 |
| profession | `cleaner` | Cleaner | AMBIGUOUS | 3 concepts matched, none via a preferred label | …/occupation/38eb308f-0075-451e-9c1a-c557fd173022<br>…/occupation/731ecac4-06e8-4ec2-a559-101fecbd9183<br>…/occupation/7cb71c5f-c310-481c-b46b-d0044328758c |
| profession | `driver` | Driver | AMBIGUOUS | 4 concepts matched, none via a preferred label | …/occupation/880a6cd1-2356-4994-8983-ac364763beaf<br>…/occupation/af513bd8-4340-4452-aa30-05a073ecc49a<br>…/occupation/b5b8c259-7557-4f5f-9f56-155b038946c1<br>…/occupation/e75305db-9011-4ee0-ab62-8d41a98f807e |
| profession | `event_organizer` | Event organizer | AMBIGUOUS | 4 concepts matched, none via a preferred label | …/occupation/1b38a27d-ef98-4d9f-b1b2-8c109bf47e79<br>…/occupation/21ae429f-a152-46a6-a73c-9ec65c7803f0<br>…/occupation/6662e56e-bc3d-4d9b-bed2-79d510d7c4ff<br>…/occupation/be54b8da-bc71-40f0-b150-45c5e0769375 |
| profession | `gardener` | Gardener | AMBIGUOUS | 2 concepts matched, none via a preferred label | …/occupation/55f001af-fa48-4c0c-a7e5-fc69babe3d45<br>…/occupation/a10eb17a-3c78-4f7a-a1da-8f31146339d3 |
| profession | `painter` | Painter | AMBIGUOUS | 3 concepts matched, none via a preferred label | …/occupation/15620506-fb5d-49cd-87a2-1c9047fb406a<br>…/occupation/21a33619-1959-42e6-8478-64a930f7f225<br>…/occupation/657eeac9-5bb9-449d-a353-aa7d5f47e2b5 |
| skill ×2 | `forklift-operation` + `forklift-operator` | Forklift operation / Forklift operator | MANY-TO-ONE (both HIGH) | both link ESCO \"operate forklift\" `…/skill/28cb374e-…`; INCLUDED in the 67 per artifact classification — strike one if the owner wants 1:1 | |
| skill ×2 | `blueprint-reading` + `welding-blueprint` | Blueprint reading / Welding blueprint | MANY-TO-ONE (curated suggestion only, NOT in the 67) | both would hit ESCO \"read standard blueprints\" `…/skill/68b6ef08-…` | |
| skill | `blueprint-reading` | Blueprint reading | CURATED SUGGESTION (not in the 67) | curated phrase only; welding-blueprint hits the same concept — many-to-one needs a human decision | `…/skill/68b6ef08-d823-489d-a95c-752ae6f6e6a7` (“read standard blueprints”) |
| skill | `insulation` | Thermal insulation | CURATED SUGGESTION (not in the 67) | curated phrase only — no independent exact-label corroboration | `…/skill/7eea6974-d606-4175-b95e-f66554816783` (“install insulation material”) |
| skill | `sanitary-install` | Sanitary fixture installation | CURATED SUGGESTION (not in the 67) | curated phrase only | `…/skill/ef6cb992-07d1-435b-a150-45d92228db1e` (“install sanitary equipment”) |
| skill | `welding-blueprint` | Reading welding blueprints | CURATED SUGGESTION (not in the 67) | same concept as blueprint-reading — many-to-one needs a human decision | `…/skill/68b6ef08-d823-489d-a95c-752ae6f6e6a7` (“read standard blueprints”) |

The 126 skill / 8 profession NO_MATCH rows without curated suggestions are a
separate curation queue (see the artifact) and are deliberately NOT listed here.
