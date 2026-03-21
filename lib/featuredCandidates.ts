/**
 * Candidates endorsed / supported by Team Up NC.
 * Add last names (lowercase) to mark them with the donkey logo on race cards.
 * If two candidates in the same chamber share a last name, use a fuller match
 * by adding their full formatted name instead (e.g. "beth gardner helfrich").
 */
export const FEATURED_LAST_NAMES: Set<string> = new Set([
  // Add last names here, lowercase:
  "mcrae",
  "everitt",
  "pittman",
  "decker",
  "wilkins",
  "sidman",
  "hopkins",
  "gailliard",
  "grafstein",
]);

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
