# NC Election Night Dashboard — Architecture & Build Prompt

## Project Overview

Build a real-time election night dashboard for **Team Up NC** that displays:
1. **Balance of Power** — seat tallies for the NC Senate and NC House with majority/supermajority thresholds
2. **Candidate Race Results** — per-candidate and aggregate results for Team Up NC candidates

The app is hosted on **Vercel (Next.js)** and embedded into **Framer** pages via `<iframe>` with URL parameters. There are no user logins, no writes, and no database — the backend is a lightweight proxy that polls the NCSBE results file.

---

## Data Source

**NCSBE Live Results Feed**
```
https://er.ncsbe.gov/enr/20261103/data/results_0.txt
```

- The URL is structured as `/enr/YYYYMMDD/data/results_0.txt` — `20261103` is the confirmed election date (November 3, 2026)
- The feed is published in advance with candidates and GIDs populated, so configuration can be completed well before election night
- Updates every 3–7 minutes once polls close on election night
- Returns a flat array of concatenated JSON objects (no commas between objects — must be fixed before parsing)
- One record per **candidate** per **race**
- All votes start at `0` until polls close — the full candidate/GID structure is available before any results come in

### Key Fields

| Field | Description |
|-------|-------------|
| `gid` | Race ID — groups all candidates in the same race |
| `lid` | Contest leg ID — same as `gid` in general elections |
| `cnm` | Race name (e.g. `NC STATE SENATE DISTRICT 01 - REP (VOTE FOR 1)`) |
| `bnm` | Candidate name |
| `pty` | Party: `REP`, `DEM`, `LIB`, etc. |
| `vct` | Vote count |
| `pct` | Vote percentage (string, e.g. `"43.2500"`) |
| `prt` | Precincts reporting |
| `ptl` | Total precincts in race |
| `evc` | Early votes |
| `ovc` | Overseas/provisional votes |
| `ogl` | Office level: `NCS` = NC Senate, `NCH` = NC House, `SPC` = NC Supreme Court, `FED` = Federal |
| `ref` | `1` if this is a referendum, `0` if a candidate race |

### Parsing the Feed

The raw file is not valid JSON as-is. Fix it before parsing:

```js
const text = await res.text();
const fixed = "[" + text.replace(/\}\{/g, "},{") + "]";
const records = JSON.parse(fixed);
```

### Filtering to Tracked Races

```js
const senateRecords      = records.filter(r => r.ogl === "NCS" && r.ref === "0");
const houseRecords       = records.filter(r => r.ogl === "NCH" && r.ref === "0");
const supremeCourtRecords = records.filter(r => r.ogl === "SPC" && r.ref === "0");
```

> **Note:** NC Supreme Court races use `ogl === "SPC"`. They are included in candidate race results but **not** in the Balance of Power visualization, which covers legislative seats only. Confirm the exact `ogl` value for Supreme Court races when the feed is live — `SPC` is the expected value but verify against the actual data.

---

## NC Chamber Thresholds

| Chamber | Total Seats | Majority | Supermajority |
|---------|------------|----------|---------------|
| NC Senate | 50 | 26 | 30 (60%) |
| NC House | 120 | 61 | 72 (60%) |

---

## Architecture

```
NCSBE results file (updates every 3–7 min)
        │
        ▼
Vercel API Route: /api/results
  - Fetches & parses NCSBE feed
  - Fixes JSON, filters to NCS + NCH + SPC
  - Computes per-race leader, margin, % precincts in
  - Returns structured JSON for both features
  - Response cached for 60 seconds (Vercel Edge Cache)
        │
        ├──▶ /balance-of-power  (full-page iframe)
        │      Balance of Power visualization
        │      NC Senate + NC House seat bars
        │      Embeds in Framer via URL
        │
        └──▶ /race-result?gid=XXXX  (per-candidate iframe)
               Single race result card
               Embeds on each candidate's Framer page
               ?gid= param identifies the race

        └──▶ /race-result?view=teamupnc  (aggregate iframe)
               All Team Up NC candidates
               One card per candidate
               Embeds on the Team Up NC hub page
```

---

## Vercel Project Structure

```
/
├── app/
│   ├── api/
│   │   └── results/
│   │       └── route.ts          # Proxy + parser for NCSBE feed
│   ├── balance-of-power/
│   │   └── page.tsx              # Feature 1: Balance of Power page
│   ├── race-result/
│   │   └── page.tsx              # Feature 2: Race result page (reads ?gid or ?view)
│   └── layout.tsx                # Minimal layout, no nav needed
├── lib/
│   ├── parseResults.ts           # NCSBE feed parser
│   ├── computeBalance.ts         # Seat tally logic
│   └── config.ts                 # Team Up NC candidate GID list + thresholds
└── public/
```

