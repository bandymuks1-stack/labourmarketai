# 0033 — Direct counterparty and responsibility chain (binding, owner rule 2026-11-19)

**Status:** binding, permanent architectural principle. It applies to LabourMarket.ai, Agentai OS
and every related project.

## Scope

The rule covers every party, not only agencies:

- employers;
- workers;
- staffing agencies;
- contractors and subcontractors;
- suppliers;
- service providers;
- any other partner in a chain.

## Rule

1. **Direct contact.** A client communicates and works only with its own direct service or contract
   partner.
2. **Data subordination.** Each party sees only the data its own relationships and functions need.
3. **Responsibility chain.** Each party answers to its own direct client for its own obligations and
   for the partners it brings in. Bringing in a partner does not by itself remove that
   responsibility. Each party in the chain also answers for its own actions and for the data it
   provided.
4. **Confidentiality.** The identity and the commercial relationships of other chain participants
   are not disclosed, except where the law requires it.
5. **Traceability.** The whole chain is kept for internal audit, under access rights. The chain
   records:
   - who the parties are and what role each one had;
   - what each party did, for example sourced the candidate, checked qualifications or documents,
     acted as an intermediary, or presented to the client;
   - where each party's data came from.

## Consequence for a chain

The party the client sees is its direct partner. That partner is responsible to the client for what
it presents, including results that came through partners further down the chain. The client is
never left unable to see the party that answers to it.

Example: a client's agency passes a need to a partner agency. The client sees and deals with its own
agency, which answers to the client for the candidate. The partner agency stays hidden from the
client and answers to the client's agency. Both steps stay in the internal audit.

## What this is not

- It is not a mandate to build new features or rework existing systems. A change made under this
  rule needs a concrete need and the owner's permission.
- It does not change any legal, consent or contract text by itself. Contract terms that define the
  responsibilities and their limits are drafted for the owner and checked with a lawyer through
  their own process.

## Review criterion

When a change touches a relationship between two or more parties, the review checks:

- what each party sees;
- who answers to whom;
- that the chain is kept for audit;
- that no other participant's identity or commercial terms leak to a party with no need for them.
  The leak paths to check include the interface, APIs, notifications, e-mails, exports, and chat or
  MCP answers.

First application: register 4.30, agency-to-agency cooperation (#3353).
