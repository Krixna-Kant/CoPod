import { body, ensureEngine, fail, json } from "@/lib/http";
import { createPool, type NewPoolInput } from "@/lib/rooms";

export async function POST(req: Request) {
  ensureEngine();
  try {
    const room = createPool(await body<NewPoolInput>(req));
    return json({ roomId: room.id });
  } catch (err) {
    return fail(err);
  }
}
