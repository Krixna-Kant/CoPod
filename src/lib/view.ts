import { authorizationsOf, db, membersOf } from "./store";
import { memberLedger, roomUtilization } from "./ledger";
import { paypalMock } from "./paypal";
import { provider } from "./upstream";
import { agentModel } from "./agent/run";

export function roomView(roomId: string) {
  const s = db();
  const room = s.rooms[roomId];
  if (!room) return null;
  const now = Date.now();
  const members = membersOf(roomId)
    .filter((m) => m.status !== "pending_authorization")
    .map((m) => {
      const l = memberLedger(m, now);
      return {
        id: m.id,
        name: m.name,
        simulated: m.simulated,
        status: m.status,
        policy: m.policy ?? null,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt ?? null,
        usage: m.usage,
        pendingTopUp: m.pendingTopUp ?? null,
        settlement: m.settlement ?? null,
        ...l,
        authorizations: authorizationsOf(m.id).map((a) => ({
          id: a.id,
          amount: a.amount,
          capturedAmount: a.capturedAmount,
          status: a.status,
          kind: a.kind,
          createdAt: a.createdAt,
          mock: a.mock,
        })),
      };
    });
  const p = provider();
  return {
    now,
    room,
    utilization: roomUtilization(room, now),
    sim: s.sim[roomId],
    members,
    prices: s.prices[roomId] ?? [],
    decisions: s.decisions.filter((d) => d.roomId === roomId).slice(-40),
    payments: s.payments.filter((e) => e.roomId === roomId).slice(-150),
    notices: s.notices.filter((n) => n.roomId === roomId).slice(-40),
    recentUsage: s.usage
      .filter((u) => u.roomId === roomId && !s.members[u.memberId]?.simulated)
      .slice(-60)
      .map((u) => ({ ...u, memberName: s.members[u.memberId]?.name })),
    config: {
      paypalMode: paypalMock() ? "mock" : process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
      agent: process.env.GEMINI_API_KEY ? `gemini (${agentModel()})` : "rule engine (no GEMINI_API_KEY)",
      upstream: p ? `${p.name} (${p.model})` : "mock upstream",
    },
  };
}

export type RoomView = NonNullable<ReturnType<typeof roomView>>;
