import { apiKey, authorizationsOf, commit, db, id, logPayment, membersOf, notify } from "./store";
import { isLive, memberLedger, round2 } from "./ledger";
import * as paypal from "./paypal";
import type { Member, Room, Settlement } from "./types";

const HONOR_MS = 3 * 24 * 3600_000;

type RoomSeed = Pick<
  Room,
  "id" | "name" | "model" | "upstreamModel" | "category" | "tagline" | "hardware" | "hostName" | "monthlyCost" | "maxSeats" | "depositAmount" | "baseInputPricePerM" | "baseOutputPricePerM" | "capacityTokensPerSec"
> & { tenants: string[] };

const SEEDS: RoomSeed[] = [
  {
    id: "room_gptoss120b",
    name: "GPT-OSS-120B Dedicated Pool",
    model: "gpt-oss-120b",
    upstreamModel: "openai/gpt-oss-120b",
    category: "High Throughput",
    tagline: "Dedicated tensor-parallel 120B MoE endpoint",
    hardware: "8x H100 80GB (provisioned)",
    hostName: "Northwind Labs",
    monthlyCost: 1200,
    maxSeats: 24,
    depositAmount: 50,
    baseInputPricePerM: 10,
    baseOutputPricePerM: 30,
    capacityTokensPerSec: 1500,
    tenants: ["Aster AI (simulated)", "Pixel Forge (simulated)"],
  },
  {
    id: "room_qwen27b",
    name: "Qwen3.8-27B Reasoning Pool",
    model: "qwen3.8-27b",
    upstreamModel: "qwen/qwen3.8-27b",
    category: "Reasoning",
    tagline: "Long-context reasoning for agent workloads",
    hardware: "4x H100 80GB (provisioned)",
    hostName: "Lattice Compute",
    monthlyCost: 700,
    maxSeats: 16,
    depositAmount: 25,
    baseInputPricePerM: 6,
    baseOutputPricePerM: 18,
    capacityTokensPerSec: 900,
    tenants: [],
  },
  {
    id: "room_gptoss20b",
    name: "GPT-OSS-20B Batch Pool",
    model: "gpt-oss-20b",
    upstreamModel: "openai/gpt-oss-20b",
    category: "Batch",
    tagline: "Cheap overnight batch classification and extraction",
    hardware: "2x L40S 48GB (provisioned)",
    hostName: "Fernhill AI",
    monthlyCost: 300,
    maxSeats: 12,
    depositAmount: 15,
    baseInputPricePerM: 2,
    baseOutputPricePerM: 5,
    capacityTokensPerSec: 2500,
    tenants: [],
  },
];

export function seedIfEmpty() {
  const s = db();
  let changed = false;
  for (const seed of SEEDS) {
    const existing = s.rooms[seed.id];
    if (existing) {
      if (!existing.category) Object.assign(existing, { category: seed.category, tagline: seed.tagline, upstreamModel: seed.upstreamModel });
      continue;
    }
    seedRoom(seed);
    changed = true;
  }
  if (changed) commit();
}

function seedRoom({ tenants, ...seed }: RoomSeed) {
  const s = db();
  const room: Room = {
    ...seed,
    hostPayeeEmail: process.env.PAYPAL_HOST_PAYEE_EMAIL || undefined,
    currency: "USD",
    inputPricePerM: seed.baseInputPricePerM,
    outputPricePerM: seed.baseOutputPricePerM,
    priceFloorMultiplier: 0.6,
    priceCeilingMultiplier: 1.4,
    topUpThreshold: 0.85,
    epochHours: 48,
    createdAt: Date.now(),
  };
  s.rooms[room.id] = room;
  s.prices[room.id] = [];
  s.sim[room.id] = { mode: "auto", syntheticTokensPerSec: 0 };
  for (const name of tenants) {
    const m = newMember(room, name, undefined, true);
    m.status = "active";
    addAuthorization(m, {
      authorizationId: `SIM-AUTH-${m.id.slice(4).toUpperCase()}`,
      orderId: `SIM-ORDER-${m.id.slice(4).toUpperCase()}`,
      amount: room.depositAmount,
      kind: "deposit",
      simulated: true,
      mock: true,
    });
  }
  commit();
}

