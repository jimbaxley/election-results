import { normalizeContestName } from "./candidateCsv";

/**
 * Candidates endorsed / supported by Team Up NC.
 * - lastName: used to match the donkey logo on race cards (case-insensitive).
 *   Use full formatted name for disambiguation (e.g. "safiyah jackson").
 * - gid: NCSBE race GID — add once confirmed from the live feed or staging file.
 */
export const FEATURED_CANDIDATES: { lastName: string; gid?: string }[] = [
  { lastName: "baltutis",       gid: "1243" },
  { lastName: "barnes",         gid: "1244" },
  { lastName: "blanton",        gid: "1327" },
  { lastName: "rivera",         gid: "1306" },
  { lastName: "speed",          gid: "1187" },
  { lastName: "fatmi",          gid: "1320" },
  { lastName: "pittman",        gid: "1204" },
  { lastName: "decker",         gid: "1217" },
  { lastName: "wilkins",        gid: "1205" },
  { lastName: "sidman",         gid: "1285" },
  { lastName: "hopkins",        gid: "1215" },
  { lastName: "gailliard",      gid: "1313" },
  { lastName: "grafstein",      gid: "1315" },
  { lastName: "cohn",           gid: "1212" },
  { lastName: "bradley",        gid: "1344" },
  { lastName: "safiyah jackson" },
];

export type MonitoredRace = {
  gid: string;
  cnm?: string;
  replacementParty?: string;
  withdrawnName?: string;
  replacementLabel?: string;
};

/**
 * Races checked against the official candidate CSV.
 * Use replacementParty/withdrawnName when we want to keep monitoring a race
 * after a supported candidate withdraws and before the replacement is known.
 */
const EXPLICIT_MONITORED_RACES: MonitoredRace[] = [
  {
    gid: "1212",
    cnm: "NC HOUSE OF REPRESENTATIVES DISTRICT 32",
    replacementParty: "DEM",
    withdrawnName: "Curtis McRae",
    replacementLabel: "Bryan Cohn",
  },
];

const EXPLICIT_MONITORED_GIDS = new Set(EXPLICIT_MONITORED_RACES.map((race) => race.gid));

function isMonitoredFeaturedCandidate(
  candidate: { lastName: string; gid?: string },
): candidate is { lastName: string; gid: string } {
  return candidate.gid !== undefined && !EXPLICIT_MONITORED_GIDS.has(candidate.gid);
}

export const MONITORED_RACES: MonitoredRace[] = [
  ...EXPLICIT_MONITORED_RACES,
  ...FEATURED_CANDIDATES.filter(isMonitoredFeaturedCandidate).map((c) => ({ gid: c.gid })),
];

export const FEATURED_LAST_NAMES: Set<string> = new Set(
  FEATURED_CANDIDATES.map((c) => c.lastName),
);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function getMonitoredReplacement(
  formattedName: string,
  context?: { gid?: string; cnm?: string; party?: string },
): MonitoredRace | undefined {
  if (!context?.gid || !context.party) return undefined;

  const monitoredReplacement = MONITORED_RACES.find(
    (race) => (context.cnm ? race.cnm === normalizeContestName(context.cnm) : race.gid === context.gid) && race.replacementParty === context.party,
  );
  if (!monitoredReplacement?.withdrawnName) return undefined;

  const normalizedFull = normalizeToken(formattedName);
  const isWithdrawnCandidate = normalizedFull.startsWith(
    normalizeToken(monitoredReplacement.withdrawnName),
  );

  return isWithdrawnCandidate ? monitoredReplacement : undefined;
}

export function candidateDisplayName(
  formattedName: string,
  context?: { gid?: string; cnm?: string; party?: string },
): string {
  return getMonitoredReplacement(formattedName, context)?.replacementLabel ?? formattedName;
}

/**
 * Returns true if the candidate's formatted name matches a featured entry.
 * Checks full name first (for disambiguation), then last name only.
 */
export function isFeaturedCandidate(
  formattedName: string,
  context?: { gid?: string; cnm?: string; party?: string },
): boolean {
  const normalizedFull = normalizeToken(formattedName);

  if (context?.gid && context.party) {
    const monitoredReplacement = MONITORED_RACES.find(
      (race) => (context.cnm ? race.cnm === normalizeContestName(context.cnm) : race.gid === context.gid) && race.replacementParty === context.party,
    );
    if (monitoredReplacement && !getMonitoredReplacement(formattedName, context)) {
      return true;
    }
  }

  // Featured candidates are all Team Up NC-supported Democrats, so a shared
  // surname on another party's candidate (e.g. REP Lisa Stone Barnes vs. DEM
  // LeVon Barnes) must not get the donkey.
  if (context?.party && context.party !== "DEM") return false;

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
