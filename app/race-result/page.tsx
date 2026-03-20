"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEAM_UP_NC_GIDS } from "../../lib/config";
import type { RaceSummary } from "../../lib/parseResults";

const POLL_INTERVAL = 60_000;

type ApiResponse = {
  races: RaceSummary[];
  updatedAt: string;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function normalizePct(value: number): number {
  return value <= 1 ? value * 100 : value;
}

function raceStatusLabel(race: RaceSummary, targetParty?: string): string {
  if (targetParty) {
    const leaderParty = race.candidates[0]?.party;
    const targetLeading = leaderParty === targetParty;
    if (race.called) {
      return targetLeading ? "WIN" : "LOSS";
    }
    return targetLeading ? "WINNING" : "LOSING";
  }

  if (race.called) {
    return "Called";
  }
  return "Leading";
}

function formatShortRaceLabel(race: RaceSummary): string {
  const districtMatch = race.cnm.match(/DISTRICT\s+0*([0-9]+)/i);
  if (districtMatch) {
    const district = districtMatch[1];
    if (race.ogl === "NCS") return `SD ${district}`;
    if (race.ogl === "NCH") return `HD ${district}`;
  }

  if (race.ogl === "SPC") return "NC Supreme Court";

  return race.cnm.split(" - ")[0] ?? race.cnm;
}

function getDemCandidate(race?: RaceSummary): RaceSummary["candidates"][number] | undefined {
  return race?.candidates.find((candidate) => candidate.party === "DEM");
}

function CandidateRow({ name, party, votes, pct, compact, dark, highlighted }: {
  name: string;
  party: string;
  votes: number;
  pct: number;
  compact: boolean;
  dark: boolean;
  highlighted?: boolean;
}) {
  const fg = dark ? "#f9fafb" : "#111827";
  const subtle = dark ? "#cbd5e1" : "#4b5563";
  const barBg = dark ? "#1f2937" : "#e5e7eb";
  const barFill = party === "DEM" ? "#1d4ed8" : party === "REP" ? "#dc2626" : "#6b7280";
  const highlightBg = dark ? "rgba(29, 78, 216, 0.2)" : "rgba(219, 234, 254, 0.8)";
  const highlightBorder = dark ? "#60a5fa" : "#1d4ed8";
  const percent = normalizePct(pct);

  return (
    <div
      style={{
        marginTop: compact ? 8 : 10,
        padding: highlighted ? "6px 8px" : undefined,
        borderRadius: highlighted ? 8 : undefined,
        border: highlighted ? `1px solid ${highlightBorder}` : undefined,
        background: highlighted ? highlightBg : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ color: fg, fontSize: compact ? 13 : 14, fontWeight: 600 }}>
          {name} <span style={{ color: subtle, fontWeight: 500 }}>({party || "N/A"})</span>
          {highlighted && <span style={{ marginLeft: 6, fontSize: 11, color: highlightBorder }}>Target</span>}
        </div>
        <div style={{ color: fg, fontSize: compact ? 12 : 13 }}>
          {formatNumber(votes)} ({formatPct(percent)})
        </div>
      </div>
      <div style={{ marginTop: 4, backgroundColor: barBg, borderRadius: 999, height: compact ? 7 : 9, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: barFill, height: "100%" }} />
      </div>
    </div>
  );
}

function RaceCard({
  race,
  compact,
  dark,
  titleOverride,
  highlightParty,
}: {
  race: RaceSummary;
  compact: boolean;
  dark: boolean;
  titleOverride?: string;
  highlightParty?: string;
}) {
  const bg = dark ? "#0f172a" : "#ffffff";
  const border = dark ? "#334155" : "#d1d5db";
  const fg = dark ? "#f9fafb" : "#111827";
  const subtle = dark ? "#cbd5e1" : "#4b5563";
  const badgeBg = race.called ? (dark ? "#14532d" : "#dcfce7") : dark ? "#1e3a8a" : "#dbeafe";
  const badgeFg = race.called ? (dark ? "#dcfce7" : "#14532d") : dark ? "#dbeafe" : "#1e3a8a";
  const leader = race.candidates[0];
  const status = raceStatusLabel(race, highlightParty);
  const isLoss = status === "LOSS";
  const resolvedBadgeBg =
    isLoss
      ? dark
        ? "#7f1d1d"
        : "#fee2e2"
      : badgeBg;
  const resolvedBadgeFg =
    isLoss
      ? dark
        ? "#fecaca"
        : "#991b1b"
      : badgeFg;

  return (
    <article
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: 12,
        padding: compact ? 12 : 14,
        boxShadow: dark ? "none" : "0 8px 24px rgba(17, 24, 39, 0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0, color: fg, fontSize: compact ? 15 : 16 }}>{titleOverride ?? race.cnm}</h3>
        <span style={{ background: resolvedBadgeBg, color: resolvedBadgeFg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
          {status}
        </span>
      </div>

      <div style={{ marginTop: 6, color: subtle, fontSize: compact ? 12 : 13 }}>
        {race.precincts.reporting} of {race.precincts.total} precincts reporting ({formatPct(race.precincts.pct * 100)})
      </div>

      {leader && (
        <div style={{ marginTop: 6, color: subtle, fontSize: compact ? 12 : 13 }}>
          Leader: {leader.name} ({leader.party})
          {race.margin !== null ? ` | Margin ${formatPct(race.margin * 100)}` : ""}
        </div>
      )}

      <div style={{ marginTop: compact ? 6 : 8 }}>
        {race.candidates.map((candidate) => (
          <CandidateRow
            key={`${race.gid}-${candidate.name}`}
            name={candidate.name}
            party={candidate.party}
            votes={candidate.votes}
            pct={candidate.pct}
            compact={compact}
            dark={dark}
            highlighted={highlightParty === candidate.party}
          />
        ))}
      </div>
    </article>
  );
}

function RaceResultPageContent() {
  const searchParams = useSearchParams();
  const gid = searchParams.get("gid");
  const view = searchParams.get("view");
  const compact = searchParams.get("compact") === "true";
  const dark = searchParams.get("theme") === "dark";

  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/results");
        if (!res.ok) throw new Error(`Failed to load results (${res.status})`);
        const data = (await res.json()) as ApiResponse;
        setRaces(data.races ?? []);
        setLastUpdated(data.updatedAt ?? "");
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch results");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const byGid = useMemo(() => {
    const map = new Map<string, RaceSummary>();
    for (const race of races) map.set(race.gid, race);
    return map;
  }, [races]);

  const teamCards = useMemo(() => {
    const trackedGids = TEAM_UP_NC_GIDS.filter(
      (gidValue) => gidValue && !gidValue.includes("REPLACE_WITH"),
    );

    const cards = trackedGids.map((gidValue) => ({
      gid: gidValue,
      race: byGid.get(gidValue),
    }));

    return cards.sort((a, b) => {
      const marginA = a.race?.margin ?? Number.POSITIVE_INFINITY;
      const marginB = b.race?.margin ?? Number.POSITIVE_INFINITY;
      return marginA - marginB;
    });
  }, [byGid]);

  const teamLeads = teamCards.filter((card) => card.race?.candidates[0]?.party === "DEM").length;

  const singleRace = gid ? byGid.get(gid) : undefined;

  const bg = dark ? "#020617" : "linear-gradient(180deg, #f3f4f6 0%, #ffffff 45%, #f9fafb 100%)";
  const fg = dark ? "#f9fafb" : "#111827";
  const subtle = dark ? "#cbd5e1" : "#4b5563";

  return (
    <main style={{ minHeight: "100vh", background: bg, color: fg, padding: compact ? 12 : 18 }}>
      <section style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: compact ? 10 : 14 }}>
          <h1 style={{ margin: 0, fontSize: compact ? 20 : 24 }}>
            {view === "teamupnc" ? "Team Up NC Results" : "Race Result"}
          </h1>
          <div style={{ fontSize: 12, color: subtle }}>
            {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()}` : "Waiting for first update..."}
          </div>
        </div>

        {loading && <p style={{ color: subtle }}>Loading live race data...</p>}
        {error && <p style={{ color: dark ? "#fca5a5" : "#b91c1c" }}>{error}</p>}

        {!loading && !error && view === "teamupnc" && (
          <>
            <div style={{ marginBottom: compact ? 10 : 12, color: subtle, fontSize: compact ? 13 : 14 }}>
              {teamLeads} of {teamCards.length} Team Up NC races currently have a DEM lead
            </div>

            <div style={{ display: "grid", gap: compact ? 8 : 12 }}>
              {teamCards.map(({ gid: watchedGid, race }) =>
                race ? (
                  <div key={race.gid}>
                    <div style={{ marginBottom: 6, color: subtle, fontSize: compact ? 12 : 13 }}>
                      {(() => {
                        const demCandidate = getDemCandidate(race);
                        const demLeading = race.candidates[0]?.party === "DEM";
                        if (!demCandidate) return "No DEM candidate found in this race.";
                        return demLeading
                          ? `DEM target: ${demCandidate.name} is currently leading.`
                          : `DEM target: ${demCandidate.name} is currently trailing.`;
                      })()}
                    </div>
                    <RaceCard
                      race={race}
                      compact={compact}
                      dark={dark}
                      highlightParty="DEM"
                      titleOverride={formatShortRaceLabel(race)}
                    />
                  </div>
                ) : (
                  <article
                    key={watchedGid}
                    style={{
                      border: `1px solid ${dark ? "#334155" : "#d1d5db"}`,
                      borderRadius: 12,
                      background: dark ? "#0f172a" : "#ffffff",
                      padding: compact ? 12 : 14,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: compact ? 15 : 16 }}>GID {watchedGid}</h3>
                    <p style={{ margin: "8px 0 0", color: subtle, fontSize: compact ? 12 : 13 }}>
                      Awaiting race data for GID {watchedGid}
                    </p>
                  </article>
                ),
              )}
            </div>
          </>
        )}

        {!loading && !error && view !== "teamupnc" && gid && singleRace && (
          <RaceCard race={singleRace} compact={compact} dark={dark} />
        )}

        {!loading && !error && view !== "teamupnc" && gid && !singleRace && (
          <p style={{ color: subtle }}>No race found for GID {gid}.</p>
        )}

        {!loading && !error && !view && !gid && (
          <p style={{ color: subtle }}>Pass a GID with ?gid=XXXX or use ?view=teamupnc.</p>
        )}
      </section>
    </main>
  );
}

export default function RaceResultPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16 }}>Loading race results...</main>}>
      <RaceResultPageContent />
    </Suspense>
  );
}