function newMember(room: Room, name: string, email: string | undefined, simulated: boolean): Member {
  const m: Member = {
    id: id("mem"),
    roomId: room.id,
    name,
    email,
    apiKey: apiKey(),
    status: "pending_authorization",
    simulated,
    joinedAt: Date.now(),
    epochStartedAt: Date.now(),
    usage: {
      requests: 0,
      failedRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      gpuMs: 0,
      spend: 0,
      cappedRequests: 0,
      rejectedRequests: 0,
    },
    reserved: 0,
  };
  db().members[m.id] = m;
  return m;
}

function addAuthorization(
  m: Member,
  a: { authorizationId: string; orderId: string; amount: number; kind: "deposit" | "topup"; simulated: boolean; mock: boolean },
) {
  const now = Date.now();
  db().authorizations[a.authorizationId] = {
    id: a.authorizationId,
    memberId: m.id,
    orderId: a.orderId,
    amount: a.amount,
    capturedAmount: 0,
    status: "CREATED",
    kind: a.kind,
    createdAt: now,
    expiresHonorAt: now + HONOR_MS,
    simulated: a.simulated,
    mock: a.mock,
  };
}

export function joinRoom(roomId: string, name: string, email?: string) {
  const room = db().rooms[roomId];
  if (!room) throw new Error("Room not found");
  const seats = membersOf(roomId).filter((m) => isLive(m) || m.status === "pending_authorization").length;
  if (seats >= room.maxSeats) throw new Error("Room is full");
  const m = newMember(room, name.trim().slice(0, 40) || "Developer", email, false);
  commit();
  return m;
}

export async function createOrderFor(memberId: string, kind: "deposit" | "topup") {
  const m = db().members[memberId];
  if (!m) throw new Error("Member not found");
  const room = db().rooms[m.roomId];
  const amount = kind === "deposit" ? room.depositAmount : m.pendingTopUp?.amount;
  if (!amount) throw new Error("No top-up requested for this member");
  const order = await paypal.createAuthorizeOrder({
    amount,
    currency: room.currency,
    memberId,
    description: `CoPod ${kind === "deposit" ? "security deposit" : "top-up"} - ${room.name}`,
    payeeEmail: room.hostPayeeEmail,
  });
  logPayment({
    roomId: room.id,
    memberId,
    type: "ORDER_CREATED",
    amount,
    paypalId: order.id,
    detail: `Orders API intent=AUTHORIZE (${kind})`,
    mock: paypal.paypalMock(),
  });
  commit();
  return { orderId: order.id, amount, mock: paypal.paypalMock() };
}

export async function completeAuthorization(memberId: string, orderId: string, kind: "deposit" | "topup") {
  const m = db().members[memberId];
  if (!m) throw new Error("Member not found");
  const room = db().rooms[m.roomId];
  const expected = kind === "deposit" ? room.depositAmount : m.pendingTopUp?.amount ?? 0;
  const r = await paypal.authorizeOrder(orderId, expected);
  if (r.status !== "CREATED" && r.status !== "PENDING") {
    throw new Error(`Authorization status ${r.status}`);
  }
  addAuthorization(m, {
    authorizationId: r.authorizationId,
    orderId,
    amount: r.amount,
    kind,
    simulated: false,
    mock: paypal.paypalMock(),
  });
  if (r.payerEmail && !m.email) m.email = r.payerEmail;
  if (kind === "deposit") {
    m.status = "active";
    m.epochStartedAt = Date.now();
  } else {
    m.pendingTopUp = undefined;
    if (m.status !== "suspended" || memberLedger(m).available > 0) m.status = "active";
    m.policy = undefined;
  }
  logPayment({
    roomId: room.id,
    memberId,
    type: "AUTHORIZED",
    amount: r.amount,
    paypalId: r.authorizationId,
    detail: `${kind === "deposit" ? "Deposit" : "Top-up"} hold placed on payer account`,
    mock: paypal.paypalMock(),
  });
  notify({
    roomId: room.id,
    memberId,
    level: "info",
    message: `${m.name} ${kind === "deposit" ? "joined with" : "topped up"} a $${r.amount.toFixed(2)} PayPal hold`,
  });
  commit();
  return { member: m, authorizationId: r.authorizationId };
}

