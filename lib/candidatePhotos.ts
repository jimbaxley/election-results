import { normalizeContestName } from "./candidateCsv";

/**
 * Candidate headshots for race-card avatars.
 * Keyed by contest name because NCSBE race IDs can change between exports.
 * Also gated on party + last name so a photo never carries over to a different
 * candidate who later occupies the same contest/party
 * (e.g. a different cycle's nominee, or a primary replacement).
 * Files live in /public — add the PNG there, then map it here.
 */
const CANDIDATE_PHOTOS: Record<string, { lastName: string; party: string; photo: string }> = {
  "NC HOUSE OF REPRESENTATIVES DISTRICT 63": { lastName: "baltutis", party: "DEM", photo: "/baltutis Background Removed.png" }, // Ian Baltutis — HD-63
  "NC HOUSE OF REPRESENTATIVES DISTRICT 64": { lastName: "barnes", party: "DEM", photo: "/barnes Medium.png" }, // LeVon Barnes — HD-64
  "NC STATE SENATE DISTRICT 25": { lastName: "blanton", party: "DEM", photo: "/blanton Background Removed.png" }, // Southey Blanton — SD-25
  "NC STATE SENATE DISTRICT 42": { lastName: "bradley", party: "DEM", photo: "/WoodsonBradley-ISO.png" }, // Woodson Bradley — SD-42
  "NC STATE SENATE DISTRICT 4": { lastName: "rivera", party: "DEM", photo: "/Jess_Rivera Background Removed.png" }, // Jess Rivera — SD-4
  "NC HOUSE OF REPRESENTATIVES DISTRICT 7": { lastName: "speed", party: "DEM", photo: "/SPEED-ISO.png" }, // Mark Speed — HD-7
  "NC HOUSE OF REPRESENTATIVES DISTRICT 24": { lastName: "pittman",   party: "DEM", photo: "/Pittman-ISO.png" },   // Dante Pittman — HD-24
  "NC HOUSE OF REPRESENTATIVES DISTRICT 25": { lastName: "wilkins",   party: "DEM", photo: "/LW-ISO.png" },        // Lorenza M. Wilkins — HD-25
  "NC HOUSE OF REPRESENTATIVES DISTRICT 32": { lastName: "cohn",      party: "DEM", photo: "/COHN-ISO-WIDE.png" }, // Bryan Cohn — HD-32
  "NC HOUSE OF REPRESENTATIVES DISTRICT 35": { lastName: "hopkins",   party: "DEM", photo: "/HOPKINS-ISO.png" },   // Evonne S. Hopkins — HD-35
  "NC HOUSE OF REPRESENTATIVES DISTRICT 37": { lastName: "decker",    party: "DEM", photo: "/DECKER-ISO.png" },    // Winn Decker — HD-37
  "NC STATE SENATE DISTRICT 11": { lastName: "gailliard", party: "DEM", photo: "/Gailliard-ISO.png" }, // James D. Gailliard — SD-11
  "NC STATE SENATE DISTRICT 13": { lastName: "grafstein", party: "DEM", photo: "/LG-ISO.png" },        // Lisa Grafstein — SD-13
  "NC STATE SENATE DISTRICT 18": { lastName: "fatmi",     party: "DEM", photo: "/FATMI-Iso.png" },     // Haseeb Fatmi — SD-18
  "US SENATE": { lastName: "cooper",    party: "DEM", photo: "/Cooper.png" },        // Roy Cooper — US Senate
  "US HOUSE OF REPRESENTATIVES DISTRICT 1": { lastName: "davis",     party: "DEM", photo: "/ddavis.png" },        // Don Davis — US House District 1
  "NC COURT OF APPEALS JUDGE SEAT 01": { lastName: "arrowood",  party: "DEM", photo: "/arrowood.png" },      // John S. Arrowood — CoA Seat 1
  "NC COURT OF APPEALS JUDGE SEAT 02": { lastName: "hampson",   party: "DEM", photo: "/hampson.png" },       // Tobias (Toby) Hampson — CoA Seat 2
  "NC COURT OF APPEALS JUDGE SEAT 03": { lastName: "walczyk",   party: "DEM", photo: "/Walczyk.png" },       // Christine Marie Walczyk — CoA Seat 3
  "NC SUPREME COURT ASSOCIATE JUSTICE SEAT 01": { lastName: "earls",     party: "DEM", photo: "/EARLS-ISO.png" },     // Anita Earls — NC Supreme Court
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function candidatePhoto(
  displayName: string,
  context?: { cnm?: string; party?: string },
): string | undefined {
  if (!context?.cnm || !context.party) return undefined;
  const entry = CANDIDATE_PHOTOS[normalizeContestName(context.cnm)];
  if (!entry || entry.party !== context.party) return undefined;

  const tokens = displayName.toLowerCase().split(/\s+/).map(normalizeToken).filter(Boolean);
  const lastName = tokens.at(-1) ?? "";
  return lastName === entry.lastName ? entry.photo : undefined;
}
