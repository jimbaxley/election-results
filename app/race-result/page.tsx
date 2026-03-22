"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RaceSummary } from "../../lib/parseResults";
import type { PriorSeat } from "../../lib/priorResults";
import { isFeaturedCandidate } from "../../lib/featuredCandidates";

// ─── Brand tokens (matches balance-of-power) ─────────────────────────────────
const C = {
  primary:        "#042567",
  primaryMid:     "#233C7E",
  secondary:      "#A6266E",
  bg:             "#fcf8f8",
  surface:        "#ffffff",
  surfaceLow:     "#f7f3f2",
  surfaceTrack:   "#f1eded",
  surfaceHigh:    "#e5e2e1",
  onBg:           "#1c1b1c",
  outline:        "#757681",
  outlineVariant: "#c5c6d2",
} as const;

type Source = "2024" | "2026-clean";

const POLL_ACTIVE = new Date() >= new Date("2026-11-01T00:00:00");
const POLL_INTERVAL = 60_000;

type ApiResponse = {
  races: RaceSummary[];
  priorSeats: Record<string, PriorSeat>;
  updatedAt: string;
};

type SeatStatus = "FLIPPED" | "LEADING_FLIP" | "HOLD" | "OPEN";

type SeatVisual = {
  gid: string;
  districtLabel: string;
  ogl: string;
  leaderName: string;
  leaderParty: string;
  runnerUpName: string;
  runnerUpParty: string;
  margin: number | null;
  pctReporting: number;
  totalVotes: number;
  incumbentParty: string | null;
  priorMargin: number | null;
  priorTotalVotes: number | null;
  seatStatus: SeatStatus;
  allCandidates: { name: string; party: string; pct: number }[];
};

// "HAYES, RACHEL" → "Rachel Hayes"
function formatName(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 2) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return `${cap(parts[1])} ${cap(parts[0])}`;
  }
  return raw;
}

function formatDistrictLabel(race: RaceSummary): string {
  const match = race.cnm.match(/DISTRICT\s+0*([0-9]+)/i);
  if (!match) return race.cnm.split(" - ")[0] ?? race.cnm;
  const num = match[1];
  if (race.ogl === "NCS") return `SD-${num}`;
  if (race.ogl === "NCH") return `HD-${num}`;
  return race.cnm;
}

function toSeatVisual(race: RaceSummary, priorSeats: Record<string, PriorSeat>): SeatVisual {
  const leader   = race.candidates[0];
  const runnerUp = race.candidates[1];
  const prior    = priorSeats[race.cnm] ?? null;
  const leaderParty = leader?.party ?? "";
  const hasReporting = race.precincts.reporting > 0;

  let seatStatus: SeatStatus = "OPEN";
  if (prior && hasReporting) {
    const flipped = leaderParty !== "" && leaderParty !== prior.winnerParty;
    seatStatus = flipped
      ? race.precincts.pct >= 0.9 ? "FLIPPED" : "LEADING_FLIP"
      : "HOLD";
  }

  return {
    gid:             race.gid,
    districtLabel:   formatDistrictLabel(race),
    ogl:             race.ogl,
    leaderName:      leader?.name    ?? "",
    leaderParty,
    runnerUpName:    runnerUp?.name  ?? "",
    runnerUpParty:   runnerUp?.party ?? "",
    margin:          race.margin,
    pctReporting:    race.precincts.pct,
    totalVotes:      race.totalVotes,
    incumbentParty:  prior?.winnerParty   ?? null,
    priorMargin:     prior?.margin        ?? null,
    priorTotalVotes: prior?.totalVotes    ?? null,
    seatStatus,
    allCandidates: race.candidates.map((c) => ({ name: c.name, party: c.party, pct: c.pct * 100 })),
  };
}

