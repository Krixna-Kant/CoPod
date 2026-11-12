import { Type, type FunctionDeclaration } from "@google/genai";
import { commit, db, membersOf, notify } from "../store";
import { isLive, memberLedger, round2 } from "../ledger";
import { settleMember } from "../rooms";
import * as paypal from "../paypal";
import { roomSnapshot } from "./snapshot";
import type { MemberStatus } from "../types";

export const declarations: FunctionDeclaration[] = [
  {
    name: "get_room_snapshot",
    description: "Re-read the live room state (prices, utilization, every member's PayPal hold, spend, burn rate and runway).",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_member_activity",
    description: "Recent metered requests for one member: tokens, cost, priority (interactive/batch), outcome (ok/capped/rejected/upstream_error).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        member_id: { type: Type.STRING },
        limit: { type: Type.INTEGER, description: "Max events, default 25" },
      },
      required: ["member_id"],
    },
  },
  {
    name: "set_room_price",
    description:
      "Set the room's per-million-token prices. Must stay inside allowed_price_range_per_m and change at most 30% per call. Applies to all subsequent requests.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        input_price_per_m: { type: Type.NUMBER },
        output_price_per_m: { type: Type.NUMBER },
        reason: { type: Type.STRING, description: "Shown to members in the price-change notice" },
      },
      required: ["input_price_per_m", "output_price_per_m", "reason"],
    },
  },
  {
    name: "set_member_policy",
    description:
      "Change a member's traffic policy. active = normal; throttled = cap max_tokens per request; batch_paused = reject requests marked as batch, interactive still allowed; suspended = reject all traffic (only when available hold is below $0.05).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        member_id: { type: Type.STRING },
        status: { type: Type.STRING, enum: ["active", "throttled", "batch_paused", "suspended"] },
        max_tokens_cap: { type: Type.INTEGER, description: "Per-request output token cap (64-4096). Required for throttled." },
        reason: { type: Type.STRING },
      },
      required: ["member_id", "status", "reason"],
    },
  },
  {
    name: "request_top_up",
    description:
      "Ask a member to approve an additional PayPal authorization (a new AUTHORIZE order they approve in PayPal). Use when their hold is nearly used or runway is short.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        member_id: { type: Type.STRING },
        amount_usd: { type: Type.NUMBER, description: "10 to 200" },
        reason: { type: Type.STRING, description: "Message shown to the member" },
      },
      required: ["member_id", "amount_usd", "reason"],
    },
  },
  {
    name: "verify_paypal_authorization",
    description: "Fetch the live status of a PayPal authorization from the PayPal Payments API before acting on it.",
    parameters: {
      type: Type.OBJECT,
      properties: { authorization_id: { type: Type.STRING } },
      required: ["authorization_id"],
    },
  },
  {
    name: "settle_member",
    description:
      "Final settlement via PayPal: captures capture_amount_usd across the member's authorizations with final_capture=true and voids/releases the rest. capture_amount_usd must be <= metered spend and >= 80% of it. Any credit below metered spend requires credit_reason. Irreversible.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        member_id: { type: Type.STRING },
        capture_amount_usd: { type: Type.NUMBER },
        receipt: {
          type: Type.STRING,
          description: "Plain-English receipt for the member: usage, prices paid, amount captured, amount released, any credits.",
        },
        credit_reason: { type: Type.STRING },
      },
      required: ["member_id", "capture_amount_usd", "receipt"],
    },
  },
  {
    name: "broadcast_notice",
    description: "Send a notice to every member of the room (in-app feed and the room webhook, e.g. off-peak discount alerts).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING },
        level: { type: Type.STRING, enum: ["info", "warning", "critical"] },
      },
      required: ["message", "level"],
    },
  },
];

type Args = Record<string, unknown>;
type Result = { ok: boolean; [k: string]: unknown };

async function postWebhook(payload: unknown) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (err) {
    console.error("[agent] webhook failed", err);
  }
}

