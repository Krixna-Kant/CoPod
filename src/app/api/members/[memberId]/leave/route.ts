import { ensureEngine, fail, json } from "@/lib/http";
import { leaveRoom } from "@/lib/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  ensureEngine();
  try {
    return json(await leaveRoom((await params).memberId));
  } catch (err) {
    return fail(err, 500);
  }
}
