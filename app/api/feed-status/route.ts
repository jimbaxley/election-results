import fs from "fs";
import path from "path";
import { parseRawFeed, summarizeRaces } from "../../../lib/parseResults";
import { FEATURED_CANDIDATES } from "../../../lib/featuredCandidates";
import {
  GENERAL_ELECTION_DATE,
  buildCandidateContestLookup,
  normalizeContestName,
  parseCandidateCSV,
} from "../../../lib/candidateCsv";

export const revalidate = 0;

const FEED_URL = "https://er.ncsbe.gov/enr/20261103/data/results_0.txt";
const CSV_URL =
  "https://s3.amazonaws.com/dl.ncsbe.gov/Elections/2026/Candidate%20Filing/Candidate_Listing_2026.csv";

export type CandidateCheck = {
  name: string;
  party: string;
  status: "match" | "primary_unresolved" | "name_mismatch" | "missing";
  csvNames: string[];
};

export type RaceCheck = {
  gid: string;
  cnm: string;
  section: "legislative" | "judicial";
  primaryResolved: boolean;
  candidates: CandidateCheck[];
};

export type FeedStatusResponse = {
  feedLive: boolean;
  feedHttpStatus: string;
  csvError: string;
  candidateDataCurrent: boolean;
  csvElectionDate: string;
  races: RaceCheck[];
  allClear: boolean;
  checkedAt: string;
};

export async function GET(): Promise<Response> {
  // ── 1. Check NCSBE live feed ──────────────────────────────────────────────
  let feedLive = false;
  let feedHttpStatus = "";
  try {
    const res = await fetch(FEED_URL, { method: "HEAD", cache: "no-store" });
    feedLive = res.ok;
    feedHttpStatus = `HTTP ${res.status}`;
  } catch {
    feedHttpStatus = "Network error";
  }

  // ── 2. Fetch candidate CSV ────────────────────────────────────────────────
  let csvRows: Record<string, string>[] = [];
  let csvError = "";
  try {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (res.ok) {
      csvRows = parseCandidateCSV(await res.text());
    } else {
      csvError = `HTTP ${res.status}`;
    }
  } catch {
    csvError = "Network error";
  }

  // Build CSV lookup from general-election rows only: contest -> party -> names.
  const csvByContest = buildCandidateContestLookup(csvRows);

  // ── 3. Load staging file ──────────────────────────────────────────────────
  const stagingPath = path.join(process.cwd(), "tests", "staging_2026_clean.json");
  const stagingRecords = parseRawFeed(fs.readFileSync(stagingPath, "utf-8"));
  const stagingRaces = summarizeRaces(stagingRecords);
  const raceByGid = Object.fromEntries(stagingRaces.map((r) => [r.gid, r]));

  // ── 4. Check featured legislative races ──────────────────────────────────
  const races: RaceCheck[] = [];

  for (const fc of FEATURED_CANDIDATES.filter((c) => c.gid)) {
    const gid = fc.gid!;
    const race = raceByGid[gid];
    if (!race) continue;

    const key = normalizeContestName(race.cnm);
    const csvContest = csvByContest[key];

    const candidates: CandidateCheck[] = race.candidates.map((c) => {
      const partyNames = csvContest?.[c.party] ?? [];
      const exactMatch = partyNames.includes(c.name);
      let status: CandidateCheck["status"];
      if (!csvContest || partyNames.length === 0) status = "missing";
      else if (exactMatch && partyNames.length === 1) status = "match";
      else if (exactMatch && partyNames.length > 1) status = "primary_unresolved";
      else status = "name_mismatch";
      return { name: c.name, party: c.party, status, csvNames: partyNames };
    });

    races.push({
      gid,
      cnm: race.cnm,
      section: "legislative",
      primaryResolved: candidates.every((c) => c.status === "match"),
      candidates,
    });
  }

  // ── 5. Check judicial races ───────────────────────────────────────────────
  const judicialRaces = stagingRaces.filter((r) => r.ogl === "JUD");
  for (const race of judicialRaces) {
    const key = normalizeContestName(race.cnm);
    const csvContest = csvByContest[key];

    const candidates: CandidateCheck[] = race.candidates.map((c) => {
      const partyNames = csvContest?.[c.party] ?? [];
      const exactMatch = partyNames.includes(c.name);
      let status: CandidateCheck["status"];
      if (!csvContest || partyNames.length === 0) status = "missing";
      else if (exactMatch && partyNames.length === 1) status = "match";
      else if (exactMatch && partyNames.length > 1) status = "primary_unresolved";
      else status = "name_mismatch";
      return { name: c.name, party: c.party, status, csvNames: partyNames };
    });

    races.push({
      gid: race.gid,
      cnm: race.cnm,
      section: "judicial",
      primaryResolved: candidates.every((c) => c.status === "match"),
      candidates,
    });
  }

  const candidateDataCurrent = !csvError && races.every((r) => r.primaryResolved);
  const allClear = candidateDataCurrent && feedLive;

  return Response.json({
    feedLive,
    feedHttpStatus,
    csvError,
    candidateDataCurrent,
    csvElectionDate: GENERAL_ELECTION_DATE,
    races,
    allClear,
    checkedAt: new Date().toISOString(),
  } satisfies FeedStatusResponse);
}
