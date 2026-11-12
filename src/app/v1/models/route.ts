import { db, memberByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const m = key ? memberByKey(key) : undefined;
  if (!m) return Response.json({ error: { message: "Invalid CoPod API key", code: "invalid_api_key" } }, { status: 401 });
  const room = db().rooms[m.roomId];
  return Response.json({ object: "list", data: [{ id: room.model, object: "model", owned_by: room.hostName }] });
}
