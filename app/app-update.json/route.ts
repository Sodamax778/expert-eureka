import version from "./version.json";

export function GET() {
  return Response.json(version, { headers: { "Cache-Control": "no-store" } });
}
