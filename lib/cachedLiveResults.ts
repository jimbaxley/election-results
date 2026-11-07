import { unstable_cache } from "next/cache";
import { fetchLiveResults, RESULTS_FEED_URL } from "./liveResults";

export const FEED_REFRESH_SECONDS = 3_600;

const resultsForHour = unstable_cache(
  // The hour is part of Next's cache key. A new hour gets a fresh fetch rather
  // than returning stale data for another full page polling interval.
  async (_hour: number) => ({
    records: await fetchLiveResults(),
    fetchedAt: new Date().toISOString(),
  }),
  ["ncsbe-hourly-results", RESULTS_FEED_URL],
  { revalidate: FEED_REFRESH_SECONDS },
);

export function fetchCachedLiveResults() {
  return resultsForHour(Math.floor(Date.now() / (FEED_REFRESH_SECONDS * 1_000)));
}
