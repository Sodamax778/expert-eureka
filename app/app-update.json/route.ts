import version from "./version.json";
import siteVersion from "./site-version.json";

export function GET(request: Request) {
  const feed = new URL(request.url).searchParams.get("channel") === "site" ? siteVersion : version;
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
}