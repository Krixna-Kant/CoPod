import { body, ensureEngine, fail, json } from "@/lib/http";
import { setLoadMode } from "@/lib/engine";
import { db } from "@/lib/store";
import { record } from "@/lib/metering";
import { isLive, memberLedger } from "@/lib/ledger";
import type { LoadMode } from "@/lib/types";

/** Host demo controls: switch synthetic cluster load, or inject a simulated workload for a member. */
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  ensureEngine();
  const { roomId } = await params;
  const room = db().rooms[roomId];
  if (!room) return fail("Room not found", 404);
  const b = await body<{ mode?: LoadMode; action?: string; memberId?: string; usd?: number }>(req);

  if (b.mode) {
    if (!["auto", "offpeak", "peak"].includes(b.mode)) return fail("Invalid mode");
    setLoadMode(roomId, b.mode);
    return json({ ok: true, mode: b.mode });
  }

  if (b.action === "inject" && b.memberId) {
    const m = db().members[b.memberId];
    if (!m || m.roomId !== roomId || !isLive(m)) return fail("Member not active");
    const usd = Math.max(0, Math.min(Number(b.usd) || 1, memberLedger(m).available - 0.01));
    const outTok = Math.floor((usd * 0.8 * 1_000_000) / room.outputPricePerM);
    const inTok = Math.floor((usd * 0.2 * 1_000_000) / room.inputPricePerM);
    record(m, room, {
      reserve: 0,
      inputTokens: inTok,
      outputTokens: outTok,
      gpuMs: outTok * 11,
      priority: "batch",
      outcome: "ok",
      note: "simulated batch workload (demo control)",
      simulated: true,
      backfill: true,
    });
    return json({ ok: true, injectedUsd: usd });
  }

  return fail("Nothing to do");
}
