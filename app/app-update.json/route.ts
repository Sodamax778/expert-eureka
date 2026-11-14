import version from "./version.json";
import siteVersion from "./site-version.json";
import debugVersion from "./debug-version.json";

export function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel");
  const feed = channel === "site-debug" ? debugVersion : channel === "site" ? siteVersion : version;
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
}