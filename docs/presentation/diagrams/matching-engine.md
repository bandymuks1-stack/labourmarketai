# matching-engine — Paaiškinamas atitikimo variklis

Deterministinis variklis. Jokio „juodos dėžės" balo, jokių diskriminacinių
laukų. Kiekviena pakopa rodo priežastis ir trūkstamus faktus, todėl rezultatas
yra paaiškintas.

```mermaid
flowchart TB
    START["Poreikis + kandidatas / komanda"] --> T

    subgraph T["Atitikimo pakopos"]
        T1["Privaloma<br/>(būtini reikalavimai)"]
        T2["Pageidautina<br/>(privalumai)"]
        T3["Nežinoma<br/>(trūksta fakto)"]
        T4["Konfliktas<br/>(prieštaravimas)"]
    end

    T1 --> R["Priežastys + trūkstami faktai"]
    T2 --> R
    T3 --> R
    T4 --> R

    R --> OUT["Paaiškintas rezultatas<br/>(kodėl tinka / ko trūksta)"]
    OUT -. "ne balas, o pagrindimas" .-> OUT
```
