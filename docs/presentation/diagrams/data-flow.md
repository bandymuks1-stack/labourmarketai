# data-flow — Duomenų srautas su sutikimo vartais ir PII riba

Žmogus fiksuoja veiklą; vadovas patvirtina; CV atsinaujina realiu laiku;
darbdavys mato paaiškintą atitikimą. Kontaktai atskleidžiami tik po atskiro
auditojamo sutikimo (priėmimas ≠ atskleidimas). PII niekada nepatenka į
analitiką (PII = 0).

```mermaid
sequenceDiagram
    participant Z as Žmogus
    participant V as Vadovas
    participant CV as Gyvas CV
    participant D as Darbdavys
    participant P as Ne-PII analitika

    Z->>CV: Fiksuoja darbo įrodymą (dienoraštis)
    Z->>V: Pateikia patvirtinti
    V-->>CV: ✓ Patvirtina įgūdį (append-only)
    Note over CV: CV atnaujinamas realiu laiku
    D->>CV: Peržiūri anoniminę kortelę
    CV-->>D: Paaiškintas atitikimas (priežastys, be kontaktų)
    Note over D,CV: Sutikimo vartai — priėmimas ≠ atskleidimas
    D->>Z: Prašo kontakto (užklausa)
    Z-->>D: Atskiras auditojamas sutikimas → kontaktas atskleidžiamas
    CV--)P: Tik ne-PII signalai (PII = 0)
```