export async function execute(roomId: string, name: string, args: Args): Promise<Result> {
  const room = db().rooms[roomId];
  const member = (mid: unknown) => {
    const m = db().members[String(mid)];
    if (!m || m.roomId !== roomId) throw new Error(`Unknown member_id ${String(mid)}`);
    return m;
  };

  try {
    switch (name) {
      case "get_room_snapshot":
        return { ok: true, snapshot: roomSnapshot(roomId) };

      case "get_member_activity": {
        const m = member(args.member_id);
        const limit = Math.min(Number(args.limit) || 25, 60);
        const events = db()
          .usage.filter((u) => u.memberId === m.id)
          .slice(-limit)
          .map((u) => ({
            seconds_ago: Math.round((Date.now() - u.at) / 1000),
            in: u.inputTokens,
            out: u.outputTokens,
            cost_usd: Math.round(u.cost * 10000) / 10000,
            priority: u.priority,
            outcome: u.outcome,
            note: u.note,
          }));
        return { ok: true, member_id: m.id, events };
      }

      case "set_room_price": {
        const inP = Number(args.input_price_per_m);
        const outP = Number(args.output_price_per_m);
        const lo = room.priceFloorMultiplier;
        const hi = room.priceCeilingMultiplier;
        const within = (v: number, base: number) => v >= base * lo - 1e-9 && v <= base * hi + 1e-9;
        if (!within(inP, room.baseInputPricePerM) || !within(outP, room.baseOutputPricePerM)) {
          return { ok: false, error: "Price outside allowed range", allowed_multiplier: [lo, hi] };
        }
        const step = (v: number, cur: number) => Math.abs(v - cur) / cur <= 0.3 + 1e-9;
        if (!step(inP, room.inputPricePerM) || !step(outP, room.outputPricePerM)) {
          return { ok: false, error: "Change exceeds 30% per step" };
        }
        const before = { input: room.inputPricePerM, output: room.outputPricePerM };
        room.inputPricePerM = round2(inP);
        room.outputPricePerM = round2(outP);
        const pct = Math.round(((room.outputPricePerM - before.output) / before.output) * 100);
        const msg = `Price ${pct <= 0 ? "" : "+"}${pct}%: $${room.inputPricePerM}/M in, $${room.outputPricePerM}/M out. ${String(args.reason ?? "")}`;
        notify({ roomId, level: pct < 0 ? "info" : "warning", message: msg });
        await postWebhook({ type: "price_change", room: room.name, before, after: { input: inP, output: outP }, reason: args.reason });
        commit();
        return { ok: true, before, after: { input: room.inputPricePerM, output: room.outputPricePerM } };
      }

      case "set_member_policy": {
        const m = member(args.member_id);
        if (!isLive(m) && m.status !== "suspended") return { ok: false, error: `Member is ${m.status}` };
        const status = String(args.status) as MemberStatus;
        const reason = String(args.reason ?? "");
        if (status === "suspended" && memberLedger(m).available >= 0.05) {
          return { ok: false, error: "Suspension only allowed when available hold < $0.05; use throttled or batch_paused" };
        }
        let cap: number | undefined;
        if (status === "throttled") {
          cap = Math.round(Number(args.max_tokens_cap));
          if (!cap || cap < 64 || cap > 4096) return { ok: false, error: "throttled requires max_tokens_cap in 64..4096" };
        }
        m.status = status;
        m.policy = status === "active" ? undefined : { maxTokensCap: cap, reason, setBy: "agent", updatedAt: Date.now() };
        if (status !== "active") {
          notify({ roomId, memberId: m.id, level: "warning", message: `${m.name}: ${status.replace("_", " ")} - ${reason}` });
        }
        commit();
        return { ok: true, member_id: m.id, status, max_tokens_cap: cap };
      }

      case "request_top_up": {
        const m = member(args.member_id);
        if (!isLive(m) && m.status !== "suspended") return { ok: false, error: `Member is ${m.status}` };
        const amount = round2(Number(args.amount_usd));
        if (!(amount >= 10 && amount <= 200)) return { ok: false, error: "amount_usd must be 10..200" };
        if (m.pendingTopUp) return { ok: false, error: "Top-up already pending", pending: m.pendingTopUp };
        m.pendingTopUp = { amount, reason: String(args.reason ?? ""), requestedAt: Date.now() };
        notify({
          roomId,
          memberId: m.id,
          level: "warning",
          message: `${m.name}: top-up of $${amount.toFixed(2)} requested - ${String(args.reason ?? "")}`,
        });
        await postWebhook({ type: "top_up_requested", room: room.name, member: m.name, amount, reason: args.reason });
        commit();
        return { ok: true, member_id: m.id, amount, approval: "member approves a new PayPal AUTHORIZE order from the dashboard" };
      }

      case "verify_paypal_authorization": {
        const a = db().authorizations[String(args.authorization_id)];
        if (!a || db().members[a.memberId]?.roomId !== roomId) return { ok: false, error: "Unknown authorization" };
        const live = await paypal.getAuthorization(a.id, a.mock);
        return {
          ok: true,
          authorization_id: a.id,
          paypal_status: (live as { status?: string }).status,
          expiration_time: (live as { expiration_time?: string }).expiration_time,
          simulated: a.mock,
        };
      }

      case "settle_member": {
        const m = member(args.member_id);
        if (m.status === "settled") return { ok: false, error: "Already settled" };
        const metered = round2(m.usage.spend);
        const amt = round2(Number(args.capture_amount_usd));
        if (!(amt >= 0) || amt > metered + 0.001) {
          return { ok: false, error: `capture_amount_usd must be between 0 and metered spend ${metered}` };
        }
        if (amt < round2(metered * 0.8) - 0.001) {
          return { ok: false, error: `Credits above 20% need host approval; minimum capture is ${round2(metered * 0.8)}` };
        }
        if (amt < metered - 0.001 && !args.credit_reason) return { ok: false, error: "credit_reason required" };
        const s = await settleMember(m.id, {
          captureAmount: amt,
          receipt: String(args.receipt ?? ""),
          creditReason: args.credit_reason ? String(args.credit_reason) : undefined,
          by: "agent",
        });
        return {
          ok: true,
          captured: s.captureAmount,
          released: s.releasedAmount,
          captures: s.captures,
          voids: s.voids,
        };
      }

      case "broadcast_notice": {
        const level = (["info", "warning", "critical"].includes(String(args.level)) ? args.level : "info") as
          | "info"
          | "warning"
          | "critical";
        notify({ roomId, level, message: String(args.message ?? "") });
        await postWebhook({ type: "notice", room: room.name, level, message: args.message, members: membersOf(roomId).length });
        commit();
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
