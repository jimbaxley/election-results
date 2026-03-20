import type { RaceSummary } from "./parseResults";
import { CHAMBER_CONFIG } from "./config";

type Party = "DEM" | "REP" | "OTHER";

export type ChamberBalance = {
  chamber: "senate" | "house";
  thresholds: {
    total: number;
    majority: number;
    supermajority: number;
  };
  seats: {
    dem: number;
    rep: number;
    other: number;
  };
};

function normalizeParty(party?: string): Party {
  if (party === "DEM") return "DEM";
  if (party === "REP") return "REP";
  return "OTHER";
}

function chamberFromOgl(ogl: string): "senate" | "house" | null {
  if (ogl === "NCS") return "senate";
  if (ogl === "NCH") return "house";
  return null;
}

export function computeBalance(races: RaceSummary[]): ChamberBalance[] {
  const seed: Record<"senate" | "house", ChamberBalance> = {
    senate: {
      chamber: "senate",
      thresholds: CHAMBER_CONFIG.senate,
      seats: { dem: 0, rep: 0, other: 0 },
    },
    house: {
      chamber: "house",
      thresholds: CHAMBER_CONFIG.house,
      seats: { dem: 0, rep: 0, other: 0 },
    },
  };

  for (const race of races) {
    const chamber = chamberFromOgl(race.ogl);
    if (!chamber) continue;

    const leader = race.candidates[0];
    const party = normalizeParty(leader?.party);
    if (party === "DEM") seed[chamber].seats.dem += 1;
    else if (party === "REP") seed[chamber].seats.rep += 1;
    else seed[chamber].seats.other += 1;
  }

  return [seed.senate, seed.house];
}