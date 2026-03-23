"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedStatusResponse, RaceCheck } from "../api/feed-status/route";

const C = {
  primary:    "#042567",
  bg:         "#fcf8f8",
  surface:    "#ffffff",
  surfaceLow: "#f7f3f2",
  outline:    "#757681",
  border:     "#e5e2e1",
  green:      "#15803d",
  amber:      "#b45309",
  red:        "#b91c1c",
} as const;

function StatusDot({ ok, dim }: { ok: boolean; dim?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: dim ? C.outline : ok ? C.green : C.red,
      flexShrink: 0, marginTop: 2,
    }} />
  );
}

function RaceRow({ race }: { race: RaceCheck }) {
  const label = race.cnm.replace(/\s*\(VOTE FOR \d+\)/i, "");
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <StatusDot ok={race.primaryResolved} />
        <span style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>{label}</span>
        <span style={{ fontSize: 11, color: C.outline, marginLeft: "auto", whiteSpace: "nowrap" }}>
          GID {race.gid}
        </span>
      </div>
      <div style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
        {race.candidates.map((c, i) => {
          const icon =
            c.status === "match"             ? "✓" :
            c.status === "primary_unresolved" ? "⚠" :
            c.status === "name_mismatch"      ? "✗" : "?";
          const color =
            c.status === "match"             ? C.green :
            c.status === "primary_unresolved" ? C.amber :
            C.red;
          const detail =
            c.status === "primary_unresolved"
              ? `primary unresolved — also filed: ${c.csvNames.filter((n) => n !== c.name).join(", ")}`
              : c.status === "name_mismatch"
              ? `not in CSV — CSV has: ${c.csvNames.join(", ")}`
              : c.status === "missing"
              ? "no matching party in CSV"
              : "";
          return (
            <div key={i} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ color, fontWeight: 700, width: 12 }}>{icon}</span>
              <span style={{ color: C.outline, width: 36 }}>{c.party}</span>
              <span style={{ color: C.primary }}>{c.name}</span>
              {detail && <span style={{ color, fontStyle: "italic" }}> — {detail}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FeedStatusPage() {
  const [data, setData] = useState<FeedStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/feed-status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const legislative = data?.races.filter((r) => r.section === "legislative") ?? [];
  const judicial    = data?.races.filter((r) => r.section === "judicial")    ?? [];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 24px", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.primary }}>
            Election Feed Status
          </h1>
          <button
            onClick={check}
            disabled={loading}
            style={{
              background: C.primary, color: "#fff", border: "none", borderRadius: 6,
              padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 12, marginBottom: 16, color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ color: C.outline, fontSize: 14 }}>Checking…</div>
        )}

        {data && (
          <>
            {/* Last checked */}
            <div style={{ fontSize: 12, color: C.outline, marginBottom: 20 }}>
              Last checked: {new Date(data.checkedAt).toLocaleString()}
            </div>

            {/* Overall status */}
            <div style={{
              background: data.allClear ? "#f0fdf4" : C.surface,
              border: `2px solid ${data.allClear ? C.green : C.border}`,
              borderRadius: 10, padding: "14px 18px", marginBottom: 24,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <StatusDot ok={data.allClear} />
              <span style={{ fontWeight: 800, fontSize: 15, color: data.allClear ? C.green : C.primary }}>
                {data.allClear
                  ? "All clear — feed live and all primaries resolved"
                  : "Not ready — see items below"}
              </span>
            </div>

            {/* Section 1: NCSBE live feed */}
            <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ background: C.surfaceLow, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: C.outline, letterSpacing: "0.05em" }}>
                NCSBE LIVE FEED
              </div>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <StatusDot ok={data.feedLive} />
                <span style={{ fontSize: 13, color: C.primary, fontWeight: 600 }}>
                  {data.feedLive ? "Feed is live" : "Feed not yet available"}
                </span>
                <span style={{ fontSize: 12, color: C.outline }}>
                  er.ncsbe.gov/enr/20261103/data/results_0.txt — {data.feedHttpStatus}
                </span>
              </div>
            </div>

            {/* Section 2: Legislative races */}
            <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ background: C.surfaceLow, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: C.outline, letterSpacing: "0.05em" }}>
                FEATURED LEGISLATIVE RACES
                {data.csvError && <span style={{ color: C.red, fontWeight: 400, marginLeft: 8 }}>CSV error: {data.csvError}</span>}
              </div>
              {legislative.map((r) => <RaceRow key={r.gid} race={r} />)}
            </div>

            {/* Section 3: Judicial races */}
            <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.surfaceLow, padding: "10px 16px", fontWeight: 700, fontSize: 13, color: C.outline, letterSpacing: "0.05em" }}>
                JUDICIAL RACES
              </div>
              {judicial.map((r) => <RaceRow key={r.gid} race={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
