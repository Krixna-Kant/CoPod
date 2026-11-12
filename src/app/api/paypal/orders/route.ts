import { body, ensureEngine, fail, json } from "@/lib/http";
import { createOrderFor } from "@/lib/rooms";

export async function POST(req: Request) {
  ensureEngine();
  const { memberId, kind } = await body<{ memberId?: string; kind?: "deposit" | "topup" }>(req);
  if (!memberId) return fail("memberId required");
  try {
    return json(await createOrderFor(memberId, kind === "topup" ? "topup" : "deposit"));
  } catch (err) {
    return fail(err, 500);
  }
}
