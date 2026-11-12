import { authorizationsOf, db, membersOf } from "./store";
import type { Member, Room } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function costOf(room: Pick<Room, "inputPricePerM" | "outputPricePerM">, inTok: number, outTok: number) {
  return (inTok * room.inputPricePerM + outTok * room.outputPricePerM) / 1_000_000;
}

export function activeHold(memberId: string): number {
  return authorizationsOf(memberId)
    .filter((a) => a.status === "CREATED")
    .reduce((s, a) => s + a.amount, 0);
}

export interface MemberLedger {
  hold: number;
  spend: number;
  reserved: number;
  available: number;
  holdUsedPct: number;
  burnPerMin: number;
  runwayMin: number | null;
  requests5m: number;
  batchShare5m: number;
  tokensPerSec: number;
  captured: number;
  released: number;
  honorExpiresAt: number | null;
}

export function memberLedger(m: Member, now = Date.now()): MemberLedger {
  const auths = authorizationsOf(m.id);
  const hold = auths
    .filter((a) => a.status === "CREATED" || (m.status === "settled" && a.status !== "DENIED"))
    .reduce((s, a) => s + a.amount, 0);
  const spend = m.usage.spend;
  const available = Math.max(0, hold - spend - m.reserved);

  const recent = db().usage.filter((u) => u.memberId === m.id && now - u.at <= 5 * 60_000);
  const lastMin = recent.filter((u) => now - u.at <= 60_000);
  const burnPerMin = lastMin.reduce((s, u) => s + u.cost, 0);
  const tokLast30 = recent
    .filter((u) => now - u.at <= 30_000)
    .reduce((s, u) => s + u.inputTokens + u.outputTokens, 0);
  const batch = recent.filter((u) => u.priority === "batch").length;

  const honor = auths
    .filter((a) => a.status === "CREATED")
    .reduce<number | null>((min, a) => (min === null || a.expiresHonorAt < min ? a.expiresHonorAt : min), null);

  return {
    hold: round2(hold),
    spend: round4(spend),
    reserved: round4(m.reserved),
    available: round4(available),
    holdUsedPct: hold > 0 ? Math.min(100, (spend / hold) * 100) : 0,
    burnPerMin: round4(burnPerMin),
    runwayMin: burnPerMin > 0 ? available / burnPerMin : null,
    requests5m: recent.length,
    batchShare5m: recent.length ? batch / recent.length : 0,
    tokensPerSec: tokLast30 / 30,
    captured: round2(auths.reduce((s, a) => s + a.capturedAmount, 0)),
    released: round2(m.settlement?.releasedAmount ?? 0),
    honorExpiresAt: honor,
  };
}

export function roomUtilization(room: Room, now = Date.now(), windowMs = 30_000): number {
  const ids = new Set(membersOf(room.id).map((m) => m.id));
  const tokens = db()
    .usage.filter((u) => ids.has(u.memberId) && !u.backfill && now - u.at <= windowMs)
    .reduce((s, u) => s + u.inputTokens * 0.15 + u.outputTokens, 0);
  const tps = tokens / (windowMs / 1000);
  return Math.min(1.2, tps / room.capacityTokensPerSec);
}

export function isLive(m: Member) {
  return m.status === "active" || m.status === "throttled" || m.status === "batch_paused";
}
