"use client";

import { useEffect, useMemo, useState } from "react";
import { CHAMBER_CONFIG, COA_CONFIG, SC_CONFIG } from "../../lib/config";
import type { RaceSummary } from "../../lib/parseResults";
import { COMPETITIVE_THRESHOLD } from "../../lib/priorResults";
import type { PriorSeat } from "../../lib/priorResults";
import { isFeaturedCandidate } from "../../lib/featuredCandidates";

const POLL_INTERVAL = 60_000;

// ─── Brand tokens (Team Up NC) ───────────────────────────────────────────────
const C = {
  primary:        "#042567",   // deep navy – headings
  primaryMid:     "#233C7E",   // mid navy – bars, accents
  secondary:      "#A6266E",   // magenta – REP / accents
  bg:             "#fcf8f8",   // warm off-white page bg
  surface:        "#ffffff",   // card surface
  surfaceLow:     "#f7f3f2",   // card header bg
  surfaceTrack:   "#f1eded",   // progress bar track
  surfaceHigh:    "#e5e2e1",   // divider / highest surface
  onBg:           "#1c1b1c",
  outline:        "#757681",   // secondary text
  outlineVariant: "#c5c6d2",   // subtle borders
} as const;

// ─── Jump-button sizing (adjust here to resize all four chamber/court buttons) ─
const BTN = {
  labelSize:   16,  // header label font size (px)
  circleSize:  18,  // circle button diameter (px)
  arrowSize:   10,  // ↓ arrow font size inside circle (px)
} as const;

type ApiResponse = {
  races: RaceSummary[];
  priorSeats: Record<string, PriorSeat>;
  updatedAt: string;
};

type SeatStatus = "FLIPPED" | "LEADING_FLIP" | "HOLD" | "OPEN";

type SeatVisual = {
  gid: string;
  districtLabel: string;
  leaderName: string;
  leaderParty: string;
  leaderPct: number;
  runnerUpName: string;
  runnerUpParty: string;
  runnerUpPct: number;
  margin: number | null;
  pctReporting: number;
  totalVotes: number;
  // Prior-election context
  incumbentParty: string | null;
  priorMargin: number | null;
  seatStatus: SeatStatus;
  hasFeaturedCandidate: boolean;
  allCandidates: { name: string; party: string; pct: number }[];
};