---

## Feature 1: Balance of Power (`/balance-of-power`)

### What It Shows
- One bar per chamber (Senate + House)
- Each seat represented as a block, colored by current leader
- Threshold markers at majority and supermajority
- Live updating via client-side polling every 60 seconds

### Seat Coloring Logic

| State | Color |
|-------|-------|
| DEM leading, >50% precincts in | Solid blue |
| DEM leading, <50% precincts in | Light/faded blue |
| REP leading, >50% precincts in | Solid red |
| REP leading, <50% precincts in | Light/faded red |
| Margin < 3% (toss-up) | Striped or pulsing |
| No votes yet | Gray |

### Seat-Level Hover Data
- District number
- Leading candidate name
- Vote margin
- % precincts reporting

### Computing the Seat Leader

Group records by `gid`, then within each race:

```js
// Sort candidates by vote count descending
const sorted = candidates.sort((a, b) => Number(b.vct) - Number(a.vct));
const leader = sorted[0];
const totalVotes = sorted.reduce((sum, c) => sum + Number(c.vct), 0);
const margin = totalVotes > 0
  ? (Number(sorted[0].vct) - Number(sorted[1]?.vct || 0)) / totalVotes
  : null;
const pctReporting = Number(leader.prt) / Number(leader.ptl);
```

A race is considered **called** when: `pctReporting > 0.5 && margin > 0.10` (adjust thresholds as needed).

---

## Feature 2: Race Results (`/race-result`)

### URL Patterns

```
/race-result?gid=1867              → single race by GID
/race-result?view=teamupnc         → all Team Up NC candidates
/race-result?gid=1867&compact=true → compact layout for sidebars
/race-result?gid=1867&theme=dark   → dark theme variant
```

### Per-Race Display
- Candidate names with party labels
- Vote count + percentage bar for each candidate
- Precincts reporting (e.g. "47 of 96 precincts reporting")
- "Leading" / "Winner" badge when thresholds are met
- Auto-refreshes every 60 seconds

### Aggregate (Team Up NC) Display
- Summary header: "X of Y Team Up NC candidates currently leading"
- One result card per candidate, sorted by race competitiveness
- Each card is identical to the single-race display

---

## Team Up NC Candidate Config

Maintain this in `/lib/config.ts`. GIDs are confirmed from the live NCSBE feed — pull the feed before election day to verify each candidate's GID.

```ts
// lib/config.ts

export const CHAMBER_CONFIG = {
  senate: { total: 50, majority: 26, supermajority: 30 },
  house:  { total: 120, majority: 61, supermajority: 72 },
};

export const TEAM_UP_NC_CANDIDATES = [
  { name: "Candidate Name",  gid: "1867", district: "Senate District 01", chamber: "senate" },
  { name: "Candidate Name",  gid: "1879", district: "Senate District 05", chamber: "senate" },
  // Add all Team Up NC legislative candidates here

  // NC Supreme Court — not part of balance of power, displayed in race results only
  { name: "Candidate Name",  gid: "XXXX", district: "NC Supreme Court", chamber: "supreme_court" },
];
```

> **Note:** GIDs for primary races may differ from general election GIDs. Verify the feed on election day before going live.

---

## API Route (`/api/results`)

