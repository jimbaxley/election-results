import type { RawRecord } from "./parseResults";

type FederalCandidate = readonly [
  gid: string,
  contest: string,
  name: string,
  party: string,
];

// NCSBE general-election candidate listing, checked 2026-09-14.
// Keep this slate separate from the simulated staging results so a partial
// staging export cannot silently omit a party or an entire federal district.
const FEDERAL_CANDIDATES: FederalCandidate[] = [
  ["1379", "US HOUSE OF REPRESENTATIVES DISTRICT 01", "Don Davis", "DEM"],
  ["1379", "US HOUSE OF REPRESENTATIVES DISTRICT 01", "Tom Bailey", "LIB"],
  ["1379", "US HOUSE OF REPRESENTATIVES DISTRICT 01", "Laurie Buckhout", "REP"],
  ["1380", "US HOUSE OF REPRESENTATIVES DISTRICT 02", "Deborah K. Ross", "DEM"],
  ["1380", "US HOUSE OF REPRESENTATIVES DISTRICT 02", "Matthew Laszacs", "LIB"],
  ["1380", "US HOUSE OF REPRESENTATIVES DISTRICT 02", "Eugene F. Douglass", "REP"],
  ["1381", "US HOUSE OF REPRESENTATIVES DISTRICT 03", "Raymond Smith", "DEM"],
  ["1381", "US HOUSE OF REPRESENTATIVES DISTRICT 03", "Daniel Cavender", "LIB"],
  ["1381", "US HOUSE OF REPRESENTATIVES DISTRICT 03", "Greg Murphy", "REP"],
  ["1382", "US HOUSE OF REPRESENTATIVES DISTRICT 04", "Valerie P. Foushee", "DEM"],
  ["1382", "US HOUSE OF REPRESENTATIVES DISTRICT 04", "Guy Meilleur", "LIB"],
  ["1382", "US HOUSE OF REPRESENTATIVES DISTRICT 04", "Mahesh (Max) Ganorkar", "REP"],
  ["1383", "US HOUSE OF REPRESENTATIVES DISTRICT 05", "Chuck Hubbard", "DEM"],
  ["1383", "US HOUSE OF REPRESENTATIVES DISTRICT 05", "Robert B. Luffman", "LIB"],
  ["1383", "US HOUSE OF REPRESENTATIVES DISTRICT 05", "Virginia Foxx", "REP"],
  ["1384", "US HOUSE OF REPRESENTATIVES DISTRICT 06", "Cyril Jefferson", "DEM"],
  ["1384", "US HOUSE OF REPRESENTATIVES DISTRICT 06", "Addison McDowell", "REP"],
  ["1385", "US HOUSE OF REPRESENTATIVES DISTRICT 07", "Kimberly Hardy", "DEM"],
  ["1385", "US HOUSE OF REPRESENTATIVES DISTRICT 07", "Maad Abu-Ghazalah", "LIB"],
  ["1385", "US HOUSE OF REPRESENTATIVES DISTRICT 07", "David Rouzer", "REP"],
  ["1386", "US HOUSE OF REPRESENTATIVES DISTRICT 08", "Colby Watson", "DEM"],
  ["1386", "US HOUSE OF REPRESENTATIVES DISTRICT 08", "Bo Whitehead", "GRE"],
  ["1386", "US HOUSE OF REPRESENTATIVES DISTRICT 08", "Mark Harris", "REP"],
  ["1387", "US HOUSE OF REPRESENTATIVES DISTRICT 09", "Richard N. Ojeda II", "DEM"],
  ["1387", "US HOUSE OF REPRESENTATIVES DISTRICT 09", "Richard Hudson", "REP"],
  ["1388", "US HOUSE OF REPRESENTATIVES DISTRICT 10", "Ashley Bell", "DEM"],
  ["1388", "US HOUSE OF REPRESENTATIVES DISTRICT 10", "Steven Feldman", "LIB"],
  ["1388", "US HOUSE OF REPRESENTATIVES DISTRICT 10", "Pat Harrigan", "REP"],
  ["1389", "US HOUSE OF REPRESENTATIVES DISTRICT 11", "Jamie Ager", "DEM"],
  ["1389", "US HOUSE OF REPRESENTATIVES DISTRICT 11", "Travis Groo", "LIB"],
  ["1389", "US HOUSE OF REPRESENTATIVES DISTRICT 11", "Jennifer Capps Balkcom", "REP"],
  ["1390", "US HOUSE OF REPRESENTATIVES DISTRICT 12", "Alma S. Adams", "DEM"],
  ["1390", "US HOUSE OF REPRESENTATIVES DISTRICT 12", "Jack Codiga", "REP"],
  ["1391", "US HOUSE OF REPRESENTATIVES DISTRICT 13", "Paul Barringer", "DEM"],
  ["1391", "US HOUSE OF REPRESENTATIVES DISTRICT 13", "Steven Swinton", "LIB"],
  ["1391", "US HOUSE OF REPRESENTATIVES DISTRICT 13", "Brad Knott", "REP"],
  ["1392", "US HOUSE OF REPRESENTATIVES DISTRICT 14", "Lakesha Womack", "DEM"],
  ["1392", "US HOUSE OF REPRESENTATIVES DISTRICT 14", "Tim Moore", "REP"],
  ["1393", "US SENATE", "Michael Dublin", "GRE"],
  ["1393", "US SENATE", "Roy Cooper", "DEM"],
  ["1393", "US SENATE", "Shannon W. Bray", "LIB"],
  ["1393", "US SENATE", "Michael Whatley", "REP"],
];

export function federalCandidateRecords2026(): RawRecord[] {
  return FEDERAL_CANDIDATES.map(([gid, contest, name, party]) => ({
    gid,
    cnm: `${contest} (VOTE FOR 1)`,
    bnm: name,
    pty: party,
    vct: "0",
    pct: "0.0000",
    prt: "0",
    ptl: "0",
    ogl: "FED",
    ref: "0",
  }));
}
