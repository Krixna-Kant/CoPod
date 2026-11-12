import { ensureEngine, fail, json } from "@/lib/http";
import { roomView } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  ensureEngine();
  const v = roomView((await params).roomId);
  return v ? json(v) : fail("Room not found", 404);
}