```ts
// app/api/results/route.ts

export const revalidate = 60; // Cache for 60 seconds at the edge

const NCSBE_URL = "https://er.ncsbe.gov/enr/20261103/data/results_0.txt";

export async function GET() {
  const res = await fetch(NCSBE_URL, { next: { revalidate: 60 } });
  const text = await res.text();

  // Fix malformed JSON
  const fixed = "[" + text.replace(/\}\{/g, "},{") + "]";
  const records = JSON.parse(fixed);

  // Filter to tracked races (legislative + Supreme Court)
  const tracked = records.filter(
    (r: any) => (r.ogl === "NCS" || r.ogl === "NCH" || r.ogl === "SPC") && r.ref === "0"
  );

  // Group by GID
  const byGid: Record<string, any[]> = {};
  for (const r of tracked) {
    if (!byGid[r.gid]) byGid[r.gid] = [];
    byGid[r.gid].push(r);
  }

  // Compute race summaries
  const races = Object.entries(byGid).map(([gid, candidates]) => {
    const sorted = [...candidates].sort((a, b) => Number(b.vct) - Number(a.vct));
    const totalVotes = sorted.reduce((s, c) => s + Number(c.vct), 0);
    const pctReporting = Number(sorted[0].prt) / Number(sorted[0].ptl);
    const margin = totalVotes > 0
      ? (Number(sorted[0].vct) - Number(sorted[1]?.vct ?? 0)) / totalVotes
      : null;

    return {
      gid,
      cnm: sorted[0].cnm,
      ogl: sorted[0].ogl,
      precincts: { reporting: Number(sorted[0].prt), total: Number(sorted[0].ptl), pct: pctReporting },
      totalVotes,
      margin,
      called: pctReporting > 0.5 && margin !== null && margin > 0.10,
      candidates: sorted.map(c => ({
        name: c.bnm,
        party: c.pty,
        votes: Number(c.vct),
        pct: Number(c.pct),
      })),
    };
  });

  return Response.json({ races, updatedAt: new Date().toISOString() });
}
```

---

## Client-Side Polling Pattern

Use this pattern in both frontend pages:

```ts
const POLL_INTERVAL = 60_000; // 60 seconds

useEffect(() => {
  const fetchData = async () => {
    const res = await fetch("/api/results");
    const data = await res.json();
    setRaces(data.races);
    setLastUpdated(data.updatedAt);
  };

  fetchData(); // fetch immediately on mount
  const interval = setInterval(fetchData, POLL_INTERVAL);
  return () => clearInterval(interval);
}, []);
```

---

## Framer Embed Setup

In Framer, use an **Embed** element (not a Code Component) for each view:

| Page | Embed URL |
|------|-----------|
| Balance of Power hub page | `https://your-app.vercel.app/balance-of-power` |
| Individual candidate page | `https://your-app.vercel.app/race-result?gid=XXXX` |
| Team Up NC aggregate page | `https://your-app.vercel.app/race-result?view=teamupnc` |

**Recommended iframe height:**
- Balance of Power: `420px` (adjust to fit both chambers)
- Single race result: `220px`
- Aggregate view: scale with number of candidates

**iframe does not auto-resize** by default. Set a safe fixed height in Framer, or implement `postMessage` resize if exact fit is needed.

---

## Styling Notes

- Keep backgrounds **transparent or matching Framer page** so embeds feel native
- Use a `?theme=dark` param if Framer pages have dark backgrounds
- Show a subtle "Last updated: X:XX PM" timestamp in each embed so volunteers know data is live
- Show a loading skeleton on first fetch — don't show empty bars

---

## Build Order

1. **Pull the NCSBE feed now** — fetch the live URL, confirm parsing works, and extract GIDs for all Team Up NC candidates
2. **Populate `config.ts`** with confirmed GIDs and candidate details — this is done weeks ahead, not night-of
3. **Scaffold Next.js app on Vercel** — connect repo, confirm deploy pipeline
4. **Build `/api/results` route** — test with live NCSBE feed, verify parsing and filtering
5. **Build Balance of Power page** — seat bars, thresholds, hover states
6. **Build Race Result page** — single GID view + `?view=teamupnc` aggregate
7. **Test with pre-election feed** — the feed has real candidates and GIDs with `vct: 0`; inject mock vote counts to verify the UI handles live data correctly
8. **Embed in Framer** — set iframe URLs, size embeds, test on mobile and desktop
9. **Freeze and monitor** — no changes after November 1st; set up uptime monitoring

---

## Pre-Election Day Checklist

- [ ] Fetch `https://er.ncsbe.gov/enr/20261103/data/results_0.txt` and confirm the feed is live with candidates populated
- [ ] Confirm `ogl` values for Senate (`NCS`), House (`NCH`), and Supreme Court (`SPC`) in the actual feed
- [ ] Extract and verify GID for every Team Up NC candidate — populate `config.ts` (do this weeks ahead)
- [ ] Test Balance of Power UI with injected mock vote data against real candidate structure
- [ ] Test each candidate embed URL in Framer with the correct GIDs
- [ ] Confirm Vercel edge caching is working (check response headers for `cache-control`)
- [ ] Freeze all Framer embed URLs and page layouts by November 1st
- [ ] Set up a simple uptime monitor (e.g. Better Uptime free tier) pointed at `/api/results`
- [ ] Do a live dry run on a prior election night or primary results night if possible
