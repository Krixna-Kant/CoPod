import { commit, db, id } from "./store";
import { costOf, isLive, memberLedger } from "./ledger";
import { estimateTokens, type ChatMessage } from "./upstream";
import type { Member, Room, UsageEvent } from "./types";

export const MIN_OUTPUT_TOKENS = 16;
const DEFAULT_MAX_TOKENS = 1024;
const INPUT_SAFETY = 1.15;

export type Preflight =
  | {
      ok: true;
      grantedMaxTokens: number;
      requestedMaxTokens: number;
      capped: boolean;
      reserve: number;
      estInputTokens: number;
      reason?: string;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * Pre-flight overdraft guardrail: the worst-case cost of a request (input + max output)
 * must fit inside the member's remaining PayPal authorization. max_tokens is lowered until it does.
 */
export function preflight(
  m: Member,
  room: Room,
  messages: ChatMessage[],
  requested: number | undefined,
  priority: "interactive" | "batch",
): Preflight {
  if (!isLive(m)) {
    const msg =
      m.status === "pending_authorization"
        ? "PayPal authorization not completed for this key"
        : m.status === "suspended"
          ? `Key suspended: ${m.policy?.reason ?? "hold exhausted"}. Approve a top-up to continue.`
          : `Membership is ${m.status}`;
    return { ok: false, status: m.status === "suspended" ? 402 : 403, code: `member_${m.status}`, message: msg };
  }
  if (priority === "batch" && m.status === "batch_paused") {
    return {
      ok: false,
      status: 429,
      code: "batch_paused",
      message: `Batch traffic paused by the CoPod agent: ${m.policy?.reason ?? "hold nearly exhausted"}`,
    };
  }

  const estIn = Math.ceil(estimateTokens(messages) * INPUT_SAFETY);
  const inputCost = costOf(room, estIn, 0);
  const available = memberLedger(m).available;
  const perOut = room.outputPricePerM / 1_000_000;
  const affordable = Math.floor((available - inputCost) / perOut);
  const want = requested && requested > 0 ? requested : DEFAULT_MAX_TOKENS;

  if (affordable < MIN_OUTPUT_TOKENS) {
    return {
      ok: false,
      status: 402,
      code: "insufficient_hold",
      message: `Remaining PayPal hold ($${available.toFixed(4)}) cannot cover this request. Approve a top-up to continue.`,
    };
  }

  let granted = Math.min(want, affordable);
  let reason: string | undefined;
  if (granted < want) reason = `max_tokens lowered ${want} -> ${granted} to stay within remaining hold $${available.toFixed(4)}`;
  const policyCap = m.policy?.maxTokensCap;
  if (policyCap && policyCap < granted) {
    granted = policyCap;
    reason = `max_tokens capped at ${policyCap} by agent policy: ${m.policy?.reason ?? ""}`;
  }

  return {
    ok: true,
    grantedMaxTokens: granted,
    requestedMaxTokens: want,
    capped: granted < want,
    reserve: inputCost + granted * perOut,
    estInputTokens: estIn,
    reason,
  };
}

export function reserve(m: Member, amount: number) {
  m.reserved += amount;
  commit();
}

export function record(
  m: Member,
  room: Room,
  e: {
    reserve: number;
    inputTokens: number;
    outputTokens: number;
    gpuMs: number;
    priority: "interactive" | "batch";
    outcome: UsageEvent["outcome"];
    requestedMaxTokens?: number;
    grantedMaxTokens?: number;
    note?: string;
    simulated?: boolean;
    backfill?: boolean;
  },
): UsageEvent {
  m.reserved = Math.max(0, m.reserved - e.reserve);
  const billable = e.outcome === "ok" || e.outcome === "capped";
  const cost = billable ? costOf(room, e.inputTokens, e.outputTokens) : 0;
  const ev: UsageEvent = {
    id: id("use"),
    memberId: m.id,
    roomId: room.id,
    at: Date.now(),
    model: room.model,
    inputTokens: billable ? e.inputTokens : 0,
    outputTokens: billable ? e.outputTokens : 0,
    gpuMs: Math.round(e.gpuMs),
    cost,
    inputPricePerM: room.inputPricePerM,
    outputPricePerM: room.outputPricePerM,
    priority: e.priority,
    outcome: e.outcome,
    requestedMaxTokens: e.requestedMaxTokens,
    grantedMaxTokens: e.grantedMaxTokens,
    note: e.note,
    simulated: !!e.simulated,
    backfill: e.backfill,
  };
  db().usage.push(ev);
  m.usage.requests += 1;
  if (billable) {
    m.usage.inputTokens += e.inputTokens;
    m.usage.outputTokens += e.outputTokens;
    m.usage.gpuMs += ev.gpuMs;
    m.usage.spend += cost;
  }
  if (e.outcome === "capped") m.usage.cappedRequests += 1;
  if (e.outcome === "upstream_error") m.usage.failedRequests += 1;
  if (e.outcome === "rejected") m.usage.rejectedRequests += 1;
  commit();
  return ev;
}