function leaderCircleStyle(
  seatStatus: SeatStatus,
  leaderParty: string,
  margin: number | null,
  pctReporting: number,
) {
  const isFlip = seatStatus === "FLIPPED" || seatStatus === "LEADING_FLIP";
  if (isFlip) {
    if (leaderParty === "DEM") {
      return seatStatus === "FLIPPED"
        ? { bg: "#16a34a", border: "#15803d", text: "#ffffff" }
        : { bg: "#bbf7d0", border: "#86efac", text: "#166534" };
    } else {
      return seatStatus === "FLIPPED"
        ? { bg: "#dc2626", border: "#b91c1c", text: "#ffffff" }
        : { bg: "#fecaca", border: "#fca5a5", text: "#991b1b" };
    }
  }
  if (margin === null || pctReporting < 0.05) {
    return { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };
  }
  if (pctReporting >= 0.5 && margin > 0.05) {
    return { bg: "#bbf7d0", border: "#86efac", text: "#166534" };
  }
  if (pctReporting >= 0.25 && margin > 0.02) {
    return { bg: "#dcfce7", border: "#bbf7d0", text: "#166534" };
  }
  if (pctReporting >= 0.1 && margin !== null && margin >= 0) {
    return { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" };
  }
  return { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };
}

const runnerUpCircle = { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };

function RaceWidget({ seat, source }: { seat: SeatVisual; source: Source }) {
  const voteDiff =
    seat.margin !== null && seat.totalVotes > 0
      ? Math.round(seat.margin * seat.totalVotes).toLocaleString()
      : null;

  const showFooter = source !== "2024" && seat.priorMargin !== null;
  const leaderStyle = leaderCircleStyle(seat.seatStatus, seat.leaderParty, seat.margin, seat.pctReporting);

  const isFlipEvent = seat.seatStatus === "FLIPPED" || seat.seatStatus === "LEADING_FLIP";
  const isDemFlip   = isFlipEvent && seat.leaderParty === "DEM";
  const isRepFlip   = isFlipEvent && seat.leaderParty === "REP";
  const confirmed   = seat.seatStatus === "FLIPPED";

  const holdParty = seat.incumbentParty ?? seat.leaderParty;
  let sb: { label: string; bg: string; color: string } = { label: `${holdParty} HOLD`, bg: `${C.primaryMid}18`, color: C.primaryMid };
  if (source !== "2024" && seat.pctReporting === 0 && seat.incumbentParty) {
    sb = seat.incumbentParty === "DEM"
      ? { label: "DEM HOLD", bg: `${C.primaryMid}18`, color: C.primaryMid }
      : { label: "FLIP", bg: "#fef9c3", color: "#854d0e" };
  } else if (seat.seatStatus === "OPEN") {
    sb = { label: "OPEN", bg: C.surfaceHigh, color: C.outline };
  } else if (isDemFlip) {
    sb = confirmed
      ? { label: "↺ DEM FLIPS SEAT",    bg: "#dcfce7", color: "#15803d" }
      : { label: "↺ DEM LEADING (FLIP)", bg: "#bbf7d0", color: "#166534" };
  } else if (isRepFlip) {
    sb = confirmed
      ? { label: "↺ REP FLIPS SEAT",    bg: "#fee2e2", color: "#dc2626" }
      : { label: "↺ REP LEADING (FLIP)", bg: "#fecaca", color: "#b91c1c" };
  }

  const flipBorderColor = isDemFlip ? "#16a34a" : isRepFlip ? "#dc2626" : null;
  const flipBorder = flipBorderColor
    ? `3px solid ${flipBorderColor}`
    : `1px solid ${C.outlineVariant}50`;

  return (
    <div
      className="race-card"
      style={{
        background: C.surface,
        borderRadius: 12,
        borderLeft: flipBorder,
        borderRight: `1px solid ${C.outlineVariant}50`,
        borderTop: `1px solid ${C.outlineVariant}50`,
        borderBottom: `1px solid ${C.outlineVariant}50`,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "10px 14px",
          background: C.surfaceLow,
          borderBottom: `1px solid ${C.outlineVariant}30`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.primary }}>
            {seat.districtLabel}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              padding: "2px 7px",
              background: sb.bg,
              color: sb.color,
            }}
          >
            {sb.label}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.outline, letterSpacing: "0.04em" }}>
          {Math.round(seat.pctReporting * 100)}% Reporting
        </span>
      </div>

      {/* Candidates */}
      <div style={{ padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {seat.allCandidates.map((cand) => {
          const isLeader = cand.party === seat.leaderParty;
          const isD      = cand.party === "DEM";
          const barColor = isD ? C.primaryMid : C.secondary;
          const circle   = isLeader ? leaderStyle : runnerUpCircle;
          return (
            <div key={cand.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: `2px solid ${circle.border}`,
                  background: circle.bg,
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: circle.text,
                  overflow: "hidden",
                }}
              >
                {isFeaturedCandidate(formatName(cand.name))
                  ? <img src="/donkey-logo.png" alt="Team Up NC" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : cand.party || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.onBg }}>
                    {formatName(cand.name)}{" "}
                    <span style={{ fontWeight: 500, color: C.outline }}>({cand.party})</span>
                  </span>
                  <span style={{ color: barColor, flexShrink: 0, marginLeft: 6 }}>
                    {cand.pct > 0 ? `${cand.pct.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.surfaceTrack, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${cand.pct}%`, background: barColor, borderRadius: 3 }} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Vote margin */}
        {voteDiff && (
          <div
            style={{
              fontSize: 14, color: C.outline, fontWeight: 400,
              textAlign: "center",
              borderTop: `1px solid ${C.outlineVariant}30`,
              paddingTop: 8,
            }}
          >
            Margin: {voteDiff} votes | {(seat.margin! * 100).toFixed(2)}%
          </div>
        )}
      </div>

      {/* Footer — prior result (always visible in 2026 mode) */}
      {showFooter && (
        <div
          style={{
            padding: "8px 14px",
            background: `${C.primary}08`,
            borderTop: `1px solid ${C.outlineVariant}30`,
            fontSize: 10, fontWeight: 700, textAlign: "center",
            color: C.outline, letterSpacing: "0.04em",
          }}
        >
          2024:{" "}
          <span
            style={{
              color: seat.incumbentParty === "DEM" ? C.primaryMid
                   : seat.incumbentParty === "REP" ? C.secondary
                   : C.outline,
              fontWeight: 900,
            }}
          >
            {seat.incumbentParty ?? "?"}
          </span>
          {seat.priorTotalVotes && seat.priorMargin !== null
            ? ` +${Math.round(seat.priorMargin * seat.priorTotalVotes).toLocaleString()} votes · `
            : " · "}
          +{(seat.priorMargin! * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// Parse "HD-24" → { ogl: "NCH", district: "24" }
// Parse "SD-11" → { ogl: "NCS", district: "11" }
function parseDistrictParam(param: string): { ogl: string; district: string } | null {
  const match = param.trim().toUpperCase().match(/^(HD|SD)-?(\d+)$/);
  if (!match) return null;
  return { ogl: match[1] === "HD" ? "NCH" : "NCS", district: String(Number(match[2])) };
}

function findRaceByDistrict(races: RaceSummary[], param: string): RaceSummary | undefined {
  const parsed = parseDistrictParam(param);
  if (!parsed) return undefined;
  return races.find((race) => {
    if (race.ogl !== parsed.ogl) return false;
    const m = race.cnm.match(/DISTRICT\s+0*([0-9]+)/i);
    return m ? String(Number(m[1])) === parsed.district : false;
  });
}

function RaceResultPageContent() {
  const searchParams = useSearchParams();
  const districtParam = searchParams.get("district");

  const [source, setSource] = useState<Source>("2024");
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [priorSeats, setPriorSeats] = useState<Record<string, PriorSeat>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/results?source=${source}`);
        if (!res.ok) throw new Error(`Failed to load results (${res.status})`);
        const data = (await res.json()) as ApiResponse;
        setRaces(data.races ?? []);
        setPriorSeats(data.priorSeats ?? {});
        setLastUpdated(data.updatedAt ?? "");
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch results");
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchData();

    if (!POLL_ACTIVE) return;
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [source]);

  const race = districtParam ? findRaceByDistrict(races, districtParam) : undefined;
  const seat = race ? toSeatVisual(race, priorSeats) : null;

  const tabs: { label: string; src: Source }[] = [
    { label: "2024", src: "2024" },
    { label: "2026", src: "2026-clean" },
  ];

  return (
    <main style={{ background: "transparent", minHeight: "100vh", padding: 16 }}>
      <style>{`
        .race-card { transition: box-shadow 0.2s, transform 0.2s; cursor: default; }
        .race-card:hover { box-shadow: 0 8px 24px rgba(4,37,103,0.13) !important; transform: translateY(-2px); }
      `}</style>

      {/* Toggle + timestamp row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "inline-flex",
            border: `1px solid ${C.outlineVariant}`,
            borderRadius: 8,
            overflow: "hidden",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {tabs.map((tab) => {
            const active = source === tab.src;
            return (
              <button
                key={tab.src}
                onClick={() => setSource(tab.src)}
                style={{
                  padding: "6px 14px",
                  border: "none",
                  borderRight: tab.src === "2024" ? `1px solid ${C.outlineVariant}` : "none",
                  background: active ? C.primary : C.surface,
                  color: active ? "#fff" : C.outline,
                  cursor: "pointer",
                  fontWeight: active ? 700 : 500,
                  fontSize: 12,
                  letterSpacing: "0.02em",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 10, color: C.outline }}>
            {source === "2024" ? "2024 Final Results" : `Updated ${new Date(lastUpdated).toLocaleTimeString()}`}
          </span>
        )}
      </div>

      {loading && <p style={{ color: C.outline, fontSize: 14 }}>Loading…</p>}
      {error   && <p style={{ color: C.secondary, fontSize: 14 }}>{error}</p>}

      {!loading && !error && seat && (
        <RaceWidget seat={seat} source={source} />
      )}

      {!loading && !error && !seat && districtParam && (
        <p style={{ color: C.outline, fontSize: 14 }}>No race found for &ldquo;{districtParam}&rdquo;.</p>
      )}

      {!loading && !error && !districtParam && (
        <p style={{ color: C.outline, fontSize: 14 }}>Pass a district with ?district=HD-24 or ?district=SD-11</p>
      )}


    </main>
  );
}

export default function RaceResultPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16 }}>Loading…</main>}>
      <RaceResultPageContent />
    </Suspense>
  );
}
