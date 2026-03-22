# NC Election Night Dashboard — Architecture

## Project Overview

A real-time election night dashboard for **Team Up NC** that displays:
1. **Balance of Power** — seat tallies for NC Senate and NC House with majority/supermajority thresholds
2. **Judicial Battleground** — contested NC Supreme Court and Court of Appeals races
3. **Legislative Battleground** — featured Team Up NC candidate races with hold/flip tracking

The app is hosted on **Vercel (Next.js)** and embedded into a **Framer** page via `<iframe>`. There are no user logins, no writes, and no database.

---

## Data Source

**NCSBE Live Results Feed**
```
https://er.ncsbe.gov/enr/20261103/data/results_0.txt
```

- URL is structured as `/enr/YYYYMMDD/data/results_0.txt` — `20261103` is the confirmed election date (November 3, 2026)
- The feed is published in advance with candidates and GIDs populated
- Updates every 3–7 minutes once polls close on election night
- Returns a flat array of concatenated JSON objects (no commas between objects — must be fixed before parsing)
- One record per **candidate** per **race**
- All votes start at `0` until polls close

### Key Fields

| Field | Description |
|-------|-------------|
| `gid` | Race ID — groups all candidates in the same race |
| `cnm` | Race name (e.g. `NC STATE SENATE DISTRICT 007 (VOTE FOR 1)`) |
| `bnm` | Candidate name (format: "First Last") |
| `pty` | Party: `REP`, `DEM`, `LIB`, etc. |
| `vct` | Vote count |
| `pct` | Vote percentage (string, e.g. `"43.2500"`) |
| `prt` | Precincts reporting |
| `ptl` | Total precincts in race |
| `evc` | Early votes |
| `ovc` | Overseas/provisional votes |
| `ogl` | Office level: `NCS` = NC Senate, `NCH` = NC House, `SPC` = NC Supreme Court, `COA` = Court of Appeals |
| `ref` | `1` if referendum, `0` if candidate race |

### Parsing the Feed

```js
const text = await res.text();
const fixed = "[" + text.replace(/\}\{/g, "},{") + "]";
const records = JSON.parse(fixed);
```

### Tracked Races

```js
// Legislative (balance of power)
const senateRecords = records.filter(r => r.ogl === "NCS" && r.ref === "0");
const houseRecords  = records.filter(r => r.ogl === "NCH" && r.ref === "0");

// Judicial (battleground)
const supremeCourtRecords = records.filter(r => r.ogl === "SPC" && r.ref === "0");
const coaRecords          = records.filter(r => r.ogl === "COA" && r.ref === "0");
```

---

## NC Chamber Thresholds

| Chamber | Total Seats | Majority | Supermajority |
|---------|------------|----------|---------------|
| NC Senate | 50 | 26 | 30 (60%) |
| NC House | 120 | 61 | 72 (60%) |

---

## Architecture

```
Local static files (staging/prior JSON) — pre-election
NCSBE live feed (election night) — future
        │
        ▼
Vercel API Route: /api/results?source=<2024|2026|2026-clean>
  - Parses results JSON, filters to tracked races
  - Computes per-race leader, margin, % precincts reporting
  - Loads prior-election file for hold/flip context
  - Returns { races, priorSeats, updatedAt, source }
  - Edge-cached for 60 seconds (revalidate = 60)
        │
        ▼
/balance-of-power  (single full-page iframe embedded in Framer)
  - Three-tab view: 2026 Election Night | 2026 Preview | 2024 Final
  - Polling active only on/after November 1, 2026 (POLL_ACTIVE flag)
```

---

## File Structure

```
/
├── app/
│   ├── api/
│   │   └── results/
│   │       └── route.ts          # API route — parses results, loads prior data
│   ├── balance-of-power/
│   │   └── page.tsx              # Main dashboard page
│   ├── race-result/
│   │   └── page.tsx              # Single-race widget for individual candidate Framer pages
│   └── layout.tsx
├── lib/
│   ├── parseResults.ts           # NCSBE feed parser + race summarizer
│   ├── priorResults.ts           # Prior-election lookup builder (PriorSeat type)
│   ├── featuredCandidates.ts     # Team Up NC candidate config
│   └── config.ts                 # Chamber thresholds + GID lists
├── tests/
│   ├── staging_2026.json         # Mock 2026 data with early returns (local dev)
│   ├── staging_2026_clean.json   # Zero-vote 2026 file (production zero state)
│   ├── prior_2024.json           # Final 2024 results (used as prior for 2026)
│   └── prior_2022.json           # Final 2022 results (used as prior for 2024)
└── public/
```

---

## API Route (`/api/results`)

Three `source` modes, selected via query param:

| `source` | File used | Prior file | Purpose |
|----------|-----------|------------|---------|
| `2026-clean` | `staging_2026_clean.json` (hardcoded) | `prior_2024.json` | Production zero state — always clean, ignores env var |
| `2026` | `STAGING_2026_FILE` env var (default: `staging_2026_clean.json`) | `prior_2024.json` | Preview/dev — swap file via `.env.local` |
| `2024` | `prior_2024.json` | `prior_2022.json` | 2024 final results compared against 2022 |

Response shape:
```ts
{
  races: RaceSummary[];
  priorSeats: Record<string, PriorSeat>;
  updatedAt: string;
  source: string;
}
```

---

## Feature: Balance of Power (`/balance-of-power`)

### Tabs

| Tab label | source param | Default |
|-----------|-------------|---------|
| 2026 Election Night | `2026-clean` | ✓ |
| 2026 Preview | `2026` | |
| 2024 Final | `2024` | |

