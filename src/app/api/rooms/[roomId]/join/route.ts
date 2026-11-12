import { body, ensureEngine, fail, json } from "@/lib/http";
import { joinRoom } from "@/lib/rooms";

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  ensureEngine();
  const { name, email } = await body<{ name?: string; email?: string }>(req);
  try {
    const m = joinRoom((await params).roomId, name ?? "", email);
    return json({ memberId: m.id });
  } catch (err) {
    return fail(err);
  }
}
