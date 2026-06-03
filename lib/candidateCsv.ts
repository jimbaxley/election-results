export const GENERAL_ELECTION_DATE = "11/03/2026";

export type CandidateCsvRow = Record<string, string>;
export type CandidateContestLookup<TNames> = Record<string, Record<string, TNames>>;

export function parseCandidateCSV(text: string): CandidateCsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = [...lines[0].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return lines.slice(1).map((line) => {
    const vals = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

export function normalizeContestName(s: string): string {
  return s
    .replace(/\s*\(VOTE FOR \d+\)/i, "")
    .replace(/DISTRICT\s+0*(\d+)/gi, "DISTRICT $1")
    .trim()
    .toUpperCase();
}

export function isGeneralElectionRow(row: CandidateCsvRow): boolean {
  return row.election_dt === GENERAL_ELECTION_DATE;
}

export function buildCandidateContestLookup(
  rows: CandidateCsvRow[],
): CandidateContestLookup<string[]> {
  const csvByContest: CandidateContestLookup<string[]> = {};

  for (const row of rows.filter(isGeneralElectionRow)) {
    const key = normalizeContestName(row.contest_name);
    if (!csvByContest[key]) csvByContest[key] = {};
    const party = row.party_candidate;
    if (!csvByContest[key][party]) csvByContest[key][party] = [];
    if (!csvByContest[key][party].includes(row.name_on_ballot)) {
      csvByContest[key][party].push(row.name_on_ballot);
    }
  }

  return csvByContest;
}