### Polling Behavior

```ts
const POLL_ACTIVE = new Date() >= new Date("2026-11-01T00:00:00");
```
- Before November 1, 2026: fully static — no polling, no countdown
- On/after November 1: polls every 60 seconds, shows countdown timer

### Header ("Election Watch")

- Logo + "Election Watch" h2 + subtitle in a top row
- Subtitle: `NCSBE Data as of [date/time]` + countdown when `POLL_ACTIVE`
- Tabs: segmented control, always horizontal, wraps on mobile
- No blue banner — removed; source-specific status lives in the card's grey header bar

### Supermajority Bars Card

- Grey header bar shows status summary (e.g., "Supermajority Partially Broken · Senate: 28 R | House: 71 R")
- Senate and House bars, each with:
  - Seat blocks colored by leader/confidence
  - Majority and supermajority threshold markers
  - Summary note below bar: e.g., "2 leading flips · 3 tight races" (2026) or seat count summary (2024)

### Seat Coloring

| State | Color |
|-------|-------|
| DEM leading, ≥50% precincts in | Solid blue |
| DEM leading, <50% precincts in | Faded blue |
| REP leading, ≥50% precincts in | Solid red |
| REP leading, <50% precincts in | Faded red |
| Margin <4% (competitive) | Amber/striped |
| No votes yet | Gray |

### Hover State (Battleground Cards)

- Shows 2024 prior result: party name (colored), margin %, vote total
- Uses `priorTotalVotes` from prior election file (not current file, which starts at 0)

### Hold/Flip Badges (zero-vote 2026 state)

- When `source !== "2024"` and `pctReporting === 0`:
  - "DEM HOLD" (blue) if DEM won in 2024
  - "FLIP" (amber) if REP won in 2024
- Badge disappears once votes start reporting

### Judicial Battleground

- NC Supreme Court rendered first, then NC Court of Appeals
- 3 CoA seats up in 2026 (Seats 01, 02, 03)
- 1 SC seat up in 2026 (Earls seat)
- Configured in `lib/config.ts`: `SC_CONFIG`, `COA_CONFIG`

### Featured Candidates (Legislative Battleground)

- Tracked by GID in `TEAM_UP_NC_GIDS` (`lib/config.ts`)
- Featured candidate matching uses last whitespace token of `bnm` field (last name)
- Cards show candidate name, race, vote bars, margin, hold/flip badge

---

## Key Types

```ts
type Source = "2024" | "2026" | "2026-clean";

type PriorSeat = {
  winnerParty: string;
  margin: number | null;   // decimal margin, e.g. 0.032; null = uncontested
  totalVotes: number;
};

type SeatVisual = {
  // ... race fields
  priorMargin: number | null;
  priorParty: string | null;
  priorTotalVotes: number | null;
};
```

---

## Framer Embed Setup

| Page | Embed URL |
|------|-----------|
| Election Watch hub page | `https://your-app.vercel.app/balance-of-power` |
| Individual candidate page | `https://your-app.vercel.app/race-result?gid=XXXX` |
| Individual candidate (compact) | `https://your-app.vercel.app/race-result?gid=XXXX&compact=true` |
| Individual candidate (dark theme) | `https://your-app.vercel.app/race-result?gid=XXXX&theme=dark` |

The balance-of-power page defaults to the "2026 Election Night" tab (zero-vote state). Visitors can switch to Preview or 2024 tabs.

**Recommended iframe heights:** The back-to-top button is handled by the Framer page — embedded pages do not render one.
- Balance of Power: scale to content (no fixed height needed)
- Single race result: `~220px`, adjust for candidate count

---

## Candidate Widget (`/race-result?gid=XXXX`)

A single-race embed for individual Framer candidate pages. Uses the same card design as the balance-of-power battleground cards.

### URL Params

| Param | Description |
|-------|-------------|
| `gid` | Race GID — required |

### Features

- **2024/2026 toggle** — small pill toggle, defaults to 2024 Final
- Same card: district label, hold/flip badge, % reporting, candidate bars with avatar circles, vote margin, hover footer with prior result
- Polling active only on/after November 1, 2026 (same `POLL_ACTIVE` flag)
- Sources: `2024` → final 2024 results; `2026-clean` → zero-vote/live 2026 file

---

## Pre-Election Day Checklist

- [ ] Fetch `https://er.ncsbe.gov/enr/20261103/data/results_0.txt` and confirm feed is live with candidates populated
- [ ] Confirm `ogl` values for Senate (`NCS`), House (`NCH`), Supreme Court (`SPC`), Court of Appeals (`COA`) in actual feed
- [ ] Extract and verify GID for every Team Up NC candidate — update `TEAM_UP_NC_GIDS` in `lib/config.ts`
- [ ] Verify `SC_CONFIG` and `COA_CONFIG` compositions in `lib/config.ts` against confirmed post-2024 results
- [ ] Replace `staging_2026_clean.json` with the real zero-vote feed file once NCSBE publishes it
- [ ] Set `STAGING_2026_FILE=staging_2026.json` in `.env.local` for local preview testing
- [ ] Test Balance of Power UI with injected mock vote data against real candidate structure
- [ ] Confirm Vercel edge caching is working (check `cache-control` response headers)
- [ ] Freeze all Framer embed URLs and page layouts by November 1st
- [ ] Set up a simple uptime monitor (e.g. Better Uptime free tier) pointed at `/api/results`
- [ ] Do a live dry run on a prior election or primary night if possible
