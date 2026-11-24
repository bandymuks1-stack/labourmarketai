# Entity Role and Data Access Matrix — v1 (2026-07-11)

Canonical mapping of every activity to its legal entity, its data role and
its access scope. Source facts: corporate-identity-source-of-truth-v1.md;
technical enforcement: the consent-and-disclosure v1 system (fail-closed
RLS, append-only ledgers).

| Activity | Contract party | Invoice issuer | Revenue recipient | Data controller | Data processor | IP owner | System admin | Access scope | Legal document |
|---|---|---|---|---|---|---|---|---|---|
| Customer sales (companies, agencies, workers' paid services) | UAB „Nonstop Group“ | UAB „Nonstop Group“ | UAB „Nonstop Group“ | UAB „Nonstop Group“ | — (Supabase/Vercel as technical processors) | Labour Market AI Sp. z o.o. (platform IP) | UAB operator (superadmin) | full commercial records | Terms of Service (UAB as party) |
| Customer invoicing + accounting | UAB „Nonstop Group“ | UAB „Nonstop Group“ | UAB „Nonstop Group“ | UAB „Nonstop Group“ | accounting software providers (processors) | — | UAB accounting | invoices, ledgers | LT accounting law obligations |
| User profiles and CVs | UAB „Nonstop Group“ (platform account terms) | — | — | **UAB „Nonstop Group“ as controller** | Supabase (hosting processor) | — | UAB operator | RLS-scoped; consent-gated for employer visibility | Privacy Policy + consent ledger |
| Consent ledger (privacy_consent_events) | — | — | — | **UAB „Nonstop Group“ as controller** | Supabase | — | none (append-only even for admin) | worker sees own; operator sees aggregate state via RPC | consent-and-disclosure-design-v1 |
| Disclosure ledger (personal_data_disclosures) | — | — | — | UAB „Nonstop Group“ | Supabase | — | operator records via gated RPC | admin + the worker | same |
| Company-need intakes | UAB „Nonstop Group“ | — | — | UAB „Nonstop Group“ | Supabase | — | UAB operator | service-role read behind superadmin gate | Privacy Policy |
| Platform hosting / deployment | — | Vercel/Supabase invoice the operator side | — | UAB „Nonstop Group“ (controller) | **Vercel, Supabase (processors)** | — | owner ops | infra dashboards | subprocessor-register-v1 |
| **Polish IP company: any platform activity** | — | — | — | **NOT a controller** | **NOT a processor** | Labour Market AI Sp. z o.o. | **none** | **No routine personal-data access** (no production DB, CV, contact or document access; no service-role key) | intercompany licence §5 |
| Intercompany licence fee | Labour Market AI Sp. z o.o. ↔ UAB „Nonstop Group“ | **Labour Market AI Sp. z o.o. → UAB „Nonstop Group“** | Labour Market AI Sp. z o.o. | n/a (statement contains no personal data) | — | Labour Market AI Sp. z o.o. | — | monthly calculation statement only | intercompany-ip-licence-agreement-v1 + accounting schedule |
| IP improvements development | commissioned by UAB (operator) per licence §4 | — | — | — | — | assigned to Labour Market AI Sp. z o.o. per §4 (written form required) | — | code repo | licence §4 + ip-assignment draft |

Hard invariants (guard-enforced in the app where public text is involved):
the Polish company never appears as seller/operator/contracting party or
controller; it holds no Supabase role, no service key, no admin account.
If that ever needs to change, the licence §5 gate applies first (GDPR role
determination, Art. 28 DPA, least privilege, access audit, privacy-policy
update, security assessment).