function extractDistrictNumber(label: string): number {
  const match = label.match(/DISTRICT\s+0*([0-9]+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isBattlegroundSeat(seat: SeatVisual): boolean {
  if (seat.hasFeaturedCandidate) return true;
  // Flips always show — the change itself is the story regardless of margin.
  if (seat.seatStatus === "FLIPPED" || seat.seatStatus === "LEADING_FLIP") return true;
  // Holds and open seats only show if currently within the competitive threshold.
  return seat.margin !== null && seat.margin < COMPETITIVE_THRESHOLD;
}

function seatCurrentParty(seat: SeatVisual): string {
  if (seat.pctReporting > 0) return seat.leaderParty;
  return seat.incumbentParty ?? "";
}


function formatSeatLabel(chamber: "senate" | "house", label: string): string {
  const match = label.match(/DISTRICT\s+0*([0-9]+)/i);
  if (!match) return label;
  return `${chamber === "senate" ? "SD" : "HD"}-${match[1]}`;
}

// "HAYES, RACHEL" → "Rachel Hayes"
function formatName(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 2) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return `${cap(parts[1])} ${cap(parts[0])}`;
  }
  return raw;
}

function toSeatVisual(
  race: RaceSummary,
  priorSeats: Record<string, PriorSeat>,
): SeatVisual {
  const leader   = race.candidates[0];
  const runnerUp = race.candidates[1];
  const prior    = priorSeats[race.cnm] ?? null;
  const leaderParty = leader?.party ?? "";
  const hasReporting = race.precincts.reporting > 0;

  let seatStatus: SeatStatus = "OPEN";
  if (prior && hasReporting) {
    const flipped = leaderParty !== "" && leaderParty !== prior.winnerParty;
    if (flipped) {
      seatStatus = race.precincts.pct >= 0.9 ? "FLIPPED" : "LEADING_FLIP";
    } else {
      seatStatus = "HOLD";
    }
  }

  return {
    gid:           race.gid,
    districtLabel: race.cnm,
    leaderName:    leader?.name    ?? "No leader",
    leaderParty,
    leaderPct:     (leader?.pct    ?? 0) * 100,
    runnerUpName:  runnerUp?.name  ?? "",
    runnerUpParty: runnerUp?.party ?? "",
    runnerUpPct:   (runnerUp?.pct  ?? 0) * 100,
    margin:        race.margin,
    pctReporting:  race.precincts.pct,
    totalVotes:    race.totalVotes,
    incumbentParty: prior?.winnerParty ?? null,
    priorMargin:    prior?.margin ?? null,
    seatStatus,
    hasFeaturedCandidate: race.candidates.some((c) => isFeaturedCandidate(formatName(c.name))),
    allCandidates: [...race.candidates]
      .sort((a, b) => {
        const aFeatured = isFeaturedCandidate(formatName(a.name)) ? 0 : 1;
        const bFeatured = isFeaturedCandidate(formatName(b.name)) ? 0 : 1;
        return aFeatured - bFeatured;
      })
      .map((c) => ({ name: c.name, party: c.party, pct: c.pct * 100 })),
  };
}


// Avatar circle colour for the leader.
// Green only for a DEM flipping a REP seat; red for REP flipping a DEM seat.
// For holds/open seats, subtle confidence tint based on margin (no reporting threshold).
function leaderCircleStyle(
  seatStatus: SeatStatus,
  leaderParty: string,
  margin: number | null,
  pctReporting: number,
) {
  const isFlip = seatStatus === "FLIPPED" || seatStatus === "LEADING_FLIP";
  if (isFlip) {
    if (leaderParty === "DEM") {
      // DEM flipping a REP seat → green
      return seatStatus === "FLIPPED"
        ? { bg: "#16a34a", border: "#15803d", text: "#ffffff" }
        : { bg: "#bbf7d0", border: "#86efac", text: "#166534" };
    } else {
      // REP flipping a DEM seat → red
      return seatStatus === "FLIPPED"
        ? { bg: "#dc2626", border: "#b91c1c", text: "#ffffff" }
        : { bg: "#fecaca", border: "#fca5a5", text: "#991b1b" };
    }
  }
  // Non-flip: subtle margin-based confidence tint (no automatic solid-green at 90%)
  if (margin === null || pctReporting < 0.05) {
    return { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };
  }
  if (pctReporting >= 0.5 && margin > 0.05) {
    return { bg: "#bbf7d0", border: "#86efac", text: "#166534" };
  }
  if (pctReporting >= 0.25 && margin > 0.02) {
    return { bg: "#dcfce7", border: "#bbf7d0", text: "#166534" };
  }
  // Too close to call but someone is leading — show a faint pulse tint
  if (pctReporting >= 0.1 && margin !== null && margin >= 0) {
    return { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" };
  }
  return { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };
}

// Runner-up circle: always neutral
const runnerUpCircle = { bg: C.surfaceHigh, border: C.outlineVariant, text: C.outline };

// ─── Shared pill color logic ──────────────────────────────────────────────────
// Yellow while results are still coming in (2026, <90% reporting).
// Red = REP advantage holds. Green = DEM broke/flipped.
function pillStyle(repAdvantage: boolean, pctReporting: number, src: "2024" | "2026") {
  if (src === "2026" && pctReporting < 0.9) {
    return { bg: "#fef3c7", color: "#92400e" };
  }
  return repAdvantage
    ? { bg: "#fee2e2", color: "#dc2626" }
    : { bg: "#dcfce7", color: "#16a34a" };
}

// ─── Judicial Bar (hero row, same style as ChamberBar) ───────────────────────
function JudicialBar({ coaRaces, scRaces, source }: { coaRaces: RaceSummary[]; scRaces: RaceSummary[]; source: "2024" | "2026" }) {
  void coaRaces;
  void scRaces;

  const coa = COA_CONFIG;
  const sc  = SC_CONFIG;

  const coaDemPct = (coa.current.dem / coa.total) * 100;
  const coaRepPct = (coa.current.rep / coa.total) * 100;
  const scDemPct  = (sc.current.dem  / sc.total)  * 100;
  const scRepPct  = (sc.current.rep  / sc.total)  * 100;

  // Source-aware narrative
  // Judicial has no live precinct data — pctReporting 0 keeps 2026 yellow, 1 makes 2024 final red
  const { bg: coaBg, color: coaColor } = pillStyle(true, source === "2024" ? 1 : 0, source);
  const { bg: scBg,  color: scColor  } = pillStyle(true, source === "2024" ? 1 : 0, source);
  const coaPill = { label: source === "2024" ? "GOP SWEPT 2024 · DEM 4→3" : "ALL 3 DEM SEATS ON BALLOT", bg: coaBg, color: coaColor };
  const scPill  = { label: source === "2024" ? "GOP MAJORITY 5–2"          : "1 DEM SEAT ON BALLOT",      bg: scBg,  color: scColor  };

  const coaNote = source === "2024"
    ? "Republicans won all 3 open seats (Murry, Zachary, Freeman), reducing Democrats from 4 to 3 seats."
    : "All 3 remaining Democratic seats — Arrowood, Collins, and Hampson — are contested in November 2026.";
  const scNote     = source === "2024"
    ? "Republicans hold a 5–2 supermajority on the NC Supreme Court."
    : "Justice Anita Earls (D) is the only Supreme Court seat on the 2026 ballot.";

  function CompositionBar({ demPct, repPct, demCount, repCount }: { demPct: number; repPct: number; demCount: number; repCount: number }) {
    return (
      <div style={{ position: "relative", height: 30, borderRadius: 12, overflow: "hidden", background: C.surfaceHigh }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${demPct}%`, background: C.primaryMid }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${repPct}%`, background: C.secondary }} />
        {/* 50% majority line */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.6)", transform: "translateX(-50%)", zIndex: 10 }} />
        <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", zIndex: 2, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
          DEM {demCount}
        </div>
        <div style={{ position: "absolute", right: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", zIndex: 2, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
          REP {repCount}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Supreme Court row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: BTN.labelSize, color: C.primary }}>Supreme Court</span>
          <a href="#judicial-battleground" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: BTN.circleSize, height: BTN.circleSize, borderRadius: "50%", background: `${C.primary}0f`, border: `1px solid ${C.primary}25`, fontSize: BTN.arrowSize, color: C.secondary, fontWeight: 800, flexShrink: 0, transition: "background 0.15s" }}>↓</a>
          <span style={{ fontSize: 11, fontWeight: 700, background: scPill.bg, color: scPill.color, borderRadius: 4, padding: "4px 10px", letterSpacing: "0.04em" }}>
            {scPill.label}
          </span>
        </div>
        <CompositionBar demPct={scDemPct} repPct={scRepPct} demCount={sc.current.dem} repCount={sc.current.rep} />
        <div style={{ fontSize: 10, color: C.outline, lineHeight: 1.4 }}>{scNote}</div>
      </div>

      {/* Court of Appeals row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: BTN.labelSize, color: C.primary }}>Court of Appeals</span>
          <a href="#judicial-battleground" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: BTN.circleSize, height: BTN.circleSize, borderRadius: "50%", background: `${C.primary}0f`, border: `1px solid ${C.primary}25`, fontSize: BTN.arrowSize, color: C.secondary, fontWeight: 800, flexShrink: 0, transition: "background 0.15s" }}>↓</a>
          <span style={{ fontSize: 11, fontWeight: 700, background: coaPill.bg, color: coaPill.color, borderRadius: 4, padding: "4px 10px", letterSpacing: "0.04em" }}>
            {coaPill.label}
          </span>
        </div>
        <CompositionBar demPct={coaDemPct} repPct={coaRepPct} demCount={coa.current.dem} repCount={coa.current.rep} />
        <div style={{ fontSize: 10, color: C.outline, lineHeight: 1.4 }}>{coaNote}</div>
      </div>
    </div>
  );
}

// ─── Supermajority Hero ───────────────────────────────────────────────────────
function SupermajorityHero({
  senateSeats,
  houseSeats,
  coaRaces,
  scRaces,
  source,
  onSourceChange,
  countdown,
  lastUpdated,
}: {
  senateSeats: SeatVisual[];
  houseSeats: SeatVisual[];
  coaRaces: RaceSummary[];
  scRaces: RaceSummary[];
  source: "2024" | "2026";
  onSourceChange: (s: "2024" | "2026") => void;
  countdown: number;
  lastUpdated: string;
}) {
  type ChamberKey = "senate" | "house";

  function chamberStats(seats: SeatVisual[], key: ChamberKey) {
    const cfg = CHAMBER_CONFIG[key];
    const dem = seats.filter((s) => seatCurrentParty(s) === "DEM").length;
    const rep = seats.filter((s) => seatCurrentParty(s) === "REP").length;
    const demPct = (dem / cfg.total) * 100;
    const repPct = (rep / cfg.total) * 100;
    const superPct = ((cfg.total - cfg.supermajority) / cfg.total) * 100;
    const repHasSuper = rep >= cfg.supermajority;
    const demHasSuper = dem >= cfg.supermajority;
    const flipsToBreakRep = repHasSuper ? rep - cfg.supermajority + 1 : null;
    const flipsToBreakDem = demHasSuper ? dem - cfg.supermajority + 1 : null;
    return { cfg, dem, rep, demPct, repPct, superPct, repHasSuper, demHasSuper, flipsToBreakRep, flipsToBreakDem };
  }

  const senate = chamberStats(senateSeats, "senate");
  const house  = chamberStats(houseSeats,  "house");

  // 2024 banner: status label + narrative
  const houseBroken  = !house.repHasSuper;
  const senateBroken = !senate.repHasSuper;
  const houseFlipsNeeded  = house.flipsToBreakRep;
  const senateFlipsNeeded = senate.flipsToBreakRep;

  let statusLabel: string;
  let statusColor: string;
  if (houseBroken && senateBroken) {
    statusLabel = "SUPERMAJORITY BROKEN"; statusColor = "#bbf7d0";
  } else if (houseBroken || senateBroken) {
    statusLabel = "PARTIALLY BROKEN";     statusColor = "#bbf7d0";
  } else if (houseFlipsNeeded !== null || senateFlipsNeeded !== null) {
    statusLabel = "IN JEOPARDY";          statusColor = "#ffd8e6";
  } else {
    statusLabel = "BALANCED";             statusColor = "#e2e8f0";
  }

  function narrative() {
    const broken: string[] = [];
    const needed: string[]  = [];
    if (houseBroken)  broken.push("House");
    if (senateBroken) broken.push("Senate");
    if (houseFlipsNeeded  !== null) needed.push(`${houseFlipsNeeded} Senate flip${houseFlipsNeeded !== 1 ? "s" : ""}`);
    if (senateFlipsNeeded !== null) needed.push(`${senateFlipsNeeded} Senate flip${senateFlipsNeeded !== 1 ? "s" : ""}`);
    const brokenText = broken.length > 0 ? `${broken.join(" & ")} supermajority${broken.length > 1 ? "ies" : ""} already broken.` : "";
    const neededText = needed.length > 0
      ? `Democrats need ${needed.join(" and ")} to ${broken.length > 0 ? "complete the sweep" : "break the Republican supermajority"}.`
      : broken.length > 0 ? "Governor's veto power fully restored in both chambers." : "";
    return [brokenText, neededText].filter(Boolean).join(" ") || "Neither party currently holds a supermajority in either chamber.";
  }

  function ChamberBar({ label, stats, chamberKey, seats }: { label: string; stats: ReturnType<typeof chamberStats>; chamberKey: "house" | "senate"; seats: SeatVisual[] }) {
    const repHasSuper = stats.rep >= stats.cfg.supermajority;
    const seatsShort  = repHasSuper ? 0 : stats.cfg.supermajority - stats.rep;
    const gapLeft  = stats.superPct;
    const gapWidth = stats.demPct - stats.superPct;

    const avgPct = seats.length > 0 ? seats.reduce((sum, s) => sum + s.pctReporting, 0) / seats.length : 0;
    const { bg: outcomeBg, color: outcomeColor } = pillStyle(repHasSuper, avgPct, source);

    // 2026: show flip/leading/tight counts from seat data (same logic as battleground section)
    const allInPlay      = seats.filter(isBattlegroundSeat);
    const confirmedFlips = allInPlay.filter((s) => s.seatStatus === "FLIPPED").length;
    const leadingFlips   = allInPlay.filter((s) => s.seatStatus === "LEADING_FLIP").length;
    const tightRaces     = allInPlay.filter((s) => s.seatStatus === "HOLD" || s.seatStatus === "OPEN").length;
    const parts2026: string[] = [];
    if (confirmedFlips > 0) parts2026.push(`${confirmedFlips} FLIP${confirmedFlips !== 1 ? "S" : ""}`);
    if (leadingFlips   > 0) parts2026.push(`${leadingFlips} LEADING`);
    if (tightRaces     > 0) parts2026.push(`${tightRaces} TIGHT`);
    const raceSummary = parts2026.join(" · ") || (repHasSuper ? "NO RACES IN PLAY" : "NO RACES IN PLAY");

    // Small note under the bar
    const noteParts: string[] = [];
    if (source === "2026") {
      if (confirmedFlips > 0) noteParts.push(`${confirmedFlips} confirmed flip${confirmedFlips !== 1 ? "s" : ""}`);
      if (leadingFlips   > 0) noteParts.push(`${leadingFlips} leading flip${leadingFlips !== 1 ? "s" : ""}`);
      if (tightRaces     > 0) noteParts.push(`${tightRaces} tight race${tightRaces !== 1 ? "s" : ""}`);
    } else {
      if (repHasSuper) {
        noteParts.push(`Republicans hold their supermajority — ${stats.rep} of ${stats.cfg.total} seats.`);
      } else {
        noteParts.push(`Republicans hold ${stats.rep} seats, ${seatsShort} short of the ${stats.cfg.supermajority}-seat supermajority.`);
      }
    }
    const barNote = noteParts.join(" · ");

    const outcomeLabel = source === "2026"
      ? avgPct < 0.9
        ? `SUPERMAJORITY (${stats.cfg.supermajority}) · ${raceSummary || "RESULTS COMING IN"}`
        : `SUPERMAJORITY (${stats.cfg.supermajority}) ${repHasSuper ? "HELD" : "BROKEN"} · ${raceSummary}`
      : repHasSuper
        ? `SUPERMAJORITY (${stats.cfg.supermajority}) HELD`
        : seatsShort === 1
          ? `SUPERMAJORITY (${stats.cfg.supermajority}) BROKEN — 1 SEAT FLIPPED`
          : `SUPERMAJORITY (${stats.cfg.supermajority}) BROKEN — ${seatsShort} SEATS FLIPPED`;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: BTN.labelSize, color: C.primary }}>{label}</span>
            <a href={`#${chamberKey}-battleground`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: BTN.circleSize, height: BTN.circleSize, borderRadius: "50%", background: `${C.primary}0f`, border: `1px solid ${C.primary}25`, fontSize: BTN.arrowSize, color: C.secondary, fontWeight: 800, flexShrink: 0, transition: "background 0.15s" }}>↓</a>
            <span style={{ fontSize: 11, fontWeight: 700, background: outcomeBg, color: outcomeColor, borderRadius: 4, padding: "4px 10px", letterSpacing: "0.04em" }}>
              {outcomeLabel}
            </span>
          </div>
        </div>

        {/* Bar */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative", height: 30, borderRadius: 12, overflow: "hidden", background: C.surfaceHigh }}>
            {/* DEM from left */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${stats.demPct}%`, background: C.primaryMid }} />
            {/* Gap overlay only when result is confirmed (2024, or 2026 ≥90%) */}
            {!repHasSuper && gapWidth > 0 && (source === "2024" || avgPct >= 0.9) && (
              <div style={{ position: "absolute", left: `${gapLeft}%`, top: 0, bottom: 0, width: `${gapWidth}%`, background: "#16a34a", opacity: 0.85 }} />
            )}
            {/* REP from right */}
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${stats.repPct}%`, background: C.secondary }} />
            {/* Supermajority threshold marker — white in 2026 preview, colored once confirmed */}
            <div style={{
              position: "absolute",
              left: `${stats.superPct}%`,
              top: 0, bottom: 0,
              width: 3,
              background: (source === "2026" && avgPct < 0.9) ? "rgba(255,255,255,0.75)" : outcomeColor,
              transform: "translateX(-50%)",
              zIndex: 10,
              boxShadow: (source === "2026" && avgPct < 0.9) ? "none" : `0 0 6px ${outcomeColor}80`,
            }} />
            {/* DEM count inside bar */}
            <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#ffffff", letterSpacing: "0.03em", zIndex: 11, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
              DEM {stats.dem}
            </div>
            {/* REP count inside bar */}
            <div style={{ position: "absolute", right: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#ffffff", letterSpacing: "0.03em", zIndex: 11, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
              REP {stats.rep}
            </div>
          </div>
        </div>
        {barNote && <div style={{ fontSize: 10, color: C.outline, lineHeight: 1.4 }}>{barNote}</div>}
      </div>
    );
  }

  return (
    <section style={{ marginBottom: 48 }}>
      {/* Thin status banner */}
      <div style={{ background: C.primary, borderRadius: "10px 10px 0 0", padding: "0 24px", height: 50, display: "flex", alignItems: "center", gap: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(4,37,103,0.25)" }}>
        {source === "2026" ? (
          <>
            <span style={{ background: C.secondary, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 10px", letterSpacing: "0.08em", flexShrink: 0 }}>
              LIVE ANALYSIS
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
              {countdown > 0 ? `Updating in ${countdown}s` : "Updating…"}
            </span>
          </>
        ) : (
          <>
            <span style={{ background: C.secondary, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 10px", letterSpacing: "0.08em", flexShrink: 0 }}>
              2024 FINAL RESULTS
            </span>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#fff", flexShrink: 0 }}>
              Supermajority Status:
            </span>
            <span style={{ fontWeight: 900, fontSize: 13, color: statusColor, flexShrink: 0 }}>
              {statusLabel}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontWeight: 500 }}>
              {narrative()}
            </span>
          </>
        )}
      </div>

      {/* Full-width Election Watch card */}
      <div style={{ background: C.surface, borderRadius: "0 0 12px 12px", border: `1px solid ${C.outlineVariant}40`, borderTop: "none", padding: "28px 32px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.primary, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/donkey-logo.png" alt="" style={{ height: 32, width: "auto" }} />
            Election Watch
          </h1>
          {/* Source toggle */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(["2024", "2026"] as const).map((yr) => {
              const isActive = source === yr;
              const label = yr === "2024" ? "2024 Results" : "2026 Preview";
              const sub   = yr === "2024"
                ? "Nov 5, 2024 · Final"
                : lastUpdated
                  ? new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · Live"
                  : "Nov 3, 2026 · Pending";
              return (
                <button
                  key={yr}
                  onClick={() => onSourceChange(yr)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${isActive ? C.primary : C.outlineVariant}`,
                    background: isActive ? C.primary : "transparent",
                    color: isActive ? "#fff" : C.outline,
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>{label}</span>
                  <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>{sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ChamberBar label="House" stats={house} chamberKey="house" seats={houseSeats} />
        <ChamberBar label="Senate" stats={senate} chamberKey="senate" seats={senateSeats} />
        <JudicialBar coaRaces={coaRaces} scRaces={scRaces} source={source} />
      </div>
    </section>
  );
}

// ─── Battleground Section ─────────────────────────────────────────────────────
function BattlegroundSection({
  chamber,
  seats,
  source,
}: {
  chamber: "senate" | "house";
  seats: SeatVisual[];
  source: "2024" | "2026";
}) {
  const config = CHAMBER_CONFIG[chamber];
  const repLeads = seats.filter((s) => seatCurrentParty(s) === "REP");

  const allInPlay = seats.filter(isBattlegroundSeat).sort((a, b) => extractDistrictNumber(a.districtLabel) - extractDistrictNumber(b.districtLabel));

  const repToLoseSuper =
    repLeads.length >= config.supermajority
      ? repLeads.length - config.supermajority + 1
      : null;

  const confirmedFlips = allInPlay.filter((s) => s.seatStatus === "FLIPPED").length;
  const leadingFlips   = allInPlay.filter((s) => s.seatStatus === "LEADING_FLIP").length;
  const tightHolds     = allInPlay.filter((s) => s.seatStatus === "HOLD" || s.seatStatus === "OPEN").length;
  const totalFlipActivity = confirmedFlips + leadingFlips;

  const chamberLabel = chamber === "senate" ? "Senate" : "House";

  const parts: string[] = [];
  if (confirmedFlips > 0) parts.push(`${confirmedFlips} flip${confirmedFlips !== 1 ? "s" : ""} confirmed`);
  if (leadingFlips   > 0) parts.push(`${leadingFlips} leading flip${leadingFlips !== 1 ? "s" : ""}`);
  if (tightHolds     > 0) parts.push(`${tightHolds} tight race${tightHolds !== 1 ? "s" : ""}`);
  if (repToLoseSuper !== null) parts.push(`${repToLoseSuper} more to break supermajority`);
  const subtitle = parts.join(" · ") || `Competitive ${chamberLabel} races`;

  const netNeeded = totalFlipActivity > 0 || repToLoseSuper !== null
    ? repToLoseSuper !== null ? `NET NEEDED: +${repToLoseSuper}` : null
    : null;

  if (allInPlay.length === 0) return null;

  return (
    <section id={`${chamber}-battleground`} style={{ marginBottom: 48 }}>
      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, borderLeft: `4px solid ${C.secondary}`, paddingLeft: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.primary }}>
            {chamberLabel} Battlegrounds
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: C.outline, fontWeight: 500 }}>
            {subtitle}
          </p>
        </div>
        {netNeeded && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, whiteSpace: "nowrap" }}>
            {netNeeded}
          </span>
        )}
      </div>

      {/* Race cards grid */}
      <div className={`race-grid race-grid-${chamber}`}>
        {allInPlay.map((seat) => {
          const voteDiff =
            seat.margin !== null && seat.totalVotes > 0
              ? Math.round(seat.margin * seat.totalVotes).toLocaleString()
              : null;

          // Hover footer — show 2024 prior result in 2026 mode
          const priorVoteDiff = seat.priorMargin !== null && seat.totalVotes > 0
            ? Math.round(seat.priorMargin * seat.totalVotes).toLocaleString()
            : null;
          const footerText = source === "2026" && seat.priorMargin !== null
            ? `2024: ${seat.incumbentParty ?? "?"} +${(seat.priorMargin * 100).toFixed(1)}%${priorVoteDiff ? ` (${priorVoteDiff} votes)` : ""}`
            : "";

          const leaderStyle = leaderCircleStyle(seat.seatStatus, seat.leaderParty, seat.margin, seat.pctReporting);

          // Flip/Hold badge — direction-aware
          const isFlipEvent = seat.seatStatus === "FLIPPED" || seat.seatStatus === "LEADING_FLIP";
          const isDemFlip   = isFlipEvent && seat.leaderParty === "DEM";
          const isRepFlip   = isFlipEvent && seat.leaderParty === "REP";
          const confirmed   = seat.seatStatus === "FLIPPED";

          const holdParty = seat.incumbentParty ?? seat.leaderParty;
          let sb: { label: string; bg: string; color: string } = { label: `${holdParty} HOLD`, bg: `${C.primaryMid}18`, color: C.primaryMid };
          if (seat.seatStatus === "OPEN") {
            sb = { label: "OPEN", bg: C.surfaceHigh, color: C.outline };
          } else if (isDemFlip) {
            sb = confirmed
              ? { label: "↺ DEM FLIPS SEAT",     bg: "#dcfce7", color: "#15803d" }
              : { label: "↺ DEM LEADING (FLIP)",  bg: "#bbf7d0", color: "#166534" };
          } else if (isRepFlip) {
            sb = confirmed
              ? { label: "↺ REP FLIPS SEAT",     bg: "#fee2e2", color: "#dc2626" }
              : { label: "↺ REP LEADING (FLIP)",  bg: "#fecaca", color: "#b91c1c" };
          }

          // Left border color signals flip direction
          const flipBorderColor = isDemFlip ? "#16a34a" : isRepFlip ? "#dc2626" : null;
          const flipBorder = flipBorderColor
            ? `3px solid ${flipBorderColor}`
            : `1px solid ${C.outlineVariant}50`;

          return (
            <div key={seat.gid} className="race-card" style={{ background: C.surface, borderRadius: 12, borderLeft: flipBorder, borderRight: `1px solid ${C.outlineVariant}50`, borderTop: `1px solid ${C.outlineVariant}50`, borderBottom: `1px solid ${C.outlineVariant}50`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column" }}>
              {/* Card header */}
              <div style={{ padding: "10px 14px", background: C.surfaceLow, borderBottom: `1px solid ${C.outlineVariant}30`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.primary }}>
                    {formatSeatLabel(chamber, seat.districtLabel)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 7px", background: sb.bg, color: sb.color }}>
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
                      {/* Party avatar — donkey logo for featured candidates, colored circle otherwise */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${circle.border}`, background: circle.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: circle.text, overflow: "hidden", transition: "background 0.3s, border-color 0.3s" }}>
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

                {/* Vote margin — always visible */}
                {voteDiff && (
                  <div style={{ fontSize: 14, color: C.outline, fontWeight: 400, textAlign: "center", borderTop: `1px solid ${C.outlineVariant}30`, paddingTop: 8 }}>
                   Margin: {voteDiff} votes | {(seat.margin! * 100).toFixed(2)}%
                  </div>
                )}
              </div>

              {/* Hover footer — 2024 prior result */}
              {footerText && (
                <div className="card-footer" style={{ padding: "8px 14px", background: `${C.primary}08`, borderTop: `1px solid ${C.outlineVariant}30`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.outline, letterSpacing: "0.04em" }}>
                  2024:{" "}
                  <span style={{ color: seat.incumbentParty === "DEM" ? C.primaryMid : seat.incumbentParty === "REP" ? C.secondary : C.outline, fontWeight: 900 }}>
                    {seat.incumbentParty ?? "?"}
                  </span>
                  {" "}{priorVoteDiff ? `+${priorVoteDiff} votes` : ""}{" "}· +{(seat.priorMargin! * 100).toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Judicial Battleground Section ───────────────────────────────────────────
function JudicialBattlegroundSection({
  coaRaces,
  scRaces,
}: {
  coaRaces: RaceSummary[];
  scRaces: RaceSummary[];
}) {
  if (coaRaces.length === 0 && scRaces.length === 0) return null;

  function JudicialCard({ race, label }: { race: RaceSummary; label: string }) {
    const hasVotes = race.precincts.reporting > 0;
    const leader = race.candidates[0];
    const leaderParty = hasVotes ? (leader?.party ?? "") : "";

    // Determine badge
    const bdgColor = leaderParty === "DEM" ? C.primaryMid : leaderParty === "REP" ? C.secondary : C.outline;
    const bdgBg    = leaderParty === "DEM" ? `${C.primaryMid}18` : leaderParty === "REP" ? `${C.secondary}18` : C.surfaceHigh;
    const bdgLabel = hasVotes ? `${leaderParty} LEADING` : "RESULTS PENDING";

    // Left border signals party leading
    const flipBorder = leaderParty === "DEM"
      ? `3px solid ${C.primaryMid}`
      : leaderParty === "REP"
        ? `3px solid ${C.secondary}`
        : `1px solid ${C.outlineVariant}50`;

    return (
      <div className="race-card" style={{ background: C.surface, borderRadius: 12, borderLeft: flipBorder, borderRight: `1px solid ${C.outlineVariant}50`, borderTop: `1px solid ${C.outlineVariant}50`, borderBottom: `1px solid ${C.outlineVariant}50`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column" }}>
        {/* Card header */}
        <div style={{ padding: "10px 14px", background: C.surfaceLow, borderBottom: `1px solid ${C.outlineVariant}30`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.primary }}>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 7px", background: bdgBg, color: bdgColor }}>
              {bdgLabel}
            </span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.outline, letterSpacing: "0.04em" }}>
            {Math.round(race.precincts.pct * 100)}% Reporting
          </span>
        </div>

        {/* Candidates */}
        <div style={{ padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {race.candidates.map((cand) => {
            const isD = cand.party === "DEM";
            const barColor = isD ? C.primaryMid : C.secondary;
            const pctDisplay = cand.pct * 100;
            return (
              <div key={cand.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${C.outlineVariant}`, background: C.surfaceHigh, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: C.outline }}>
                  {cand.party || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.onBg }}>
                      {formatName(cand.name)}{" "}
                      <span style={{ fontWeight: 500, color: C.outline }}>({cand.party})</span>
                    </span>
                    <span style={{ color: barColor, flexShrink: 0, marginLeft: 6 }}>
                      {pctDisplay > 0 ? `${pctDisplay.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.surfaceTrack, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pctDisplay}%`, background: barColor, borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            );
          })}
          {race.margin !== null && race.totalVotes > 0 && (
            <div style={{ fontSize: 14, color: C.outline, fontWeight: 400, textAlign: "center", borderTop: `1px solid ${C.outlineVariant}30`, paddingTop: 8 }}>
              Margin: {Math.round(race.margin * race.totalVotes).toLocaleString()} votes | {(race.margin * 100).toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    );
  }

  function seatLabel(cnm: string, prefix: string): string {
    const m = cnm.match(/SEAT\s+0*(\d+)/i);
    return m ? `${prefix} Seat ${m[1]}` : cnm;
  }

  return (
    <section id="judicial-battleground" style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, borderLeft: `4px solid ${C.secondary}`, paddingLeft: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.primary }}>Judicial Races</h2>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: C.outline, fontWeight: 500 }}>
            NC Court of Appeals · NC Supreme Court
          </p>
        </div>
      </div>

      {coaRaces.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: C.outline, marginBottom: 12 }}>
            Court of Appeals — {coaRaces.length} seat{coaRaces.length !== 1 ? "s" : ""}
          </div>
          <div className="race-grid race-grid-judicial" style={{ marginBottom: 32 }}>
            {coaRaces.map((r) => (
              <JudicialCard key={r.gid} race={r} label={seatLabel(r.cnm, "CoA")} />
            ))}
          </div>
        </>
      )}

      {scRaces.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: C.outline, marginBottom: 12 }}>
            Supreme Court — {scRaces.length} seat{scRaces.length !== 1 ? "s" : ""}
          </div>
          <div className="race-grid race-grid-judicial">
            {scRaces.map((r) => (
              <JudicialCard key={r.gid} race={r} label={seatLabel(r.cnm, "NCSC")} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BalanceOfPowerPage() {
  const [races,       setRaces]       = useState<RaceSummary[]>([]);
  const [priorSeats,  setPriorSeats]  = useState<Record<string, PriorSeat>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string>("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [source, setSource] = useState<"2024" | "2026">("2026");
  const [countdown, setCountdown] = useState(POLL_INTERVAL / 1000);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        setError(err instanceof Error ? err.message : "Failed to load live data");
      } finally {
        setLoading(false);
        setCountdown(POLL_INTERVAL / 1000);
      }
    };
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [source]);

  const { senate, house, coaRaces, scRaces } = useMemo(() => ({
    senate:   races.filter((r) => r.ogl === "NCS").map((r) => toSeatVisual(r, priorSeats)),
    house:    races.filter((r) => r.ogl === "NCH").map((r) => toSeatVisual(r, priorSeats)),
    coaRaces: races.filter((r) => r.ogl === "JUD" && r.cnm.includes("COURT OF APPEALS")),
    scRaces:  races.filter((r) => r.ogl === "JUD" && r.cnm.includes("SUPREME COURT")),
  }), [races, priorSeats]);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.onBg, fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');

        @keyframes pulseSeat {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(0.88); }
        }

        /* Hero layout */
        .hero-grid {
          grid-template-columns: 1fr 280px;
        }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .status-card { min-width: unset !important; max-width: unset !important; }
        }

        /* Race card grids */
        .race-grid {
          display: grid;
          gap: 16px;
        }
        .race-grid-house,
        .race-grid-senate,
        .race-grid-judicial { grid-template-columns: repeat(auto-fill, minmax(min(350px, 100%), 1fr)); }

        /* Card hover */
        .race-card { transition: box-shadow 0.2s, transform 0.2s; cursor: default; }
        .race-card:hover { box-shadow: 0 8px 24px rgba(4,37,103,0.13) !important; transform: translateY(-2px); }
        .card-footer { opacity: 0; transition: opacity 0.2s; }
        .race-card:hover .card-footer { opacity: 1; }
      `}</style>

      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ position: "fixed", bottom: 24, right: 24, background: C.primary, color: "#fff", border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer", zIndex: 100, boxShadow: "0 4px 12px rgba(4,37,103,0.35)", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 48px" }}>
        {/* Page title row */}
        

        {loading && <p style={{ color: C.outline, fontSize: 14 }}>Loading live race data…</p>}
        {error   && <p style={{ color: C.secondary, fontSize: 14 }}>{error}</p>}

        {!loading && !error && (
          <>
            <SupermajorityHero senateSeats={senate} houseSeats={house} coaRaces={coaRaces} scRaces={scRaces} source={source} onSourceChange={setSource} countdown={countdown} lastUpdated={lastUpdated} />
            <BattlegroundSection chamber="house"  seats={house}  source={source} />
            <BattlegroundSection chamber="senate" seats={senate} source={source} />
            <JudicialBattlegroundSection coaRaces={coaRaces} scRaces={scRaces} />
          </>
        )}
      </div>
    </main>
  );
}
