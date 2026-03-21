import fs from "fs";
import path from "path";
import {
  isTrackedCandidateRace,
  parseRawFeed,
  summarizeRaces,
} from "../../../lib/parseResults";
import { buildPriorLookup } from "../../../lib/priorResults";

export const revalidate = 60;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "2024";

  try {
    let text: string;
    let priorFile: string;

    if (source === "2026") {
      // Mock 2026 preview data.
      // Default to the clean (no-votes) file for production.
      // Set STAGING_2026_FILE=staging_2026.json locally to test early-return data.
      const stagingFile = process.env.STAGING_2026_FILE ?? "staging_2026_clean.json";
      const stagingPath = path.join(process.cwd(), "tests", stagingFile);
      text = fs.readFileSync(stagingPath, "utf-8");
      priorFile = "prior_2024.json"; // compare 2026 against 2024 results
    } else {
      // 2024 final results — always read from local static file
      const resultsPath = path.join(process.cwd(), "tests", "prior_2024.json");
      text = fs.readFileSync(resultsPath, "utf-8");
      priorFile = "prior_2022.json"; // compare 2024 against 2022 results
    }

    const raw = parseRawFeed(text);
    const tracked = raw.filter(isTrackedCandidateRace);
    const races = summarizeRaces(tracked);

    // Load prior-election data for hold/flip context.
    const priorPath = path.join(process.cwd(), "tests", priorFile);
    const priorText = fs.readFileSync(priorPath, "utf-8");
    const priorRaw = parseRawFeed(priorText);
    const priorTracked = priorRaw.filter(isTrackedCandidateRace);
    const priorRaces = summarizeRaces(priorTracked);
    const priorSeats = buildPriorLookup(priorRaces);

    return Response.json({ races, priorSeats, updatedAt: new Date().toISOString(), source });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to parse results",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}