import { GET as getFeedStatus } from "../feed-status/route";
import type { FeedStatusResponse } from "../feed-status/route";

export const revalidate = 0;

export async function GET(): Promise<Response> {
  const webhookUrl = process.env.CODA_WEBHOOK_URL;
  const apiToken   = process.env.CODA_API_TOKEN;

  if (!webhookUrl) {
    return Response.json({ error: "CODA_WEBHOOK_URL not set" }, { status: 500 });
  }

  // Run the feed status check
  const statusRes = await getFeedStatus();
  const data: FeedStatusResponse = await statusRes.json();

  // Build a human-readable summary
  const issues: string[] = [];

  if (!data.feedLive) {
    issues.push(`NCSBE feed not yet live (${data.feedHttpStatus})`);
  }
  if (data.csvError) {
    issues.push(`Candidate CSV error: ${data.csvError}`);
  }
  for (const race of data.races) {
    for (const c of race.candidates) {
      const label = race.cnm.replace(/\s*\(VOTE FOR \d+\)/i, "");
      if (c.status === "primary_unresolved") {
        const others = c.csvNames.filter((n) => n !== c.name).join(", ");
        issues.push(`${label} (${c.party}): primary unresolved — also filed: ${others}`);
      } else if (c.status === "name_mismatch") {
        issues.push(`${label} (${c.party}): "${c.name}" not in CSV — CSV has: ${c.csvNames.join(", ")}`);
      } else if (c.status === "missing") {
        issues.push(`${label} (${c.party}): no matching candidate in CSV`);
      }
    }
  }

  const payload = {
    allClear:    data.allClear,
    feedLive:    data.feedLive,
    status:      data.allClear ? "ALL_CLEAR" : "NOT_READY",
    issueCount:  issues.length,
    issues,
    summary:     data.allClear
      ? "Feed is live and all primaries are resolved. Ready for election night."
      : issues.join(" | "),
    checkedAt:   data.checkedAt,
  };

  // POST to Coda webhook
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;

  const webhookRes = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return Response.json({
    sent: webhookRes.ok,
    webhookStatus: webhookRes.status,
    payload,
  });
}
