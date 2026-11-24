import { unstable_cache } from "next/cache";
import { fetchLiveResults, RESULTS_FEED_URL } from "./liveResults";
import { FEED_REFRESH_SECONDS } from "./resultsSchedule";

const easternDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

const resultsForDay = unstable_cache(
  // A fresh key at midnight Eastern avoids serving the previous day's cache.
  async (_day: string) => ({
    records: await fetchLiveResults(),
    fetchedAt: new Date().toISOString(),
  }),
  ["ncsbe-daily-results", RESULTS_FEED_URL],
  { revalidate: FEED_REFRESH_SECONDS },
);

export function fetchCachedLiveResults() {
  return resultsForDay(easternDate.format(Date.now()));
}
