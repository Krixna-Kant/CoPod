import { commit, db, membersOf } from "./store";
import { costOf, isLive, memberLedger, roomUtilization } from "./ledger";
import { record } from "./metering";
import { seedIfEmpty, settleMember, simulateTopUpApproval } from "./rooms";
import { runAgent } from "./agent/run";
import type { AgentDecision, LoadMode, Settlement } from "./types";

interface EngineRuntime {
  started: boolean;
  running: Record<string, Promise<AgentDecision> | undefined>;
  pendingTriggers: Record<string, string[]>;
  leaving: Set<string>;
  lastEventRun: Record<string, number>;
  lastPeriodicRun: Record<string, number>;
  band: Record<string, { band: string; count: number; fired: string }>;
  memberFlags: Record<string, Set<string>>;
  lastPricePoint: Record<string, number>;
}

const g = globalThis as unknown as { __copodEngine?: EngineRuntime };

function rt(): EngineRuntime {
  if (!g.__copodEngine) {
    g.__copodEngine = {
      started: false,
      running: {},
      pendingTriggers: {},
      leaving: new Set(),
      lastEventRun: {},
      lastPeriodicRun: {},
      band: {},
      memberFlags: {},
      lastPricePoint: {},
    };
  }
  return g.__copodEngine;
}

const AGENT_INTERVAL = () => Number(process.env.AGENT_INTERVAL_MS || 45_000);
const EVENT_DEBOUNCE = 10_000;

export function startEngine() {
  const r = rt();
  if (r.started) return;
  r.started = true;
  seedIfEmpty();
  setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error("[engine] tick failed", err);
    }
  }, 2000);
  console.log("[engine] CoPod engine started");
}

export function ensureEngine() {
  if (!rt().started) startEngine();
}

/** Serializes agent runs per room; concurrent requests share the in-flight run. */
export async function requestAgentRun(roomId: string, trigger: string): Promise<AgentDecision> {
  const r = rt();
  const inflight = r.running[roomId];
  if (inflight) {
    (r.pendingTriggers[roomId] ??= []).push(trigger);
    await inflight.catch(() => {});
    return requestAgentRun(roomId, (r.pendingTriggers[roomId] ?? []).splice(0).join(", ") || trigger);
  }
  const leaving = [...r.leaving].filter((mid) => db().members[mid]?.roomId === roomId);
  const p = runAgent(roomId, trigger, leaving);
  r.running[roomId] = p;
  try {
    return await p;
  } finally {
    r.running[roomId] = undefined;
    r.lastEventRun[roomId] = Date.now();
  }
}

export async function leaveRoom(memberId: string, reason = "member clicked Leave Room"): Promise<{ settlement: Settlement; decision?: AgentDecision }> {
  const m = db().members[memberId];
  if (!m) throw new Error("Member not found");
  if (m.status === "settled" && m.settlement) return { settlement: m.settlement };
  if (m.status === "pending_authorization") {
    m.status = "settled";
    commit();
    return {
      settlement: {
        meteredSpend: 0,
        credits: 0,
        captureAmount: 0,
        releasedAmount: 0,
        captures: [],
        voids: [],
        settledAt: Date.now(),
        settledBy: "fallback",
      },
    };
  }
  const r = rt();
  r.leaving.add(memberId);
  let decision: AgentDecision | undefined;
  try {
    decision = await requestAgentRun(m.roomId, `leave_requested: ${m.name} (${memberId}) - ${reason}`);
  } catch (err) {
    console.error("[engine] agent run on leave failed", err);
  } finally {
    r.leaving.delete(memberId);
  }
  const after = db().members[memberId];
  if (after.status !== "settled") {
    const amt = Math.round(after.usage.spend * 100) / 100;
    await settleMember(memberId, {
      captureAmount: amt,
      by: "fallback",
      receipt: `Settled at metered spend $${amt.toFixed(2)} (agent did not settle in time).`,
    });
  }
  return { settlement: db().members[memberId].settlement!, decision };
}

export function setLoadMode(roomId: string, mode: LoadMode) {
  const s = db().sim[roomId] ?? (db().sim[roomId] = { mode, syntheticTokensPerSec: 0 });
  s.mode = mode;
  commit();
}

function intensity(mode: LoadMode, now: number) {
  if (mode === "offpeak") return 0.12 + Math.random() * 0.05;
  if (mode === "peak") return 0.9 + Math.random() * 0.08;
  return 0.5 + 0.3 * Math.sin(now / 90_000) + (Math.random() - 0.5) * 0.08;
}

