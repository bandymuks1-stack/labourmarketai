# pilot-funnel — Piloto piltuvas

Kontroliuojamo realių vartotojų piloto kelias (2–5 vartotojai). Kiekvienas
žingsnis matuojamas ne-PII analitika (onboarding įvykiai, konversijos piltuvas,
laikas-iki-vertės).

```mermaid
flowchart TB
    A["Kvietimas"] --> B["Onboarding"]
    B --> C["Aktyvacija"]
    C --> D["Pirma vertė"]
    D --> E["Rezultatas<br/>(išmatuotas — case study)"]
```
