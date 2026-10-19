import fs from "fs";
import path from "path";
import {
  isTrackedCandidateRace,
  parseRawFeed,
  summarizeRaces,
  type RawRecord,
} from "../../../lib/parseResults";
import { buildPriorLookup } from "../../../lib/priorResults";
import { federalCandidateRecords2026 } from "../../../lib/federalCandidates2026";
import { fetchLiveResults, liveResultsEnabled, type FeedStatus } from "../../../lib/liveResults";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "2024";

  try {
    let text: string;
    let priorFile: string;
    let feedStatus: FeedStatus = "scheduled";
    let feedNotice = "";
    let liveRecords: RawRecord[] | undefined;

    if (source === "2026-clean") {
      // Keep the complete zero-vote slate until the scheduled switch, or while
      // the official feed is unavailable. Never replace live federal vote totals.
      const stagingPath = path.join(process.cwd(), "tests", "staging_2026_clean.json");
      text = fs.readFileSync(stagingPath, "utf-8");
      priorFile = "prior_2024.json";
      if (liveResultsEnabled()) {
        try {
          liveRecords = await fetchLiveResults();
          feedStatus = "live";
        } catch (error) {
          console.error("NCSBE live results unavailable:", error);
          feedStatus = "unavailable";
          feedNotice = "NCSBE results are unavailable. Showing the last loaded results; retrying every 60 seconds.";
        }
      }
    } else if (source === "2026") {
      // Preview — reads staging_2026.json (must be committed); env var overrides for local dev.
      const stagingFile = process.env.STAGING_2026_FILE ?? "staging_2026.json";
      const stagingPath = path.join(process.cwd(), "tests", stagingFile);
      text = fs.readFileSync(stagingPath, "utf-8");
      priorFile = "prior_2024.json";
    } else {
      // 2024 final results — always read from local static file
      const resultsPath = path.join(process.cwd(), "tests", "prior_2024.json");
      text = fs.readFileSync(resultsPath, "utf-8");
      priorFile = "prior_2022.json"; // compare 2024 against 2022 results
    }

    let raw = liveRecords ?? parseRawFeed(text);
    if (!liveRecords && (source === "2026" || source === "2026-clean")) {
      // The simulated export was created before the general-election slate was
      // complete. Replace its partial federal rows with the verified full slate.
      raw = [
        ...raw.filter((record) => record.ogl !== "FED"),
        ...federalCandidateRecords2026(),
      ];
    }
    const tracked = raw.filter(isTrackedCandidateRace);
    const races = summarizeRaces(tracked);

    // Load prior-election data for hold/flip context.
    const priorPath = path.join(process.cwd(), "tests", priorFile);
    const priorText = fs.readFileSync(priorPath, "utf-8");
    const priorRaw = parseRawFeed(priorText);
    const priorTracked = priorRaw.filter(isTrackedCandidateRace);
    const priorRaces = summarizeRaces(priorTracked);
    const priorSeats = buildPriorLookup(priorRaces);

    return Response.json({
      races, priorSeats, source, feedStatus, feedNotice,
      updatedAt: source === "2026-clean" && feedStatus !== "live" ? null : new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to parse results",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
