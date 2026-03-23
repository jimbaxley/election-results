/**
 * Candidates endorsed / supported by Team Up NC.
 * - lastName: used to match the donkey logo on race cards (case-insensitive).
 *   Use full formatted name for disambiguation (e.g. "safiyah jackson").
 * - gid: NCSBE race GID — add once confirmed from the live feed or staging file.
 *   Used by scripts/check-feed.ts to verify candidate names against the official CSV.
 */
export const FEATURED_CANDIDATES: { lastName: string; gid?: string }[] = [
  { lastName: "mcrae",          gid: "1212" },
  { lastName: "everitt",        gid: "1320" },
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
export function isFeaturedCandidate(formattedName: string): boolean {
  const normalizedFull = normalizeToken(formattedName);

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
