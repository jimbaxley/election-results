"use client";

import { useEffect, useMemo, useState } from "react";
import { CHAMBER_CONFIG } from "../../lib/config";
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
};

const STATUS_ORDER: Record<SeatStatus, number> = {
  FLIPPED: 0,
  LEADING_FLIP: 1,
  HOLD: 2,
  OPEN: 3,
};

function extractDistrictNumber(label: string): number {
  const match = label.match(/DISTRICT\s+0*([0-9]+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isBattlegroundSeat(seat: SeatVisual): boolean {
  // Flips always show — the change itself is the story regardless of margin.
  if (seat.seatStatus === "FLIPPED" || seat.seatStatus === "LEADING_FLIP") return true;
  // Holds and open seats only show if currently within the competitive threshold.
  return seat.margin !== null && seat.margin < COMPETITIVE_THRESHOLD;
}

function sortSeatsForGrouping(a: SeatVisual, b: SeatVisual): number {
  const statusDiff = STATUS_ORDER[a.seatStatus] - STATUS_ORDER[b.seatStatus];
  if (statusDiff !== 0) return statusDiff;
  const mA = a.margin ?? Infinity;
  const mB = b.margin ?? Infinity;
  if (mA !== mB) return mA - mB;
  return extractDistrictNumber(a.districtLabel) - extractDistrictNumber(b.districtLabel);
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

  let seatStatus: SeatStatus = "OPEN";
  if (prior) {
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

// ─── Supermajority Hero ───────────────────────────────────────────────────────
function SupermajorityHero({
  senateSeats,
  houseSeats,
  lastUpdated,
}: {
  senateSeats: SeatVisual[];
  houseSeats: SeatVisual[];
  lastUpdated: string;
}) {
  type ChamberKey = "senate" | "house";

  // Flip counts split by direction across both chambers
  const allSeats   = [...senateSeats, ...houseSeats];
  const demFlipped = allSeats.filter((s) => s.seatStatus === "FLIPPED"      && s.leaderParty === "DEM").length;
  const demLeading = allSeats.filter((s) => s.seatStatus === "LEADING_FLIP" && s.leaderParty === "DEM").length;
  const repFlipped = allSeats.filter((s) => s.seatStatus === "FLIPPED"      && s.leaderParty === "REP").length;
  const repLeading = allSeats.filter((s) => s.seatStatus === "LEADING_FLIP" && s.leaderParty === "REP").length;

  function chamberStats(seats: SeatVisual[], key: ChamberKey) {
    const cfg = CHAMBER_CONFIG[key];
    const dem = seats.filter((s) => s.leaderParty === "DEM").length;
    const rep = seats.filter((s) => s.leaderParty === "REP").length;
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

  // Derive status — track which chambers are already broken vs still held
  const houseBroken  = !house.repHasSuper;
  const senateBroken = !senate.repHasSuper;
  const houseFlipsNeeded  = house.flipsToBreakRep;   // null if already broken
  const senateFlipsNeeded = senate.flipsToBreakRep;  // null if already broken

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
    if (houseFlipsNeeded  !== null) needed.push(`${houseFlipsNeeded} House flip${houseFlipsNeeded !== 1 ? "s" : ""}`);
    if (senateFlipsNeeded !== null) needed.push(`${senateFlipsNeeded} Senate flip${senateFlipsNeeded !== 1 ? "s" : ""}`);

    const brokenText = broken.length > 0
      ? `${broken.join(" & ")} supermajority${broken.length > 1 ? "ies" : ""} already broken.`
      : "";
    const neededText = needed.length > 0
      ? `Democrats need ${needed.join(" and ")} to ${broken.length > 0 ? "complete the sweep" : "break the Republican supermajority and restore executive veto power"}.`
      : broken.length > 0
        ? "Governor's veto power fully restored in both chambers."
        : "";

    return [brokenText, neededText].filter(Boolean).join(" ") ||
      "Neither party currently holds a supermajority in either chamber.";
  }

  function ChamberBar({ label, stats, chamberKey }: { label: string; stats: ReturnType<typeof chamberStats>; chamberKey: "house" | "senate" }) {
    const repHasSuper = stats.rep >= stats.cfg.supermajority;
    const seatsShort  = repHasSuper ? 0 : stats.cfg.supermajority - stats.rep;
    // The bar spans 0–total. DEM fills from left, REP from right.
    // superPct is now the DEM threshold: DEM must reach this to deny REP supermajority.
    // Gap = from threshold to where DEM actually ended up (demPct).
    // Positive when DEM crossed the line (supermajority broken).
    const gapLeft  = stats.superPct;               // threshold is the left edge
    const gapWidth = stats.demPct - stats.superPct; // positive if DEM broke supermajority

    const outcomeColor  = repHasSuper ? "#dc2626" : "#16a34a";
    const outcomeBg     = repHasSuper ? "#fee2e2" : "#dcfce7";
    const outcomeLabel  = repHasSuper
      ? "SUPERMAJORITY HELD"
      : seatsShort === 1
        ? "SUPERMAJORITY BROKEN — 1 SEAT FLIPPED"
        : `SUPERMAJORITY BROKEN — ${seatsShort} SEATS FLIPPED`;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <a href={`#${chamberKey}-battleground`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, background: `${C.primary}0f`, border: `1px solid ${C.primary}25`, borderRadius: 8, padding: "6px 12px", transition: "background 0.15s" }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: C.primary }}>{label}</span>
              <span style={{ fontSize: 13, color: C.secondary, fontWeight: 800 }}>↓</span>
            </a>
            <span style={{ fontSize: 11, fontWeight: 700, background: outcomeBg, color: outcomeColor, borderRadius: 4, padding: "4px 10px", letterSpacing: "0.04em" }}>
              {outcomeLabel}
            </span>
          </div>
        </div>

        {/* Bar */}
        <div style={{ position: "relative" }}>
          {/* Threshold label */}
          <div style={{ position: "relative", height: 16, marginBottom: 2 }}>
            <div style={{
              position: "absolute",
              left: `${stats.superPct}%`,
              transform: "translateX(-50%)",
              fontSize: 9,
              fontWeight: 700,
              color: outcomeColor,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
            }}>
              {stats.cfg.supermajority} = Supermajority
            </div>
          </div>
          <div style={{ position: "relative", height: 30, borderRadius: 12, overflow: "hidden", background: C.surfaceHigh }}>
            {/* DEM from left */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${stats.demPct}%`, background: C.primaryMid }} />
            {/* If DEM broke supermajority, highlight the gap zone in green */}
            {!repHasSuper && gapWidth > 0 && (
              <div style={{ position: "absolute", left: `${gapLeft}%`, top: 0, bottom: 0, width: `${gapWidth}%`, background: "#16a34a", opacity: 0.85 }} />
            )}
            {/* REP from right */}
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${stats.repPct}%`, background: C.secondary }} />
            {/* Supermajority threshold marker */}
            <div style={{
              position: "absolute",
              left: `${stats.superPct}%`,
              top: 0, bottom: 0,
              width: 3,
              background: outcomeColor,
              transform: "translateX(-50%)",
              zIndex: 10,
              boxShadow: `0 0 6px ${outcomeColor}80`,
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
      </div>
    );
  }

  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "stretch" }} className="hero-grid">
        {/* Progress bars card */}
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.outlineVariant}40`, padding: "28px 32px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: C.secondary, marginBottom: 4 }}>
              Live Results | Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
         
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.primary, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Supermajority Watch
            </h1>
          </div>
          <ChamberBar label="House" stats={house} chamberKey="house" />
          <ChamberBar label="Senate" stats={senate} chamberKey="senate" />
        </div>

        {/* Status card */}
        <div style={{ background: C.primary, borderRadius: 12, padding: "28px 28px", color: "#fff", position: "relative", overflow: "hidden", minWidth: 240, maxWidth: 300, display: "flex", flexDirection: "column", justifyContent: "center", boxShadow: "0 4px 24px rgba(4,37,103,0.25)" }} className="status-card">
          {/* Background icon watermark */}
          <div style={{ position: "absolute", top: 0, right: 0, fontSize: 120, opacity: 0.06, lineHeight: 1, padding: 12, userSelect: "none" }}>
            ⚖
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ display: "inline-block", background: C.secondary, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 10px", letterSpacing: "0.08em", marginBottom: 14 }}>
              LIVE ANALYSIS
            </span>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 900, lineHeight: 1.2, color: "#fff" }}>
              Supermajority Status:{" "}
              <br />
              <span style={{ color: statusColor }}>{statusLabel}</span>
            </h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, opacity: 0.9, fontWeight: 500 }}>
              {narrative()}
            </p>
            {(demFlipped > 0 || demLeading > 0 || repFlipped > 0 || repLeading > 0) && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                {demFlipped > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#16a34a", borderRadius: 999, width: 8, height: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#bbf7d0" }}>
                      {demFlipped} seat{demFlipped !== 1 ? "s" : ""} flipped to DEM ↺
                    </span>
                  </div>
                )}
                {demLeading > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#4ade80", borderRadius: 999, width: 8, height: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#bbf7d0", opacity: 0.85 }}>
                      {demLeading} DEM leading in flip seat{demLeading !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {repFlipped > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#dc2626", borderRadius: 999, width: 8, height: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fecaca" }}>
                      {repFlipped} seat{repFlipped !== 1 ? "s" : ""} flipped to REP ↺
                    </span>
                  </div>
                )}
                {repLeading > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "#f87171", borderRadius: 999, width: 8, height: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fecaca", opacity: 0.85 }}>
                      {repLeading} REP leading in flip seat{repLeading !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {lastUpdated && (
            <div style={{ position: "absolute", bottom: 12, right: 16, fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Battleground Section ─────────────────────────────────────────────────────
function BattlegroundSection({
  chamber,
  seats,
}: {
  chamber: "senate" | "house";
  seats: SeatVisual[];
}) {
  const config = CHAMBER_CONFIG[chamber];
  const repLeads = seats.filter((s) => s.leaderParty === "REP");

  const allInPlay = seats.filter(isBattlegroundSeat).sort(sortSeatsForGrouping);

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

          // Status footer text (hover-only — keep concise, vote diff shown inline)
          let footerText = "";
          if (seat.margin !== null) {
            if (seat.margin < 0.01)       footerText = "TOO CLOSE TO CALL";
            else if (seat.margin < 0.02)  footerText = "SUPER COMPETITIVE";
            else                          footerText = "SWING SEAT";
          }

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

          // Order: put leader first visually
          const cand1 = { name: seat.leaderName,   party: seat.leaderParty,   pct: seat.leaderPct };
          const cand2 = { name: seat.runnerUpName,  party: seat.runnerUpParty, pct: seat.runnerUpPct };
          // Show DEM on top always
          const [top, bottom] = cand1.party === "DEM" ? [cand1, cand2] : [cand2, cand1];

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
                <span style={{ fontSize: 9, fontWeight: 600, color: C.outline, letterSpacing: "0.04em" }}>
                  {Math.round(seat.pctReporting * 100)}% rptg
                </span>
              </div>

              {/* Candidates */}
              <div style={{ padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                {[top, bottom].map((cand) => {
                  const isLeader = cand.party === seat.leaderParty;
                  const isD      = cand.party === "DEM";
                  const barColor = isD ? C.primaryMid : C.secondary;
                  const circle   = isLeader ? leaderStyle : runnerUpCircle;
                  return (
                    <div key={cand.party} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Party avatar — donkey logo for featured candidates, colored circle otherwise */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${circle.border}`, background: circle.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: circle.text, overflow: "hidden", transition: "background 0.3s, border-color 0.3s" }}>
                        {isFeaturedCandidate(cand.name)
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
                  <div style={{ fontSize: 11, color: C.outline, fontWeight: 600, textAlign: "center", borderTop: `1px solid ${C.outlineVariant}30`, paddingTop: 8 }}>
                    {voteDiff} votes | Margin: {(seat.margin! * 100).toFixed(2)}%
                  </div>
                )}
              </div>

              {/* Hover footer — closeness label only */}
              {footerText && (
                <div className="card-footer" style={{ padding: "8px 14px", background: `${C.primary}08`, borderTop: `1px solid ${C.outlineVariant}30`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.primary, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {footerText}
                </div>
              )}
            </div>
          );
        })}
      </div>
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

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/results");
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
      }
    };
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const { senate, house } = useMemo(() => ({
    senate: races.filter((r) => r.ogl === "NCS").map((r) => toSeatVisual(r, priorSeats)),
    house:  races.filter((r) => r.ogl === "NCH").map((r) => toSeatVisual(r, priorSeats)),
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
        .race-grid-house   { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
        .race-grid-senate  { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }

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
            <SupermajorityHero senateSeats={senate} houseSeats={house} lastUpdated={lastUpdated} />
            <BattlegroundSection chamber="house"  seats={house}  />
            <BattlegroundSection chamber="senate" seats={senate} />
          </>
        )}
      </div>
    </main>
  );
}
