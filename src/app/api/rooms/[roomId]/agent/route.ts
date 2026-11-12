import { ensureEngine, fail, json } from "@/lib/http";
import { requestAgentRun } from "@/lib/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  ensureEngine();
  try {
    const decision = await requestAgentRun((await params).roomId, "manual review requested by host");
    return json(decision);
  } catch (err) {
    return fail(err, 500);
  }
}
