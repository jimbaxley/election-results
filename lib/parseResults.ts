export type RawRecord = {
  gid: string;
  cnm: string;
  bnm: string;
  pty: string;
  vct: string | number;
  pct: string | number;
  prt: string | number;
  ptl: string | number;
  ogl: string;
  ref: string;
};

export type CandidateSummary = {
  name: string;
  party: string;
  votes: number;
  pct: number;
};

export type RaceSummary = {
  gid: string;
  cnm: string;
  ogl: string;
  precincts: {
    reporting: number;
    total: number;
    pct: number;
  };
  totalVotes: number;
  margin: number | null;
  called: boolean;
  candidates: CandidateSummary[];
};

export function parseRawFeed(text: string): RawRecord[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as RawRecord[];
  }

  const fixed = `[${trimmed.replace(/\}\{/g, "},{")}]`;
  return JSON.parse(fixed) as RawRecord[];
}

export function isTrackedCandidateRace(record: RawRecord): boolean {
  return (
    (record.ogl === "NCS" || record.ogl === "NCH" || record.ogl === "SPC") &&
    record.ref === "0"
  );
}

export function summarizeRaces(records: RawRecord[]): RaceSummary[] {
  const byGid: Record<string, RawRecord[]> = {};
  for (const record of records) {
    if (!byGid[record.gid]) byGid[record.gid] = [];
    byGid[record.gid].push(record);
  }

  return Object.entries(byGid).map(([gid, candidates]) => {
    const sorted = [...candidates].sort((a, b) => Number(b.vct) - Number(a.vct));
    const totalVotes = sorted.reduce((sum, c) => sum + Number(c.vct), 0);
    const reporting = Number(sorted[0]?.prt ?? 0);
    const totalPrecincts = Number(sorted[0]?.ptl ?? 0);
    const pctReporting = totalPrecincts > 0 ? reporting / totalPrecincts : 0;
    const margin =
      totalVotes > 0
        ? (Number(sorted[0]?.vct ?? 0) - Number(sorted[1]?.vct ?? 0)) / totalVotes
        : null;

    return {
      gid,
      cnm: sorted[0]?.cnm ?? "",
      ogl: sorted[0]?.ogl ?? "",
      precincts: {
        reporting,
        total: totalPrecincts,
        pct: pctReporting,
      },
      totalVotes,
      margin,
      called: totalPrecincts > 0 && reporting >= totalPrecincts,
      candidates: sorted.map((candidate) => ({
        name: candidate.bnm,
        party: candidate.pty,
        votes: Number(candidate.vct),
        pct: Number(candidate.pct),
      })),
    };
  });
}