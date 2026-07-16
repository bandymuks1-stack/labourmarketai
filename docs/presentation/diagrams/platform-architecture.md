# platform-architecture — Branduolio architektūros sluoksniai

Sektoriams neutrali sluoksniuota architektūra. Tas pats branduolys tinka
bet kuriam sektoriui (statyba yra tik pirmas pilotinis vertikalas).

```mermaid
flowchart TB
    subgraph L1["Žmonių sluoksnis"]
        A1["Žmonės ir profiliai"]
        A2["Įgūdžiai"]
        A3["Darbo įrodymai"]
        A4["Dokumentai"]
        A5["Prieinamumas"]
    end

    subgraph L2["Poreikių sluoksnis"]
        B1["Įmonių poreikiai"]
        B2["Projektai"]
        B3["Komandos ir brigados"]
    end

    subgraph L3["Sprendimų sluoksnis"]
        C1["Atitikimas (Matching)"]
        C2["Komunikacija"]
        C3["AI sprendimų pagalba"]
    end

    subgraph L4["Pasitikėjimo pamatas"]
        D1["Auditas (append-only)"]
    end

    L1 --> C1
    L2 --> C1
    C1 --> C2
    C1 --> C3
    C3 -. "žmogus visada patvirtina" .-> C1
    L1 --- D1
    L2 --- D1
    L3 --- D1
```
