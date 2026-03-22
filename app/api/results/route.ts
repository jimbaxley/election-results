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

    if (source === "2026-clean") {
      // Production zero state — always the clean (no-votes) file, env var ignored.
      const stagingPath = path.join(process.cwd(), "tests", "staging_2026_clean.json");
      text = fs.readFileSync(stagingPath, "utf-8");
      priorFile = "prior_2024.json";
    } else if (source === "2026") {
      // Preview — fetches live NCSBE feed in production; falls back to local file for dev.
      const NCSBE_URL = "https://er.ncsbe.gov/enr/20261103/data/results_0.txt";
      try {
        const ncsbeRes = await fetch(NCSBE_URL, { next: { revalidate: 60 } });
        if (!ncsbeRes.ok) throw new Error(`NCSBE responded ${ncsbeRes.status}`);
        text = await ncsbeRes.text();
      } catch {
        const stagingFile = process.env.STAGING_2026_FILE ?? "staging_2026_clean.json";
        const stagingPath = path.join(process.cwd(), "tests", stagingFile);
        text = fs.readFileSync(stagingPath, "utf-8");
      }
      priorFile = "prior_2024.json";
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