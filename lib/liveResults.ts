import { isTrackedCandidateRace, parseRawFeed, type RawRecord } from "./parseResults";

// November 1 is still daylight saving time in North Carolina.
export const LIVE_START = "2026-11-01T00:00:00-04:00";
export const RESULTS_FEED_URL = "https://er.ncsbe.gov/enr/20261103/data/results_0.txt";
export type FeedStatus = "scheduled" | "live" | "unavailable";

export function liveResultsEnabled(now = new Date()): boolean {
  return now.getTime() >= Date.parse(LIVE_START);
}

export async function fetchLiveResults(fetcher: typeof fetch = fetch): Promise<RawRecord[]> {
  const response = await fetcher(RESULTS_FEED_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`NCSBE returned HTTP ${response.status}`);
  const records = parseRawFeed(await response.text());
  if (!Array.isArray(records) || records.length === 0) throw new Error("NCSBE feed is empty");
  const tracked = records.filter(isTrackedCandidateRace);
  if (tracked.length === 0 || tracked.some((record) =>
    !record.gid || !record.cnm || !record.bnm || typeof record.pty !== "string" ||
    [record.vct, record.pct, record.prt, record.ptl].some((value) =>
      value === undefined || value === null || String(value).trim() === "" ||
      !Number.isFinite(Number(value)) || Number(value) < 0,
    ),
  )) throw new Error("NCSBE feed has invalid or missing race data");
  return records;
}
