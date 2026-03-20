import fs from "fs";
import path from "path";
import {
  isTrackedCandidateRace,
  parseRawFeed,
  summarizeRaces,
} from "../../../lib/parseResults";
import { buildPriorLookup } from "../../../lib/priorResults";

export const revalidate = 60;

const NCSBE_URL = "https://er.ncsbe.gov/enr/20241105/data/results_0.txt";

// Swap this filename to "prior_2024.json" when running for the 2026 election.
const PRIOR_FILE = process.env.PRIOR_FILE ?? "prior_2022.json";

export async function GET(): Promise<Response> {
  try {
    let text: string;

    if (process.env.USE_SAMPLE === "true") {
      const samplePath = path.join(process.cwd(), "tests", "prior_2024.json");
      text = fs.readFileSync(samplePath, "utf-8");
    } else {
      const res = await fetch(NCSBE_URL);
      if (!res.ok) {
        return Response.json(
          { error: "Failed to fetch NCSBE results", status: res.status },
          { status: 502 },
        );
      }
      text = await res.text();
    }

    const raw = parseRawFeed(text);
    const tracked = raw.filter(isTrackedCandidateRace);
    const races = summarizeRaces(tracked);

    // Load prior-election data for hold/flip context.
    const priorPath = path.join(process.cwd(), "tests", PRIOR_FILE);
    const priorText = fs.readFileSync(priorPath, "utf-8");
    const priorRaw = parseRawFeed(priorText);
    const priorTracked = priorRaw.filter(isTrackedCandidateRace);
    const priorRaces = summarizeRaces(priorTracked);
    const priorSeats = buildPriorLookup(priorRaces);

    return Response.json({ races, priorSeats, updatedAt: new Date().toISOString() });
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