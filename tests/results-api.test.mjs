import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Exercise the actual route and shared TypeScript modules without a dev server.
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTs(filename) {
  filename = path.resolve(filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} };
  modules.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", "module", compiled)(
    (id) => id.startsWith(".") ? loadTs(path.resolve(path.dirname(filename), `${id}.ts`)) : require(id),
    mod.exports, mod,
  );
  return mod.exports;
}
const { GET } = loadTs("app/api/results/route.ts");
const { liveResultsEnabled, fetchLiveResults, RESULTS_FEED_URL } = loadTs("lib/liveResults.ts");
const { candidatePhoto } = loadTs("lib/candidatePhotos.ts");
const { isFeaturedCandidate } = loadTs("lib/featuredCandidates.ts");
const RealDate = Date;

async function requestAt(time, fetcher, source = "2026-clean") {
  const originalFetch = globalThis.fetch;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [time])); }
  };
  globalThis.fetch = fetcher;
  try {
    const response = await GET(new Request(`http://localhost/api/results?source=${source}`));
    assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    return await response.json();
  } finally {
    globalThis.Date = RealDate;
    globalThis.fetch = originalFetch;
  }
}

const record = {
  gid: "1383", cnm: "US SENATE (VOTE FOR 1)", bnm: "Roy Cooper", pty: "DEM",
  vct: "12345", pct: "0.6", prt: "100", ptl: "200", ogl: "FED", ref: "0",
};

test("switch is midnight Eastern on Nov 1, independent of server timezone", () => {
  assert.equal(liveResultsEnabled(new Date("2026-11-01T03:59:59.999Z")), false);
  assert.equal(liveResultsEnabled(new Date("2026-11-01T04:00:00Z")), true);
});

test("before the switch, show the complete zero-vote slate without fetching NCSBE", async () => {
  const data = await requestAt("2026-11-01T03:59:59.999Z", () => assert.fail("No early fetch"));
  assert.equal(data.feedStatus, "scheduled");
  assert.equal(data.updatedAt, null);
  assert.ok(data.races.length > 170);
  assert.ok(data.races.every((race) => race.totalVotes === 0));
  assert.ok(data.races.some((race) => race.candidates.some((c) => c.name === "Roy Cooper")));
});

test("at the switch, fetch official results uncached and preserve federal votes and race IDs", async () => {
  const records = [record, { ...record, bnm: "Michael Whatley", pty: "REP", vct: "8000", pct: "0.4" }];
  const data = await requestAt("2026-11-01T04:00:00Z", async (url, options) => {
    assert.equal(url, RESULTS_FEED_URL);
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    // NCSBE also serves concatenated JSON objects without an array wrapper.
    return new Response(records.map((r) => JSON.stringify(r)).join(""));
  });
  assert.equal(data.feedStatus, "live");
  assert.equal(data.races.length, 1);
  assert.equal(data.races[0].gid, "1383");
  assert.equal(data.races[0].totalVotes, 20345);
  assert.equal(data.races[0].precincts.pct, 0.5);
  assert.equal(data.races[0].candidates[0].votes, 12345);
  assert.equal(data.updatedAt, "2026-11-01T04:00:00.000Z");
});

test("a missing feed returns an explicit unavailable status and no false live timestamp", async () => {
  const data = await requestAt("2026-11-01T04:00:00Z", async () => new Response("Not found", { status: 404 }));
  assert.equal(data.feedStatus, "unavailable");
  assert.equal(data.updatedAt, null);
  assert.match(data.feedNotice, /retrying every 60 seconds/i);
  assert.ok(data.races.every((race) => race.totalVotes === 0));
  // The next request automatically recovers once the feed becomes available.
  const recovered = await requestAt("2026-11-01T04:01:00Z", async () => Response.json([record]));
  assert.equal(recovered.feedStatus, "live");
  assert.equal(recovered.races[0].totalVotes, 12345);
});

test("reject empty, malformed, non-race, and invalid numeric feed data", async () => {
  for (const text of ["", "[]", "<html>Unavailable</html>", "{}", JSON.stringify([{ ...record, vct: "bad" }])]) {
    await assert.rejects(fetchLiveResults(async () => new Response(text)));
  }
  await assert.rejects(fetchLiveResults(async () => { throw new Error("Network failure"); }));
});

test("write-in candidates without a party are valid feed records", async () => {
  const writeIn = { ...record, bnm: "Write-In (Miscellaneous)", pty: "" };
  const records = await fetchLiveResults(async () => Response.json([writeIn]));
  assert.equal(records[0].bnm, writeIn.bnm);
});

test("historical results stay static after the live switch", async () => {
  const data = await requestAt("2026-11-03T23:00:00Z", () => assert.fail("No historical fetch"), "2024");
  assert.ok(data.races.some((race) => race.totalVotes > 0));
});

test("avatars and featured races match contests despite changed official GIDs", () => {
  assert.equal(candidatePhoto("Roy Cooper", { cnm: record.cnm, party: "DEM" }), "/Cooper.png");
  assert.equal(candidatePhoto("Winn Decker", { cnm: "NC HOUSE OF REPRESENTATIVES DISTRICT 037 (VOTE FOR 1)", party: "DEM" }), "/DECKER-ISO.png");
  assert.equal(candidatePhoto("Roy Cooper", { cnm: record.cnm, party: "REP" }), undefined);
  assert.equal(candidatePhoto("Someone Else", { cnm: record.cnm, party: "DEM" }), undefined);
  assert.equal(isFeaturedCandidate("Bryan K. Cohn", { gid: "1200", cnm: "NC HOUSE OF REPRESENTATIVES DISTRICT 032 (VOTE FOR 1)", party: "DEM" }), true);
  assert.equal(isFeaturedCandidate("Other Candidate", { gid: "1212", cnm: "NC HOUSE OF REPRESENTATIVES DISTRICT 044 (VOTE FOR 1)", party: "DEM" }), false);
});

test("official downloaded feed works through the full results API", {
  skip: !process.env.NCSBE_FEED_FIXTURE,
}, async () => {
  const text = fs.readFileSync(process.env.NCSBE_FEED_FIXTURE, "utf8");
  const data = await requestAt("2026-11-01T04:00:00Z", async () => new Response(text));
  assert.equal(data.feedStatus, "live");
  assert.equal(data.races.filter((race) => race.ogl === "NCS").length, 50);
  assert.equal(data.races.filter((race) => race.ogl === "NCH").length, 120);
  assert.equal(data.races.filter((race) => race.ogl === "FED").length, 15);
  const cooperRace = data.races.find((race) => race.candidates.some((c) => c.name === "Roy Cooper"));
  assert.equal(candidatePhoto("Roy Cooper", { cnm: cooperRace.cnm, party: "DEM" }), "/Cooper.png");
});
