import type { RaceSummary } from "./parseResults";

// A seat won by >= this margin in the prior election is considered "safe"
// and won't appear in the battleground section unless currently close.
export const COMPETITIVE_THRESHOLD = 0.04;

export type PriorSeat = {
  winnerParty: string;
  /** Decimal margin of victory (e.g. 0.032). null = uncontested. */
  margin: number | null;
};

/**
 * Build a lookup from contest name → prior election result.
 * Key is the raw cnm string (e.g. "NC HOUSE OF REPRESENTATIVES DISTRICT 007 (VOTE FOR 1)").
 * This matches directly against RaceSummary.cnm without any normalization.
 */
export function buildPriorLookup(
  races: RaceSummary[],
): Record<string, PriorSeat> {
  const lookup: Record<string, PriorSeat> = {};
  for (const race of races) {
    const winner = race.candidates[0];
    if (!winner) continue;
    lookup[race.cnm] = {
      winnerParty: winner.party,
      margin: race.margin,
    };
  }
  return lookup;
}
