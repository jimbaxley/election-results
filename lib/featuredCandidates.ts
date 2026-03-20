/**
 * Candidates endorsed / supported by Team Up NC.
 * Add last names (lowercase) to mark them with the donkey logo on race cards.
 * If two candidates in the same chamber share a last name, use a fuller match
 * by adding their full formatted name instead (e.g. "beth gardner helfrich").
 */
export const FEATURED_LAST_NAMES: Set<string> = new Set([
  // Add last names here, lowercase:
  "cohn",
  "everitt",
  "pittman",
  "bradley",
  "wilkins",
  "sidman",
  "hopkins",
  "mercer",
  "grafstein",
]);

/**
 * Returns true if the candidate's formatted name matches a featured entry.
 * Checks full name first (for disambiguation), then last name only.
 */
export function isFeaturedCandidate(formattedName: string): boolean {
  const lower = formattedName.toLowerCase();
  if (FEATURED_LAST_NAMES.has(lower)) return true;
  const lastName = lower.split(" ").at(-1) ?? "";
  return FEATURED_LAST_NAMES.has(lastName);
}
