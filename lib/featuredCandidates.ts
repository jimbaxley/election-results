/**
 * Candidates endorsed / supported by Team Up NC.
 * - lastName: used to match the donkey logo on race cards (case-insensitive).
 *   Use full formatted name for disambiguation (e.g. "safiyah jackson").
 * - gid: NCSBE race GID — add once confirmed from the live feed or staging file.
 */
export const FEATURED_CANDIDATES: { lastName: string; gid?: string }[] = [
  { lastName: "fatmi",          gid: "1320" },
  { lastName: "pittman",        gid: "1204" },
  { lastName: "decker",         gid: "1217" },
  { lastName: "wilkins",        gid: "1205" },
  { lastName: "sidman",         gid: "1285" },
  { lastName: "hopkins",        gid: "1215" },
  { lastName: "gailliard",      gid: "1313" },
  { lastName: "grafstein",      gid: "1315" },
  { lastName: "cohn" },
  { lastName: "bradley",        gid: "1344" },
  { lastName: "safiyah jackson" },
];

export type MonitoredRace = {
  gid: string;
  replacementParty?: string;
  withdrawnName?: string;
  replacementLabel?: string;
};

/**
 * Races checked against the official candidate CSV.
 * Use replacementParty/withdrawnName when we want to keep monitoring a race
 * after a supported candidate withdraws and before the replacement is known.
 */
export const MONITORED_RACES: MonitoredRace[] = [
  {
    gid: "1212",
    replacementParty: "DEM",
    withdrawnName: "Curtis McRae",
    replacementLabel: "HD 32 Democratic nominee",
  },
  ...FEATURED_CANDIDATES.filter((c): c is { lastName: string; gid: string } => Boolean(c.gid))
    .map((c) => ({ gid: c.gid })),
];

export const FEATURED_LAST_NAMES: Set<string> = new Set(
  FEATURED_CANDIDATES.map((c) => c.lastName),
);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Returns true if the candidate's formatted name matches a featured entry.
 * Checks full name first (for disambiguation), then last name only.
 */
export function isFeaturedCandidate(
  formattedName: string,
  context?: { gid?: string; party?: string },
): boolean {
  const normalizedFull = normalizeToken(formattedName);

  if (context?.gid && context.party) {
    const monitoredReplacement = MONITORED_RACES.find(
      (race) => race.gid === context.gid && race.replacementParty === context.party,
    );
    const isWithdrawnCandidate = monitoredReplacement?.withdrawnName
      ? normalizedFull.startsWith(normalizeToken(monitoredReplacement.withdrawnName))
      : false;
    if (
      monitoredReplacement &&
      !isWithdrawnCandidate
    ) {
      return true;
    }
  }

  for (const featured of FEATURED_LAST_NAMES) {
    if (normalizedFull === normalizeToken(featured)) return true;
  }

  const tokens = formattedName
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
  const lastName = tokens.at(-1) ?? "";
  return FEATURED_LAST_NAMES.has(lastName);
}
