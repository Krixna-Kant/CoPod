import { authorizationsOf, db, membersOf } from "../store";
import { memberLedger, roomUtilization } from "../ledger";

const r = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function roomSnapshot(roomId: string, leaving: string[] = []) {
  const room = db().rooms[roomId];
  const now = Date.now();
  const prices = (db().prices[roomId] ?? []).slice(-20);
  const members = membersOf(roomId)
    .filter((m) => m.status !== "settled" && m.status !== "pending_authorization")
    .map((m) => {
      const l = memberLedger(m, now);
      return {
        member_id: m.id,
        name: m.name,
        simulated: m.simulated,
        status: m.status,
        leave_requested: leaving.includes(m.id),
        policy: m.policy ? { max_tokens_cap: m.policy.maxTokensCap, reason: m.policy.reason, set_by: m.policy.setBy } : null,
        hold_usd: l.hold,
        metered_spend_usd: r(l.spend),
        available_usd: r(l.available),
        hold_used_pct: r(l.holdUsedPct, 1),
        burn_usd_per_min: r(l.burnPerMin),
        runway_min: l.runwayMin === null ? null : r(l.runwayMin, 1),
        requests_last_5m: l.requests5m,
        batch_share_last_5m: r(l.batchShare5m, 2),
        tokens_per_sec: r(l.tokensPerSec, 1),
        lifetime: {
          requests: m.usage.requests,
          input_tokens: m.usage.inputTokens,
          output_tokens: m.usage.outputTokens,
          gpu_ms: m.usage.gpuMs,
          capped_requests: m.usage.cappedRequests,
          rejected_requests: m.usage.rejectedRequests,
          failed_upstream_requests: m.usage.failedRequests,
        },
        pending_top_up: m.pendingTopUp ?? null,
        epoch_age_hours: r((now - m.epochStartedAt) / 3600_000, 2),
        authorizations: authorizationsOf(m.id)
          .filter((a) => a.status === "CREATED")
          .map((a) => ({
            authorization_id: a.id,
            amount: a.amount,
            kind: a.kind,
            honor_period_hours_left: r((a.expiresHonorAt - now) / 3600_000, 1),
          })),
      };
    });

  return {
    now: new Date(now).toISOString(),
    room: {
      room_id: room.id,
      name: room.name,
      model: room.model,
      hardware: room.hardware,
      monthly_cost_usd: room.monthlyCost,
      seats: `${members.length}/${room.maxSeats}`,
      deposit_usd: room.depositAmount,
      top_up_threshold_pct: room.topUpThreshold * 100,
      epoch_hours: room.epochHours,
      capacity_tokens_per_sec: room.capacityTokensPerSec,
      base_price_per_m: { input: room.baseInputPricePerM, output: room.baseOutputPricePerM },
      current_price_per_m: { input: room.inputPricePerM, output: room.outputPricePerM },
      allowed_price_range_per_m: {
        input: [r(room.baseInputPricePerM * room.priceFloorMultiplier, 2), r(room.baseInputPricePerM * room.priceCeilingMultiplier, 2)],
        output: [r(room.baseOutputPricePerM * room.priceFloorMultiplier, 2), r(room.baseOutputPricePerM * room.priceCeilingMultiplier, 2)],
      },
      utilization_now_pct: r(roomUtilization(room, now) * 100, 1),
      utilization_history_pct: prices.map((p) => r(p.utilization * 100, 0)),
    },
    members,
    recent_agent_decisions: db()
      .decisions.filter((d) => d.roomId === roomId)
      .slice(-4)
      .map((d) => ({
        minutes_ago: r((now - d.at) / 60_000, 1),
        summary: d.summary,
        actions: d.actions.map((a) => `${a.tool}(${JSON.stringify(a.args)}) -> ${a.ok ? "ok" : "rejected"}`),
      })),
  };
}
