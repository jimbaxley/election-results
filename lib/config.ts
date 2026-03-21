export const CHAMBER_CONFIG = {
  senate: { total: 50, majority: 26, supermajority: 30 },
  house: { total: 120, majority: 61, supermajority: 72 },
} as const;

// NC Supreme Court: 7 seats total, 1 open in 2026 (Anita Earls' seat).
// TODO: verify current composition — update dem/rep before November 2026.
export const SC_CONFIG = {
  total: 7,
  seatsUp2026: 1,
  current: { dem: 2, rep: 5 }, // ← update with confirmed post-2024 composition
} as const;

// NC Court of Appeals: 15 seats total, 3 open in 2026 (seats 01, 02, 03).
// Composition below reflects post-2024 results; verify before November 2026.
export const COA_CONFIG = {
  total: 15,
  seatsUp2026: 3,
  // Current standing before 2026 elections:
  current: { dem: 3, rep: 12 },
  // Contest name substrings that identify the 3 open CoA seats
  openSeatCnms: [
    "NC COURT OF APPEALS JUDGE SEAT 01",
    "NC COURT OF APPEALS JUDGE SEAT 02",
    "NC COURT OF APPEALS JUDGE SEAT 03",
  ],
} as const;

// Selection is by GID only. Use current test GIDs for now and replace before November.
export const TEAM_UP_NC_GIDS: string[] = [
  "1205",
  "1212",
  "1320"
  // "REPLACE_WITH_SPC_GID",
];