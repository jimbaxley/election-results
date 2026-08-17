/**
 * Candidate headshots for race-card avatars.
 * Keyed by NCSBE race GID — also gated on party + last name so a photo never
 * carries over to a *different* candidate who later occupies the same gid/party
 * (e.g. a different cycle's nominee, or a primary replacement).
 * Files live in /public — add the PNG there, then map it here.
 */
const CANDIDATE_PHOTOS: Record<string, { lastName: string; party: string; photo: string }> = {
  "1204": { lastName: "pittman",   party: "DEM", photo: "/Pittman-ISO.png" },   // Dante Pittman — HD-24
  "1205": { lastName: "wilkins",   party: "DEM", photo: "/LW-ISO.png" },        // Lorenza M. Wilkins — HD-25
  "1212": { lastName: "cohn",      party: "DEM", photo: "/COHN-ISO-WIDE.png" }, // Bryan Cohn — HD-32
  "1215": { lastName: "hopkins",   party: "DEM", photo: "/HOPKINS-ISO.png" },   // Evonne S. Hopkins — HD-35
  "1217": { lastName: "decker",    party: "DEM", photo: "/DECKER-ISO.png" },    // Winn Decker — HD-37
  "1313": { lastName: "gailliard", party: "DEM", photo: "/Gailliard-ISO.png" }, // James D. Gailliard — SD-11
  "1315": { lastName: "grafstein", party: "DEM", photo: "/LG-ISO.png" },        // Lisa Grafstein — SD-13
  "1320": { lastName: "fatmi",     party: "DEM", photo: "/FATMI-Iso.png" },     // Haseeb Fatmi — SD-18
  "1392": { lastName: "cooper",    party: "DEM", photo: "/Cooper.png" },        // Roy Cooper — US Senate
  "1379": { lastName: "davis",     party: "DEM", photo: "/ddavis.png" },        // Don Davis — US House District 1
  "2001": { lastName: "arrowood",  party: "DEM", photo: "/arrowood.png" },      // John S. Arrowood — CoA Seat 1
  "2002": { lastName: "hampson",   party: "DEM", photo: "/hampson.png" },       // Tobias (Toby) Hampson — CoA Seat 2
  "2003": { lastName: "walczyk",   party: "DEM", photo: "/Walczyk.png" },       // Christine Marie Walczyk — CoA Seat 3
  "2004": { lastName: "earls",     party: "DEM", photo: "/EARLS-ISO.png" },     // Anita Earls — NC Supreme Court
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function candidatePhoto(
  displayName: string,
  context?: { gid?: string; party?: string },
): string | undefined {
  if (!context?.gid || !context.party) return undefined;
  const entry = CANDIDATE_PHOTOS[context.gid];
  if (!entry || entry.party !== context.party) return undefined;

  const tokens = displayName.toLowerCase().split(/\s+/).map(normalizeToken).filter(Boolean);
  const lastName = tokens.at(-1) ?? "";
  return lastName === entry.lastName ? entry.photo : undefined;
}
