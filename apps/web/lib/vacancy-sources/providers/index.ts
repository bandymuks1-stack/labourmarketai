/**
 * PROVIDER PARSER DISPATCH — the one lookup that keeps the importer
 * provider-agnostic.
 *
 * The importer never imports a country module directly; it asks for the
 * parser belonging to a descriptor. Adding a country is therefore: one parser
 * file, one line here, one registry entry, one governance row. Nothing in the
 * shared pipeline changes, and the boundary guard pins that no provider key
 * is hard-coded outside these files.
 *
 * Pure module: no IO, no env, no fetch.
 */
import type { VacancyProviderKey } from "../vacancy-contract";
import {
  parseArbetsformedlingenBatch,
  type ArbetsformedlingenParseRequest,
  type ArbetsformedlingenParseResult,
} from "./arbetsformedlingen-parse";

/** Every provider parser has the same shape: one response body → outcomes. */
export type VacancyBatchParser = (
  req: ArbetsformedlingenParseRequest,
) => ArbetsformedlingenParseResult;

export type VacancyParseRequest = ArbetsformedlingenParseRequest;
export type VacancyParseResult = ArbetsformedlingenParseResult;
export type VacancyParseOutcome = VacancyParseResult["outcomes"][number];

const PARSERS: Readonly<Record<VacancyProviderKey, VacancyBatchParser>> = {
  arbetsformedlingen: parseArbetsformedlingenBatch,
};

/** The parser for a provider key, or null when the key is unknown. */
export function getVacancyParser(key: string): VacancyBatchParser | null {
  return (PARSERS as Record<string, VacancyBatchParser>)[key] ?? null;
}

export { parseArbetsformedlingenBatch };
