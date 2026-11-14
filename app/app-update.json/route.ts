import version from "./version.json";
import siteVersion from "./site-version.json";

export function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel");
  const headers = { "Cache-Control": "no-store" };
  if (channel === "site-debug") return new Response(null, { status: 404, headers });
  return Response.json(channel === "site" ? siteVersion : version, { headers });
}