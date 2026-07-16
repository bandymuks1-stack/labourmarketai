# verification-model — Verifikacijos modelis

Įgūdis nėra savideklaracija ir nėra pirktas reitingas. Kelias nuo deklaravimo
iki patvirtinimo yra append-only ir auditojamas. AI niekada nepatvirtina
žmogaus vardu — patvirtina vadovas.

```mermaid
flowchart LR
    A["Deklaruota<br/>(žmogaus įrašas)"] --> B["Darbo dienoraštis<br/>(realios veiklos įrodymai)"]
    B --> C{"Vadovo patvirtinimas"}
    C -- "patvirtina" --> D["✓ Verifikuota"]
    C -- "atmeta / grąžina" --> B
    D --> E["Įrašoma į gyvą CV"]

    subgraph AUDIT["Append-only auditas"]
        F["Istorija neperrašoma"]
    end

    A -. "įrašas" .-> AUDIT
    B -. "įrašas" .-> AUDIT
    C -. "įrašas" .-> AUDIT
    D -. "įrašas" .-> AUDIT
```
