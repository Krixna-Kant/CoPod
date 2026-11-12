import { body, ensureEngine, fail, json } from "@/lib/http";
import { completeAuthorization } from "@/lib/rooms";

export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  ensureEngine();
  const { memberId, kind } = await body<{ memberId?: string; kind?: "deposit" | "topup" }>(req);
  if (!memberId) return fail("memberId required");
  try {
    const { member, authorizationId } = await completeAuthorization(
      memberId,
      (await params).orderId,
      kind === "topup" ? "topup" : "deposit",
    );
    return json({ memberId: member.id, apiKey: member.apiKey, authorizationId, status: member.status });
  } catch (err) {
    return fail(err, 500);
  }
}
