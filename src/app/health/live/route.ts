export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  return Response.json(
    { status: "ok", service: "openers-performance-dashboard" },
    { status: 200, headers: HEADERS },
  );
}