function simulateTenants(roomId: string, now: number) {
  const room = db().rooms[roomId];
  const sim = db().sim[roomId];
  const tenants = membersOf(roomId).filter((m) => m.simulated && (isLive(m) || m.status === "suspended"));
  if (!tenants.length) return;
  const target = intensity(sim.mode, now) * room.capacityTokensPerSec;
  sim.syntheticTokensPerSec = target;
  const weights = tenants.map((_, i) => (i === 0 ? 0.6 : 0.4 / Math.max(1, tenants.length - 1)));

  tenants.forEach((m, i) => {
    if (m.pendingTopUp && now - m.pendingTopUp.requestedAt > 8000) simulateTopUpApproval(m);
    if (!isLive(m)) return;
    let scale = 1;
    if (m.status === "batch_paused") scale = 0.35;
    if (m.status === "throttled") scale = 0.6;
    let out = Math.round(target * weights[i] * 2 * scale * 0.82);
    let inp = Math.round(out * 1.2);
    const available = memberLedger(m, now).available;
    const cost = costOf(room, inp, out);
    if (cost > available) {
      const f = Math.max(0, available / cost) * 0.98;
      out = Math.floor(out * f);
      inp = Math.floor(inp * f);
    }
    if (out < 1) return;
    record(m, room, {
      reserve: 0,
      inputTokens: inp,
      outputTokens: out,
      gpuMs: out * 11,
      priority: Math.random() < 0.6 ? "batch" : "interactive",
      outcome: "ok",
      simulated: true,
    });
  });
}

function tick() {
  const r = rt();
  const now = Date.now();
  for (const room of Object.values(db().rooms)) {
    simulateTenants(room.id, now);
    const util = roomUtilization(room, now);

    if (now - (r.lastPricePoint[room.id] ?? 0) >= 5000) {
      r.lastPricePoint[room.id] = now;
      (db().prices[room.id] ??= []).push({
        at: now,
        utilization: util,
        inputPricePerM: room.inputPricePerM,
        outputPricePerM: room.outputPricePerM,
      });
      commit();
    }

    const triggers: string[] = [];
    const band = util < 0.3 ? "idle" : util > 0.85 ? "congested" : "healthy";
    const b = (r.band[room.id] ??= { band, count: 0, fired: "healthy" });
    b.count = b.band === band ? b.count + 1 : 1;
    b.band = band;
    if (b.count >= 3 && b.fired !== band) {
      b.fired = band;
      triggers.push(`utilization ${band} (${Math.round(util * 100)}%)`);
    }

    for (const m of membersOf(room.id)) {
      if (!isLive(m) && m.status !== "suspended") continue;
      const flags = (r.memberFlags[m.id] ??= new Set());
      const l = memberLedger(m, now);
      const used = l.hold > 0 ? l.spend / l.hold : 0;
      const check = (flag: string, cond: boolean, label: string) => {
        if (cond && !flags.has(flag)) {
          flags.add(flag);
          triggers.push(label);
        } else if (!cond) flags.delete(flag);
      };
      check("threshold", used >= room.topUpThreshold, `${m.name} reached ${Math.round(used * 100)}% of hold`);
      check("runway", l.runwayMin !== null && l.runwayMin < 10 && l.available > 0, `${m.name} runway ${l.runwayMin?.toFixed(1)} min`);
      check("exhausted", l.available < 0.05 && l.hold > 0, `${m.name} hold exhausted`);
      if (!m.simulated && now - m.epochStartedAt > room.epochHours * 3600_000 && !r.leaving.has(m.id)) {
        void leaveRoom(m.id, `${room.epochHours}h epoch ended`).catch((e) => console.error(e));
      }
    }

    const live = membersOf(room.id).some((m) => isLive(m));
    if (r.running[room.id]) continue;
    if (triggers.length && now - (r.lastEventRun[room.id] ?? 0) > EVENT_DEBOUNCE) {
      r.lastPeriodicRun[room.id] = now;
      void requestAgentRun(room.id, triggers.join("; ")).catch((e) => console.error("[engine] agent", e));
    } else if (live && now - (r.lastPeriodicRun[room.id] ?? 0) > AGENT_INTERVAL()) {
      r.lastPeriodicRun[room.id] = now;
      void requestAgentRun(room.id, "periodic review").catch((e) => console.error("[engine] agent", e));
    }
  }
}
