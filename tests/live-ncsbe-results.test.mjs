import test from "node:test";
import assert from "node:assert/strict";

const NCSBE_URL = "https://er.ncsbe.gov/enr/20241105/data/results_0.txt";

function parseRawFeed(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const fixed = `[${trimmed.replace(/\}\{/g, "},{")}]`;
  return JSON.parse(fixed);
}

function summarizeTracked(records) {
  const tracked = records.filter(
    (r) => (r.ogl === "NCS" || r.ogl === "NCH" || r.ogl === "SPC") && r.ref === "0",
  );

  const byGid = new Map();
  for (const record of tracked) {
    if (!byGid.has(record.gid)) byGid.set(record.gid, []);
    byGid.get(record.gid).push(record);
  }

  return Array.from(byGid.entries()).map(([gid, candidates]) => {
    const sorted = [...candidates].sort((a, b) => Number(b.vct) - Number(a.vct));
    const totalVotes = sorted.reduce((sum, c) => sum + Number(c.vct), 0);
    const reporting = Number(sorted[0]?.prt ?? 0);
    const totalPrecincts = Number(sorted[0]?.ptl ?? 0);
    const pctReporting = totalPrecincts > 0 ? reporting / totalPrecincts : 0;
    const margin =
      totalVotes > 0
        ? (Number(sorted[0]?.vct ?? 0) - Number(sorted[1]?.vct ?? 0)) / totalVotes
        : null;

    return {
      gid,
      cnm: sorted[0]?.cnm ?? "",
      ogl: sorted[0]?.ogl ?? "",
      precincts: { reporting, total: totalPrecincts, pct: pctReporting },
      totalVotes,
      margin,
      called: pctReporting > 0.5 && margin !== null && margin > 0.1,
      candidates: sorted.map((c) => ({
        name: c.bnm,
        party: c.pty,
        votes: Number(c.vct),
        pct: Number(c.pct),
      })),
    };
  });
}

test("fetches live NCSBE feed and logs parsed race summaries", async () => {
  const res = await fetch(NCSBE_URL);
  assert.equal(res.ok, true, `Expected 200 response, got ${res.status}`);

  const text = await res.text();
  assert.ok(text.length > 0, "Expected non-empty feed text");

  const records = parseRawFeed(text);
  assert.ok(Array.isArray(records), "Parsed feed should be an array");
  assert.ok(records.length > 0, "Expected at least one record in feed");

  const races = summarizeTracked(records);
  assert.ok(Array.isArray(races), "Tracked race summaries should be an array");

  console.log("Live NCSBE parsed output sample:");
  console.log(
    JSON.stringify(
      {
        recordCount: records.length,
        raceCount: races.length,
        sample: races.slice(0, 5),
      },
      null,
      2,
    ),
  );
});