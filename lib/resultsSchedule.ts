export const FEED_REFRESH_SECONDS = 86_400;

// November 30 begins at midnight Eastern, after daylight saving time ends.
export const RESULTS_FREEZE_AT = Date.parse("2026-11-30T00:00:00-05:00");

export function resultsAreFrozen(now = Date.now()): boolean {
  return now >= RESULTS_FREEZE_AT;
}
