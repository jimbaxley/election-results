import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f3f4f6 0%, #ffffff 55%, #f9fafb 100%)",
        padding: "28px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system",
      }}
    >
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          border: "1px solid #d1d5db",
          borderRadius: 14,
          background: "#ffffff",
          padding: 20,
          boxShadow: "0 10px 30px rgba(17, 24, 39, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>NC Election Night Dashboard</h1>
        <p style={{ color: "#4b5563" }}>
          Development links for current build progress.
        </p>
        <ul>
          <li>
            <Link href="/balance-of-power">/balance-of-power</Link>
          </li>
          <li>
            <Link href="/race-result?view=teamupnc">/race-result?view=teamupnc</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