export function simulateTopUpApproval(m: Member) {
  if (!m.pendingTopUp) return;
  addAuthorization(m, {
    authorizationId: `SIM-AUTH-${id("t").slice(2).toUpperCase()}`,
    orderId: `SIM-ORDER-${id("t").slice(2).toUpperCase()}`,
    amount: m.pendingTopUp.amount,
    kind: "topup",
    simulated: true,
    mock: true,
  });
  logPayment({
    roomId: m.roomId,
    memberId: m.id,
    type: "AUTHORIZED",
    amount: m.pendingTopUp.amount,
    detail: `Simulated member approved top-up`,
    mock: true,
  });
  m.pendingTopUp = undefined;
  m.status = "active";
  m.policy = undefined;
  commit();
}

/**
 * Captures exactly `captureAmount` across the member's open authorizations (oldest first)
 * with final_capture=true, and voids any authorization that receives nothing.
 */
export async function settleMember(
  memberId: string,
  opts: { captureAmount: number; receipt?: string; creditReason?: string; by: "agent" | "fallback" },
): Promise<Settlement> {
  const m = db().members[memberId];
  if (!m) throw new Error("Member not found");
  if (m.status === "settled") throw new Error("Member already settled");
  const room = db().rooms[m.roomId];
  const metered = round2(m.usage.spend);
  const captureAmount = round2(Math.min(Math.max(0, opts.captureAmount), metered));
  m.status = "settling";
  commit();

  const settlement: Settlement = {
    meteredSpend: metered,
    credits: round2(metered - captureAmount),
    captureAmount,
    releasedAmount: 0,
    captures: [],
    voids: [],
    receipt: opts.receipt,
    settledAt: Date.now(),
    settledBy: opts.by,
  };

  let remaining = captureAmount;
  for (const a of authorizationsOf(m.id).filter((x) => x.status === "CREATED")) {
    const amt = round2(Math.min(remaining, a.amount));
    try {
      if (amt >= 0.01) {
        const cap = await paypal.captureAuthorization({
          authorizationId: a.id,
          amount: amt,
          currency: room.currency,
          finalCapture: true,
          invoiceId: `${m.id}-${a.id}`.slice(0, 127),
          note: `CoPod usage in ${room.name}: ${m.usage.inputTokens} in / ${m.usage.outputTokens} out tokens`,
          mock: a.mock,
        });
        a.capturedAmount = amt;
        a.status = amt < a.amount ? "PARTIALLY_CAPTURED" : "CAPTURED";
        remaining = round2(remaining - amt);
        settlement.captures.push({ authorizationId: a.id, captureId: cap.id, amount: amt, status: cap.status });
        settlement.releasedAmount = round2(settlement.releasedAmount + a.amount - amt);
        logPayment({
          roomId: room.id,
          memberId,
          type: "CAPTURED",
          amount: amt,
          paypalId: cap.id,
          detail: `Captured $${amt.toFixed(2)} of $${a.amount.toFixed(2)} (final_capture=true, $${(a.amount - amt).toFixed(2)} released)`,
          mock: a.mock,
        });
      } else {
        await paypal.voidAuthorization(a.id, a.mock);
        a.status = "VOIDED";
        settlement.voids.push({ authorizationId: a.id, amount: a.amount });
        settlement.releasedAmount = round2(settlement.releasedAmount + a.amount);
        logPayment({
          roomId: room.id,
          memberId,
          type: "VOIDED",
          amount: a.amount,
          paypalId: a.id,
          detail: `Voided unused $${a.amount.toFixed(2)} hold`,
          mock: a.mock,
        });
      }
    } catch (err) {
      logPayment({
        roomId: room.id,
        memberId,
        type: "ERROR",
        paypalId: a.id,
        detail: (err as Error).message,
        mock: a.mock,
      });
      m.status = "active";
      commit();
      throw err;
    }
  }

  m.status = "settled";
  m.leftAt = Date.now();
  m.reserved = 0;
  m.pendingTopUp = undefined;
  m.settlement = settlement;
  notify({
    roomId: room.id,
    memberId,
    level: "info",
    message: `${m.name} settled: captured $${captureAmount.toFixed(2)}, released $${settlement.releasedAmount.toFixed(2)}${
      settlement.credits > 0 ? ` (credit $${settlement.credits.toFixed(2)}: ${opts.creditReason ?? "goodwill"})` : ""
    }`,
  });
  commit();
  return settlement;
}
