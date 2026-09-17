import { auth } from "../../../../server/auth";
import { configurationError } from "../../../../server/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const error = configurationError();
  if (error)
    return Response.json(
      { error },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return auth().handler(request);
}
export async function POST(request: Request) {
  return GET(request);
}
