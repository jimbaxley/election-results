export const CHAMBER_CONFIG = {
  senate: { total: 50, majority: 26, supermajority: 30 },
  house: { total: 120, majority: 61, supermajority: 72 },
} as const;

// Selection is by GID only. Use current test GIDs for now and replace before November.
export const TEAM_UP_NC_GIDS: string[] = [
  "1205",
  "1212",
  "1320"
  // "REPLACE_WITH_SPC_GID",
];