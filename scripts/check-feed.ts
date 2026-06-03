#!/usr/bin/env npx tsx
/**
 * Downloads the official NCSBE Candidate Listing CSV and compares tracked races
 * against staging_2026_clean.json, flagging name mismatches and unresolved primaries.
 *
 * Run with: npx tsx scripts/check-feed.ts
 */

import fs from "fs";
import path from "path";
import { parseRawFeed, summarizeRaces } from "../lib/parseResults";
import { FEATURED_CANDIDATES } from "../lib/featuredCandidates";
import {
  GENERAL_ELECTION_DATE,
  CandidateContestLookup,
  buildCandidateContestLookup,
  isGeneralElectionRow,
  normalizeContestName,
  parseCandidateCSV,
} from "../lib/candidateCsv";

const CSV_URL =
  "https://s3.amazonaws.com/dl.ncsbe.gov/Elections/2026/Candidate%20Filing/Candidate_Listing_2026.csv";
const LOCAL_CSV = path.join(process.cwd(), "tests", "Candidate_Listing_2026.csv");
const STAGING_FILE = path.join(process.cwd(), "tests", "staging_2026_clean.json");

async function main() {
  // ── Fetch or load CSV ───────────────────────────────────────────────────────
  let csvText: string;
  let csvSource: string;
  try {
    console.log(`\nFetching ${CSV_URL} ...`);
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvText = await res.text();
    csvSource = "live (S3)";
  } catch (err) {
    if (!fs.existsSync(LOCAL_CSV)) {
      console.error(`Could not fetch CSV and no local fallback found at ${LOCAL_CSV}`);
      process.exit(1);
    }
    csvText = fs.readFileSync(LOCAL_CSV, "utf-8");
    csvSource = "local fallback";
    console.log(`\nFetch failed (${err}), using local file.`);
  }

  const rows = parseCandidateCSV(csvText);
  const generalRows = rows.filter(isGeneralElectionRow);
  console.log(
    `CSV rows: ${rows.length}  general ${GENERAL_ELECTION_DATE}: ${generalRows.length}  source: ${csvSource}  (${new Date().toLocaleTimeString()})\n`,
  );

  // ── Build CSV lookup: normalized contest -> { party -> Set<name_on_ballot> }
  const csvByContest = toSetLookup(buildCandidateContestLookup(rows));

  // ── Load staging file ───────────────────────────────────────────────────────
  const stagingRecords = parseRawFeed(fs.readFileSync(STAGING_FILE, "utf-8"));
  const stagingRaces = summarizeRaces(stagingRecords);

  // Build GID → race map
  const raceByGid = Object.fromEntries(stagingRaces.map((r) => [r.gid, r]));

  // ── Build list of races to check ─────────────────────────────────────────────
  // Only candidates with a GID assigned can be checked against staging
  const trackedGids = FEATURED_CANDIDATES.filter((c) => c.gid).map((c) => c.gid!);

  console.log("─".repeat(72));

  let diffCount = 0;

  // ── Check Team Up NC races ────────────────────────────────────────────────
  console.log("\n TEAM UP NC TRACKED RACES\n");

  for (const gid of trackedGids) {
    const race = raceByGid[gid];
    if (!race) {
      console.log(`  ⚠  GID ${gid} — not found in staging file`);
      diffCount++;
      continue;
    }

    const key = normalizeContestName(race.cnm);
    const csvContest = csvByContest[key];
    console.log(`${race.cnm} (GID ${gid})`);

    if (!csvContest) {
      console.log(`  ⚠  Contest "${key}" not found in CSV — district number may differ\n`);
      diffCount++;
      continue;
    }

    for (const c of race.candidates) {
      checkCandidate(c.name, c.party, csvContest);
    }
    console.log();
  }

  // ── Check judicial races ──────────────────────────────────────────────────
  console.log("─".repeat(72));
  console.log("\n JUDICIAL RACES\n");

  // Find SC seat from staging (all judicial races use ogl === "JUD")
  const scRace = stagingRaces.find((r) => r.ogl === "JUD" && r.cnm.includes("SUPREME COURT"));
  const coaRaces = stagingRaces.filter((r) => r.ogl === "JUD" && r.cnm.includes("COURT OF APPEALS"));

  if (scRace) {
    const key = normalizeContestName(scRace.cnm);
    const csvContest = csvByContest[key] ?? findJudicialContest(csvByContest, "SUPREME COURT");
    console.log(`${scRace.cnm} (GID ${scRace.gid})`);
    if (!csvContest) {
      console.log("  ⚠  No matching Supreme Court contest found in CSV\n");
      diffCount++;
    } else {
      for (const c of scRace.candidates) checkCandidate(c.name, c.party, csvContest);
      console.log();
    }
  }

  for (const coaRace of coaRaces) {
    const key = normalizeContestName(coaRace.cnm);
    const csvContest = csvByContest[key] ?? findJudicialContest(csvByContest, key);
    console.log(`${coaRace.cnm} (GID ${coaRace.gid})`);
    if (!csvContest) {
      console.log(`  ⚠  No matching CoA contest found in CSV for "${key}"\n`);
      diffCount++;
    } else {
      for (const c of coaRace.candidates) checkCandidate(c.name, c.party, csvContest);
      console.log();
    }
  }

  console.log("─".repeat(72));
  if (diffCount === 0) {
    console.log("\n✓  All tracked candidates verified against official CSV.\n");
  } else {
    console.log(`\n⚠  ${diffCount} issue(s) found — review staging files.\n`);
  }

  // ── Helper ────────────────────────────────────────────────────────────────
  function checkCandidate(
    stagingName: string,
    party: string,
    csvContest: Record<string, Set<string>>,
  ) {
    const partyNames = csvContest[party] ?? new Set<string>();
    const exactMatch = partyNames.has(stagingName);
    const multipleInParty = partyNames.size > 1;

    let status: string;
    if (exactMatch && !multipleInParty) {
      status = "✓  matches CSV";
    } else if (exactMatch && multipleInParty) {
      const others = [...partyNames].filter((n) => n !== stagingName).join(", ");
      status = `✓  in CSV — but PRIMARY unresolved (also filed: ${others})`;
      diffCount++;
    } else if (!exactMatch && partyNames.size > 0) {
      const csvNames = [...partyNames].join(", ");
      status = `✗  NOT IN CSV — CSV has: ${csvNames}`;
      diffCount++;
    } else {
      status = `⚠  no ${party} candidate found in CSV for this contest`;
      diffCount++;
    }

    console.log(`  ${party.padEnd(5)} ${stagingName.padEnd(32)} ${status}`);
  }
}

function findJudicialContest(
  csvByContest: CandidateContestLookup<Set<string>>,
  keyword: string,
): Record<string, Set<string>> | null {
  const key = Object.keys(csvByContest).find((k) => k.includes(keyword.toUpperCase()));
  return key ? csvByContest[key] : null;
}

function toSetLookup(
  lookup: CandidateContestLookup<string[]>,
): CandidateContestLookup<Set<string>> {
  return Object.fromEntries(
    Object.entries(lookup).map(([contest, parties]) => [
      contest,
      Object.fromEntries(
        Object.entries(parties).map(([party, names]) => [party, new Set(names)]),
      ),
    ]),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
